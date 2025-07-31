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

// Utility function to determine and type the response
export function parseDocumentSymbolResponse(
  response: any
): DocumentSymbolResult {
  if (!Array.isArray(response) || response.length === 0) {
    // Default to empty SymbolInformation array
    return { type: 'symbolInformation', symbols: [] };
  }

  const firstSymbol = response[0];

  // Check if it has location property (SymbolInformation)
  if (firstSymbol.location && firstSymbol.location.range) {
    return {
      type: 'symbolInformation',
      symbols: response as SymbolInformation[],
    };
  }

  // Check if it has range and selectionRange (DocumentSymbol)
  if (firstSymbol.range && firstSymbol.selectionRange) {
    return {
      type: 'documentSymbol',
      symbols: response as DocumentSymbol[],
    };
  }

  // Fallback to SymbolInformation
  return { type: 'symbolInformation', symbols: [] };
}
