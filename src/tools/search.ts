/**
 * Search Tool - Search for symbols across the workspace
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { LspContext } from '../types.js';
import * as LspOperations from '../lsp/operations/index.js';
import { searchSchema } from './schemas.js';

export function registerSearchTool(
  server: McpServer,
  createContext: () => LspContext
) {
  server.registerTool(
    'search',
    {
      title: 'Search',
      description: 'Search for symbols across the workspace',
      inputSchema: searchSchema,
    },
    async (request) => {
      const ctx = createContext();
      if (!ctx.client) throw new Error('LSP client not initialized');

      const result = await LspOperations.searchSymbols(ctx, request);
      if (!result.success) throw new Error(result.error.message);

      return {
        content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }],
      };
    }
  );
}
