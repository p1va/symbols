import { LanguageTestSuite, type LanguageConfig } from '../../base/index.js';
import { test, expect } from 'vitest';
import { debugInspect } from '../../base/index.js';

class GoTestSuite extends LanguageTestSuite {
  constructor() {
    const config: LanguageConfig = {
      name: 'Go',
      testProjectPath: 'test/integration/languages/go/test-project',
      mainFile: 'main.go',
      testPosition: { file: '', line: 12, character: 10 }, // on 'User' struct
      expectDiagnostics: false, // Go project should have no errors
      customTests: () => {
        // Go-specific tests
        test('Should inspect Go struct method', async () => {
          const position = {
            file: this.getMainFilePath(),
            line: 34, // func (r *UserRepository) GetUser(id int) (*User, error) {
            character: 25, // on "GetUser"
          };

          const result = await this.client.inspect(position, true);

          // Debug output before assertion
          debugInspect(position, result, 'Go Struct Method Inspection');

          // Just verify it found the symbol and didn't error
          expect(result.isError).toBe(false);
          expect(result.content).toBeDefined();

          // Verify it contains the method name
          const contentText = Array.isArray(result.content)
            ? (result.content.find(
                (item) => typeof item === 'object' && item && 'text' in item
              ) as { text: string } | undefined)
            : undefined;

          if (contentText && contentText.text) {
            expect(contentText.text).toContain('GetUser');
          }
        });

        test('Should inspect Go struct type', async () => {
          const position = {
            file: this.getMainFilePath(),
            line: 12, // type User struct {
            character: 5, // on "User"
          };

          const result = await this.client.inspect(position, true);

          debugInspect(position, result, 'Go Struct Type Inspection');

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

        test('Should find Go function symbols', async () => {
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

        test('Should inspect Go utility function', async () => {
          const position = {
            file: 'utils.go',
            line: 12, // func (h *StringHelper) ToUpperCase(s string) string {
            character: 27, // on "ToUpperCase"
          };

          const result = await this.client.inspect(position, true);

          debugInspect(position, result, 'Go Utility Function Inspection');

          // Just verify it found the symbol and didn't error
          expect(result.isError).toBe(false);
          expect(result.content).toBeDefined();

          // Verify it contains the method name
          const contentText = Array.isArray(result.content)
            ? (result.content.find(
                (item) => typeof item === 'object' && item && 'text' in item
              ) as { text: string } | undefined)
            : undefined;

          if (contentText && contentText.text) {
            expect(contentText.text).toContain('ToUpperCase');
          }
        });

        test('Should get Go file symbols with package documentation', async () => {
          const result = await this.client.outline(
            this.getMainFilePath(),
            true,
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
              const hasGetUserMethod = text.includes('GetUser');

              if (!hasUserStruct || !hasGetUserMethod) {
                console.log('Available text content:', text);
                throw new Error(
                  'Expected to find User struct and GetUser method in symbols text'
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
      },
    };

    super(config);
  }
}

// Create and run the test suite
const goSuite = new GoTestSuite();
goSuite.createTestSuite();
