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

    // Reporting - HTML and JSON for CI troubleshooting, verbose locally
    reporters: process.env.CI
      ? ['github-actions', 'html', 'json', 'verbose']
      : ['verbose'],
    ...(process.env.CI && {
      outputFile: {
        json: './test-results/test-results.json',
        html: './test-results/test-report.html',
      },
    }),

    // Environment
    globals: false,
    environment: 'node',
  },
});
