import { LanguageTestSuite, type LanguageConfig } from '../../base/index.js';
import { test } from 'vitest';
import { assertDiagnostics, assertSymbolInspection } from '../../base/index.js';

class TypeScriptTestSuite extends LanguageTestSuite {
  constructor() {
    const config: LanguageConfig = {
      name: 'TypeScript',
      testProjectPath: 'test/integration/languages/typescript/test-project',
      mainFile: 'src/main.ts',
      testPosition: { file: '', line: 7, character: 17 }, // on 'main' function
      expectDiagnostics: true,
      customTests: (client) => {
        // TypeScript-specific tests
        test('Should detect TypeScript type errors', async () => {
          const result = await client.getDiagnostics(this.getMainFilePath());
          
          assertDiagnostics(result, {
            hasErrors: true,
            containsText: ['someUndefinedVariable'], // Our intentional error
          });
        });

        test('Should inspect TypeScript function with JSDoc', async () => {
          const result = await client.inspect({
            file: this.getMainFilePath(),
            line: 7, // export function main():
            character: 17, // on "main"
          });
          
          assertSymbolInspection(result, {
            symbolName: 'main',
            symbolType: 'function',
            hasDocumentation: true,
          });
        });

        test('Should inspect TypeScript interface', async () => {
          const result = await client.inspect({
            file: this.getMainFilePath(),
            line: 25, // export interface TestConfig
            character: 17, // on "TestConfig"
          });
          
          assertSymbolInspection(result, {
            symbolName: 'TestConfig',
            symbolType: 'interface',
          });
        });

        test('Should inspect TypeScript class', async () => {
          const result = await client.inspect({
            file: this.getMainFilePath(),
            line: 36, // export class TestService
            character: 14, // on "TestService"
          });
          
          assertSymbolInspection(result, {
            symbolName: 'TestService',
            symbolType: 'class',
          });
        });

        test('Should find TypeScript symbols with different preview modes', async () => {
          // Test with signature mode
          const sigResult = await client.readSymbols(this.getMainFilePath(), 99, 'signature');
          this.assertToolResult(sigResult);
          this.assertSymbolExists(sigResult, 'main');
          this.assertSymbolExists(sigResult, 'TestConfig');
          this.assertSymbolExists(sigResult, 'TestService');

          // Test with full mode  
          const fullResult = await client.readSymbols(this.getMainFilePath(), 99, 'full');
          this.assertToolResult(fullResult);
          this.assertSymbolExists(fullResult, 'main');
        });

        test('Should search for TypeScript symbols', async () => {
          const result = await client.searchSymbols('TestService');
          
          this.assertToolResult(result);
          this.assertSymbolExists(result, 'TestService');
        });
      },
    };

    super(config);
  }
}

// Create and run the test suite
const typescriptSuite = new TypeScriptTestSuite();
typescriptSuite.createTestSuite();