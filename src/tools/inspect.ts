/**
 * Inspect Tool - Comprehensive symbol information
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { LspContext, createOneBasedPosition } from '../types.js';
import * as LspOperations from '../lsp/operations/index.js';
import { symbolPositionSchema } from './schemas.js';
import { formatCursorContext } from '../utils/cursorContext.js';
import { enrichSymbolLocations } from './enrichment.js';
import { createSignaturePreview } from './enrichment.js';
import { formatFilePath } from './utils.js';
import { Hover, Location, MarkedString } from 'vscode-languageserver-protocol';

export function registerInspectTool(
  server: McpServer,
  createContext: () => LspContext
) {
  server.registerTool(
    'inspect',
    {
      title: 'Inspect',
      description:
        'Inspects the given code symbol and gets comprehensive information including documentation and navigation to related locations like its own definition, its implementation, or its type declaration',
      inputSchema: symbolPositionSchema,
    },
    async (request) => {
      const ctx = createContext();
      if (!ctx.client) throw new Error('LSP client not initialized');

      // Convert raw request to branded position type
      const symbolRequest = {
        file: request.file,
        position: createOneBasedPosition(request.line, request.character),
      };

      const result = await LspOperations.inspectSymbol(ctx, symbolRequest);
      if (!result.ok) throw new Error(result.error.message);

      // Format response with cursor context
      const { result: inspectData, cursorContext } = result.data;

      const sections: string[] = [];

      // Always add cursor context first
      if (cursorContext) {
        sections.push(formatCursorContext(cursorContext));
      }

      // Add hover information if available
      if (inspectData.hover && inspectData.hover.contents) {
        const hoverContent = extractHoverContent(inspectData.hover);
        if (hoverContent) {
          sections.push(`Documentation\n${hoverContent}`);
        }
      }

      // Add definition locations if available
      if (
        inspectData.definition &&
        Array.isArray(inspectData.definition) &&
        inspectData.definition.length > 0
      ) {
        const definitionText = await formatLocationGroup(
          inspectData.definition,
          'Definition',
          cursorContext
        );
        sections.push(definitionText);
      }

      // Add type definition locations if available
      if (
        inspectData.typeDefinition &&
        Array.isArray(inspectData.typeDefinition) &&
        inspectData.typeDefinition.length > 0
      ) {
        const typeDefText = await formatLocationGroup(
          inspectData.typeDefinition,
          'Type Definition',
          cursorContext
        );
        sections.push(typeDefText);
      }

      // Add implementation locations if available
      if (
        inspectData.implementation &&
        Array.isArray(inspectData.implementation) &&
        inspectData.implementation.length > 0
      ) {
        const implText = await formatLocationGroup(
          inspectData.implementation,
          'Implementation',
          cursorContext
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

  // Handle different hover content formats according to LSP spec
  if (typeof contents === 'string') {
    return contents.trim();
  }

  // Handle MarkupContent (most common with TypeScript)
  if (
    typeof contents === 'object' &&
    'kind' in contents &&
    'value' in contents
  ) {
    const markupContent = contents as { kind: string; value: string };
    // Remove markdown code fences if present for cleaner display
    let value = markupContent.value;
    if (markupContent.kind === 'markdown') {
      // Clean up common markdown patterns for better readability
      value = value
        .replace(/^```typescript\n/, '')
        .replace(/^```ts\n/, '')
        .replace(/\n```$/, '')
        .replace(/^```\n/, '')
        .replace(/\n```$/, '');
    }
    return value.trim();
  }

  // Handle MarkedString array (multiple content pieces)
  if (Array.isArray(contents)) {
    return contents
      .map((item: MarkedString) => {
        if (typeof item === 'string') return item;
        if (typeof item === 'object' && 'value' in item) {
          const markedItem = item as { language?: string; value: string };
          // For code blocks, preserve them but clean up formatting
          if (markedItem.language) {
            return markedItem.value; // Return raw code without fences
          }
          return markedItem.value;
        }
        return JSON.stringify(item);
      })
      .filter(Boolean) // Remove empty strings
      .join('\n\n')
      .trim();
  }

  // Handle single MarkedString object
  if (typeof contents === 'object' && 'value' in contents) {
    const markedString = contents as MarkedString;
    if (typeof markedString === 'object' && 'value' in markedString) {
      return markedString.value.trim();
    }
  }

  return null;
}

/**
 * Format a group of locations (definition, type definition, implementation)
 */
async function formatLocationGroup(
  locations: Location[],
  groupTitle: string,
  cursorContext?: { symbolName?: string } | null
): Promise<string> {
  if (!locations || locations.length === 0) return '';

  // Convert 1-based display positions back to 0-based LSP positions for enrichment
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

  // Enrich with code snippets
  const enrichmentResults = await enrichSymbolLocations(symbolLocations);

  // Group by file
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
    if (!location || !originalLocation) return; // Skip if location is undefined

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

  // Format output
  const totalCount = locations.length;
  const fileCount = fileGroups.size;
  const plural = fileCount === 1 ? '' : 's';

  // Get symbol name from cursor context if available
  const symbolName = cursorContext?.symbolName || 'symbol';

  // Create more descriptive headers based on the group title
  let contextualTitle;
  if (groupTitle === 'Definition') {
    contextualTitle = `Definition: ${totalCount} location${totalCount === 1 ? '' : 's'} where ${symbolName} is defined`;
  } else if (groupTitle === 'Type Definition') {
    contextualTitle = `Type Definition: ${totalCount} location${totalCount === 1 ? '' : 's'} where the type is defined`;
  } else if (groupTitle === 'Implementation') {
    contextualTitle = `Implementation: ${totalCount} location${totalCount === 1 ? '' : 's'} where ${symbolName} is implemented`;
  } else {
    contextualTitle = `${groupTitle}: ${totalCount} location${totalCount === 1 ? '' : 's'} across ${fileCount} file${plural}`;
  }

  let result = contextualTitle;

  for (const [filePath, fileLocations] of fileGroups) {
    result += `\n${filePath} (${fileLocations.length} location${fileLocations.length === 1 ? '' : 's'})\n`;

    for (const { originalLocation, codeSnippet } of fileLocations) {
      const signaturePreview = codeSnippet
        ? createSignaturePreview(codeSnippet, 100)
        : null;

      // Use original locations which are already 1-based for display
      const line = originalLocation.range.start.line;
      const char = originalLocation.range.start.character;

      result += `  @${line}:${char}`;

      if (signaturePreview) {
        // Follow search tool format: position on line, code snippet indented on next line
        result += `\n    \`${signaturePreview}\``;
      }
      result += `\n`;
    }
  }

  return result.trim();
}
