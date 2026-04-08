import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockedFunction,
} from 'vitest';
import * as fs from 'fs';
import {
  prepareFileRequest,
  prepareRenameRequest,
  prepareSymbolPositionRequest,
  prepareWorkspaceRequest,
} from '../../src/preparation.js';
import { createOneBasedPosition } from '../../src/types/position.js';
import { ValidationErrorCode } from '../../src/types.js';
import type { LspSession } from '../../src/runtime/lsp-session.js';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  statSync: vi.fn(),
  promises: {
    readFile: vi.fn(),
  },
}));

const mockExistsSync = fs.existsSync as MockedFunction<typeof fs.existsSync>;
const mockStatSync = fs.statSync as MockedFunction<typeof fs.statSync>;
const mockReadFile = fs.promises.readFile as MockedFunction<
  typeof fs.promises.readFile
>;

function createMockSession(
  workspaceState: { isReady: boolean; isLoading: boolean } = {
    isReady: true,
    isLoading: false,
  }
): LspSession {
  return {
    sessionKey: 'typescript::/test/workspace',
    getProfile: vi.fn(() => ({
      name: 'typescript',
      workspacePath: '/test/workspace',
      workspaceUri: 'file:///test/workspace',
      workspaceName: 'workspace',
      configPath: null,
      config: {
        commandName: 'typescript-language-server',
        commandArgs: ['--stdio'],
        extensions: { '.ts': 'typescript' },
        diagnostics: { strategy: 'push' as const },
        symbols: {},
        preload_files: [],
        workspace_ready_delay_ms: 0,
      },
    })),
    setProfile: vi.fn(),
    canHandleFile: vi.fn(() => true),
    isReady: vi.fn(() => true),
    isActive: vi.fn(() => true),
    start: vi.fn(() => Promise.resolve()),
    stop: vi.fn(() => Promise.resolve()),
    restart: vi.fn(() => Promise.resolve()),
    request: vi.fn(),
    getWorkspaceState: vi.fn(() => workspaceState),
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
    getDiagnosticsStore: vi.fn(() => ({}) as never),
    getDiagnosticProviderStore: vi.fn(() => ({}) as never),
    getWindowLogStore: vi.fn(() => ({ getMessages: vi.fn() })),
    executeWithCursorContext: vi.fn(),
    executeWithDocumentLifecycle: vi.fn(),
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
      pid: null,
      extensions: ['.ts'],
      preloadFiles: [],
      diagnosticsStrategy: 'push' as const,
      workspaceLoader: null,
      workspaceReady: workspaceState.isReady,
      workspaceLoading: workspaceState.isLoading,
      windowLogCount: 0,
    })),
  };
}

describe('preparation helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prepareFileRequest normalizes the file path', () => {
    const session = createMockSession();
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({ isFile: () => true } as fs.Stats);

    const result = prepareFileRequest(session, { file: 'src/test.ts' });

    expect(result).toEqual({
      ok: true,
      data: {
        filePath: '/test/workspace/src/test.ts',
      },
    });
  });

  it('prepareSymbolPositionRequest adds the zero-based LSP position', async () => {
    const session = createMockSession();
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({ isFile: () => true } as fs.Stats);
    mockReadFile.mockResolvedValue('alpha\nbeta\ngamma');

    const result = await prepareSymbolPositionRequest(session, {
      file: 'src/test.ts',
      position: createOneBasedPosition(2, 3),
    });

    expect(result).toEqual({
      ok: true,
      data: {
        filePath: '/test/workspace/src/test.ts',
        position: createOneBasedPosition(2, 3),
        lspPosition: { line: 1, character: 2 },
      },
    });
  });

  it('prepareRenameRequest preserves the new name after symbol preparation', async () => {
    const session = createMockSession();
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({ isFile: () => true } as fs.Stats);
    mockReadFile.mockResolvedValue('alpha\nbeta\ngamma');

    const result = await prepareRenameRequest(session, {
      file: 'src/test.ts',
      position: createOneBasedPosition(1, 1),
      newName: 'Renamed',
    });

    expect(result).toEqual({
      ok: true,
      data: {
        filePath: '/test/workspace/src/test.ts',
        position: createOneBasedPosition(1, 1),
        lspPosition: { line: 0, character: 0 },
        newName: 'Renamed',
      },
    });
  });

  it('prepareWorkspaceRequest reports workspace-not-ready errors', () => {
    const session = createMockSession({
      isReady: false,
      isLoading: false,
    });

    const result = prepareWorkspaceRequest(session, {
      query: 'TestClass',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.errorCode).toBe(
        ValidationErrorCode.WorkspaceNotReady
      );
    }
  });
});
