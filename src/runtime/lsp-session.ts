import { once } from 'node:events';
import * as fs from 'node:fs';
import { ChildProcessWithoutNullStreams } from 'child_process';
import * as path from 'path';
import { pathToFileURL } from 'url';
import {
  createLspClient,
  initializeLspClient,
  shutdownLspClient,
} from '../lsp-client.js';
import {
  closeFile,
  forceCloseFile,
  openFile,
} from '../lsp/file-lifecycle/ops.js';
import {
  createDiagnosticsStore,
  createDiagnosticProviderStore,
  createWindowLogStore,
  createWorkspaceLoaderStore,
} from '../state/index.js';
import {
  DiagnosticProviderStore,
  DiagnosticsStore,
  ErrorCode,
  LspClient,
  LspConfig,
  OneBasedPosition,
  Result,
  SessionDocuments,
  WindowLogStore,
  WorkspaceLoaderStore,
  WorkspaceState,
  createLspError,
  tryResultAsync,
} from '../types.js';
import {
  ParsedLspConfig,
  getLanguageIdForExtensions,
} from '../config/lsp-config.js';
import {
  CursorContext,
  generateCursorContext,
} from '../utils/cursor-context.js';
import { getDefaultPreloadFiles } from '../utils/log-level.js';
import logger, { upgradeToContextualLogger } from '../utils/logger.js';

export type SessionState =
  | 'not_started'
  | 'stopped'
  | 'starting'
  | 'ready'
  | 'error';

export interface LspSessionProfile {
  name: string;
  config: ParsedLspConfig;
  workspacePath: string;
  workspaceUri: string;
  workspaceName: string;
  configPath: string | null;
}

export interface LspSessionStatusSnapshot {
  sessionKey: string;
  profileName: string;
  state: SessionState;
  command: string;
  workspacePath: string;
  lastError: string | null;
  pid: number | null;
  extensions: string[];
  preloadFiles: string[];
  diagnosticsStrategy: 'push' | 'pull';
  workspaceLoader: string | null;
  workspaceReady: boolean | null;
  workspaceLoading: boolean | null;
  windowLogCount: number;
}

export type FileLifecycleStrategy =
  | 'transient'
  | 'persistent'
  | 'respect_existing';

export interface CursorContextOperationResult<T> {
  result: T;
  cursorContext?: CursorContext;
}

export interface SessionDocumentScope {
  uri: string;
  request<TResult, TParams = unknown>(
    method: string,
    params: TParams
  ): Promise<TResult>;
}

export interface SessionCursorContextScope extends SessionDocumentScope {
  cursorContext?: CursorContextOperationResult<unknown>['cursorContext'];
}

export interface LspSession {
  readonly sessionKey: string;
  getProfile(): LspSessionProfile;
  setProfile(profile: LspSessionProfile): void;
  canHandleFile(filePath: string): boolean;
  isReady(): boolean;
  isActive(): boolean;
  start(): Promise<void>;
  stop(): Promise<void>;
  restart(): Promise<void>;
  request<TResult, TParams = unknown>(
    method: string,
    params: TParams
  ): Promise<TResult>;
  getWorkspaceState(): WorkspaceState;
  getWorkspaceLoaderStore(): WorkspaceLoaderStore;
  getDiagnosticsStore(): DiagnosticsStore;
  getDiagnosticProviderStore(): DiagnosticProviderStore;
  getWindowLogStore(): WindowLogStore;
  executeWithCursorContext<T>(
    operationName: string,
    filePath: string,
    position: OneBasedPosition,
    strategy: FileLifecycleStrategy,
    operation: (scope: SessionCursorContextScope) => Promise<Result<T>>
  ): Promise<Result<CursorContextOperationResult<T>>>;
  executeWithDocumentLifecycle<T>(
    filePath: string,
    strategy: FileLifecycleStrategy,
    operation: (scope: SessionDocumentScope) => Promise<Result<T>>
  ): Promise<Result<T>>;
  claimDocument(filePath: string): string;
  releaseDocument(filePath: string): string | null;
  listOwnedDocuments(): string[];
  clearOwnedDocuments(): string[];
  getStatusSnapshot(): LspSessionStatusSnapshot;
}

export interface LspSessionOwnershipSink {
  onDocumentClaimed?: (
    sessionKey: string,
    filePath: string,
    uri: string
  ) => void;
  onDocumentReleased?: (
    sessionKey: string,
    filePath: string,
    uri: string
  ) => void;
  onSessionUnexpectedExit?: (
    sessionKey: string,
    reason: string
  ) => void;
}

