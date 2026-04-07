/**
 * Validation utilities for LSP operations
 * Common guards for file existence, paths, positions, and workspace state
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  ValidationResult,
  SymbolPositionRequest,
  FileRequest,
  ValidationErrorCode,
  OneBasedPosition,
  toZeroBased,
} from './types.js';
import type { LspSession } from './runtime/lsp-session.js';

export const WORKSPACE_LOADING_MESSAGE_PREFIX = 'Workspace is still loading';

export function createWorkspaceLoadingMessage(startedAt?: Date): string {
  const startedAtSuffix = startedAt
    ? ` (started ${startedAt.toISOString()})`
    : '';

  return `${WORKSPACE_LOADING_MESSAGE_PREFIX}${startedAtSuffix}. Please wait for initialization to complete.`;
}

export function isWorkspaceLoadingMessage(message: string): boolean {
  return message.startsWith(WORKSPACE_LOADING_MESSAGE_PREFIX);
}

/**
 * Validates that the workspace is ready for operations
 */
export function validateWorkspaceReady(session: LspSession): ValidationResult {
  const workspaceState = session.getWorkspaceState();
  const workspaceLoaderStore = session.getWorkspaceLoaderStore();

  if (workspaceState.isLoading) {
    return {
      valid: false,
      error: {
        errorCode: ValidationErrorCode.WorkspaceNotReady,
        message: createWorkspaceLoadingMessage(
          workspaceState.loadingStartedAt
        ),
      },
    };
  }

  const hasWorkspaceLoaderState = workspaceLoaderStore.getState() !== null;
  if (hasWorkspaceLoaderState && !workspaceLoaderStore.isReady()) {
    return {
      valid: false,
      error: {
        errorCode: ValidationErrorCode.WorkspaceNotReady,
        message: createWorkspaceLoadingMessage(),
      },
    };
  }

  if (!workspaceState.isReady) {
    return {
      valid: false,
      error: {
        errorCode: ValidationErrorCode.WorkspaceNotReady,
        message: 'Workspace is not ready. Initialization may have failed.',
      },
    };
  }

  return { valid: true };
}

/**
 * Validates file existence and converts to absolute path
 */
export function validateAndNormalizeFilePath(
  filePath: string,
  workspaceDir?: string
): ValidationResult & { absolutePath?: string } {
  try {
    // Convert to absolute path using workspace directory if provided
    const absolutePath = workspaceDir
      ? path.resolve(workspaceDir, filePath)
      : path.resolve(filePath);

    // Check if file exists
    if (!fs.existsSync(absolutePath)) {
      return {
        valid: false,
        error: {
          errorCode: ValidationErrorCode.InvalidPath,
          message: `File not found: ${absolutePath}`,
        },
      };
    }

    // Check if it's actually a file (not a directory)
    const stats = fs.statSync(absolutePath);
    if (!stats.isFile()) {
      return {
        valid: false,
        error: {
          errorCode: ValidationErrorCode.InvalidPath,
          message: `Path is not a file: ${absolutePath}`,
        },
      };
    }

    return { valid: true, absolutePath };
  } catch (error) {
    return {
      valid: false,
      error: {
        errorCode: ValidationErrorCode.InvalidPath,
        message: `Invalid file path: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }
}

/**
 * Validates that position is within file bounds
 */
export async function validatePosition(
  filePath: string,
  position: OneBasedPosition
): Promise<ValidationResult> {
  try {
    const content = await fs.promises.readFile(filePath, 'utf8');
    const lines = content.split('\n');

    // Convert to 0-based for validation (LSP coordinates)
    const zeroBasedPosition = toZeroBased(position);

    // Check line bounds
    if (zeroBasedPosition.line < 0 || zeroBasedPosition.line >= lines.length) {
      return {
        valid: false,
        error: {
          errorCode: ValidationErrorCode.PositionOutOfBounds,
          message: `Line ${position.line} is out of bounds. File has ${lines.length} lines.`,
        },
      };
    }

    // Check character bounds
    const lineContent = lines[zeroBasedPosition.line];
    if (!lineContent) {
      return {
        valid: false,
        error: {
          errorCode: ValidationErrorCode.PositionOutOfBounds,
          message: `Line ${position.line} does not exist in file.`,
        },
      };
    }

    if (
      zeroBasedPosition.character < 0 ||
      zeroBasedPosition.character > lineContent.length
    ) {
      return {
        valid: false,
        error: {
          errorCode: ValidationErrorCode.PositionOutOfBounds,
          message: `Character ${position.character} is out of bounds. Line ${position.line} has ${lineContent.length} characters.`,
        },
      };
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: {
        errorCode: ValidationErrorCode.InvalidPath,
        message: `Cannot read file for position validation: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }
}

/**
 * Comprehensive validation for file-based requests
 */
export function validateFileRequest(
  session: LspSession,
  request: FileRequest
): ValidationResult & { absolutePath?: string } {
  // Check workspace readiness
  const workspaceCheck = validateWorkspaceReady(session);
  if (!workspaceCheck.valid) {
    return workspaceCheck;
  }

  // Validate and normalize file path using workspace context
  const pathCheck = validateAndNormalizeFilePath(
    request.file,
    session.getProfile().workspacePath
  );
  if (!pathCheck.valid) {
    return pathCheck;
  }

  return pathCheck.absolutePath
    ? { valid: true, absolutePath: pathCheck.absolutePath }
    : { valid: true };
}

/**
 * Comprehensive validation for symbol position requests
 */
export async function validateSymbolPositionRequest(
  session: LspSession,
  request: SymbolPositionRequest
): Promise<ValidationResult & { absolutePath?: string }> {
  // Check workspace readiness
  const workspaceCheck = validateWorkspaceReady(session);
  if (!workspaceCheck.valid) {
    return workspaceCheck;
  }

  // Validate and normalize file path using workspace context
  const pathCheck = validateAndNormalizeFilePath(
    request.file,
    session.getProfile().workspacePath
  );
  if (!pathCheck.valid) {
    return pathCheck;
  }

  // Validate position bounds
  const positionCheck = await validatePosition(
    pathCheck.absolutePath!,
    request.position
  );
  if (!positionCheck.valid) {
    return positionCheck;
  }

  return pathCheck.absolutePath
    ? { valid: true, absolutePath: pathCheck.absolutePath }
    : { valid: true };
}

/**
 * Simple workspace validation for search operations (no file required)
 */
export function validateWorkspaceOperation(
  session: LspSession
): ValidationResult {
  return validateWorkspaceReady(session);
}
