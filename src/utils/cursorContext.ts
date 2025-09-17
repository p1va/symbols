/**
 * Cursor Context Utilities
 *
 * Provides cursor context information for MCP operations that need to show
 * what symbol was targeted at a specific position.
 */

import { LspClient, OneBasedPosition, toZeroBased } from '../types.js';
import {
  getDocumentSymbols,
  SymbolKindValue,
  getSemanticTokens,
  findSemanticTokenAtPosition,
  SemanticToken,
} from '../types/lsp.js';
import { formatFilePath } from '../tools/utils.js';
import logger from './logger.js';

export interface CursorContext {
  operation: string;
  file: string;
  position: OneBasedPosition; // 1-based user position
  symbolName?: string;
  symbolKind?: string;
  tokenName?: string;
  tokenType?: string;
  tokenModifiers?: string[];
  snippet: string; // Text snippet showing cursor position with | marker
}

export interface SymbolAtPosition {
  name: string;
  kind: SymbolKindValue;
  containerName?: string;
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
 * Finds the semantic token at the given position by requesting semantic tokens
 * and finding the one that contains the exact cursor position.
 */
async function findSemanticTokenAtCursorPosition(
  client: LspClient,
  uri: string,
  position: OneBasedPosition,
  fileContent: string
): Promise<SemanticToken | null> {
  try {
    logger.info(
      `Finding semantic token at position ${position.line}:${position.character} in ${uri}`
    );

    // Convert to 0-based position for semantic tokens
    const lspPosition = toZeroBased(position);
    logger.info(
      `Converted to LSP position: ${lspPosition.line}:${lspPosition.character}`
    );

    // Get semantic tokens
    const semanticTokensResult = await getSemanticTokens(
      client,
      uri,
      fileContent
    );

    if (
      !semanticTokensResult?.tokens ||
      semanticTokensResult.tokens.length === 0
    ) {
      logger.info('No semantic tokens found, returning null');
      return null;
    }

    // Find token at exact position
    const token = findSemanticTokenAtPosition(
      semanticTokensResult.tokens,
      lspPosition.line,
      lspPosition.character
    );

    if (token) {
      logger.info(
        `Found semantic token: "${token.text}" type: ${token.tokenType} modifiers: [${token.tokenModifiers.join(', ')}]`
      );
    } else {
      logger.info('No semantic token found at position');
    }

    return token;
  } catch (error) {
    logger.error(
      `Error in findSemanticTokenAtCursorPosition: ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
}

/**
 * Finds the symbol at the given position by requesting document symbols
 * and finding the one with the smallest range that contains the position.
 * Uses shared getDocumentSymbols utility for proper typing.
 */
async function findSymbolAtPosition(
  client: LspClient,
  uri: string,
  position: OneBasedPosition
): Promise<SymbolAtPosition | null> {
  try {
    logger.info(
      `Finding symbol at position ${position.line}:${position.character} in ${uri}`
    );

    // Convert to 0-based position for LSP
    const lspPosition = toZeroBased(position);
    logger.info(
      `Converted to LSP position: ${lspPosition.line}:${lspPosition.character}`
    );

    // Get flattened symbols using shared utility
    const symbols = await getDocumentSymbols(client, uri);
    logger.info(`Found ${symbols.length} document symbols`);

    if (symbols.length === 0) {
      logger.info('No symbols found, returning null');
      return null;
    }

    // Find symbols that contain the position
    const containingSymbols = symbols.filter((symbol) => {
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

      logger.info(`Symbol "${symbol.name}" contains position`, {
        symbolName: symbol.name,
        symbolKind: symbol.kind,
        symbolRange: range,
        targetPosition: lspPosition,
      });

      return true;
    });

    logger.info(`Found ${containingSymbols.length} containing symbols`);

    if (containingSymbols.length === 0) {
      logger.info('No containing symbols found, returning null');
      return null;
    }

    // Sort by range size (smallest first - most specific symbol)
    // Using same logic as C#: (endLine - startLine) * 10000 + (endChar - startChar)
    containingSymbols.sort((a, b) => {
      const aSize =
        (a.range.end.line - a.range.start.line) * 10000 +
        (a.range.end.character - a.range.start.character);
      const bSize =
        (b.range.end.line - b.range.start.line) * 10000 +
        (b.range.end.character - b.range.start.character);
      return aSize - bSize;
    });

    const bestMatch = containingSymbols[0];
    if (!bestMatch) {
      logger.info('No best match found after sorting');
      return null;
    }

    logger.info(
      `Selected best match: "${bestMatch.name}" (kind: ${bestMatch.kind})`,
      {
        name: bestMatch.name,
        kind: bestMatch.kind,
        range: bestMatch.range,
        containerName: bestMatch.containerName,
      }
    );

    return {
      name: bestMatch.name,
      kind: bestMatch.kind,
      ...(bestMatch.containerName && {
        containerName: bestMatch.containerName,
      }),
    };
  } catch (error) {
    logger.error(
      `Error in findSymbolAtPosition: ${error instanceof Error ? error.message : String(error)}`
    );
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
// Define interface for preloaded file data
interface PreloadedFile {
  content: string;
  // Add other properties as needed
}

async function getFileContent(
  uri: string,
  preloadedFiles: Map<string, PreloadedFile>,
  filePath: string
): Promise<string | null> {
  try {
    // Always read fresh from filesystem for consistent behavior with transient strategy
    const fs = await import('fs');
    return await fs.promises.readFile(filePath, 'utf8');
  } catch {
    // Fallback to preloaded content if file read fails
    for (const [fileUri, fileData] of preloadedFiles.entries()) {
      if (fileUri === uri) {
        return fileData.content;
      }
    }
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
  preloadedFiles: Map<string, PreloadedFile>
): Promise<CursorContext | null> {
  // Get file content
  const fileContent = await getFileContent(uri, preloadedFiles, filePath);
  if (!fileContent) {
    return null;
  }

  // Find the symbol at the position using document symbols
  const symbolAtPosition = await findSymbolAtPosition(client, uri, position);

  // Find the semantic token at the position
  const semanticToken = await findSemanticTokenAtCursorPosition(
    client,
    uri,
    position,
    fileContent
  );

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

  if (semanticToken?.text) {
    result.tokenName = semanticToken.text;
  }

  if (semanticToken?.tokenType) {
    result.tokenType = semanticToken.tokenType;
  }

  if (
    semanticToken?.tokenModifiers &&
    semanticToken.tokenModifiers.length > 0
  ) {
    result.tokenModifiers = semanticToken.tokenModifiers;
  }

  return result;
}

/**
 * Formats cursor context for display in MCP responses
 */
export function formatCursorContext(context: CursorContext): string {
  // Document symbol info (broader structural context)
  const symbolInfo =
    context.symbolName && context.symbolKind
      ? `(${context.symbolKind}) ${context.symbolName}`
      : 'n/a';

  // Semantic token info (precise clicked token)
  const targetToken =
    context.tokenName && context.tokenType
      ? `(${context.tokenType}) ${context.tokenName}${
          context.tokenModifiers && context.tokenModifiers.length > 0
            ? ` [${context.tokenModifiers.join(', ')}]`
            : ''
        }`
      : 'n/a';

  // Capitalize first letter of operation and format file path
  const capitalizedOperation =
    context.operation.charAt(0).toUpperCase() + context.operation.slice(1);
  const formattedPath = formatFilePath(context.file);

  return `${capitalizedOperation} on ${formattedPath}:${context.position.line}:${context.position.character}
    Snippet: \`${context.snippet}\`
    At Cursor: ${targetToken}
    At Line: ${symbolInfo}`;
}
