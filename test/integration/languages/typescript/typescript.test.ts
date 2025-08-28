import { LanguageTestSuite, type LanguageConfig } from '../../base/index.js';
import { test } from 'vitest';
import {
  assertDiagnostics,
  assertSymbolInspection,
  debugInspect,
  debugDiagnostics,
} from '../../base/index.js';

class TypeScriptTestSuite extends LanguageTestSuite {
  constructor() {
    const config: LanguageConfig = {
      name: 'TypeScript',
      testProjectPath: 'test/integration/languages/typescript/test-project',
      mainFile: 'src/main.ts',
      testPosition: { file: '', line: 8, character: 17 }, // on 'main' function
      expectDiagnostics: true,
      customTests: () => {
        // TypeScript-specific tests
        test('Should detect TypeScript type errors', async () => {
          const result = await this.client.getDiagnostics(
            this.getMainFilePath()
          );

          // Debug output before assertion
          debugDiagnostics(
            this.getMainFilePath(),
            result,
            'TypeScript Type Error Detection'
          );

          assertDiagnostics(
            result,
            {
              hasErrors: true,
              containsText: ['lodash'], // Missing module error
            },
            {
              file: this.getMainFilePath(),
              testName: 'TypeScript Type Error Detection',
            }
          );
        });

        test('Should inspect TypeScript function with JSDoc', async () => {
          const position = {
            file: this.getMainFilePath(),
            line: 8, // export function main(): void {
            character: 17, // on "main"
          };
          const result = await this.client.inspect(position);

          // Debug output before assertion
          debugInspect(
            position.file,
            position.line,
            position.character,
            result,
            'TypeScript Function with JSDoc'
          );

          assertSymbolInspection(
            result,
            {
              symbolName: 'main',
              symbolType: 'function',
              hasDocumentation: true,
            },
            {
              file: position.file,
              line: position.line,
              character: position.character,
              testName: 'TypeScript Function with JSDoc',
            }
          );
        });

        test('Should inspect TypeScript interface', async () => {
          const position = {
            file: this.getMainFilePath(),
            line: 26, // export interface TestConfig {
            character: 19, // on "TestConfig"
          };
          const result = await this.client.inspect(position);

          // Debug output before assertion
          debugInspect(
            position.file,
            position.line,
            position.character,
            result,
            'TypeScript Interface'
          );

          assertSymbolInspection(
            result,
            {
              symbolName: 'TestConfig',
              symbolType: 'interface',
            },
            {
              file: position.file,
              line: position.line,
              character: position.character,
              testName: 'TypeScript Interface',
            }
          );
        });

        test('Should inspect TypeScript class', async () => {
          const position = {
            file: this.getMainFilePath(),
            line: 38, // export class TestService {
            character: 14, // on "TestService"
          };
          const result = await this.client.inspect(position);

          // Debug output before assertion
          debugInspect(
            position.file,
            position.line,
            position.character,
            result,
            'TypeScript Class'
          );

          assertSymbolInspection(
            result,
            {
              symbolName: 'TestService',
              symbolType: 'class',
            },
            {
              file: position.file,
              line: position.line,
              character: position.character,
              testName: 'TypeScript Class',
            }
          );
        });

        test('Should find TypeScript symbols with different preview modes', async () => {
          // Test with signature mode
          const sigResult = await this.client.readSymbols(
            this.getMainFilePath(),
            99,
            'signature'
          );
          this.assertToolResult(sigResult);
          this.assertSymbolExists(sigResult, 'main');
          this.assertSymbolExists(sigResult, 'TestConfig');
          this.assertSymbolExists(sigResult, 'TestService');

          // Test with full mode
          const fullResult = await this.client.readSymbols(
            this.getMainFilePath(),
            99,
            'full'
          );
          this.assertToolResult(fullResult);
          this.assertSymbolExists(fullResult, 'main');
        });

        test('Should search for TypeScript symbols', async () => {
          const result = await this.client.searchSymbols('TestService');

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
