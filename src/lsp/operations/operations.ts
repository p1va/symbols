/**
 * Public LspOperations - the 8 MCP tools that correspond to actual MCP functionality
 * These are the only functions exported from this module
 */

import {
  LspContext,
  Result,
  SymbolPositionRequest,
  FileRequest,
  SearchRequest,
  RenameRequest,
  createLspError,
  ErrorCode,
  ValidationError,
  ValidationErrorCode,
  toZeroBased,
} from '../../types.js';
import {
  parseDocumentSymbolResponse,
  SymbolInformation,
  DocumentSymbol,
  TextDocumentPositionParams,
  ReferenceParams,
  CompletionParams,
  DocumentSymbolParams,
  WorkspaceSymbolParams,
  RenameParams,
  Hover,
  Location,
  CompletionList,
  CompletionItem,
  WorkspaceEdit,
  WorkspaceSymbol,
  // Internal result types
  SymbolReference,
  SymbolInspection,
  CompletionResult,
  SymbolSearchResult,
  DocumentSymbolResult,
  RenameResult,
  LogMessageResult,
  DisplayRange,
} from '../../types/lsp.js';
import {
  validateSymbolPositionRequest,
  validateFileRequest,
  validateWorkspaceOperation,
} from '../../validation.js';
import {
  executeWithExplicitLifecycle,
  executeWithCursorContext,
  OperationWithContextResult,
} from '../fileLifecycle/index.js';

// Helper to convert ValidationError to LspOperationError
function validationErrorToLspError(validationError: ValidationError) {
  // Convert ValidationErrorCode to ErrorCode where possible
  let errorCode: ErrorCode;
  switch (validationError.errorCode) {
    case ErrorCode.FileNotFound:
      errorCode = ErrorCode.FileNotFound;
      break;
    case ValidationErrorCode.InvalidPath:
    case ValidationErrorCode.PositionOutOfBounds:
      errorCode = ErrorCode.InvalidPosition;
      break;
    case ValidationErrorCode.WorkspaceNotReady:
      errorCode = ErrorCode.WorkspaceLoadInProgress;
      break;
    default:
      errorCode = ErrorCode.LSPError;
      break;
  }
  return createLspError(
    errorCode,
    validationError.message,
    validationError.originalError
  );
}

// The 8 MCP tools we need to implement:

export async function inspectSymbol(
  ctx: LspContext,
  request: SymbolPositionRequest
): Promise<Result<OperationWithContextResult<SymbolInspection>>> {
  // Validate request
  const validation = await validateSymbolPositionRequest(ctx, request);
  if (!validation.valid) {
    return {
      success: false,
      error: validationErrorToLspError(validation.error),
    };
  }

  const { client, preloadedFiles } = ctx;
  const filePath = validation.absolutePath!;
  const oneBasedPosition = request.position;

  return await executeWithCursorContext(
    'inspect',
    client,
    filePath,
    oneBasedPosition,
    preloadedFiles,
    'respect_existing',
    async (uri) => {
      try {
        // Convert to 0-based position for LSP
        const lspPosition = toZeroBased(oneBasedPosition);

        // Create typed LSP request parameters
        const positionParams: TextDocumentPositionParams = {
          textDocument: { uri },
          position: lspPosition,
        };

        // Send multiple LSP requests for comprehensive symbol information
        const [
          hoverResult,
          definitionResult,
          typeDefinitionResult,
          implementationResult,
        ] = await Promise.allSettled([
          client.connection.sendRequest(
            'textDocument/hover',
            positionParams
          ) as Promise<Hover>,
          client.connection.sendRequest(
            'textDocument/definition',
            positionParams
          ) as Promise<Location | Location[]>,
          client.connection.sendRequest(
            'textDocument/typeDefinition',
            positionParams
          ) as Promise<Location | Location[]>,
          client.connection.sendRequest(
            'textDocument/implementation',
            positionParams
          ) as Promise<Location | Location[]>,
        ]);

        const inspectData: SymbolInspection = {
          hover: hoverResult.status === 'fulfilled' ? hoverResult.value : null,
          definition:
            definitionResult.status === 'fulfilled'
              ? definitionResult.value
              : null,
          typeDefinition:
            typeDefinitionResult.status === 'fulfilled'
              ? typeDefinitionResult.value
              : null,
          implementation:
            implementationResult.status === 'fulfilled'
              ? implementationResult.value
              : null,
        };

        // Transform locations back to 1-based coordinates for user display
        const transformLocations = (locations: any) => {
          if (!Array.isArray(locations)) return locations;
          return locations.map((loc) => ({
            ...loc,
            range: {
              ...loc.range,
              start: {
                line: loc.range.start.line + 1,
                character: loc.range.start.character + 1,
              },
              end: {
                line: loc.range.end.line + 1,
                character: loc.range.end.character + 1,
              },
            },
          }));
        };

        inspectData.definition = transformLocations(inspectData.definition);
        inspectData.typeDefinition = transformLocations(
          inspectData.typeDefinition
        );
        inspectData.implementation = transformLocations(
          inspectData.implementation
        );

        return { success: true, data: inspectData };
      } catch (error) {
        return {
          success: false,
          error: createLspError(
            ErrorCode.LSPError,
            `Inspect symbol failed: ${error instanceof Error ? error.message : String(error)}`,
            error instanceof Error ? error : undefined
          ),
        };
      }
    }
  );
}