function createWorkspaceConfig(profile: LspSessionProfile): LspConfig {
  return {
    workspaceUri: profile.workspaceUri,
    workspaceName: profile.workspaceName,
    preloadFiles: profile.config.preload_files || [],
  };
}

function createStores(): {
  documents: SessionDocuments;
  diagnosticsStore: DiagnosticsStore;
  diagnosticProviderStore: DiagnosticProviderStore;
  windowLogStore: WindowLogStore;
  workspaceLoaderStore: WorkspaceLoaderStore;
  workspaceState: WorkspaceState;
} {
  return {
    documents: new Map(),
    diagnosticsStore: createDiagnosticsStore(),
    diagnosticProviderStore: createDiagnosticProviderStore(),
    windowLogStore: createWindowLogStore(),
    workspaceLoaderStore: createWorkspaceLoaderStore(),
    workspaceState: {
      isLoading: false,
      isReady: false,
    },
  };
}

async function terminateClientProcess(
  client: LspClient | null,
  process: ChildProcessWithoutNullStreams | null,
  timeoutMs = 5_000
): Promise<void> {
  if (client) {
    await Promise.race([
      shutdownLspClient(client),
      new Promise<void>((resolve) => setTimeout(resolve, 500)),
    ]);
  }

  if (!process) {
    return;
  }

  const alreadyExited =
    process.exitCode !== null || process.signalCode !== null;
  if (alreadyExited) {
    return;
  }

  const exitPromise = once(process, 'exit').then(() => undefined);

  if (!process.killed) {
    process.kill('SIGTERM');
  }

  const exitedNaturally = await Promise.race([
    exitPromise.then(() => true),
    new Promise<boolean>((resolve) =>
      setTimeout(() => resolve(false), timeoutMs)
    ),
  ]);

  if (!exitedNaturally && !process.killed) {
    process.kill('SIGKILL');
    await Promise.race([
      exitPromise,
      new Promise<void>((resolve) => setTimeout(resolve, 1_000)),
    ]);
  }
}

export function normalizeWorkspaceFilePath(
  workspacePath: string,
  filePath: string
): string {
  const absolutePath = path.isAbsolute(filePath)
    ? path.resolve(filePath)
    : path.resolve(workspacePath, filePath);

  return path.normalize(absolutePath);
}

