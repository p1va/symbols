/**
 * Command-line argument parsing utilities using yargs
 */

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import logger from './logger.js';
import { listAvailableLsps, loadLspConfig } from '../config/lsp-config.js';

export interface CliArgs {
  workspace?: string;
  lsp?: string;
  loglevel?: string;
  configPath?: string;
  help?: boolean;
  showConfig?: boolean;
}

/**
 * Parse command-line arguments using yargs
 */
export function parseCliArgs(args: string[] = process.argv): CliArgs {
  // Log CLI arguments using unified logger
  // IMPORTANT: No console output here - MCP uses stdin/stdout for communication
  logger.info('[CLI] Raw arguments received', {
    rawArgs: args,
    cwd: process.cwd(),
    pid: process.pid,
  });

  const argv = yargs(hideBin(args))
    .scriptName('symbols')
    .usage('$0 [options]')
    .option('workspace', {
      alias: 'w',
      type: 'string',
      describe: 'Workspace directory path',
      requiresArg: true,
      default: undefined, // Let resolveConfig handle the default
    })
    .option('lsp', {
      alias: 'l',
      type: 'string',
      describe: 'LSP server to use (auto-detected if not specified)',
      requiresArg: true,
    })
    .option('loglevel', {
      type: 'string',
      describe: 'Log level',
      choices: ['debug', 'info', 'warn', 'error'],
      requiresArg: true,
      default: undefined, // Let resolveConfig handle the default
    })
    .option('config', {
      alias: 'c',
      type: 'string',
      describe: 'Path to configuration file',
      requiresArg: true,
    })
    .option('show-config', {
      type: 'boolean',
      describe: 'Output the active configuration in YAML format and exit',
    })
    .env('SYMBOLS') // Support SYMBOLS_WORKSPACE, SYMBOLS_LSP, etc.
    .example('$0 --workspace /path/to/project', 'Use specific workspace')
    .example('$0 --lsp pyright --workspace /path/to/python', 'Use Python LSP')
    .example('$0 --loglevel debug', 'Enable debug logging')
    .example('$0 --show-config', 'Show active configuration')
    .example(
      '$0 --show-config --config symbols.yaml',
      'Show config from custom file'
    )
    .example('$0 --config symbols.yaml', 'Use custom configuration file')
    .help()
    .alias('help', 'h')
    .strict()
    .version(false) // Disable version since we don't have one
    .check((argv) => {
      // Validate workspace directory if provided
      if (argv.workspace) {
        const workspacePath = path.resolve(argv.workspace);

        if (!fs.existsSync(workspacePath)) {
          throw new Error(
            `Workspace directory does not exist: ${argv.workspace}\nResolved path: ${workspacePath}`
          );
        }

        const stats = fs.statSync(workspacePath);
        if (!stats.isDirectory()) {
          throw new Error(
            `Workspace path is not a directory: ${argv.workspace}\nResolved path: ${workspacePath}`
          );
        }
      }

      // Validate config file if provided
      if (argv.config) {
        const configPath = path.resolve(argv.config);

        if (!fs.existsSync(configPath)) {
          throw new Error(
            `Config file does not exist: ${argv.config}\nResolved path: ${configPath}`
          );
        }

        const stats = fs.statSync(configPath);
        if (!stats.isFile()) {
          throw new Error(
            `Config path is not a file: ${argv.config}\nResolved path: ${configPath}`
          );
        }
      }

      // Validate LSP server if provided
      if (argv.lsp) {
        try {
          // Use the provided config path, or let listAvailableLsps find the default
          const availableLsps = listAvailableLsps(argv.config);

          if (!availableLsps.includes(argv.lsp)) {
            throw new Error(
              `Unknown LSP server: ${argv.lsp}\n` +
                `Available LSP servers: ${availableLsps.join(', ')}\n` +
                `Check your configuration file or use --help for more information.`
            );
          }
        } catch (error) {
          if (
            error instanceof Error &&
            error.message.includes('Unknown LSP server')
          ) {
            throw error; // Re-throw our validation error
          }
          // If config loading failed, provide a helpful error
          throw new Error(
            `Failed to load LSP configuration to validate '${argv.lsp}': ${error instanceof Error ? error.message : String(error)}\n` +
              `Make sure your configuration file exists and is valid.`
          );
        }
      }

      return true;
    })
    .parseSync();

  // Build result object, only including defined values
  const result: CliArgs = {
    help: Boolean(argv.help),
    showConfig: Boolean(argv['show-config']),
  };

  // yargs has already validated these exist if provided, so we can trust them
  if (argv.workspace !== undefined) result.workspace = argv.workspace;
  if (argv.lsp !== undefined) result.lsp = argv.lsp;
  if (argv.loglevel !== undefined) result.loglevel = argv.loglevel;
  if (argv.config !== undefined) result.configPath = argv.config;

  return result;
}

/**
 * Show help information (now handled by yargs automatically)
 */
export function showHelp(): void {
  // yargs handles help automatically, but we keep this for compatibility
  yargs(hideBin(process.argv)).showHelp();
}

/**
 * Show active configuration in YAML format
 */
export function showConfig(configPath?: string): void {
  try {
    const configWithSource = loadLspConfig(configPath);
    const yamlOutput = yaml.dump(configWithSource.config, {
      indent: 2,
      lineWidth: 120,
      noRefs: true,
      sortKeys: true,
    });

    console.log('# Active Configuration');
    console.log(`# Source: ${configWithSource.source.description}`);
    if (configWithSource.source.path !== 'default') {
      console.log(`# Config file: ${configWithSource.source.path}`);
    }
    console.log('# Use --config <file> to specify a custom configuration file');
    console.log();
    console.log(yamlOutput);
  } catch (error) {
    console.error(
      'Error loading configuration:',
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

/**
 * Resolve configuration from CLI args, environment variables, and defaults
 */
export function resolveConfig(cliArgs: CliArgs): {
  workspace: string;
  lsp?: string;
  loglevel: string;
  configPath?: string;
} {
  const lsp = cliArgs.lsp || process.env.SYMBOLS_LSP;
  const configPath = cliArgs.configPath || process.env.SYMBOLS_CONFIG_PATH;
  const result: {
    workspace: string;
    lsp?: string;
    loglevel: string;
    configPath?: string;
  } = {
    workspace:
      cliArgs.workspace || process.env.SYMBOLS_WORKSPACE || process.cwd(),
    loglevel: cliArgs.loglevel || process.env.LOGLEVEL || 'info',
  };

  if (lsp) {
    result.lsp = lsp;
  }

  if (configPath) {
    result.configPath = configPath;
  }

  return result;
}
