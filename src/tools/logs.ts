/**
 * Window Log Messages Tool - Get LSP server log messages
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as LspOperations from '../lsp/operations/index.js';
import { logsSchema } from './schemas.js';
import { validateLogs } from './validation.js';
import type { LspManager } from '../runtime/lsp-manager.js';
import { formatWindowLogMessages } from '../utils/window-logs.js';

export function registerWindowLogsTool(server: McpServer, manager: LspManager) {
  server.registerTool(
    'logs',
    {
      title: 'Logs',
      description: 'Retrieve logs from the Language Server for troubleshooting',
      inputSchema: logsSchema,
    },
    (request) => {
      const validatedRequest = validateLogs(request);
      const sessions = manager.getStartedSessions(validatedRequest.profile);

      if (sessions.length === 0) {
        if (validatedRequest.profile) {
          const profile = manager.getProfileStatus(validatedRequest.profile);
          if (!profile) {
            throw new Error(
              `Unknown LSP profile '${validatedRequest.profile}'.`
            );
          }
          return {
            content: [
              {
                type: 'text' as const,
                text: `Profile '${validatedRequest.profile}' is not running. Run an LSP-backed tool on a matching file first.`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: 'No running LSP sessions. Call an LSP-backed file tool first.',
            },
          ],
        };
      }

      const sections: string[] = [];

      for (const session of sessions) {
        const result = LspOperations.logs(session);
        const profileName = session.getProfile().name;
        if (!result.ok) {
          sections.push(`Profile: ${profileName}\n${result.error.message}`);
          continue;
        }

        sections.push(
          `Profile: ${profileName}\n${formatWindowLogMessages(result.data)}`
        );
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: sections.join('\n\n'),
          },
        ],
      };
    }
  );
}
