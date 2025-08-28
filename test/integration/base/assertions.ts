import { expect } from 'vitest';
import { ToolCallResult } from './McpTestClient.js';

/**
 * Debug logging helper to print detailed context for failing tests
 */
function logDebugContext(
  testName: string,
  request: unknown,
  result: ToolCallResult,
  additionalContext?: Record<string, unknown>
): void {
  console.log('\n' + '='.repeat(80));
  console.log(`🔍 DEBUG: ${testName}`);
  console.log('='.repeat(80));
  console.log('📋 REQUEST:', JSON.stringify(request, null, 2));
  console.log('📤 RESPONSE:', JSON.stringify(result, null, 2));
  if (additionalContext) {
    console.log(
      '🔧 ADDITIONAL CONTEXT:',
      JSON.stringify(additionalContext, null, 2)
    );
  }
  console.log('='.repeat(80) + '\n');
}

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
export function assertToolSuccess(
  result: ToolCallResult,
  message?: string,
  debugContext?: {
    testName?: string;
    request?: unknown;
    additionalContext?: Record<string, unknown>;
  }
): void {
  if (result.isError) {
    if (debugContext) {
      logDebugContext(
        debugContext.testName || 'Tool Success Check',
        debugContext.request || 'No request provided',
        result,
        debugContext.additionalContext
      );
    } else {
      console.error('[ASSERTION ERROR] Tool call failed:', result.content);
    }
  }
  expect(
    result.isError,
    message ||
      `Tool call should not fail. Error: ${JSON.stringify(result.content)}`
  ).toBe(false);
  expect(
    result.content,
    message || 'Tool result should have content'
  ).toBeDefined();
}

/**
 * Safely extract text from a tool result item
 */
function extractText(item: unknown): string {
  if (typeof item === 'string') {
    return item;
  }
  if (
    item &&
    typeof item === 'object' &&
    'text' in item &&
    typeof item.text === 'string'
  ) {
    return item.text;
  }
  return JSON.stringify(item);
}

/**
 * Assert that a tool call failed with expected error
 */
export function assertToolFailure(
  result: ToolCallResult,
  expectedErrorText?: string
): void {
  expect(result.isError).toBe(true);
  if (expectedErrorText && result.content) {
    const contentStr =
      typeof result.content === 'string'
        ? result.content
        : JSON.stringify(result.content);
    expect(contentStr).toContain(expectedErrorText);
  }
}

/**
 * Assert diagnostics meet expectations
 */
