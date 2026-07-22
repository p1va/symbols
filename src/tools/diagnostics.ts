/**
 * Diagnostics Tool - Retrieve diagnostics (errors/warnings/hints) for a code file
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { prepareFileRequest } from '../preparation.js';
import * as LspOperations from '../lsp/operations/index.js';
import { diagnosticsSchema } from './schemas.js';
import { validateDiagnostics } from './validation.js';
import type { LspManager } from '../runtime/lsp-manager.js';
import { formatDiagnostics } from '../utils/diagnostics.js';
import { textToolResult } from './responses.js';

export function registerDiagnosticsTool(
  server: McpServer,
  manager: LspManager
) {
  server.registerTool(
    'diagnostics',
    {
      title: 'Diagnostics',
      description:
        'Return active diagnostics for a file, including errors, warnings, info, and hints reported by the language server.',
      inputSchema: diagnosticsSchema,
    },
    async (request) => {
      const validatedRequest = validateDiagnostics(request);
      const session = await manager.getSessionForFile(validatedRequest.file);
      const prepared = prepareFileRequest(session, {
        file: validatedRequest.file,
      });

      const result = await LspOperations.getDiagnostics(session, prepared);

      return textToolResult(formatDiagnostics(result));
    }
  );
}
