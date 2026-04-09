/**
 * MCP Tools Registration - register all tools with the server
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { LspManager } from '../runtime/lsp-manager.js';

import { registerInspectTool } from './inspect.js';
import { registerReferencesTool } from './references.js';
import { registerCallHierarchyTool } from './call-hierarchy.js';
import { registerCompletionTool } from './completion.js';
import { registerRenameTool } from './rename.js';
import { registerSearchTool } from './search.js';
import { registerOutlineTool } from './outline.js';
import { registerDiagnosticsTool } from './diagnostics.js';
import { registerReloadTool } from './reload.js';

/**
 * Register all MCP tools with the server
 */
export function registerAllTools(server: McpServer, manager: LspManager) {
  registerReloadTool(server, manager);
  registerInspectTool(server, manager);
  registerReferencesTool(server, manager);
  registerCallHierarchyTool(server, manager);
  registerCompletionTool(server, manager);
  registerRenameTool(server, manager);
  registerSearchTool(server, manager);
  registerOutlineTool(server, manager);
  registerDiagnosticsTool(server, manager);
}
