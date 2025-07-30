/**
 * MCP Tools Registration - register all tools with the server
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { LspContext } from '../types.js';

import { registerInspectTool } from './inspect.js';
import { registerReferencesTool } from './references.js';
import { registerCompletionTool } from './completion.js';
import { registerWindowLogsTool } from './logs.js';
import { registerRenameTool } from './rename.js';
import { registerSearchTool } from './search.js';
import { registerReadTool } from './read.js';
import { registerDiagnosticsTool } from './diagnostics.js';

/**
 * Register all MCP tools with the server
 */
export function registerAllTools(
  server: McpServer,
  createContext: () => LspContext
) {
  registerInspectTool(server, createContext);
  registerReferencesTool(server, createContext);
  registerCompletionTool(server, createContext);
  registerWindowLogsTool(server, createContext);
  registerRenameTool(server, createContext);
  registerSearchTool(server, createContext);
  registerReadTool(server, createContext);
  registerDiagnosticsTool(server, createContext);
}
