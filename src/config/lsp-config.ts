/**
 * LSP Configuration System - YAML-based configuration for multiple language servers
 */

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { z } from 'zod';
import { parse as shellParse, type ShellQuoteToken } from 'shell-quote';
import { getAppPaths } from '../utils/app-paths.js';
import { symbolKindNamesToNumbers } from './symbol-kinds.js';
import { DEFAULT_EXTENSIONS } from './default-extensions.js';

// Zod schemas for validation
const DiagnosticsConfigSchema = z.object({
  strategy: z.enum(['push', 'pull']).default('push'),
  wait_timeout_ms: z.number().min(100).max(30000).default(2000),
});

const SymbolsConfigSchema = z.object({
  containerKinds: z.array(z.union([z.string(), z.number()])).optional(),
});

const LspConfigSchema = z.object({
  command: z.string(),
  extensions: z.record(z.string(), z.string()).default({}), // file extension -> language ID, merged with DEFAULT_EXTENSIONS
  workspace_files: z.array(z.string()).default([]),
  preload_files: z.array(z.string()).default([]), // files to open during initialization
  diagnostics: DiagnosticsConfigSchema.default({
    strategy: 'push',
    wait_timeout_ms: 2000,
  }),
  symbols: SymbolsConfigSchema.default({}),
  environment: z.record(z.string(), z.string()).optional(),
  workspace_loader: z.string().optional(), // workspace loader type ('default', 'csharp', etc.)
});

const ConfigFileSchema = z.object({
  'language-servers': z.record(z.string(), LspConfigSchema),
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
    type:
      | 'cli-arg'
      | 'workspace'
      | 'repo-cwd'
      | 'explicit-cwd'
      | 'shared-config'
      | 'default';
    description: string;
  };
}

/**
 * Parsed symbols config with containerKinds converted to numbers
 */
export interface ParsedSymbolsConfig {
  containerKinds?: number[];
}

/**
 * Extended LSP configuration with parsed command and args
 * Omits symbols from LspConfig and replaces it with ParsedSymbolsConfig
 */
export interface ParsedLspConfig extends Omit<LspConfig, 'symbols'> {
  name: string;
  commandName: string;
  commandArgs: string[];
  symbols: ParsedSymbolsConfig;
}

/**
 * Empty default configuration - users must provide configurations via YAML files
 */
const DEFAULT_CONFIG: ConfigFile = {
  'language-servers': {},
};

/**
 * Load and parse LSP configuration from YAML file
 */
