/**
 * Public LspOperations - the 8 MCP tools that correspond to actual MCP functionality
 * These are the only functions exported from this module
 */

import {
  createLspError,
  ErrorCode,
  FileRequest,
  LspContext,
  LspOperationError,
  RenameRequest,
  Result,
  SearchRequest,
  SymbolPositionRequest,
  toZeroBased,
  tryResult,
  tryResultAsync,
  ValidationError,
  ValidationErrorCode,
} from '../../types.js';
import logger from '../../utils/logger.js';
import {
  CompletionItem,
  CompletionList,
  CompletionParams,
  CompletionResult,
  FlattenedSymbol,
  getDocumentSymbols,
  Hover,
  Location,
  LogMessageResult,
  ReferenceParams,
  RenameParams,
  RenameResult,
  SymbolInformation,
  SymbolInspection,
  // Internal result types
  SymbolReference,
  SymbolSearchResult,
  TextDocumentPositionParams,
  WorkspaceEdit,
  WorkspaceSymbol,
  WorkspaceSymbolParams,
} from '../../types/lsp.js';
import {
  validateFileRequest,
  validateSymbolPositionRequest,
  validateWorkspaceOperation,
} from '../../validation.js';
import {
  executeWithCursorContext,
  executeWithExplicitLifecycle,
  OperationWithContextResult,
} from '../fileLifecycle/index.js';

