/**
 * Inspect Tool - Comprehensive symbol information
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { LspContext, createOneBasedPosition } from '../types.js';
import * as LspOperations from '../lsp/operations/index.js';
import { symbolPositionSchema } from './schemas.js';
import { formatCursorContext } from '../utils/cursor-context.js';
import { enrichSymbolLocations } from './enrichment.js';
import { createSignaturePreview } from './enrichment.js';
import { formatFilePath } from './utils.js';
import { Hover, Location } from 'vscode-languageserver-protocol';
import { validateSymbolPosition } from './validation.js';

export function registerInspectTool(
  server: McpServer,
  createContext: () => LspContext
) {
  server.registerTool(
    'inspect',
    {
      title: 'Inspect',
      description:
        'Inspects a symbol (either defined in the codebase or imported from a library or framework) and returns documentation, signature info, code locations like definition, implementation, type declaration. IMPORTANT: As a follow-up consider using the inspect tool present on this MCP server for further discovery',
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
          'Definition'
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
          'Type Definition'
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
    return markupContent.value.trim();
  }

  // Handle array of content pieces (legacy MarkedString array or mixed content)
  if (Array.isArray(contents)) {
    return contents
      .map((item) => {
        if (typeof item === 'string') return item;
        if (typeof item === 'object' && 'value' in item) {
          const contentItem = item as { language?: string; value: string };
          // For code blocks, preserve them but clean up formatting
          if (contentItem.language) {
            return contentItem.value; // Return raw code without fences
          }
          return contentItem.value;
        }
        return JSON.stringify(item);
      })
      .filter(Boolean) // Remove empty strings
      .join('\n\n')
      .trim();
  }

  // Handle single content object (could be legacy MarkedString or other format)
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

  // Simple, clear title without dynamic symbol names
  const contextualTitle = `${groupTitle}: ${totalCount} location${totalCount === 1 ? '' : 's'}`;

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