export function loadLspConfig(
  configPath?: string,
  workspacePath?: string
): ConfigWithSource {
  // Get OS-specific config directory using env-paths
  const paths = getAppPaths();

  // Try different config locations with priority: CLI > workspace > repo > cwd > home
  const workspaceConfigPaths = workspacePath
    ? [
        path.join(workspacePath, 'language-servers.yaml'),
        path.join(workspacePath, 'language-servers.yml'),
      ]
    : [];

  // Define config paths with their categories
  const configSourceCandidates: Array<{
    path?: string;
    type: ConfigWithSource['source']['type'];
    description: string;
  }> = [
    // P1: CLI argument (highest priority)
    ...(configPath
      ? [
          {
            path: configPath,
            type: 'cli-arg' as const,
            description: 'Provided via --config argument',
          },
        ]
      : []),
    // P2: Workspace directory (if provided)
    ...workspaceConfigPaths.map((p) => ({
      path: p,
      type: 'workspace' as const,
      description: `Found in workspace directory (${workspacePath})`,
    })),
    // P3: Repo folder YAML files (relative to cwd)
    {
      path: 'language-servers.yaml',
      type: 'repo-cwd',
      description: 'Found in current directory',
    },
    {
      path: 'language-servers.yml',
      type: 'repo-cwd',
      description: 'Found in current directory',
    },
    // P4: Current working directory (explicit paths)
    {
      path: path.join(process.cwd(), 'language-servers.yaml'),
      type: 'explicit-cwd',
      description: `Found in current working directory (${process.cwd()})`,
    },
    {
      path: path.join(process.cwd(), 'language-servers.yml'),
      type: 'explicit-cwd',
      description: `Found in current working directory (${process.cwd()})`,
    },
    // P5: OS-specific config directory (lowest priority)
    {
      path: path.join(paths.config, 'language-servers.yaml'),
      type: 'shared-config',
      description: `Found in shared config directory (${paths.config})`,
    },
    {
      path: path.join(paths.config, 'language-servers.yml'),
      type: 'shared-config',
      description: `Found in shared config directory (${paths.config})`,
    },
  ];

  const configSources = configSourceCandidates.filter(
    (
      source
    ): source is {
      path: string;
      type: ConfigWithSource['source']['type'];
      description: string;
    } => source.path !== undefined && typeof source.path === 'string'
  );

  for (const source of configSources) {
    if (!fs.existsSync(source.path)) {
      continue;
    }

    const resolvedPath = path.resolve(source.path);

    try {
      const yamlContent = fs.readFileSync(source.path, 'utf8');
      const parsed = yaml.load(yamlContent);

      const config = ConfigFileSchema.parse(parsed);
      const expandedConfig = expandEnvironmentVariables(config);

      return {
        config: expandedConfig,
        source: {
          path: resolvedPath,
          type: source.type,
          description: source.description,
        },
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        const issues = error.issues
          .map((issue) => {
            const pathStr =
              issue.path.length > 0 ? issue.path.join('.') : '<root>';
            return `${pathStr}: ${issue.message}`;
          })
          .join('; ');

        throw new Error(`Invalid configuration in ${resolvedPath}: ${issues}`);
      }

      throw new Error(
        `Failed to load configuration from ${resolvedPath}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  // If no config file is found, return default configuration
  return {
    config: expandEnvironmentVariables(DEFAULT_CONFIG),
    source: {
      path: 'default',
      type: 'default',
      description: 'Using default configuration (no config file found)',
    },
  };
}

/**
 * Expand environment variables in configuration values
 * Supports $VAR and ${VAR} syntax
 * @param config - Configuration to expand
 */
function expandEnvironmentVariables(config: ConfigFile): ConfigFile {
  return {
    ...config,
    'language-servers': Object.fromEntries(
      Object.entries(config['language-servers']).map(([name, lspConfig]) => [
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

function describeShellToken(token: ShellQuoteToken): string {
  if (token === null) {
    return 'null';
  }

  if (typeof token === 'object') {
    return JSON.stringify(token as Record<string, unknown>);
  }

  if (
    typeof token === 'number' ||
    typeof token === 'bigint' ||
    typeof token === 'boolean'
  ) {
    return String(token);
  }

  return String(token);
}

/**
 * Expand environment variables in a string
 * Supports both $VAR and ${VAR} syntax
 * @param str - String to expand
 */
function expandString(str: string): string {
  // Handle regular environment variable expansion
  return str.replace(
    /\$\{([^}]+)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g,
    (match: string, braced: string, simple: string) => {
      const varName = braced || simple;

      // Handle regular environment variables
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
  const lspConfig = config['language-servers'][lspName];

  if (!lspConfig) {
    return null;
  }

  // Apply environment variable overrides (SYMBOLS_* prefix)
  // Precedence: ENV vars > YAML config > Zod defaults

  // Override workspace_loader if SYMBOLS_WORKSPACE_LOADER is set
  if (process.env.SYMBOLS_WORKSPACE_LOADER) {
    lspConfig.workspace_loader = process.env.SYMBOLS_WORKSPACE_LOADER;
  }

  // Override diagnostics.strategy if SYMBOLS_DIAGNOSTICS_STRATEGY is set
  if (process.env.SYMBOLS_DIAGNOSTICS_STRATEGY) {
    const strategy = process.env.SYMBOLS_DIAGNOSTICS_STRATEGY;
    if (strategy !== 'push' && strategy !== 'pull') {
      throw new Error(
        `Invalid SYMBOLS_DIAGNOSTICS_STRATEGY: ${strategy}. Must be 'push' or 'pull'.`
      );
    }
    lspConfig.diagnostics.strategy = strategy;
  }

  // Override diagnostics.wait_timeout_ms if SYMBOLS_DIAGNOSTICS_WAIT_TIMEOUT is set
  if (process.env.SYMBOLS_DIAGNOSTICS_WAIT_TIMEOUT) {
    const timeout = parseInt(process.env.SYMBOLS_DIAGNOSTICS_WAIT_TIMEOUT, 10);
    if (isNaN(timeout) || timeout < 100 || timeout > 30000) {
      throw new Error(
        `Invalid SYMBOLS_DIAGNOSTICS_WAIT_TIMEOUT: ${process.env.SYMBOLS_DIAGNOSTICS_WAIT_TIMEOUT}. Must be a number between 100 and 30000.`
      );
    }
    lspConfig.diagnostics.wait_timeout_ms = timeout;
  }

  // Override preload_files if SYMBOLS_PRELOAD_FILES is set
  // Uses OS-specific path delimiter (: on Unix, ; on Windows)
  if (process.env.SYMBOLS_PRELOAD_FILES) {
    const preloadFiles = process.env.SYMBOLS_PRELOAD_FILES.split(
      path.delimiter
    ).filter((file) => file.trim().length > 0);

    lspConfig.preload_files = preloadFiles;
  }

  // Parse command into name and args (respecting quoted segments and spaces)
  const parsedParts: ShellQuoteToken[] = shellParse(lspConfig.command.trim());
  const commandSegments: string[] = [];

  for (const part of parsedParts) {
    if (typeof part !== 'string') {
      const description = describeShellToken(part);
      throw new Error(
        `Unsupported shell token in command for LSP ${lspName}: ${description}`
      );
    }
    commandSegments.push(part);
  }

  const [commandName, ...commandArgs] = commandSegments;

  if (!commandName) {
    throw new Error(`Invalid command for LSP ${lspName}: ${lspConfig.command}`);
  }

  // Convert containerKinds from string/mixed array to numbers
  const symbols: ParsedSymbolsConfig = {};
  if (lspConfig.symbols?.containerKinds) {
    symbols.containerKinds = symbolKindNamesToNumbers(
      lspConfig.symbols.containerKinds
    );
  }

  // Merge user extensions with defaults (user extensions override defaults)
  const extensions = {
    ...DEFAULT_EXTENSIONS,
    ...lspConfig.extensions,
  };

  return {
    ...lspConfig,
    extensions,
    symbols,
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
  for (const [lspName, lspConfig] of Object.entries(config['language-servers'])) {
    if (lspConfig.extensions[extension]) {
      return getLspConfig(lspName, configPath, workspacePath);
    }
  }

  return null;
}

/**
 * Get language ID for a file based on its extension
 * Returns 'plaintext' if no match is found
 */
export function getLanguageId(
  filePath: string,
  configPath?: string,
  workspacePath?: string
): string {
  const extension = path.extname(filePath);
  const { config } = loadLspConfig(configPath, workspacePath);

  // Find language ID from LSP configuration
  for (const lspConfig of Object.values(config['language-servers'])) {
    const languageId = lspConfig.extensions[extension];
    if (languageId) {
      return languageId;
    }
  }

  // Default to plaintext if no match found
  return 'plaintext';
}

/**
 * List all available LSP configurations
 */
export function listAvailableLsps(
  configPath?: string,
  workspacePath?: string
): string[] {
  const { config } = loadLspConfig(configPath, workspacePath);
  return Object.keys(config['language-servers']);
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
    for (const [lspName, lspConfig] of Object.entries(config['language-servers'])) {
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

/**
 * Create a minimal ParsedLspConfig from direct command (-- mode)
 * Uses default extension mappings - works with any LSP server
 */
export function createConfigFromDirectCommand(
  commandName: string,
  commandArgs: string[]
): ParsedLspConfig {
  // Reconstruct command string from parts
  const command = [commandName, ...commandArgs].join(' ');

  // Build minimal config with default extensions
  // The LSP will handle only the files it recognizes
  const config: ParsedLspConfig = {
    name: 'direct-command',
    command,
    commandName,
    commandArgs,
    extensions: DEFAULT_EXTENSIONS, // Default mappings - works for all LSPs
    workspace_files: [], // Empty - not used in direct mode
    preload_files: [], // Empty by default - can be overridden by env var
    diagnostics: {
      strategy: 'push',
      wait_timeout_ms: 2000,
    },
    symbols: {},
    workspace_loader: undefined,
    environment: undefined,
  };

  // Apply environment variable overrides (same as regular mode)
  if (process.env.SYMBOLS_WORKSPACE_LOADER) {
    config.workspace_loader = process.env.SYMBOLS_WORKSPACE_LOADER;
  }

  if (process.env.SYMBOLS_DIAGNOSTICS_STRATEGY) {
    const strategy = process.env.SYMBOLS_DIAGNOSTICS_STRATEGY;
    if (strategy !== 'push' && strategy !== 'pull') {
      throw new Error(
        `Invalid SYMBOLS_DIAGNOSTICS_STRATEGY: ${strategy}. Must be 'push' or 'pull'.`
      );
    }
    config.diagnostics.strategy = strategy;
  }

  if (process.env.SYMBOLS_DIAGNOSTICS_WAIT_TIMEOUT) {
    const timeout = parseInt(process.env.SYMBOLS_DIAGNOSTICS_WAIT_TIMEOUT, 10);
    if (isNaN(timeout) || timeout < 100 || timeout > 30000) {
      throw new Error(
        `Invalid SYMBOLS_DIAGNOSTICS_WAIT_TIMEOUT: ${process.env.SYMBOLS_DIAGNOSTICS_WAIT_TIMEOUT}. Must be a number between 100 and 30000.`
      );
    }
    config.diagnostics.wait_timeout_ms = timeout;
  }

  if (process.env.SYMBOLS_PRELOAD_FILES) {
    const preloadFiles = process.env.SYMBOLS_PRELOAD_FILES.split(
      path.delimiter
    ).filter((file) => file.trim().length > 0);
    config.preload_files = preloadFiles;
  }

  return config;
}
