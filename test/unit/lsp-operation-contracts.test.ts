import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  completion,
  findReferences,
  getDiagnostics,
  inspectSymbol,
  rename,
  searchSymbols,
} from '../../src/lsp/operations/operations.js';
import { createOneBasedPosition } from '../../src/types.js';
import { createZeroBasedPosition } from '../../src/types/position.js';
import type { Location, LocationLink } from 'vscode-languageserver-protocol';
import {
  createMockSession,
  TEST_FILE_PATH,
  TEST_URI,
} from './helpers/mock-lsp-session.js';

const LSP_LOCATION: Location = {
  uri: TEST_URI,
  range: {
    start: { line: 0, character: 0 },
    end: { line: 0, character: 6 },
  },
};
describe('LSP operation protocol contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each<{
    label: string;
    response: Location | Location[] | null;
    expected: Location[];
  }>([
    {
      label: 'a single Location',
      response: LSP_LOCATION,
      expected: [LSP_LOCATION],
    },
    {
      label: 'a Location array',
      response: [LSP_LOCATION],
      expected: [LSP_LOCATION],
    },
    { label: 'null', response: null, expected: [] },
  ])(
    'characterizes an inspect definition returned as $label',
    async ({ response, expected }) => {
      const { session } = createMockSession({
        requestImpl: (method) => {
          switch (method) {
            case 'textDocument/hover':
              return Promise.resolve(null);
            case 'textDocument/definition':
              return Promise.resolve(response);
            case 'textDocument/typeDefinition':
            case 'textDocument/implementation':
              return Promise.resolve(null);
            default:
              return Promise.reject(new Error(`unexpected method ${method}`));
          }
        },
      });

      const result = await inspectSymbol(session, {
        filePath: TEST_FILE_PATH,
        position: createOneBasedPosition(1, 1),
        lspPosition: createZeroBasedPosition(0, 0),
      });

      expect(result.result.definition).toEqual(expected);
    }
  );

  it('normalizes a LocationLink definition response', async () => {
    const link: LocationLink = {
      targetUri: TEST_URI,
      targetRange: {
        start: { line: 0, character: 0 },
        end: { line: 2, character: 1 },
      },
      targetSelectionRange: LSP_LOCATION.range,
    };
    const { session } = createMockSession({
      requestImpl: (method) => {
        switch (method) {
          case 'textDocument/hover':
            return Promise.resolve(null);
          case 'textDocument/definition':
            return Promise.resolve([link]);
          case 'textDocument/typeDefinition':
          case 'textDocument/implementation':
            return Promise.resolve(null);
          default:
            return Promise.reject(new Error(`unexpected method ${method}`));
        }
      },
    });

    const result = await inspectSymbol(session, {
      filePath: TEST_FILE_PATH,
      position: createOneBasedPosition(1, 1),
      lspPosition: createZeroBasedPosition(0, 0),
    });

    expect(result.result.definition).toEqual([LSP_LOCATION]);
  });

  it('normalizes a null references response to an empty list', async () => {
    const { session } = createMockSession({
      requestImpl: () => Promise.resolve(null),
    });

    const result = await findReferences(session, {
      filePath: TEST_FILE_PATH,
      position: createOneBasedPosition(1, 1),
      lspPosition: createZeroBasedPosition(0, 0),
    });

    expect(result.result).toEqual([]);
  });

  it.each([
    [
      'an item array',
      [
        {
          label: 'target',
          textEdit: { range: LSP_LOCATION.range, newText: 'target' },
        },
      ],
    ],
    [
      'a CompletionList',
      {
        isIncomplete: false,
        items: [
          {
            label: 'target',
            textEdit: { range: LSP_LOCATION.range, newText: 'target' },
          },
        ],
      },
    ],
  ])('normalizes completion returned as %s', async (_label, response) => {
    const { session } = createMockSession({
      requestImpl: () => Promise.resolve(response),
    });

    const result = await completion(session, {
      filePath: TEST_FILE_PATH,
      position: createOneBasedPosition(1, 1),
      lspPosition: createZeroBasedPosition(0, 0),
    });

    expect(result.result).toEqual([
      {
        label: 'target',
        kind: 1,
        detail: '',
        documentation: '',
        insertText: 'target',
        filterText: 'target',
        sortText: 'target',
        textEdit: {
          range: LSP_LOCATION.range,
          newText: 'target',
        },
      },
    ]);
  });

  it('normalizes a null completion response to an empty list', async () => {
    const { session } = createMockSession({
      requestImpl: () => Promise.resolve(null),
    });

    const result = await completion(session, {
      filePath: TEST_FILE_PATH,
      position: createOneBasedPosition(1, 1),
      lspPosition: createZeroBasedPosition(0, 0),
    });

    expect(result.result).toEqual([]);
  });

  it('normalizes a null workspace-symbol response to an empty list', async () => {
    const { session } = createMockSession({
      requestImpl: () => Promise.resolve(null),
      searchWarmupWindowMs: 0,
    });

    const result = await searchSymbols(session, { query: 'target' });

    expect(result).toEqual([]);
  });

  it('normalizes a range-less WorkspaceSymbol location', async () => {
    const { session } = createMockSession({
      requestImpl: () =>
        Promise.resolve([
          {
            name: 'target',
            kind: 12,
            location: { uri: TEST_URI },
          },
        ]),
      searchWarmupWindowMs: 0,
    });

    const result = await searchSymbols(session, { query: 'target' });

    expect(result).toEqual([
      {
        name: 'target',
        kind: 12,
        location: {
          uri: TEST_URI,
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 0 },
          },
        },
        containerName: '',
      },
    ]);
  });

  it('treats an unchanged pull-diagnostic report as no new diagnostics', async () => {
    const { session } = createMockSession({
      diagnosticsStrategy: 'pull',
      providers: [{ id: 'typescript' }],
      requestImpl: () =>
        Promise.resolve({ kind: 'unchanged', resultId: 'result-1' }),
    });

    const result = await getDiagnostics(session, {
      filePath: TEST_FILE_PATH,
    });

    expect(result).toEqual({ diagnostics: [], omittedCount: 0 });
  });

  it('normalizes a null rename response to no file changes', async () => {
    const { session } = createMockSession({
      requestImpl: () => Promise.resolve(null),
    });

    const result = await rename(session, {
      filePath: TEST_FILE_PATH,
      position: createOneBasedPosition(1, 1),
      lspPosition: createZeroBasedPosition(0, 0),
      newName: 'Renamed',
    });

    expect(result.result).toEqual({});
  });

  it('preserves the original request error on an operation failure', async () => {
    const cause = new Error('request failed');
    const { session } = createMockSession({
      requestImpl: () => Promise.reject(cause),
    });

    await expect(
      completion(session, {
        filePath: TEST_FILE_PATH,
        position: createOneBasedPosition(1, 1),
        lspPosition: createZeroBasedPosition(0, 0),
      })
    ).rejects.toMatchObject({ cause });
  });
});
