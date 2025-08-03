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
