/**
 * Completion Tool - Get code completion suggestions at a position
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createOneBasedPosition } from '../types.js';
import { prepareSymbolPositionRequest } from '../preparation.js';
import * as LspOperations from '../lsp/operations/index.js';
import { symbolPositionSchema } from './schemas.js';
import { formatCursorContext } from '../utils/cursor-context.js';
import { getSymbolKindName } from './utils.js';
import { CompletionResult } from '../types/lsp.js';
import { validateSymbolPosition } from './validation.js';
import type { LspManager } from '../runtime/lsp-manager.js';

export function registerCompletionTool(server: McpServer, manager: LspManager) {
  server.registerTool(
    'completion',
    {
      title: 'Completion',
      description:
        'Gets context-aware code completions at a given position. IMPORTANT: To get meaningful results provide precise line and character pointing right after trigger characters. e.g. "client.|some_method()" returns get(), some_method(), another_method() etc.',
      inputSchema: symbolPositionSchema,
    },
    async (request) => {
      const validatedRequest = validateSymbolPosition(request);
      const session = await manager.getSessionForFile(validatedRequest.file);

      const symbolRequest = {
        file: validatedRequest.file,
        position: createOneBasedPosition(
          validatedRequest.line,
          validatedRequest.character
        ),
      };

      const prepared = await prepareSymbolPositionRequest(
        session,
        symbolRequest
      );
      if (!prepared.ok) {
        throw new Error(prepared.error.message);
      }

      const result = await LspOperations.completion(session, prepared.data);
      if (!result.ok) {
        throw new Error(result.error.message);
      }

      const { result: completions, cursorContext } = result.data;
      const formattedText = formatCompletionResults(completions);

      const sections: string[] = [];

      if (cursorContext) {
        sections.push(formatCursorContext(cursorContext));
      }

      sections.push(formattedText);

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

/**
 * Format completion results grouped by symbol kind with prioritization
 */
function formatCompletionResults(completions: CompletionResult[]): string {
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

  let result = `Found ${completions.length} completion suggestion${completions.length === 1 ? '' : 's'}`;

  if (completions.length > maxResults) {
    result += ` (showing top ${maxResults})`;
  }

  for (const kind of kindPriority) {
    const items = groupedByKind.get(kind);
    if (!items || items.length === 0) continue;

    const kindName = getSymbolKindName(kind);
    result += `\n\n${kindName}s (${items.length})`;

    for (const item of items.slice(0, 20)) {
      result += `\n  ${item.label}`;

      if (
        item.detail &&
        item.detail.trim() !== item.label &&
        item.detail.trim() !== ''
      ) {
        result += ` - ${item.detail.trim()}`;
      }

      if (
        item.documentation &&
        typeof item.documentation === 'string' &&
        item.documentation.trim() !== ''
      ) {
        const doc = item.documentation.trim();
        const firstLine = doc.split('\n')[0];
        if (firstLine && firstLine.length > 60) {
          result += `\n    // ${firstLine.substring(0, 57)}...`;
        } else if (firstLine && firstLine.length > 0) {
          result += `\n    // ${firstLine}`;
        }
      }
    }

    if (items.length > 20) {
      result += `\n  ... and ${items.length - 20} more`;
    }
  }

  return result;
}
