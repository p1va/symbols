/**
 * Completion Tool - Get code completion suggestions at a position
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { LspContext, createOneBasedPosition } from '../types.js';
import * as LspOperations from '../lsp/operations/index.js';
import { symbolPositionSchema } from './schemas.js';
import { formatCursorContext } from '../utils/cursorContext.js';

export function registerCompletionTool(
  server: McpServer,
  createContext: () => LspContext
) {
  server.registerTool(
    'completion',
    {
      title: 'Completion',
      description: 'Get code completion suggestions at a position',
      inputSchema: symbolPositionSchema,
    },
    async (request) => {
      const ctx = createContext();
      if (!ctx.client) throw new Error('LSP client not initialized');

      // Convert raw request to branded position type
      const symbolRequest = {
        file: request.file,
        position: createOneBasedPosition(request.line, request.character),
      };

      const result = await LspOperations.completion(ctx, symbolRequest);
      if (!result.success) throw new Error(result.error.message);

      // Format response with cursor context
      const { result: completions, cursorContext } = result.data;

      const responseText =
        `Found ${completions.length} completion suggestion(s):\n\n` +
        JSON.stringify(completions, null, 2);

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
