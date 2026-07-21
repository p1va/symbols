/**
 * Find References Tool - Find all references of a symbol
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { resolveSymbolTarget } from '../preparation.js';
import * as LspOperations from '../lsp/operations/index.js';
import { symbolPositionSchema } from './schemas.js';
import { formatCursorContext } from '../utils/cursor-context.js';
import {
  enrichCodeSnippets,
  createSignaturePreview,
  type EnrichmentRequest,
} from './enrichment.js';
import { Location } from '../types/lsp.js';
import { validateSymbolPosition } from './validation.js';
import { formatFilePath } from './utils.js';
import type { LspManager } from '../runtime/lsp-manager.js';
import { formatZeroBasedPosition } from '../types/position.js';
import { createOneBasedPosition } from '../types.js';
import { textToolResult } from './responses.js';

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
      const target = await resolveSymbolTarget(session, {
        file: validatedRequest.file,
        position: createOneBasedPosition(
          validatedRequest.line,
          validatedRequest.character
        ),
      });

      const result = await LspOperations.findReferences(session, target);
      const { result: references, cursorContext } = result;
      const symbolName = cursorContext?.symbolName || 'symbol';
      const formattedText = await formatReferencesResults(
        references,
        symbolName,
        session.getProfile().workspacePath
      );

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

export async function formatReferencesResults(
  references: Location[],
  symbolName: string,
  workspacePath?: string
): Promise<string> {
  if (references.length === 0) {
    return 'Found no references';
  }

  const enrichmentResults = await enrichCodeSnippets(
    references.map((reference): EnrichmentRequest => ({
      uri: reference.uri,
      extent: 'line',
      line: reference.range.start.line,
    }))
  );

  type EnrichedReference = Location & {
    signaturePreview?: string | null;
    error?: string | null;
  };
  const enrichedReferences: EnrichedReference[] = references.map(
    (reference, index) => {
      const result = enrichmentResults[index]!;
      return {
        ...reference,
        signaturePreview: result.codeSnippet
          ? createSignaturePreview(result.codeSnippet.trim(), 100)
          : null,
        error: result.error,
      };
    }
  );
  const groupedByFile = new Map<string, EnrichedReference[]>();

  for (const ref of enrichedReferences) {
    const uri = ref.uri;

    if (!groupedByFile.has(uri)) {
      groupedByFile.set(uri, []);
    }
    groupedByFile.get(uri)!.push(ref);
  }

  const fileText = groupedByFile.size === 1 ? 'file' : 'files';
  const sections = [
    `Found ${references.length} reference(s) across ${groupedByFile.size} ${fileText}`,
  ];

  for (const [, fileReferences] of groupedByFile) {
    const firstReference = fileReferences[0];
    if (!firstReference) {
      continue;
    }

    const filePath = formatFilePath(firstReference.uri, workspacePath);
    const sortedReferences = fileReferences.sort((a, b) => {
      const lineA = a.range.start.line;
      const lineB = b.range.start.line;
      return lineA - lineB;
    });
    const lines = [`${filePath} (${fileReferences.length} references)`];

    for (const ref of sortedReferences) {
      lines.push(
        `  @${formatZeroBasedPosition(ref.range.start)} ${symbolName}`
      );

      if (ref.signaturePreview) {
        lines.push(`    \`${ref.signaturePreview}\``);
      } else if (ref.error) {
        lines.push(`    // ${ref.error}`);
      }
    }

    sections.push(lines.join('\n'));
  }

  return sections.join('\n\n');
}
