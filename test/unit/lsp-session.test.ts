import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import * as path from 'node:path';
import * as fs from 'node:fs';
import type { ChildProcessWithoutNullStreams } from 'child_process';
import { createLspSession } from '../../src/runtime/lsp-session.js';
import type { LspSessionProfile } from '../../src/runtime/lsp-session.js';
import { createLspClient, initializeLspClient } from '../../src/lsp-client.js';
import {
  getDefaultPreloadEntriesForProfile,
  resolvePreloadEntries,
} from '../../src/utils/preload-files.js';

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    promises: {
      ...actual.promises,
      readFile: vi.fn(),
    },
  };
});

vi.mock('../../src/lsp-client.js', () => ({
  createLspClient: vi.fn(),
  initializeLspClient: vi.fn(),
  shutdownLspClient: vi.fn(),
}));

vi.mock('../../src/config/lsp-config.js', () => ({
  getLanguageIdForExtensions: vi.fn(() => 'typescript'),
}));

vi.mock('../../src/utils/preload-files.js', () => ({
  getDefaultPreloadEntriesForProfile: vi.fn(() => []),
  resolvePreloadEntries: vi.fn(),
}));

vi.mock('../../src/utils/logger.js', () => ({
  initLogger: vi.fn(),
  upgradeToContextualLogger: vi.fn(),
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const mockReadFile = vi.mocked(fs.promises.readFile);
const mockCreateLspClient = vi.mocked(createLspClient);
const mockInitializeLspClient = vi.mocked(initializeLspClient);
const mockGetDefaultPreloadEntriesForProfile = vi.mocked(
  getDefaultPreloadEntriesForProfile
);
const mockResolvePreloadEntries = vi.mocked(resolvePreloadEntries);

function createMockProcess(): ChildProcessWithoutNullStreams {
  const process = new EventEmitter() as ChildProcessWithoutNullStreams;
  Object.assign(process, {
    pid: 4321,
    exitCode: null,
    signalCode: null,
    killed: false,
    kill: vi.fn(() => true),
  });
  return process;
}

function createProfile(preloadFiles: string[] = []): LspSessionProfile {
  const workspacePath = '/workspace';
  return {
    name: 'typescript',
    workspacePath,
    workspaceUri: 'file:///workspace',
    workspaceName: 'workspace',
    configPath: null,
    config: {
      name: 'typescript',
      command: 'typescript-language-server --stdio',
      commandName: 'typescript-language-server',
      commandArgs: ['--stdio'],
      extensions: {
        '.ts': 'typescript',
      },
      workspace_files: [],
      preload_files: preloadFiles,
      workspace_ready_delay_ms: 0,
      diagnostics: {
        strategy: 'push',
        wait_timeout_ms: 2000,
      },
      symbols: {},
    },
  };
}

function mockSuccessfulStart() {
  const sendNotification = vi.fn().mockResolvedValue(undefined);
  mockCreateLspClient.mockReturnValue({
    ok: true,
    data: {
      client: {
        connection: {
          sendNotification,
        } as never,
        isInitialized: true,
      },
      process: createMockProcess(),
    },
  });
  mockInitializeLspClient.mockResolvedValue({
    ok: true,
    data: { capabilities: {} },
  });

  return sendNotification;
}

describe('LspSession document lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockReadFile.mockResolvedValue('content');
    mockGetDefaultPreloadEntriesForProfile.mockReturnValue([]);
    mockResolvePreloadEntries.mockImplementation((workspacePath, entries) =>
      Promise.resolve({
        resolvedEntries: entries.map((entry) => ({
          entry,
          resolvedPath: path.resolve(workspacePath, entry),
          matchCount: 1,
        })),
        missingEntries: [],
      })
    );
  });

  it('reports not_started before the session has ever been launched', () => {
    const session = createLspSession(
      'typescript::/workspace',
      createProfile(['anchor.ts'])
    );

    expect(session.getStatusSnapshot()).toMatchObject({
      state: 'not_started',
      workspaceReady: null,
      workspaceLoading: null,
    });
  });

  it('reports stopped after an explicit stop', async () => {
    mockSuccessfulStart();

    const session = createLspSession(
      'typescript::/workspace',
      createProfile(['anchor.ts'])
    );

    await session.start();
    await session.stop();

    expect(session.getStatusSnapshot()).toMatchObject({
      state: 'stopped',
      workspaceReady: null,
      workspaceLoading: null,
    });
  });

  it('escalates to SIGKILL when SIGTERM does not make the process exit', async () => {
    vi.useFakeTimers();

    try {
      const process = createMockProcess();
      const kill = vi.fn((signal: NodeJS.Signals | number = 'SIGTERM') => {
        Object.assign(process, { killed: true });
        if (signal === 'SIGKILL') {
          process.emit('exit', null, 'SIGKILL');
        }
        return true;
      });
      Object.assign(process, { kill });

      const sendNotification = vi.fn().mockResolvedValue(undefined);
      mockCreateLspClient.mockReturnValue({
        ok: true,
        data: {
          client: {
            connection: {
              sendNotification,
            } as never,
            isInitialized: true,
          },
          process,
        },
      });
      mockInitializeLspClient.mockResolvedValue({
        ok: true,
        data: { capabilities: {} },
      });

      const session = createLspSession(
        'typescript::/workspace',
        createProfile()
      );
      await session.start();

      const stopPromise = session.stop();
      await vi.advanceTimersByTimeAsync(5000);
      await stopPromise;

      expect(kill).toHaveBeenNthCalledWith(1, 'SIGTERM');
      expect(kill).toHaveBeenNthCalledWith(2, 'SIGKILL');
    } finally {
      vi.useRealTimers();
    }
  });

  it('marks the session as errored and notifies ownership listeners on unexpected exit', async () => {
    const process = createMockProcess();
    const onSessionUnexpectedExit = vi.fn();

    const sendNotification = vi.fn().mockResolvedValue(undefined);
    mockCreateLspClient.mockReturnValue({
      ok: true,
      data: {
        client: {
          connection: {
            sendNotification,
          } as never,
          isInitialized: true,
        },
        process,
      },
    });
    mockInitializeLspClient.mockResolvedValue({
      ok: true,
      data: { capabilities: {} },
    });

    const session = createLspSession(
      'typescript::/workspace',
      createProfile(['anchor.ts']),
      { onSessionUnexpectedExit }
    );

    await session.start();
    process.emit('exit', 1, null);

    expect(onSessionUnexpectedExit).toHaveBeenCalledWith(
      'typescript::/workspace',
      'LSP process exited with code 1'
    );
    expect(session.getStatusSnapshot()).toMatchObject({
      state: 'error',
      lastError: 'LSP process exited with code 1',
      pid: null,
      workspaceReady: false,
      workspaceLoading: false,
    });
  });

  it('does not report ready when the process exits during workspace initialization', async () => {
    const process = createMockProcess();
    let finishPreloadResolution!: (
      value: Awaited<ReturnType<typeof resolvePreloadEntries>>
    ) => void;

    mockResolvePreloadEntries.mockReturnValueOnce(
      new Promise((resolve) => {
        finishPreloadResolution = resolve;
      })
    );
    mockCreateLspClient.mockReturnValue({
      ok: true,
      data: {
        client: {
          connection: {
            sendNotification: vi.fn().mockResolvedValue(undefined),
          } as never,
          isInitialized: true,
        },
        process,
      },
    });
    mockInitializeLspClient.mockResolvedValue({
      ok: true,
      data: { capabilities: {} },
    });

    const session = createLspSession('typescript::/workspace', createProfile());
    const startPromise = session.start();

    await vi.waitFor(() => {
      expect(mockResolvePreloadEntries).toHaveBeenCalledOnce();
    });
    Object.assign(process, { exitCode: 1 });
    process.emit('exit', 1, null);
    finishPreloadResolution({ resolvedEntries: [], missingEntries: [] });

    await expect(startPromise).rejects.toThrow(
      'LSP process exited with code 1'
    );
    expect(session.getStatusSnapshot()).toMatchObject({
      state: 'error',
      lastError: 'LSP process exited with code 1',
      pid: null,
      workspaceReady: false,
      workspaceLoading: false,
    });
  });

  it('keeps anchor files open while transient operation files are opened and closed', async () => {
    const sendNotification = vi.fn().mockResolvedValue(undefined);
    mockCreateLspClient.mockReturnValue({
      ok: true,
      data: {
        client: {
          connection: {
            sendNotification,
          } as never,
          isInitialized: true,
        },
        process: createMockProcess(),
      },
    });
    mockInitializeLspClient.mockResolvedValue({
      ok: true,
      data: { capabilities: {} },
    });

    const session = createLspSession(
      'typescript::/workspace',
      createProfile(['anchor.ts'])
    );

    await session.start();

    const anchorPath = path.normalize('/workspace/anchor.ts');
    const transientPath = path.normalize('/workspace/src/transient.ts');

    expect(session.listOwnedDocuments()).toEqual([anchorPath]);

    const result = await session.executeWithDocumentLifecycle(
      'src/transient.ts',
      'transient',
      (scope) => Promise.resolve(scope)
    );

    expect(result.uri).toBe('file:///workspace/src/transient.ts');
    expect(session.listOwnedDocuments()).toEqual([anchorPath]);

    const methods = sendNotification.mock.calls.map(
      (call): string => call[0] as string
    );
    expect(methods).toEqual([
      'textDocument/didOpen',
      'textDocument/didOpen',
      'textDocument/didClose',
    ]);

    expect(sendNotification.mock.calls[0]?.[1]).toMatchObject({
      textDocument: {
        uri: 'file:///workspace/anchor.ts',
      },
    });
    expect(sendNotification.mock.calls[1]?.[1]).toMatchObject({
      textDocument: {
        uri: 'file:///workspace/src/transient.ts',
      },
    });
    expect(sendNotification.mock.calls[2]?.[1]).toMatchObject({
      textDocument: {
        uri: 'file:///workspace/src/transient.ts',
      },
    });

    expect(mockReadFile).toHaveBeenCalledWith(anchorPath, 'utf8');
    expect(mockReadFile).toHaveBeenCalledWith(transientPath, 'utf8');
  });

  it('closes a transient document when its operation fails', async () => {
    const sendNotification = mockSuccessfulStart();
    const session = createLspSession('typescript::/workspace', createProfile());
    await session.start();

    const operationError = new Error('operation failed', {
      cause: new Error('root cause'),
    });
    await expect(
      session.executeWithDocumentLifecycle(
        'src/transient.ts',
        'transient',
        () => Promise.reject(operationError)
      )
    ).rejects.toBe(operationError);

    expect(session.listOwnedDocuments()).toEqual([]);
    expect(
      sendNotification.mock.calls.map((call): string => call[0] as string)
    ).toEqual(['textDocument/didOpen', 'textDocument/didClose']);
  });

  it('preserves the original cause through the session lifecycle', async () => {
    mockSuccessfulStart();
    const session = createLspSession('typescript::/workspace', createProfile());
    await session.start();
    const cause = new Error('root cause');
    const operationError = new Error('operation failed', { cause });

    await expect(
      session.executeWithDocumentLifecycle(
        'src/transient.ts',
        'transient',
        () => Promise.reject(operationError)
      )
    ).rejects.toMatchObject({ cause });
  });

  it('refreshes affected open documents from their updated disk content', async () => {
    const sendNotification = vi.fn().mockResolvedValue(undefined);
    mockCreateLspClient.mockReturnValue({
      ok: true,
      data: {
        client: {
          connection: {
            sendNotification,
          } as never,
          isInitialized: true,
        },
        process: createMockProcess(),
      },
    });
    mockInitializeLspClient.mockResolvedValue({
      ok: true,
      data: { capabilities: {} },
    });

    const session = createLspSession(
      'typescript::/workspace',
      createProfile(['anchor.ts'])
    );
    await session.start();

    mockReadFile.mockResolvedValue('renamed content');
    const refreshed = await session.refreshOpenDocuments([
      '/workspace/anchor.ts',
      '/workspace/not-open.ts',
    ]);

    expect(refreshed).toEqual([path.normalize('/workspace/anchor.ts')]);
    expect(session.listOwnedDocuments()).toEqual([
      path.normalize('/workspace/anchor.ts'),
    ]);
    expect(
      sendNotification.mock.calls.map((call): string => call[0] as string)
    ).toEqual([
      'textDocument/didOpen',
      'textDocument/didClose',
      'textDocument/didOpen',
    ]);
    expect(sendNotification.mock.calls[2]?.[1]).toMatchObject({
      textDocument: {
        uri: 'file:///workspace/anchor.ts',
        text: 'renamed content',
        version: 2,
      },
    });

    mockReadFile.mockResolvedValue('renamed again');
    await session.refreshOpenDocuments(['/workspace/anchor.ts']);
    expect(sendNotification.mock.calls[4]?.[1]).toMatchObject({
      textDocument: {
        text: 'renamed again',
        version: 3,
      },
    });
  });

  it('falls back to default preload entries when configured ones resolve to nothing', async () => {
    const sendNotification = vi.fn().mockResolvedValue(undefined);
    mockCreateLspClient.mockReturnValue({
      ok: true,
      data: {
        client: {
          connection: {
            sendNotification,
          } as never,
          isInitialized: true,
        },
        process: createMockProcess(),
      },
    });
    mockInitializeLspClient.mockResolvedValue({
      ok: true,
      data: { capabilities: {} },
    });
    mockGetDefaultPreloadEntriesForProfile.mockReturnValue(['src/index.ts']);
    mockResolvePreloadEntries
      .mockResolvedValueOnce({
        resolvedEntries: [],
        missingEntries: ['missing.ts'],
      })
      .mockResolvedValueOnce({
        resolvedEntries: [
          {
            entry: 'src/index.ts',
            resolvedPath: '/workspace/src/index.ts',
            matchCount: 1,
          },
        ],
        missingEntries: [],
      });

    const session = createLspSession(
      'typescript::/workspace',
      createProfile(['missing.ts'])
    );

    await session.start();

    expect(mockResolvePreloadEntries).toHaveBeenNthCalledWith(1, '/workspace', [
      'missing.ts',
    ]);
    expect(mockResolvePreloadEntries).toHaveBeenNthCalledWith(2, '/workspace', [
      'src/index.ts',
    ]);
    expect(sendNotification.mock.calls[0]?.[1]).toMatchObject({
      textDocument: {
        uri: 'file:///workspace/src/index.ts',
      },
    });
  });
});
