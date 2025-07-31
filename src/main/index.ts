import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as path from 'path';

import {
  LspClient,
  LspConfig,
  LspContext,
  WorkspaceState,
  PreloadedFiles,
  DiagnosticsStore,
  WindowLogStore,
} from '../types.js';
import {
  createDiagnosticsStore,
  createWindowLogStore,
} from '../state/index.js';
import { createLspClient, initializeLspClient } from '../lsp-client.js';
import { openFileWithStrategy } from '../lsp/fileLifecycle/index.js';
import { getDefaultPreloadFiles } from '../utils/logLevel.js';
import { createServer } from './createServer.js';

// Module-level state
let lspClient: LspClient | null = null;
let preloadedFiles: PreloadedFiles = new Map();
let diagnosticsStore: DiagnosticsStore = createDiagnosticsStore();
let windowLogStore: WindowLogStore = createWindowLogStore();
let workspaceState: WorkspaceState = {
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

    const clientResult = await createLspClient(
      config,
      diagnosticsStore,
      windowLogStore
    );

    if (!clientResult.success) {
      throw new Error(clientResult.error.message);
    }

    const initResult = await initializeLspClient(clientResult.data, config);
    if (!initResult.success) {
      throw new Error(initResult.error.message);
    }

    lspClient = clientResult.data;

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
      if (!result.success) {
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
  // Initialize LSP connection
  await initializeLsp();

  // Create and configure MCP server
  const server = createServer(createContext);

  // Start receiving messages on stdin and sending messages on stdout
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
