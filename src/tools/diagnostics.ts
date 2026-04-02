/**
 * Diagnostics Tool - Retrieve diagnostics (errors/warnings/hints) for a code file
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DiagnosticEntry } from '../types.js';
import { prepareFileRequest } from '../preparation.js';
import * as LspOperations from '../lsp/operations/index.js';
import { diagnosticsSchema } from './schemas.js';
import { validateDiagnostics } from './validation.js';
import type { LspManager } from '../runtime/lsp-manager.js';

function formatDiagnostics(diagnostics: DiagnosticEntry[]): string {
  if (diagnostics.length === 0) {
    return 'No diagnostics found for this file.';
  }

  const sortedDiagnostics = [...diagnostics].sort((a, b) => {
    if (a.severity !== b.severity) {
      return a.severity - b.severity;
    }
    if (a.range.start.line !== b.range.start.line) {
      return a.range.start.line - b.range.start.line;
    }
    return a.range.start.character - b.range.start.character;
  });

  return sortedDiagnostics
    .map((diagnostic) => {
      const severitySymbol = getSeveritySymbol(diagnostic.severity);
      const severityName = getSeverityName(diagnostic.severity);
      const line = diagnostic.range.start.line + 1;
      const character = diagnostic.range.start.character + 1;
      return `${severitySymbol} @${line}:${character} [${severityName}][${diagnostic.code}] ${diagnostic.message} (${diagnostic.source})`;
    })
    .join('\n');
}

function getSeveritySymbol(severity: number): string {
  switch (severity) {
    case 1:
      return '✘';
    case 2:
      return '⚠';
    case 3:
      return 'ℹ';
    case 4:
      return '★';
    default:
      return '?';
  }
}

function getSeverityName(severity: number): string {
  switch (severity) {
    case 1:
      return 'Error';
    case 2:
      return 'Warning';
    case 3:
      return 'Info';
    case 4:
      return 'Hint';
    default:
      return 'Unknown';
  }
}

export function registerDiagnosticsTool(
  server: McpServer,
  manager: LspManager
) {
  server.registerTool(
    'diagnostics',
    {
      title: 'Diagnostics',
      description:
        'Retrieves active diagnostics (errors/warnings/hints) for a code file',
      inputSchema: diagnosticsSchema,
    },
    async (request) => {
      const validatedRequest = validateDiagnostics(request);
      const session = await manager.getSessionForFile(validatedRequest.file);
      const prepared = prepareFileRequest(session, {
        file: validatedRequest.file,
      });
      if (!prepared.ok) throw new Error(prepared.error.message);

      const result = await LspOperations.getDiagnostics(session, prepared.data);
      if (!result.ok) throw new Error(result.error.message);

      return {
        content: [
          { type: 'text' as const, text: formatDiagnostics(result.data) },
        ],
      };
    }
  );
}
