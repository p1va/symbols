#!/usr/bin/env node
import { main } from './main/index.js';
import logger from './utils/logger.js';

logger.info('Starting...');

// Start the server
await main();
