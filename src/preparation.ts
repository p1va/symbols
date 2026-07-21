import type { LspSession } from './runtime/lsp-session.js';
import {
  FileRequest,
  SearchRequest,
  SymbolPositionRequest,
  ValidationError,
  ZeroBasedPosition,
  toZeroBased,
} from './types.js';
import {
  validateFileRequest,
  validatePosition,
  validateWorkspaceOperation,
} from './validation.js';

export interface PreparedFileRequest {
  filePath: string;
}

export interface PreparedWorkspaceRequest {
  query: string;
}

export interface ResolvedSymbolTarget {
  filePath: string;
  position: SymbolPositionRequest['position'];
  lspPosition: ZeroBasedPosition;
}

export interface ResolvedRenameTarget extends ResolvedSymbolTarget {
  newName: string;
}

function throwValidationError(error: ValidationError): never {
  throw new Error(error.message, { cause: error });
}

export function prepareWorkspaceRequest(
  session: LspSession,
  request: SearchRequest
): PreparedWorkspaceRequest {
  const workspaceValidation = validateWorkspaceOperation(session);
  if (!workspaceValidation.valid) {
    throwValidationError(workspaceValidation.error);
  }

  return {
    query: request.query,
  };
}

export function prepareFileRequest(
  session: LspSession,
  request: FileRequest
): PreparedFileRequest {
  const validation = validateFileRequest(session, request);
  if (!validation.valid) {
    throwValidationError(validation.error);
  }

  return {
    filePath: validation.absolutePath,
  };
}

export async function resolveSymbolTarget(
  session: LspSession,
  request: SymbolPositionRequest
): Promise<ResolvedSymbolTarget> {
  const fileValidation = validateFileRequest(session, request);
  if (!fileValidation.valid) {
    throwValidationError(fileValidation.error);
  }

  const positionValidation = await validatePosition(
    fileValidation.absolutePath,
    request.position
  );
  if (!positionValidation.valid) {
    throwValidationError(positionValidation.error);
  }

  return {
    filePath: fileValidation.absolutePath,
    position: request.position,
    lspPosition: toZeroBased(request.position),
  };
}
