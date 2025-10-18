import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ChildProcessWithoutNullStreams } from 'child_process';
import * as path from 'path';
import {
  parseCliArgs,
  resolveStartConfig,
  resolveRunConfig,
  handleConfigInit,
  handleConfigShow,
  handleConfigPath,
  StartCommandArgs,
  RunCommandArgs,
  ConfigCommandArgs,
} from '../utils/cli.js';

import { createLspClient, initializeLspClient } from '../lsp-client.js';
import { openFileWithStrategy } from '../lsp/file-lifecycle/index.js';
import {
  createDiagnosticsStore,
  createDiagnosticProviderStore,
  createWindowLogStore,
  createWorkspaceLoaderStore,
} from '../state/index.js';
import {
  DiagnosticsStore,
  DiagnosticProviderStore,
  LspClient,
  LspConfig,
  LspContext,
  PreloadedFiles,
  WindowLogStore,
  WorkspaceState,
  WorkspaceLoaderStore,
} from '../types.js';
import {
  getLspConfig,
  autoDetectLsp,
  listAvailableLsps,
  ParsedLspConfig,
  createConfigFromDirectCommand,
} from '../config/lsp-config.js';
import { getDefaultPreloadFiles } from '../utils/log-level.js';
import logger, { upgradeToContextualLogger } from '../utils/logger.js';
import { createServer } from './create-server.js';
import { setupShutdown } from './shutdown.js';

// Module-level state
let lspClient: LspClient | null = null;
let lspProcess: ChildProcessWithoutNullStreams | null = null;
let lspName: string = '';
let lspConfiguration: ParsedLspConfig | null = null;
let workspaceUri: string = '';
let workspacePath: string = '';
const preloadedFiles: PreloadedFiles = new Map();
const diagnosticsStore: DiagnosticsStore = createDiagnosticsStore();
const diagnosticProviderStore: DiagnosticProviderStore =
  createDiagnosticProviderStore();
const windowLogStore: WindowLogStore = createWindowLogStore();
const workspaceLoaderStore: WorkspaceLoaderStore = createWorkspaceLoaderStore();
const workspaceState: WorkspaceState = {
  isLoading: false,
  isReady: false,
};

/**
 * Initialize LSP connection for 'start' command
 */
async function initializeLspForStart(
  cliArgs: StartCommandArgs
): Promise<void> {
  try {
    const config = resolveStartConfig(cliArgs);
    logger.info('Resolved configuration', { config });

    // Set up workspace paths
    workspacePath = config.workspace;
    workspaceUri = `file://${path.resolve(workspacePath)}`;
    const workspaceName = path.basename(workspacePath);

    // Set log level from config (this will affect winston logger)
    if (process.env.SYMBOLS_LOGLEVEL !== config.loglevel) {
      process.env.SYMBOLS_LOGLEVEL = config.loglevel;
      logger.level = config.loglevel;
    }

    // Standard mode: use config file and auto-detection
    // Get LSP server name - try CLI args/environment, then auto-detection
    lspName = config.lsp || '';

    if (!lspName) {
      // Try auto-detection based on workspace files
      const detectedLsp = autoDetectLsp(workspacePath, config.configPath);
      if (detectedLsp) {
        lspName = detectedLsp;
        logger.info('Auto-detected LSP server', { lspName, workspacePath });
      } else {
        logger.error(
          'No LSP server could be auto-detected for this workspace',
          {
            workspacePath,
            availableLsps: listAvailableLsps(config.configPath),
          }
        );
        throw new Error(
          'No LSP server specified and none could be auto-detected. ' +
            'Please specify --lsp=<server> or ensure your workspace has recognizable project files.'
        );
      }
    } else {
      const source = cliArgs.lsp ? 'CLI argument' : 'environment variable';
      logger.info(`Using LSP from ${source}`, { lspName });
    }

    // Switch to contextual logger now that we know workspace and LSP
    logger.debug('Upgrading to contextual logging with workspace + LSP context');
    upgradeToContextualLogger(workspacePath, lspName);

    logger.info('Initializing LSP', {
      lspName,
      workspacePath,
    });

    // Load LSP configuration
    lspConfiguration = getLspConfig(
      lspName,
      config.configPath,
      config.workspace
    );
    if (!lspConfiguration) {
      logger.error(`LSP configuration not found for: ${lspName}`);
      throw new Error(`LSP configuration not found for: ${lspName}`);
    }

    logger.debug('LSP configuration loaded', {
      lspName,
      command: `${lspConfiguration.commandName} ${lspConfiguration.commandArgs.join(' ')}`,
      extensions: Object.keys(lspConfiguration.extensions),
      diagnosticsStrategy: lspConfiguration.diagnostics.strategy,
      diagnosticsWaitTimeout: lspConfiguration.diagnostics.wait_timeout_ms,
      workspaceLoader: lspConfiguration.workspace_loader || 'default',
      preloadFilesCount: lspConfiguration.preload_files?.length || 0,
      preloadFiles:
        lspConfiguration.preload_files && lspConfiguration.preload_files.length > 0
          ? lspConfiguration.preload_files
          : 'none',
    });

    const workspaceConfig: LspConfig = {
      workspaceUri,
      workspaceName,
      preloadFiles: lspConfiguration.preload_files || [],
    };

    const clientResult = createLspClient(
      workspaceConfig,
      lspConfiguration,
      diagnosticsStore,
      diagnosticProviderStore,
      windowLogStore,
      workspaceLoaderStore
    );

    if (!clientResult.ok) {
      throw new Error(clientResult.error.message);
    }

    const initResult = await initializeLspClient(
      clientResult.data.client,
      workspaceConfig,
      diagnosticProviderStore,
      workspaceLoaderStore,
      lspConfiguration
    );

    if (!initResult.ok) {
      throw new Error(initResult.error.message);
    }

    lspClient = clientResult.data.client;
    lspProcess = clientResult.data.process;

    // Initialize workspace by opening preloaded files
    await initializeWorkspace(
      workspaceConfig,
      config.configPath,
      config.workspace
    );
  } catch (error) {
    // Re-throw with original message - already clear and descriptive
    throw error instanceof Error
      ? error
      : new Error(String(error));
  }
}

