/**
 * Outline Tool - Get hierarchical symbol outline of a code file
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { prepareFileRequest } from '../preparation.js';
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
import type { LspManager } from '../runtime/lsp-manager.js';

export function registerOutlineTool(server: McpServer, manager: LspManager) {
  server.registerTool(
    'outline',
    {
      title: 'Outline',
      description:
        'Return a hierarchical outline of symbols in a file, including names, kinds, and locations. Use `preview: true` to include short declaration snippets.',
      inputSchema: fileSchema,
    },
    async (request) => {
      const validatedRequest = validateFile(request);
      const session = await manager.getSessionForFile(validatedRequest.file);
      const prepared = prepareFileRequest(session, {
        file: validatedRequest.file,
      });
      if (!prepared.ok) throw new Error(prepared.error.message);

      const result = await LspOperations.outlineSymbols(session, prepared.data);
      if (!result.ok) throw new Error(result.error.message);

      const containerKinds =
        session.getProfile().config.symbols?.containerKinds ||
        DEFAULT_CONTAINER_KINDS;

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

function filterSymbolsByContainerLeaf(
  symbols: FlattenedSymbol[],
  containerKinds: number[]
): FlattenedSymbol[] {
  const symbolsByName = new Map<string, FlattenedSymbol>();
  for (const symbol of symbols) {
    symbolsByName.set(symbol.name, symbol);
  }

  return symbols.filter((symbol) => {
    if (!symbol.containerName) {
      return true;
    }

    const parentSymbol = symbolsByName.get(symbol.containerName);
    if (!parentSymbol) {
      return true;
    }

    return isContainerKind(parentSymbol.kind, containerKinds);
  });
}

const MAX_CONTAINER_DEPTH = 10;

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
  preview = false,
  containerKinds: number[] = DEFAULT_CONTAINER_KINDS
): Promise<string> {
  if (!data.symbols || data.symbols.length === 0) {
    return `No symbols found in ${formatFilePath(filePath)}`;
  }

  const symbols = data.symbols;
  const filteredSymbols = filterSymbolsByContainerLeaf(symbols, containerKinds);

  const symbolsByName = new Map<string, FlattenedSymbol>();
  for (const symbol of filteredSymbols) {
    symbolsByName.set(symbol.name, symbol);
  }

  let enrichedSymbols: EnrichedSymbol[];

  if (preview) {
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

  const symbolCounts = new Map<string, number>();
  for (const symbol of filteredSymbols) {
    const kind = getSymbolKindName(symbol.kind);
    symbolCounts.set(kind, (symbolCounts.get(kind) || 0) + 1);
  }

  const typeBreakdown = Array.from(symbolCounts.entries())
    .sort(([, a], [, b]) => b - a)
    .map(([type, count]) => pluralizeSymbolKind(type, count))
    .join(', ');

  const sections = [];

  sections.push(
    `Found ${filteredSymbols.length} symbols in file: ${formatFilePath(filePath)}\nSymbol breakdown: ${typeBreakdown}`
  );

  const rootContainers = new Map<string, EnrichedSymbol[]>();

  for (const enriched of enrichedSymbols) {
    const isFileLevelRoot =
      !enriched.symbol.containerName ||
      !symbolsByName.has(enriched.symbol.containerName);

    if (isFileLevelRoot) {
      rootContainers.set(enriched.symbol.name, [enriched]);
    }
  }

  for (const enriched of enrichedSymbols) {
    const isFileLevelRoot =
      !enriched.symbol.containerName ||
      !symbolsByName.has(enriched.symbol.containerName);

    if (isFileLevelRoot) {
      continue;
    }

    let rootName = enriched.symbol.name;
    let currentContainer = enriched.symbol.containerName;
    let guard = 0;

    while (currentContainer && guard < MAX_CONTAINER_DEPTH) {
      const parent = symbolsByName.get(currentContainer);
      if (
        !parent ||
        !parent.containerName ||
        !symbolsByName.has(parent.containerName)
      ) {
        rootName = parent?.name || currentContainer;
        break;
      }
      currentContainer = parent.containerName;
      guard++;
    }

    if (!rootContainers.has(rootName)) {
      rootContainers.set(rootName, []);
    }

    rootContainers.get(rootName)!.push(enriched);
  }

  for (const [, groupedSymbols] of rootContainers) {
    const sortedSymbols = groupedSymbols.sort((left, right) => {
      if (left.symbol.range.start.line !== right.symbol.range.start.line) {
        return left.symbol.range.start.line - right.symbol.range.start.line;
      }
      return (
        left.symbol.range.start.character - right.symbol.range.start.character
      );
    });

    const lines = sortedSymbols.map((enriched) => {
      const depth = calculateDisplayDepth(enriched.symbol, symbolsByName);
      const indent = '  '.repeat(depth);
      const line = enriched.symbol.range.start.line + 1;
      const character = enriched.symbol.range.start.character + 1;
      const kind = getSymbolKindName(enriched.symbol.kind);
      let formatted = `${indent}@${line}:${character} ${kind} ${enriched.symbol.name}`;

      if (enriched.signaturePreview) {
        formatted += `\n${indent}  \`${enriched.signaturePreview}\``;
      } else if (enriched.error) {
        formatted += `\n${indent}  // ${enriched.error}`;
      }

      return formatted;
    });

    sections.push(lines.join('\n'));
  }

  return sections.join('\n\n');
}
