/**
 * Inspect Tool - Comprehensive symbol information
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { LspContext, createOneBasedPosition } from '../types.js';
import * as LspOperations from '../lsp/operations/index.js';
import { symbolPositionSchema } from './schemas.js';
import { formatCursorContext } from '../utils/cursorContext.js';

export function registerInspectTool(
  server: McpServer,
  createContext: () => LspContext
) {
  server.registerTool(
    'inspect',
    {
      title: 'Inspect',
      description:
        'Inspects the given code symbol and gets comprehensive information including documentation and navigation to related locations like its own definition, its implementation, or its type declaration',
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

      const result = await LspOperations.inspectSymbol(ctx, symbolRequest);
      if (!result.success) throw new Error(result.error.message);

      // Format response with cursor context
      const { result: inspectData, cursorContext } = result.data;

      const responseText =
        'Symbol Inspection:\n\n' + JSON.stringify(inspectData, null, 2);

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
