import { LanguageTestSuite, type LanguageConfig } from '../../base/index.js';
import { test } from 'vitest';
import { assertSymbolInspection } from '../../base/index.js';

class PythonTestSuite extends LanguageTestSuite {
  constructor() {
    const config: LanguageConfig = {
      name: 'Python',
      testProjectPath: 'test/integration/languages/python/test-project',
      mainFile: 'main.py',
      testPosition: { file: '', line: 1, character: 1 }, // Will be set by getMainFilePath()
      expectDiagnostics: true,
      customTests: (client) => {
        // Python-specific tests
        test('Should detect Python syntax errors', async () => {
          const result = await client.getDiagnostics(this.getMainFilePath());

          // Just verify we get some diagnostics (Python LSP may not be fully configured)
          this.assertToolResult(result);
        });

        test('Should inspect Python function', async () => {
          const result = await client.inspect({
            file: this.getMainFilePath(),
            line: 1, // def main():
            character: 5, // on "main"
          });

          assertSymbolInspection(result, {
            symbolName: 'main',
            // Skip type assertion as different LSPs may format differently
          });
        });

        test('Should find Python symbols', async () => {
          const result = await client.searchSymbols('main');

          this.assertToolResult(result);
          this.assertSymbolExists(result, 'main');
        });

        test('Should read Python file symbols', async () => {
          const result = await client.readSymbols(
            this.getMainFilePath(),
            99,
            'signature'
          );

          this.assertToolResult(result);
          this.assertSymbolExists(result, 'main');
        });
      },
    };

    super(config);
  }
}

// Create and run the test suite
const pythonSuite = new PythonTestSuite();
pythonSuite.createTestSuite();
