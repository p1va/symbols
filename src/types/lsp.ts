/**
 * LSP Types from the Language Server Protocol 3.17 specification
 * https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/
 */

// Basic LSP types
export type DocumentUri = string;
export type uinteger = number;

export interface Position {
  line: uinteger;
  character: uinteger;
}

export interface Range {
  start: Position;
  end: Position;
}

export interface Location {
  uri: DocumentUri;
  range: Range;
}

// SymbolKind enum from LSP spec
export const SymbolKind = {
  File: 1,
  Module: 2,
  Namespace: 3,
  Package: 4,
  Class: 5,
  Method: 6,
  Property: 7,
  Field: 8,
  Constructor: 9,
  Enum: 10,
  Interface: 11,
  Function: 12,
  Variable: 13,
  Constant: 14,
  String: 15,
  Number: 16,
  Boolean: 17,
  Array: 18,
  Object: 19,
  Key: 20,
  Null: 21,
  EnumMember: 22,
  Struct: 23,
  Event: 24,
  Operator: 25,
  TypeParameter: 26,
} as const;

export type SymbolKindValue = (typeof SymbolKind)[keyof typeof SymbolKind];

// LSP symbol types using discriminated unions
export interface SymbolInformation {
  name: string;
  kind: SymbolKindValue;
  deprecated?: boolean;
  location: Location;
  containerName?: string;
}

export interface DocumentSymbol {
  name: string;
  detail?: string;
  kind: SymbolKindValue;
  deprecated?: boolean;
  range: Range;
  selectionRange: Range;
  children?: DocumentSymbol[];
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
