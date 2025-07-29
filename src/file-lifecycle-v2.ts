/**
 * Enhanced File Lifecycle Management for LSP Operations
 *
 * This module provides explicit, clear file lifecycle management that distinguishes
 * between preloaded files (should remain open) and temporary files (should be closed).
 */

import {
  DidOpenTextDocumentParams,
  DidCloseTextDocumentParams,
  TextDocumentIdentifier,
} from 'vscode-languageserver-protocol';
import * as path from 'path';
import * as fs from 'fs';

import { LspClient, PreloadedFile, PreloadedFiles, Result, createLspError, ErrorCode } from './types';

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
    const didOpenParams: DidOpenTextDocumentParams = {
      textDocument: {
        uri,
        languageId,
        version,
        text: content,
      },
    };

    await client.connection.sendNotification(
      'textDocument/didOpen',
      didOpenParams
    );

    // Update state
    preloadedFiles.set(uri, {
      uri,
      content,
      version,
      isOpen: true,
    });

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
 * Closes a file based on the lifecycle strategy
 */
export async function closeFileWithStrategy(
  client: LspClient,
  openResult: FileOpenResult,
  preloadedFiles: PreloadedFiles
): Promise<Result<void>> {
  const { uri, strategy, isPreloaded } = openResult;

  try {
    // Determine if we should close the file
    const shouldClose = decideShouldClose(strategy, isPreloaded);

    if (!shouldClose) {
      // File should remain open (preloaded or persistent strategy)
      return { success: true, data: undefined };
    }

    // Close the file
    return await forceCloseFile(client, uri, preloadedFiles);
  } catch (error) {
    return {
      success: false,
      error: createLspError(
        ErrorCode.LSPError,
        `Failed to close file with strategy: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      ),
    };
  }
}

/**
 * High-level operation wrapper that handles file lifecycle explicitly
 */
export async function executeWithExplicitLifecycle<T>(
  client: LspClient,
  filePath: string,
  preloadedFiles: PreloadedFiles,
  strategy: FileLifecycleStrategy,
  operation: (openResult: FileOpenResult) => Promise<Result<T>>
): Promise<Result<T>> {
  // Open file with explicit strategy
  const openResult = await openFileWithStrategy(
    client,
    filePath,
    preloadedFiles,
    strategy
  );
  if (!openResult.success) {
    return openResult;
  }

  try {
    // Execute operation with full context
    const result = await operation(openResult.data);
    return result;
  } finally {
    // Close based on strategy
    await closeFileWithStrategy(client, openResult.data, preloadedFiles);
  }
}

/**
 * Force close a file (internal helper)
 */
async function forceCloseFile(
  client: LspClient,
  uri: string,
  preloadedFiles: PreloadedFiles
): Promise<Result<void>> {
  try {
    const preloaded = preloadedFiles.get(uri);
    if (!preloaded || !preloaded.isOpen) {
      return { success: true, data: undefined };
    }

    const didCloseParams: DidCloseTextDocumentParams = {
      textDocument: { uri } as TextDocumentIdentifier,
    };

    await client.connection.sendNotification(
      'textDocument/didClose',
      didCloseParams
    );
    preloaded.isOpen = false;

    return { success: true, data: undefined };
  } catch (error) {
    return {
      success: false,
      error: createLspError(
        ErrorCode.LSPError,
        `Failed to force close file: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      ),
    };
  }
}

/**
 * Decision logic for whether to close a file
 */
function decideShouldClose(
  strategy: FileLifecycleStrategy,
  isPreloaded: boolean
): boolean {
  switch (strategy) {
    case 'temporary':
      // Always close temporary files
      return true;
    case 'persistent':
      // Never close persistent files
      return false;
    case 'respect_existing':
      // Close non-preloaded files, keep preloaded files open
      return !isPreloaded;
    default:
      // Default to temporary behavior
      return true;
  }
}

/**
 * Get language ID from file extension
 */
function getLanguageId(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();

  switch (ext) {
    case '.ts':
      return 'typescript';
    case '.tsx':
      return 'typescriptreact';
    case '.js':
      return 'javascript';
    case '.jsx':
      return 'javascriptreact';
    case '.json':
      return 'json';
    case '.md':
      return 'markdown';
    default:
      return 'plaintext';
  }
}