export async function findReferences(
  ctx: LspContext,
  request: SymbolPositionRequest
): Promise<Result<OperationWithContextResult<SymbolReference[]>>> {
  // Validate request
  const validation = await validateSymbolPositionRequest(ctx, request);
  if (!validation.valid) {
    return {
      success: false,
      error: validationErrorToLspError(validation.error),
    };
  }

  const { client, preloadedFiles } = ctx;
  const filePath = validation.absolutePath!;
  const oneBasedPosition = request.position;

  return await executeWithCursorContext(
    'references',
    client,
    filePath,
    oneBasedPosition,
    preloadedFiles,
    'respect_existing',
    async (uri) => {
      try {
        // Convert to 0-based position for LSP
        const lspPosition = toZeroBased(oneBasedPosition);

        // Send textDocument/references request to LSP
        const params: ReferenceParams = {
          textDocument: { uri },
          position: lspPosition,
          context: {
            includeDeclaration: true,
          },
        };

        const references = (await client.connection.sendRequest(
          'textDocument/references',
          params
        )) as Location[];

        if (!Array.isArray(references)) {
          return { success: true, data: [] };
        }

        // Transform LSP response to our format
        const results: SymbolReference[] = references.map((ref) => ({
          uri: ref.uri,
          range: ref.range,
          // Convert back to 1-based for user display
          line: ref.range.start.line + 1,
          character: ref.range.start.character + 1,
        }));

        return { success: true, data: results };
      } catch (error) {
        return {
          success: false,
          error: createLspError(
            ErrorCode.LSPError,
            `Find references failed: ${error instanceof Error ? error.message : String(error)}`,
            error instanceof Error ? error : undefined
          ),
        };
      }
    }
  );
}

export async function completion(
  ctx: LspContext,
  request: SymbolPositionRequest
): Promise<Result<OperationWithContextResult<CompletionResult[]>>> {
  // Validate request
  const validation = await validateSymbolPositionRequest(ctx, request);
  if (!validation.valid) {
    return {
      success: false,
      error: validationErrorToLspError(validation.error),
    };
  }

  const { client, preloadedFiles } = ctx;
  const filePath = validation.absolutePath!;
  const oneBasedPosition = request.position;

  return await executeWithCursorContext(
    'completion',
    client,
    filePath,
    oneBasedPosition,
    preloadedFiles,
    'respect_existing',
    async (uri) => {
      try {
        // Convert to 0-based position for LSP
        const lspPosition = toZeroBased(oneBasedPosition);

        // Send textDocument/completion request to LSP
        const params: CompletionParams = {
          textDocument: { uri },
          position: lspPosition,
          context: {
            triggerKind: 2,
          },
        };

        const completionResult = (await client.connection.sendRequest(
          'textDocument/completion',
          params
        )) as CompletionList | CompletionItem[];

        let completions: CompletionItem[] = [];

        if (Array.isArray(completionResult)) {
          completions = completionResult;
        } else if (
          completionResult &&
          typeof completionResult === 'object' &&
          'items' in completionResult
        ) {
          // CompletionList format
          const items = (completionResult as any).items;
          if (Array.isArray(items)) {
            completions = items;
          }
        }

        // Transform LSP completion items to our format
        const results: CompletionResult[] = completions.map((item) => ({
          label: item.label,
          kind: item.kind || 1, // Default to Text if kind is undefined
          detail: item.detail || '',
          documentation: item.documentation || '',
          insertText: item.insertText || item.label,
          filterText: item.filterText || item.label,
          sortText: item.sortText || item.label,
          ...(item.textEdit && 'range' in item.textEdit
            ? {
                textEdit: {
                  newText: item.textEdit.newText,
                  range: {
                    start: {
                      line: item.textEdit.range.start.line + 1,
                      character: item.textEdit.range.start.character + 1,
                    },
                    end: {
                      line: item.textEdit.range.end.line + 1,
                      character: item.textEdit.range.end.character + 1,
                    },
                  },
                },
              }
            : {}),
        }));

        return { success: true, data: results };
      } catch (error) {
        return {
          success: false,
          error: createLspError(
            ErrorCode.LSPError,
            `Code completion failed: ${error instanceof Error ? error.message : String(error)}`,
            error instanceof Error ? error : undefined
          ),
        };
      }
    }
  );
}

