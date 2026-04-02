/**
 * Search Tool - Search for symbols across the workspace
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { prepareWorkspaceRequest } from '../preparation.js';
import * as LspOperations from '../lsp/operations/index.js';
import { searchSchema } from './schemas.js';
import { getSymbolKindName, formatFilePath } from './utils.js';
import { enrichSymbolsWithCode, createSignaturePreview } from './enrichment.js';
import { SymbolSearchResult } from '../types/lsp.js';
import { validateSearch } from './validation.js';
import type { LspManager } from '../runtime/lsp-manager.js';

export function registerSearchTool(server: McpServer, manager: LspManager) {
  server.registerTool(
    'search',
    {
      title: 'Search',
      description: 'Searches workspace symbols by name',
      inputSchema: searchSchema,
    },
    async (request) => {
      const validatedRequest = validateSearch(request);
      const sessions = await manager.getSearchSessions();

      const settledResults = await Promise.allSettled(
        sessions.map(async (session) => {
          const prepared = prepareWorkspaceRequest(session, validatedRequest);
          if (!prepared.ok) {
            throw new Error(prepared.error.message);
          }

          return await LspOperations.searchSymbols(session, prepared.data);
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

        if (!settled.value.ok) {
          errors.push(settled.value.error.message);
          continue;
        }

        allSymbols.push(...settled.value.data);
      }

      if (allSymbols.length === 0 && errors.length > 0) {
        throw new Error(errors.join('\n'));
      }

      let formattedText = await formatSearchResults(
        allSymbols,
        validatedRequest.query
      );

      if (errors.length > 0) {
        formattedText = `Warnings:\n${errors.map((error) => `- ${error}`).join('\n')}\n\n${formattedText}`;
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: formattedText,
          },
        ],
      };
    }
  );
}

async function formatSearchResults(
  symbols: SymbolSearchResult[],
  query: string
): Promise<string> {
  if (symbols.length === 0) {
    return `Found no matches for query "${query}"`;
  }

  const enrichmentResults = await enrichSymbolsWithCode(symbols);
  const enrichedSymbols = enrichmentResults.map((result) => ({
    ...result.symbol,
    signaturePreview: result.codeSnippet
      ? createSignaturePreview(result.codeSnippet, 100)
      : null,
    error: result.error,
  }));

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
    const filePath = formatFilePath(uri);
    let fileContent = `${filePath} (${fileSymbols.length} results)\n`;

    const sortedSymbols = fileSymbols.sort((a, b) => {
      const lineA = a.location.range.start.line;
      const lineB = b.location.range.start.line;
      return lineA - lineB;
    });

    for (const symbol of sortedSymbols) {
      const line = symbol.location.range.start.line + 1;
      const char = symbol.location.range.start.character + 1;
      const kind = getSymbolKindName(symbol.kind);

      fileContent += `  @${line}:${char} ${kind} - ${symbol.name}\n`;

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
