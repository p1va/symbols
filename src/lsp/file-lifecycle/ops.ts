/**
 * Low-level didOpen/didClose transport helpers used by LspSession.
 */

import {
  DidOpenTextDocumentParams,
  DidCloseTextDocumentParams,
} from 'vscode-languageserver-protocol';

import { LspClient, SessionDocuments } from '../../types.js';
import { contextualError } from '../../utils/errors.js';

/**
 * Force close a file without checking strategy
 */
export async function forceCloseFile(
  client: LspClient,
  uri: string,
  sessionDocuments: SessionDocuments
): Promise<void> {
  try {
    const closeParams: DidCloseTextDocumentParams = {
      textDocument: { uri },
    };

    await client.connection.sendNotification(
      'textDocument/didClose',
      closeParams
    );

    const document = sessionDocuments.get(uri);
    if (document) {
      document.isOpen = false;
    }
  } catch (error) {
    throw contextualError(`Failed to close file ${uri}`, error);
  }
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
): Promise<void> {
  try {
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

    const document = sessionDocuments.get(uri);
    if (document) {
      document.isOpen = true;
      document.content = content;
      document.version = version;
    } else {
      sessionDocuments.set(uri, {
        uri,
        content,
        version,
        isOpen: true,
      });
    }
  } catch (error) {
    throw contextualError(`Failed to open file ${uri}`, error);
  }
}

/**
 * Close a file in the LSP server
 */
export async function closeFile(
  client: LspClient,
  uri: string,
  sessionDocuments: SessionDocuments
): Promise<void> {
  try {
    const closeParams: DidCloseTextDocumentParams = {
      textDocument: { uri },
    };

    await client.connection.sendNotification(
      'textDocument/didClose',
      closeParams
    );

    const document = sessionDocuments.get(uri);
    if (document) {
      document.isOpen = false;
    }
  } catch (error) {
    throw contextualError(`Failed to close file ${uri}`, error);
  }
}
