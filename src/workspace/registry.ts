/**
 * Workspace Loader Registry - Pure Functional Factory Pattern
 * Maps loader names to factory functions for creating workspace loaders
 */

import { WorkspaceLoader, WorkspaceLoaderRegistry } from './types.js';
import { createDefaultLoader } from './loaders/default.js';
import { createCSharpLoader } from './loaders/csharp.js';

/**
 * Registry of workspace loader factories
 * Each entry maps a loader name to a factory function
 */
const WORKSPACE_LOADERS: WorkspaceLoaderRegistry = {
  'default': createDefaultLoader,
  'csharp': createCSharpLoader,
  // Future loaders can be added here:
  // 'java': createJavaLoader,
  // 'rust': createRustLoader,
} as const;

/**
 * Pure function: Create workspace loader by name
 * Falls back to default loader if type is not found
 */
export const createWorkspaceLoader = (type: string): WorkspaceLoader => {
  const factory = WORKSPACE_LOADERS[type] ?? WORKSPACE_LOADERS['default']!;
  return factory();
};

/**
 * Pure function: Get all available workspace loader types
 */
export const getAvailableLoaderTypes = (): string[] => 
  Object.keys(WORKSPACE_LOADERS);

/**
 * Pure function: Check if a loader type is available
 */
export const isLoaderTypeAvailable = (type: string): boolean => 
  type in WORKSPACE_LOADERS;