/**
 * Initialize LSP connection for 'run' command (direct command mode)
 */
async function initializeLspForRun(cliArgs: RunCommandArgs): Promise<void> {
  try {
    const config = resolveRunConfig(cliArgs);
    logger.info('Resolved configuration', { config });

    // Set up workspace paths
    workspacePath = config.workspace;
    workspaceUri = `file://${path.resolve(workspacePath)}`;
    const workspaceName = path.basename(workspacePath);

    // Set log level from config
    if (process.env.SYMBOLS_LOGLEVEL !== config.loglevel) {
      process.env.SYMBOLS_LOGLEVEL = config.loglevel;
      logger.level = config.loglevel;
    }

    logger.debug('Direct command mode detected', {
      command: cliArgs.directCommand.commandName,
      args: cliArgs.directCommand.commandArgs,
    });

    // Create minimal config from direct command
    lspConfiguration = createConfigFromDirectCommand(
      cliArgs.directCommand.commandName,
      cliArgs.directCommand.commandArgs
    );
    lspName = lspConfiguration.name;

    logger.debug('Created LSP configuration from direct command', {
      lspName,
      command: cliArgs.directCommand.commandName,
      extensionsCount: Object.keys(lspConfiguration.extensions).length,
    });

    // Switch to contextual logger
    upgradeToContextualLogger(workspacePath, lspName);

    logger.debug('LSP configuration loaded', {
      lspName,
      command: `${lspConfiguration.commandName} ${lspConfiguration.commandArgs.join(' ')}`,
      extensions: Object.keys(lspConfiguration.extensions),
      diagnosticsStrategy: lspConfiguration.diagnostics.strategy,
      diagnosticsWaitTimeout: lspConfiguration.diagnostics.wait_timeout_ms,
      workspaceLoader: lspConfiguration.workspace_loader || 'default',
      preloadFilesCount: lspConfiguration.preload_files?.length || 0,
      preloadFiles:
        lspConfiguration.preload_files && lspConfiguration.preload_files.length > 0
          ? lspConfiguration.preload_files
          : 'none',
    });

    const workspaceConfig: LspConfig = {
      workspaceUri,
      workspaceName,
      preloadFiles: lspConfiguration.preload_files || [],
    };

    const clientResult = createLspClient(
      workspaceConfig,
      lspConfiguration,
      diagnosticsStore,
      diagnosticProviderStore,
      windowLogStore,
      workspaceLoaderStore
    );

    if (!clientResult.ok) {
      throw new Error(clientResult.error.message);
    }

    const initResult = await initializeLspClient(
      clientResult.data.client,
      workspaceConfig,
      diagnosticProviderStore,
      workspaceLoaderStore,
      lspConfiguration
    );

    if (!initResult.ok) {
      throw new Error(initResult.error.message);
    }

    lspClient = clientResult.data.client;
    lspProcess = clientResult.data.process;

    // Initialize workspace by opening preloaded files
    await initializeWorkspace(
      workspaceConfig,
      undefined,
      config.workspace
    );
  } catch (error) {
    // Re-throw with original message - already clear and descriptive
    throw error instanceof Error
      ? error
      : new Error(String(error));
  }
}

