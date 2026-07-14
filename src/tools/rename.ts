/**
 * Rename Tool - Renames a code symbol across the codebase
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createOneBasedPosition } from '../types.js';
import { prepareRenameRequest } from '../preparation.js';
import * as LspOperations from '../lsp/operations/index.js';
import { renameSchema } from './schemas.js';
import { formatCursorContext } from '../utils/cursor-context.js';
import { formatRenameResults } from './utils.js';
import {
  applyPreparedWorkspaceChanges,
  prepareWorkspaceChanges,
} from './workspace-edits.js';
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
      const changePlan = await prepareWorkspaceChanges(
        renameResult,
        session.getProfile().workspacePath
      );
      const changeResults = await applyPreparedWorkspaceChanges(changePlan);
      const affectedFilePaths = changePlan.files
        .filter((file) => file.updatedContent !== file.originalContent)
        .map((file) => file.filePath);
      const refreshErrors: string[] = [];
      for (const startedSession of manager.getStartedSessions()) {
        try {
          await startedSession.refreshOpenDocuments(affectedFilePaths);
        } catch (error) {
          refreshErrors.push(
            `${startedSession.getProfile().name}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
      const symbolName = cursorContext?.symbolName || 'symbol';
      const newName = validatedRequest.newName;
      const formattedResults = await formatRenameResults(
        changeResults,
        symbolName,
        newName,
        session.getProfile().workspacePath
      );

      const content: Array<{ type: 'text'; text: string }> = [];

      if (cursorContext) {
        content.push({
          type: 'text' as const,
          text: formatCursorContext(
            cursorContext,
            session.getProfile().workspacePath
          ),
        });
      }

      content.push({ type: 'text' as const, text: formattedResults });

      if (refreshErrors.length > 0) {
        content.push({
          type: 'text' as const,
          text: `Rename was written, but some open Language Server documents could not be refreshed:\n${refreshErrors.map((error) => `- ${error}`).join('\n')}`,
        });
      }

      return { content };
    }
  );
}
