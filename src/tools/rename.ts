/**
 * Rename Tool - Renames a code symbol across the codebase
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { LspContext, createOneBasedPosition } from '../types.js';
import * as LspOperations from '../lsp/operations/index.js';
import { renameSchema } from './schemas.js';
import { formatCursorContext } from '../utils/cursorContext.js';
import { applyWorkspaceChanges, formatRenameResults } from './utils.js';

export function registerRenameTool(
  server: McpServer,
  createContext: () => LspContext
) {
  server.registerTool(
    'rename',
    {
      title: 'Rename',
      description:
        'Renames all references of a given symbol across the codebase',
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
      if (!result.ok) throw new Error(result.error.message);

      // Format response with cursor context
      const { result: renameResult, cursorContext } = result.data;

      // Apply workspace changes to files
      const changeResults = await applyWorkspaceChanges(renameResult);

      // Extract symbol name from cursor context or use generic fallback
      const symbolName = cursorContext?.symbolName || 'symbol';
      const newName = request.newName;

      // Format the results
      const formattedResults = await formatRenameResults(
        changeResults,
        symbolName,
        newName
      );

      const content: Array<{ type: 'text'; text: string }> = [];

      // Add cursor context if available
      if (cursorContext) {
        content.push({
          type: 'text' as const,
          text: formatCursorContext(cursorContext),
        });
      }

      // Add the formatted rename results
      content.push({ type: 'text' as const, text: formattedResults });

      return { content };
    }
  );
}
