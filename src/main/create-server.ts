import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { LspManager } from '../runtime/lsp-manager.js';
import { registerAllTools } from '../tools/index.js';

/**
 * Creates and configures an MCP server with all LSP tools registered
 */
export function createServer(manager: LspManager): McpServer {
  const server = new McpServer({
    name: 'symbols',
    version: '1.0.0',
  });

  registerAllTools(server, manager);

  return server;
}
