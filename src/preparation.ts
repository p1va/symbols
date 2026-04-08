import type { LspSession } from './runtime/lsp-session.js';
import {
  FileRequest,
  RenameRequest,
  Result,
  SearchRequest,
  SymbolPositionRequest,
  ValidationError,
  ValidationResult,
  ZeroBasedPosition,
  toZeroBased,
} from './types.js';
import {
  validateFileRequest,
  validateSymbolPositionRequest,
  validateWorkspaceOperation,
} from './validation.js';

export interface PreparedFileRequest {
  filePath: string;
}

export interface PreparedWorkspaceRequest {
  query: string;
}

export interface PreparedSymbolPositionRequest {
  filePath: string;
  position: SymbolPositionRequest['position'];
  lspPosition: ZeroBasedPosition;
}

export interface PreparedRenameRequest extends PreparedSymbolPositionRequest {
  newName: string;
}

function validationFailure(
  error: ValidationError
): Result<never, ValidationError> {
  return {
    ok: false,
    error,
  };
}

function validationSuccess<T>(data: T): Result<T, ValidationError> {
  return {
    ok: true,
    data,
  };
}

function toValidationResultError(
  validation: ValidationResult
): ValidationError | null {
  return validation.valid ? null : validation.error;
}

export function prepareWorkspaceRequest(
  session: LspSession,
  request: SearchRequest
): Result<PreparedWorkspaceRequest, ValidationError> {
  const workspaceValidation = validateWorkspaceOperation(session);
  const error = toValidationResultError(workspaceValidation);
  if (error) {
    return validationFailure(error);
  }

  return validationSuccess({
    query: request.query,
  });
}

export function prepareFileRequest(
  session: LspSession,
  request: FileRequest
): Result<PreparedFileRequest, ValidationError> {
  const validation = validateFileRequest(session, request);
  if (!validation.valid) {
    return validationFailure(validation.error);
  }

  return validationSuccess({
    filePath: validation.absolutePath,
  });
}

export async function prepareSymbolPositionRequest(
  session: LspSession,
  request: SymbolPositionRequest
): Promise<Result<PreparedSymbolPositionRequest, ValidationError>> {
  const validation = await validateSymbolPositionRequest(session, request);
  if (!validation.valid) {
    return validationFailure(validation.error);
  }

  return validationSuccess({
    filePath: validation.absolutePath,
    position: request.position,
    lspPosition: toZeroBased(request.position),
  });
}

export async function prepareRenameRequest(
  session: LspSession,
  request: RenameRequest
): Promise<Result<PreparedRenameRequest, ValidationError>> {
  const preparedPosition = await prepareSymbolPositionRequest(session, request);
  if (!preparedPosition.ok) {
    return preparedPosition;
  }

  return validationSuccess({
    ...preparedPosition.data,
    newName: request.newName,
  });
}
