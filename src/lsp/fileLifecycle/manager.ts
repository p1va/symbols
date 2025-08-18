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
  LspOperationError,
  OneBasedPosition,
  tryResultAsync,
} from '../../types.js';
import {
  decideShouldClose,
  forceCloseFile,
  openFile,
  closeFile,
} from './ops.js';
import { getLanguageId } from '../../config/lsp-config.js';
import {
  generateCursorContext,
  CursorContext,
} from '../../utils/cursorContext.js';

/**
 * File lifecycle strategy - makes the intent explicit
 */
export type FileLifecycleStrategy =
  | 'transient' // Open for operation, then close (always fresh content)
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
  strategy: FileLifecycleStrategy,
  configPath?: string,
  workspacePath?: string
): Promise<Result<FileOpenResult>> {
  return await tryResultAsync(
    async () => {
      const uri = `file://${path.resolve(filePath)}`;
      const preloaded = preloadedFiles.get(uri);
      const isPreloaded = !!preloaded;
      const wasAlreadyOpen = preloaded?.isOpen ?? false;

      // If already open and we respect existing state, return early
      if (wasAlreadyOpen && strategy === 'respect_existing') {
        return { wasAlreadyOpen: true, isPreloaded, uri, strategy };
      }

      // Get file content - for transient strategy, always read fresh from disk
      let content: string;
      let version: number;

      if (strategy === 'transient') {
        // Always read fresh from filesystem for transient operations
        try {
          content = await fs.promises.readFile(filePath, 'utf8');
          version = preloaded ? preloaded.version + 1 : 1; // Increment version if preloaded
        } catch (error) {
          const lspError = createLspError(
            ErrorCode.FileNotFound,
            `Failed to read file ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
            error instanceof Error ? error : undefined
          );
          throw new Error(lspError.message);
        }
      } else if (preloaded) {
        // Use cached content for non-transient strategies
        content = preloaded.content;
        version = preloaded.version;
      } else {
        // Read from filesystem for non-preloaded files
        try {
          content = await fs.promises.readFile(filePath, 'utf8');
          version = 1;
        } catch (error) {
          const lspError = createLspError(
            ErrorCode.FileNotFound,
            `Failed to read file ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
            error instanceof Error ? error : undefined
          );
          throw new Error(lspError.message);
        }
      }

      // If file is already open, close it first (clean slate approach)
      if (wasAlreadyOpen) {
        const closeResult = await forceCloseFile(client, uri, preloadedFiles);
        if (!closeResult.ok) {
          throw new Error(closeResult.error.message);
        }
      }

      // Open the file
      const languageId =
        getLanguageId(filePath, configPath, workspacePath) || 'plaintext';
      const openResult = await openFile(
        client,
        uri,
        content,
        version,
        languageId,
        preloadedFiles
      );
      if (!openResult.ok) {
        throw new Error(openResult.error.message);
      }

      return { wasAlreadyOpen, isPreloaded, uri, strategy };
    },
    (error) => {
      // If error is already a structured error, use it directly
      if (error && typeof error === 'object' && 'errorCode' in error) {
        return error as LspOperationError;
      }
      return createLspError(
        ErrorCode.LSPError,
        `Failed to open file with strategy: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  );
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
  isPreloaded: boolean = false
): Promise<Result<void>> {
  const shouldClose = decideShouldClose(strategy, wasAlreadyOpen, isPreloaded);

  if (shouldClose) {
    return await closeFile(client, uri, preloadedFiles);
  }

  return { ok: true, data: undefined };
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
  operation: (uri: string, cursorContext?: CursorContext) => Promise<Result<T>>,
  configPath?: string,
  workspacePath?: string
): Promise<Result<OperationWithContextResult<T>>> {
  // Open file with strategy
  const openResult = await openFileWithStrategy(
    client,
    filePath,
    preloadedFiles,
    strategy,
    configPath,
    workspacePath
  );
  if (!openResult.ok) {
    return {
      ok: false,
      error: openResult.error,
    };
  }

  const { wasAlreadyOpen, isPreloaded, uri } = openResult.data;

  const executionResult = await tryResultAsync(
    async () => {
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
      if (!operationResult.ok) {
        throw new Error(operationResult.error.message);
      }

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
      if (!closeResult.ok) {
        // Could log warning here: Failed to close file but operation succeeded
      }

      const resultData: OperationWithContextResult<
        typeof operationResult.data
      > = {
        result: operationResult.data,
      };

      if (cursorContext) {
        resultData.cursorContext = cursorContext;
      }

      return resultData;
    },
    (error) => {
      // If error is already a structured error, use it directly
      if (error && typeof error === 'object' && 'errorCode' in error) {
        return error as LspOperationError;
      }
      return createLspError(
        ErrorCode.LSPError,
        `Operation failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  );

  // Handle cleanup on error
  if (!executionResult.ok) {
    // Attempt to close file on error
    await closeFileWithStrategy(
      client,
      uri,
      preloadedFiles,
      strategy,
      wasAlreadyOpen,
      isPreloaded
    );
  }

  return executionResult;
}

/**
 * Execute an operation with explicit file lifecycle management
 */
export async function executeWithExplicitLifecycle<T>(
  client: LspClient,
  filePath: string,
  preloadedFiles: PreloadedFiles,
  strategy: FileLifecycleStrategy,
  operation: (uri: string) => Promise<Result<T>>,
  configPath?: string,
  workspacePath?: string
): Promise<Result<T>> {
  // Open file with strategy
  const openResult = await openFileWithStrategy(
    client,
    filePath,
    preloadedFiles,
    strategy,
    configPath,
    workspacePath
  );
  if (!openResult.ok) {
    return {
      ok: false,
      error: openResult.error,
    };
  }

  const { wasAlreadyOpen, isPreloaded, uri } = openResult.data;

  const executionResult = await tryResultAsync(
    async () => {
      // Execute the operation
      const operationResult = await operation(uri);
      if (!operationResult.ok) {
        throw new Error(operationResult.error.message);
      }

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
      if (!closeResult.ok) {
        // Could log warning here: Failed to close file but operation succeeded
      }

      return operationResult.data;
    },
    (error) => {
      // If error is already a structured error, use it directly
      if (error && typeof error === 'object' && 'errorCode' in error) {
        return error as LspOperationError;
      }
      return createLspError(
        ErrorCode.LSPError,
        `Operation failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  );

  // Handle cleanup on error
  if (!executionResult.ok) {
    // Attempt to close file on error
    await closeFileWithStrategy(
      client,
      uri,
      preloadedFiles,
      strategy,
      wasAlreadyOpen,
      isPreloaded
    );
  }

  return executionResult;
}
