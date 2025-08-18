/**
 * Validation utilities for LSP operations
 * Common guards for file existence, paths, positions, and workspace state
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  LspContext,
  ValidationResult,
  SymbolPositionRequest,
  FileRequest,
  ValidationErrorCode,
  OneBasedPosition,
  toZeroBased,
} from './types.js';

/**
 * Validates that the workspace is ready for operations
 */
export function validateWorkspaceReady(ctx: LspContext): ValidationResult {
  const { workspaceState } = ctx;

  if (workspaceState.isLoading) {
    return {
      valid: false,
      error: {
        errorCode: ValidationErrorCode.WorkspaceNotReady,
        message: `Workspace is still loading (started ${workspaceState.loadingStartedAt?.toISOString()}). Please wait for initialization to complete.`,
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
  ctx: LspContext,
  request: FileRequest
): ValidationResult & { absolutePath?: string } {
  // Check workspace readiness
  const workspaceCheck = validateWorkspaceReady(ctx);
  if (!workspaceCheck.valid) {
    return workspaceCheck;
  }

  // Validate and normalize file path using workspace context
  const pathCheck = validateAndNormalizeFilePath(
    request.file,
    ctx.workspacePath
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
  ctx: LspContext,
  request: SymbolPositionRequest
): Promise<ValidationResult & { absolutePath?: string }> {
  // Check workspace readiness
  const workspaceCheck = validateWorkspaceReady(ctx);
  if (!workspaceCheck.valid) {
    return workspaceCheck;
  }

  // Validate and normalize file path using workspace context
  const pathCheck = validateAndNormalizeFilePath(
    request.file,
    ctx.workspacePath
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
export function validateWorkspaceOperation(ctx: LspContext): ValidationResult {
  return validateWorkspaceReady(ctx);
}
