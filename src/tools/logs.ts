/**
 * Window Log Messages Tool - Get LSP server log messages
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as LspOperations from '../lsp/operations/index.js';
import { getLogLevelName } from '../utils/log-level.js';
import { logsSchema } from './schemas.js';
import { validateLogs } from './validation.js';
import type { LspManager } from '../runtime/lsp-manager.js';

function getLogLevelSymbol(type: number): string {
  switch (type) {
    case 1:
      return '✘';
    case 2:
      return '⚠';
    case 3:
      return 'ℹ';
    case 4:
      return '•';
    default:
      return '?';
  }
}

function formatLogMessages(
  messages: Array<{ type: number; message: string }>
): string {
  if (messages.length === 0) {
    return 'No window log messages available';
  }

  const formattedMessages = messages.map((msg) => {
    const symbol = getLogLevelSymbol(msg.type);
    const level = getLogLevelName(msg.type);
    const message = msg.message.trim();
    const contextMatch = message.match(/^\[([^\]]+)\]/);
    const context = contextMatch ? contextMatch[1] : '';
    const content = contextMatch
      ? message.substring(contextMatch[0].length).trim()
      : message;

    if (context) {
      return `${symbol} [${level}] [${context}] ${content}`;
    }
    return `${symbol} [${level}] ${content}`;
  });

  return formattedMessages.join('\n');
}

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
                text: `Profile '${validatedRequest.profile}' is not running. Use setup start or setup restart first.`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: 'No running LSP sessions. Use setup start or call a file-based tool first.',
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
          `Profile: ${profileName}\n${formatLogMessages(result.data)}`
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
