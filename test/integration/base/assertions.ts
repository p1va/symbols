import { expect } from 'vitest';
import { ToolCallResult } from './McpTestClient.js';


export interface DiagnosticAssertion {
  hasErrors?: boolean;
  hasWarnings?: boolean;
  errorCount?: number;
  warningCount?: number;
  containsText?: string[];
}

export interface SymbolAssertion {
  symbolName: string;
  symbolType?: string;
  hasDocumentation?: boolean;
  hasDefinition?: boolean;
  hasReferences?: boolean;
}

/**
 * Assert that a tool call was successful
 */
export function assertToolSuccess(result: ToolCallResult, message?: string): void {
  if (result.isError) {
    console.error('[ASSERTION ERROR] Tool call failed:', result.content);
  }
  expect(result.isError, message || `Tool call should not fail. Error: ${JSON.stringify(result.content)}`).toBe(false);
  expect(result.content, message || 'Tool result should have content').toBeDefined();
}

/**
 * Safely extract text from a tool result item
 */
function extractText(item: unknown): string {
  if (typeof item === 'string') {
    return item;
  }
  if (item && typeof item === 'object' && 'text' in item && typeof item.text === 'string') {
    return item.text;
  }
  return JSON.stringify(item);
}

/**
 * Assert that a tool call failed with expected error
 */
export function assertToolFailure(result: ToolCallResult, expectedErrorText?: string): void {
  expect(result.isError).toBe(true);
  if (expectedErrorText && result.content) {
    const contentStr = typeof result.content === 'string' ? result.content : JSON.stringify(result.content);
    expect(contentStr).toContain(expectedErrorText);
  }
}

/**
 * Assert diagnostics meet expectations
 */
export function assertDiagnostics(result: ToolCallResult, assertion: DiagnosticAssertion): void {
  assertToolSuccess(result);
  expect(Array.isArray(result.content)).toBe(true);
  
  const content = result.content as unknown[];
  
  if (assertion.hasErrors !== undefined) {
    const hasErrors = content.some(item => {
      const text = extractText(item);
      return text && (text.includes('error') || text.includes('Error'));
    });
    expect(hasErrors).toBe(assertion.hasErrors);
  }
  
  if (assertion.hasWarnings !== undefined) {
    const hasWarnings = content.some(item => {
      const text = extractText(item);
      return text && (text.includes('warning') || text.includes('Warning'));
    });
    expect(hasWarnings).toBe(assertion.hasWarnings);
  }
  
  if (assertion.containsText) {
    for (const text of assertion.containsText) {
      const containsText = content.some(item => {
        const itemText = extractText(item);
        return itemText && itemText.includes(text);
      });
      expect(containsText, `Should contain text: ${text}`).toBe(true);
    }
  }
}

/**
 * Assert symbol inspection meets expectations
 */
export function assertSymbolInspection(result: ToolCallResult, assertion: SymbolAssertion): void {
  assertToolSuccess(result);
  
  const content = result.content as unknown[];
  const hasSymbolName = content.some(item => {
    const text = extractText(item);
    return text && text.includes(assertion.symbolName);
  });
  expect(hasSymbolName, `Should contain symbol: ${assertion.symbolName}`).toBe(true);
  
  if (assertion.symbolType) {
    const hasSymbolType = content.some(item => {
      const text = extractText(item);
      return text && text.toLowerCase().includes(assertion.symbolType.toLowerCase());
    });
    expect(hasSymbolType, `Should contain symbol type: ${assertion.symbolType}`).toBe(true);
  }
  
  if (assertion.hasDocumentation !== undefined) {
    const hasDoc = content.some(item => {
      const text = extractText(item);
      return text && (text.includes('documentation') || text.includes('/**'));
    });
    expect(hasDoc).toBe(assertion.hasDocumentation);
  }
}

/**
 * Assert that symbol references are found
 */
export function assertSymbolReferences(result: ToolCallResult, expectedMinimumCount = 1): void {
  assertToolSuccess(result);
  expect(Array.isArray(result.content)).toBe(true);
  
  const content = result.content as unknown[];
  expect(content.length, `Should have at least ${expectedMinimumCount} references`).toBeGreaterThanOrEqual(expectedMinimumCount);
}

/**
 * Assert that completion suggestions are returned
 */
export function assertCompletionSuggestions(result: ToolCallResult, expectedMinimumCount = 1): void {
  assertToolSuccess(result);
  expect(Array.isArray(result.content)).toBe(true);
  
  const content = result.content as unknown[];
  expect(content.length, `Should have at least ${expectedMinimumCount} completion suggestions`).toBeGreaterThanOrEqual(expectedMinimumCount);
}

/**
 * Assert that search results contain expected symbols
 */
export function assertSearchResults(result: ToolCallResult, expectedSymbols: string[]): void {
  assertToolSuccess(result);
  expect(Array.isArray(result.content)).toBe(true);
  
  const content = result.content as unknown[];
  
  for (const symbol of expectedSymbols) {
    const foundSymbol = content.some(item => {
      const text = extractText(item);
      return text && text.includes(symbol);
    });
    expect(foundSymbol, `Should find symbol in search results: ${symbol}`).toBe(true);
  }
}