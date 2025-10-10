/**
 * Outline Tool - Get hierarchical symbol outline of a code file
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { LspContext } from '../types.js';
import * as LspOperations from '../lsp/operations/index.js';
import { fileSchema } from './schemas.js';
import { getSymbolKindName, formatFilePath } from './utils.js';
import { enrichSymbolsWithCode, createSignaturePreview } from './enrichment.js';
import { FlattenedSymbol } from '../types/lsp.js';
import { validateFile } from './validation.js';
import {
  DEFAULT_CONTAINER_KINDS,
  isContainerKind,
} from '../config/symbol-kinds.js';

export function registerOutlineTool(
  server: McpServer,
  createContext: () => LspContext
) {
  server.registerTool(
    'outline',
    {
      title: 'Outline',
      description:
        "Get hierarchical symbol outline of a file's structure. Shows symbol names, types, and locations. Use preview: true to include code snippets from declarations.",
      inputSchema: fileSchema,
    },
    async (request) => {
      const ctx = createContext();
      if (!ctx.client) throw new Error('LSP client not initialized');

      // Validate and parse request arguments
      const validatedRequest = validateFile(request);

      const result = await LspOperations.outlineSymbols(ctx, validatedRequest);
      if (!result.ok) throw new Error(result.error.message);

      // Get containerKinds from LSP config or use defaults
      const containerKinds =
        ctx.lspConfig?.symbols?.containerKinds || DEFAULT_CONTAINER_KINDS;

      const formattedText = await formatOutlineResults(
        { symbols: result.data },
        validatedRequest.file,
        Boolean(validatedRequest.preview),
        containerKinds
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

interface EnrichedSymbol {
  symbol: FlattenedSymbol;
  codeSnippet?: string;
  signaturePreview?: string;
  error?: string;
}

function humanizeSymbolKind(kind: string): string {
  return kind.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
}

function pluralizeSymbolKind(kind: string, count: number): string {
  const humanized = humanizeSymbolKind(kind);
  if (count === 1) {
    return `1 ${humanized}`;
  }

  const words = humanized.split(' ');
  if (words.length === 0) {
    return `${count}`;
  }

  const lastWordIndex = words.length - 1;
  const lastWord = words[lastWordIndex]!;
  let pluralLast = lastWord;

  if (lastWord === 'property') {
    pluralLast = 'properties';
  } else if (lastWord === 'class') {
    pluralLast = 'classes';
  } else if (lastWord === 'index') {
    pluralLast = 'indices';
  } else if (lastWord.endsWith('y') && !/[aeiou]y$/.test(lastWord)) {
    pluralLast = `${lastWord.slice(0, -1)}ies`;
  } else {
    pluralLast = `${lastWord}s`;
  }

  words[lastWordIndex] = pluralLast;
  return `${count} ${words.join(' ')}`;
}

/**
 * Filters symbols based on container/leaf classification
 * Returns only symbols that should be displayed:
 * - Top-level symbols (no container)
 * - Children of container kinds (Class, Interface, etc.)
 * - Excludes children of leaf kinds (Method, Function, etc.)
 */
function filterSymbolsByContainerLeaf(
  symbols: FlattenedSymbol[],
  containerKinds: number[]
): FlattenedSymbol[] {
  // Create a map of symbol name to symbol for quick lookup
  const symbolsByName = new Map<string, FlattenedSymbol>();
  for (const symbol of symbols) {
    symbolsByName.set(symbol.name, symbol);
  }

  return symbols.filter((symbol) => {
    // Include all top-level symbols (no container)
    if (!symbol.containerName) {
      return true;
    }

    // Find the parent symbol
    const parentSymbol = symbolsByName.get(symbol.containerName);
    if (!parentSymbol) {
      // Parent not found - include by default
      return true;
    }

    // Include if parent is a container kind
    return isContainerKind(parentSymbol.kind, containerKinds);
  });
}

/**
 * Maximum depth for container chain walking to prevent infinite loops
 */
const MAX_CONTAINER_DEPTH = 10;

/**
 * Calculates depth for display purposes (indentation)
 * This is purely for formatting, not for filtering
 */
function calculateDisplayDepth(
  symbol: FlattenedSymbol,
  symbolsByName: Map<string, FlattenedSymbol>
): number {
  let depth = 0;
  let currentContainer = symbol.containerName;

  while (currentContainer && depth < MAX_CONTAINER_DEPTH) {
    const parentSymbol = symbolsByName.get(currentContainer);
    if (!parentSymbol) break;

    depth++;
    currentContainer = parentSymbol.containerName;
  }

  return depth;
}

