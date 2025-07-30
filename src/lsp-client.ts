/**
 * LSP Client management - spawning, initialization, and connection lifecycle
 * Based on working patterns from playground/dotnet.ts
 */

import * as cp from 'child_process';
import * as rpc from 'vscode-jsonrpc';
import * as path from 'path';
import {
  InitializeParams,
  WorkspaceFolder,
  PublishDiagnosticsParams,
  MessageType,
} from 'vscode-languageserver-protocol';

import {
  LspClient,
  LspConfig,
  Result,
  DiagnosticsStore,
  WindowLogStore,
  LogMessage,
  createLspError,
  ErrorCode,
} from './types.js';

export async function createLspClient(
  config: LspConfig,
  diagnosticsStore: DiagnosticsStore,
  windowLogStore: WindowLogStore
): Promise<Result<LspClient>> {
  try {
    // Spawn the TypeScript Language Server (same as playground)
    const serverProcess = cp.spawn('typescript-language-server', ['--stdio']);

    // Create JSON-RPC connection using the overload that accepts streams directly
    const connection = rpc.createMessageConnection(
      serverProcess.stdout as any,
      serverProcess.stdin as any
    );

    // Set up notification handlers before listening
    setupNotificationHandlers(connection, diagnosticsStore, windowLogStore);

    // Start listening
    connection.listen();

    const client: LspClient = {
      connection,
      isInitialized: false,
      ...(serverProcess.pid !== undefined && { processId: serverProcess.pid }),
    };

    return { success: true, data: client };
  } catch (error) {
    return {
      success: false,
      error: createLspError(
        ErrorCode.LSPError,
        `Failed to create LSP client: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      ),
    };
  }
}

export async function initializeLspClient(
  client: LspClient,
  config: LspConfig
): Promise<Result<any>> {
  try {
    // Initialize the server with proper workspace and capabilities
    const initParams: InitializeParams = {
      processId: client.processId || process.pid,
      rootUri: config.workspaceUri,
      workspaceFolders: [
        {
          name: config.workspaceName,
          uri: config.workspaceUri,
        } as WorkspaceFolder,
      ],
      capabilities: {
        workspace: {
          diagnostic: undefined, // null equivalent
        },
        textDocument: {
          publishDiagnostics: {
            relatedInformation: true,
            versionSupported: true,
            codeDescriptionSupport: true,
            dataSupport: true,
          },
          diagnostic: {
            dynamicRegistration: true,
            relatedDocumentSupport: true,
          },
          synchronization: {
            didSave: true,
          },
        },
        ...config.clientCapabilities,
      },
    };

    const initResult = await client.connection.sendRequest(
      'initialize',
      initParams
    );

    // Send initialized notification
    await client.connection.sendNotification('initialized', {});

    client.isInitialized = true;
    client.capabilities = initResult;

    return { success: true, data: initResult };
  } catch (error) {
    return {
      success: false,
      error: createLspError(
        ErrorCode.LSPError,
        `Failed to initialize LSP client: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      ),
    };
  }
}

export async function shutdownLspClient(client: LspClient): Promise<void> {
  try {
    if (client.isInitialized) {
      await client.connection.sendRequest('shutdown', null);
      await client.connection.sendNotification('exit', null);
    }
  } catch (error) {
    // Silent error handling - no console.log
  }
}

function setupNotificationHandlers(
  connection: rpc.MessageConnection,
  diagnosticsStore: DiagnosticsStore,
  windowLogStore: WindowLogStore
): void {
  // Handle diagnostics publication (critical for getDiagnostics tool)
  connection.onNotification(
    'textDocument/publishDiagnostics',
    (params: PublishDiagnosticsParams) => {
      diagnosticsStore.addDiagnostics(params.uri, params.diagnostics);
    }
  );

  // Handle window log messages (for getWindowLogMessages tool)
  connection.onNotification('window/logMessage', (params: LogMessage) => {
    windowLogStore.addMessage(params);
  });

  // Handle show message notifications (silent)
  connection.onNotification(
    'window/showMessage',
    (params: { type: number; message: string }) => {
      // Store or ignore as needed
    }
  );

  // Handle capability registration requests
  connection.onRequest('client/registerCapability', (params: any) => {
    return {}; // Acknowledge
  });

  // Handle other notifications silently
  connection.onNotification((method: string, params: any) => {
    // Silent handling of other notifications
  });
}
