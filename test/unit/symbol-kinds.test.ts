/**
 * Symbol Kinds Tests
 */

import { describe, test, expect } from 'vitest';
import {
  DEFAULT_CONTAINER_KINDS,
  isContainerKind,
  isLeafKind,
  symbolKindNamesToNumbers,
  SYMBOL_KIND_NAMES,
} from '../../src/config/symbol-kinds.js';
import { SymbolKind } from '../../src/types/lsp.js';

describe('Symbol Kinds', () => {
  describe('DEFAULT_CONTAINER_KINDS', () => {
    test('should include common container kinds', () => {
      expect(DEFAULT_CONTAINER_KINDS).toContain(SymbolKind.Class);
      expect(DEFAULT_CONTAINER_KINDS).toContain(SymbolKind.Interface);
      expect(DEFAULT_CONTAINER_KINDS).toContain(SymbolKind.Enum);
      expect(DEFAULT_CONTAINER_KINDS).toContain(SymbolKind.Module);
    });

    test('should not include leaf kinds', () => {
      expect(DEFAULT_CONTAINER_KINDS).not.toContain(SymbolKind.Method);
      expect(DEFAULT_CONTAINER_KINDS).not.toContain(SymbolKind.Function);
      expect(DEFAULT_CONTAINER_KINDS).not.toContain(SymbolKind.Variable);
    });
  });

  describe('isContainerKind', () => {
    test('should return true for container kinds', () => {
      expect(isContainerKind(SymbolKind.Class)).toBe(true);
      expect(isContainerKind(SymbolKind.Interface)).toBe(true);
      expect(isContainerKind(SymbolKind.Enum)).toBe(true);
    });

    test('should return false for leaf kinds', () => {
      expect(isContainerKind(SymbolKind.Method)).toBe(false);
      expect(isContainerKind(SymbolKind.Function)).toBe(false);
      expect(isContainerKind(SymbolKind.Variable)).toBe(false);
    });

    test('should respect custom container kinds', () => {
      const customKinds = [SymbolKind.Class, SymbolKind.Method];
      expect(isContainerKind(SymbolKind.Method, customKinds)).toBe(true);
      expect(isContainerKind(SymbolKind.Interface, customKinds)).toBe(false);
    });
  });

  describe('isLeafKind', () => {
    test('should return true for leaf kinds', () => {
      expect(isLeafKind(SymbolKind.Method)).toBe(true);
      expect(isLeafKind(SymbolKind.Function)).toBe(true);
      expect(isLeafKind(SymbolKind.Variable)).toBe(true);
    });

    test('should return false for container kinds', () => {
      expect(isLeafKind(SymbolKind.Class)).toBe(false);
      expect(isLeafKind(SymbolKind.Interface)).toBe(false);
      expect(isLeafKind(SymbolKind.Enum)).toBe(false);
    });
  });

  describe('symbolKindNamesToNumbers', () => {
    test('should convert string names to numbers', () => {
      const result = symbolKindNamesToNumbers(['Class', 'Interface', 'Method']);
      expect(result).toEqual([
        SymbolKind.Class,
        SymbolKind.Interface,
        SymbolKind.Method,
      ]);
    });

    test('should pass through numbers unchanged', () => {
      const result = symbolKindNamesToNumbers([5, 11, 6]);
      expect(result).toEqual([5, 11, 6]);
    });

    test('should handle mixed string and number inputs', () => {
      const result = symbolKindNamesToNumbers(['Class', 11, 'Method']);
      expect(result).toEqual([
        SymbolKind.Class,
        SymbolKind.Interface,
        SymbolKind.Method,
      ]);
    });

    test('should throw error for invalid symbol kind name', () => {
      expect(() => {
        symbolKindNamesToNumbers(['Class', 'InvalidKind', 'Method']);
      }).toThrow('Invalid symbol kind name: "InvalidKind"');
    });

    test('should provide helpful error message with valid names', () => {
      try {
        symbolKindNamesToNumbers(['BadKind']);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('Valid names:');
        expect((error as Error).message).toContain('Class');
        expect((error as Error).message).toContain('Method');
      }
    });
  });

  describe('SYMBOL_KIND_NAMES', () => {
    test('should have all standard LSP symbol kinds', () => {
      expect(SYMBOL_KIND_NAMES.File).toBe(SymbolKind.File);
      expect(SYMBOL_KIND_NAMES.Module).toBe(SymbolKind.Module);
      expect(SYMBOL_KIND_NAMES.Class).toBe(SymbolKind.Class);
      expect(SYMBOL_KIND_NAMES.Method).toBe(SymbolKind.Method);
      expect(SYMBOL_KIND_NAMES.Property).toBe(SymbolKind.Property);
      expect(SYMBOL_KIND_NAMES.Function).toBe(SymbolKind.Function);
      expect(SYMBOL_KIND_NAMES.Variable).toBe(SymbolKind.Variable);
      expect(SYMBOL_KIND_NAMES.Interface).toBe(SymbolKind.Interface);
      expect(SYMBOL_KIND_NAMES.Enum).toBe(SymbolKind.Enum);
    });

    test('should have correct mapping count', () => {
      // LSP defines 26 symbol kinds
      expect(Object.keys(SYMBOL_KIND_NAMES).length).toBe(26);
    });
  });
});
