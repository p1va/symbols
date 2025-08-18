#!/usr/bin/env node
import { main } from './main/index.js';
import logger, { initLogger } from './utils/logger.js';

// Initialize logging system first, before any other operations
initLogger();

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
  process.stderr.write(
    'Error starting MCP server:' +
      (error instanceof Error ? error.message : String(error))
  );

  process.exit(1);
}
