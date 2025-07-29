/**
 * Public LspOperations - the 8 MCP tools that correspond to actual MCP functionality
 * These are the only functions exported from this module
 */

import {
  LspClient,
  LspContext,
  PreloadedFiles,
  Result,
  DiagnosticsStore,
  WindowLogStore,
  SymbolPositionRequest,
  FileRequest,
  SearchRequest,
  RenameRequest,
  createLspError,
  ErrorCode,
  ValidationError,
  ValidationErrorCode,
} from './types';
import {
  validateSymbolPositionRequest,
  validateFileRequest,
  validateWorkspaceOperation,
} from './validation';
import { executeWithExplicitLifecycle } from './file-lifecycle-v2';

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
  return createLspError(errorCode, validationError.message, validationError.originalError);
}

// The 8 MCP tools we need to implement:

export async function inspectSymbol(
  ctx: LspContext,
  request: SymbolPositionRequest
): Promise<Result<any>> {
  // Validate request
  const validation = await validateSymbolPositionRequest(ctx, request);
  if (!validation.valid) {
    return { success: false, error: validationErrorToLspError(validation.error) };
  }

  const { client, preloadedFiles } = ctx;
  // TODO: Implement comprehensive symbol info (hover + all navigation)
  return { success: false, error: createLspError(ErrorCode.LSPError, 'Not implemented yet') };
}

export async function findReferences(
  ctx: LspContext,
  request: SymbolPositionRequest
): Promise<Result<any[]>> {
  // Validate request
  const validation = await validateSymbolPositionRequest(ctx, request);
  if (!validation.valid) {
    return { success: false, error: validationErrorToLspError(validation.error) };
  }

  const { client, preloadedFiles } = ctx;
  // TODO: Implement find all uses of a symbol
  return { success: false, error: createLspError(ErrorCode.LSPError, 'Not implemented yet') };
}

export async function getCompletion(
  ctx: LspContext,
  request: SymbolPositionRequest
): Promise<Result<any[]>> {
  // Validate request
  const validation = await validateSymbolPositionRequest(ctx, request);
  if (!validation.valid) {
    return { success: false, error: validationErrorToLspError(validation.error) };
  }

  const { client, preloadedFiles } = ctx;
  // TODO: Implement code completion suggestions
  return { success: false, error: createLspError(ErrorCode.LSPError, 'Not implemented yet') };
}

export async function searchSymbols(
  ctx: LspContext,
  request: SearchRequest
): Promise<Result<any[]>> {
  // Validate workspace readiness
  const validation = validateWorkspaceOperation(ctx);
  if (!validation.valid) {
    return { success: false, error: validationErrorToLspError(validation.error) };
  }

  const { client } = ctx;

  try {
    // Send workspace symbol request to LSP
    const params = {
      query: request.query,
    };

    const symbols = await client.connection.sendRequest(
      'workspace/symbol',
      params
    );

    // Transform LSP response to our format
    const results = Array.isArray(symbols)
      ? symbols.map((symbol) => ({
          name: symbol.name,
          kind: symbol.kind,
          location: {
            uri: symbol.location.uri,
            range: symbol.location.range,
          },
          containerName: symbol.containerName,
        }))
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
): Promise<Result<any[]>> {
  // Validate request
  const validation = await validateFileRequest(ctx, request);
  if (!validation.valid) {
    return { success: false, error: validationErrorToLspError(validation.error) };
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
    async (openResult) => {
      try {
        // Send textDocument/documentSymbol request
        const params = {
          textDocument: {
            uri: openResult.uri,
          },
        };

        const symbols = await client.connection.sendRequest(
          'textDocument/documentSymbol',
          params
        );

        if (!Array.isArray(symbols)) {
          return { success: true, data: [] };
        }

        // Transform LSP DocumentSymbol response to our format
        const results = symbols.map((symbol: any) => ({
          name: symbol.name,
          kind: symbol.kind,
          range: symbol.range,
          selectionRange: symbol.selectionRange,
          detail: symbol.detail,
          children: symbol.children
            ? symbol.children.map((child: any) => ({
                name: child.name,
                kind: child.kind,
                range: child.range,
                selectionRange: child.selectionRange,
                detail: child.detail,
              }))
            : undefined,
        }));

        return { success: true, data: results };
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
    return { success: false, error: validationErrorToLspError(validation.error) };
  }

  const { client, diagnosticsStore, preloadedFiles } = ctx;
  // TODO: Implement get errors/warnings for a file
  return { success: false, error: createLspError(ErrorCode.LSPError, 'Not implemented yet') };
}

export async function renameSymbol(
  ctx: LspContext,
  request: RenameRequest
): Promise<Result<any>> {
  // Validate request (RenameRequest extends SymbolPositionRequest)
  const validation = await validateSymbolPositionRequest(ctx, request);
  if (!validation.valid) {
    return { success: false, error: validationErrorToLspError(validation.error) };
  }

  const { client, preloadedFiles } = ctx;
  // TODO: Implement rename symbol across codebase
  return { success: false, error: createLspError(ErrorCode.LSPError, 'Not implemented yet') };
}

export async function getWindowLogMessages(
  ctx: LspContext
): Promise<Result<any[]>> {
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
