/**
 * Cursor Context Utilities
 *
 * Provides cursor context information for MCP operations that need to show
 * what symbol was targeted at a specific position.
 */

import { LspClient, OneBasedPosition, toZeroBased } from '../types.js';
import {
  parseDocumentSymbolResponse,
  SymbolInformation,
  DocumentSymbol,
  SymbolKindValue,
  Range,
} from '../types/lsp.js';

export interface CursorContext {
  operation: string;
  file: string;
  position: OneBasedPosition; // 1-based user position
  symbolName?: string;
  symbolKind?: string;
  snippet: string; // Text snippet showing cursor position with | marker
}

export interface SymbolAtPosition {
  name: string;
  kind: SymbolKindValue; // Properly typed LSP SymbolKind
  range: Range; // Use LSP Range type
}

/**
 * Converts LSP SymbolKind number to readable string
 */
function symbolKindToString(kind: number): string {
  const kinds = [
    'File',
    'Module',
    'Namespace',
    'Package',
    'Class',
    'Method',
    'Property',
    'Field',
    'Constructor',
    'Enum',
    'Interface',
    'Function',
    'Variable',
    'Constant',
    'String',
    'Number',
    'Boolean',
    'Array',
    'Object',
    'Key',
    'Null',
    'EnumMember',
    'Struct',
    'Event',
    'Operator',
    'TypeParameter',
  ];
  return kinds[kind - 1] || 'Unknown';
}

/**
 * Finds the symbol at the given position by requesting document symbols
 * and finding the one with the smallest range that contains the position.
 * Follows the algorithm specified in CURSOR_CONTEXT.mc
 */
