import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  type MockedFunction,
} from 'vitest';
import {
  inspectSymbol,
  searchSymbols,
  outlineSymbols,
  findReferences,
  completion,
  logs,
} from '../../src/lsp/operations/operations.js';
import {
  type LspContext,
  type SymbolPositionRequest,
  type SearchRequest,
  type FileRequest,
  type LogMessage,
  ValidationErrorCode,
} from '../../src/types.js';
import { createOneBasedPosition } from '../../src/types/position.js';
import type { TextDocumentPositionParams } from 'vscode-languageserver-protocol';

// =============================================================================
// GLOBAL MOCK SETUP
// =============================================================================

vi.mock('../../src/validation.js', () => ({
  validateSymbolPositionRequest: vi.fn(),
  validateFileRequest: vi.fn(),
  validateWorkspaceOperation: vi.fn(),
}));

vi.mock('../../src/lsp/file-lifecycle/index.js', () => ({
  executeWithCursorContext: vi.fn(),
  executeWithExplicitLifecycle: vi.fn(),
}));

vi.mock('../../src/types.js', async () => {
  const actual = await vi.importActual('../../src/types.js');
  return {
    ...actual,
    tryResult: vi.fn(),
    tryResultAsync: vi.fn(),
  };
});

import {
  validateSymbolPositionRequest,
  validateFileRequest,
  validateWorkspaceOperation,
} from '../../src/validation.js';
import {
  executeWithCursorContext,
  executeWithExplicitLifecycle,
} from '../../src/lsp/file-lifecycle/index.js';
import { tryResult, tryResultAsync } from '../../src/types.js';

// =============================================================================
// TYPED MOCK FUNCTIONS
// =============================================================================

const mockValidateSymbolPositionRequest =
  validateSymbolPositionRequest as MockedFunction<
    typeof validateSymbolPositionRequest
  >;
const mockValidateFileRequest = validateFileRequest as MockedFunction<
  typeof validateFileRequest
>;
const mockValidateWorkspaceOperation =
  validateWorkspaceOperation as MockedFunction<
    typeof validateWorkspaceOperation
  >;
const mockExecuteWithCursorContext = executeWithCursorContext as MockedFunction<
  typeof executeWithCursorContext
>;
const mockExecuteWithExplicitLifecycle =
  executeWithExplicitLifecycle as MockedFunction<
    typeof executeWithExplicitLifecycle
  >;
const mockTryResult = tryResult as MockedFunction<typeof tryResult>;
const mockTryResultAsync = tryResultAsync as MockedFunction<
  typeof tryResultAsync
>;

// =============================================================================
// TEST UTILITIES
// =============================================================================

interface MockConnection {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sendRequest: MockedFunction<(...args: any[]) => Promise<any>>;
}

function createMockContext(overrides: Partial<LspContext> = {}): LspContext {
  return {
    client: {
      connection: { sendRequest: vi.fn() } as MockConnection,
      isInitialized: true,
    } as LspContext['client'],
    preloadedFiles: new Map(),
    diagnosticsStore: {} as LspContext['diagnosticsStore'],
    diagnosticProviderStore: {} as LspContext['diagnosticProviderStore'],
    windowLogStore: { getMessages: vi.fn() } as LspContext['windowLogStore'],
    workspaceState: {
      isReady: true,
      isLoading: false,
      loadingStartedAt: undefined,
    },
    workspaceUri: 'file:///test/workspace',
    workspacePath: '/test/workspace',
    lspName: 'typescript',
    lspConfig: null,
    ...overrides,
  } as LspContext;
}

const TEST_CONSTANTS = {
  mockUri: 'file:///test/workspace/src/test.ts',
  testPosition: createOneBasedPosition(5, 10),
  testLargePosition: createOneBasedPosition(15, 25),
  testMinPosition: createOneBasedPosition(1, 1),
  workspacePath: '/test/workspace/src/test.ts',
  testFile: 'src/test.ts',
  nonExistentFile: 'nonexistent.ts',
} as const;

const VALIDATION_SUCCESS = {
  symbolPosition: {
    valid: true as const,
    absolutePath: TEST_CONSTANTS.workspacePath,
  },
  fileRequest: {
    valid: true as const,
    absolutePath: TEST_CONSTANTS.workspacePath,
  },
  workspaceOperation: { valid: true as const },
} as const;

