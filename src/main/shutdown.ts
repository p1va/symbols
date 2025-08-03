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

const DEFAULT_TIMEOUT_MS = 5_000;

interface ShutdownHandler {
  (): Promise<void>;
}

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

  const handler: ShutdownHandler = async () => {
    if (shuttingDown) return;
    shuttingDown = true;

    try {
      if (lspClient.isInitialized) {
        await lspClient.connection.sendRequest('shutdown', null);
        await lspClient.connection.sendNotification('exit', null);

        if (!lspProcess.killed) {
          lspProcess.kill('SIGTERM');
        }
      }

      // 3. Race: natural process exit vs. timeout → SIGKILL
      const timer = setTimeout(() => {
        if (!lspProcess.killed) {
          lspProcess.kill('SIGKILL');
        }
      }, timeoutMs);

      // Wait for LSP process to exit naturally
      await once(lspProcess, 'exit');
      clearTimeout(timer);

      // 4. MCP server shutdown
      await server.close();
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      //TODO: Log
      // Ensure process exits even if shutdown fails
      if (!lspProcess.killed) {
        lspProcess.kill('SIGKILL');
      }
      // Use non-zero exit code for failed shutdown
      process.exit(1);
    }

    // Successful shutdown
    process.exit(0);
  };

  // Handle LSP process crash - if LSP dies unexpectedly, shut down cleanly
  const lspCrashHandler = (code: number | null) => {
    if (!shuttingDown && code !== null && code !== 0) {
      // LSP crashed with non-zero exit code, initiate clean shutdown
      void handler(); // Fire-and-forget shutdown sequence
    }
  };

  // Store references to the wrapper functions for cleanup
  const sigintHandler = () => void handler();
  const sigtermHandler = () => void handler();

  // Register signal handlers with wrapper functions
  process.on('SIGINT', sigintHandler);
  process.on('SIGTERM', sigtermHandler);

  // Register LSP crash detection
  lspProcess.once('exit', lspCrashHandler);

  // Return disposer for cleanup
  return () => {
    process.off('SIGINT', sigintHandler);
    process.off('SIGTERM', sigtermHandler);
    lspProcess.off('exit', lspCrashHandler);
  };
}
