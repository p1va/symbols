/**
 * Inspect Tool - Comprehensive symbol information
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createOneBasedPosition } from '../types.js';
import { prepareSymbolPositionRequest } from '../preparation.js';
import * as LspOperations from '../lsp/operations/index.js';
import { symbolPositionSchema } from './schemas.js';
import { formatCursorContext } from '../utils/cursor-context.js';
import { enrichSymbolLocations } from './enrichment.js';
import { createSignaturePreview } from './enrichment.js';
import { formatFilePath } from './utils.js';
import { Hover, Location } from 'vscode-languageserver-protocol';
import { validateSymbolPosition } from './validation.js';
import type { LspManager } from '../runtime/lsp-manager.js';

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

      const result = await LspOperations.inspectSymbol(session, prepared.data);
      if (!result.ok) throw new Error(result.error.message);

      const { result: inspectData, cursorContext } = result.data;

      const sections: string[] = [];

      if (cursorContext) {
        sections.push(formatCursorContext(cursorContext));
      }

      if (inspectData.hover && inspectData.hover.contents) {
        const hoverContent = extractHoverContent(inspectData.hover);
        if (hoverContent) {
          sections.push(`Documentation\n${hoverContent}`);
        }
      }

      if (
        inspectData.definition &&
        Array.isArray(inspectData.definition) &&
        inspectData.definition.length > 0
      ) {
        const definitionText = await formatLocationGroup(
          inspectData.definition,
          'Definition'
        );
        sections.push(definitionText);
      }

      if (
        inspectData.typeDefinition &&
        Array.isArray(inspectData.typeDefinition) &&
        inspectData.typeDefinition.length > 0
      ) {
        const typeDefText = await formatLocationGroup(
          inspectData.typeDefinition,
          'Type Definition'
        );
        sections.push(typeDefText);
      }

      if (
        inspectData.implementation &&
        Array.isArray(inspectData.implementation) &&
        inspectData.implementation.length > 0
      ) {
        const implText = await formatLocationGroup(
          inspectData.implementation,
          'Implementation'
        );
        sections.push(implText);
      }

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
 * Extract readable content from LSP hover response
 */
function extractHoverContent(hover: Hover): string | null {
  if (!hover || !hover.contents) return null;

  const contents = hover.contents;

  if (typeof contents === 'string') {
    return contents.trim();
  }

  if (
    typeof contents === 'object' &&
    'kind' in contents &&
    'value' in contents
  ) {
    const markupContent = contents as { kind: string; value: string };
    return markupContent.value.trim();
  }

  if (Array.isArray(contents)) {
    return contents
      .map((item) => {
        if (typeof item === 'string') return item;
        if (typeof item === 'object' && 'value' in item) {
          const contentItem = item as { language?: string; value: string };
          if (contentItem.language) {
            return contentItem.value;
          }
          return contentItem.value;
        }
        return JSON.stringify(item);
      })
      .filter(Boolean)
      .join('\n\n')
      .trim();
  }

  if (typeof contents === 'object' && 'value' in contents) {
    const contentObject = contents as { language?: string; value: string };
    return contentObject.value.trim();
  }

  return null;
}

/**
 * Format a group of locations (definition, type definition, implementation)
 */
async function formatLocationGroup(
  locations: Location[],
  groupTitle: string
): Promise<string> {
  if (!locations || locations.length === 0) return '';

  const symbolLocations: Location[] = locations.map((location) => ({
    uri: location.uri,
    range: {
      start: {
        line: location.range.start.line - 1,
        character: location.range.start.character - 1,
      },
      end: {
        line: location.range.end.line - 1,
        character: location.range.end.character - 1,
      },
    },
  }));

  const enrichmentResults = await enrichSymbolLocations(symbolLocations);

  const fileGroups = new Map<
    string,
    Array<{
      location: Location;
      originalLocation: Location;
      codeSnippet: string | null;
    }>
  >();

  enrichmentResults.forEach((result, index: number) => {
    const location = symbolLocations[index];
    const originalLocation = locations[index];
    if (!location || !originalLocation) return;

    const filePath = formatFilePath(location.uri);

    if (!fileGroups.has(filePath)) {
      fileGroups.set(filePath, []);
    }

    fileGroups.get(filePath)!.push({
      location,
      originalLocation,
      codeSnippet: result.codeSnippet,
    });
  });

  let result = `${groupTitle} (${locations.length} location${locations.length === 1 ? '' : 's'})`;

  for (const [filePath, fileLocations] of fileGroups) {
    result += `\n\n${filePath} (${fileLocations.length})\n`;

    fileLocations.sort(
      (left, right) =>
        left.location.range.start.line - right.location.range.start.line
    );

    for (const entry of fileLocations) {
      const line = entry.originalLocation.range.start.line;
      const character = entry.originalLocation.range.start.character;
      result += `  @${line}:${character}`;

      if (entry.codeSnippet) {
        result += `\n    \`${createSignaturePreview(entry.codeSnippet.trim(), 100)}\``;
      }

      result += '\n';
    }
  }

  return result.trim();
}
