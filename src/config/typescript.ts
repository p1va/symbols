/**
 * TypeScript Language Server Configuration
 */

import { SymbolKind } from 'vscode-languageserver-protocol';
import { FlattenedSymbol } from '../types/lsp.js';

export interface LanguageServerConfig {
  name: string;
  extensions: string[];
  command: string;
  args: string[];
  preloadedFiles: string[];
  ignoreSymbolKinds: number[]; // Symbol kinds to ignore. Empty array = ignore none
  stopSymbolTreeDescendOn: number[]; // Don't traverse into symbols of these kinds
  showDebugInfo: boolean; // Show container debug information in symbol output
}

/**
 * TypeScript Language Server Configuration
 *
 * Symbol Kind Reference:
 * 1: File, 2: Module, 3: Namespace, 4: Package, 5: Class, 6: Method, 7: Property,
 * 8: Field, 9: Constructor, 10: Enum, 11: Interface, 12: Function, 13: Variable,
 * 14: Constant, 15: String, 16: Number, 17: Boolean, 18: Array, 19: Object,
 * 20: Key, 21: Null, 22: EnumMember, 23: Struct, 24: Event, 25: Operator, 26: TypeParameter
 */
export const TypeScriptConfig: LanguageServerConfig = {
  name: 'typescript',
  extensions: ['.ts', '.tsx', '.js', '.jsx'],
  command: 'typescript-language-server',
  args: ['--stdio'],
  preloadedFiles: [],

  // Ignore these noisy symbol kinds
  ignoreSymbolKinds: [
    SymbolKind.Variable, // 13 - Variables (too noisy, especially locals)
    SymbolKind.String, // 15 - String literals
    SymbolKind.Number, // 16 - Number literals
    SymbolKind.Boolean, // 17 - Boolean literals
    SymbolKind.Array, // 18 - Array literals
    SymbolKind.Object, // 19 - Object literals
    SymbolKind.Key, // 20 - Object keys
    SymbolKind.Null, // 21 - Null literals
  ],

  // Don't traverse into function contents (stops implementation noise)
  stopSymbolTreeDescendOn: [
    SymbolKind.Function, // 12 - Never show function internals
  ],

  // Hide container debug info by default (cleaner output)
  showDebugInfo: false,
};

/**
 * Filters symbols based on ignore rules and ancestry
 */
export function filterSymbolsByConfig(
  symbols: FlattenedSymbol[],
  config: LanguageServerConfig = TypeScriptConfig
): FlattenedSymbol[] {
  // Create a map for quick symbol lookup by name
  const symbolsByName = new Map<string, FlattenedSymbol>();
  for (const symbol of symbols) {
    symbolsByName.set(symbol.name, symbol);
  }

  return symbols.filter((symbol) => {
    // 1. Filter out ignored symbol kinds
    if (config.ignoreSymbolKinds.includes(symbol.kind)) {
      return false;
    }

    // 2. Filter out symbols whose ancestry contains forbidden kinds
    if (
      hasAncestryOfKind(symbol, config.stopSymbolTreeDescendOn, symbolsByName)
    ) {
      return false;
    }

    return true;
  });
}

/**
 * Checks if a symbol has any ancestor of the specified kinds
 */
function hasAncestryOfKind(
  symbol: FlattenedSymbol,
  forbiddenKinds: number[],
  symbolsByName: Map<string, FlattenedSymbol>
): boolean {
  let currentContainer = symbol.containerName;
  let depth = 0;

  // Walk up the container chain
  while (currentContainer && depth < 10) {
    // Prevent infinite loops
    const containerSymbol = symbolsByName.get(currentContainer);
    if (!containerSymbol) {
      break;
    }

    // Check if this ancestor has a forbidden kind
    if (forbiddenKinds.includes(containerSymbol.kind)) {
      return true;
    }

    currentContainer = containerSymbol.containerName;
    depth++;
  }

  return false;
}
