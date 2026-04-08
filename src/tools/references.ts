/**
 * Find References Tool - Find all references of a symbol
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createOneBasedPosition } from '../types.js';
import { prepareSymbolPositionRequest } from '../preparation.js';
import * as LspOperations from '../lsp/operations/index.js';
import { symbolPositionSchema } from './schemas.js';
import { formatCursorContext } from '../utils/cursor-context.js';
import { enrichSymbolsWithCode, createSignaturePreview } from './enrichment.js';
import { Location } from '../types/lsp.js';
import { validateSymbolPosition } from './validation.js';
import { formatFilePath } from './utils.js';
import type { LspManager } from '../runtime/lsp-manager.js';

export function registerReferencesTool(server: McpServer, manager: LspManager) {
  server.registerTool(
    'references',
    {
      title: 'References',
      description:
        'Find semantic references to the symbol at a file position across the workspace.',
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
      if (!prepared.ok) throw new Error(prepared.error.message);

      const result = await LspOperations.findReferences(session, prepared.data);
      if (!result.ok) throw new Error(result.error.message);

      const { result: references, cursorContext } = result.data;
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

async function formatReferencesResults(
  references: Location[],
  symbolName: string
): Promise<string> {
  if (references.length === 0) {
    return 'Found no references';
  }

  const symbols = references.map((ref) => ({
    name: 'reference',
    kind: 1,
    location: {
      uri: ref.uri,
      range: {
        start: {
          line: ref.range.start.line,
          character: 0,
        },
        end: {
          line: ref.range.start.line,
          character: 1000,
        },
      },
    },
  }));

  const enrichmentResults = await enrichSymbolsWithCode(symbols);
  const enrichedReferences = enrichmentResults.map((result, index) => ({
    ...references[index],
    signaturePreview: result.codeSnippet
      ? createSignaturePreview(result.codeSnippet.trim(), 100)
      : null,
    error: result.error,
  }));

  type EnrichedReference = Location & {
    signaturePreview?: string | null;
    error?: string | undefined;
  };
  const groupedByFile = new Map<string, EnrichedReference[]>();

  for (const ref of enrichedReferences) {
    const uri = ref.uri;
    if (!uri || !ref.range) continue;

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

  const fileText = groupedByFile.size === 1 ? 'file' : 'files';
  let result = `Found ${references.length} reference(s) across ${groupedByFile.size} ${fileText}`;

  for (const [, fileReferences] of groupedByFile) {
    const firstReference = fileReferences[0];
    if (!firstReference) {
      continue;
    }

    const filePath = formatFilePath(firstReference.uri);
    result += `\n\n${filePath} (${fileReferences.length} references)\n`;

    const sortedReferences = fileReferences.sort((a, b) => {
      const lineA = a.range.start.line;
      const lineB = b.range.start.line;
      return lineA - lineB;
    });

    for (const ref of sortedReferences) {
      const line = ref.range.start.line + 1;
      const char = ref.range.start.character + 1;

      result += `  @${line}:${char} ${symbolName}`;

      if (ref.signaturePreview) {
        result += `\n    \`${ref.signaturePreview}\``;
      } else if (ref.error) {
        result += `\n    // ${ref.error}`;
      }
      result += '\n';
    }
  }

  return result.trim();
}
