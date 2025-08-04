/**
 * Symbol enrichment utilities - adds code snippets to symbols
 */

import * as fs from 'fs/promises';
import {
  Range,
  Location,
  WorkspaceSymbol,
  SymbolInformation,
  DocumentSymbol,
  FlattenedSymbol,
} from '../types/lsp.js';

// Supported symbol types for enrichment
export type EnrichableSymbol =
  | Location
  | WorkspaceSymbol
  | SymbolInformation
  | DocumentSymbol
  | FlattenedSymbol
  | { uri: string; range: Range } // Generic location-like object
  | { location: Location }; // Legacy format with location wrapper

export interface EnrichedSymbol<T extends EnrichableSymbol = EnrichableSymbol> {
  symbol: T;
  codeSnippet?: string;
  error?: string;
}

interface FileCache {
  [filePath: string]: string[];
}

/**
 * Converts a file:// URI to a local file path with proper URL decoding
 */
function decodeFileUriToPath(uri: string): string {
  // Remove file:// prefix
  let path = uri.replace('file://', '');

  // Decode URL encoding (like %40 -> @)
  try {
    path = decodeURIComponent(path);
  } catch {
    // If decoding fails, use the original path
  }

  return path;
}

/**
 * Enriches a list of symbols with code snippets by reading their source files
 */
