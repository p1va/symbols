/**
 * File lifecycle management for LSP operations
 * Handles opening/closing files and maintaining preloaded file state
 */

import {
  DidOpenTextDocumentParams,
  DidCloseTextDocumentParams,
  TextDocumentIdentifier,
} from 'vscode-languageserver-protocol';
import * as path from 'path';
import * as fs from 'fs';

import { LspClient, PreloadedFile, PreloadedFiles, Result, createLspError, ErrorCode } from './types';

export async function openFileForLsp(
  client: LspClient,
  filePath: string,
  preloadedFiles: PreloadedFiles
): Promise<Result<void>> {
  try {
    const uri = `file://${path.resolve(filePath)}`;

    // Try to get from preloaded files first
    let content: string;
    let version: number;

    const preloaded = preloadedFiles.get(uri);
    if (preloaded) {
      content = preloaded.content;
      version = preloaded.version;

      if (preloaded.isOpen) {
        // Already open, no need to reopen
        return { success: true, data: undefined };
      }
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

    // Determine language ID from file extension
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

    // Update preloaded files state
    preloadedFiles.set(uri, {
      uri,
      content,
      version,
      isOpen: true,
    });

    return { success: true, data: undefined };
  } catch (error) {
    return {
      success: false,
      error: createLspError(
        ErrorCode.LSPError,
        `Failed to open file for LSP: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      ),
    };
  }
}

export async function closeFileForLsp(
  client: LspClient,
  filePath: string,
  preloadedFiles: PreloadedFiles
): Promise<Result<void>> {
  try {
    const uri = `file://${path.resolve(filePath)}`;

    const preloaded = preloadedFiles.get(uri);
    if (!preloaded || !preloaded.isOpen) {
      // File not open, nothing to do
      return { success: true, data: undefined };
    }

    const didCloseParams: DidCloseTextDocumentParams = {
      textDocument: {
        uri,
      } as TextDocumentIdentifier,
    };

    await client.connection.sendNotification(
      'textDocument/didClose',
      didCloseParams
    );

    // Update preloaded files state
    preloaded.isOpen = false;

    return { success: true, data: undefined };
  } catch (error) {
    return {
      success: false,
      error: createLspError(
        ErrorCode.LSPError,
        `Failed to close file for LSP: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      ),
    };
  }
}

export async function executeWithFileLifecycle<T>(
  client: LspClient,
  filePath: string,
  preloadedFiles: PreloadedFiles,
  operation: () => Promise<Result<T>>
): Promise<Result<T>> {
  // Open file
  const openResult = await openFileForLsp(client, filePath, preloadedFiles);
  if (!openResult.success) {
    return openResult;
  }

  try {
    // Execute operation
    const result = await operation();
    return result;
  } finally {
    // Always close file (one lifecycle per tool call)
    await closeFileForLsp(client, filePath, preloadedFiles);
  }
}

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
