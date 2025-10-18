/**
 * Roslyn Workspace Loader - Pure Functional Implementation
 * Handles .sln/.csproj detection and workspace initialization notifications for C#
 */

import { WorkspaceLoader, WorkspaceLoaderState } from '../types.js';
import { LspClient, LspConfig } from '../../types.js';
import {
  detectCSharpWorkspace,
  createCSharpWorkspaceNotification,
  CSharpWorkspaceInfo,
} from '../../utils/csharp-workspace.js';
import logger from '../../utils/logger.js';

/**
 * C# workspace state data
 */
type CSharpWorkspaceData = {
  readonly workspaceInfo: CSharpWorkspaceInfo;
};

/**
 * Pure function: Extract workspace path from LSP config
 */
const extractWorkspacePath = (config: LspConfig): string => {
  const workspaceUri = config.workspaceUri;
  if (!workspaceUri) {
    throw new Error('No workspace URI provided');
  }

  return workspaceUri.startsWith('file://')
    ? workspaceUri.replace('file://', '')
    : workspaceUri;
};

/**
 * Pure function: Initialize C# workspace
 */
const initialize = async (
  client: LspClient,
  config: LspConfig
): Promise<WorkspaceLoaderState> => {
  try {
    const workspacePath = extractWorkspacePath(config);
    const csharpWorkspace = await detectCSharpWorkspace(workspacePath);

    if (!csharpWorkspace) {
      logger.debug('No C# workspace detected, defaulting to ready state');
      return {
        type: 'roslyn' as const,
        ready: true,
      };
    }

    // Send workspace initialization notification
    const notification = createCSharpWorkspaceNotification(csharpWorkspace);
    logger.info('Sending C# workspace notification', {
      method: notification.method,
      params: notification.params,
    });

    await client.connection.sendNotification(
      notification.method,
      notification.params
    );

    // Return state indicating initialization started but not ready
    return {
      type: 'roslyn' as const,
      ready: false,
      data: { workspaceInfo: csharpWorkspace } satisfies CSharpWorkspaceData,
    };
  } catch (error) {
    logger.error('Failed to initialize C# workspace', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    // On error, default to ready state to not block operations
    return {
      type: 'roslyn' as const,
      ready: true,
    };
  }
};

/**
 * Pure function: Check if C# workspace is ready
 */
const isReady = (state: WorkspaceLoaderState): boolean => state.ready;

/**
 * Pure function: Handle workspace notifications (immutable state update)
 */
const handleNotification = (
  state: WorkspaceLoaderState,
  method: string
): WorkspaceLoaderState => {
  if (method === 'workspace/projectInitializationComplete') {
    logger.info('C# workspace initialization completed');
    return { ...state, ready: true };
  }

  // Return unchanged state for other notifications
  return state;
};

/**
 * Factory function to create Roslyn workspace loader
 */
export const createRoslynLoader = (): WorkspaceLoader => ({
  initialize,
  isReady,
  handleNotification,
});
