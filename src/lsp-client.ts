/**
 * LSP Client management - spawning, initialization, and connection lifecycle
 * Based on working patterns from playground/dotnet.ts
 */

import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
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
      environment: lspConfig.environment
        ? Object.keys(lspConfig.environment)
        : 'none',
    });

    // Set up environment variables if specified
    const env = lspConfig.environment
      ? {
          ...process.env,
          ...lspConfig.environment,
          SYMBOLS_WORKSPACE_NAME: workspaceConfig.workspaceName,
        }
      : {
          ...process.env,
          SYMBOLS_WORKSPACE_NAME: workspaceConfig.workspaceName,
        };

    logger.debug('Spawning LSP server process', {
      commandName: lspConfig.commandName,
      commandArgs: lspConfig.commandArgs,
      hasCustomEnv: !!lspConfig.environment,
    });

    // Centralized environment variable substitution and trimming
    const expandEnvVarsWithCustomEnv = (
      str: string,
      environment: NodeJS.ProcessEnv
    ): string => {
      return str
        .trim()
        .replace(/\$([A-Z_][A-Z0-9_]*)/g, (_, varName: string) => {
          return environment[varName] || `$${varName}`;
        });
    };

    // Trim and expand environment variables in command and args
    const processedCommandName = expandEnvVarsWithCustomEnv(
      lspConfig.commandName,
      env
    );
    const processedCommandArgs = lspConfig.commandArgs.map((arg) =>
      expandEnvVarsWithCustomEnv(arg, env)
    );

    logger.debug('Processed LSP command with environment variables', {
      originalCommand: `${lspConfig.commandName} ${lspConfig.commandArgs.join(' ')}`,
      processedCommand: `${processedCommandName} ${processedCommandArgs.join(' ')}`,
      workspaceName: workspaceConfig.workspaceName,
      symbolsWorkspaceName: env.SYMBOLS_WORKSPACE_NAME,
    });

    // Check if command exists before spawning (comprehensive validation)
    logger.debug('Validating LSP server binary exists');

    try {
      // Cross-platform path detection: absolute paths, relative paths, or paths with separators
      const isPath =
        path.isAbsolute(processedCommandName) ||
        processedCommandName.includes(path.sep) ||
        processedCommandName.includes('/');

      if (isPath) {
        // Absolute or relative path - already processed (trimmed and env expanded)
        const expandedPath = processedCommandName;

        if (!fs.existsSync(expandedPath)) {
          throw new Error(
            `LSP server binary does not exist: ${expandedPath} (original: ${lspConfig.commandName})`
          );
        }

        // Check if it's executable
        try {
          fs.accessSync(expandedPath, fs.constants.X_OK);
        } catch {
          throw new Error(
            `LSP server binary is not executable: ${expandedPath} (original: ${lspConfig.commandName})`
          );
        }
      } else {
        // Command name only - check if it exists in PATH (cross-platform)
        try {
          const isWindows = process.platform === 'win32';
          const whichCommand = isWindows ? 'where' : 'which';
          const result = cp.execSync(
            `${whichCommand} "${processedCommandName}"`,
            {
              encoding: 'utf8',
              stdio: ['ignore', 'pipe', 'ignore'],
            }
          );
          const commandPath = result.trim();

          if (!commandPath) {
            throw new Error(
              `LSP server command not found in PATH: ${processedCommandName}`
            );
          }

          logger.debug('Found LSP server in PATH', {
            commandName: processedCommandName,
            resolvedPath: commandPath,
            platform: process.platform,
          });
        } catch {
          throw new Error(
            `LSP server command not found in PATH: ${processedCommandName}. ` +
              `Please ensure it's installed and available in your PATH.`
          );
        }
      }
    } catch (error) {
      logger.error('LSP server binary validation failed', {
        commandName: processedCommandName,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    // Command and args are already processed (trimmed and env-expanded)

    logger.info('Spawning LSP server', {
      originalCommand: lspConfig.commandName,
      processedCommand: processedCommandName,
      originalArgs: lspConfig.commandArgs,
      processedArgs: processedCommandArgs,
      workingDirectory: process.cwd(),
      hasCustomEnv: !!lspConfig.environment,
    });

    // Spawn the configured Language Server
    const serverProcess = cp.spawn(processedCommandName, processedCommandArgs, {
      env,
      // 1st stdin, 2nd stdout, 3rd stderr
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    logger.info(`LSP server process spawned with PID: ${serverProcess.pid}`);

    // Handle process errors and stderr with enhanced logging
    serverProcess.on('error', (error) => {
      logger.error('[LSP-ERROR]', {
        error: error.message,
        stack: error.stack,
        errno: (error as NodeJS.ErrnoException).errno,
        code: (error as NodeJS.ErrnoException).code,
        syscall: (error as NodeJS.ErrnoException).syscall,
        path: (error as NodeJS.ErrnoException).path,
        processedCommand: processedCommandName,
        processedArgs: processedCommandArgs,
      });
    });

    serverProcess.on('exit', (code, signal) => {
      logger.warn('[LSP-EXIT]', {
        code,
        signal,
        pid: serverProcess.pid,
        processedCommand: processedCommandName,
        processedArgs: processedCommandArgs,
        exitReason: code !== null ? `exit code ${code}` : `signal ${signal}`,
      });
    });

    // Check if process spawned successfully
    if (!serverProcess.pid) {
      throw new Error(
        `Failed to spawn LSP server process. ` +
          `Command: ${processedCommandName}, Args: [${processedCommandArgs.join(', ')}]. ` +
          `Check if the binary exists and is executable.`
      );
    }

    // Log stderr output from LSP server
    if (serverProcess.stderr) {
      //serverProcess.stderr.setEncoding('utf8');
      serverProcess.stderr.on('data', (data: Buffer | string) => {
        const message =
          typeof data === 'string' ? data.trim() : data.toString('utf8').trim();
        if (message) {
          logger.debug('[LSP-STDERR]', { message });
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

      if (method === 'workspace/configuration') {
        return [];
      }

      // Return null instead of MethodNotFound error to prevent LSP crashes
      // Some LSPs (like pyright) crash when receiving MethodNotFound responses
      // for requests they send that we don't handle (e.g., textDocument/semanticTokens/full)
      return null;
    });

    // Log connection errors
    connection.onError((error) => {
      logger.error('LSP connection error', {
        error: error instanceof Error ? error.message : JSON.stringify(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    });

    // Log connection close
    connection.onClose(() => {
      logger.warn('LSP connection closed');
    });

    // Set up notification handlers before listening
    logger.debug('Setting up LSP notification handlers');
    setupNotificationHandlers(
      connection,
      diagnosticsStore,
      diagnosticProviderStore,
      windowLogStore,
      workspaceLoaderStore
    );

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
      hasProcessId: client.processId !== undefined,
    });

    return { ok: true, data: result };
  } catch (error) {
    logger.error('Failed to create LSP client', {
      lspName: lspConfig.name,
      command: `${lspConfig.commandName} ${lspConfig.commandArgs.join(' ')}`,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
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
    await initializeWorkspaceLoader(
      client,
      config,
      workspaceLoaderStore,
      lspConfig
    );

    // Extract diagnostic providers from server capabilities
    extractDiagnosticProvidersFromCapabilities(
      initResult.capabilities,
      diagnosticProviderStore
    );

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
      ready: initialState.ready,
    });
  } catch (error) {
    logger.error('Failed to initialize workspace loader', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
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
      await client.connection.sendRequest('shutdown');
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
    const diagnosticProvider = (
      capabilities as { diagnosticProvider?: unknown }
    ).diagnosticProvider;
    if (diagnosticProvider) {
      logger.debug('Found diagnostic provider in server capabilities', {
        provider: diagnosticProvider,
      });

      const typedProvider = diagnosticProvider as {
        documentSelector?: DiagnosticProvider['documentSelector'];
        interFileDependencies?: boolean;
        workspaceDiagnostics?: boolean;
      };

      const provider: DiagnosticProvider = {
        id: 'server-capabilities',
        ...(typedProvider.documentSelector && {
          documentSelector: typedProvider.documentSelector,
        }),
        ...(typedProvider.interFileDependencies !== undefined && {
          interFileDependencies: typedProvider.interFileDependencies,
        }),
        ...(typedProvider.workspaceDiagnostics !== undefined && {
          workspaceDiagnostics: typedProvider.workspaceDiagnostics,
        }),
      };

      diagnosticProviderStore.addProvider(provider);
      logger.info('Added diagnostic provider from server capabilities', {
        providerId: provider.id,
        workspaceDiagnostics: provider.workspaceDiagnostics,
        interFileDependencies: provider.interFileDependencies,
      });
    } else {
      logger.debug('No diagnostic provider found in server capabilities');
    }
  } catch (error) {
    logger.error('Failed to extract diagnostic providers from capabilities', {
      error: error instanceof Error ? error.message : String(error),
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
        const registrations = (
          params as {
            registrations: Array<{
              id: string;
              method: string;
              registerOptions?: unknown;
            }>;
          }
        ).registrations;

        for (const registration of registrations) {
          if (registration.method === 'textDocument/diagnostic') {
            logger.debug('Found diagnostic provider in registration request', {
              registrationId: registration.id,
              registerOptions: registration.registerOptions,
            });

            const registerOptions = registration.registerOptions as
              | {
                  documentSelector?: DiagnosticProvider['documentSelector'];
                  interFileDependencies?: boolean;
                  workspaceDiagnostics?: boolean;
                  identifier?: string;
                }
              | undefined;

            const provider: DiagnosticProvider = {
              id: registerOptions?.identifier || registration.id,
              ...(registerOptions?.documentSelector && {
                documentSelector: registerOptions.documentSelector,
              }),
              ...(registerOptions?.interFileDependencies !== undefined && {
                interFileDependencies: registerOptions.interFileDependencies,
              }),
              ...(registerOptions?.workspaceDiagnostics !== undefined && {
                workspaceDiagnostics: registerOptions.workspaceDiagnostics,
              }),
            };

            diagnosticProviderStore.addProvider(provider);
            logger.info('Added diagnostic provider from registration', {
              providerId: provider.id,
              method: registration.method,
              hasDocumentSelector: !!provider.documentSelector,
            });
          }
        }
      }
    } catch (error) {
      logger.error('Error processing capability registration', {
        error: error instanceof Error ? error.message : String(error),
        params: JSON.stringify(params),
      });
    }

    return {}; // Acknowledge
  });

  // Handle workspace notifications using functional workspace loaders
  connection.onNotification('workspace/projectInitializationComplete', () => {
    if (workspaceLoaderStore) {
      workspaceLoaderStore.updateState(
        'workspace/projectInitializationComplete'
      );
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
