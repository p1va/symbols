/**
 * Central shutdown coordinator for graceful termination
 * Handles LSP shutdown sequence and child process management
 *
 * Provides automatic cleanup on SIGINT/SIGTERM signals without exposing
 * shutdown functionality as an MCP tool to users.
 */

import { once } from 'node:events';
import { ChildProcessWithoutNullStreams } from 'child_process';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { LspClient } from '../types.js';
import logger from '../utils/logger.js';

const DEFAULT_TIMEOUT_MS = 5_000;

export interface ShutdownOptions {
  timeoutMs?: number;
}

/**
 * Sets up graceful shutdown handlers for SIGINT and SIGTERM, plus LSP crash detection
 * Returns a disposer function for cleanup (useful in tests)
 */
export function setupShutdown(
  server: McpServer,
  lspClient: LspClient,
  lspProcess: ChildProcessWithoutNullStreams,
  options: ShutdownOptions = {}
): () => void {
  const { timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  let shuttingDown = false;

  const createSignalHandler = (signal: string) => async (): Promise<void> => {
    if (shuttingDown) {
      logger.debug(`Ignoring duplicate ${signal} signal during shutdown`);
      return;
    }

    logger.info(`Received ${signal} signal, initiating graceful shutdown`, {
      signal,
      lspProcessPid: lspProcess.pid,
      lspProcessKilled: lspProcess.killed,
      lspClientInitialized: lspClient.isInitialized,
      timeoutMs,
    });

    shuttingDown = true;

    try {
      // Set up exit listener BEFORE sending signals to avoid race condition
      const exitPromise = once(lspProcess, 'exit');

      // 1. Send LSP shutdown sequence with timeout
      // These requests might hang if the LSP connection is broken or the process exits quickly
      if (lspClient.isInitialized) {
        logger.debug('Sending LSP shutdown request');

        const shutdownTimeout = new Promise<void>((resolve) => {
          setTimeout(() => {
            logger.debug('Shutdown request timed out (connection may be closed)');
            resolve();
          }, 500); // 500ms timeout for shutdown request
        });

        const shutdownRequest = lspClient.connection
          .sendRequest('shutdown')
          .then(() => {
            logger.debug('Shutdown request acknowledged by LSP');
          })
          .catch((error) => {
            logger.debug('Shutdown request error (expected if connection closed)', {
              error: error instanceof Error ? error.message : String(error),
            });
          });

        await Promise.race([shutdownRequest, shutdownTimeout]);

        logger.debug('Sending LSP exit notification');

        // Exit notification is fire-and-forget, don't wait for it
        // Wrap in try/catch since connection might already be closed
        try {
          void lspClient.connection.sendNotification('exit', null);
        } catch {
          // Connection already closed, that's fine
          logger.debug('Exit notification failed (connection already closed)');
        }

        // 2. Send SIGTERM to LSP process
        if (!lspProcess.killed) {
          logger.debug(
            `Sending SIGTERM to LSP process (PID: ${lspProcess.pid})`
          );
          lspProcess.kill('SIGTERM');
        }
      } else {
        logger.debug(
          'LSP client not initialized, skipping LSP shutdown sequence'
        );

        // Still try to kill the process if it exists
        if (!lspProcess.killed) {
          logger.debug(
            `Sending SIGTERM to uninitialized LSP process (PID: ${lspProcess.pid})`
          );
          lspProcess.kill('SIGTERM');
        }
      }

      // 3. Race: natural process exit vs. timeout → SIGKILL
      const timer = setTimeout(() => {
        if (!lspProcess.killed) {
          logger.warn(
            `LSP process did not exit within ${timeoutMs}ms, sending SIGKILL`,
            {
              pid: lspProcess.pid,
            }
          );
          lspProcess.kill('SIGKILL');
        }
      }, timeoutMs);

      // Wait for LSP process to exit naturally (using the promise we set up earlier)
      logger.debug('Waiting for LSP process to exit');
      await exitPromise;
      clearTimeout(timer);
      logger.info('LSP process exited successfully');

      // 4. MCP server shutdown with timeout
      // The StdioServerTransport might hang waiting for stdin to close,
      // so we race against a timeout to ensure we exit
      logger.debug('Closing MCP server');

      const serverClosePromise = server.close().catch((error) => {
        logger.debug('MCP server close error', {
          error: error instanceof Error ? error.message : String(error),
        });
      });

      const timeoutPromise = new Promise<void>((resolve) => {
        setTimeout(() => {
          logger.debug('MCP server close timed out, forcing exit');
          resolve();
        }, 1000);
      });

      await Promise.race([serverClosePromise, timeoutPromise]);
      logger.debug('MCP server close completed or timed out');

      logger.info('Shutdown complete, exiting...');
    } catch (error) {
      logger.error('Error during graceful shutdown', {
        signal,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        lspProcessPid: lspProcess.pid,
        lspProcessKilled: lspProcess.killed,
      });

      // Ensure process exits even if shutdown fails
      if (!lspProcess.killed) {
        logger.warn('Force killing LSP process due to shutdown error');
        lspProcess.kill('SIGKILL');
      }
      // Use non-zero exit code for failed shutdown
      logger.info('Exiting with error code 1');
      process.exit(1);
    }

    // Successful shutdown - exit immediately
    logger.info('Exiting with code 0');
    process.exit(0);
  };

  // Handle LSP process crash - if LSP dies unexpectedly, shut down cleanly
  const lspCrashHandler = (code: number | null, signal: string | null) => {
    if (!shuttingDown && code !== null && code !== 0) {
      logger.error('LSP process crashed, initiating emergency shutdown', {
        exitCode: code,
        signal,
        pid: lspProcess.pid,
      });
      // LSP crashed with non-zero exit code, initiate clean shutdown
      void createSignalHandler('LSP_CRASH')(); // Fire-and-forget shutdown sequence
    } else if (!shuttingDown && signal !== null) {
      logger.warn('LSP process terminated by signal during normal operation', {
        signal,
        pid: lspProcess.pid,
      });
      void createSignalHandler('LSP_SIGNAL')(); // Fire-and-forget shutdown sequence
    }
  };

  // Create signal handlers with proper logging
  const sigintHandler = () => void createSignalHandler('SIGINT')();
  const sigtermHandler = () => void createSignalHandler('SIGTERM')();

  // Register signal handlers
  logger.debug('Registering shutdown signal handlers', {
    signals: ['SIGINT', 'SIGTERM'],
    lspProcessPid: lspProcess.pid,
  });

  process.on('SIGINT', sigintHandler);
  process.on('SIGTERM', sigtermHandler);

  // Register LSP crash detection
  lspProcess.once('exit', lspCrashHandler);

  logger.debug('Shutdown handlers configured successfully', {
    timeoutMs,
    lspProcessPid: lspProcess.pid,
  });

  // Return disposer for cleanup
  return () => {
    logger.debug('Removing shutdown signal handlers');
    process.off('SIGINT', sigintHandler);
    process.off('SIGTERM', sigtermHandler);
    lspProcess.off('exit', lspCrashHandler);
  };
}