async function formatOutlineResults(
  data: { symbols: FlattenedSymbol[] },
  filePath: string,
  preview: boolean = false,
  containerKinds: number[] = DEFAULT_CONTAINER_KINDS
): Promise<string> {
  if (!data.symbols || data.symbols.length === 0) {
    return `No symbols found in ${formatFilePath(filePath)}`;
  }

  const symbols = data.symbols;

  // Filter symbols by container/leaf classification
  const filteredSymbols = filterSymbolsByContainerLeaf(symbols, containerKinds);

  // Create symbol name map for depth calculation
  const symbolsByName = new Map<string, FlattenedSymbol>();
  for (const symbol of filteredSymbols) {
    symbolsByName.set(symbol.name, symbol);
  }

  // Enrich symbols with code snippets if preview requested
  let enrichedSymbols: EnrichedSymbol[];

  if (preview) {
    // Extract full declaration from character 0 with modifiers
    const enrichmentResults = await enrichSymbolsWithCode(filteredSymbols, {
      extractFullDeclaration: true,
    });

    enrichedSymbols = filteredSymbols.map((symbol, index) => {
      const result = enrichmentResults[index];
      const enriched: EnrichedSymbol = { symbol };

      if (result?.codeSnippet) {
        enriched.signaturePreview = createSignaturePreview(
          result.codeSnippet,
          100
        );
      }

      if (result?.error) {
        enriched.error = result.error;
      }

      return enriched;
    });
  } else {
    enrichedSymbols = filteredSymbols.map((symbol) => ({ symbol }));
  }

  // Count symbols by type
  const symbolCounts = new Map<string, number>();
  for (const symbol of filteredSymbols) {
    const kind = getSymbolKindName(symbol.kind);
    symbolCounts.set(kind, (symbolCounts.get(kind) || 0) + 1);
  }

  // Create summary line
  const typeBreakdown = Array.from(symbolCounts.entries())
    .sort(([, a], [, b]) => b - a) // Sort by count descending
    .map(([type, count]) => pluralizeSymbolKind(type, count))
    .join(', ');

  const sections = [];

  // Add summary block
  sections.push(
    `Found ${filteredSymbols.length} symbols in file: ${formatFilePath(filePath)}\nSymbol breakdown: ${typeBreakdown}`
  );

  // Group by root-level symbols (no container)
  const rootContainers = new Map<string, EnrichedSymbol[]>();
  const orphanedSymbols: EnrichedSymbol[] = [];

  for (const enriched of enrichedSymbols) {
    if (!enriched.symbol.containerName) {
      // This is a root-level symbol
      rootContainers.set(enriched.symbol.name, [enriched]);
    } else {
      // Find the root container for this symbol
      const rootContainerName = findRootContainerName(
        enriched.symbol,
        symbolsByName
      );
      if (rootContainerName && rootContainers.has(rootContainerName)) {
        rootContainers.get(rootContainerName)!.push(enriched);
      } else {
        orphanedSymbols.push(enriched);
      }
    }
  }

  // Add orphaned symbols to sections if any
  if (orphanedSymbols.length > 0) {
    rootContainers.set('__orphaned__', orphanedSymbols);
  }

  // Format each root container and its children
  for (const [containerName, containerSymbols] of rootContainers) {
    if (containerName === '__orphaned__') continue; // Skip orphaned marker

    // Sort by line number within each container
    const sortedSymbols = containerSymbols.sort((a, b) => {
      const lineA = a.symbol.range.start.line;
      const lineB = b.symbol.range.start.line;
      return lineA - lineB;
    });

    let containerContent = '';
    for (const enriched of sortedSymbols) {
      const { symbol, signaturePreview, error } = enriched;

      // Calculate display depth for indentation
      const depth = calculateDisplayDepth(symbol, symbolsByName);
      const indent = '  '.repeat(depth);

      const line = symbol.range.start.line + 1; // Convert to 1-based
      const char = symbol.range.start.character + 1; // Convert to 1-based
      const kind = getSymbolKindName(symbol.kind);

      // Base symbol line
      const symbolLine = `${indent}@${line}:${char} ${kind} - ${symbol.name}`;
      containerContent += symbolLine + '\n';

      // Add signature preview on new line with backticks if available
      if (signaturePreview) {
        containerContent += `${indent}  \`${signaturePreview}\`\n`;
      } else if (error) {
        containerContent += `${indent}  // ${error}\n\n`;
      }
    }

    sections.push(containerContent.trim());
  }

  return sections.join('\n\n');
}

/**
 * Finds the root container name for a symbol by walking up the container chain
 */
function findRootContainerName(
  symbol: FlattenedSymbol,
  symbolsByName: Map<string, FlattenedSymbol>
): string | null {
  let currentContainer = symbol.containerName;
  let depth = 0;

  while (currentContainer && depth < MAX_CONTAINER_DEPTH) {
    const parentSymbol = symbolsByName.get(currentContainer);
    if (!parentSymbol || !parentSymbol.containerName) {
      // Found the root
      return currentContainer;
    }
    currentContainer = parentSymbol.containerName;
    depth++;
  }

  return currentContainer ?? null;
}
