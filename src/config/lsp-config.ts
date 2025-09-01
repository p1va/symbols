/**
 * LSP Configuration System - YAML-based configuration for multiple language servers
 */

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { z } from 'zod';
import envPaths from 'env-paths';

// Zod schemas for validation
const DiagnosticsConfigSchema = z.object({
  strategy: z.enum(['push', 'pull']).default('push'),
  wait_timeout_ms: z.number().min(100).max(30000).default(2000),
});

const SymbolsConfigSchema = z.object({
  max_depth: z.number().min(0).nullable().default(null),
  kinds: z.array(z.string()).default([]),
});

const LspConfigSchema = z.object({
  command: z.string(),
  extensions: z.record(z.string(), z.string()), // file extension -> language ID
  workspace_files: z.array(z.string()).default([]),
  preload_files: z.array(z.string()).default([]), // files to open during initialization
  diagnostics: DiagnosticsConfigSchema.default({}),
  symbols: SymbolsConfigSchema.default({}),
  environment: z.record(z.string(), z.string()).optional(),
  workspace_loader: z.string().optional(), // workspace loader type ('default', 'csharp', etc.)
});

const ConfigFileSchema = z.object({
  lsps: z.record(z.string(), LspConfigSchema),
});

// TypeScript interfaces derived from schemas
export type DiagnosticsConfig = z.infer<typeof DiagnosticsConfigSchema>;
export type SymbolsConfig = z.infer<typeof SymbolsConfigSchema>;
export type LspConfig = z.infer<typeof LspConfigSchema>;
export type ConfigFile = z.infer<typeof ConfigFileSchema>;

export interface ConfigWithSource {
  config: ConfigFile;
  source: {
    path: string;
    type: 'cli-arg' | 'workspace' | 'repo-cwd' | 'explicit-cwd' | 'shared-config' | 'default';
    description: string;
  };
}

/**
 * Extended LSP configuration with parsed command and args
 */
export interface ParsedLspConfig extends LspConfig {
  name: string;
  commandName: string;
  commandArgs: string[];
}

/**
 * Empty default configuration - users must provide configurations via YAML files
 */
const DEFAULT_CONFIG: ConfigFile = {
  lsps: {},
};

/**
 * Load and parse LSP configuration from YAML file
 */
export function loadLspConfig(
  configPath?: string,
  workspacePath?: string
): ConfigWithSource {
  // Get OS-specific config directory using env-paths
  const paths = envPaths('symbols');

  // Try different config locations with priority: CLI > workspace > repo > cwd > home
  const workspaceConfigPaths = workspacePath
    ? [
        path.join(workspacePath, 'symbols.yaml'),
        path.join(workspacePath, 'symbols.yml'),
        path.join(workspacePath, 'lsps.yaml'), // Backward compatibility
        path.join(workspacePath, 'lsps.yml'), // Backward compatibility
      ]
    : [];

  // Define config paths with their categories
  const configSourceCandidates: Array<{ path?: string; type: ConfigWithSource['source']['type']; description: string }> = [
    // P1: CLI argument (highest priority)
    ...(configPath ? [{ path: configPath, type: 'cli-arg' as const, description: 'Provided via --config argument' }] : []),
    // P2: Workspace directory (if provided)
    ...workspaceConfigPaths.map(p => ({ 
      path: p, 
      type: 'workspace' as const, 
      description: `Found in workspace directory (${workspacePath})` 
    })),
    // P3: Repo folder YAML files (relative to cwd)
    { path: 'symbols.yaml', type: 'repo-cwd', description: 'Found in current directory' },
    { path: 'symbols.yml', type: 'repo-cwd', description: 'Found in current directory' },
    { path: 'lsps.yaml', type: 'repo-cwd', description: 'Found in current directory (legacy)' },
    { path: 'lsps.yml', type: 'repo-cwd', description: 'Found in current directory (legacy)' },
    // P4: Current working directory (explicit paths)
    { path: path.join(process.cwd(), 'symbols.yaml'), type: 'explicit-cwd', description: `Found in current working directory (${process.cwd()})` },
    { path: path.join(process.cwd(), 'symbols.yml'), type: 'explicit-cwd', description: `Found in current working directory (${process.cwd()})` },
    { path: path.join(process.cwd(), 'lsps.yaml'), type: 'explicit-cwd', description: `Found in current working directory (${process.cwd()}) (legacy)` },
    { path: path.join(process.cwd(), 'lsps.yml'), type: 'explicit-cwd', description: `Found in current working directory (${process.cwd()}) (legacy)` },
    // P5: OS-specific config directory (lowest priority)
    { path: path.join(paths.config, 'symbols.yaml'), type: 'shared-config', description: `Found in shared config directory (${paths.config})` },
    { path: path.join(paths.config, 'symbols.yml'), type: 'shared-config', description: `Found in shared config directory (${paths.config})` },
    { path: path.join(paths.config, 'lsps.yaml'), type: 'shared-config', description: `Found in shared config directory (${paths.config}) (legacy)` },
    { path: path.join(paths.config, 'lsps.yml'), type: 'shared-config', description: `Found in shared config directory (${paths.config}) (legacy)` },
  ];
  
  const configSources = configSourceCandidates.filter((source): source is { path: string; type: ConfigWithSource['source']['type']; description: string } => 
    source.path !== undefined && typeof source.path === 'string'
  );

  for (const source of configSources) {
    try {
      if (fs.existsSync(source.path)) {
        const yamlContent = fs.readFileSync(source.path, 'utf8');
        const parsed = yaml.load(yamlContent);

        // Validate with Zod
        const config = ConfigFileSchema.parse(parsed);

        // Expand environment variables in the configuration
        const expandedConfig = expandEnvironmentVariables(config);
        
        return {
          config: expandedConfig,
          source: {
            path: path.resolve(source.path),
            type: source.type,
            description: source.description
          }
        };
      }
    } catch {
      continue;
    }
  }

  // If no config file is found, return default configuration
  return {
    config: expandEnvironmentVariables(DEFAULT_CONFIG),
    source: {
      path: 'default',
      type: 'default',
      description: 'Using default configuration (no config file found)'
    }
  };
}

