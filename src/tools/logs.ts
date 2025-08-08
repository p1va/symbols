/**
 * Window Log Messages Tool - Get LSP server log messages
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { LspContext } from '../types.js';
import * as LspOperations from '../lsp/operations/index.js';
import { getLogLevelName } from '../utils/logLevel.js';

/**
 * Get symbol for log level severity (using subtle ASCII symbols like diagnostics)
 */
function getLogLevelSymbol(type: number): string {
  switch (type) {
    case 1: return '✘'; // Error
    case 2: return '⚠'; // Warning  
    case 3: return 'ℹ'; // Info
    case 4: return '•'; // Log
    default: return '?'; // Unknown
  }
}

/**
 * Format log messages into a compact, scannable format
 */
function formatLogMessages(messages: Array<{ type: number; message: string }>): string {
  if (messages.length === 0) {
    return 'No window log messages available';
  }

  // Group consecutive messages by context (e.g., same operation)
  const formattedMessages = messages.map((msg) => {
    const symbol = getLogLevelSymbol(msg.type);
    const level = getLogLevelName(msg.type);
    
    // Extract context from message for better organization
    const message = msg.message.trim();
    const contextMatch = message.match(/^\[([^\]]+)\]/);
    const context = contextMatch ? contextMatch[1] : '';
    const content = contextMatch ? message.substring(contextMatch[0].length).trim() : message;
    
    if (context) {
      return `${symbol} [${level}] [${context}] ${content}`;
    } else {
      return `${symbol} [${level}] ${content}`;
    }
  });

  return formattedMessages.join('\n');
}

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

      // Format all log messages into a single compact text block
      const formattedLogs = formatLogMessages(result.data);

      return {
        content: [{
          type: 'text' as const,
          text: formattedLogs,
        }]
      };
    }
  );
}
