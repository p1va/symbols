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
      // 1. Send LSP shutdown sequence
      if (lspClient.isInitialized) {
        logger.debug('Sending LSP shutdown request');
        await lspClient.connection.sendRequest('shutdown', null);

        logger.debug('Sending LSP exit notification');
        await lspClient.connection.sendNotification('exit', null);

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

      // Wait for LSP process to exit naturally
      logger.debug('Waiting for LSP process to exit');
      await once(lspProcess, 'exit');
      clearTimeout(timer);
      logger.debug('LSP process exited successfully');

      // 4. MCP server shutdown
      logger.debug('Closing MCP server');
      await server.close();
      logger.info('Graceful shutdown completed successfully');
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
      process.exit(1);
    }

    // Successful shutdown
    logger.info('Exiting process after successful shutdown');
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

  logger.info('Shutdown handlers configured successfully', {
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