/**
 * Expand environment variables in configuration values
 * Supports $VAR and ${VAR} syntax
 */
function expandEnvironmentVariables(config: ConfigFile): ConfigFile {
  return {
    ...config,
    lsps: Object.fromEntries(
      Object.entries(config.lsps).map(([name, lspConfig]) => [
        name,
        {
          ...lspConfig,
          command: expandString(lspConfig.command),
          environment: lspConfig.environment
            ? Object.fromEntries(
                Object.entries(lspConfig.environment).map(([key, value]) => [
                  key,
                  expandString(value),
                ])
              )
            : undefined,
        },
      ])
    ),
  };
}

/**
 * Expand environment variables in a string
 * Supports both $VAR and ${VAR} syntax
 */
function expandString(str: string): string {
  return str.replace(
    /\$\{([^}]+)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g,
    (match: string, braced: string, simple: string) => {
      const varName = braced || simple;
      const value = process.env[varName];
      return value !== undefined ? value : match;
    }
  );
}

/**
 * Get LSP configuration for a specific language server
 */
export function getLspConfig(
  lspName: string,
  configPath?: string,
  workspacePath?: string
): ParsedLspConfig | null {
  const { config } = loadLspConfig(configPath, workspacePath);
  const lspConfig = config.lsps[lspName];

  if (!lspConfig) {
    return null;
  }

  // Parse command into name and args
  const commandParts = lspConfig.command.trim().split(' ').filter(Boolean);
  const commandName = commandParts[0];
  const commandArgs = commandParts.slice(1);

  if (!commandName) {
    throw new Error(`Invalid command for LSP ${lspName}: ${lspConfig.command}`);
  }

  return {
    ...lspConfig,
    name: lspName,
    commandName,
    commandArgs,
  };
}

/**
 * Get LSP configuration for a file based on its extension
 */
export function getLspConfigForFile(
  filePath: string,
  configPath?: string,
  workspacePath?: string
): ParsedLspConfig | null {
  const extension = path.extname(filePath);
  const { config } = loadLspConfig(configPath, workspacePath);

  // Find LSP that handles this file extension
  for (const [lspName, lspConfig] of Object.entries(config.lsps)) {
    if (lspConfig.extensions[extension]) {
      return getLspConfig(lspName, configPath, workspacePath);
    }
  }

  return null;
}

/**
 * Get language ID for a file based on its extension
 */
export function getLanguageId(
  filePath: string,
  configPath?: string,
  workspacePath?: string
): string | null {
  const extension = path.extname(filePath);
  const { config } = loadLspConfig(configPath, workspacePath);

  // Find language ID from LSP configuration
  for (const lspConfig of Object.values(config.lsps)) {
    const languageId = lspConfig.extensions[extension];
    if (languageId) {
      return languageId;
    }
  }

  return null;
}

/**
 * List all available LSP configurations
 */
export function listAvailableLsps(
  configPath?: string,
  workspacePath?: string
): string[] {
  const { config } = loadLspConfig(configPath, workspacePath);
  return Object.keys(config.lsps);
}

/**
 * Auto-detect LSP server based on workspace files in a directory
 */
export function autoDetectLsp(
  workspacePath: string,
  configPath?: string
): string | null {
  const { config } = loadLspConfig(configPath, workspacePath);

  try {
    // Get list of files in workspace directory
    const workspaceFiles = fs.readdirSync(workspacePath);

    // Check each LSP configuration for matching workspace files
    for (const [lspName, lspConfig] of Object.entries(config.lsps)) {
      for (const workspaceFile of lspConfig.workspace_files) {
        // Handle glob patterns (basic support for * wildcards)
        if (workspaceFile.includes('*')) {
          const pattern = workspaceFile.replace(/\*/g, '.*');
          const regex = new RegExp(`^${pattern}$`);

          if (workspaceFiles.some((file) => regex.test(file))) {
            return lspName;
          }
        } else {
          // Exact file match
          if (workspaceFiles.includes(workspaceFile)) {
            return lspName;
          }
        }
      }
    }

    return null;
  } catch {
    // If we can't read the directory, return null
    return null;
  }
}
