/**
 * Main entry point for the LSP-to-MCP TypeScript server
 */
import { main } from './main/index.js';
import logger from './utils/logger.js';

logger.info('Starting lsp-use...');

// Start the server
await main();
