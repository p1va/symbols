import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import * as path from 'node:path';
import * as fs from 'node:fs';
import type { ChildProcessWithoutNullStreams } from 'child_process';
import { createLspSession } from '../../src/runtime/lsp-session.js';
import type { LspSessionProfile } from '../../src/runtime/lsp-session.js';
import { createLspClient, initializeLspClient } from '../../src/lsp-client.js';

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

const mockReadFile = vi.mocked(fs.promises.readFile);
const mockCreateLspClient = vi.mocked(createLspClient);
const mockInitializeLspClient = vi.mocked(initializeLspClient);

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
      diagnostics: {
        strategy: 'push',
        wait_timeout_ms: 2000,
      },
      symbols: {},
    },
  };
}

function mockSuccessfulStart(): void {
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
    data: undefined,
  });
}

describe('LspSession document lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockReadFile.mockResolvedValue('content');
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
      data: undefined,
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
      (uri) =>
        Promise.resolve({
          ok: true,
          data: uri,
        })
    );

    expect(result.ok).toBe(true);
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
});
