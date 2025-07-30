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
  ErrorCode,
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
  filePath: string
): ValidationResult & { absolutePath?: string } {
  try {
    // Convert to absolute path
    const absolutePath = path.resolve(filePath);

    // Check if file exists
    if (!fs.existsSync(absolutePath)) {
      return {
        valid: false,
        error: {
          errorCode: ErrorCode.FileNotFound,
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
  line: number,
  character: number
): Promise<ValidationResult> {
  try {
    const content = await fs.promises.readFile(filePath, 'utf8');
    const lines = content.split('\n');

    // Convert to 0-based for validation (LSP coordinates)
    const zeroBasedLine = line - 1;
    const zeroBasedChar = character - 1;

    // Check line bounds
    if (zeroBasedLine < 0 || zeroBasedLine >= lines.length) {
      return {
        valid: false,
        error: {
          errorCode: ValidationErrorCode.PositionOutOfBounds,
          message: `Line ${line} is out of bounds. File has ${lines.length} lines.`,
        },
      };
    }

    // Check character bounds
    const lineContent = lines[zeroBasedLine];
    if (!lineContent) {
      return {
        valid: false,
        error: {
          errorCode: ValidationErrorCode.PositionOutOfBounds,
          message: `Line ${line} does not exist in file.`,
        },
      };
    }

    if (zeroBasedChar < 0 || zeroBasedChar > lineContent.length) {
      return {
        valid: false,
        error: {
          errorCode: ValidationErrorCode.PositionOutOfBounds,
          message: `Character ${character} is out of bounds. Line ${line} has ${lineContent.length} characters.`,
        },
      };
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: {
        errorCode: ErrorCode.FileNotFound,
        message: `Cannot read file for position validation: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }
}

/**
 * Comprehensive validation for file-based requests
 */
export async function validateFileRequest(
  ctx: LspContext,
  request: FileRequest
): Promise<ValidationResult & { absolutePath?: string }> {
  // Check workspace readiness
  const workspaceCheck = validateWorkspaceReady(ctx);
  if (!workspaceCheck.valid) {
    return workspaceCheck;
  }

  // Validate and normalize file path
  const pathCheck = validateAndNormalizeFilePath(request.file);
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

  // Validate and normalize file path
  const pathCheck = validateAndNormalizeFilePath(request.file);
  if (!pathCheck.valid) {
    return pathCheck;
  }

  // Validate position bounds
  const positionCheck = await validatePosition(
    pathCheck.absolutePath!,
    request.line,
    request.character
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
