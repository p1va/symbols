/**
 * Completion Tool - Get code completion suggestions at a position
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { LspContext, createOneBasedPosition } from '../types.js';
import * as LspOperations from '../lsp/operations/index.js';
import { renameSchema } from './schemas.js';
import { formatCursorContext } from '../utils/cursorContext.js';

export function registerRenameTool(
  server: McpServer,
  createContext: () => LspContext
) {
  server.registerTool(
    'rename',
    {
      title: 'Rename',
      description: 'Renames a code symbol across the codebase',
      inputSchema: renameSchema,
    },
    async (request) => {
      const ctx = createContext();
      if (!ctx.client) throw new Error('LSP client not initialized');

      // Convert raw request to branded position type
      const renameRequest = {
        file: request.file,
        position: createOneBasedPosition(request.line, request.character),
        newName: request.newName,
      };

      const result = await LspOperations.rename(ctx, renameRequest);
      if (!result.success) throw new Error(result.error.message);

      // Format response with cursor context
      const { result: renameResult, cursorContext } = result.data;

      const responseText =
        `Rename operation completed. Changed ${renameResult.changeCount} file(s):\n\n` +
        JSON.stringify(renameResult.changes, null, 2);

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
