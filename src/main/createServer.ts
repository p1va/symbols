import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { LspContext } from '../types.js';
import { registerAllTools } from '../tools/index.js';

/**
 * Creates and configures an MCP server with all LSP tools registered
 */
export function createServer(createContext: () => LspContext): McpServer {
  const server = new McpServer({
    name: 'symbols',
    version: '1.0.0',
  });

  // Register all MCP tools
  registerAllTools(server, createContext);

  return server;
}
