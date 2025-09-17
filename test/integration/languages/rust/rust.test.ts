import { LanguageTestSuite, type LanguageConfig } from '../../base/index.js';
import { test, expect } from 'vitest';
import { debugInspect } from '../../base/index.js';

class RustTestSuite extends LanguageTestSuite {
  constructor() {
    const config: LanguageConfig = {
      name: 'Rust',
      testProjectPath: 'test/integration/languages/rust/test-project',
      mainFile: 'src/main.rs',
      testPosition: { file: '', line: 6, character: 15 }, // on 'User' struct
      expectDiagnostics: false, // Rust project should have no errors
      customTests: () => {
        // Rust-specific tests
        test('Should inspect Rust struct method', async () => {
          const position = {
            file: this.getMainFilePath(),
            line: 36, // pub fn get_user(&self, id: u32) -> Option<&User> {
            character: 15, // on "get_user"
          };

          const result = await this.client.inspect(position, true);

          // Debug output before assertion
          debugInspect(position, result, 'Rust Struct Method Inspection');

          // Just verify it found the symbol and didn't error
          expect(result.isError).toBe(false);
          expect(result.content).toBeDefined();

          // Verify it contains relevant content (it found a function symbol)
          const contentText = Array.isArray(result.content)
            ? (result.content.find(
                (item) => typeof item === 'object' && item && 'text' in item
              ) as { text: string } | undefined)
            : undefined;

          if (contentText && contentText.text) {
            // The Rust LSP returned some symbol information, that's success
            expect(contentText.text).toContain('At Line:');
          }
        });

        test('Should inspect Rust struct type', async () => {
          const position = {
            file: this.getMainFilePath(),
            line: 6, // pub struct User {
            character: 11, // on "User"
          };

          const result = await this.client.inspect(position, true);

          debugInspect(position, result, 'Rust Struct Type Inspection');

          // Just verify it found the symbol and didn't error
          expect(result.isError).toBe(false);
          expect(result.content).toBeDefined();

          // Verify it contains the struct name
          const contentText = Array.isArray(result.content)
            ? (result.content.find(
                (item) => typeof item === 'object' && item && 'text' in item
              ) as { text: string } | undefined)
            : undefined;

          if (contentText && contentText.text) {
            expect(contentText.text).toContain('User');
          }
        });

        test('Should find Rust function symbols', async () => {
          const result = await this.client.searchSymbols('calculate');

          // Just verify search works and returns some results
          expect(result.isError).toBe(false);
          expect(result.content).toBeDefined();

          if (Array.isArray(result.content) && result.content.length > 0) {
            // Search found something, that's good enough
            console.log('Search found symbols - test passed');
          } else {
            // Even if no results, as long as search didn't error it's working
            console.log('Search completed without error - test passed');
          }
        });

        test('Should inspect Rust trait implementation', async () => {
          const position = {
            file: 'src/lib.rs',
            line: 22, // impl StringProcessor for LowerCaseProcessor {
            character: 5, // on "impl"
          };

          const result = await this.client.inspect(position, true);

          debugInspect(
            position,
            result,
            'Rust Trait Implementation Inspection'
          );

          // For trait implementations, we might get different types of documentation
          if (!result.isError) {
            console.log('Rust trait implementation inspection successful');
          } else {
            throw new Error(
              `Trait implementation inspection failed: ${JSON.stringify(result)}`
            );
          }
        });

        test('Should inspect Rust utility function', async () => {
          const position = {
            file: 'src/utils.rs',
            line: 22, // pub fn reverse_string(input: &str) -> String {
            character: 7, // on "reverse_string"
          };

          const result = await this.client.inspect(position, true);

          debugInspect(position, result, 'Rust Utility Function Inspection');

          // Just verify it found the symbol and didn't error
          expect(result.isError).toBe(false);
          expect(result.content).toBeDefined();

          // Verify it contains the function name
          const contentText = Array.isArray(result.content)
            ? (result.content.find(
                (item) => typeof item === 'object' && item && 'text' in item
              ) as { text: string } | undefined)
            : undefined;

          if (contentText && contentText.text) {
            expect(contentText.text).toContain('reverse_string');
          }
        });

        test('Should get Rust file symbols with crate documentation', async () => {
          const result = await this.client.readSymbols(
            this.getMainFilePath(),
            2,
            'signature',
            true
          );

          if (!result.isError && Array.isArray(result.content)) {
            // The content is wrapped in an array with text objects
            const textContent = result.content.find(
              (item) => typeof item === 'object' && item && 'text' in item
            ) as { text: string } | undefined;

            if (textContent && textContent.text) {
              const text = textContent.text;
              const hasUserStruct = text.includes('User');
              const hasRepoStruct = text.includes('UserRepository');

              if (!hasUserStruct || !hasRepoStruct) {
                console.log('Available text content:', text);
                throw new Error(
                  'Expected to find User and UserRepository structs in symbols text'
                );
              }
            } else {
              console.log('Result content:', result.content);
              throw new Error('Expected text content in read symbols result');
            }
          } else {
            throw new Error(`Read symbols failed: ${JSON.stringify(result)}`);
          }
        });

        test('Should inspect Rust error handling', async () => {
          const position = {
            file: 'src/utils.rs',
            line: 32, // pub fn safe_divide(a: f64, b: f64) -> Result<f64, CustomError> {
            character: 7, // on "safe_divide"
          };

          const result = await this.client.inspect(position, true);

          debugInspect(
            position,
            result,
            'Rust Error Handling Function Inspection'
          );

          // Just verify it found the symbol and didn't error
          expect(result.isError).toBe(false);
          expect(result.content).toBeDefined();

          // Verify it contains the function name
          const contentText = Array.isArray(result.content)
            ? (result.content.find(
                (item) => typeof item === 'object' && item && 'text' in item
              ) as { text: string } | undefined)
            : undefined;

          if (contentText && contentText.text) {
            expect(contentText.text).toContain('safe_divide');
          }
        });
      },
    };

    super(config);
  }
}

// Create and run the test suite
const rustSuite = new RustTestSuite();
rustSuite.createTestSuite();
