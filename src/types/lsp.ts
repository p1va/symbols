/**
 * LSP Types - Import official types from vscode-languageserver-protocol
 * https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/
 */

// Import all the official LSP types instead of defining our own
// Import the protocol values used for request typing and runtime guards.
import {
  DocumentSymbolRequest,
  SemanticTokensRequest,
  SymbolKind,
} from 'vscode-languageserver-protocol';

// Import the remainder purely as types so they are erased from the runtime
// import. This avoids Node complaining that these names are not available as
// value exports when executing the code via `tsx` (pnpm dev).
import type {
  // Basic types
  Range,
  Location,

  // Symbol types
  SymbolInformation,
  DocumentSymbol,
  WorkspaceSymbol,

  // Request/Response parameter types
  TextDocumentPositionParams,
  ReferenceParams,
  CompletionParams,
  CompletionItem,
  DocumentSymbolParams,
  WorkspaceSymbolParams,
  RenameParams,

  // Response types
  Hover,
  CallHierarchyItem,
  CallHierarchyIncomingCall,
  CallHierarchyOutgoingCall,

  // Notification parameter types
  // Diagnostic types for pull diagnostics (used in operations)
  DocumentDiagnosticParams,

  // Semantic tokens types
  SemanticTokensParams,
  SemanticTokensLegend,
} from 'vscode-languageserver-protocol';
import logger from '../utils/logger.js';
import type { LspClient } from '../types.js';
import type { SendLspRequest } from '../lsp/request.js';

// Re-export the official types
export type {
  Range,
  Location,
  SymbolInformation,
  WorkspaceSymbol,
  TextDocumentPositionParams,
  ReferenceParams,
  CompletionParams,
  CompletionItem,
  WorkspaceSymbolParams,
  RenameParams,
  Hover,
  CallHierarchyItem,
  CallHierarchyIncomingCall,
  CallHierarchyOutgoingCall,
  // Diagnostic types for pull diagnostics (used in operations)
  DocumentDiagnosticParams,
};

// Export the runtime SymbolKind value separately so both type and runtime
// consumers continue to function.
export { SymbolKind };

// Keep our custom discriminated union helper since it's useful
export type SymbolKindValue = (typeof SymbolKind)[keyof typeof SymbolKind];

// Internal operation result types (not MCP responses)
// These represent structured data that flows from LspOperations to MCP tools

/** Symbol reference result */
export type SymbolReference = Location;

/** Symbol inspection result */
export interface SymbolInspection {
  hover: Hover | null;
  definition: Location[];
  typeDefinition: Location[];
  implementation: Location[];
}

export type CallHierarchyDirection = 'incoming' | 'outgoing' | 'both';

export interface CallHierarchyTarget {
  item: CallHierarchyItem;
  // Null means this side was intentionally not fetched for the requested
  // direction. An empty array means it was fetched and no calls were found.
  incomingCalls: CallHierarchyIncomingCall[] | null;
  outgoingCalls: CallHierarchyOutgoingCall[] | null;
}

export interface CallHierarchyResult {
  direction: CallHierarchyDirection;
  targets: CallHierarchyTarget[];
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
    range: Range;
    newText: string;
  };
}

/** Symbol search result */
export interface SymbolSearchResult {
  name: string;
  kind: number;
  location: Location;
  containerName: string;
}

/** File change for rename operation */
export interface FileChange {
  range: Range;
  newText: string;
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
type DocumentSymbolResult =
  | { type: 'symbolInformation'; symbols: SymbolInformation[] }
  | { type: 'documentSymbol'; symbols: DocumentSymbol[] };

// Utility function with refined checks
function parseDocumentSymbolResponse(
  response: DocumentSymbol[] | SymbolInformation[] | null
): DocumentSymbolResult {
  logger.info(
    `parseDocumentSymbolResponse called with ${response?.length ?? 0} items`
  );

  if (!response || response.length === 0) {
    logger.info('Empty response, returning empty symbolInformation');
    return { type: 'symbolInformation', symbols: [] };
  }

  if (response.every(isSymbolInformation)) {
    logger.info('Detected SymbolInformation format');
    return {
      type: 'symbolInformation',
      symbols: response,
    };
  }

  if (response.every(isDocumentSymbol)) {
    logger.info('Detected DocumentSymbol format');
    return {
      type: 'documentSymbol',
      symbols: response,
    };
  }

  // Refined Fallback: Throw an error to make unexpected formats obvious.
  throw new Error(
    'Unable to determine symbol type from the provided response.'
  );
}

function isSymbolInformation(
  symbol: DocumentSymbol | SymbolInformation
): symbol is SymbolInformation {
  return 'location' in symbol;
}

function isDocumentSymbol(
  symbol: DocumentSymbol | SymbolInformation
): symbol is DocumentSymbol {
  return 'range' in symbol && 'selectionRange' in symbol;
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
  request: SendLspRequest,
  uri: string
): Promise<FlattenedSymbol[]> {
  logger.info(`getDocumentSymbols called for ${uri}`);
  const params: DocumentSymbolParams = {
    textDocument: { uri },
  };

  const rawSymbols = await request(DocumentSymbolRequest.type, params);

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
function decodeSemanticTokens(
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
    const safeTokenType = tokenTypes[tokenType] ?? 'unknown';

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

function getFullSemanticTokensLegend(
  client: LspClient
): SemanticTokensLegend | null {
  const provider: unknown = client.serverCapabilities?.semanticTokensProvider;
  if (!provider || typeof provider !== 'object') {
    return null;
  }

  const { full, legend } = provider as {
    full?: unknown;
    legend?: {
      tokenTypes?: unknown;
      tokenModifiers?: unknown;
    };
  };
  const supportsFull =
    full === true || (full !== null && typeof full === 'object');
  if (
    !supportsFull ||
    !legend ||
    !Array.isArray(legend.tokenTypes) ||
    legend.tokenTypes.length === 0 ||
    !legend.tokenTypes.every((tokenType) => typeof tokenType === 'string') ||
    !Array.isArray(legend.tokenModifiers) ||
    !legend.tokenModifiers.every(
      (tokenModifier) => typeof tokenModifier === 'string'
    )
  ) {
    return null;
  }

  return {
    tokenTypes: legend.tokenTypes,
    tokenModifiers: legend.tokenModifiers,
  };
}

/**
 * Gets full semantic tokens when the initialized server advertised a usable
 * static provider. The server legend defines how numeric token indices and
 * modifier bits must be decoded.
 */
export async function getSemanticTokens(
  client: LspClient,
  uri: string,
  fileContent: string
): Promise<{
  tokens: SemanticToken[];
  legend: SemanticTokensLegend;
} | null> {
  const legend = getFullSemanticTokensLegend(client);
  if (!legend) {
    logger.debug('Semantic token enrichment is not supported', { uri });
    return null;
  }

  try {
    logger.debug('Requesting full semantic tokens', { uri });

    const params: SemanticTokensParams = {
      textDocument: { uri },
    };

    const response = await client.connection.sendRequest(
      SemanticTokensRequest.type,
      params
    );

    if (!response?.data || response.data.length === 0) {
      logger.info('No semantic tokens data received');
      return null;
    }

    const decodedTokens = decodeSemanticTokens(
      response.data,
      legend.tokenTypes,
      legend.tokenModifiers,
      fileContent
    );

    logger.info(`Decoded ${decodedTokens.length} semantic tokens`);

    return {
      tokens: decodedTokens,
      legend,
    };
  } catch (error) {
    logger.debug('Semantic token enrichment failed', {
      uri,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
