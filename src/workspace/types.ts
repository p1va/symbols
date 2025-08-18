/**
 * Workspace Loader Types - Pure Functional Approach
 * Defines types for workspace initialization and state management without classes or mutable state
 */

import { LspClient, LspConfig } from '../types.js';

/**
 * Immutable workspace loader state - holds workspace-specific information
 */
export type WorkspaceLoaderState = {
  readonly type: 'default' | 'csharp';
  readonly ready: boolean;
  readonly data?: unknown;
};

/**
 * Pure function type for workspace initialization
 */
export type InitializeWorkspace = (
  client: LspClient,
  config: LspConfig
) => Promise<WorkspaceLoaderState>;

/**
 * Pure function type for checking workspace readiness
 */
export type IsWorkspaceReady = (state: WorkspaceLoaderState) => boolean;

/**
 * Pure function type for handling workspace notifications
 * Returns new state (immutable update)
 */
export type HandleWorkspaceNotification = (
  state: WorkspaceLoaderState,
  method: string
) => WorkspaceLoaderState;

/**
 * Workspace loader - bundle of pure functions
 * No mutable state, just behavior
 */
export type WorkspaceLoader = {
  readonly initialize: InitializeWorkspace;
  readonly isReady: IsWorkspaceReady;
  readonly handleNotification?: HandleWorkspaceNotification;
};

/**
 * Factory function type for creating workspace loaders
 */
export type WorkspaceLoaderFactory = () => WorkspaceLoader;

/**
 * Registry mapping loader names to factory functions
 */
export type WorkspaceLoaderRegistry = Record<string, WorkspaceLoaderFactory>;
