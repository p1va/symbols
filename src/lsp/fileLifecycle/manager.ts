/**
 * File lifecycle management with explicit strategy-based orchestration
 */

import * as path from 'path';
import * as fs from 'fs';

import {
  LspClient,
  PreloadedFiles,
  Result,
  createLspError,
  ErrorCode,
  OneBasedPosition,
} from '../../types.js';
import {
  getLanguageId,
  decideShouldClose,
  forceCloseFile,
  openFile,
  closeFile,
} from './ops.js';
import {
  generateCursorContext,
  CursorContext,
} from '../../utils/cursorContext.js';

/**
 * File lifecycle strategy - makes the intent explicit
 */
export type FileLifecycleStrategy =
  | 'temporary' // Open for operation, then close
  | 'persistent' // Keep open (for preloaded files)
  | 'respect_existing'; // Don't close if already open

/**
 * Result of opening a file, including what action was taken
 */
export interface FileOpenResult {
  wasAlreadyOpen: boolean;
  isPreloaded: boolean;
  uri: string;
  strategy: FileLifecycleStrategy;
}

/**
 * Opens a file with explicit lifecycle strategy
 */
export async function openFileWithStrategy(
  client: LspClient,
  filePath: string,
  preloadedFiles: PreloadedFiles,
  strategy: FileLifecycleStrategy
): Promise<Result<FileOpenResult>> {
  try {
    const uri = `file://${path.resolve(filePath)}`;
    const preloaded = preloadedFiles.get(uri);
    const isPreloaded = !!preloaded;
    const wasAlreadyOpen = preloaded?.isOpen ?? false;

    // If already open and we respect existing state, return early
    if (wasAlreadyOpen && strategy === 'respect_existing') {
      return {
        success: true,
        data: { wasAlreadyOpen: true, isPreloaded, uri, strategy },
      };
    }

    // Get file content
    let content: string;
    let version: number;

    if (preloaded) {
      content = preloaded.content;
      version = preloaded.version;
    } else {
      // Read from filesystem
      try {
        content = await fs.promises.readFile(filePath, 'utf8');
        version = 1;
      } catch (error) {
        return {
          success: false,
          error: createLspError(
            ErrorCode.FileNotFound,
            `Failed to read file ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
            error instanceof Error ? error : undefined
          ),
        };
      }
    }

    // If file is already open, close it first (clean slate approach)
    if (wasAlreadyOpen) {
      const closeResult = await forceCloseFile(client, uri, preloadedFiles);
      if (!closeResult.success) {
        return closeResult;
      }
    }

    // Open the file
    const languageId = getLanguageId(filePath);
    const openResult = await openFile(
      client,
      uri,
      content,
      version,
      languageId,
      preloadedFiles
    );
    if (!openResult.success) {
      return openResult;
    }

    return {
      success: true,
      data: { wasAlreadyOpen, isPreloaded, uri, strategy },
    };
  } catch (error) {
    return {
      success: false,
      error: createLspError(
        ErrorCode.LSPError,
        `Failed to open file with strategy: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      ),
    };
  }
}

/**
 * Closes a file based on strategy and current state
 */
export async function closeFileWithStrategy(
  client: LspClient,
  uri: string,
  preloadedFiles: PreloadedFiles,
  strategy: FileLifecycleStrategy,
  wasAlreadyOpen: boolean,
  isPreloaded: boolean
): Promise<Result<void>> {
  const shouldClose = decideShouldClose(strategy, wasAlreadyOpen, isPreloaded);

  if (shouldClose) {
    return await closeFile(client, uri, preloadedFiles);
  }

  return { success: true, data: undefined };
}

/**
 * Result that includes cursor context for position-based operations
 */
export interface OperationWithContextResult<T> {
  result: T;
  cursorContext?: CursorContext;
}

/**
 * Execute an operation with explicit file lifecycle management and cursor context
 */
export async function executeWithCursorContext<T>(
  operationName: string,
  client: LspClient,
  filePath: string,
  position: OneBasedPosition,
  preloadedFiles: PreloadedFiles,
  strategy: FileLifecycleStrategy,
  operation: (uri: string, cursorContext?: CursorContext) => Promise<Result<T>>
): Promise<Result<OperationWithContextResult<T>>> {
  // Open file with strategy
  const openResult = await openFileWithStrategy(
    client,
    filePath,
    preloadedFiles,
    strategy
  );
  if (!openResult.success) {
    return {
      success: false,
      error: openResult.error,
    };
  }

  const { wasAlreadyOpen, isPreloaded, uri } = openResult.data;

  try {
    // Generate cursor context
    const cursorContext = await generateCursorContext(
      operationName,
      client,
      uri,
      filePath,
      position,
      preloadedFiles
    );

    // Execute the operation
    const operationResult = await operation(uri, cursorContext || undefined);

    // Close file based on strategy
    const closeResult = await closeFileWithStrategy(
      client,
      uri,
      preloadedFiles,
      strategy,
      wasAlreadyOpen,
      isPreloaded
    );

    // If operation succeeded but close failed, log but don't fail the operation
    if (operationResult.success && !closeResult.success) {
      // Could log warning here: Failed to close file but operation succeeded
    }

    if (operationResult.success) {
      const resultData: OperationWithContextResult<
        typeof operationResult.data
      > = {
        result: operationResult.data,
      };

      if (cursorContext) {
        resultData.cursorContext = cursorContext;
      }

      return {
        success: true,
        data: resultData,
      };
    } else {
      return operationResult as any;
    }
  } catch (error) {
    // Attempt to close file on error
    await closeFileWithStrategy(
      client,
      uri,
      preloadedFiles,
      strategy,
      wasAlreadyOpen,
      isPreloaded
    );

    return {
      success: false,
      error: createLspError(
        ErrorCode.LSPError,
        `Operation failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      ),
    };
  }
}

/**
 * Execute an operation with explicit file lifecycle management
 */
export async function executeWithExplicitLifecycle<T>(
  client: LspClient,
  filePath: string,
  preloadedFiles: PreloadedFiles,
  strategy: FileLifecycleStrategy,
  operation: (uri: string) => Promise<Result<T>>
): Promise<Result<T>> {
  // Open file with strategy
  const openResult = await openFileWithStrategy(
    client,
    filePath,
    preloadedFiles,
    strategy
  );
  if (!openResult.success) {
    return {
      success: false,
      error: openResult.error,
    };
  }

  const { wasAlreadyOpen, isPreloaded, uri } = openResult.data;

  try {
    // Execute the operation
    const operationResult = await operation(uri);

    // Close file based on strategy
    const closeResult = await closeFileWithStrategy(
      client,
      uri,
      preloadedFiles,
      strategy,
      wasAlreadyOpen,
      isPreloaded
    );

    // If operation succeeded but close failed, log but don't fail the operation
    if (operationResult.success && !closeResult.success) {
      // Could log warning here: Failed to close file but operation succeeded
    }

    return operationResult;
  } catch (error) {
    // Attempt to close file on error
    await closeFileWithStrategy(
      client,
      uri,
      preloadedFiles,
      strategy,
      wasAlreadyOpen,
      isPreloaded
    );

    return {
      success: false,
      error: createLspError(
        ErrorCode.LSPError,
        `Operation failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      ),
    };
  }
}
