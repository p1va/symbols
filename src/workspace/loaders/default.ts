/**
 * Default Workspace Loader - Pure Functional Implementation
 * Always ready, no special initialization needed
 */

import { WorkspaceLoader, WorkspaceLoaderState } from '../types.js';

/**
 * Pure function: Initialize default workspace (always ready)
 */
const initialize = async (): Promise<WorkspaceLoaderState> => {
  // Await a resolved promise to satisfy eslint require-await
  await Promise.resolve();
  
  return {
    type: 'default' as const,
    ready: true
  };
};

/**
 * Pure function: Check if default workspace is ready (always true)
 */
const isReady = (): boolean => true;

/**
 * Factory function to create default workspace loader
 */
export const createDefaultLoader = (): WorkspaceLoader => ({
  initialize,
  isReady
  // No handleNotification needed - default workspace doesn't handle notifications
});