export async function searchSymbols(
  ctx: LspContext,
  request: SearchRequest
): Promise<Result<SymbolSearchResult[]>> {
  // Validate workspace readiness
  const validation = validateWorkspaceOperation(ctx);
  if (!validation.valid) {
    return {
      success: false,
      error: validationErrorToLspError(validation.error),
    };
  }

  const { client } = ctx;

  try {
    // Send workspace symbol request to LSP
    const params: WorkspaceSymbolParams = {
      query: request.query,
    };

    const symbols = (await client.connection.sendRequest(
      'workspace/symbol',
      params
    )) as WorkspaceSymbol[] | SymbolInformation[];

    // Transform LSP response to our format
    const results: SymbolSearchResult[] = Array.isArray(symbols)
      ? symbols.map((symbol) => {
          // Handle both WorkspaceSymbol and SymbolInformation
          if (
            'location' in symbol &&
            symbol.location &&
            'range' in symbol.location
          ) {
            // SymbolInformation
            return {
              name: symbol.name,
              kind: symbol.kind,
              location: {
                uri: symbol.location.uri,
                range: symbol.location.range,
              },
              containerName: symbol.containerName || '',
            };
          } else {
            // WorkspaceSymbol - has no location directly
            return {
              name: symbol.name,
              kind: symbol.kind,
              location: {
                uri: (symbol as any).uri || '',
                range: (symbol as any).range || {
                  start: { line: 0, character: 0 },
                  end: { line: 0, character: 0 },
                },
              },
              containerName: symbol.containerName || '',
            };
          }
        })
      : [];

    return { success: true, data: results };
  } catch (error) {
    return {
      success: false,
      error: createLspError(
        ErrorCode.LSPError,
        `Workspace symbol search failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      ),
    };
  }
}

export async function readSymbols(
  ctx: LspContext,
  request: FileRequest
): Promise<Result<any>> {
  // Validate request
  const validation = await validateFileRequest(ctx, request);
  if (!validation.valid) {
    return {
      success: false,
      error: validationErrorToLspError(validation.error),
    };
  }

  const { client, preloadedFiles } = ctx;

  // Use absolute path from validation
  const filePath = validation.absolutePath!;

  // Execute with explicit file lifecycle management
  return await executeWithExplicitLifecycle(
    client,
    filePath,
    preloadedFiles,
    'respect_existing', // Don't close preloaded files, close temporary ones
    async (uri): Promise<Result<any>> => {
      try {
        // Send textDocument/documentSymbol request
        const params: DocumentSymbolParams = {
          textDocument: {
            uri: uri,
          },
        };

        const rawSymbols = (await client.connection.sendRequest(
          'textDocument/documentSymbol',
          params
        )) as DocumentSymbol[] | SymbolInformation[];

        // Use typed parser to handle both SymbolInformation[] and DocumentSymbol[]
        const symbolResult = parseDocumentSymbolResponse(rawSymbols);

        if (symbolResult.type === 'symbolInformation') {
          // SymbolInformation format - flatten and return with proper typing
          const results = symbolResult.symbols.map(
            (symbol: SymbolInformation) => ({
              name: symbol.name,
              kind: symbol.kind,
              range: symbol.location.range,
              containerName: symbol.containerName || '',
              uri: symbol.location.uri,
              deprecated: symbol.deprecated,
            })
          );
          return { success: true, data: symbolResult };
        } else {
          // DocumentSymbol format - flatten nested symbols
          const results: any[] = [];

          function flattenDocumentSymbols(
            symbols: DocumentSymbol[],
            container?: string
          ) {
            for (const symbol of symbols) {
              results.push({
                name: symbol.name,
                kind: symbol.kind,
                range: symbol.range,
                selectionRange: symbol.selectionRange,
                detail: symbol.detail,
                containerName: container,
                deprecated: symbol.deprecated,
              });

              if (symbol.children) {
                flattenDocumentSymbols(symbol.children, symbol.name);
              }
            }
          }

          flattenDocumentSymbols(symbolResult.symbols);
          return { success: true, data: symbolResult };
        }
      } catch (error) {
        return {
          success: false,
          error: createLspError(
            ErrorCode.LSPError,
            `Document symbol request failed: ${error instanceof Error ? error.message : String(error)}`,
            error instanceof Error ? error : undefined
          ),
        };
      }
    }
  );
}

export async function getDiagnostics(
  ctx: LspContext,
  request: FileRequest
): Promise<Result<any[]>> {
  // Validate request
  const validation = await validateFileRequest(ctx, request);
  if (!validation.valid) {
    return {
      success: false,
      error: validationErrorToLspError(validation.error),
    };
  }

  // const { client, diagnosticsStore, preloadedFiles } = ctx;
  // TODO: Implement get errors/warnings for a file
  return {
    success: false,
    error: createLspError(ErrorCode.LSPError, 'Not implemented yet'),
  };
}

export async function rename(
  ctx: LspContext,
  request: RenameRequest
): Promise<Result<OperationWithContextResult<RenameResult>>> {
  // Validate request (RenameRequest extends SymbolPositionRequest)
  const validation = await validateSymbolPositionRequest(ctx, request);
  if (!validation.valid) {
    return {
      success: false,
      error: validationErrorToLspError(validation.error),
    };
  }

  const { client, preloadedFiles } = ctx;
  const filePath = validation.absolutePath!;
  const oneBasedPosition = request.position;

  return await executeWithCursorContext(
    'rename',
    client,
    filePath,
    oneBasedPosition,
    preloadedFiles,
    'respect_existing',
    async (uri) => {
      try {
        // Convert to 0-based position for LSP
        const lspPosition = toZeroBased(oneBasedPosition);

        // Send textDocument/rename request to LSP
        const params: RenameParams = {
          textDocument: { uri },
          position: lspPosition,
          newName: request.newName,
        };

        const workspaceEdit = (await client.connection.sendRequest(
          'textDocument/rename',
          params
        )) as WorkspaceEdit;

        if (
          !workspaceEdit ||
          typeof workspaceEdit !== 'object' ||
          !('changes' in workspaceEdit) ||
          !workspaceEdit.changes
        ) {
          return { success: true, data: {} };
        }

        // Transform LSP WorkspaceEdit response to our format
        const changes: RenameResult = {};
        const workspaceChanges = workspaceEdit.changes as Record<string, any[]>;
        for (const [fileUri, edits] of Object.entries(workspaceChanges)) {
          changes[fileUri] = (edits as any[]).map((edit) => ({
            range: edit.range,
            newText: edit.newText,
            // Convert positions back to 1-based for user display
            startLine: edit.range.start.line + 1,
            startCharacter: edit.range.start.character + 1,
            endLine: edit.range.end.line + 1,
            endCharacter: edit.range.end.character + 1,
          }));
        }

        return {
          success: true,
          data: changes,
        };
      } catch (error) {
        return {
          success: false,
          error: createLspError(
            ErrorCode.LSPError,
            `Rename symbol failed: ${error instanceof Error ? error.message : String(error)}`,
            error instanceof Error ? error : undefined
          ),
        };
      }
    }
  );
}

export async function logs(
  ctx: LspContext
): Promise<Result<LogMessageResult[]>> {
  const { windowLogStore } = ctx;
  try {
    const messages = windowLogStore.getMessages();
    return { success: true, data: messages };
  } catch (error) {
    return {
      success: false,
      error: createLspError(
        ErrorCode.LSPError,
        `Failed to get window log messages: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      ),
    };
  }
}
