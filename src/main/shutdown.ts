/**
 * Central shutdown coordinator for graceful termination.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { LspManager } from '../runtime/lsp-manager.js';
import logger from '../utils/logger.js';

const DEFAULT_TIMEOUT_MS = 5_000;

export interface ShutdownOptions {
  timeoutMs?: number;
}

export function setupShutdown(
  server: McpServer,
  manager: LspManager,
  options: ShutdownOptions = {}
): () => void {
  const { timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  let shuttingDown = false;

  const createSignalHandler = (signal: string) => async (): Promise<void> => {
    if (shuttingDown) {
      logger.debug(`Ignoring duplicate ${signal} signal during shutdown`);
      return;
    }

    shuttingDown = true;
    logger.info(`Received ${signal}; shutting down Symbols manager`, {
      signal,
      timeoutMs,
    });

    try {
      await Promise.race([
        manager.shutdown(),
        new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
      ]);

      await Promise.race([
        server.close().catch((error) => {
          logger.debug('MCP server close error during shutdown', {
            error: error instanceof Error ? error.message : String(error),
          });
        }),
        new Promise<void>((resolve) => setTimeout(resolve, 1_000)),
      ]);

      process.exit(0);
    } catch (error) {
      logger.error('Error during graceful shutdown', {
        signal,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      process.exit(1);
    }
  };

  const sigintHandler = () => void createSignalHandler('SIGINT')();
  const sigtermHandler = () => void createSignalHandler('SIGTERM')();

  process.on('SIGINT', sigintHandler);
  process.on('SIGTERM', sigtermHandler);

  return () => {
    process.off('SIGINT', sigintHandler);
    process.off('SIGTERM', sigtermHandler);
  };
}
