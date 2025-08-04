/**
 * LSP Types - Import official types from vscode-languageserver-protocol
 * https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/
 */

// Import all the official LSP types instead of defining our own
import {
  // Basic types
  DocumentUri,
  Position,
  Range,
  Location,
  uinteger,

  // Symbol types
  SymbolInformation,
  DocumentSymbol,
  SymbolKind,
  WorkspaceSymbol,

  // Request/Response parameter types
  InitializeParams,
  InitializeResult,
  InitializedParams,
  TextDocumentPositionParams,
  ReferenceParams,
  CompletionParams,
  CompletionList,
  CompletionItem,
  DocumentSymbolParams,
  WorkspaceSymbolParams,
  RenameParams,
  WorkspaceEdit,

  // Response types
  Hover,

  // Notification parameter types
  DidOpenTextDocumentParams,
  DidCloseTextDocumentParams,
  DidChangeTextDocumentParams,
  LogMessageParams,
  PublishDiagnosticsParams,

  // Semantic tokens types
  SemanticTokensParams,
  SemanticTokens,
} from 'vscode-languageserver-protocol';
import logger from '../utils/logger.js';
import { LspClient } from '../types.js';

// Re-export the official types
export {
  DocumentUri,
  Position,
  Range,
  Location,
  uinteger,
  SymbolInformation,
  DocumentSymbol,
  SymbolKind,
  WorkspaceSymbol,
  InitializeParams,
  InitializeResult,
  InitializedParams,
  TextDocumentPositionParams,
  ReferenceParams,
  CompletionParams,
  CompletionList,
  CompletionItem,
  DocumentSymbolParams,
  WorkspaceSymbolParams,
  RenameParams,
  WorkspaceEdit,
  Hover,
  DidOpenTextDocumentParams,
  DidCloseTextDocumentParams,
  DidChangeTextDocumentParams,
  LogMessageParams,
  PublishDiagnosticsParams,
  SemanticTokensParams,
  SemanticTokens,
};

// Keep our custom discriminated union helper since it's useful
export type SymbolKindValue = (typeof SymbolKind)[keyof typeof SymbolKind];

// Internal operation result types (not MCP responses)
// These represent structured data that flows from LspOperations to MCP tools

/** Position information with 1-based coordinates for display */
export interface DisplayPosition {
  line: number;
  character: number;
}

/** Range information with 1-based coordinates for display */
export interface DisplayRange {
  start: DisplayPosition;
  end: DisplayPosition;
}

/** Location information for display */
export interface DisplayLocation {
  uri: string;
  range: DisplayRange;
}

/** Symbol reference result */
export interface SymbolReference {
  uri: string;
  range: Range; // 0-based LSP range
  line: number; // 1-based display line
  character: number; // 1-based display character
}

/** Symbol inspection result */
export interface SymbolInspection {
  hover: Hover | null;
  definition: Location | Location[] | null;
  typeDefinition: Location | Location[] | null;
  implementation: Location | Location[] | null;
}

/** Completion result item */
export interface CompletionResult {
  label: string;
  kind: number;
  detail: string;
  documentation: string | { kind: string; value: string };
  insertText: string;
  filterText: string;
  sortText: string;
  textEdit?: {
    range: DisplayRange;
    newText: string;
  };
}

/** Symbol search result */
export interface SymbolSearchResult {
  name: string;
  kind: number;
  location: DisplayLocation;
  containerName: string;
}

/** File change for rename operation */
export interface FileChange {
  range: DisplayRange;
  newText: string;
  startLine: number;
  startCharacter: number;
  endLine: number;
  endCharacter: number;
}

/** Rename operation result */
export interface RenameResult {
  [fileUri: string]: FileChange[];
}

/** Log message result */
export interface LogMessageResult {
  type: number;
  message: string;
}

