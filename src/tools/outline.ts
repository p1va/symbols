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
        'Get hierarchical outline of code symbols in a file. Shows names, types, and locations and a code snippet when preview: true',
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

  // Group symbols by their file-level root containers
  // A symbol is "file-level root" if:
  // 1. It has no containerName, OR
  // 2. Its containerName doesn't exist in this file (e.g., packages, external modules)
  //
  // Use two-pass approach to handle symbols in any order:
  // Pass 1: Identify and create all file-level root container entries
  // Pass 2: Add child symbols to their file-level root containers
  const rootContainers = new Map<string, EnrichedSymbol[]>();

  // Pass 1: Identify file-level root symbols
  for (const enriched of enrichedSymbols) {
    const isFileLevelRoot =
      !enriched.symbol.containerName ||
      !symbolsByName.has(enriched.symbol.containerName);

    if (isFileLevelRoot) {
      rootContainers.set(enriched.symbol.name, [enriched]);
    }
  }

  // Pass 2: Add child symbols to their file-level root containers
  for (const enriched of enrichedSymbols) {
    // Skip if this is already a root container
    const isFileLevelRoot =
      !enriched.symbol.containerName ||
      !symbolsByName.has(enriched.symbol.containerName);

    if (!isFileLevelRoot) {
      // Find the file-level root container for this symbol
      const rootContainerName = findFileLevelRootContainer(
        enriched.symbol,
        symbolsByName
      );
      if (rootContainerName && rootContainers.has(rootContainerName)) {
        rootContainers.get(rootContainerName)!.push(enriched);
      }
      // Note: We no longer collect orphans since all symbols should have
      // a file-level root (either themselves or an ancestor in the file)
    }
  }

  // Format each root container and its children
  for (const [, containerSymbols] of rootContainers) {
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

      // Check if this symbol has an external container (not in this file)
      const hasExternalContainer =
        symbol.containerName && !symbolsByName.has(symbol.containerName);
      const containerSuffix = hasExternalContainer
        ? ` (${symbol.containerName})`
        : '';

      // Base symbol line
      const symbolLine = `${indent}@${line}:${char} ${kind} - ${symbol.name}${containerSuffix}`;
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
 * Finds the file-level root container for a symbol by walking up the container chain.
 * Returns the first ancestor container that exists in this file, or null if none found.
 *
 * Example hierarchy:
 * - package "org.example" (not in file)
 *   - class "App" (in file) <- file-level root
 *     - method "main" (in file)
 *
 * For "main", this returns "App" (the first ancestor in the file)
 */
function findFileLevelRootContainer(
  symbol: FlattenedSymbol,
  symbolsByName: Map<string, FlattenedSymbol>
): string | null {
  let currentContainer = symbol.containerName;
  let depth = 0;

  while (currentContainer && depth < MAX_CONTAINER_DEPTH) {
    const parentSymbol = symbolsByName.get(currentContainer);

    if (!parentSymbol) {
      // Container doesn't exist in this file - we've gone too far
      return null;
    }

    // Check if this parent is a file-level root
    const parentIsFileLevelRoot =
      !parentSymbol.containerName ||
      !symbolsByName.has(parentSymbol.containerName);

    if (parentIsFileLevelRoot) {
      // Found the file-level root
      return currentContainer;
    }

    // Keep walking up
    currentContainer = parentSymbol.containerName;
    depth++;
  }

  return null;
}
