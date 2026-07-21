/**
 * Completion Tool - Get code completion suggestions at a position
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { resolveSymbolTarget } from '../preparation.js';
import * as LspOperations from '../lsp/operations/index.js';
import { symbolPositionSchema } from './schemas.js';
import { formatCursorContext } from '../utils/cursor-context.js';
import { getSymbolKindName } from './utils.js';
import { CompletionResult } from '../types/lsp.js';
import { validateSymbolPosition } from './validation.js';
import type { LspManager } from '../runtime/lsp-manager.js';
import { createOneBasedPosition } from '../types.js';
import { textToolResult } from './responses.js';

export function registerCompletionTool(server: McpServer, manager: LspManager) {
  server.registerTool(
    'completion',
    {
      title: 'Completion',
      description:
        'Get context-aware code completions at a precise file position. For the best results, place the cursor immediately after the trigger point, for example right after `client.`.',
      inputSchema: symbolPositionSchema,
    },
    async (request) => {
      const validatedRequest = validateSymbolPosition(request);
      const session = await manager.getSessionForFile(validatedRequest.file);
      const target = await resolveSymbolTarget(session, {
        file: validatedRequest.file,
        position: createOneBasedPosition(
          validatedRequest.line,
          validatedRequest.character
        ),
      });

      const result = await LspOperations.completion(session, target);
      const { result: completions, cursorContext } = result;
      const formattedText = formatCompletionResults(completions);

      const sections: string[] = [];

      if (cursorContext) {
        sections.push(
          formatCursorContext(cursorContext, session.getProfile().workspacePath)
        );
      }

      sections.push(formattedText);

      return textToolResult(sections.join('\n\n'));
    }
  );
}

/**
 * Format completion results grouped by symbol kind with prioritization
 */
export function formatCompletionResults(
  completions: CompletionResult[]
): string {
  if (completions.length === 0) {
    return 'Found no completion suggestions';
  }

  const maxResults = 100;
  const sortedCompletions = completions
    .sort((a, b) => {
      const sortA = a.sortText || a.label;
      const sortB = b.sortText || b.label;
      return sortA.localeCompare(sortB);
    })
    .slice(0, maxResults);

  const groupedByKind = new Map<number, CompletionResult[]>();

  for (const completion of sortedCompletions) {
    const kind = completion.kind || 1;
    if (!groupedByKind.has(kind)) {
      groupedByKind.set(kind, []);
    }
    groupedByKind.get(kind)!.push(completion);
  }

  const kindPriority = [2, 10, 3, 7, 8, 9, 6, 4, 5, 13, 22, 1];

  const summary = `Found ${completions.length} completion suggestion${completions.length === 1 ? '' : 's'}${completions.length > maxResults ? ` (showing top ${maxResults})` : ''}`;
  const sections = [summary];

  for (const kind of kindPriority) {
    const items = groupedByKind.get(kind);
    if (!items || items.length === 0) continue;

    const kindName = getSymbolKindName(kind);
    const lines = [`${kindName}s (${items.length})`];

    for (const item of items.slice(0, 20)) {
      const detail = item.detail?.trim();
      const itemLine =
        detail && detail !== item.label
          ? `  ${item.label} - ${detail}`
          : `  ${item.label}`;
      lines.push(itemLine);

      if (typeof item.documentation === 'string') {
        const doc = item.documentation.trim();
        const firstLine = doc.split('\n')[0];
        if (firstLine && firstLine.length > 60) {
          lines.push(`    // ${firstLine.substring(0, 57)}...`);
        } else if (firstLine && firstLine.length > 0) {
          lines.push(`    // ${firstLine}`);
        }
      }
    }

    if (items.length > 20) {
      lines.push(`  ... and ${items.length - 20} more`);
    }

    sections.push(lines.join('\n'));
  }

  return sections.join('\n\n');
}