async function findSymbolAtPosition(
  client: LspClient,
  uri: string,
  position: OneBasedPosition // 1-based position - need to convert to LSP 0-based
): Promise<SymbolAtPosition | null> {
  try {
    // Convert to 0-based position for LSP
    const lspPosition = toZeroBased(position);

    const params = {
      textDocument: { uri },
    };

    const rawSymbols = await client.connection.sendRequest(
      'textDocument/documentSymbol',
      params
    );

    // Use typed parser to handle both SymbolInformation[] and DocumentSymbol[]
    const symbolResult = parseDocumentSymbolResponse(rawSymbols);

    if (symbolResult.symbols.length === 0) {
      return null;
    }

    let candidateSymbols: Array<{
      name: string;
      kind: SymbolKindValue;
      range: Range;
    }> = [];

    if (symbolResult.type === 'symbolInformation') {
      // SymbolInformation format - flat structure
      candidateSymbols = symbolResult.symbols.map(
        (symbol: SymbolInformation) => ({
          name: symbol.name,
          kind: symbol.kind,
          range: symbol.location.range,
        })
      );
    } else {
      // DocumentSymbol format - flatten nested symbols
      function flattenDocumentSymbols(
        symbols: DocumentSymbol[]
      ): Array<{ name: string; kind: SymbolKindValue; range: Range }> {
        const flattened: Array<{
          name: string;
          kind: SymbolKindValue;
          range: Range;
        }> = [];
        for (const symbol of symbols) {
          flattened.push({
            name: symbol.name,
            kind: symbol.kind,
            range: symbol.range,
          });
          if (symbol.children) {
            flattened.push(...flattenDocumentSymbols(symbol.children));
          }
        }
        return flattened;
      }
      candidateSymbols = flattenDocumentSymbols(symbolResult.symbols);
    }

    // Find symbols that contain the position
    const containingSymbols = candidateSymbols.filter((symbol) => {
      const range = symbol.range;
      const start = range.start;
      const end = range.end;

      // Check if position is within range (0-based LSP coordinates)
      if (lspPosition.line < start.line || lspPosition.line > end.line) {
        return false;
      }

      if (
        lspPosition.line === start.line &&
        lspPosition.character < start.character
      ) {
        return false;
      }

      if (
        lspPosition.line === end.line &&
        lspPosition.character > end.character
      ) {
        return false;
      }

      return true;
    });

    if (containingSymbols.length === 0) {
      return null;
    }

    // Sort by range size (smallest first - most specific symbol)
    // As specified: "order by symbol with shorter spans first"
    containingSymbols.sort((a, b) => {
      const aSize =
        (a.range.end.line - a.range.start.line) * 1000 +
        (a.range.end.character - a.range.start.character);
      const bSize =
        (b.range.end.line - b.range.start.line) * 1000 +
        (b.range.end.character - b.range.start.character);
      return aSize - bSize;
    });

    const bestMatch = containingSymbols[0];
    if (!bestMatch) {
      return null;
    }

    return {
      name: bestMatch.name,
      kind: bestMatch.kind,
      range: bestMatch.range,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Creates a text snippet showing the cursor position with surrounding context
 */
function createTextSnippet(
  fileContent: string,
  position: OneBasedPosition, // 1-based user position
  contextChars: number = 10
): string {
  const lines = fileContent.split('\n');
  const lineIndex = position.line - 1; // Convert to 0-based
  const charIndex = position.character - 1; // Convert to 0-based

  if (lineIndex < 0 || lineIndex >= lines.length) {
    return 'Invalid position';
  }

  const line = lines[lineIndex];
  if (!line || charIndex < 0 || charIndex > line.length) {
    return 'Invalid position';
  }

  // Extract context around the cursor
  const start = Math.max(0, charIndex - contextChars);
  const end = Math.min(line.length, charIndex + contextChars);

  const beforeCursor = line.substring(start, charIndex);
  const afterCursor = line.substring(charIndex, end);

  // Add ellipsis if we truncated
  const prefix = start > 0 ? '...' : '';
  const suffix = end < line.length ? '...' : '';

  return `${prefix}${beforeCursor}|${afterCursor}${suffix}`;
}

/**
 * Gets file content from either preloaded files or by reading from filesystem
 */
async function getFileContent(
  uri: string,
  preloadedFiles: Map<string, any>,
  filePath: string
): Promise<string | null> {
  // Check if file is preloaded
  for (const [fileUri, fileData] of preloadedFiles.entries()) {
    if (fileUri === uri) {
      return fileData.content;
    }
  }

  try {
    // Read from filesystem as fallback
    const fs = await import('fs');
    return await fs.promises.readFile(filePath, 'utf8');
  } catch (error) {
    return null;
  }
}

/**
 * Generates cursor context information for an operation
 */
export async function generateCursorContext(
  operation: string,
  client: LspClient,
  uri: string,
  filePath: string,
  position: OneBasedPosition, // 1-based user position
  preloadedFiles: Map<string, any>
): Promise<CursorContext | null> {
  // Get file content
  const fileContent = await getFileContent(uri, preloadedFiles, filePath);
  if (!fileContent) {
    return null;
  }

  // Find the symbol at the position
  const symbolAtPosition = await findSymbolAtPosition(client, uri, position);

  // Create text snippet
  const snippet = createTextSnippet(fileContent, position);

  const result: CursorContext = {
    operation,
    file: uri.replace('file://', ''), // Remove file:// prefix for display
    position,
    snippet,
  };

  if (symbolAtPosition?.name) {
    result.symbolName = symbolAtPosition.name;
  }

  if (symbolAtPosition) {
    result.symbolKind = symbolKindToString(symbolAtPosition.kind);
  }

  return result;
}

/**
 * Formats cursor context for display in MCP responses
 */
export function formatCursorContext(context: CursorContext): string {
  const symbolInfo =
    context.symbolName && context.symbolKind
      ? `(${context.symbolKind}) ${context.symbolName}`
      : 'Unknown symbol';

  return `${context.operation} on file ${context.file}:${context.position.line}:${context.position.character}
    Symbol: ${symbolInfo}
    Cursor: \`${context.snippet}\``;
}
