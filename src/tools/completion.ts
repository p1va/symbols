/**
 * Completion Tool - Get code completion suggestions at a position
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { LspContext, createOneBasedPosition } from '../types.js';
import * as LspOperations from '../lsp/operations/index.js';
import { symbolPositionSchema } from './schemas.js';
import { formatCursorContext } from '../utils/cursor-context.js';
import { getSymbolKindName } from './utils.js';
import { CompletionResult } from '../types/lsp.js';
import { validateSymbolPosition } from './validation.js';

export function registerCompletionTool(
  server: McpServer,
  createContext: () => LspContext
) {
  server.registerTool(
    'completion',
    {
      title: 'Completion',
      description:
        'Gets context-aware code completions at a given position. IMPORTANT: To get meaningful results provide precise line and character pointing right after trigger characters. e.g. "client.|some_method()" returns get(), some_method(), another_method() etc.',
      inputSchema: symbolPositionSchema,
    },
    async (request) => {
      const ctx = createContext();

      if (!ctx.client) {
        throw new Error('LSP client not initialized');
      }

      // Validate and parse request arguments
      const validatedRequest = validateSymbolPosition(request);

      // Convert raw request to branded position type
      const symbolRequest = {
        file: validatedRequest.file,
        position: createOneBasedPosition(
          validatedRequest.line,
          validatedRequest.character
        ),
      };

      const result = await LspOperations.completion(ctx, symbolRequest);
      if (!result.ok) {
        throw new Error(result.error.message);
      }

      // Format response with cursor context
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

  // Limit results to avoid token overflow (prioritize higher priority items)
  const maxResults = 100;
  const sortedCompletions = completions
    .sort((a, b) => {
      // Sort by sortText first (LSP priority), then by label
      const sortA = a.sortText || a.label;
      const sortB = b.sortText || b.label;
      return sortA.localeCompare(sortB);
    })
    .slice(0, maxResults);

  // Group by symbol kind
  const groupedByKind = new Map<number, CompletionResult[]>();

  for (const completion of sortedCompletions) {
    const kind = completion.kind || 1; // Default to Text if no kind
    if (!groupedByKind.has(kind)) {
      groupedByKind.set(kind, []);
    }
    groupedByKind.get(kind)!.push(completion);
  }

  // Define priority order for symbol kinds (most useful first)
  const kindPriority = [
    2, // Method
    10, // Property
    3, // Function
    7, // Class
    8, // Interface
    9, // Module
    6, // Variable
    4, // Constructor
    5, // Field
    13, // Enum
    22, // Constant
    1, // Text (fallback)
  ];

  let result = `Found ${completions.length} completion suggestion${completions.length === 1 ? '' : 's'}`;

  if (completions.length > maxResults) {
    result += ` (showing top ${maxResults})`;
  }

  // Add grouped results in priority order
  for (const kind of kindPriority) {
    const items = groupedByKind.get(kind);
    if (!items || items.length === 0) continue;

    const kindName = getSymbolKindName(kind);
    result += `\n\n${kindName}s (${items.length})`;

    for (const item of items.slice(0, 20)) {
      // Limit per group
      result += `\n  ${item.label}`;

      // Add detail if available and different from label
      if (
        item.detail &&
        item.detail.trim() !== item.label &&
        item.detail.trim() !== ''
      ) {
        result += ` - ${item.detail.trim()}`;
      }

      // Add brief documentation if available
      if (
        item.documentation &&
        typeof item.documentation === 'string' &&
        item.documentation.trim() !== ''
      ) {
        const doc = item.documentation.trim();
        // Show first line of documentation, truncated
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