export function assertDiagnostics(
  result: ToolCallResult,
  assertion: DiagnosticAssertion,
  debugContext?: { file?: string; testName?: string }
): void {
  const debugInfo = {
    testName: debugContext?.testName || 'Diagnostics Assertion',
    request: { file: debugContext?.file, assertion },
    additionalContext: { assertion },
  };

  assertToolSuccess(result, undefined, debugInfo);
  expect(Array.isArray(result.content)).toBe(true);

  const content = result.content as unknown[];

  if (assertion.hasErrors !== undefined) {
    const hasErrors = content.some((item) => {
      const text = extractText(item);
      return text && (text.includes('error') || text.includes('Error'));
    });

    if (hasErrors !== assertion.hasErrors) {
      console.log(
        `🚨 Diagnostics assertion failed - Expected hasErrors: ${assertion.hasErrors}, got: ${hasErrors}`
      );
      console.log('📄 Diagnostic content:', content.map(extractText));
    }

    expect(hasErrors).toBe(assertion.hasErrors);
  }

  if (assertion.hasWarnings !== undefined) {
    const hasWarnings = content.some((item) => {
      const text = extractText(item);
      return text && (text.includes('warning') || text.includes('Warning'));
    });
    expect(hasWarnings).toBe(assertion.hasWarnings);
  }

  if (assertion.containsText) {
    for (const text of assertion.containsText) {
      const containsText = content.some((item) => {
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
export function assertSymbolInspection(
  result: ToolCallResult,
  assertion: SymbolAssertion,
  debugContext?: {
    file?: string;
    line?: number;
    character?: number;
    testName?: string;
  }
): void {
  const debugInfo = {
    testName: debugContext?.testName || 'Symbol Inspection',
    request: {
      file: debugContext?.file,
      line: debugContext?.line,
      character: debugContext?.character,
      expectedSymbol: assertion.symbolName,
    },
    additionalContext: { assertion },
  };

  assertToolSuccess(result, undefined, debugInfo);

  const content = result.content as unknown[];
  const contentTexts = content.map(extractText);

  const hasSymbolName = content.some((item) => {
    const text = extractText(item);
    return text && text.includes(assertion.symbolName);
  });

  if (!hasSymbolName) {
    console.log(
      `🚨 Symbol inspection failed - Looking for symbol: ${assertion.symbolName}`
    );
    console.log('📄 Inspection content:', contentTexts);
  }

  expect(hasSymbolName, `Should contain symbol: ${assertion.symbolName}`).toBe(
    true
  );

  if (assertion.symbolType) {
    const hasSymbolType = content.some((item) => {
      const text = extractText(item);
      return (
        text && text.toLowerCase().includes(assertion.symbolType.toLowerCase())
      );
    });
    expect(
      hasSymbolType,
      `Should contain symbol type: ${assertion.symbolType}`
    ).toBe(true);
  }

  if (assertion.hasDocumentation !== undefined) {
    const hasDoc = content.some((item) => {
      const text = extractText(item);
      return (
        text &&
        (text.includes('Documentation') ||
          text.includes('documentation') ||
          text.includes('/**') ||
          text.includes('Main entry point') || // Look for actual doc content
          text.includes('Helper') ||
          (text.includes('```typescript') && text.length > 100)) // TSDoc formatted content
      );
    });
    expect(hasDoc).toBe(assertion.hasDocumentation);
  }
}

/**
 * Assert that symbol references are found
 */
export function assertSymbolReferences(
  result: ToolCallResult,
  expectedMinimumCount = 1
): void {
  assertToolSuccess(result);
  expect(Array.isArray(result.content)).toBe(true);

  const content = result.content as unknown[];
  expect(
    content.length,
    `Should have at least ${expectedMinimumCount} references`
  ).toBeGreaterThanOrEqual(expectedMinimumCount);
}

/**
 * Assert that completion suggestions are returned
 */
export function assertCompletionSuggestions(
  result: ToolCallResult,
  expectedMinimumCount = 1
): void {
  assertToolSuccess(result);
  expect(Array.isArray(result.content)).toBe(true);

  const content = result.content as unknown[];
  expect(
    content.length,
    `Should have at least ${expectedMinimumCount} completion suggestions`
  ).toBeGreaterThanOrEqual(expectedMinimumCount);
}

/**
 * Assert that search results contain expected symbols
 */
export function assertSearchResults(
  result: ToolCallResult,
  expectedSymbols: string[]
): void {
  assertToolSuccess(result);
  expect(Array.isArray(result.content)).toBe(true);

  const content = result.content as unknown[];

  for (const symbol of expectedSymbols) {
    const foundSymbol = content.some((item) => {
      const text = extractText(item);
      return text && text.includes(symbol);
    });
    expect(foundSymbol, `Should find symbol in search results: ${symbol}`).toBe(
      true
    );
  }
}

// ==============================================================================
// DEBUG HELPERS FOR COMMON TOOL OPERATIONS
// ==============================================================================

/**
 * Debug helper for inspect tool calls - shows detailed context for failures
 */
export function debugInspect(
  file: string,
  line: number,
  character: number,
  result: ToolCallResult,
  testName = 'Inspect Operation'
): void {
  logDebugContext(
    testName,
    { tool: 'inspect', file, line, character },
    result,
    { expectedPosition: `${file}:${line}:${character}` }
  );
}

/**
 * Debug helper for references tool calls - shows detailed context for failures
 */
export function debugReferences(
  file: string,
  line: number,
  character: number,
  result: ToolCallResult,
  testName = 'References Operation'
): void {
  logDebugContext(
    testName,
    { tool: 'references', file, line, character },
    result,
    { expectedPosition: `${file}:${line}:${character}` }
  );
}

/**
 * Debug helper for completion tool calls - shows detailed context for failures
 */
export function debugCompletion(
  file: string,
  line: number,
  character: number,
  result: ToolCallResult,
  testName = 'Completion Operation'
): void {
  logDebugContext(
    testName,
    { tool: 'completion', file, line, character },
    result,
    { expectedPosition: `${file}:${line}:${character}` }
  );
}

/**
 * Debug helper for diagnostics tool calls - shows detailed context for failures
 */
export function debugDiagnostics(
  file: string,
  result: ToolCallResult,
  testName = 'Diagnostics Operation'
): void {
  logDebugContext(testName, { tool: 'diagnostics', file }, result);
}
