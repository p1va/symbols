import { LanguageTestSuite, type LanguageConfig } from '../../base/index.js';
import { test, describe, beforeAll, afterAll, expect } from 'vitest';

/**
 * Debug version of C# tests with detailed error reporting
 */
class CSharpDebugTestSuite extends LanguageTestSuite {
  constructor() {
    const config: LanguageConfig = {
      name: 'C# Debug',
      testProjectPath: 'test/integration/languages/csharp/test-project',
      mainFile: 'Program.cs',
      testPosition: { file: '', line: 15, character: 21 }, // on 'Main' method
      expectDiagnostics: true,
    };

    super(config);
  }

  createDebugTestSuite(): void {
    describe(`${this.config.name} Debug Tests`, () => {
      beforeAll(async () => {
        console.log('[DEBUG] Connecting to MCP server...');
        await this.client.connect();
        console.log('[DEBUG] Connected successfully');
      }, 20000);

      afterAll(async () => {
        console.log('[DEBUG] Closing MCP connection...');
        await this.client.close();
        console.log('[DEBUG] Connection closed');
      });

      test('Debug: List tools and show details', async () => {
        console.log('\n[DEBUG] === Testing tool listing ===');
        const tools = await this.client.listTools();
        console.log(
          '[DEBUG] Available tools:',
          tools.map((t) => t.name)
        );
        expect(tools.length).toBeGreaterThan(0);
      });

      test('Debug: Read file symbols with details', async () => {
        console.log('\n[DEBUG] === Testing symbol reading ===');
        const result = await this.client.readSymbols(
          this.getMainFilePath(),
          99,
          'none',
          true
        );

        console.log('[DEBUG] Read symbols result:', {
          isError: result.isError,
          contentType: typeof result.content,
          contentLength: Array.isArray(result.content)
            ? result.content.length
            : 'not array',
        });

        if (result.isError) {
          console.error('[DEBUG] Read symbols error:', result.content);
        } else if (Array.isArray(result.content)) {
          console.log('[DEBUG] Symbol count:', result.content.length);
          result.content.slice(0, 3).forEach((symbol, i) => {
            console.log(`[DEBUG] Symbol ${i}:`, symbol);
          });
        }

        expect(result.isError).toBe(false);
      });

      test('Debug: Get diagnostics with details', async () => {
        console.log('\n[DEBUG] === Testing diagnostics ===');
        const result = await this.client.getDiagnostics(
          this.getMainFilePath(),
          undefined,
          undefined,
          true
        );

        console.log('[DEBUG] Diagnostics result:', {
          isError: result.isError,
          contentType: typeof result.content,
          contentLength: Array.isArray(result.content)
            ? result.content.length
            : 'not array',
        });

        if (result.isError) {
          console.error('[DEBUG] Diagnostics error:', result.content);
        } else if (Array.isArray(result.content)) {
          console.log('[DEBUG] Diagnostic count:', result.content.length);
          result.content.forEach((diagnostic, i) => {
            console.log(`[DEBUG] Diagnostic ${i}:`, diagnostic);
          });
        }

        expect(result.isError).toBe(false);
      });

      test('Debug: Inspect symbol at different positions', async () => {
        console.log('\n[DEBUG] === Testing symbol inspection ===');

        // Test different positions in the file
        const positions = [
          { line: 14, character: 21, name: 'Main method' }, // static void Main
          { line: 9, character: 10, name: 'Program class' }, // class Program
          { line: 33, character: 18, name: 'TestService class' }, // public class TestService
          { line: 40, character: 23, name: 'Name property' }, // public string Name
          { line: 47, character: 23, name: 'ProcessData method' }, // public string ProcessData
        ];

        for (const pos of positions) {
          console.log(
            `\n[DEBUG] Testing ${pos.name} at line ${pos.line}, char ${pos.character}`
          );

          const result = await this.client.inspect(
            {
              file: this.getMainFilePath(),
              line: pos.line,
              character: pos.character,
            },
            true
          );

          console.log(`[DEBUG] ${pos.name} result:`, {
            isError: result.isError,
            hasContent: !!result.content,
          });

          if (result.isError) {
            console.error(`[DEBUG] ${pos.name} error:`, result.content);
          }
        }
      });

      test('Debug: Test references', async () => {
        console.log('\n[DEBUG] === Testing references ===');

        const result = await this.client.getReferences(
          {
            file: this.getMainFilePath(),
            line: 14,
            character: 21,
          },
          true
        );

        console.log('[DEBUG] References result:', {
          isError: result.isError,
          hasContent: !!result.content,
        });

        if (result.isError) {
          console.error('[DEBUG] References error:', result.content);
        }
      });

      test('Debug: Test completion', async () => {
        console.log('\n[DEBUG] === Testing completion ===');

        const result = await this.client.getCompletion(
          {
            file: this.getMainFilePath(),
            line: 16,
            character: 20, // After "Console."
          },
          true
        );

        console.log('[DEBUG] Completion result:', {
          isError: result.isError,
          hasContent: !!result.content,
        });

        if (result.isError) {
          console.error('[DEBUG] Completion error:', result.content);
        }
      });

      test('Debug: Show server logs', async () => {
        console.log('\n[DEBUG] === Getting server logs ===');

        const result = await this.client.getLogs();

        console.log('[DEBUG] Logs result:', {
          isError: result.isError,
          hasContent: !!result.content,
        });

        if (!result.isError && Array.isArray(result.content)) {
          console.log(`[DEBUG] Log entries: ${result.content.length}`);
          result.content.slice(-5).forEach((log, i) => {
            console.log(`[DEBUG] Recent log ${i}:`, log);
          });
        }
      });
    });
  }
}

// Create and run the debug test suite
const debugSuite = new CSharpDebugTestSuite();
debugSuite.createDebugTestSuite();
