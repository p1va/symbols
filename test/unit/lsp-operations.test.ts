import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  completion,
  findReferences,
  getDiagnostics,
  inspectSymbol,
  logs,
  outlineSymbols,
  rename,
  searchSymbols,
} from '../../src/lsp/operations/operations.js';
import { createOneBasedPosition, type LogMessage } from '../../src/types.js';
import type { LspSession } from '../../src/runtime/lsp-session.js';

const TEST_URI = 'file:///test/workspace/src/test.ts';
const TEST_FILE_PATH = '/test/workspace/src/test.ts';

interface MockSessionOptions {
  requestImpl?: (method: string, params: unknown) => Promise<unknown>;
  diagnosticsStrategy?: 'push' | 'pull';
  providers?: Array<{ id: string }>;
  logMessages?: LogMessage[];
}
function createMockSession(options: MockSessionOptions = {}): {
  session: LspSession;
  request: ReturnType<typeof vi.fn>;
  diagnosticsStore: { getDiagnostics: ReturnType<typeof vi.fn> };
  diagnosticProviderStore: {
    getProvidersForDocument: ReturnType<typeof vi.fn>;
  };
  windowLogStore: { getMessages: ReturnType<typeof vi.fn> };
} {
  const request = vi.fn((method: string, params: unknown) => {
    if (options.requestImpl) {
      return options.requestImpl(method, params);
    }

    return Promise.reject(new Error(`unexpected request ${method}`));
  });
  const diagnosticsStore = {
    getDiagnostics: vi.fn(() => []),
  };
  const diagnosticProviderStore = {
    getProvidersForDocument: vi.fn(() => options.providers ?? []),
  };
  const windowLogStore = {
    getMessages: vi.fn(() => options.logMessages ?? []),
  };
  const profile = {
    name: 'typescript',
    workspacePath: '/test/workspace',
    workspaceUri: 'file:///test/workspace',
    workspaceName: 'workspace',
    configPath: null,
    config: {
      commandName: 'typescript-language-server',
      commandArgs: ['--stdio'],
      extensions: { '.ts': 'typescript' },
      diagnostics: {
        strategy: options.diagnosticsStrategy ?? ('push' as const),
      },
      symbols: {},
      preload_files: [],
    },
  };

  const executeWithCursorContext: LspSession['executeWithCursorContext'] =
    async (_name, _filePath, _position, _strategy, operation) => {
      const result = await operation({
        uri: TEST_URI,
        request,
      });

      if (!result.ok) {
        return result;
      }

      return {
        ok: true,
        data: {
          result: result.data,
        },
      };
    };

  const executeWithDocumentLifecycle: LspSession['executeWithDocumentLifecycle'] =
    async (_filePath, _strategy, operation) =>
      await operation({
        uri: TEST_URI,
        request,
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
    request,
    getWorkspaceState: vi.fn(() => ({
      isReady: true,
      isLoading: false,
    })),
    getDiagnosticsStore: vi.fn(() => diagnosticsStore),
    getDiagnosticProviderStore: vi.fn(() => diagnosticProviderStore),
    getWindowLogStore: vi.fn(() => windowLogStore),
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
      diagnosticsStrategy: options.diagnosticsStrategy ?? ('push' as const),
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

describe('LSP operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inspectSymbol sends the expected LSP requests from the prepared input', async () => {
    const { session, request } = createMockSession({
      requestImpl: (method) => {
        switch (method) {
          case 'textDocument/hover':
            return Promise.resolve({ contents: 'hover' });
          case 'textDocument/definition':
          case 'textDocument/typeDefinition':
          case 'textDocument/implementation':
            return Promise.resolve([]);
          default:
            return Promise.reject(new Error(`unexpected method ${method}`));
        }
      },
    });

    const result = await inspectSymbol(session, {
      filePath: TEST_FILE_PATH,
      position: createOneBasedPosition(5, 10),
      lspPosition: { line: 4, character: 9 },
    });

    expect(result.ok).toBe(true);
    expect(request).toHaveBeenCalledWith('textDocument/hover', {
      textDocument: { uri: TEST_URI },
      position: { line: 4, character: 9 },
    });
    expect(request).toHaveBeenCalledTimes(4);
  });

  it('findReferences uses the prepared LSP position and includeDeclaration=true', async () => {
    const { session, request } = createMockSession({
      requestImpl: () =>
        Promise.resolve([
          {
            uri: TEST_URI,
            range: {
              start: { line: 2, character: 3 },
              end: { line: 2, character: 8 },
            },
          },
        ]),
    });

    const result = await findReferences(session, {
      filePath: TEST_FILE_PATH,
      position: createOneBasedPosition(3, 4),
      lspPosition: { line: 2, character: 3 },
    });

    expect(result.ok).toBe(true);
    expect(request).toHaveBeenCalledWith('textDocument/references', {
      textDocument: { uri: TEST_URI },
      position: { line: 2, character: 3 },
      context: { includeDeclaration: true },
    });
  });

  it('completion handles CompletionList responses through the scoped request API', async () => {
    const { session, request } = createMockSession({
      requestImpl: () =>
        Promise.resolve({
          isIncomplete: false,
          items: [
            {
              label: 'testFunction',
              kind: 3,
              detail: 'void',
              documentation: 'docs',
            },
          ],
        }),
    });

    const result = await completion(session, {
      filePath: TEST_FILE_PATH,
      position: createOneBasedPosition(1, 1),
      lspPosition: { line: 0, character: 0 },
    });

    expect(result.ok).toBe(true);
    expect(request).toHaveBeenCalledWith('textDocument/completion', {
      textDocument: { uri: TEST_URI },
      position: { line: 0, character: 0 },
      context: { triggerKind: 1 },
    });
  });

  it('searchSymbols uses the session-level request API', async () => {
    const { session, request } = createMockSession({
      requestImpl: () =>
        Promise.resolve([
          {
            name: 'TestClass',
            kind: 5,
            location: {
              uri: TEST_URI,
              range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 10 },
              },
            },
          },
        ]),
    });

    const result = await searchSymbols(session, {
      query: 'TestClass',
    });

    expect(result.ok).toBe(true);
    expect(request).toHaveBeenCalledWith('workspace/symbol', {
      query: 'TestClass',
    });
  });

  it('outlineSymbols resolves document symbols through the scoped request API', async () => {
    const { session, request } = createMockSession({
      requestImpl: () =>
        Promise.resolve([
          {
            name: 'TestClass',
            kind: 5,
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 10 },
            },
            selectionRange: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 10 },
            },
            children: [],
          },
        ]),
    });

    const result = await outlineSymbols(session, {
      filePath: TEST_FILE_PATH,
    });

    expect(result.ok).toBe(true);
    expect(request).toHaveBeenCalledWith('textDocument/documentSymbol', {
      textDocument: { uri: TEST_URI },
    });
  });

  it('getDiagnostics uses pull providers through the scoped request API', async () => {
    const { session, request } = createMockSession({
      diagnosticsStrategy: 'pull',
      providers: [{ id: 'roslyn' }],
      requestImpl: () =>
        Promise.resolve({
          kind: 'full',
          items: [
            {
              code: 'CS1001',
              message: 'problem',
              severity: 1,
              range: {
                start: { line: 1, character: 2 },
                end: { line: 1, character: 5 },
              },
              source: 'roslyn',
            },
          ],
        }),
    });

    const result = await getDiagnostics(session, {
      filePath: TEST_FILE_PATH,
    });

    expect(result.ok).toBe(true);
    expect(request).toHaveBeenCalledWith('textDocument/diagnostic', {
      textDocument: { uri: TEST_URI },
      identifier: 'roslyn',
    });
  });

  it('rename uses the prepared rename payload and returns workspace edits', async () => {
    const { session, request } = createMockSession({
      requestImpl: () =>
        Promise.resolve({
          changes: {
            [TEST_URI]: [
              {
                range: {
                  start: { line: 0, character: 0 },
                  end: { line: 0, character: 4 },
                },
                newText: 'Renamed',
              },
            ],
          },
        }),
    });

    const result = await rename(session, {
      filePath: TEST_FILE_PATH,
      position: createOneBasedPosition(1, 1),
      lspPosition: { line: 0, character: 0 },
      newName: 'Renamed',
    });

    expect(result.ok).toBe(true);
    expect(request).toHaveBeenCalledWith('textDocument/rename', {
      textDocument: { uri: TEST_URI },
      position: { line: 0, character: 0 },
      newName: 'Renamed',
    });
  });

  it('logs returns messages from the window log store', () => {
    const messages: LogMessage[] = [
      { type: 1, message: 'Error' },
      { type: 3, message: 'Info' },
    ];
    const { session } = createMockSession({
      logMessages: messages,
    });

    const result = logs(session);

    expect(result).toEqual({ ok: true, data: messages });
  });
});
