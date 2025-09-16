/**
 * Diagnostics Tool - Retrieve diagnostics (errors/warnings/hints) for a code file
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DiagnosticEntry, LspContext } from '../types.js';
import * as LspOperations from '../lsp/operations/index.js';
import { fileSchema } from './schemas.js';
import { validateFile } from './validation.js';

/**
 * Format diagnostics in VS Code style with severity symbols, sorted by severity then line number
 */
function formatDiagnostics(diagnostics: DiagnosticEntry[]): string {
  if (diagnostics.length === 0) {
    return 'No diagnostics found for this file.';
  }

  // Sort by severity (1=Error, 2=Warning, 3=Info, 4=Hint) then by line number
  const sortedDiagnostics = [...diagnostics].sort((a, b) => {
    // Primary sort: severity (lower number = higher priority)
    if (a.severity !== b.severity) {
      return a.severity - b.severity;
    }
    // Secondary sort: line number
    if (a.range.start.line !== b.range.start.line) {
      return a.range.start.line - b.range.start.line;
    }
    // Tertiary sort: character position
    return a.range.start.character - b.range.start.character;
  });

  return sortedDiagnostics
    .map((diagnostic) => {
      // Map severity to VS Code-style symbols
      const severitySymbol = getSeveritySymbol(diagnostic.severity);
      const severityName = getSeverityName(diagnostic.severity);

      // Convert 0-based LSP positions to 1-based display positions
      const line = diagnostic.range.start.line + 1;
      const character = diagnostic.range.start.character + 1;

      // Format: ✘ @5:31 [Error][2304] Cannot find name 'someUndefinedVariable' (typescript)
      return `${severitySymbol} @${line}:${character} [${severityName}][${diagnostic.code}] ${diagnostic.message} (${diagnostic.source})`;
    })
    .join('\n');
}

/**
 * Get VS Code-style severity symbol
 */
function getSeveritySymbol(severity: number): string {
  switch (severity) {
    case 1:
      return '✘'; // Error
    case 2:
      return '⚠'; // Warning
    case 3:
      return 'ℹ'; // Information
    case 4:
      return '★'; // Hint
    default:
      return '?'; // Unknown
  }
}

/**
 * Get human-readable severity name
 */
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
  createContext: () => LspContext
) {
  server.registerTool(
    'diagnostics',
    {
      title: 'Diagnostics',
      description:
        'Retrieves active diagnostics (errors/warnings/hints) for a code file',
      inputSchema: fileSchema,
    },
    async (request) => {
      const ctx = createContext();
      if (!ctx.client) throw new Error('LSP client not initialized');

      // Validate and parse request arguments
      const validatedRequest = validateFile(request);

      const result = await LspOperations.getDiagnostics(ctx, validatedRequest);
      if (!result.ok) throw new Error(result.error.message);

      // Format diagnostics in VS Code style
      const formattedDiagnostics = formatDiagnostics(result.data);

      return {
        content: [{ type: 'text' as const, text: formattedDiagnostics }],
      };
    }
  );
}
