/**
 * LSP Client management - spawning, initialization, and connection lifecycle
 * Based on working patterns from playground/dotnet.ts
 */

import * as cp from 'child_process';
import * as rpc from 'vscode-jsonrpc';
import {
  InitializeParams,
  WorkspaceFolder,
  PublishDiagnosticsParams,
  InitializeResult,
} from 'vscode-languageserver-protocol';

import {
  LspClient,
  LspClientResult,
  LspConfig,
  Result,
  DiagnosticsStore,
  WindowLogStore,
  LogMessage,
  createLspError,
  ErrorCode,
} from './types.js';

export function createLspClient(
  _config: LspConfig, // Configuration for future use (server command, args, env)
  diagnosticsStore: DiagnosticsStore,
  windowLogStore: WindowLogStore
): Result<LspClientResult> {
  try {
    // TODO: accept command, arguments and env vars from outside to be read from config

    // Spawn the TypeScript Language Server (same as playground)
    const serverProcess = cp.spawn('typescript-language-server', ['--stdio']);

    // Create JSON-RPC connection using the overload that accepts streams directly
    // vscode-jsonrpc expects Readable/Writable but child_process streams are compatible
    const connection = rpc.createMessageConnection(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      serverProcess.stdout as any, // Readable stream from child process
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      serverProcess.stdin as any // Writable stream to child process
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

    const result: LspClientResult = {
      client,
      process: serverProcess,
    };

    return { ok: true, data: result };
  } catch (error) {
    return {
      ok: false,
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
): Promise<Result<InitializeResult>> {
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
          // diagnostics capability disabled for now
        },
        textDocument: {
          publishDiagnostics: {
            relatedInformation: true,
            versionSupport: true,
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

    const initResult: InitializeResult = await client.connection.sendRequest(
      'initialize',
      initParams
    );

    // Send initialized notification
    await client.connection.sendNotification('initialized', {});

    client.isInitialized = true;
    client.serverCapabilities = initResult.capabilities;

    return { ok: true, data: initResult };
  } catch (error) {
    return {
      ok: false,
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
  } catch {
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
  connection.onNotification('window/showMessage', () => {
    // Store or ignore as needed
  });

  // Handle capability registration requests
  connection.onRequest('client/registerCapability', () => {
    return {}; // Acknowledge
  });

  // Handle other notifications silently
  connection.onNotification(() => {
    // Silent handling of other notifications
  });
}