const VALIDATION_ERRORS = {
  positionOutOfBounds: {
    valid: false as const,
    error: {
      errorCode: ValidationErrorCode.PositionOutOfBounds,
      message: 'Position out of bounds',
    },
  },
  workspaceNotReady: {
    valid: false as const,
    error: {
      errorCode: ValidationErrorCode.WorkspaceNotReady,
      message: 'Workspace not ready',
    },
  },
  invalidPath: {
    valid: false as const,
    error: {
      errorCode: ValidationErrorCode.InvalidPath,
      message: 'File not found',
    },
  },
} as const;

// =============================================================================
// TEST SUITES
// =============================================================================

describe('LSP Operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // INSPECT SYMBOL TESTS
  // ---------------------------------------------------------------------------
  describe('inspectSymbol', () => {
    it('should perform all inspection operations successfully', async () => {
      const ctx = createMockContext();
      const request: SymbolPositionRequest = {
        file: TEST_CONSTANTS.testFile,
        position: TEST_CONSTANTS.testPosition,
      };

      mockValidateSymbolPositionRequest.mockResolvedValue(
        VALIDATION_SUCCESS.symbolPosition
      );
      const mockConnection = ctx.client.connection as MockConnection;
      mockConnection.sendRequest.mockResolvedValue(null);

      mockExecuteWithCursorContext.mockImplementation(
        async (_op, _client, _path, _pos, _files, _strategy, callback) => {
          if (callback)
            return {
              ok: true,
              data: await callback(TEST_CONSTANTS.mockUri, undefined),
            };
          throw new Error('No callback provided');
        }
      );
      mockTryResultAsync.mockImplementation(async (fn) => await fn());

      await inspectSymbol(ctx, request);

      expect(mockValidateSymbolPositionRequest).toHaveBeenCalledWith(
        ctx,
        request
      );
      expect(mockConnection.sendRequest).toHaveBeenCalledTimes(4);

      const expectedParams: TextDocumentPositionParams = {
        textDocument: { uri: TEST_CONSTANTS.mockUri },
        position: { line: 4, character: 9 }, // Converted to 0-based
      };

      expect(mockConnection.sendRequest).toHaveBeenCalledWith(
        'textDocument/hover',
        expectedParams
      );
      expect(mockConnection.sendRequest).toHaveBeenCalledWith(
        'textDocument/definition',
        expectedParams
      );
      expect(mockConnection.sendRequest).toHaveBeenCalledWith(
        'textDocument/typeDefinition',
        expectedParams
      );
      expect(mockConnection.sendRequest).toHaveBeenCalledWith(
        'textDocument/implementation',
        expectedParams
      );
    });

    it('should handle validation errors', async () => {
      const ctx = createMockContext();
      const request: SymbolPositionRequest = {
        file: TEST_CONSTANTS.nonExistentFile,
        position: TEST_CONSTANTS.testMinPosition,
      };

      mockValidateSymbolPositionRequest.mockResolvedValue(
        VALIDATION_ERRORS.positionOutOfBounds
      );

      const result = await inspectSymbol(ctx, request);

      expect(result.ok).toBe(false);
      expect(mockValidateSymbolPositionRequest).toHaveBeenCalledWith(
        ctx,
        request
      );
      expect(mockExecuteWithCursorContext).not.toHaveBeenCalled();
    });

    it('should convert coordinates correctly for different positions', async () => {
      const ctx = createMockContext();
      const request: SymbolPositionRequest = {
        file: TEST_CONSTANTS.testFile,
        position: TEST_CONSTANTS.testLargePosition,
      };

      mockValidateSymbolPositionRequest.mockResolvedValue(
        VALIDATION_SUCCESS.symbolPosition
      );
      const mockConnection = ctx.client.connection as MockConnection;
      mockConnection.sendRequest.mockResolvedValue(null);

      mockExecuteWithCursorContext.mockImplementation(
        async (_op, _client, _path, _pos, _files, _strategy, callback) => {
          if (callback)
            return {
              ok: true,
              data: await callback(TEST_CONSTANTS.mockUri, undefined),
            };
          throw new Error('No callback provided');
        }
      );
      mockTryResultAsync.mockImplementation(async (fn) => await fn());

      await inspectSymbol(ctx, request);

      const expectedParams: TextDocumentPositionParams = {
        textDocument: { uri: TEST_CONSTANTS.mockUri },
        position: { line: 14, character: 24 }, // 15,25 -> 14,24 (1-based to 0-based)
      };

      expect(mockConnection.sendRequest).toHaveBeenCalledWith(
        'textDocument/hover',
        expectedParams
      );
    });

    it('should handle partial LSP failures gracefully', async () => {
      const ctx = createMockContext();
      const request: SymbolPositionRequest = {
        file: TEST_CONSTANTS.testFile,
        position: TEST_CONSTANTS.testMinPosition,
      };

      mockValidateSymbolPositionRequest.mockResolvedValue(
        VALIDATION_SUCCESS.symbolPosition
      );
      const mockConnection = ctx.client.connection as MockConnection;
      mockConnection.sendRequest
        .mockResolvedValueOnce({ contents: 'hover result' })
        .mockRejectedValueOnce(new Error('Definition failed'))
        .mockResolvedValueOnce(null)
        .mockRejectedValueOnce(new Error('Implementation failed'));

      mockExecuteWithCursorContext.mockImplementation(
        async (_op, _client, _path, _pos, _files, _strategy, callback) => {
          if (callback)
            return {
              ok: true,
              data: await callback(TEST_CONSTANTS.mockUri, undefined),
            };
          throw new Error('No callback provided');
        }
      );
      mockTryResultAsync.mockImplementation(async (fn) => await fn());

      await inspectSymbol(ctx, request);

      expect(mockConnection.sendRequest).toHaveBeenCalledTimes(4);
    });
  });

  // ---------------------------------------------------------------------------
  // SEARCH SYMBOLS TESTS
  // ---------------------------------------------------------------------------
  describe('searchSymbols', () => {
    it('should search workspace symbols successfully', async () => {
      const ctx = createMockContext();
      const request: SearchRequest = { query: 'TestClass' };

      mockValidateWorkspaceOperation.mockReturnValue(
        VALIDATION_SUCCESS.workspaceOperation
      );
      const mockConnection = ctx.client.connection as MockConnection;
      const mockSymbols = [
        {
          name: 'TestClass',
          kind: 5,
          location: { uri: 'file:///test.ts', range: {} },
        },
        {
          name: 'TestMethod',
          kind: 6,
          location: { uri: 'file:///test.ts', range: {} },
        },
      ];
      mockConnection.sendRequest.mockResolvedValue(mockSymbols);
      mockTryResultAsync.mockImplementation(async (fn) => await fn());

      await searchSymbols(ctx, request);

      expect(mockValidateWorkspaceOperation).toHaveBeenCalledWith(ctx);
      expect(mockConnection.sendRequest).toHaveBeenCalledWith(
        'workspace/symbol',
        { query: 'TestClass' }
      );
    });

    it('should handle workspace validation errors', async () => {
      const ctx = createMockContext();
      const request: SearchRequest = { query: 'TestClass' };

      mockValidateWorkspaceOperation.mockReturnValue(
        VALIDATION_ERRORS.workspaceNotReady
      );

      const result = await searchSymbols(ctx, request);

      expect(result.ok).toBe(false);
      expect(mockValidateWorkspaceOperation).toHaveBeenCalledWith(ctx);
    });

    it('should handle LSP request failures', async () => {
      const ctx = createMockContext();
      const request: SearchRequest = { query: 'TestClass' };

      mockValidateWorkspaceOperation.mockReturnValue(
        VALIDATION_SUCCESS.workspaceOperation
      );
      const mockConnection = ctx.client.connection as MockConnection;
      mockConnection.sendRequest.mockRejectedValue(
        new Error('LSP search failed')
      );

      mockTryResultAsync.mockImplementation(async (fn, errorHandler) => {
        try {
          return await fn();
        } catch (error) {
          if (errorHandler) throw errorHandler(error);
          throw error;
        }
      });

      await expect(searchSymbols(ctx, request)).rejects.toThrow(
        'Workspace symbol search failed: LSP search failed'
      );
      expect(mockConnection.sendRequest).toHaveBeenCalledWith(
        'workspace/symbol',
        { query: 'TestClass' }
      );
    });

    it('should handle various symbol types in results', async () => {
      const ctx = createMockContext();
      const request: SearchRequest = { query: 'test' };

      mockValidateWorkspaceOperation.mockReturnValue(
        VALIDATION_SUCCESS.workspaceOperation
      );
      const mockConnection = ctx.client.connection as MockConnection;
      const mockSymbols = [
        {
          name: 'TestClass',
          kind: 5,
          location: { uri: 'file:///test.ts', range: {} },
        },
        {
          name: 'testFunction',
          kind: 12,
          location: { uri: 'file:///utils.ts', range: {} },
        },
        {
          name: 'TEST_CONSTANT',
          kind: 14,
          location: { uri: 'file:///constants.ts', range: {} },
        },
      ];
      mockConnection.sendRequest.mockResolvedValue(mockSymbols);
      mockTryResultAsync.mockImplementation(async (fn) => await fn());

      await searchSymbols(ctx, request);

      expect(mockConnection.sendRequest).toHaveBeenCalledWith(
        'workspace/symbol',
        { query: 'test' }
      );
    });
  });

  // ---------------------------------------------------------------------------
  // READ SYMBOLS TESTS
  // ---------------------------------------------------------------------------
  describe('outline', () => {
    it('should get outline of symbols successfully', async () => {
      const ctx = createMockContext();
      const request: FileRequest = { file: TEST_CONSTANTS.testFile };

      mockValidateFileRequest.mockReturnValue(VALIDATION_SUCCESS.fileRequest);
      const mockConnection = ctx.client.connection as MockConnection;
      const mockSymbols = [
        {
          name: 'TestClass',
          kind: 5,
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 15 },
          },
          children: [],
        },
      ];
      mockConnection.sendRequest.mockResolvedValue(mockSymbols);

      mockExecuteWithExplicitLifecycle.mockImplementation(
        async (_client, _path, _files, _strategy, callback) => {
          if (callback)
            return { ok: true, data: await callback(TEST_CONSTANTS.mockUri) };
          throw new Error('No callback provided');
        }
      );
      mockTryResultAsync.mockImplementation(async (fn) => await fn());

      await outlineSymbols(ctx, request);

      expect(mockValidateFileRequest).toHaveBeenCalledWith(ctx, request);
      expect(mockConnection.sendRequest).toHaveBeenCalledWith(
        'textDocument/documentSymbol',
        {
          textDocument: { uri: TEST_CONSTANTS.mockUri },
        }
      );
    });

    it('should handle file validation errors', async () => {
      const ctx = createMockContext();
      const request: FileRequest = { file: TEST_CONSTANTS.nonExistentFile };

      mockValidateFileRequest.mockReturnValue(VALIDATION_ERRORS.invalidPath);

      const result = await outlineSymbols(ctx, request);

      expect(result.ok).toBe(false);
      expect(mockValidateFileRequest).toHaveBeenCalledWith(ctx, request);
      expect(mockExecuteWithExplicitLifecycle).not.toHaveBeenCalled();
    });

    it('should handle LSP request failures', async () => {
      const ctx = createMockContext();
      const request: FileRequest = { file: TEST_CONSTANTS.testFile };

      mockValidateFileRequest.mockReturnValue(VALIDATION_SUCCESS.fileRequest);
      const mockConnection = ctx.client.connection as MockConnection;
      mockConnection.sendRequest.mockRejectedValue(
        new Error('Document symbol request failed')
      );

      mockExecuteWithExplicitLifecycle.mockImplementation(
        async (_client, _path, _files, _strategy, callback) => {
          if (callback)
            return { ok: true, data: await callback(TEST_CONSTANTS.mockUri) };
          throw new Error('No callback provided');
        }
      );
      mockTryResultAsync.mockImplementation(async (fn, errorHandler) => {
        try {
          return await fn();
        } catch (error) {
          if (errorHandler) throw errorHandler(error);
          throw error;
        }
      });

      await expect(outlineSymbols(ctx, request)).rejects.toThrow(
        'Document symbol request failed: Document symbol request failed'
      );
      expect(mockConnection.sendRequest).toHaveBeenCalledWith(
        'textDocument/documentSymbol',
        {
          textDocument: { uri: TEST_CONSTANTS.mockUri },
        }
      );
    });

    it('should handle empty symbol responses', async () => {
      const ctx = createMockContext();
      const request: FileRequest = { file: 'src/empty.ts' };
      const mockUri = 'file:///test/workspace/src/empty.ts';

      mockValidateFileRequest.mockReturnValue({
        valid: true,
        absolutePath: '/test/workspace/src/empty.ts',
      });
      const mockConnection = ctx.client.connection as MockConnection;
      mockConnection.sendRequest.mockResolvedValue([]);

      mockExecuteWithExplicitLifecycle.mockImplementation(
        async (_client, _path, _files, _strategy, callback) => {
          if (callback) return { ok: true, data: await callback(mockUri) };
          throw new Error('No callback provided');
        }
      );
      mockTryResultAsync.mockImplementation(async (fn) => await fn());

      await outlineSymbols(ctx, request);

      expect(mockConnection.sendRequest).toHaveBeenCalledWith(
        'textDocument/documentSymbol',
        { textDocument: { uri: mockUri } }
      );
    });
  });

  // ---------------------------------------------------------------------------
  // FIND REFERENCES TESTS
  // ---------------------------------------------------------------------------
  describe('findReferences', () => {
    it('should find all symbol references successfully', async () => {
      const ctx = createMockContext();
      const request: SymbolPositionRequest = {
        file: TEST_CONSTANTS.testFile,
        position: TEST_CONSTANTS.testPosition,
      };

      mockValidateSymbolPositionRequest.mockResolvedValue(
        VALIDATION_SUCCESS.symbolPosition
      );
      const mockConnection = ctx.client.connection as MockConnection;
      const mockReferences = [
        {
          uri: 'file:///test/workspace/src/test.ts',
          range: {
            start: { line: 9, character: 14 },
            end: { line: 9, character: 24 },
          },
        },
        {
          uri: 'file:///test/workspace/src/other.ts',
          range: {
            start: { line: 5, character: 10 },
            end: { line: 5, character: 20 },
          },
        },
      ];
      mockConnection.sendRequest.mockResolvedValue(mockReferences);

      mockExecuteWithCursorContext.mockImplementation(
        async (_op, _client, _path, _pos, _files, _strategy, callback) => {
          if (callback)
            return {
              ok: true,
              data: await callback(TEST_CONSTANTS.mockUri, undefined),
            };
          throw new Error('No callback provided');
        }
      );
      mockTryResultAsync.mockImplementation(async (fn) => await fn());

      await findReferences(ctx, request);

      expect(mockValidateSymbolPositionRequest).toHaveBeenCalledWith(
        ctx,
        request
      );
      expect(mockConnection.sendRequest).toHaveBeenCalledWith(
        'textDocument/references',
        {
          textDocument: { uri: TEST_CONSTANTS.mockUri },
          position: { line: 4, character: 9 }, // Converted to 0-based
          context: { includeDeclaration: true },
        }
      );
    });

    it('should handle validation errors', async () => {
      const ctx = createMockContext();
      const request: SymbolPositionRequest = {
        file: TEST_CONSTANTS.nonExistentFile,
        position: TEST_CONSTANTS.testMinPosition,
      };

      mockValidateSymbolPositionRequest.mockResolvedValue(
        VALIDATION_ERRORS.positionOutOfBounds
      );

      const result = await findReferences(ctx, request);

      expect(result.ok).toBe(false);
      expect(mockValidateSymbolPositionRequest).toHaveBeenCalledWith(
        ctx,
        request
      );
      expect(mockExecuteWithCursorContext).not.toHaveBeenCalled();
    });

    it('should handle LSP request failures', async () => {
      const ctx = createMockContext();
      const request: SymbolPositionRequest = {
        file: TEST_CONSTANTS.testFile,
        position: TEST_CONSTANTS.testMinPosition,
      };

      mockValidateSymbolPositionRequest.mockResolvedValue(
        VALIDATION_SUCCESS.symbolPosition
      );
      const mockConnection = ctx.client.connection as MockConnection;
      mockConnection.sendRequest.mockRejectedValue(
        new Error('References failed')
      );

      mockExecuteWithCursorContext.mockImplementation(
        async (_op, _client, _path, _pos, _files, _strategy, callback) => {
          if (callback)
            return {
              ok: true,
              data: await callback(TEST_CONSTANTS.mockUri, undefined),
            };
          throw new Error('No callback provided');
        }
      );
      mockTryResultAsync.mockImplementation(async (fn, errorHandler) => {
        try {
          return await fn();
        } catch (error) {
          if (errorHandler) throw errorHandler(error);
          throw error;
        }
      });

      await expect(findReferences(ctx, request)).rejects.toThrow(
        'Find references failed: References failed'
      );
      expect(mockConnection.sendRequest).toHaveBeenCalledWith(
        'textDocument/references',
        {
          textDocument: { uri: TEST_CONSTANTS.mockUri },
          position: { line: 0, character: 0 }, // Converted to 0-based
          context: { includeDeclaration: true },
        }
      );
    });

    it('should handle empty references response', async () => {
      const ctx = createMockContext();
      const request: SymbolPositionRequest = {
        file: TEST_CONSTANTS.testFile,
        position: TEST_CONSTANTS.testMinPosition,
      };

      mockValidateSymbolPositionRequest.mockResolvedValue(
        VALIDATION_SUCCESS.symbolPosition
      );
      const mockConnection = ctx.client.connection as MockConnection;
      mockConnection.sendRequest.mockResolvedValue([]);

      mockExecuteWithCursorContext.mockImplementation(
        async (_op, _client, _path, _pos, _files, _strategy, callback) => {
          if (callback)
            return {
              ok: true,
              data: await callback(TEST_CONSTANTS.mockUri, undefined),
            };
          throw new Error('No callback provided');
        }
      );
      mockTryResultAsync.mockImplementation(async (fn) => await fn());

      await findReferences(ctx, request);

      expect(mockConnection.sendRequest).toHaveBeenCalledWith(
        'textDocument/references',
        {
          textDocument: { uri: TEST_CONSTANTS.mockUri },
          position: { line: 0, character: 0 }, // Converted to 0-based
          context: { includeDeclaration: true },
        }
      );
    });
  });

  // ---------------------------------------------------------------------------
  // COMPLETION TESTS
  // ---------------------------------------------------------------------------
  describe('completion', () => {
    it('should get completion suggestions successfully (array format)', async () => {
      const ctx = createMockContext();
      const request: SymbolPositionRequest = {
        file: TEST_CONSTANTS.testFile,
        position: TEST_CONSTANTS.testPosition,
      };

      mockValidateSymbolPositionRequest.mockResolvedValue(
        VALIDATION_SUCCESS.symbolPosition
      );
      const mockConnection = ctx.client.connection as MockConnection;
      const mockCompletions = [
        {
          label: 'testMethod',
          kind: 2,
          detail: 'string',
          documentation: 'A test method',
          insertText: 'testMethod()',
        },
        {
          label: 'testProperty',
          kind: 10,
          detail: 'number',
          documentation: 'A test property',
        },
      ];
      mockConnection.sendRequest.mockResolvedValue(mockCompletions);

      mockExecuteWithCursorContext.mockImplementation(
        async (_op, _client, _path, _pos, _files, _strategy, callback) => {
          if (callback)
            return {
              ok: true,
              data: await callback(TEST_CONSTANTS.mockUri, undefined),
            };
          throw new Error('No callback provided');
        }
      );
      mockTryResultAsync.mockImplementation(async (fn) => await fn());

      await completion(ctx, request);

      expect(mockValidateSymbolPositionRequest).toHaveBeenCalledWith(
        ctx,
        request
      );
      expect(mockConnection.sendRequest).toHaveBeenCalledWith(
        'textDocument/completion',
        {
          textDocument: { uri: TEST_CONSTANTS.mockUri },
          position: { line: 4, character: 9 }, // Converted to 0-based
          context: { triggerKind: 1 }, // CompletionTriggerKind.Invoked
        }
      );
    });

    it('should handle CompletionList response format', async () => {
      const ctx = createMockContext();
      const request: SymbolPositionRequest = {
        file: TEST_CONSTANTS.testFile,
        position: TEST_CONSTANTS.testMinPosition,
      };

      mockValidateSymbolPositionRequest.mockResolvedValue(
        VALIDATION_SUCCESS.symbolPosition
      );
      const mockConnection = ctx.client.connection as MockConnection;
      const mockCompletionList = {
        isIncomplete: false,
        items: [
          {
            label: 'testFunction',
            kind: 3,
            detail: 'void',
            documentation: 'A test function',
          },
        ],
      };
      mockConnection.sendRequest.mockResolvedValue(mockCompletionList);

      mockExecuteWithCursorContext.mockImplementation(
        async (_op, _client, _path, _pos, _files, _strategy, callback) => {
          if (callback)
            return {
              ok: true,
              data: await callback(TEST_CONSTANTS.mockUri, undefined),
            };
          throw new Error('No callback provided');
        }
      );
      mockTryResultAsync.mockImplementation(async (fn) => await fn());

      await completion(ctx, request);

      expect(mockConnection.sendRequest).toHaveBeenCalledWith(
        'textDocument/completion',
        {
          textDocument: { uri: TEST_CONSTANTS.mockUri },
          position: { line: 0, character: 0 }, // Converted to 0-based
          context: { triggerKind: 1 },
        }
      );
    });

    it('should handle validation errors', async () => {
      const ctx = createMockContext();
      const request: SymbolPositionRequest = {
        file: TEST_CONSTANTS.nonExistentFile,
        position: TEST_CONSTANTS.testMinPosition,
      };

      mockValidateSymbolPositionRequest.mockResolvedValue(
        VALIDATION_ERRORS.positionOutOfBounds
      );

      const result = await completion(ctx, request);

      expect(result.ok).toBe(false);
      expect(mockValidateSymbolPositionRequest).toHaveBeenCalledWith(
        ctx,
        request
      );
      expect(mockExecuteWithCursorContext).not.toHaveBeenCalled();
    });

    it('should handle LSP request failures', async () => {
      const ctx = createMockContext();
      const request: SymbolPositionRequest = {
        file: TEST_CONSTANTS.testFile,
        position: TEST_CONSTANTS.testMinPosition,
      };

      mockValidateSymbolPositionRequest.mockResolvedValue(
        VALIDATION_SUCCESS.symbolPosition
      );
      const mockConnection = ctx.client.connection as MockConnection;
      mockConnection.sendRequest.mockRejectedValue(
        new Error('Completion failed')
      );

      mockExecuteWithCursorContext.mockImplementation(
        async (_op, _client, _path, _pos, _files, _strategy, callback) => {
          if (callback)
            return {
              ok: true,
              data: await callback(TEST_CONSTANTS.mockUri, undefined),
            };
          throw new Error('No callback provided');
        }
      );
      mockTryResultAsync.mockImplementation(async (fn, errorHandler) => {
        try {
          return await fn();
        } catch (error) {
          if (errorHandler) throw errorHandler(error);
          throw error;
        }
      });

      await expect(completion(ctx, request)).rejects.toThrow(
        'Code completion failed: Completion failed'
      );
      expect(mockConnection.sendRequest).toHaveBeenCalledWith(
        'textDocument/completion',
        {
          textDocument: { uri: TEST_CONSTANTS.mockUri },
          position: { line: 0, character: 0 }, // Converted to 0-based
          context: { triggerKind: 1 },
        }
      );
    });

    it('should handle completion with text edits', async () => {
      const ctx = createMockContext();
      const request: SymbolPositionRequest = {
        file: TEST_CONSTANTS.testFile,
        position: TEST_CONSTANTS.testMinPosition,
      };

      mockValidateSymbolPositionRequest.mockResolvedValue(
        VALIDATION_SUCCESS.symbolPosition
      );
      const mockConnection = ctx.client.connection as MockConnection;
      const mockCompletions = [
        {
          label: 'complexCompletion',
          kind: 3,
          detail: 'string',
          documentation: { kind: 'markdown', value: 'A complex completion' },
          insertText: 'complexCompletion(${1:param})',
          textEdit: {
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 5 },
            }, // 0-based from LSP
            newText: 'complexCompletion(param)',
          },
        },
      ];
      mockConnection.sendRequest.mockResolvedValue(mockCompletions);

      mockExecuteWithCursorContext.mockImplementation(
        async (_op, _client, _path, _pos, _files, _strategy, callback) => {
          if (callback)
            return {
              ok: true,
              data: await callback(TEST_CONSTANTS.mockUri, undefined),
            };
          throw new Error('No callback provided');
        }
      );
      mockTryResultAsync.mockImplementation(async (fn) => await fn());

      await completion(ctx, request);

      // Verify the request was made - the key thing is that text edits are handled
      expect(mockConnection.sendRequest).toHaveBeenCalledWith(
        'textDocument/completion',
        {
          textDocument: { uri: TEST_CONSTANTS.mockUri },
          position: { line: 0, character: 0 }, // Converted to 0-based
          context: { triggerKind: 1 },
        }
      );
    });
  });

  // ---------------------------------------------------------------------------
  // LOGS TESTS
  // ---------------------------------------------------------------------------
  describe('logs', () => {
    it('should retrieve log messages from windowLogStore successfully', () => {
      const ctx = createMockContext();
      const mockLogMessages = [
        { type: 1, message: 'Error: Something went wrong' },
        { type: 2, message: 'Warning: Deprecated API used' },
        { type: 3, message: 'Info: Operation completed' },
      ];

      const mockWindowLogStore = ctx.windowLogStore as {
        getMessages: MockedFunction<() => LogMessage[]>;
      };
      mockWindowLogStore.getMessages.mockReturnValue(mockLogMessages);
      mockTryResult.mockImplementation((fn) => ({ ok: true, data: fn() }));

      const result = logs(ctx);

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data).toBe(mockLogMessages);
      expect(mockWindowLogStore.getMessages).toHaveBeenCalledTimes(1);
      expect(mockTryResult).toHaveBeenCalledWith(
        expect.any(Function),
        expect.any(Function)
      );
    });

    it('should handle empty log messages', () => {
      const ctx = createMockContext();
      const emptyMessages: never[] = [];

      const mockWindowLogStore = ctx.windowLogStore as {
        getMessages: MockedFunction<() => LogMessage[]>;
      };
      mockWindowLogStore.getMessages.mockReturnValue(emptyMessages);
      mockTryResult.mockImplementation((fn) => ({ ok: true, data: fn() }));

      const result = logs(ctx);

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data).toEqual([]);
      expect(mockWindowLogStore.getMessages).toHaveBeenCalledTimes(1);
    });

    it('should handle windowLogStore errors gracefully', () => {
      const ctx = createMockContext();

      const mockWindowLogStore = ctx.windowLogStore as {
        getMessages: MockedFunction<() => LogMessage[]>;
      };
      mockWindowLogStore.getMessages.mockImplementation(() => {
        throw new Error('WindowLogStore access failed');
      });
      mockTryResult.mockImplementation((fn, errorHandler) => {
        try {
          return { ok: true, data: fn() };
        } catch (error) {
          if (errorHandler) return { ok: false, error: errorHandler(error) };
          throw error;
        }
      });

      const result = logs(ctx);

      expect(result.ok).toBe(false);
      expect(mockWindowLogStore.getMessages).toHaveBeenCalledTimes(1);
      expect(mockTryResult).toHaveBeenCalledWith(
        expect.any(Function),
        expect.any(Function)
      );
    });

    it('should pass different log message types correctly', () => {
      const ctx = createMockContext();
      const mixedLogMessages = [
        { type: 1, message: 'Error message' },
        { type: 2, message: 'Warning message' },
        { type: 3, message: 'Info message' },
        { type: 4, message: 'Log message' },
      ];

      const mockWindowLogStore = ctx.windowLogStore as {
        getMessages: MockedFunction<() => LogMessage[]>;
      };
      mockWindowLogStore.getMessages.mockReturnValue(mixedLogMessages);
      mockTryResult.mockImplementation((fn) => ({ ok: true, data: fn() }));

      const result = logs(ctx);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toHaveLength(4);
        expect(result.data[0]).toEqual({ type: 1, message: 'Error message' });
        expect(result.data[1]).toEqual({ type: 2, message: 'Warning message' });
        expect(result.data[2]).toEqual({ type: 3, message: 'Info message' });
        expect(result.data[3]).toEqual({ type: 4, message: 'Log message' });
      }
    });
  });
});