export async function enrichSymbolsWithCode<T extends EnrichableSymbol>(
  symbols: T[]
): Promise<EnrichedSymbol<T>[]> {
  const fileCache: FileCache = {};
  const enrichedSymbols: EnrichedSymbol<T>[] = [];

  // Group symbols by file to minimize file reads
  const symbolsByFile = new Map<string, T[]>();
  for (const symbol of symbols) {
    const uri = extractUriFromSymbol(symbol);
    if (uri) {
      const filePath = decodeFileUriToPath(uri);
      if (!symbolsByFile.has(filePath)) {
        symbolsByFile.set(filePath, []);
      }
      symbolsByFile.get(filePath)!.push(symbol);
    }
  }

  // Read each file once and cache the lines
  for (const [filePath, fileSymbols] of symbolsByFile) {
    try {
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const lines = fileContent.split('\n');
      fileCache[filePath] = lines;

      // Extract code snippets for all symbols in this file
      for (const symbol of fileSymbols) {
        const range = extractRangeFromSymbol(symbol);
        const snippet = range ? extractCodeSnippet(lines, range) : null;
        const enriched: EnrichedSymbol<T> = { symbol };
        if (snippet) {
          enriched.codeSnippet = snippet;
        }
        enrichedSymbols.push(enriched);
      }
    } catch (error) {
      // If file reading fails, add symbols without snippets
      for (const symbol of fileSymbols) {
        enrichedSymbols.push({
          symbol,
          error: `Could not read file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }
  }

  return enrichedSymbols;
}

/**
 * Type guard and extraction functions for symbol properties
 */
function extractUriFromSymbol(symbol: EnrichableSymbol): string | null {
  if ('uri' in symbol && typeof symbol.uri === 'string') {
    return symbol.uri;
  }
  if ('location' in symbol && symbol.location && 'uri' in symbol.location) {
    return symbol.location.uri;
  }
  return null;
}

function extractRangeFromSymbol(symbol: EnrichableSymbol): Range | null {
  if ('range' in symbol && symbol.range) {
    return symbol.range;
  }
  if ('location' in symbol && symbol.location && 'range' in symbol.location) {
    return symbol.location.range;
  }
  return null;
}

/**
 * Extracts code snippet from file lines using LSP range (0-based)
 */
function extractCodeSnippet(fileLines: string[], range: Range): string {
  const startLine = range.start.line;
  const endLine = range.end.line;
  const startChar = range.start.character;
  const endChar = range.end.character;

  // Validate line numbers
  if (
    startLine < 0 ||
    startLine >= fileLines.length ||
    endLine < 0 ||
    endLine >= fileLines.length
  ) {
    return '// Code snippet unavailable - invalid range';
  }

  if (startLine === endLine) {
    // Single line snippet
    const line = fileLines[startLine];
    if (!line) return '// Code snippet unavailable - line not found';
    return line.substring(startChar, endChar);
  }

  // Multi-line snippet
  const snippetLines: string[] = [];

  // First line (from startChar to end)
  const firstLine = fileLines[startLine];
  if (firstLine) {
    snippetLines.push(firstLine.substring(startChar));
  }

  // Middle lines (full lines)
  for (let i = startLine + 1; i < endLine; i++) {
    const line = fileLines[i];
    if (line !== undefined) {
      snippetLines.push(line);
    }
  }

  // Last line (from start to endChar)
  if (endLine < fileLines.length) {
    const lastLine = fileLines[endLine];
    if (lastLine !== undefined) {
      snippetLines.push(lastLine.substring(0, endChar));
    }
  }

  return snippetLines.join('\n');
}

/**
 * Creates a code preview with markdown formatting
 * If maxLines is 0, shows entire code snippet without truncation
 */
export function createCodePreview(
  codeSnippet: string,
  maxLines: number = 0
): string {
  // Trim trailing newlines from the snippet
  const trimmedSnippet = codeSnippet.replace(/\n+$/, '');

  let preview: string;

  if (maxLines === 0) {
    // Show entire code snippet
    preview = trimmedSnippet;
  } else {
    // Truncate to maxLines if specified
    const lines = trimmedSnippet.split('\n');
    if (lines.length <= maxLines) {
      preview = trimmedSnippet;
    } else {
      const previewLines = lines.slice(0, maxLines);
      const remainingLines = lines.length - maxLines;
      preview = `${previewLines.join('\n')}\n// ... ${remainingLines} more lines`;
    }
  }

  // Wrap in markdown code block
  return `\`\`\`typescript\n${preview}\n\`\`\``;
}

/**
 * Creates a single-line signature preview from a code snippet
 * Condenses whitespace and limits to specified character count
 */
export function createSignaturePreview(
  codeSnippet: string,
  maxChars: number = 100
): string {
  // Normalize whitespace: replace newlines with spaces, collapse multiple spaces
  const normalized = codeSnippet
    .replace(/\n/g, ' ') // Replace newlines with spaces
    .replace(/\s+/g, ' ') // Collapse multiple whitespace to single space
    .trim(); // Remove leading/trailing whitespace

  // Truncate if too long
  if (normalized.length <= maxChars) {
    return normalized;
  }

  // Find a good truncation point (prefer to break at word boundaries)
  const truncated = normalized.substring(0, maxChars - 3);
  const lastSpace = truncated.lastIndexOf(' ');

  // If we found a space near the end, break there; otherwise just cut at maxChars
  const breakPoint = lastSpace > maxChars - 20 ? lastSpace : maxChars - 3;
  return normalized.substring(0, breakPoint) + '...';
}

/**
 * Enriches a list of symbol locations with code snippets
 */
export async function enrichSymbolLocations(
  locations: Location[]
): Promise<{ codeSnippet: string | null }[]> {
  const results: { codeSnippet: string | null }[] = [];
  const fileCache: FileCache = {};

  for (const location of locations) {
    try {
      const filePath = decodeFileUriToPath(location.uri);

      // Load file if not cached
      if (!fileCache[filePath]) {
        const fileContent = await fs.readFile(filePath, 'utf-8');
        fileCache[filePath] = fileContent.split('\n');
      }

      // Expand range to get full line context
      const expandedRange: Range = {
        start: { line: location.range.start.line, character: 0 },
        end: { line: location.range.start.line, character: 1000 },
      };

      const snippet = extractCodeSnippet(fileCache[filePath], expandedRange);
      results.push({ codeSnippet: snippet });
    } catch {
      // If we can't read the file, just return null for the snippet
      results.push({ codeSnippet: null });
    }
  }

  return results;
}
