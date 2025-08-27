/**
 * Read Tool - Read all symbols in a code file
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { LspContext } from '../types.js';
import * as LspOperations from '../lsp/operations/index.js';
import { fileSchema } from './schemas.js';
import { getSymbolKindName, formatFilePath } from './utils.js';
import {
  enrichSymbolsWithCode,
  createCodePreview,
  createSignaturePreview,
} from './enrichment.js';
import {
  filterSymbolsByConfig,
  TypeScriptConfig,
} from '../config/typescript.js';
import { FlattenedSymbol } from '../types/lsp.js';

export function registerReadTool(
  server: McpServer,
  createContext: () => LspContext
) {
  server.registerTool(
    'read',
    {
      title: 'Read',
      description:
        'Reads a file using different levels of preview (none,signature,full) and returns a clean structured view of its symbols. IMPORTANT: Use this during exploring or when just interested in the outline (members, signatures, return types) rather than full implementation.',
      inputSchema: fileSchema,
    },
    async (request) => {
      const ctx = createContext();
      if (!ctx.client) throw new Error('LSP client not initialized');

      const result = await LspOperations.readSymbols(ctx, request);
      if (!result.ok) throw new Error(result.error.message);

      const formattedText = await formatReadResults(
        { symbols: result.data },
        request.file,
        request.maxDepth || 99,
        request.previewMode || 'none'
      );
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

interface SymbolWithDepth {
  symbol: FlattenedSymbol;
  depth: number;
}

async function formatReadResults(
  data: { symbols: FlattenedSymbol[] },
  filePath: string,
  maxDepth: number = 99,
  previewMode: 'none' | 'signature' | 'full' = 'none'
): Promise<string> {
  if (!data.symbols || data.symbols.length === 0) {
    return `No symbols found in ${formatFilePath(filePath)}`;
  }

  const symbols = data.symbols;
  const filteredByKind = filterSymbolsByConfig(symbols);
  const symbolsWithDepth = calculateSymbolDepths(filteredByKind);

  // Filter symbols by maxDepth
  const filteredSymbols = symbolsWithDepth.filter((s) => s.depth <= maxDepth);

  // Enrich symbols with code snippets if requested
  let enrichedSymbols: Array<{
    symbol: FlattenedSymbol;
    depth: number;
    codeSnippet?: string;
    signaturePreview?: string;
    error?: string;
  }>;

  if (previewMode !== 'none') {
    const rawSymbols = filteredSymbols.map((s) => s.symbol);
    const enrichmentResults = await enrichSymbolsWithCode(rawSymbols);

    // Merge enrichment results back with depth information
    enrichedSymbols = filteredSymbols.map((s, index) => {
      const result = enrichmentResults[index];
      const enriched: {
        symbol: FlattenedSymbol;
        depth: number;
        codeSnippet?: string;
        signaturePreview?: string;
        error?: string;
      } = {
        symbol: s.symbol,
        depth: s.depth,
      };

      if (result?.codeSnippet) {
        if (previewMode === 'signature') {
          enriched.signaturePreview = createSignaturePreview(
            result.codeSnippet,
            100
          );
        } else if (previewMode === 'full') {
          enriched.codeSnippet = result.codeSnippet;
        }
      }

      if (result?.error) {
        enriched.error = result.error;
      }

      return enriched;
    });
  } else {
    enrichedSymbols = filteredSymbols.map((s) => ({
      symbol: s.symbol,
      depth: s.depth,
    }));
  }

  // Count symbols by type (from filtered symbols)
  const symbolCounts = new Map<string, number>();
  for (const { symbol } of filteredSymbols) {
    const kind = getSymbolKindName(symbol.kind);
    symbolCounts.set(kind, (symbolCounts.get(kind) || 0) + 1);
  }

  // Create summary line
  const typeBreakdown = Array.from(symbolCounts.entries())
    .sort(([, a], [, b]) => b - a) // Sort by count descending
    .map(([type, count]) =>
      count === 1
        ? `1 ${type.toLowerCase()}`
        : `${count} ${type.toLowerCase()}s`
    )
    .join(', ');

  const sections = [];

  // Add summary block with filtered count
  const depthInfo =
    maxDepth > 0 ? ` (max depth ${maxDepth})` : ' (root level only)';
  sections.push(
    `Found ${filteredSymbols.length} symbols in file: ${formatFilePath(filePath)}${depthInfo}\nSymbol breakdown: ${typeBreakdown}`
  );

  // Group by root-level containers (depth 0 symbols)
  type EnrichedSymbolWithDepth = {
    symbol: FlattenedSymbol;
    depth: number;
    codeSnippet?: string;
    signaturePreview?: string;
    error?: string;
  };
  const rootContainers = new Map<string, EnrichedSymbolWithDepth[]>();
  const orphanedSymbols: EnrichedSymbolWithDepth[] = [];

  for (const enrichedSymbol of enrichedSymbols) {
    if (enrichedSymbol.depth === 0) {
      // This is a root-level symbol
      rootContainers.set(enrichedSymbol.symbol.name, [enrichedSymbol]);
    } else {
      // Find the root container for this symbol
      const rootContainerName = findRootContainer(
        enrichedSymbol.symbol,
        filteredSymbols
      );
      if (rootContainerName && rootContainers.has(rootContainerName)) {
        rootContainers.get(rootContainerName)!.push(enrichedSymbol);
      } else {
        orphanedSymbols.push(enrichedSymbol);
      }
    }
  }

  // Add content block for each root container
  for (const [, containerSymbols] of rootContainers) {
    // Sort by line number within each container
    const sortedSymbols = containerSymbols.sort((a, b) => {
      // FlattenedSymbol uses range directly, not location.range
      const lineA = a.symbol.range.start.line;
      const lineB = b.symbol.range.start.line;
      return lineA - lineB;
    });

    let containerContent = '';
    for (const enrichedSymbol of sortedSymbols) {
      const { symbol, depth, codeSnippet, signaturePreview, error } =
        enrichedSymbol;
      // FlattenedSymbol uses range directly, not location.range
      const line = symbol.range.start.line + 1; // Convert to 1-based
      const char = symbol.range.start.character + 1; // Convert to 1-based
      const kind = getSymbolKindName(symbol.kind);
      const indent = '  '.repeat(depth);

      // Add debug info for container name and kind (only if enabled in config)
      let containerDebug = '';
      if (TypeScriptConfig.showDebugInfo && symbol.containerName) {
        // Find the container symbol to get its kind
        const containerSymbol = enrichedSymbols.find(
          (es) => es.symbol.name === symbol.containerName
        );
        const containerKind = containerSymbol
          ? getSymbolKindName(containerSymbol.symbol.kind)
          : 'Unknown';
        containerDebug = ` [${symbol.containerName}, ${containerKind}]`;
      }

      // Base symbol line
      const symbolLine = `${indent}@${line}:${char} ${kind} - ${symbol.name}${containerDebug}`;
      containerContent += symbolLine + '\n';

      // Add signature preview on new line with backticks if available
      if (signaturePreview) {
        containerContent += `${indent}  \`${signaturePreview}\`\n`;
      }

      // Add full code snippet if available (only for leaf symbols to avoid duplication)
      if (codeSnippet && isLeafSymbol(symbol, enrichedSymbols)) {
        const preview = createCodePreview(codeSnippet, 0); // 0 = no truncation, show entire code
        const snippetLines = preview.split('\n');
        for (const snippetLine of snippetLines) {
          containerContent += `${indent}  ${snippetLine}\n`;
        }
        containerContent += '\n'; // Extra line for readability
      } else if (error) {
        containerContent += `${indent}  // ${error}\n\n`;
      }
    }

    sections.push(containerContent.trim());
  }

  return sections.join('\n\n');
}

function calculateSymbolDepths(symbols: FlattenedSymbol[]): SymbolWithDepth[] {
  // Create name to symbol map for quick lookup
  const symbolsByName = new Map<string, FlattenedSymbol>();
  for (const symbol of symbols) {
    symbolsByName.set(symbol.name, symbol);
  }

  const result: SymbolWithDepth[] = [];

  for (const symbol of symbols) {
    let depth = 0;
    let currentContainer = symbol.containerName;

    // Walk up the container chain to calculate depth
    while (currentContainer && symbolsByName.has(currentContainer)) {
      depth++;
      const parentSymbol = symbolsByName.get(currentContainer);
      currentContainer = parentSymbol?.containerName;

      // Prevent infinite loops
      if (depth > 10) break;
    }

    result.push({ symbol, depth });
  }

  return result;
}

function findRootContainer(
  symbol: FlattenedSymbol,
  symbolsWithDepth: SymbolWithDepth[]
): string | null {
  let currentContainer = symbol.containerName;
  let depth = 0;

  // Walk up the container chain to find the root
  while (currentContainer && depth < 10) {
    // Prevent infinite loops
    const parentSymbol = symbolsWithDepth.find(
      (s) => s.symbol.name === currentContainer
    );
    if (!parentSymbol || parentSymbol.depth === 0) {
      return currentContainer;
    }
    currentContainer = parentSymbol.symbol.containerName;
    depth++;
  }

  return currentContainer ?? null;
}

/**
 * Determines if a symbol is a leaf (has no children) in the symbol hierarchy
 * Leaf symbols are the only ones that should show code blocks to avoid duplication
 */
function isLeafSymbol(
  symbol: FlattenedSymbol,
  allSymbols: Array<{ symbol: FlattenedSymbol; depth: number }>
): boolean {
  // Check if any other symbol has this symbol as its container
  return !allSymbols.some(
    (other) => other.symbol.containerName === symbol.name
  );
}
