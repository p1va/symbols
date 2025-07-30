/**
 * Read Tool - Read all symbols in a code file
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { LspContext } from '../types.js';
import * as LspOperations from '../lsp/operations/index.js';
import { fileSchema } from './schemas.js';

export function registerReadTool(
  server: McpServer,
  createContext: () => LspContext
) {
  server.registerTool(
    'read',
    {
      title: 'Read',
      description: 'Reads all symbols in a code file',
      inputSchema: fileSchema,
    },
    async (request) => {
      const ctx = createContext();
      if (!ctx.client) throw new Error('LSP client not initialized');

      const result = await LspOperations.readSymbols(ctx, request);
      if (!result.success) throw new Error(result.error.message);

      return {
        content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }],
      };
    }
  );
}
