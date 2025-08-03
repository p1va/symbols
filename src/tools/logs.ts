/**
 * Window Log Messages Tool - Get LSP server log messages
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { LspContext } from '../types.js';
import * as LspOperations from '../lsp/operations/index.js';
import { getLogLevelName } from '../utils/logLevel.js';

export function registerWindowLogsTool(
  server: McpServer,
  createContext: () => LspContext
) {
  server.registerTool(
    'logs',
    {
      title: 'Logs',
      description: 'Retrieve logs from the Language Server for troubleshooting',
      inputSchema: {} as const,
    },
    () => {
      const ctx = createContext();
      if (!ctx.client) throw new Error('LSP client not initialized');

      const result = LspOperations.logs(ctx);
      if (!result.ok) throw new Error(result.error.message);

      // Format each log message as a separate content entry
      const content = result.data.map((msg) => {
        const logLevel = getLogLevelName(msg.type);
        return {
          type: 'text' as const,
          text: `[${logLevel}] ${msg.message}`,
        };
      });

      // If no messages, return a helpful message
      if (content.length === 0) {
        content.push({
          type: 'text' as const,
          text: 'No window log messages available',
        });
      }

      return { content };
    }
  );
}
