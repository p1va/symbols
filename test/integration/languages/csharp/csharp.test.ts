import { LanguageTestSuite, type LanguageConfig } from '../../base/index.js';
import { test } from 'vitest';
import { assertDiagnostics, assertSymbolInspection } from '../../base/index.js';

class CSharpTestSuite extends LanguageTestSuite {
  constructor() {
    const config: LanguageConfig = {
      name: 'C#',
      testProjectPath: 'test/integration/languages/csharp/test-project',
      mainFile: 'Program.cs',
      testPosition: { file: '', line: 14, character: 21 }, // on 'Main' method
      expectDiagnostics: true,
      customTests: () => {
        // C#-specific tests
        test('Should detect C# compilation errors', async () => {
          const result = await this.client.getDiagnostics(
            this.getMainFilePath()
          );

          assertDiagnostics(result, {
            hasErrors: true,
            containsText: ['someUndefinedVariable'], // Our intentional error
          });
        });

        test('Should inspect C# Main method', async () => {
          const result = await this.client.inspect({
            file: this.getMainFilePath(),
            line: 14, // static void Main(string[] args)
            character: 21, // on "Main"
          });

          assertSymbolInspection(result, {
            symbolName: 'Main',
            symbolType: 'method',
            hasDocumentation: true,
          });
        });

        test('Should inspect C# class', async () => {
          const result = await this.client.inspect({
            file: this.getMainFilePath(),
            line: 33, // public class TestService
            character: 18, // on "TestService"
          });

          assertSymbolInspection(result, {
            symbolName: 'TestService',
            symbolType: 'class',
            hasDocumentation: true,
          });
        });

        test('Should inspect C# property', async () => {
          const result = await this.client.inspect({
            file: this.getMainFilePath(),
            line: 40, // public string Name { get; set; }
            character: 23, // on "Name"
          });

          assertSymbolInspection(result, {
            symbolName: 'Name',
            symbolType: 'property',
          });
        });

        test('Should find C# symbols', async () => {
          const result = await this.client.searchSymbols('TestService');

          this.assertToolResult(result);
          this.assertSymbolExists(result, 'TestService');
        });

        test('Should read C# file symbols with XML documentation', async () => {
          const result = await this.client.outline(
            this.getMainFilePath(),
            true
          );

          this.assertToolResult(result);
          this.assertSymbolExists(result, 'Main');
          this.assertSymbolExists(result, 'TestService');
          this.assertSymbolExists(result, 'ProcessData');
        });
      },
    };

    super(config);
  }
}

// Create and run the test suite
const csharpSuite = new CSharpTestSuite();
csharpSuite.createTestSuite();
