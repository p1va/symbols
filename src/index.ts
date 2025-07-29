import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as path from 'path';
import * as fs from 'fs';

import {
  LspClient,
  LspConfig,
  LspContext,
  WorkspaceState,
  PreloadedFiles,
  DiagnosticsStore,
  WindowLogStore,
  SymbolPositionRequest,
  FileRequest,
  SearchRequest,
  RenameRequest,
} from './types';
import { createDiagnosticsStore, createWindowLogStore } from './stores';
import { createLspClient, initializeLspClient } from './lsp-client';
import { openFileForLsp } from './file-lifecycle';
import * as LspOperations from './lsp-operations';

// Module-level state
let lspClient: LspClient | null = null;
let preloadedFiles: PreloadedFiles = new Map();
let diagnosticsStore: DiagnosticsStore = createDiagnosticsStore();
let windowLogStore: WindowLogStore = createWindowLogStore();
let workspaceState: WorkspaceState = {
  isLoading: false,
  isReady: false,
};

// Helper function to convert log level numbers to readable names
function getLogLevelName(type: number): string {
  switch (type) {
    case 1:
      return 'Error';
    case 2:
      return 'Warning';
    case 3:
      return 'Info';
    case 4:
      return 'Log';
    default:
      return 'Unknown';
  }
}

// Create an MCP server
const server = new McpServer({
  name: 'lsp-use',
  version: '1.0.0',
});

// Initialize LSP connection on startup
async function initializeLsp(): Promise<void> {
  try {
    const workspacePath = process.cwd();
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

// Initialize workspace by opening preloaded files to trigger project loading
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
      const result = await openFileForLsp(lspClient, filePath, preloadedFiles);
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

// Get default preloaded files based on common TypeScript patterns
function getDefaultPreloadFiles(): string[] {
  const candidates = [
    './src/index.ts',
    './src/main.ts',
    './src/app.ts',
    './index.ts',
    './main.ts',
  ];

  // Return the first file that exists
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        return [candidate];
      }
    } catch {
      // Ignore errors and continue
    }
  }

  return [];
}

// Factory function to create LspContext after LSP client is initialized
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

// Schema definitions for MCP tools
const symbolPositionSchema = {
  file: z.string(),
  line: z.number(),
  character: z.number(),
} as const;

const fileSchema = {
  file: z.string(),
} as const;

const searchSchema = {
  query: z.string(),
} as const;

const renameSchema = {
  file: z.string(),
  line: z.number(),
  character: z.number(),
  newName: z.string(),
} as const;

// Register the 8 MCP tools
server.registerTool(
  'inspect',
  {
    title: 'Inspect',
    description:
      'Get comprehensive symbol information including hover info and all navigation results',
    inputSchema: symbolPositionSchema,
  },
  async (request) => {
    if (!lspClient) throw new Error('LSP client not initialized');
    const ctx = createContext();
    const result = await LspOperations.inspectSymbol(ctx, request);
    if (!result.success) throw new Error(result.error.message);
    return {
      content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }],
    };
  }
);

server.registerTool(
  'find_references',
  {
    title: 'Find References',
    description: 'Find all references of a symbol',
    inputSchema: symbolPositionSchema,
  },
  async (request) => {
    if (!lspClient) throw new Error('LSP client not initialized');
    const ctx = createContext();
    const result = await LspOperations.findReferences(ctx, request);
    if (!result.success) throw new Error(result.error.message);
    return {
      content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }],
    };
  }
);

server.registerTool(
  'completion',
  {
    title: 'Completion',
    description: 'Get code completion suggestions at a position',
    inputSchema: symbolPositionSchema,
  },
  async (request) => {
    if (!lspClient) throw new Error('LSP client not initialized');
    const ctx = createContext();
    const result = await LspOperations.getCompletion(ctx, request);
    if (!result.success) throw new Error(result.error.message);
    return {
      content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }],
    };
  }
);

server.registerTool(
  'search',
  {
    title: 'Search',
    description: 'Search for symbols across the workspace',
    inputSchema: searchSchema,
  },
  async (request) => {
    if (!lspClient) throw new Error('LSP client not initialized');
    const ctx = createContext();
    const result = await LspOperations.searchSymbols(ctx, request);
    if (!result.success) throw new Error(result.error.message);
    return {
      content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }],
    };
  }
);

server.registerTool(
  'read',
  {
    title: 'Read',
    description: 'Read all symbols in a document',
    inputSchema: fileSchema,
  },
  async (request) => {
    if (!lspClient) throw new Error('LSP client not initialized');
    const ctx = createContext();
    const result = await LspOperations.readSymbols(ctx, request);
    if (!result.success) throw new Error(result.error.message);
    return {
      content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }],
    };
  }
);

server.registerTool(
  'get_diagnostics',
  {
    title: 'Get Diagnostics',
    description: 'Get diagnostics (errors/warnings) for a file',
    inputSchema: fileSchema,
  },
  async (request) => {
    if (!lspClient) throw new Error('LSP client not initialized');
    const ctx = createContext();
    const result = await LspOperations.getDiagnostics(ctx, request);
    if (!result.success) throw new Error(result.error.message);
    return {
      content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }],
    };
  }
);

server.registerTool(
  'rename_symbol',
  {
    title: 'Rename Symbol',
    description: 'Rename a symbol across the codebase',
    inputSchema: renameSchema,
  },
  async (request) => {
    if (!lspClient) throw new Error('LSP client not initialized');
    const ctx = createContext();
    const result = await LspOperations.renameSymbol(ctx, request);
    if (!result.success) throw new Error(result.error.message);
    return {
      content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }],
    };
  }
);

server.registerTool(
  'get_window_log_messages',
  {
    title: 'Get Window Log Messages',
    description: 'Get LSP server log messages',
    inputSchema: {} as const,
  },
  async () => {
    if (!lspClient) throw new Error('LSP client not initialized');
    const ctx = createContext();
    const result = await LspOperations.getWindowLogMessages(ctx);
    if (!result.success) throw new Error(result.error.message);

    // Format each log message as a separate content entry
    const content = result.data.map((msg: any) => {
      const logLevel = getLogLevelName(msg.type);
      return {
        type: 'text' as const,
        text: `[${logLevel}] ${msg.message}`,
      };
    });

    // If no messages, return a helpful message
    if (content.length === 0) {
      content.push({
        type: 'text' as const,
        text: 'No window log messages available',
      });
    }

    return { content };
  }
);

// Initialize LSP and start MCP server
await initializeLsp();

// Start receiving messages on stdin and sending messages on stdout
const transport = new StdioServerTransport();
await server.connect(transport);
