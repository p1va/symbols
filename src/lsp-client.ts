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
  DiagnosticProviderStore,
  DiagnosticProvider,
  WindowLogStore,
  LogMessage,
  createLspError,
  ErrorCode,
} from './types.js';
import { ParsedLspConfig } from './config/lsp-config.js';
import logger from './utils/logger.js';
import { createWorkspaceLoader } from './workspace/registry.js';
import { WorkspaceLoaderStore } from './types.js';

export function createLspClient(
  workspaceConfig: LspConfig,
  lspConfig: ParsedLspConfig,
  diagnosticsStore: DiagnosticsStore,
  diagnosticProviderStore: DiagnosticProviderStore,
  windowLogStore: WindowLogStore,
  workspaceLoaderStore: WorkspaceLoaderStore
): Result<LspClientResult> {
  try {
    logger.info('Creating LSP client', {
      lspName: lspConfig.name,
      command: `${lspConfig.commandName} ${lspConfig.commandArgs.join(' ')}`,
      workspace: workspaceConfig.workspaceUri,
      environment: lspConfig.environment ? Object.keys(lspConfig.environment) : 'none'
    });

    // Set up environment variables if specified
    const env = lspConfig.environment
      ? { ...process.env, ...lspConfig.environment }
      : process.env;

    logger.debug('Spawning LSP server process', {
      commandName: lspConfig.commandName,
      commandArgs: lspConfig.commandArgs,
      hasCustomEnv: !!lspConfig.environment
    });

    // Spawn the configured Language Server
    const serverProcess = cp.spawn(
      lspConfig.commandName,
      lspConfig.commandArgs,
      {
        env,
        stdio: ['pipe', 'pipe', 'pipe'], // stdin, stdout, stderr as pipes
      }
    );

    logger.info(`LSP server process spawned with PID: ${serverProcess.pid}`);

    // Handle process errors and stderr
    serverProcess.on('error', (error) => {
      logger.error('LSP server process error', { error: error.message, stack: error.stack });
    });

    serverProcess.on('exit', (code, signal) => {
      logger.warn('LSP server process exited', { code, signal, pid: serverProcess.pid });
    });

    // Log stderr output from LSP server
    if (serverProcess.stderr) {
      serverProcess.stderr.setEncoding('utf8');
      serverProcess.stderr.on('data', (data: Buffer | string) => {
        const message = typeof data === 'string' ? data.trim() : data.toString('utf8').trim();
        if (message) {
          logger.debug('LSP server stderr', { message });
        }
      });
    }

    logger.debug('Creating JSON-RPC connection over process streams');

    // Create JSON-RPC connection using the overload that accepts streams directly
    // vscode-jsonrpc expects Readable/Writable but child_process streams are compatible
    const connection = rpc.createMessageConnection(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      serverProcess.stdout as any, // Readable stream from child process
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      serverProcess.stdin as any // Writable stream to child process
    );

    logger.debug('JSON-RPC connection created successfully');

    // Add comprehensive message logging before setting up handlers
    logger.debug('Setting up comprehensive LSP message logging');
    
    // Log all incoming notifications (including unhandled ones)
    connection.onNotification((method: string, params: unknown) => {
      logger.debug('LSP notification received', { method, params });
    });

    // Log all incoming requests (including unhandled ones) 
    connection.onRequest((method: string, params: unknown) => {
      logger.debug('LSP request received', { method, params });
      // Return empty response for unhandled requests to prevent crashes
      return null;
    });

    // Log connection errors
    connection.onError((error) => {
      logger.error('LSP connection error', { 
        error: error instanceof Error ? error.message : JSON.stringify(error),
        stack: error instanceof Error ? error.stack : undefined
      });
    });

    // Log connection close
    connection.onClose(() => {
      logger.warn('LSP connection closed');
    });

    // Set up notification handlers before listening
    logger.debug('Setting up LSP notification handlers');
    setupNotificationHandlers(connection, diagnosticsStore, diagnosticProviderStore, windowLogStore, workspaceLoaderStore);

    // Start listening
    logger.debug('Starting JSON-RPC connection listener');
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

    logger.info('LSP client created successfully', {
      lspName: lspConfig.name,
      pid: serverProcess.pid,
      hasProcessId: client.processId !== undefined
    });

    return { ok: true, data: result };
  } catch (error) {
    logger.error('Failed to create LSP client', {
      lspName: lspConfig.name,
      command: `${lspConfig.commandName} ${lspConfig.commandArgs.join(' ')}`,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });

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
  config: LspConfig,
  diagnosticProviderStore: DiagnosticProviderStore,
  workspaceLoaderStore: WorkspaceLoaderStore,
  lspConfig: ParsedLspConfig
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
          semanticTokens: {
            dynamicRegistration: true,
            requests: {
              range: false,
              full: {
                delta: false,
              },
            },
            tokenTypes: [
              'namespace',
              'type',
              'class',
              'enum',
              'interface',
              'struct',
              'typeParameter',
              'parameter',
              'variable',
              'property',
              'enumMember',
              'event',
              'function',
              'method',
              'macro',
              'keyword',
              'modifier',
              'comment',
              'string',
              'number',
              'regexp',
              'operator',
              'decorator',
            ],
            tokenModifiers: [
              'declaration',
              'definition',
              'readonly',
              'static',
              'deprecated',
              'abstract',
              'async',
              'modification',
              'documentation',
              'defaultLibrary',
            ],
            formats: ['relative'],
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

    // Initialize workspace loader based on LSP configuration
    await initializeWorkspaceLoader(client, config, workspaceLoaderStore, lspConfig);

    // Extract diagnostic providers from server capabilities
    extractDiagnosticProvidersFromCapabilities(initResult.capabilities, diagnosticProviderStore);

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

/**
 * Initialize workspace loader based on LSP configuration - Pure Functional Approach
 */
async function initializeWorkspaceLoader(
  client: LspClient,
  config: LspConfig,
  workspaceLoaderStore: WorkspaceLoaderStore,
  lspConfig: ParsedLspConfig
): Promise<void> {
  try {
    // Get workspace loader type from config, default to 'default'
    const loaderType = lspConfig.workspace_loader || 'default';
    
    // Create workspace loader using factory
    const loader = createWorkspaceLoader(loaderType);
    workspaceLoaderStore.setLoader(loader);

    // Initialize workspace using pure functions
    const initialState = await loader.initialize(client, config);
    workspaceLoaderStore.setState(initialState);

    logger.info('Workspace loader initialized', {
      loaderType,
      workspaceType: initialState.type,
      ready: initialState.ready
    });
  } catch (error) {
    logger.error('Failed to initialize workspace loader', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    
    // On error, fall back to default loader in ready state
    const defaultLoader = createWorkspaceLoader('default');
    workspaceLoaderStore.setLoader(defaultLoader);
    const fallbackState = await defaultLoader.initialize(client, config);
    workspaceLoaderStore.setState(fallbackState);
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

function extractDiagnosticProvidersFromCapabilities(
  capabilities: unknown,
  diagnosticProviderStore: DiagnosticProviderStore
): void {
  try {
    // Check if server supports diagnostics through capabilities  
    const diagnosticProvider = (capabilities as { diagnosticProvider?: unknown }).diagnosticProvider;
    if (diagnosticProvider) {
      logger.debug('Found diagnostic provider in server capabilities', { 
        provider: diagnosticProvider 
      });

      const typedProvider = diagnosticProvider as {
        documentSelector?: DiagnosticProvider['documentSelector'];
        interFileDependencies?: boolean;
        workspaceDiagnostics?: boolean;
      };

      const provider: DiagnosticProvider = {
        id: 'server-capabilities',
        ...(typedProvider.documentSelector && { documentSelector: typedProvider.documentSelector }),
        ...(typedProvider.interFileDependencies !== undefined && { interFileDependencies: typedProvider.interFileDependencies }),
        ...(typedProvider.workspaceDiagnostics !== undefined && { workspaceDiagnostics: typedProvider.workspaceDiagnostics }),
      };

      diagnosticProviderStore.addProvider(provider);
      logger.info('Added diagnostic provider from server capabilities', { 
        providerId: provider.id,
        workspaceDiagnostics: provider.workspaceDiagnostics,
        interFileDependencies: provider.interFileDependencies
      });
    } else {
      logger.debug('No diagnostic provider found in server capabilities');
    }
  } catch (error) {
    logger.error('Failed to extract diagnostic providers from capabilities', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

function setupNotificationHandlers(
  connection: rpc.MessageConnection,
  diagnosticsStore: DiagnosticsStore,
  diagnosticProviderStore: DiagnosticProviderStore,
  windowLogStore: WindowLogStore,
  workspaceLoaderStore?: WorkspaceLoaderStore
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
  connection.onRequest('client/registerCapability', (params: unknown) => {
    try {
      // Extract diagnostic providers from registration requests
      if (params && typeof params === 'object' && 'registrations' in params) {
        const registrations = (params as { registrations: Array<{
          id: string;
          method: string;
          registerOptions?: unknown;
        }> }).registrations;

        for (const registration of registrations) {
          if (registration.method === 'textDocument/diagnostic') {
            logger.debug('Found diagnostic provider in registration request', { 
              registrationId: registration.id,
              registerOptions: registration.registerOptions 
            });

            const registerOptions = registration.registerOptions as {
              documentSelector?: DiagnosticProvider['documentSelector'];
              interFileDependencies?: boolean;
              workspaceDiagnostics?: boolean;
            } | undefined;

            const provider: DiagnosticProvider = {
              id: registration.id,
              ...(registerOptions?.documentSelector && { documentSelector: registerOptions.documentSelector }),
              ...(registerOptions?.interFileDependencies !== undefined && { interFileDependencies: registerOptions.interFileDependencies }),
              ...(registerOptions?.workspaceDiagnostics !== undefined && { workspaceDiagnostics: registerOptions.workspaceDiagnostics }),
            };

            diagnosticProviderStore.addProvider(provider);
            logger.info('Added diagnostic provider from registration', { 
              providerId: provider.id,
              method: registration.method,
              hasDocumentSelector: !!provider.documentSelector
            });
          }
        }
      }
    } catch (error) {
      logger.error('Error processing capability registration', {
        error: error instanceof Error ? error.message : String(error),
        params: JSON.stringify(params)
      });
    }
    
    return {}; // Acknowledge
  });

  // Handle workspace notifications using functional workspace loaders
  connection.onNotification('workspace/projectInitializationComplete', () => {
    if (workspaceLoaderStore) {
      workspaceLoaderStore.updateState('workspace/projectInitializationComplete');
    }
  });

  // Handle C# Roslyn toast notifications (silent)
  connection.onNotification('window/_roslyn_showToast', (params: unknown) => {
    logger.debug('Received Roslyn toast notification', { params });
    if (workspaceLoaderStore) {
      workspaceLoaderStore.updateState('window/_roslyn_showToast');
    }
  });

  // Handle other notifications silently
  connection.onNotification(() => {
    // Silent handling of other notifications
  });
}