/**
 * Initialize workspace by opening preloaded files to trigger project loading
 */
async function initializeWorkspace(
  config: LspConfig,
  configPath?: string,
  workspacePath?: string
): Promise<void> {
  if (!lspClient) {
    throw new Error('LSP client not initialized');
  }

  workspaceState.isLoading = true;
  workspaceState.loadingStartedAt = new Date();

  try {
    // Get preloaded files from config or use defaults
    const filesToOpen = config.preloadFiles || getDefaultPreloadFiles();

    if (filesToOpen.length === 0) {
      // No preloaded files specified - workspace symbol search may not work until a file is opened
      workspaceState.isLoading = false;
      workspaceState.isReady = true;
      workspaceState.readyAt = new Date();
      return;
    }

    // Open each preloaded file
    for (const filePath of filesToOpen) {
      // Opening preloaded file: ${filePath}
      const result = await openFileWithStrategy(
        lspClient,
        filePath,
        preloadedFiles,
        'persistent',
        configPath,
        workspacePath
      );
      if (!result.ok) {
        // Failed to open preloaded file ${filePath}: ${result.error}
      }
    }

    workspaceState.isLoading = false;
    workspaceState.isReady = true;
    workspaceState.readyAt = new Date();

    // Workspace initialized with ${filesToOpen.length} preloaded files
  } catch (error) {
    workspaceState.isLoading = false;
    throw new Error(
      `Failed to initialize workspace: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Factory function to create LspContext after LSP client is initialized
 */
function createContext(): LspContext {
  if (!lspClient) {
    throw new Error('LSP client not initialized - cannot create context');
  }

  return {
    client: lspClient,
    preloadedFiles,
    diagnosticsStore,
    diagnosticProviderStore,
    windowLogStore,
    workspaceState,
    workspaceUri,
    workspacePath,
    lspName,
    lspConfig: lspConfiguration,
  };
}

/**
 * Main entry point - routes commands and starts appropriate handlers
 */
export async function main(): Promise<void> {
  logger.debug('MCP server starting up');

  // Parse CLI arguments
  const cliArgs = parseCliArgs();
  logger.debug('Parsed CLI arguments', { command: cliArgs.command });

  // Handle config subcommands (these exit after completion)
  if (cliArgs.command === 'config') {
    const configArgs = cliArgs as ConfigCommandArgs;
    if (configArgs.subcommandArgs.subcommand === 'init') {
      await handleConfigInit(configArgs.subcommandArgs);
      process.exit(0);
    } else if (configArgs.subcommandArgs.subcommand === 'show') {
      handleConfigShow(configArgs.subcommandArgs);
      process.exit(0);
    } else if (configArgs.subcommandArgs.subcommand === 'path') {
      handleConfigPath(configArgs.subcommandArgs);
      process.exit(0);
    }
  }

  // Handle start command (standard MCP server mode)
  if (cliArgs.command === 'start') {
    await initializeLspForStart(cliArgs as StartCommandArgs);
  }
  // Handle run command (direct command mode)
  else if (cliArgs.command === 'run') {
    await initializeLspForRun(cliArgs as RunCommandArgs);
  }
  // No command or unknown command - show help
  else {
    console.error('Please specify a command: start, run, or config');
    console.error('Run "symbols --help" for usage information');
    process.exit(1);
  }

  // Ensure both client and process are available for shutdown
  if (!lspClient || !lspProcess) {
    throw new Error('LSP client or process not initialized');
  }

  // Create and configure MCP server
  const server = createServer(createContext);

  // Set up graceful shutdown handling
  setupShutdown(server, lspClient, lspProcess);

  // Start receiving messages on stdin and sending messages on stdout
  logger.debug('Starting MCP server transport');
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('MCP server ready');
}
