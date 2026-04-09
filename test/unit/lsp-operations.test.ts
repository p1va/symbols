import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  callHierarchy,
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
      workspace_ready_delay_ms: 0,
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

  describe('callHierarchy', () => {
    it('prepares call hierarchy items and resolves incoming/outgoing calls for each target', async () => {
      const preparedItems = [
        {
          name: 'firstTarget',
          kind: 12,
          uri: TEST_URI,
          range: {
            start: { line: 4, character: 2 },
            end: { line: 7, character: 1 },
          },
          selectionRange: {
            start: { line: 4, character: 9 },
            end: { line: 4, character: 20 },
          },
        },
        {
          name: 'secondTarget',
          kind: 12,
          uri: TEST_URI,
          range: {
            start: { line: 9, character: 2 },
            end: { line: 12, character: 1 },
          },
          selectionRange: {
            start: { line: 9, character: 9 },
            end: { line: 9, character: 21 },
          },
        },
      ];

      const { session, request } = createMockSession({
        requestImpl: (method, params) => {
          if (method === 'textDocument/prepareCallHierarchy') {
            return Promise.resolve(preparedItems);
          }

          if (method === 'callHierarchy/incomingCalls') {
            const item =
              params && typeof params === 'object' && 'item' in params
                ? params.item
                : null;
            const name =
              item && typeof item === 'object' && 'name' in item
                ? String(item.name)
                : 'unknown';

            return Promise.resolve([
              {
                from: {
                  name: `${name}Caller`,
                  kind: 12,
                  uri: TEST_URI,
                  range: {
                    start: { line: 1, character: 0 },
                    end: { line: 3, character: 1 },
                  },
                  selectionRange: {
                    start: { line: 1, character: 9 },
                    end: { line: 1, character: 20 },
                  },
                },
                fromRanges: [
                  {
                    start: { line: 2, character: 4 },
                    end: { line: 2, character: 15 },
                  },
                ],
              },
            ]);
          }

          if (method === 'callHierarchy/outgoingCalls') {
            const item =
              params && typeof params === 'object' && 'item' in params
                ? params.item
                : null;
            const name =
              item && typeof item === 'object' && 'name' in item
                ? String(item.name)
                : 'unknown';

            return Promise.resolve([
              {
                to: {
                  name: `${name}Callee`,
                  kind: 12,
                  uri: TEST_URI,
                  range: {
                    start: { line: 20, character: 0 },
                    end: { line: 24, character: 1 },
                  },
                  selectionRange: {
                    start: { line: 20, character: 9 },
                    end: { line: 20, character: 20 },
                  },
                },
                fromRanges: [
                  {
                    start: { line: 5, character: 6 },
                    end: { line: 5, character: 18 },
                  },
                ],
              },
            ]);
          }

          return Promise.reject(new Error(`unexpected method ${method}`));
        },
      });

      const result = await callHierarchy(session, {
        filePath: TEST_FILE_PATH,
        position: createOneBasedPosition(5, 10),
        lspPosition: { line: 4, character: 9 },
      });

      expect(result.ok).toBe(true);
      expect(request).toHaveBeenCalledWith('textDocument/prepareCallHierarchy', {
        textDocument: { uri: TEST_URI },
        position: { line: 4, character: 9 },
      });

      if (!result.ok) {
        throw new Error('expected call hierarchy result');
      }

      expect(result.data.result.direction).toBe('both');
      expect(result.data.result.targets).toHaveLength(2);
      expect(result.data.result.targets[0]?.incomingCalls).toHaveLength(1);
      expect(result.data.result.targets[0]?.outgoingCalls).toHaveLength(1);
      expect(request).toHaveBeenCalledTimes(5);
    });

    it('skips outgoing requests when direction is incoming', async () => {
      const { session, request } = createMockSession({
        requestImpl: (method) => {
          if (method === 'textDocument/prepareCallHierarchy') {
            return Promise.resolve([
              {
                name: 'target',
                kind: 12,
                uri: TEST_URI,
                range: {
                  start: { line: 4, character: 2 },
                  end: { line: 7, character: 1 },
                },
                selectionRange: {
                  start: { line: 4, character: 9 },
                  end: { line: 4, character: 20 },
                },
              },
            ]);
          }

          if (method === 'callHierarchy/incomingCalls') {
            return Promise.resolve([]);
          }

          return Promise.reject(new Error(`unexpected method ${method}`));
        },
      });

      const result = await callHierarchy(
        session,
        {
          filePath: TEST_FILE_PATH,
          position: createOneBasedPosition(5, 10),
          lspPosition: { line: 4, character: 9 },
        },
        'incoming'
      );

      expect(result.ok).toBe(true);

      if (!result.ok) {
        throw new Error('expected call hierarchy result');
      }

      expect(result.data.result.direction).toBe('incoming');
      expect(result.data.result.targets).toHaveLength(1);
      expect(result.data.result.targets[0]?.incomingCalls).toEqual([]);
      expect(result.data.result.targets[0]?.outgoingCalls).toBeNull();
      expect(request).toHaveBeenCalledTimes(2);
      expect(request).not.toHaveBeenCalledWith(
        'callHierarchy/outgoingCalls',
        expect.anything()
      );
    });

    it('skips incoming requests when direction is outgoing', async () => {
      const { session, request } = createMockSession({
        requestImpl: (method) => {
          if (method === 'textDocument/prepareCallHierarchy') {
            return Promise.resolve([
              {
                name: 'target',
                kind: 12,
                uri: TEST_URI,
                range: {
                  start: { line: 4, character: 2 },
                  end: { line: 7, character: 1 },
                },
                selectionRange: {
                  start: { line: 4, character: 9 },
                  end: { line: 4, character: 20 },
                },
              },
            ]);
          }

          if (method === 'callHierarchy/outgoingCalls') {
            return Promise.resolve([]);
          }

          return Promise.reject(new Error(`unexpected method ${method}`));
        },
      });

      const result = await callHierarchy(
        session,
        {
          filePath: TEST_FILE_PATH,
          position: createOneBasedPosition(5, 10),
          lspPosition: { line: 4, character: 9 },
        },
        'outgoing'
      );

      expect(result.ok).toBe(true);

      if (!result.ok) {
        throw new Error('expected call hierarchy result');
      }

      expect(result.data.result.direction).toBe('outgoing');
      expect(result.data.result.targets).toHaveLength(1);
      expect(result.data.result.targets[0]?.incomingCalls).toBeNull();
      expect(result.data.result.targets[0]?.outgoingCalls).toEqual([]);
      expect(request).toHaveBeenCalledTimes(2);
      expect(request).not.toHaveBeenCalledWith(
        'callHierarchy/incomingCalls',
        expect.anything()
      );
    });

    it.each<[null | []]>([[null], [[]]])(
      'returns no targets when prepareCallHierarchy returns %p',
      async (preparedItems) => {
        const { session, request } = createMockSession({
          requestImpl: (method) => {
            if (method === 'textDocument/prepareCallHierarchy') {
              return Promise.resolve(preparedItems);
            }

            return Promise.reject(new Error(`unexpected method ${method}`));
          },
        });

        const result = await callHierarchy(session, {
          filePath: TEST_FILE_PATH,
          position: createOneBasedPosition(5, 10),
          lspPosition: { line: 4, character: 9 },
        });

        expect(result.ok).toBe(true);

        if (!result.ok) {
          throw new Error('expected call hierarchy result');
        }

        expect(result.data.result.direction).toBe('both');
        expect(result.data.result.targets).toEqual([]);
        expect(request).toHaveBeenCalledTimes(1);
      }
    );
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

  it('rename also handles WorkspaceEdit.documentChanges responses', async () => {
    const { session } = createMockSession({
      requestImpl: () =>
        Promise.resolve({
          documentChanges: [
            {
              textDocument: {
                uri: TEST_URI,
                version: 1,
              },
              edits: [
                {
                  range: {
                    start: { line: 1, character: 2 },
                    end: { line: 1, character: 6 },
                  },
                  newText: 'Renamed',
                },
              ],
            },
          ],
        }),
    });

    const result = await rename(session, {
      filePath: TEST_FILE_PATH,
      position: createOneBasedPosition(2, 3),
      lspPosition: { line: 1, character: 2 },
      newName: 'Renamed',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.result).toEqual({
      [TEST_URI]: [
        {
          range: {
            start: { line: 1, character: 2 },
            end: { line: 1, character: 6 },
          },
          newText: 'Renamed',
          startLine: 2,
          startCharacter: 3,
          endLine: 2,
          endCharacter: 7,
        },
      ],
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
