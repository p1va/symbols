/**
 * Pure helper functions for file lifecycle operations
 */

import {
  DidOpenTextDocumentParams,
  DidCloseTextDocumentParams,
} from 'vscode-languageserver-protocol';

import {
  LspClient,
  PreloadedFiles,
  Result,
  createLspError,
  ErrorCode,
  tryResultAsync,
} from '../../types.js';

import { FileLifecycleStrategy } from './manager.js';

/**
 * Determine if a file should be closed based on strategy and current state
 */
export function decideShouldClose(
  strategy: FileLifecycleStrategy,
  wasAlreadyOpen: boolean,
  isPreloaded: boolean = false
): boolean {
  switch (strategy) {
    case 'transient':
      // Special case: if file is preloaded, don't close it after operation
      // (we want fresh content but keep project alive)
      if (isPreloaded) {
        return false;
      }
      // Always close non-preloaded transient files
      return true;
    case 'persistent':
      // Never close persistent files
      return false;
    case 'respect_existing':
      // Only close if we opened it (it wasn't already open)
      return !wasAlreadyOpen;
    default:
      return false;
  }
}

/**
 * Force close a file without checking strategy
 */
export async function forceCloseFile(
  client: LspClient,
  uri: string,
  preloadedFiles: PreloadedFiles
): Promise<Result<void>> {
  return await tryResultAsync(
    async () => {
      const closeParams: DidCloseTextDocumentParams = {
        textDocument: { uri },
      };

      await client.connection.sendNotification(
        'textDocument/didClose',
        closeParams
      );

      // Update preloaded files state
      const preloaded = preloadedFiles.get(uri);
      if (preloaded) {
        preloaded.isOpen = false;
      }
    },
    (error) =>
      createLspError(
        ErrorCode.LSPError,
        `Failed to close file ${uri}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      )
  );
}

/**
 * Open a file in the LSP server
 */
export async function openFile(
  client: LspClient,
  uri: string,
  content: string,
  version: number,
  languageId: string,
  preloadedFiles: PreloadedFiles
): Promise<Result<void>> {
  return await tryResultAsync(
    async () => {
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
      const preloaded = preloadedFiles.get(uri);
      if (preloaded) {
        preloaded.isOpen = true;
      } else {
        preloadedFiles.set(uri, {
          uri,
          content,
          version,
          isOpen: true,
        });
      }
    },
    (error) =>
      createLspError(
        ErrorCode.LSPError,
        `Failed to open file ${uri}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      )
  );
}

/**
 * Close a file in the LSP server
 */
export async function closeFile(
  client: LspClient,
  uri: string,
  preloadedFiles: PreloadedFiles
): Promise<Result<void>> {
  return await tryResultAsync(
    async () => {
      const closeParams: DidCloseTextDocumentParams = {
        textDocument: { uri },
      };

      await client.connection.sendNotification(
        'textDocument/didClose',
        closeParams
      );

      // Update preloaded files state
      const preloaded = preloadedFiles.get(uri);
      if (preloaded) {
        preloaded.isOpen = false;
      }
    },
    (error) =>
      createLspError(
        ErrorCode.LSPError,
        `Failed to close file ${uri}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      )
  );
}
