/**
 * LSP Configuration System - YAML-based configuration for multiple language servers
 */

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { z } from 'zod';

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

/**
 * Extended LSP configuration with parsed command and args
 */
export interface ParsedLspConfig extends LspConfig {
  name: string;
  commandName: string;
  commandArgs: string[];
}

/**
 * Default configuration fallback
 */
const DEFAULT_CONFIG: ConfigFile = {
  lsps: {
    typescript: {
      command: 'typescript-language-server --stdio',
      extensions: {
        '.js': 'javascript',
        '.mjs': 'javascript',
        '.cjs': 'javascript',
        '.jsx': 'javascriptreact',
        '.ts': 'typescript',
        '.mts': 'typescript',
        '.cts': 'typescript',
        '.tsx': 'typescriptreact',
        '.json': 'json',
      },
      workspace_files: ['package.json', 'tsconfig.json'],
      diagnostics: {
        strategy: 'push',
        wait_timeout_ms: 3000,
      },
      symbols: {
        max_depth: null,
        kinds: [],
      },
    },
  },
};

/**
 * Load and parse LSP configuration from YAML file
 */
export function loadLspConfig(configPath?: string): ConfigFile {
  // Try different config locations - prefer symbols.yaml/yml, but support lsps.yaml/yml for backward compatibility
  const possiblePaths = [
    configPath,
    'symbols.yaml',
    'symbols.yml', 
    'lsps.yaml',    // Backward compatibility
    'lsps.yml',     // Backward compatibility
    // TODO: Fix, first should look into workspace rather than cwd
    path.join(process.cwd(), 'symbols.yaml'),
    path.join(process.cwd(), 'symbols.yml'),
    path.join(process.cwd(), 'lsps.yaml'),    // Backward compatibility
    path.join(process.cwd(), 'lsps.yml'),     // Backward compatibility
    path.join(
      process.env.HOME || process.cwd(),
      '.config',
      'symbols',
      'symbols.yaml'
    ),
    path.join(
      process.env.HOME || process.cwd(),
      '.config',
      'symbols',
      'symbols.yml'
    ),
    path.join(
      process.env.HOME || process.cwd(),
      '.config',
      'symbols',
      'lsps.yaml'  // Backward compatibility
    ),
    path.join(
      process.env.HOME || process.cwd(),
      '.config',
      'symbols',
      'lsps.yml'   // Backward compatibility
    ),
  ].filter((p): p is string => p !== undefined);

  for (const configFile of possiblePaths) {
    try {
      if (fs.existsSync(configFile)) {
        const yamlContent = fs.readFileSync(configFile, 'utf8');
        const parsed = yaml.load(yamlContent);


        // Validate with Zod
        const config = ConfigFileSchema.parse(parsed);
        
        // Expand environment variables in the configuration
        return expandEnvironmentVariables(config);
      }
    } catch {
      continue;
    }
  }

  return expandEnvironmentVariables(DEFAULT_CONFIG);
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
  return str.replace(/\$\{([^}]+)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (match: string, braced: string, simple: string) => {
    const varName = braced || simple;
    const value = process.env[varName];
    return value !== undefined ? value : match;
  });
}

/**
 * Get LSP configuration for a specific language server
 */
export function getLspConfig(
  lspName: string,
  configPath?: string
): ParsedLspConfig | null {
  const config = loadLspConfig(configPath);
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
  configPath?: string
): ParsedLspConfig | null {
  const extension = path.extname(filePath);
  const config = loadLspConfig(configPath);

  // Find LSP that handles this file extension
  for (const [lspName, lspConfig] of Object.entries(config.lsps)) {
    if (lspConfig.extensions[extension]) {
      return getLspConfig(lspName, configPath);
    }
  }

  return null;
}

/**
 * Get language ID for a file based on its extension
 */
export function getLanguageId(
  filePath: string,
  configPath?: string
): string | null {
  const extension = path.extname(filePath);
  const config = loadLspConfig(configPath);

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
export function listAvailableLsps(configPath?: string): string[] {
  const config = loadLspConfig(configPath);
  return Object.keys(config.lsps);
}

/**
 * Auto-detect LSP server based on workspace files in a directory
 */
export function autoDetectLsp(
  workspacePath: string,
  configPath?: string
): string | null {
  const config = loadLspConfig(configPath);

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
