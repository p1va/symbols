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
import { showTemplateList, showTemplate } from './templates.js';

export interface CliArgs {
  workspace?: string;
  lsp?: string;
  loglevel?: string;
  configPath?: string;
  help?: boolean;
  showConfig?: boolean;
  debug?: boolean;
  command?: 'template';
  templateCommand?: 'list' | 'show';
  templateName?: string;
  directCommand?: {
    // Direct LSP command (everything after --)
    commandName: string;
    commandArgs: string[];
  };
}

/**
 * Parse command-line arguments using yargs
 */
export function parseCliArgs(args: string[] = process.argv): CliArgs {
  // Log CLI arguments using unified logger
  // IMPORTANT: No console output here - MCP uses stdin/stdout for communication
  logger.debug('[CLI] Raw arguments received', {
    rawArgs: args,
    cwd: process.cwd(),
    pid: process.pid,
  });

  // Check for -- delimiter for direct LSP command
  const rawArgs = hideBin(args);
  const dashIndex = rawArgs.indexOf('--');
  let directCommand: CliArgs['directCommand'] | undefined;
  let argsToProcess = rawArgs;

  if (dashIndex !== -1) {
    // Extract everything after -- as the direct command
    const commandParts = rawArgs.slice(dashIndex + 1);
    if (commandParts.length > 0) {
      const [commandName, ...commandArgs] = commandParts;
      if (commandName) {
        directCommand = { commandName, commandArgs };
        logger.debug('[CLI] Direct command detected', {
          commandName,
          commandArgs,
        });
      }
    }
    // Process only args before --
    argsToProcess = rawArgs.slice(0, dashIndex);
  }

  const argv = yargs(argsToProcess)
    .scriptName('symbols')
    .usage('$0 [options]')
    .command(
      'template <command> [name]',
      'Manage configuration templates',
      (yargs) => {
        return yargs
          .positional('command', {
            describe: 'Template command to execute',
            choices: ['list', 'show'],
            demandOption: true,
          })
          .positional('name', {
            describe: 'Template name (required for show command)',
            type: 'string',
          })
          .example('$0 template list', 'List all available templates')
          .example('$0 template show typescript', 'Show TypeScript template')
          .example(
            '$0 template show typescript > symbols.yaml',
            'Save template to file'
          );
      },
      (argv) => {
        // Handle template command
        if (argv.command === 'list') {
          showTemplateList();
          process.exit(0);
        } else if (argv.command === 'show') {
          if (!argv.name) {
            console.error('Error: template name is required for show command');
            console.error('Usage: symbols template show <name>');
            process.exit(1);
          }
          showTemplate(argv.name);
          process.exit(0);
        }
      }
    )
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
    .option('debug', {
      type: 'boolean',
      describe: 'Enable debug mode with console logging for troubleshooting',
      default: false,
    })
    // Note: We don't use .env() here because we only want specific SYMBOLS_* env vars
    // to be treated as CLI arguments (WORKSPACE, LSP, LOGLEVEL, CONFIG_PATH).
    // Other SYMBOLS_* vars (like WORKSPACE_LOADER, DIAGNOSTICS_*) are LSP-specific
    // and are read directly in getLspConfig() rather than exposed as CLI args.
    .example('$0 --workspace /path/to/project', 'Use specific workspace')
    .example('$0 --lsp pyright --workspace /path/to/python', 'Use Python LSP')
    .example('$0 --loglevel debug', 'Enable debug logging')
    .example('$0 --debug', 'Run in debug mode with console output')
    .example('$0 --show-config', 'Show active configuration')
    .example(
      '$0 --show-config --config symbols.yaml',
      'Show config from custom file'
    )
    .example('$0 --config symbols.yaml', 'Use custom configuration file')
    .example(
      '$0 -- npx typescript-language-server --stdio',
      'Direct LSP command (no config needed)'
    )
    .example('$0 -- gopls', 'Direct command for Go LSP')
    .help()
    .alias('help', 'h')
    .strict()
    .version(false) // Disable version since we don't have one
    .check((argv) => {
      // Check for conflicts with direct command mode (--)
      if (directCommand) {
        const incompatibleOptions = [];

        if (argv.lsp) {
          incompatibleOptions.push('--lsp');
        }
        if (argv.config) {
          incompatibleOptions.push('--config');
        }
        if (argv['show-config']) {
          incompatibleOptions.push('--show-config');
        }

        if (incompatibleOptions.length > 0) {
          throw new Error(
            `Direct command mode (--) is incompatible with: ${incompatibleOptions.join(', ')}\n` +
              `When using --, only --workspace and --loglevel are allowed.\n` +
              `Direct command mode bypasses configuration files and LSP selection.`
          );
        }
      }

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
    debug: Boolean(argv.debug),
  };

  // yargs has already validated these exist if provided, so we can trust them
  if (argv.workspace !== undefined) result.workspace = argv.workspace;
  if (argv.lsp !== undefined) result.lsp = argv.lsp;
  if (argv.loglevel !== undefined) result.loglevel = argv.loglevel;
  if (argv.config !== undefined) result.configPath = argv.config;

  // Add direct command if detected
  if (directCommand) {
    result.directCommand = directCommand;
  }

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
 * @param configPath - Optional path to configuration file
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
 *
 * Environment variables supported:
 * - SYMBOLS_WORKSPACE: Workspace directory path
 * - SYMBOLS_LSP: LSP server name
 * - SYMBOLS_LOGLEVEL: Log level (debug, info, warn, error)
 * - SYMBOLS_CONFIG_PATH: Path to configuration file
 *
 * Note: LSP-specific env vars (WORKSPACE_LOADER, DIAGNOSTICS_*, PRELOAD_FILES)
 * are read directly in getLspConfig() and don't need CLI arg equivalents.
 */
export function resolveConfig(cliArgs: CliArgs): {
  workspace: string;
  lsp?: string;
  loglevel: string;
  configPath?: string;
  debug: boolean;
} {
  // Explicitly read SYMBOLS_* environment variables (without using yargs .env())
  const lsp = cliArgs.lsp || process.env.SYMBOLS_LSP;
  const configPath = cliArgs.configPath || process.env.SYMBOLS_CONFIG_PATH;
  const result: {
    workspace: string;
    lsp?: string;
    loglevel: string;
    configPath?: string;
    debug: boolean;
  } = {
    workspace:
      cliArgs.workspace || process.env.SYMBOLS_WORKSPACE || process.cwd(),
    loglevel: cliArgs.loglevel || process.env.SYMBOLS_LOGLEVEL || 'info',
    debug: cliArgs.debug || false,
  };

  if (lsp) {
    result.lsp = lsp;
  }

  if (configPath) {
    result.configPath = configPath;
  }

  return result;
}
