/**
 * Search Tool - Search for symbols across the workspace
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { LspContext } from '../types.js';
import * as LspOperations from '../lsp/operations/index.js';
import { searchSchema } from './schemas.js';
import { getSymbolKindName, formatFilePath } from './utils.js';
import { enrichSymbolsWithCode, createSignaturePreview } from './enrichment.js';
import { SymbolSearchResult } from '../types/lsp.js';

export function registerSearchTool(
  server: McpServer,
  createContext: () => LspContext
) {
  server.registerTool(
    'search',
    {
      title: 'Search',
      description: 'Search for symbols across the workspace',
      inputSchema: searchSchema,
    },
    async (request) => {
      const ctx = createContext();
      if (!ctx.client) throw new Error('LSP client not initialized');

      const result = await LspOperations.searchSymbols(ctx, request);
      if (!result.ok) throw new Error(result.error.message);

      return await formatSearchResults(result.data, request.query);
    }
  );
}

async function formatSearchResults(
  symbols: SymbolSearchResult[],
  query: string
) {
  if (symbols.length === 0) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Found no matches for query "${query}"`,
        },
      ],
    };
  }

  // Enrich symbols with code snippets for signature previews
  const enrichmentResults = await enrichSymbolsWithCode(symbols);
  const enrichedSymbols = enrichmentResults.map((result) => ({
    ...result.symbol,
    signaturePreview: result.codeSnippet
      ? createSignaturePreview(result.codeSnippet, 100)
      : null,
    error: result.error,
  }));

  // Group enriched symbols by file
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const groupedByFile = new Map<string, any[]>(); // EnrichedSymbol type is complex from spread operator

  for (const symbol of enrichedSymbols) {
    const uri = symbol.location.uri;
    if (!groupedByFile.has(uri)) {
      groupedByFile.set(uri, []);
    }
    groupedByFile.get(uri)!.push(symbol);
  }

  const content = [];

  // Add summary
  const fileCount = groupedByFile.size;
  content.push({
    type: 'text' as const,
    text: `Found ${symbols.length} matches for query "${query}" across ${fileCount} files`,
  });

  // Add results grouped by file
  for (const [uri, fileSymbols] of groupedByFile) {
    const filePath = formatFilePath(uri);
    let fileContent = `${filePath} (${fileSymbols.length} results)\n`;

    // Sort symbols by line number for natural reading order
    const sortedSymbols = fileSymbols.sort((a, b) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const lineA = a.location.range.start.line;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const lineB = b.location.range.start.line;
      return lineA - lineB;
    });

    for (const symbol of sortedSymbols) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const line = symbol.location.range.start.line + 1; // Convert to 1-based
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const char = symbol.location.range.start.character + 1; // Convert to 1-based
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
      const kind = getSymbolKindName(symbol.kind);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      fileContent += `  @${line}:${char} ${kind} - ${symbol.name}\n`;

      // Add signature preview if available
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (symbol.signaturePreview) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        fileContent += `    \`${symbol.signaturePreview}\`\n`;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      } else if (symbol.error) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        fileContent += `    // ${symbol.error}\n`;
      }
    }

    content.push({
      type: 'text' as const,
      text: fileContent.trim(),
    });
  }

  return { content };
}
