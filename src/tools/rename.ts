/**
 * Rename Tool - Renames a code symbol across the codebase
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createOneBasedPosition } from '../types.js';
import { prepareRenameRequest } from '../preparation.js';
import * as LspOperations from '../lsp/operations/index.js';
import { renameSchema } from './schemas.js';
import { formatCursorContext } from '../utils/cursor-context.js';
import { applyWorkspaceChanges, formatRenameResults } from './utils.js';
import { validateRename } from './validation.js';
import type { LspManager } from '../runtime/lsp-manager.js';

export function registerRenameTool(server: McpServer, manager: LspManager) {
  server.registerTool(
    'rename',
    {
      title: 'Rename',
      description:
        'Rename the symbol at a file position across the workspace using language-server rename support.',
      inputSchema: renameSchema,
    },
    async (request) => {
      const validatedRequest = validateRename(request);
      const session = await manager.getSessionForFile(validatedRequest.file);

      const renameRequest = {
        file: validatedRequest.file,
        position: createOneBasedPosition(
          validatedRequest.line,
          validatedRequest.character
        ),
        newName: validatedRequest.newName,
      };

      const prepared = await prepareRenameRequest(session, renameRequest);
      if (!prepared.ok) throw new Error(prepared.error.message);

      const result = await LspOperations.rename(session, prepared.data);
      if (!result.ok) throw new Error(result.error.message);

      const { result: renameResult, cursorContext } = result.data;
      const changeResults = await applyWorkspaceChanges(renameResult);
      const symbolName = cursorContext?.symbolName || 'symbol';
      const newName = validatedRequest.newName;
      const formattedResults = await formatRenameResults(
        changeResults,
        symbolName,
        newName
      );

      const content: Array<{ type: 'text'; text: string }> = [];

      if (cursorContext) {
        content.push({
          type: 'text' as const,
          text: formatCursorContext(cursorContext),
        });
      }

      content.push({ type: 'text' as const, text: formattedResults });

      return { content };
    }
  );
}
