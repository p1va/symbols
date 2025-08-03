import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ChildProcessWithoutNullStreams } from 'child_process';
import * as path from 'path';

import { createLspClient, initializeLspClient } from '../lsp-client.js';
import { openFileWithStrategy } from '../lsp/fileLifecycle/index.js';
import {
  createDiagnosticsStore,
  createWindowLogStore,
} from '../state/index.js';
import {
  DiagnosticsStore,
  LspClient,
  LspConfig,
  LspContext,
  PreloadedFiles,
  WindowLogStore,
  WorkspaceState,
} from '../types.js';
import { getDefaultPreloadFiles } from '../utils/logLevel.js';
import logger from '../utils/logger.js';
import { createServer } from './createServer.js';
import { setupShutdown } from './shutdown.js';

// Module-level state
let lspClient: LspClient | null = null;
let lspProcess: ChildProcessWithoutNullStreams | null = null;
const preloadedFiles: PreloadedFiles = new Map();
const diagnosticsStore: DiagnosticsStore = createDiagnosticsStore();
const windowLogStore: WindowLogStore = createWindowLogStore();
const workspaceState: WorkspaceState = {
  isLoading: false,
  isReady: false,
};

/**
 * Initialize LSP connection
 */
async function initializeLsp(): Promise<void> {
  try {
    const workspacePath = process.cwd();
    // TODO: this has a file prefix but is a folder?
    const workspaceUri = `file://${path.resolve(workspacePath)}`;
    const workspaceName = path.basename(workspacePath);

    const config: LspConfig = {
      workspaceUri,
      workspaceName,
      preloadFiles: [
        './src/index.ts',
        './src/types.ts',
        './src/lsp-operations.ts',
      ],
    };

    const clientResult = createLspClient(
      config,
      diagnosticsStore,
      windowLogStore
    );

    if (!clientResult.ok) {
      throw new Error(clientResult.error.message);
    }

    const initResult = await initializeLspClient(
      clientResult.data.client,
      config
    );
    if (!initResult.ok) {
      throw new Error(initResult.error.message);
    }

    lspClient = clientResult.data.client;
    lspProcess = clientResult.data.process;

    // Initialize workspace by opening preloaded files
    await initializeWorkspace(config);
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
    windowLogStore,
    workspaceState,
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
