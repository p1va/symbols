import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Test file patterns
    include: ['test/**/*.{test,spec}.{js,ts}'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    
    // Performance optimizations
    isolate: true,
    fileParallelism: true,
    
    // Timeouts - integration tests need more time for language server startup
    testTimeout: 30000, // 30s for integration tests with language servers
    hookTimeout: 15000, // 15s for setup/teardown
    
    // Reporting
    reporter: process.env.CI ? ['github-actions', 'json'] : ['verbose'],
    outputFile: process.env.CI ? {
      json: './test-results.json'
    } : undefined,
    
    // Environment
    globals: false,
    environment: 'node',
    
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/test/**',
        '**/*.config.*',
        '**/*.d.ts'
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80
        }
      }
    }
  }
});