/**
 * Symbol Kind Classifications
 *
 * Defines which SymbolKinds are "containers" (should have children expanded)
 * vs "leaves" (should be shown but not expanded further).
 *
 * This replaces the depth-based filtering with semantic filtering based on
 * the nature of each symbol type.
 */

import { SymbolKind } from '../types/lsp.js';

/**
 * Map of SymbolKind names to their numeric values
 * Used for YAML config to accept readable strings instead of magic numbers
 */
export const SYMBOL_KIND_NAMES: Record<string, number> = {
  File: SymbolKind.File,
  Module: SymbolKind.Module,
  Namespace: SymbolKind.Namespace,
  Package: SymbolKind.Package,
  Class: SymbolKind.Class,
  Method: SymbolKind.Method,
  Property: SymbolKind.Property,
  Field: SymbolKind.Field,
  Constructor: SymbolKind.Constructor,
  Enum: SymbolKind.Enum,
  Interface: SymbolKind.Interface,
  Function: SymbolKind.Function,
  Variable: SymbolKind.Variable,
  Constant: SymbolKind.Constant,
  String: SymbolKind.String,
  Number: SymbolKind.Number,
  Boolean: SymbolKind.Boolean,
  Array: SymbolKind.Array,
  Object: SymbolKind.Object,
  Key: SymbolKind.Key,
  Null: SymbolKind.Null,
  EnumMember: SymbolKind.EnumMember,
  Struct: SymbolKind.Struct,
  Event: SymbolKind.Event,
  Operator: SymbolKind.Operator,
  TypeParameter: SymbolKind.TypeParameter,
};

/**
 * Container symbol kinds - these should have their children expanded
 * Examples: Class members, Interface properties, Enum members
 */
export const DEFAULT_CONTAINER_KINDS: number[] = [
  SymbolKind.File,
  SymbolKind.Module,
  SymbolKind.Namespace,
  SymbolKind.Package,
  SymbolKind.Class,
  SymbolKind.Interface,
  SymbolKind.Enum,
  SymbolKind.Struct,
  SymbolKind.Object,
];

/**
 * All other kinds are considered leaves by default:
 * Method, Function, Property, Field, Constructor, Variable, Constant,
 * EnumMember, Event, Operator, TypeParameter, String, Number, Boolean,
 * Array, Key, Null
 *
 * Leaves are shown but their children (like local variables) are not expanded.
 */

/**
 * Checks if a symbol kind is a container (should expand children)
 */
export function isContainerKind(
  kind: number,
  containerKinds: number[] = DEFAULT_CONTAINER_KINDS
): boolean {
  return containerKinds.includes(kind);
}

/**
 * Checks if a symbol kind is a leaf (should not expand children)
 */
export function isLeafKind(
  kind: number,
  containerKinds: number[] = DEFAULT_CONTAINER_KINDS
): boolean {
  return !isContainerKind(kind, containerKinds);
}

/**
 * Converts symbol kind names (strings) to their numeric values
 * Supports both strings and numbers for flexibility
 */
export function symbolKindNamesToNumbers(
  kinds: Array<string | number>
): number[] {
  return kinds.map((kind) => {
    if (typeof kind === 'number') {
      return kind;
    }
    const numericValue = SYMBOL_KIND_NAMES[kind];
    if (numericValue === undefined) {
      throw new Error(
        `Invalid symbol kind name: "${kind}". Valid names: ${Object.keys(SYMBOL_KIND_NAMES).join(', ')}`
      );
    }
    return numericValue;
  });
}
