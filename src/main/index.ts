import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ChildProcessWithoutNullStreams } from 'child_process';
import * as path from 'path';
import { parseCliArgs, showHelp, showConfig, resolveConfig } from '../utils/cli.js';

import { createLspClient, initializeLspClient } from '../lsp-client.js';
import { openFileWithStrategy } from '../lsp/fileLifecycle/index.js';
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
import { getLspConfig, autoDetectLsp, listAvailableLsps, ParsedLspConfig } from '../config/lsp-config.js';
import { getDefaultPreloadFiles } from '../utils/logLevel.js';
import logger, { upgradeToContextualLogger } from '../utils/logger.js';
import { createServer } from './createServer.js';
import { setupShutdown } from './shutdown.js';

// Module-level state
let lspClient: LspClient | null = null;
let lspProcess: ChildProcessWithoutNullStreams | null = null;
let lspName: string = '';
let lspConfig: ParsedLspConfig | null = null;
let workspaceUri: string = '';
let workspacePath: string = '';
const preloadedFiles: PreloadedFiles = new Map();
const diagnosticsStore: DiagnosticsStore = createDiagnosticsStore();
const diagnosticProviderStore: DiagnosticProviderStore = createDiagnosticProviderStore();
const windowLogStore: WindowLogStore = createWindowLogStore();
const workspaceLoaderStore: WorkspaceLoaderStore = createWorkspaceLoaderStore();
const workspaceState: WorkspaceState = {
  isLoading: false,
  isReady: false,
};

/**
 * Initialize LSP connection
 */
async function initializeLsp(): Promise<void> {
  try {
    // Log raw command line arguments for debugging
    logger.info('Raw command line arguments', { 
      argv: process.argv,
      cwd: process.cwd() 
    });
    
    // Parse CLI arguments and resolve configuration
    const cliArgs = parseCliArgs();
    logger.info('Parsed CLI arguments', { cliArgs });
    
    // Handle help request
    if (cliArgs.help) {
      showHelp();
      process.exit(0);
    }
    
    // Handle show config request
    if (cliArgs.showConfig) {
      showConfig(cliArgs.configPath);
      process.exit(0);
    }
    
    const config = resolveConfig(cliArgs);
    logger.info('Resolved configuration', { config });
    
    // Set up workspace paths
    workspacePath = config.workspace;
    workspaceUri = `file://${path.resolve(workspacePath)}`;
    const workspaceName = path.basename(workspacePath);

    // Set log level from config (this will affect winston logger)
    if (process.env.LOGLEVEL !== config.loglevel) {
      process.env.LOGLEVEL = config.loglevel;
      logger.level = config.loglevel; // Update existing logger instance
    }

    // Get LSP server name - try CLI args/environment, then auto-detection, then default to typescript
    lspName = config.lsp || '';
    
    if (!lspName) {
      // Try auto-detection based on workspace files
      const detectedLsp = autoDetectLsp(workspacePath, config.configPath);
      if (detectedLsp) {
        lspName = detectedLsp;
        logger.info('Auto-detected LSP server', { lspName, workspacePath });
      } else {
        logger.error('No LSP server could be auto-detected for this workspace', { 
          workspacePath,
          availableLsps: listAvailableLsps(config.configPath)
        });
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
    logger.info('Upgrading to contextual logging with workspace + LSP context');
    upgradeToContextualLogger(workspacePath, lspName);

    logger.info('Initializing LSP client', {
      lspName,
      workspacePath,
      workspaceUri,
      workspaceName
    });

    // Load LSP configuration
    lspConfig = getLspConfig(lspName, config.configPath);
    if (!lspConfig) {
      logger.error(`LSP configuration not found for: ${lspName}`);
      throw new Error(`LSP configuration not found for: ${lspName}`);
    }

    logger.debug('LSP configuration loaded', {
      lspName,
      command: `${lspConfig.commandName} ${lspConfig.commandArgs.join(' ')}`,
      extensions: Object.keys(lspConfig.extensions),
      diagnosticsStrategy: lspConfig.diagnostics.strategy
    });

    const workspaceConfig: LspConfig = {
      workspaceUri,
      workspaceName,
      preloadFiles: ['./src/index.ts'],
    };

    const clientResult = createLspClient(
      workspaceConfig,
      lspConfig,
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
      lspConfig
    );
    if (!initResult.ok) {
      throw new Error(initResult.error.message);
    }

    lspClient = clientResult.data.client;
    lspProcess = clientResult.data.process;

    // Initialize workspace by opening preloaded files
    await initializeWorkspace(workspaceConfig);
  } catch (error) {
    throw new Error(
      `Failed to initialize LSP: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Initialize workspace by opening preloaded files to trigger project loading
 */
async function initializeWorkspace(config: LspConfig): Promise<void> {
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
        'persistent'
      );
      if (!result.ok) {
        // Failed to open preloaded file ${filePath}: ${result.error}
      }
    }

    // For TypeScript, assume workspace is ready after opening files
    // TODO: Research if TypeScript LSP sends completion notifications
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
    lspConfig,
  };
}

/**
 * Main entry point - initializes LSP and starts MCP server
 */
export async function main(): Promise<void> {
  logger.info('MCP server starting up');

  // Initialize LSP connection
  await initializeLsp();

  // Ensure both client and process are available for shutdown
  if (!lspClient || !lspProcess) {
    throw new Error('LSP client or process not initialized');
  }

  // Create and configure MCP server
  const server = createServer(createContext);

  // Set up graceful shutdown handling
  setupShutdown(server, lspClient, lspProcess);

  // Start receiving messages on stdin and sending messages on stdout
  logger.info('Starting MCP server transport');
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('MCP server connected and ready');
}
