/**
 * Search Tool - Search for symbols across the workspace
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { prepareWorkspaceRequest } from '../preparation.js';
import * as LspOperations from '../lsp/operations/index.js';
import { searchSchema } from './schemas.js';
import { getSymbolKindName, formatFilePath } from './utils.js';
import {
  enrichCodeSnippets,
  createSignaturePreview,
  type EnrichmentRequest,
} from './enrichment.js';
import { SymbolSearchResult } from '../types/lsp.js';
import { validateSearch } from './validation.js';
import type { LspManager } from '../runtime/lsp-manager.js';
import { formatZeroBasedPosition } from '../types/position.js';
import { textToolResult } from './responses.js';

export function registerSearchTool(server: McpServer, manager: LspManager) {
  server.registerTool(
    'search',
    {
      title: 'Search',
      description:
        'Search workspace symbols by name or pattern. Result quality depends on the language server and current indexing state.',
      inputSchema: searchSchema,
    },
    async (request) => {
      const validatedRequest = validateSearch(request);
      const sessions = await manager.getSearchSessions();

      const settledResults = await Promise.allSettled(
        sessions.map(async (session) => {
          const prepared = prepareWorkspaceRequest(session, validatedRequest);

          return await LspOperations.searchSymbols(session, prepared);
        })
      );

      const allSymbols: SymbolSearchResult[] = [];
      const errors: string[] = [];

      for (const settled of settledResults) {
        if (settled.status === 'rejected') {
          errors.push(
            settled.reason instanceof Error
              ? settled.reason.message
              : String(settled.reason)
          );
          continue;
        }

        allSymbols.push(...settled.value);
      }

      if (allSymbols.length === 0 && errors.length > 0) {
        throw new Error(errors.join('\n'));
      }

      let formattedText = await formatSearchResults(
        allSymbols,
        validatedRequest.query,
        manager.getStatus().workspacePath
      );

      if (errors.length > 0) {
        formattedText = `Warnings:\n${errors.map((error) => `- ${error}`).join('\n')}\n\n${formattedText}`;
      }

      return textToolResult(formattedText);
    }
  );
}

async function formatSearchResults(
  symbols: SymbolSearchResult[],
  query: string,
  workspacePath?: string
): Promise<string> {
  if (symbols.length === 0) {
    return `Found no matches for query "${query}"`;
  }

  const enrichmentResults = await enrichCodeSnippets(
    symbols.map((symbol): EnrichmentRequest => ({
      uri: symbol.location.uri,
      extent: 'range',
      range: symbol.location.range,
    }))
  );
  const enrichedSymbols = symbols.map((symbol, index) => {
    const result = enrichmentResults[index];
    return {
      ...symbol,
      signaturePreview: result?.codeSnippet
        ? createSignaturePreview(result.codeSnippet, 100)
        : null,
      error: result?.error ?? null,
    };
  });

  const groupedByFile = new Map<string, typeof enrichedSymbols>();

  for (const symbol of enrichedSymbols) {
    const uri = symbol.location.uri;
    if (!groupedByFile.has(uri)) {
      groupedByFile.set(uri, []);
    }
    groupedByFile.get(uri)!.push(symbol);
  }

  const sections = [];
  const fileCount = groupedByFile.size;
  sections.push(
    `Found ${symbols.length} matches for query "${query}" across ${fileCount} files`
  );

  for (const [uri, fileSymbols] of groupedByFile) {
    const filePath = formatFilePath(uri, workspacePath);
    let fileContent = `${filePath} (${fileSymbols.length} results)\n`;

    const sortedSymbols = fileSymbols.sort((a, b) => {
      const lineA = a.location.range.start.line;
      const lineB = b.location.range.start.line;
      return lineA - lineB;
    });

    for (const symbol of sortedSymbols) {
      const kind = getSymbolKindName(symbol.kind);

      fileContent += `  @${formatZeroBasedPosition(symbol.location.range.start)} ${kind} - ${symbol.name}\n`;

      if (symbol.signaturePreview) {
        fileContent += `    \`${symbol.signaturePreview}\`\n`;
      } else if (symbol.error) {
        fileContent += `    // ${symbol.error}\n`;
      }
    }

    sections.push(fileContent.trim());
  }

  return sections.join('\n\n');
}
