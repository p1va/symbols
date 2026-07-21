import { vi } from 'vitest';
import type {
  DiagnosticProviderStore,
  DiagnosticsStore,
  LogMessage,
  WindowLogStore,
} from '../../../src/types.js';
import type {
  LspSession,
  LspSessionProfile,
} from '../../../src/runtime/lsp-session.js';
import type { Diagnostic } from 'vscode-languageserver-protocol';

export const TEST_URI = 'file:///test/workspace/src/test.ts';
export const TEST_FILE_PATH = '/test/workspace/src/test.ts';

interface MockSessionOptions {
  requestImpl?: (method: string, params: unknown) => Promise<unknown>;
  diagnosticsStrategy?: 'push' | 'pull';
  diagnosticsWaitTimeoutMs?: number;
  providers?: Array<{ id: string }>;
  logMessages?: LogMessage[];
  pushDiagnostics?: Diagnostic[];
  pushOmittedCount?: number;
  workspaceState?: {
    isReady: boolean;
    isLoading: boolean;
    readyAt?: Date;
  };
  searchWarmupWindowMs?: number;
}

export function createMockSession(options: MockSessionOptions = {}) {
  const request = vi.fn((method: string, params: unknown) => {
    if (options.requestImpl) {
      return options.requestImpl(method, params);
    }

    return Promise.reject(new Error(`unexpected request ${method}`));
  });
  const typedRequest: LspSession['request'] = async (type, params) =>
    (await request(type.method, params)) as never;
  const diagnosticsStore = {
    diagnostics: new Map(),
    omittedDiagnostics: new Map(),
    addDiagnostics: vi.fn(),
    getDiagnostics: vi.fn(() => options.pushDiagnostics ?? []),
    getOmittedCount: vi.fn(() => options.pushOmittedCount ?? 0),
    clear: vi.fn(),
  } satisfies DiagnosticsStore;
  const diagnosticProviderStore = {
    providers: options.providers ?? [],
    addProvider: vi.fn(),
    getProviders: vi.fn(() => options.providers ?? []),
    getProvidersForDocument: vi.fn(() => options.providers ?? []),
    clear: vi.fn(),
  } satisfies DiagnosticProviderStore;
  const windowLogStore = {
    addMessage: vi.fn(),
    getMessages: vi.fn(() => options.logMessages ?? []),
    getDroppedCount: vi.fn(() => 0),
    clear: vi.fn(),
  } satisfies WindowLogStore;
  const profile: LspSessionProfile = {
    name: 'typescript',
    workspacePath: '/test/workspace',
    workspaceUri: 'file:///test/workspace',
    workspaceName: 'workspace',
    configPath: null,
    config: {
      name: 'typescript',
      command: 'typescript-language-server --stdio',
      commandName: 'typescript-language-server',
      commandArgs: ['--stdio'],
      workspace_files: [],
      extensions: { '.ts': 'typescript' },
      diagnostics: {
        strategy: options.diagnosticsStrategy ?? 'push',
        wait_timeout_ms: options.diagnosticsWaitTimeoutMs ?? 2000,
      },
      ...(options.searchWarmupWindowMs !== undefined
        ? {
            search: {
              warmup_window_ms: options.searchWarmupWindowMs,
            },
          }
        : {}),
      symbols: {},
      preload_files: [],
      workspace_ready_delay_ms: 0,
    },
  };

  const executeWithCursorContext: LspSession['executeWithCursorContext'] =
    async (_name, _filePath, _position, _strategy, operation) => {
      const result = await operation({
        uri: TEST_URI,
        request: typedRequest,
      });

      return {
        result,
      };
    };

  const executeWithDocumentLifecycle: LspSession['executeWithDocumentLifecycle'] =
    async (_filePath, _strategy, operation) =>
      await operation({
        uri: TEST_URI,
        request: typedRequest,
      });

  const session: LspSession = {
    sessionKey: 'typescript::/test/workspace',
    getProfile: () => profile,
    setProfile: vi.fn(),
    canHandleFile: vi.fn(() => true),
    isReady: vi.fn(() => true),
    isActive: vi.fn(() => true),
    start: vi.fn(() => Promise.resolve()),
    stop: vi.fn(() => Promise.resolve()),
    restart: vi.fn(() => Promise.resolve()),
    request: typedRequest,
    getWorkspaceState: vi.fn(() => ({
      isReady: options.workspaceState?.isReady ?? true,
      isLoading: options.workspaceState?.isLoading ?? false,
      ...(options.workspaceState?.readyAt
        ? { readyAt: options.workspaceState.readyAt }
        : {}),
    })),
    getWorkspaceLoaderStore: vi.fn(() => ({
      state: null,
      loader: null,
      setState: vi.fn(),
      setLoader: vi.fn(),
      getState: vi.fn(() => null),
      getLoader: vi.fn(() => null),
      updateState: vi.fn(),
      isReady: vi.fn(() => false),
    })),
    getDiagnosticsStore: vi.fn(() => diagnosticsStore),
    getDiagnosticProviderStore: vi.fn(() => diagnosticProviderStore),
    getWindowLogStore: vi.fn(() => windowLogStore),
    refreshOpenDocuments: vi.fn(() => Promise.resolve([])),
    executeWithCursorContext,
    executeWithDocumentLifecycle,
    claimDocument: vi.fn((filePath: string) => filePath),
    releaseDocument: vi.fn(() => null),
    listOwnedDocuments: vi.fn(() => []),
    clearOwnedDocuments: vi.fn(() => []),
    getStatusSnapshot: vi.fn(() => ({
      sessionKey: 'typescript::/test/workspace',
      profileName: 'typescript',
      state: 'ready' as const,
      command: 'typescript-language-server --stdio',
      workspacePath: '/test/workspace',
      lastError: null,
      pid: 1234,
      extensions: ['.ts'],
      preloadFiles: [],
      diagnosticsStrategy: options.diagnosticsStrategy ?? 'push',
      workspaceLoader: null,
      workspaceReady: true,
      workspaceLoading: false,
      windowLogCount: 0,
    })),
  };

  return {
    session,
    request,
    diagnosticsStore,
    diagnosticProviderStore,
    windowLogStore,
  };
}
