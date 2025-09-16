/**
 * Find References Tool - Find all references of a symbol
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { LspContext, createOneBasedPosition } from '../types.js';
import * as LspOperations from '../lsp/operations/index.js';
import { symbolPositionSchema } from './schemas.js';
import { formatCursorContext } from '../utils/cursorContext.js';
import { formatFilePath } from './utils.js';
import { enrichSymbolsWithCode, createSignaturePreview } from './enrichment.js';
import { Location } from '../types/lsp.js';
import { validateSymbolPosition } from './validation.js';

export function registerReferencesTool(
  server: McpServer,
  createContext: () => LspContext
) {
  server.registerTool(
    'references',
    {
      title: 'References',
      description: 'Finds all references of a given symbol across the codebase',
      inputSchema: symbolPositionSchema,
    },
    async (request) => {
      const ctx = createContext();
      if (!ctx.client) throw new Error('LSP client not initialized');

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

      const result = await LspOperations.findReferences(ctx, symbolRequest);
      if (!result.ok) throw new Error(result.error.message);

      // Format response with cursor context
      const { result: references, cursorContext } = result.data;

      // Format references with file grouping and signature previews
      const symbolName = cursorContext?.symbolName || 'symbol';
      const formattedText = await formatReferencesResults(
        references,
        symbolName
      );

      const sections: string[] = [];

      if (cursorContext) {
        sections.push(formatCursorContext(cursorContext));
      }

      sections.push(formattedText);

      const finalText = sections.join('\n\n');

      return {
        content: [
          {
            type: 'text' as const,
            text: finalText,
          },
        ],
      };
    }
  );
}

async function formatReferencesResults(
  references: Location[],
  symbolName: string
): Promise<string> {
  if (references.length === 0) {
    return 'Found no references';
  }

  // Convert references to enrichable symbols format with expanded ranges for full line context
  const symbols = references.map((ref) => ({
    name: 'reference', // References don't have symbol names, just locations
    kind: 1, // Use a generic kind for references
    location: {
      uri: ref.uri,
      range: {
        // Expand range to capture the full line for better context
        start: {
          line: ref.range.start.line,
          character: 0, // Start of line
        },
        end: {
          line: ref.range.start.line, // Same line
          character: 1000, // End of line (will be clamped by enrichment)
        },
      },
    },
  }));

  // Enrich symbols with code snippets for signature previews
  const enrichmentResults = await enrichSymbolsWithCode(symbols);
  const enrichedReferences = enrichmentResults.map((result, index) => ({
    ...references[index],
    signaturePreview: result.codeSnippet
      ? createSignaturePreview(result.codeSnippet.trim(), 100)
      : null,
    error: result.error,
  }));

  // Group enriched references by file
  type EnrichedReference = Location & {
    signaturePreview?: string | null;
    error?: string | undefined;
  };
  const groupedByFile = new Map<string, EnrichedReference[]>();

  for (const ref of enrichedReferences) {
    const uri = ref.uri;
    if (!uri || !ref.range) continue; // Skip references without URI or range

    if (!groupedByFile.has(uri)) {
      groupedByFile.set(uri, []);
    }
    groupedByFile.get(uri)!.push({
      uri,
      range: ref.range,
      signaturePreview: ref.signaturePreview,
      error: ref.error,
    });
  }

  // Add summary
  const fileText = groupedByFile.size === 1 ? 'file' : 'files';
  let result = `Found ${references.length} reference(s) across ${groupedByFile.size} ${fileText}`;

  // Add files with references
  for (const [uri, fileReferences] of groupedByFile) {
    const filePath = formatFilePath(uri);
    result += `\n\n${filePath} (${fileReferences.length} references)\n`;

    // Sort references by line number for natural reading order
    const sortedReferences = fileReferences.sort((a, b) => {
      const lineA = a.range.start.line;
      const lineB = b.range.start.line;
      return lineA - lineB;
    });

    for (const ref of sortedReferences) {
      const line = ref.range.start.line + 1; // Convert to 1-based
      const char = ref.range.start.character + 1; // Convert to 1-based

      result += `  @${line}:${char} ${symbolName}`;

      // Add signature preview if available
      if (ref.signaturePreview) {
        result += `\n    \`${ref.signaturePreview}\``;
      } else if (ref.error) {
        result += `\n    // ${ref.error}`;
      }
      result += `\n`;
    }
  }

  return result.trim();
}