/** Semantic token at a specific position */
export interface SemanticToken {
  line: number; // 0-based
  character: number; // 0-based
  length: number;
  tokenType: string;
  tokenModifiers: string[];
  text: string;
}

// The textDocument/documentSymbol response can be either format
// Use discriminated union based on the presence of location vs range
export type DocumentSymbolResult =
  | { type: 'symbolInformation'; symbols: SymbolInformation[] }
  | { type: 'documentSymbol'; symbols: DocumentSymbol[] };

// Utility function with refined checks
export function parseDocumentSymbolResponse(
  response: DocumentSymbol[] | SymbolInformation[]
): DocumentSymbolResult {
  logger.info(
    `parseDocumentSymbolResponse called with ${Array.isArray(response) ? response.length : 'non-array'} items`
  );

  if (!Array.isArray(response) || response.length === 0) {
    logger.info('Empty or invalid response, returning empty symbolInformation');
    return { type: 'symbolInformation', symbols: [] };
  }

  const firstSymbol = response[0];

  if (firstSymbol && 'location' in firstSymbol) {
    logger.info('Detected SymbolInformation format');
    return {
      type: 'symbolInformation',
      symbols: response as SymbolInformation[],
    };
  }

  if (firstSymbol && 'range' in firstSymbol) {
    logger.info('Detected DocumentSymbol format');
    return {
      type: 'documentSymbol',
      symbols: response as DocumentSymbol[],
    };
  }

  // Refined Fallback: Throw an error to make unexpected formats obvious.
  throw new Error(
    'Unable to determine symbol type from the provided response.'
  );
}

// Common flattened symbol type for internal use
export interface FlattenedSymbol {
  name: string;
  kind: SymbolKindValue;
  range: Range;
  containerName?: string;
  uri?: string;
  selectionRange?: Range;
  detail?: string;
  deprecated?: boolean;
}

// Utility function to get and flatten document symbols with proper typing
export async function getDocumentSymbols(
  client: LspClient,
  uri: string
): Promise<FlattenedSymbol[]> {
  logger.info(`getDocumentSymbols called for ${uri}`);
  const params: DocumentSymbolParams = {
    textDocument: { uri },
  };

  const rawSymbols: DocumentSymbol[] | SymbolInformation[] =
    await client.connection.sendRequest('textDocument/documentSymbol', params);

  const symbolResult = parseDocumentSymbolResponse(rawSymbols);

  if (symbolResult.type === 'symbolInformation') {
    // SymbolInformation format - already flat
    return symbolResult.symbols.map(
      (symbol: SymbolInformation): FlattenedSymbol => ({
        name: symbol.name,
        kind: symbol.kind,
        range: symbol.location.range,
        ...(symbol.containerName && { containerName: symbol.containerName }),
        uri: symbol.location.uri,
        ...(symbol.deprecated && { deprecated: symbol.deprecated }),
      })
    );
  } else {
    // DocumentSymbol format - flatten nested symbols
    const results: FlattenedSymbol[] = [];

    function flattenDocumentSymbols(
      symbols: DocumentSymbol[],
      container?: string
    ): void {
      for (const symbol of symbols) {
        results.push({
          name: symbol.name,
          kind: symbol.kind,
          range: symbol.range,
          ...(symbol.selectionRange && {
            selectionRange: symbol.selectionRange,
          }),
          ...(symbol.detail && { detail: symbol.detail }),
          ...(container && { containerName: container }),
          ...(symbol.deprecated && { deprecated: symbol.deprecated }),
        });

        if (symbol.children) {
          flattenDocumentSymbols(symbol.children, symbol.name);
        }
      }
    }

    flattenDocumentSymbols(symbolResult.symbols);
    return results;
  }
}

/**
 * Decodes semantic tokens from the LSP relative format into absolute positions
 */
