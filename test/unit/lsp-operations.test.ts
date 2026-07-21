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
import { createZeroBasedPosition } from '../../src/types/position.js';
import { DIAGNOSTICS_MAX_ENTRIES } from '../../src/utils/diagnostics.js';
import {
  createMockSession,
  TEST_FILE_PATH,
  TEST_URI,
} from './helpers/mock-lsp-session.js';

describe('LSP operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inspectSymbol sends the expected LSP requests from the resolved target', async () => {
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

    await inspectSymbol(session, {
      filePath: TEST_FILE_PATH,
      position: createOneBasedPosition(5, 10),
      lspPosition: createZeroBasedPosition(4, 9),
    });

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

    await findReferences(session, {
      filePath: TEST_FILE_PATH,
      position: createOneBasedPosition(3, 4),
      lspPosition: createZeroBasedPosition(2, 3),
    });

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
        lspPosition: createZeroBasedPosition(4, 9),
      });

      expect(request).toHaveBeenCalledWith(
        'textDocument/prepareCallHierarchy',
        {
          textDocument: { uri: TEST_URI },
          position: { line: 4, character: 9 },
        }
      );

      expect(result.result.direction).toBe('both');
      expect(result.result.targets).toHaveLength(2);
      expect(result.result.targets[0]?.incomingCalls).toHaveLength(1);
      expect(result.result.targets[0]?.outgoingCalls).toHaveLength(1);
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
          lspPosition: createZeroBasedPosition(4, 9),
        },
        'incoming'
      );

      expect(result.result.direction).toBe('incoming');
      expect(result.result.targets).toHaveLength(1);
      expect(result.result.targets[0]?.incomingCalls).toEqual([]);
      expect(result.result.targets[0]?.outgoingCalls).toBeNull();
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
          lspPosition: createZeroBasedPosition(4, 9),
        },
        'outgoing'
      );

      expect(result.result.direction).toBe('outgoing');
      expect(result.result.targets).toHaveLength(1);
      expect(result.result.targets[0]?.incomingCalls).toBeNull();
      expect(result.result.targets[0]?.outgoingCalls).toEqual([]);
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
          lspPosition: createZeroBasedPosition(4, 9),
        });

        expect(result.result.direction).toBe('both');
        expect(result.result.targets).toEqual([]);
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

    await completion(session, {
      filePath: TEST_FILE_PATH,
      position: createOneBasedPosition(1, 1),
      lspPosition: createZeroBasedPosition(0, 0),
    });

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

    await searchSymbols(session, {
      query: 'TestClass',
    });

    expect(request).toHaveBeenCalledWith('workspace/symbol', {
      query: 'TestClass',
    });
  });

  it('searchSymbols retries empty results during the search warm-up window', async () => {
    vi.useFakeTimers();

    try {
      vi.setSystemTime(new Date('2026-04-10T07:31:13.000Z'));

      const requestResponses = [
        [],
        [
          {
            name: 'registerAllTools',
            kind: 12,
            location: {
              uri: TEST_URI,
              range: {
                start: { line: 20, character: 0 },
                end: { line: 20, character: 16 },
              },
            },
          },
        ],
      ];

      const { session, request } = createMockSession({
        requestImpl: () => Promise.resolve(requestResponses.shift() ?? []),
        workspaceState: {
          isReady: true,
          isLoading: false,
          readyAt: new Date('2026-04-10T07:31:12.500Z'),
        },
        searchWarmupWindowMs: 5000,
      });

      const resultPromise = searchSymbols(session, {
        query: 'registerAllTools',
      });

      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toHaveLength(1);
      expect(request).toHaveBeenCalledTimes(2);
      expect(request).toHaveBeenNthCalledWith(1, 'workspace/symbol', {
        query: 'registerAllTools',
      });
      expect(request).toHaveBeenNthCalledWith(2, 'workspace/symbol', {
        query: 'registerAllTools',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('searchSymbols does not retry empty results after the warm-up window expires', async () => {
    vi.useFakeTimers();

    try {
      vi.setSystemTime(new Date('2026-04-10T07:31:20.000Z'));

      const { session, request } = createMockSession({
        requestImpl: () => Promise.resolve([]),
        workspaceState: {
          isReady: true,
          isLoading: false,
          readyAt: new Date('2026-04-10T07:31:10.000Z'),
        },
        searchWarmupWindowMs: 5000,
      });

      const result = await searchSymbols(session, {
        query: 'MissingSymbol',
      });

      expect(result).toHaveLength(0);
      expect(request).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('searchSymbols does not retry when workspace readiness has no timestamp', async () => {
    const { session, request } = createMockSession({
      requestImpl: () => Promise.resolve([]),
      workspaceState: {
        isReady: true,
        isLoading: false,
      },
      searchWarmupWindowMs: 5000,
    });

    const result = await searchSymbols(session, {
      query: 'MissingSymbol',
    });

    expect(result).toHaveLength(0);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('searchSymbols does not retry when the warm-up window is disabled', async () => {
    const { session, request } = createMockSession({
      requestImpl: () => Promise.resolve([]),
      workspaceState: {
        isReady: true,
        isLoading: false,
        readyAt: new Date('2026-04-10T07:31:12.500Z'),
      },
      searchWarmupWindowMs: 0,
    });

    const result = await searchSymbols(session, {
      query: 'MissingSymbol',
    });

    expect(result).toHaveLength(0);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('searchSymbols returns empty after exhausting warm-up retries', async () => {
    vi.useFakeTimers();

    try {
      vi.setSystemTime(new Date('2026-04-10T07:31:13.000Z'));

      const { session, request } = createMockSession({
        requestImpl: () => Promise.resolve([]),
        workspaceState: {
          isReady: true,
          isLoading: false,
          readyAt: new Date('2026-04-10T07:31:12.500Z'),
        },
        searchWarmupWindowMs: 5000,
      });

      const resultPromise = searchSymbols(session, {
        query: 'MissingSymbol',
      });

      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toHaveLength(0);
      expect(request).toHaveBeenCalledTimes(5);
    } finally {
      vi.useRealTimers();
    }
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

    await outlineSymbols(session, {
      filePath: TEST_FILE_PATH,
    });

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
              message: { kind: 'markdown', value: '**problem**' },
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

    expect(result).toMatchObject({
      diagnostics: [{ message: '**problem**' }],
      omittedCount: 0,
    });
    expect(request).toHaveBeenCalledWith('textDocument/diagnostic', {
      textDocument: { uri: TEST_URI },
      identifier: 'roslyn',
    });
  });

  it('getDiagnostics respects the configured push diagnostics timeout', async () => {
    vi.useFakeTimers();

    try {
      const { session, diagnosticsStore } = createMockSession({
        diagnosticsStrategy: 'push',
        diagnosticsWaitTimeoutMs: 1200,
      });

      const resultPromise = getDiagnostics(session, {
        filePath: TEST_FILE_PATH,
      });

      await vi.advanceTimersByTimeAsync(1199);
      expect(diagnosticsStore.getDiagnostics).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      const result = await resultPromise;

      expect(result).toEqual({ diagnostics: [], omittedCount: 0 });
      expect(diagnosticsStore.getDiagnostics).toHaveBeenCalledWith(TEST_URI);
    } finally {
      vi.useRealTimers();
    }
  });

  it('bounds pull diagnostics across providers before mapping them', async () => {
    const items = Array.from(
      { length: DIAGNOSTICS_MAX_ENTRIES + 2 },
      (_, index) => ({
        code: `TS${index}`,
        message: index === 0 ? 'x'.repeat(10_000) : `problem-${index}`,
        severity: 1,
        range: {
          start: { line: index, character: 0 },
          end: { line: index, character: 1 },
        },
        source: 'typescript',
      })
    );
    const { session } = createMockSession({
      diagnosticsStrategy: 'pull',
      providers: [{ id: 'typescript' }],
      requestImpl: () => Promise.resolve({ kind: 'full', items }),
    });

    const result = await getDiagnostics(session, {
      filePath: TEST_FILE_PATH,
    });

    expect(result.diagnostics).toHaveLength(DIAGNOSTICS_MAX_ENTRIES);
    expect(result.diagnostics[0]?.message.length).toBe(2_000);
    expect(result.omittedCount).toBe(2);
  });

  it('rename uses the resolved target and returns workspace edits', async () => {
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

    await rename(session, {
      filePath: TEST_FILE_PATH,
      position: createOneBasedPosition(1, 1),
      lspPosition: createZeroBasedPosition(0, 0),
      newName: 'Renamed',
    });

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
      lspPosition: createZeroBasedPosition(1, 2),
      newName: 'Renamed',
    });

    expect(result.result).toEqual({
      [TEST_URI]: [
        {
          range: {
            start: { line: 1, character: 2 },
            end: { line: 1, character: 6 },
          },
          newText: 'Renamed',
        },
      ],
    });
  });

  it('rename rejects snippet edits before they can be written as raw text', async () => {
    const { session } = createMockSession({
      requestImpl: () =>
        Promise.resolve({
          documentChanges: [
            {
              textDocument: { uri: TEST_URI, version: 1 },
              edits: [
                {
                  range: {
                    start: { line: 1, character: 2 },
                    end: { line: 1, character: 6 },
                  },
                  snippet: { kind: 'snippet', value: '${1:Renamed}' },
                },
              ],
            },
          ],
        }),
    });

    await expect(
      rename(session, {
        filePath: TEST_FILE_PATH,
        position: createOneBasedPosition(2, 3),
        lspPosition: createZeroBasedPosition(1, 2),
        newName: 'Renamed',
      })
    ).rejects.toThrow(
      'unsupported snippet edit for file:///test/workspace/src/test.ts'
    );
  });

  it('rename rejects resource operations before returning any text edits', async () => {
    const { session } = createMockSession({
      requestImpl: () =>
        Promise.resolve({
          documentChanges: [
            {
              textDocument: { uri: TEST_URI, version: 1 },
              edits: [
                {
                  range: {
                    start: { line: 0, character: 0 },
                    end: { line: 0, character: 4 },
                  },
                  newText: 'Renamed',
                },
              ],
            },
            {
              kind: 'rename',
              oldUri: TEST_URI,
              newUri: 'file:///test/workspace/src/renamed.ts',
            },
          ],
        }),
    });

    await expect(
      rename(session, {
        filePath: TEST_FILE_PATH,
        position: createOneBasedPosition(1, 1),
        lspPosition: createZeroBasedPosition(0, 0),
        newName: 'Renamed',
      })
    ).rejects.toThrow(
      "unsupported file operation 'rename'; no files were changed"
    );
  });

  it('logs returns messages from the window log store', () => {
    const messages: LogMessage[] = [
      { type: 1, message: 'Error' },
      { type: 3, message: 'Info' },
    ];
    const { session } = createMockSession({
      logMessages: messages,
    });

    expect(logs(session)).toEqual(messages);
  });
});
