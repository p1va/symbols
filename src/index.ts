#!/usr/bin/env node
import { main } from './main/index.js';
import logger, { initLogger } from './utils/logger.js';

// Check for --console flag early (before full CLI parsing)
// This redirects logs to console instead of log files (for troubleshooting only)
const consoleMode = process.argv.includes('--console');

// Initialize logging system first, before any other operations
initLogger(consoleMode);

logger.info('Starting...');

try {
  // Start the server
  await main();
} catch (error) {
  logger.error('Failed to start MCP server', {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });

  // Also output to stderr so users can see the error even if logging fails
  const errorMessage = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Error: ${errorMessage}\n`);

  process.exit(1);
}
