/**
 * C# Workspace Detection and Initialization Utilities
 * Handles .sln and .csproj file detection and workspace setup for C# LSP
 */

import path from 'path';
import { pathToFileURL } from 'url';
import { glob } from 'glob';
import logger from './logger.js';

export type CSharpWorkspaceInfo = 
  | {
      type: 'solution';
      solutionPath: string;
      projectPaths?: undefined;
    }
  | {
      type: 'projects';
      solutionPath?: undefined;
      projectPaths: string[];
    };

/**
 * Detects C# workspace type and returns appropriate paths
 */
export async function detectCSharpWorkspace(workspacePath: string): Promise<CSharpWorkspaceInfo | null> {
  try {
    logger.debug('Detecting C# workspace', { workspacePath });

    // First, look for solution files (.sln)
    const solutionFiles = await glob('**/*.sln', { 
      cwd: workspacePath, 
      absolute: true,
      ignore: ['**/node_modules/**', '**/bin/**', '**/obj/**']
    });

    if (solutionFiles.length > 0) {
      // Prefer solution at root, otherwise take the first one found
      const rootSolution = solutionFiles.find(sln => 
        path.dirname(sln) === path.resolve(workspacePath)
      ) || solutionFiles[0]!; // Safe because solutionFiles.length > 0

      logger.info('Found C# solution file', { solutionPath: rootSolution });
      return {
        type: 'solution' as const,
        solutionPath: rootSolution
      };
    }

    // If no solution file, look for project files (.csproj)
    const projectFiles = await glob('**/*.csproj', { 
      cwd: workspacePath, 
      absolute: true,
      ignore: ['**/node_modules/**', '**/bin/**', '**/obj/**']
    });

    if (projectFiles.length > 0) {
      logger.info('Found C# project files', { projectPaths: projectFiles });
      return {
        type: 'projects' as const,
        projectPaths: projectFiles
      };
    }

    logger.debug('No C# workspace files found');
    return null;
  } catch (error) {
    logger.error('Failed to detect C# workspace', {
      workspacePath,
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

/**
 * Creates the appropriate workspace notification parameters for C# LSP
 */
export function createCSharpWorkspaceNotification(workspaceInfo: CSharpWorkspaceInfo): {
  method: string;
  params: unknown;
} {
  if (workspaceInfo.type === 'solution' && workspaceInfo.solutionPath) {
    return {
      method: 'solution/open',
      params: {
        solution: pathToFileURL(workspaceInfo.solutionPath).toString()
      }
    };
  } else if (workspaceInfo.type === 'projects' && workspaceInfo.projectPaths) {
    return {
      method: 'project/open',
      params: {
        projects: workspaceInfo.projectPaths.map(projectPath => 
          pathToFileURL(projectPath).toString()
        )
      }
    };
  }

  throw new Error('Invalid C# workspace info provided');
}