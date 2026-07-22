/**
 * Inspect Tool - Comprehensive symbol information
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { resolveSymbolTarget } from '../preparation.js';
import * as LspOperations from '../lsp/operations/index.js';
import { symbolPositionSchema } from './schemas.js';
import { formatCursorContext } from '../utils/cursor-context.js';
import {
  createSignaturePreview,
  enrichCodeSnippets,
  type EnrichmentRequest,
} from './enrichment.js';
import { formatFilePath } from './utils.js';
import { MarkedString, MarkupContent } from 'vscode-languageserver-protocol';
import type { Hover, Location } from 'vscode-languageserver-protocol';
import { validateSymbolPosition } from './validation.js';
import type { LspManager } from '../runtime/lsp-manager.js';
import { formatZeroBasedPosition } from '../types/position.js';
import { createOneBasedPosition } from '../types.js';
import { textToolResult } from './responses.js';

export function registerInspectTool(server: McpServer, manager: LspManager) {
  server.registerTool(
    'inspect',
    {
      title: 'Inspect',
      description:
        'Inspect the symbol at a file position and return documentation, signature details, and related code locations such as definitions, implementations, and type declarations.',
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

      const result = await LspOperations.inspectSymbol(session, target);
      const { result: inspectData, cursorContext } = result;
      const workspacePath = session.getProfile().workspacePath;

      const sections: string[] = [];

      if (cursorContext) {
        sections.push(formatCursorContext(cursorContext, workspacePath));
      }

      if (inspectData.hover) {
        const hoverContent = extractHoverContent(inspectData.hover);
        if (hoverContent) {
          sections.push(`Documentation\n${hoverContent}`);
        }
      }

      if (inspectData.definition.length > 0) {
        const definitionText = await formatLocationGroup(
          inspectData.definition,
          'Definition',
          workspacePath
        );
        sections.push(definitionText);
      }

      if (inspectData.typeDefinition.length > 0) {
        const typeDefText = await formatLocationGroup(
          inspectData.typeDefinition,
          'Type Definition',
          workspacePath
        );
        sections.push(typeDefText);
      }

      if (inspectData.implementation.length > 0) {
        const implText = await formatLocationGroup(
          inspectData.implementation,
          'Implementation',
          workspacePath
        );
        sections.push(implText);
      }

      return textToolResult(sections.join('\n\n'));
    }
  );
}

/**
 * Extract readable content from LSP hover response
 */
export function extractHoverContent(hover: Hover): string | null {
  const contents = hover.contents;

  if (MarkupContent.is(contents)) {
    return contents.value.trim();
  }

  if (MarkedString.is(contents)) {
    return markedStringValue(contents).trim();
  }

  return contents.map(markedStringValue).filter(Boolean).join('\n\n').trim();
}

function markedStringValue(content: MarkedString): string {
  return typeof content === 'string' ? content : content.value;
}

/**
 * Format a group of locations (definition, type definition, implementation)
 */
export async function formatLocationGroup(
  locations: Location[],
  groupTitle: string,
  workspacePath?: string
): Promise<string> {
  if (!locations || locations.length === 0) return '';

  const enrichmentResults = await enrichCodeSnippets(
    locations.map((location): EnrichmentRequest => ({
      uri: location.uri,
      extent: 'line',
      line: location.range.start.line,
    }))
  );

  const fileGroups = new Map<
    string,
    Array<{
      location: Location;
      codeSnippet: string | null;
    }>
  >();

  enrichmentResults.forEach((result, index: number) => {
    const location = locations[index];
    if (!location) return;

    const filePath = formatFilePath(location.uri, workspacePath);

    if (!fileGroups.has(filePath)) {
      fileGroups.set(filePath, []);
    }

    fileGroups.get(filePath)!.push({
      location,
      codeSnippet: result.codeSnippet,
    });
  });

  const sections = [
    `${groupTitle} (${locations.length} location${locations.length === 1 ? '' : 's'})`,
  ];

  for (const [filePath, fileLocations] of fileGroups) {
    fileLocations.sort(
      (left, right) =>
        left.location.range.start.line - right.location.range.start.line
    );

    const lines = [`${filePath} (${fileLocations.length})`];

    for (const entry of fileLocations) {
      lines.push(`  @${formatZeroBasedPosition(entry.location.range.start)}`);

      if (entry.codeSnippet) {
        lines.push(
          `    \`${createSignaturePreview(entry.codeSnippet.trim(), 100)}\``
        );
      }
    }

    sections.push(lines.join('\n'));
  }

  return sections.join('\n\n');
}
