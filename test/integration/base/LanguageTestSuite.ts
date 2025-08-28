import { describe, expect, beforeAll, afterAll, test } from 'vitest';
import {
  McpTestClient,
  SymbolPosition,
  ToolCallResult,
} from './McpTestClient.js';
import {
  debugInspect,
  debugReferences,
  debugCompletion,
  debugDiagnostics,
} from './assertions.js';
import {
  getTestCommand,
  getTestTimeouts,
  getTestEnvironmentInfo,
} from './TestEnvironment.js';
import path from 'path';

export interface LanguageConfig {
  name: string;
  testProjectPath: string;
  mainFile: string;
  expectedToolCount?: number;
  // Position in main file that should be valid for inspect/references
  // Note: file will be overridden to use mainFile, so only line and character are needed
  testPosition?: Omit<SymbolPosition, 'file'> & { file?: string };
  // Expected diagnostics (for files with intentional errors)
  expectDiagnostics?: boolean;
  // Custom test cases specific to this language
  customTests?: () => void;
}

export abstract class LanguageTestSuite {
  protected client: McpTestClient;
  protected config: LanguageConfig;

  constructor(config: LanguageConfig) {
    this.config = config;
    // Note: We'll handle async initialization in createTestSuite()
  }

  /**
   * Initialize the test client with environment-appropriate command
   * This needs to be async due to the environment detection logic
   */
  private async initializeClient(): Promise<void> {
    // Set working directory to the test project path for proper language detection
    const absoluteWorkspacePath = path.resolve(this.config.testProjectPath);
    const configPath = path.resolve(
      path.dirname(this.config.testProjectPath),
      'symbols.yaml'
    );

    // Get environment-appropriate command (tsx for local dev, node dist/ for CI)
    const testCommand = await getTestCommand();
    const envInfo = await getTestEnvironmentInfo();
    console.log(`[${this.config.name}] ${envInfo}`);

    this.client = new McpTestClient(
      testCommand.command,
      testCommand.args,
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
    const timeouts = getTestTimeouts();

    describe(`${this.config.name} MCP Integration Tests`, () => {
      beforeAll(async () => {
        await this.initializeClient();
        await this.client.connect(timeouts.connection);
      }, timeouts.setup);

      afterAll(async () => {
        await this.client.close();
      });

      this.addCommonTests();

      if (this.config.customTests) {
        this.config.customTests.call(this);
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
      const testPos = this.config.testPosition; // Capture for type narrowing

      test('Should inspect symbol', async () => {
        const position: SymbolPosition = {
          file: this.getMainFilePath(),
          line: testPos.line,
          character: testPos.character,
        };

        const result = await this.client.inspect(position);

        // Debug output before assertion
        if (result.isError) {
          debugInspect(
            position.file,
            position.line,
            position.character,
            result,
            `${this.config.name} - Common Inspect Test`
          );
        }

        expect(result.isError).toBe(false);
        expect(result.content).toBeDefined();
      });

      test('Should get references', async () => {
        const position: SymbolPosition = {
          file: this.getMainFilePath(),
          line: testPos.line,
          character: testPos.character,
        };

        const result = await this.client.getReferences(position);

        // Debug output before assertion
        if (result.isError) {
          debugReferences(
            position.file,
            position.line,
            position.character,
            result,
            `${this.config.name} - Common References Test`
          );
        }

        expect(result.isError).toBe(false);
        expect(result.content).toBeDefined();
      });

      test('Should get completion suggestions', async () => {
        const position: SymbolPosition = {
          file: this.getMainFilePath(),
          line: testPos.line,
          character: testPos.character,
        };

        const result = await this.client.getCompletion(position);

        // Debug output before assertion
        if (result.isError) {
          debugCompletion(
            position.file,
            position.line,
            position.character,
            result,
            `${this.config.name} - Common Completion Test`
          );
        }

        expect(result.isError).toBe(false);
        expect(result.content).toBeDefined();
      });
    }

    if (this.config.expectDiagnostics) {
      test('Should get diagnostics', async () => {
        const result = await this.client.getDiagnostics(this.getMainFilePath());

        // Debug output before assertion
        if (result.isError) {
          debugDiagnostics(
            this.getMainFilePath(),
            result,
            `${this.config.name} - Common Diagnostics Test`
          );
        }

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
