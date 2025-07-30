/**
 * Find References Tool - Find all references of a symbol
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { LspContext } from '../types.js';
import * as LspOperations from '../lsp/operations/index.js';
import { symbolPositionSchema } from './schemas.js';
import { formatCursorContext } from '../utils/cursorContext.js';

export function registerReferencesTool(
  server: McpServer,
  createContext: () => LspContext
) {
  server.registerTool(
    'references',
    {
      title: 'References',
      description: 'Finds all references of a given symbol across the codebase',
      inputSchema: symbolPositionSchema,
    },
    async (request) => {
      const ctx = createContext();
      if (!ctx.client) throw new Error('LSP client not initialized');

      const result = await LspOperations.findReferences(ctx, request);
      if (!result.success) throw new Error(result.error.message);

      // Format response with cursor context
      const { result: references, cursorContext } = result.data;

      const responseText =
        `Found ${references.length} reference(s):\n\n` +
        JSON.stringify(references, null, 2);

      const content: Array<{ type: 'text'; text: string }> = [];
      if (cursorContext) {
        content.push({
          type: 'text' as const,
          text: formatCursorContext(cursorContext),
        });
      }
      content.push({ type: 'text' as const, text: responseText });

      return { content };
    }
  );
}