export function decodeSemanticTokens(
  data: number[],
  tokenTypes: string[],
  tokenModifiers: string[],
  fileContent: string
): SemanticToken[] {
  const tokens: SemanticToken[] = [];
  const lines = fileContent.split('\n');

  let currentLine = 0;
  let currentChar = 0;

  for (let i = 0; i < data.length; i += 5) {
    // Ensure we have all required indices with proper type checking
    if (i + 4 >= data.length) break;

    const deltaLine = data[i];
    const deltaStart = data[i + 1];
    const length = data[i + 2];
    const tokenType = data[i + 3];
    const tokenModifiersBits = data[i + 4];

    // Validate all values are defined numbers
    if (
      deltaLine === undefined ||
      deltaStart === undefined ||
      length === undefined ||
      tokenType === undefined ||
      tokenModifiersBits === undefined
    ) {
      continue; // Skip malformed token data
    }

    // Calculate absolute position
    currentLine += deltaLine;
    currentChar = deltaLine === 0 ? currentChar + deltaStart : deltaStart;

    // Extract token text with safe length
    const tokenText =
      lines[currentLine]?.substring(currentChar, currentChar + length) || '';

    // Decode modifiers with safe array access
    const modifiersList: string[] = [];
    for (let bit = 0; bit < tokenModifiers.length; bit++) {
      if (tokenModifiersBits & (1 << bit)) {
        const modifier = tokenModifiers[bit];
        if (modifier !== undefined) {
          modifiersList.push(modifier);
        }
      }
    }

    // Safe array access with bounds checking
    const safeTokenType: string =
      tokenType >= 0 && tokenType < tokenTypes.length
        ? (tokenTypes[tokenType] as string)
        : 'unknown';

    tokens.push({
      line: currentLine,
      character: currentChar,
      length,
      tokenType: safeTokenType,
      tokenModifiers: modifiersList,
      text: tokenText,
    });
  }

  return tokens;
}

/**
 * Finds the semantic token at the given position (0-based coordinates)
 * Returns null if no token found at that position
 */
export function findSemanticTokenAtPosition(
  tokens: SemanticToken[],
  line: number,
  character: number
): SemanticToken | null {
  for (const token of tokens) {
    if (token.line === line) {
      // Check if position falls within token's character range
      if (
        character >= token.character &&
        character < token.character + token.length
      ) {
        return token;
      }
    }
  }
  return null;
}

/**
 * Gets semantic tokens for a document and caches token type/modifier legends
 */
export async function getSemanticTokens(
  client: LspClient,
  uri: string,
  fileContent: string
): Promise<{
  tokens: SemanticToken[];
  legend?: { tokenTypes: string[]; tokenModifiers: string[] };
} | null> {
  try {
    logger.info(`getSemanticTokens called for ${uri}`);

    const params: SemanticTokensParams = {
      textDocument: { uri },
    };

    const response: SemanticTokens = await client.connection.sendRequest(
      'textDocument/semanticTokens/full',
      params
    );

    if (!response?.data || response.data.length === 0) {
      logger.info('No semantic tokens data received');
      return null;
    }

    // Get the legend from the server capabilities (should be cached from initialization)
    // For now, we'll use TypeScript's common token types and modifiers
    // This should ideally come from the server's initialize response
    const tokenTypes = [
      'class',
      'enum',
      'interface',
      'namespace',
      'typeParameter',
      'type',
      'parameter',
      'variable',
      'enumMember',
      'property',
      'function',
      'member',
    ];

    const tokenModifiers = [
      'declaration',
      'static',
      'async',
      'readonly',
      'defaultLibrary',
      'local',
    ];

    const decodedTokens = decodeSemanticTokens(
      response.data,
      tokenTypes,
      tokenModifiers,
      fileContent
    );

    logger.info(`Decoded ${decodedTokens.length} semantic tokens`);

    return {
      tokens: decodedTokens,
      legend: { tokenTypes, tokenModifiers },
    };
  } catch (error) {
    logger.error(
      `Error in getSemanticTokens: ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
}
