/**
 * Low-level didOpen/didClose transport helpers used by LspSession.
 */

import {
  DidOpenTextDocumentParams,
  DidCloseTextDocumentParams,
} from 'vscode-languageserver-protocol';

import {
  LspClient,
  Result,
  SessionDocuments,
  createLspError,
  ErrorCode,
  tryResultAsync,
} from '../../types.js';

/**
 * Force close a file without checking strategy
 */
export async function forceCloseFile(
  client: LspClient,
  uri: string,
  sessionDocuments: SessionDocuments
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
      const document = sessionDocuments.get(uri);
      if (document) {
        document.isOpen = false;
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
  sessionDocuments: SessionDocuments
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
      const document = sessionDocuments.get(uri);
      if (document) {
        document.isOpen = true;
      } else {
        sessionDocuments.set(uri, {
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
  sessionDocuments: SessionDocuments
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
      const document = sessionDocuments.get(uri);
      if (document) {
        document.isOpen = false;
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
