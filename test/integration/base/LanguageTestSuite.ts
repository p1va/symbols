import { describe, expect, beforeAll, afterAll, test } from 'vitest';
import {
  McpTestClient,
  SymbolPosition,
  ToolCallResult,
} from './McpTestClient.js';
import path from 'path';

export interface LanguageConfig {
  name: string;
  testProjectPath: string;
  mainFile: string;
  expectedToolCount?: number;
  // Position in main file that should be valid for inspect/references
  testPosition?: SymbolPosition;
  // Expected diagnostics (for files with intentional errors)
  expectDiagnostics?: boolean;
  // Custom test cases specific to this language
  customTests?: (client: McpTestClient) => void;
}

export abstract class LanguageTestSuite {
  protected client: McpTestClient;
  protected config: LanguageConfig;

  constructor(config: LanguageConfig) {
    this.config = config;
    // Set working directory to the test project path for proper language detection
    const absoluteWorkspacePath = path.resolve(this.config.testProjectPath);
    const configPath = path.resolve(
      path.dirname(this.config.testProjectPath),
      'lsps.yaml'
    );

    this.client = new McpTestClient(
      'pnpm',
      ['start'],
      'integration-test',
      '1.0.0',
      absoluteWorkspacePath,
      configPath
    );
  }

  /**
   * Creates a complete test suite for a language
   */
  createTestSuite(): void {
    describe(`${this.config.name} MCP Integration Tests`, () => {
      beforeAll(async () => {
        await this.client.connect();
      }, 15000);

      afterAll(async () => {
        await this.client.close();
      });

      this.addCommonTests();

      if (this.config.customTests) {
        this.config.customTests(this.client);
      }
    });
  }

  /**
   * Standard tests that should work for all languages
   */
  protected addCommonTests(): void {
    test('Should list all tools', async () => {
      const tools = await this.client.listTools();
      const expectedCount = this.config.expectedToolCount || 8;

      expect(tools).toHaveLength(expectedCount);
      expect(tools.map((t) => t.name)).toContain('inspect');
      expect(tools.map((t) => t.name)).toContain('diagnostics');
      expect(tools.map((t) => t.name)).toContain('read');
      expect(tools.map((t) => t.name)).toContain('references');
      expect(tools.map((t) => t.name)).toContain('completion');
      expect(tools.map((t) => t.name)).toContain('search');
      expect(tools.map((t) => t.name)).toContain('rename');
      expect(tools.map((t) => t.name)).toContain('logs');
    });

    test('Should read file symbols', async () => {
      const result = await this.client.readSymbols(this.getMainFilePath());

      expect(result.isError).toBe(false);
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
    });

    if (this.config.testPosition) {
      test('Should inspect symbol', async () => {
        const position = { ...this.config.testPosition };
        position.file = this.getMainFilePath();

        const result = await this.client.inspect(position);

        expect(result.isError).toBe(false);
        expect(result.content).toBeDefined();
      });

      test('Should get references', async () => {
        const position = { ...this.config.testPosition };
        position.file = this.getMainFilePath();

        const result = await this.client.getReferences(position);

        expect(result.isError).toBe(false);
        expect(result.content).toBeDefined();
      });

      test('Should get completion suggestions', async () => {
        const position = { ...this.config.testPosition };
        position.file = this.getMainFilePath();

        const result = await this.client.getCompletion(position);

        expect(result.isError).toBe(false);
        expect(result.content).toBeDefined();
      });
    }

    if (this.config.expectDiagnostics) {
      test('Should get diagnostics', async () => {
        const result = await this.client.getDiagnostics(this.getMainFilePath());

        expect(result.isError).toBe(false);
        expect(result.content).toBeDefined();
        expect(Array.isArray(result.content)).toBe(true);
      });
    }

    test('Should get logs', async () => {
      const result = await this.client.getLogs();

      expect(result.isError).toBe(false);
      expect(result.content).toBeDefined();
    });
  }

  /**
   * Utility methods
   */
  protected getMainFilePath(): string {
    // Since we set the workspace to the test project directory,
    // file paths should be relative to that workspace
    return this.config.mainFile;
  }

  protected getProjectFilePath(relativePath: string): string {
    // File paths are relative to the workspace directory
    return relativePath;
  }

  /**
   * Common assertion helpers
   */
  protected assertToolResult(
    result: ToolCallResult,
    shouldContainText?: string
  ): void {
    expect(result.isError).toBe(false);
    expect(result.content).toBeDefined();

    if (shouldContainText && Array.isArray(result.content)) {
      const hasText = result.content.some((item: unknown) => {
        if (typeof item === 'string') {
          return item.includes(shouldContainText);
        }
        if (
          item &&
          typeof item === 'object' &&
          'text' in item &&
          typeof item.text === 'string'
        ) {
          return item.text.includes(shouldContainText);
        }
        return false;
      });
      expect(hasText).toBe(true);
    }
  }

  protected assertSymbolExists(
    result: ToolCallResult,
    symbolName: string
  ): void {
    expect(result.isError).toBe(false);
    expect(result.content).toBeDefined();

    if (Array.isArray(result.content)) {
      const hasSymbol = result.content.some((item: unknown) => {
        if (
          item &&
          typeof item === 'object' &&
          'text' in item &&
          typeof item.text === 'string'
        ) {
          return item.text.includes(symbolName);
        }
        return false;
      });
      expect(hasSymbol).toBe(true);
    }
  }
}