export function createLspSession(
  sessionKey: string,
  initialProfile: LspSessionProfile,
  ownershipSink: LspSessionOwnershipSink = {}
): LspSession {
  let profile = initialProfile;
  let state: SessionState = 'not_started';
  let client: LspClient | null = null;
  let process: ChildProcessWithoutNullStreams | null = null;
  let lastError: string | null = null;
  let startPromise: Promise<void> | null = null;
  let hasStartAttempt = false;
  let stores = createStores();
  const ownedDocuments = new Set<string>();

  function getInactiveState(): SessionState {
    return hasStartAttempt ? 'stopped' : 'not_started';
  }

  function setProfile(nextProfile: LspSessionProfile): void {
    profile = nextProfile;
  }

  function claimDocument(filePath: string): string {
    const normalizedPath = normalizeWorkspaceFilePath(
      profile.workspacePath,
      filePath
    );
    ownedDocuments.add(normalizedPath);
    return normalizedPath;
  }

  function releaseDocument(filePath: string): string | null {
    const normalizedPath = normalizeWorkspaceFilePath(
      profile.workspacePath,
      filePath
    );
    if (!ownedDocuments.delete(normalizedPath)) {
      return null;
    }
    return normalizedPath;
  }

  function listOwnedDocuments(): string[] {
    return [...ownedDocuments.values()].sort();
  }

  function clearOwnedDocuments(): string[] {
    const documents = listOwnedDocuments();
    ownedDocuments.clear();
    return documents;
  }

  function requireClient(): LspClient {
    if (!client || state !== 'ready') {
      throw new Error(`LSP session '${profile.name}' is not initialized`);
    }

    return client;
  }

  function requireSessionClient(): LspClient {
    if (!client) {
      throw new Error(`LSP session '${profile.name}' is not initialized`);
    }

    if (
      state === 'not_started' ||
      state === 'stopped' ||
      state === 'error'
    ) {
      throw new Error(`LSP session '${profile.name}' is not available`);
    }

    return client;
  }

  async function request<TResult, TParams = unknown>(
    method: string,
    params: TParams
  ): Promise<TResult> {
    return await requireClient().connection.sendRequest(method, params);
  }

  function notifyDocumentClaimed(filePath: string, uri: string): void {
    const normalizedPath = claimDocument(filePath);
    ownershipSink.onDocumentClaimed?.(sessionKey, normalizedPath, uri);
  }

  function notifyDocumentReleased(filePath: string, uri: string): void {
    const normalizedPath = releaseDocument(filePath);
    if (normalizedPath) {
      ownershipSink.onDocumentReleased?.(sessionKey, normalizedPath, uri);
    }
  }

  function shouldCloseDocument(
    strategy: FileLifecycleStrategy,
    wasAlreadyOpen: boolean,
    isPreloaded = false
  ): boolean {
    switch (strategy) {
      case 'transient':
        return !isPreloaded;
      case 'persistent':
        return false;
      case 'respect_existing':
        return !wasAlreadyOpen;
      default:
        return false;
    }
  }

  async function resolveDocumentContent(
    normalizedPath: string,
    strategy: FileLifecycleStrategy,
    existingDocument?: {
      content: string;
      version: number;
    }
  ): Promise<{ content: string; version: number }> {
    if (strategy === 'transient') {
      const content = await fs.promises.readFile(normalizedPath, 'utf8');
      return {
        content,
        version: existingDocument ? existingDocument.version + 1 : 1,
      };
    }

    if (existingDocument) {
      return {
        content: existingDocument.content,
        version: existingDocument.version,
      };
    }

    return {
      content: await fs.promises.readFile(normalizedPath, 'utf8'),
      version: 1,
    };
  }

  interface OpenedDocument {
    wasAlreadyOpen: boolean;
    isPreloaded: boolean;
    filePath: string;
    uri: string;
    strategy: FileLifecycleStrategy;
  }

  async function openDocument(
    filePath: string,
    strategy: FileLifecycleStrategy
  ): Promise<Result<OpenedDocument>> {
    return tryResultAsync(
      async () => {
        const activeClient = requireSessionClient();
        const normalizedPath = normalizeWorkspaceFilePath(
          profile.workspacePath,
          filePath
        );
        const uri = pathToFileURL(normalizedPath).toString();
        const existingDocument = stores.documents.get(uri);
        const isPreloaded = Boolean(existingDocument);
        const wasAlreadyOpen = existingDocument?.isOpen ?? false;

        if (wasAlreadyOpen && strategy === 'respect_existing') {
          return {
            wasAlreadyOpen,
            isPreloaded,
            filePath: normalizedPath,
            uri,
            strategy,
          };
        }

        const { content, version } = await resolveDocumentContent(
          normalizedPath,
          strategy,
          existingDocument
        );

        if (wasAlreadyOpen) {
          const closeResult = await forceCloseFile(
            activeClient,
            uri,
            stores.documents
          );
          if (!closeResult.ok) {
            throw new Error(closeResult.error.message);
          }
          notifyDocumentReleased(normalizedPath, uri);
        }

        const languageId = getLanguageIdForExtensions(
          normalizedPath,
          profile.config.extensions
        );
        const openResult = await openFile(
          activeClient,
          uri,
          content,
          version,
          languageId,
          stores.documents
        );
        if (!openResult.ok) {
          throw new Error(openResult.error.message);
        }

        notifyDocumentClaimed(normalizedPath, uri);

        return {
          wasAlreadyOpen,
          isPreloaded,
          filePath: normalizedPath,
          uri,
          strategy,
        };
      },
      (error) =>
        createLspError(
          ErrorCode.LSPError,
          `Failed to open file with strategy: ${error instanceof Error ? error.message : String(error)}`,
          error instanceof Error ? error : undefined
        )
    );
  }

  async function closeDocument(
    document: Pick<
      OpenedDocument,
      'filePath' | 'uri' | 'strategy' | 'wasAlreadyOpen' | 'isPreloaded'
    >
  ): Promise<Result<void>> {
    if (
      !shouldCloseDocument(
        document.strategy,
        document.wasAlreadyOpen,
        document.isPreloaded
      )
    ) {
      return { ok: true, data: undefined };
    }

    const closeResult = await closeFile(
      requireSessionClient(),
      document.uri,
      stores.documents
    );
    if (!closeResult.ok) {
      return closeResult;
    }

    notifyDocumentReleased(document.filePath, document.uri);
    return { ok: true, data: undefined };
  }

  async function executeWithSessionCursorContext<T>(
    operationName: string,
    filePath: string,
    position: OneBasedPosition,
    strategy: FileLifecycleStrategy,
    operation: (scope: SessionCursorContextScope) => Promise<Result<T>>
  ): Promise<Result<CursorContextOperationResult<T>>> {
    const openResult = await openDocument(filePath, strategy);
    if (!openResult.ok) {
      return openResult;
    }

    const document = openResult.data;
    const activeClient = requireClient();

    const executionResult = await tryResultAsync(
      async () => {
        const cursorContext = await generateCursorContext(
          operationName,
          activeClient,
          document.uri,
          filePath,
          position,
          stores.documents
        );

        const operationResult = await operation({
          uri: document.uri,
          cursorContext: cursorContext || undefined,
          request: async (method, params) =>
            await activeClient.connection.sendRequest(method, params),
        });
        if (!operationResult.ok) {
          throw new Error(operationResult.error.message);
        }

        const closeResult = await closeDocument(document);
        if (!closeResult.ok) {
          logger.warn(
            'Failed to close document after cursor-context operation',
            {
              profile: profile.name,
              filePath: document.filePath,
              error: closeResult.error,
            }
          );
        }

        const resultData: CursorContextOperationResult<
          typeof operationResult.data
        > = {
          result: operationResult.data,
        };

        if (cursorContext) {
          resultData.cursorContext = cursorContext;
        }

        return resultData;
      },
      (error) =>
        createLspError(
          ErrorCode.LSPError,
          `Operation failed: ${error instanceof Error ? error.message : String(error)}`,
          error instanceof Error ? error : undefined
        )
    );

    if (!executionResult.ok) {
      await closeDocument(document);
    }

    return executionResult;
  }

  async function executeWithSessionDocumentLifecycle<T>(
    filePath: string,
    strategy: FileLifecycleStrategy,
    operation: (scope: SessionDocumentScope) => Promise<Result<T>>
  ): Promise<Result<T>> {
    const openResult = await openDocument(filePath, strategy);
    if (!openResult.ok) {
      return openResult;
    }

    const document = openResult.data;
    const executionResult = await tryResultAsync(
      async () => {
        const activeClient = requireClient();
        const operationResult = await operation({
          uri: document.uri,
          request: async (method, params) =>
            await activeClient.connection.sendRequest(method, params),
        });
        if (!operationResult.ok) {
          throw new Error(operationResult.error.message);
        }

        const closeResult = await closeDocument(document);
        if (!closeResult.ok) {
          logger.warn('Failed to close document after lifecycle operation', {
            profile: profile.name,
            filePath: document.filePath,
            error: closeResult.error,
          });
        }

        return operationResult.data;
      },
      (error) =>
        createLspError(
          ErrorCode.LSPError,
          `Operation failed: ${error instanceof Error ? error.message : String(error)}`,
          error instanceof Error ? error : undefined
        )
    );

    if (!executionResult.ok) {
      await closeDocument(document);
    }

    return executionResult;
  }

  async function initializeWorkspace(): Promise<void> {
    if (!client) {
      throw new Error('LSP client not initialized');
    }

    stores.workspaceState.isLoading = true;
    stores.workspaceState.isReady = false;
    stores.workspaceState.loadingStartedAt = new Date();
    delete stores.workspaceState.readyAt;

    try {
      const filesToOpen =
        createWorkspaceConfig(profile).preloadFiles || getDefaultPreloadFiles();

      if (filesToOpen.length === 0) {
        stores.workspaceState.isLoading = false;
        stores.workspaceState.isReady = true;
        stores.workspaceState.readyAt = new Date();
        return;
      }

      for (const filePath of filesToOpen) {
        const result = await openDocument(filePath, 'persistent');

        if (!result.ok) {
          logger.warn(
            'Failed to open preloaded file for workspace initialization',
            {
              profile: profile.name,
              filePath,
              error: result.error,
            }
          );
          continue;
        }
      }

      stores.workspaceState.isLoading = false;
      stores.workspaceState.isReady = true;
      stores.workspaceState.readyAt = new Date();
    } catch (error) {
      stores.workspaceState.isLoading = false;
      stores.workspaceState.isReady = false;

      throw new Error(
        `Failed to initialize workspace: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async function start(): Promise<void> {
    if (state === 'ready' && client) {
      return;
    }

    if (startPromise) {
      return startPromise;
    }

    startPromise = (async () => {
      hasStartAttempt = true;
      state = 'starting';
      lastError = null;
      stores = createStores();

      const workspaceConfig = createWorkspaceConfig(profile);
      upgradeToContextualLogger(profile.workspacePath, profile.name);

      const clientResult = createLspClient(
        workspaceConfig,
        profile.config,
        stores.diagnosticsStore,
        stores.diagnosticProviderStore,
        stores.windowLogStore,
        stores.workspaceLoaderStore
      );

      if (!clientResult.ok) {
        state = 'error';
        lastError = clientResult.error.message;
        throw new Error(clientResult.error.message);
      }

      const activeClient = clientResult.data.client;
      const activeProcess = clientResult.data.process;

      client = activeClient;
      process = activeProcess;

      activeProcess.once('exit', (code, signal) => {
        if (process !== activeProcess) {
          return;
        }

        client = null;
        process = null;
        startPromise = null;
        stores.workspaceState.isLoading = false;
        stores.workspaceState.isReady = false;

        state = 'error';
        lastError =
          code !== null
            ? `LSP process exited with code ${code}`
            : `LSP process terminated by signal ${signal || 'unknown'}`;
        ownershipSink.onSessionUnexpectedExit?.(sessionKey, lastError);
      });

      const initResult = await initializeLspClient(
        activeClient,
        workspaceConfig,
        stores.diagnosticProviderStore,
        stores.workspaceLoaderStore,
        profile.config
      );

      if (!initResult.ok) {
        client = null;
        process = null;
        state = 'error';
        lastError = initResult.error.message;
        await terminateClientProcess(activeClient, activeProcess);
        throw new Error(initResult.error.message);
      }

      try {
        await initializeWorkspace();
      } catch (error) {
        client = null;
        process = null;
        state = 'error';
        lastError = error instanceof Error ? error.message : String(error);
        await terminateClientProcess(activeClient, activeProcess);
        throw error;
      }

      state = 'ready';
    })().finally(() => {
      startPromise = null;
    });

    return startPromise;
  }

  async function stop(): Promise<void> {
    if (startPromise) {
      try {
        await startPromise;
      } catch {
        // Ignore start failures during stop.
      }
    }

    if (!client && !process) {
      stores = createStores();
      state = getInactiveState();
      lastError = null;
      return;
    }

    const currentClient = client;
    const currentProcess = process;

    client = null;
    process = null;
    stores.workspaceState.isLoading = false;
    stores.workspaceState.isReady = false;

    await terminateClientProcess(currentClient, currentProcess);

    stores = createStores();
    state = getInactiveState();
    lastError = null;
  }

  async function restart(): Promise<void> {
    await stop();
    await start();
  }

  function canHandleFile(filePath: string): boolean {
    const extension = path.extname(
      normalizeWorkspaceFilePath(profile.workspacePath, filePath)
    );
    return Boolean(extension && profile.config.extensions[extension]);
  }

  function isReady(): boolean {
    return state === 'ready' && client !== null;
  }

  function isActive(): boolean {
    return state === 'ready' || state === 'starting';
  }

  function getStatusSnapshot(): LspSessionStatusSnapshot {
    const hasRuntimeWorkspaceState =
      state !== 'not_started' && state !== 'stopped';

    return {
      sessionKey,
      profileName: profile.name,
      state,
      command: [profile.config.commandName, ...profile.config.commandArgs].join(
        ' '
      ),
      workspacePath: profile.workspacePath,
      lastError,
      pid: process?.pid ?? null,
      extensions: Object.keys(profile.config.extensions).sort(),
      preloadFiles: [...(profile.config.preload_files || [])],
      diagnosticsStrategy: profile.config.diagnostics.strategy,
      workspaceLoader: profile.config.workspace_loader || null,
      workspaceReady: hasRuntimeWorkspaceState
        ? stores.workspaceState.isReady
        : null,
      workspaceLoading: hasRuntimeWorkspaceState
        ? stores.workspaceState.isLoading
        : null,
      windowLogCount: stores.windowLogStore.getMessages().length,
    };
  }

  return {
    sessionKey,
    getProfile(): LspSessionProfile {
      return profile;
    },
    setProfile,
    canHandleFile,
    isReady,
    isActive,
    start,
    stop,
    restart,
    request,
    getWorkspaceState(): WorkspaceState {
      return stores.workspaceState;
    },
    getWorkspaceLoaderStore(): WorkspaceLoaderStore {
      return stores.workspaceLoaderStore;
    },
    getDiagnosticsStore(): DiagnosticsStore {
      return stores.diagnosticsStore;
    },
    getDiagnosticProviderStore(): DiagnosticProviderStore {
      return stores.diagnosticProviderStore;
    },
    getWindowLogStore(): WindowLogStore {
      return stores.windowLogStore;
    },
    executeWithCursorContext: executeWithSessionCursorContext,
    executeWithDocumentLifecycle: executeWithSessionDocumentLifecycle,
    claimDocument,
    releaseDocument,
    listOwnedDocuments,
    clearOwnedDocuments,
    getStatusSnapshot,
  };
}