// Helper to convert ValidationError to LspOperationError
function validationErrorToLspError(
  validationError: ValidationError
): LspOperationError {
  // Convert ValidationErrorCode to ErrorCode where possible
  let errorCode: ErrorCode;
  switch (validationError.errorCode) {
    case ValidationErrorCode.InvalidPath:
      errorCode = ErrorCode.FileNotFound;
      break;
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
  logger.info(
    `Inspect for ${request.file} at ${request.position.line}:${request.position.character}`
  );

  // Validate request
  const validation = await validateSymbolPositionRequest(ctx, request);
  if (!validation.valid) {
    return {
      ok: false,
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
    'transient',
    async (uri) => {
      return await tryResultAsync(
        async () => {
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
            client.connection.sendRequest('textDocument/hover', positionParams),
            client.connection.sendRequest(
              'textDocument/definition',
              positionParams
            ),
            client.connection.sendRequest(
              'textDocument/typeDefinition',
              positionParams
            ),
            client.connection.sendRequest(
              'textDocument/implementation',
              positionParams
            ),
          ]);

          const inspectData: SymbolInspection = {
            hover:
              hoverResult.status === 'fulfilled'
                ? (hoverResult.value as Hover)
                : null,
            definition:
              definitionResult.status === 'fulfilled'
                ? (definitionResult.value as Location | Location[])
                : null,
            typeDefinition:
              typeDefinitionResult.status === 'fulfilled'
                ? (typeDefinitionResult.value as Location | Location[])
                : null,
            implementation:
              implementationResult.status === 'fulfilled'
                ? (implementationResult.value as Location | Location[])
                : null,
          };

          // Transform locations back to 1-based coordinates for user display
          const transformLocations = (
            locations: Location | Location[] | null
          ) => {
            if (!locations || !Array.isArray(locations)) return locations;
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

          return inspectData;
        },
        (error) =>
          createLspError(
            ErrorCode.LSPError,
            `Inspect symbol failed: ${error instanceof Error ? error.message : String(error)}`,
            error instanceof Error ? error : undefined
          )
      );
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
      ok: false,
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
    'transient',
    async (uri) => {
      return await tryResultAsync(
        async () => {
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

          const references: Location[] = await client.connection.sendRequest(
            'textDocument/references',
            params
          );

          if (!Array.isArray(references)) {
            return [];
          }

          // Transform LSP response to our format
          const results: SymbolReference[] = references.map((ref) => ({
            uri: ref.uri,
            range: ref.range,
            // Convert back to 1-based for user display
            line: ref.range.start.line + 1,
            character: ref.range.start.character + 1,
          }));

          return results;
        },
        (error) =>
          createLspError(
            ErrorCode.LSPError,
            `Find references failed: ${error instanceof Error ? error.message : String(error)}`,
            error instanceof Error ? error : undefined
          )
      );
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
      ok: false,
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
    'transient',
    async (uri) => {
      return await tryResultAsync(
        async () => {
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

          const completionResult: CompletionList | CompletionItem[] =
            await client.connection.sendRequest(
              'textDocument/completion',
              params
            );

          let completions: CompletionItem[] = [];

          if (Array.isArray(completionResult)) {
            completions = completionResult;
          } else if (
            completionResult &&
            typeof completionResult === 'object' &&
            'items' in completionResult
          ) {
            // CompletionList format
            const items = completionResult.items;

            // TODO: Is this check needed?
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

          return results;
        },
        (error) =>
          createLspError(
            ErrorCode.LSPError,
            `Code completion failed: ${error instanceof Error ? error.message : String(error)}`,
            error instanceof Error ? error : undefined
          )
      );
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
      ok: false,
      error: validationErrorToLspError(validation.error),
    };
  }

  const { client } = ctx;

  return await tryResultAsync(
    async () => {
      // Send workspace symbol request to LSP
      const params: WorkspaceSymbolParams = {
        query: request.query,
      };

      const symbols: WorkspaceSymbol[] | SymbolInformation[] =
        await client.connection.sendRequest('workspace/symbol', params);

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
                  uri: symbol.location.uri || '',
                  //TODO: Review?
                  range: {
                    start: { line: 0, character: 0 },
                    end: { line: 0, character: 0 },
                  },
                },
                containerName: symbol.containerName || '',
              };
            }
          })
        : [];

      return results;
    },
    (error) =>
      createLspError(
        ErrorCode.LSPError,
        `Workspace symbol search failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      )
  );
}

export async function readSymbols(
  ctx: LspContext,
  request: FileRequest
): Promise<Result<FlattenedSymbol[]>> {
  // Validate request
  const validation = validateFileRequest(ctx, request);
  if (!validation.valid) {
    return {
      ok: false,
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
    'transient', // Always read fresh content from disk
    async (uri): Promise<Result<FlattenedSymbol[]>> => {
      return await tryResultAsync(
        async () => {
          // Use shared utility to get flattened symbols with proper typing
          const symbols = await getDocumentSymbols(client, uri);
          return symbols;
        },
        (error) =>
          createLspError(
            ErrorCode.LSPError,
            `Document symbol request failed: ${error instanceof Error ? error.message : String(error)}`,
            error instanceof Error ? error : undefined
          )
      );
    }
  );
}

// TODO: Move somewhere else
export interface DiagnosticEntry {
  code: string;
}

export function getDiagnostics(
  ctx: LspContext,
  request: FileRequest
): Result<DiagnosticEntry[]> {
  // Validate request
  const validation = validateFileRequest(ctx, request);
  if (!validation.valid) {
    return {
      ok: false,
      error: validationErrorToLspError(validation.error),
    };
  }

  // const { client, diagnosticsStore, preloadedFiles } = ctx;
  // TODO: Implement get errors/warnings for a file
  return {
    ok: false,
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
      ok: false,
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
    'transient',
    async (uri) => {
      return await tryResultAsync(
        async () => {
          // Convert to 0-based position for LSP
          const lspPosition = toZeroBased(oneBasedPosition);

          // Send textDocument/rename request to LSP
          const params: RenameParams = {
            textDocument: { uri },
            position: lspPosition,
            newName: request.newName,
          };

          const workspaceEdit: WorkspaceEdit =
            await client.connection.sendRequest('textDocument/rename', params);

          if (
            !workspaceEdit ||
            typeof workspaceEdit !== 'object' ||
            !('changes' in workspaceEdit) ||
            !workspaceEdit.changes
          ) {
            return {};
          }

          // Transform LSP WorkspaceEdit response to our format
          const changes: RenameResult = {};
          const workspaceChanges = workspaceEdit.changes;

          for (const [fileUri, edits] of Object.entries(workspaceChanges)) {
            changes[fileUri] = edits.map((edit) => ({
              range: edit.range,
              newText: edit.newText,
              // Convert positions back to 1-based for user display
              startLine: edit.range.start.line + 1,
              startCharacter: edit.range.start.character + 1,
              endLine: edit.range.end.line + 1,
              endCharacter: edit.range.end.character + 1,
            }));
          }

          return changes;
        },
        (error) =>
          createLspError(
            ErrorCode.LSPError,
            `Rename symbol failed: ${error instanceof Error ? error.message : String(error)}`,
            error instanceof Error ? error : undefined
          )
      );
    }
  );
}

export function logs(ctx: LspContext): Result<LogMessageResult[]> {
  const { windowLogStore } = ctx;

  // Using the new tryResult helper to eliminate try/catch boilerplate
  return tryResult(
    () => windowLogStore.getMessages(),
    (error) =>
      createLspError(
        ErrorCode.LSPError,
        `Failed to get window log messages: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      )
  );
}
