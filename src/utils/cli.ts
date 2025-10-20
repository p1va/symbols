/**
 * Command-line argument parsing utilities using yargs
 */

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';
import logger from './logger.js';
import { listAvailableLsps, loadLspConfig } from '../config/lsp-config.js';
import { getAppPaths } from './app-paths.js';

// Command types
export type CommandType = 'start' | 'run' | 'config' | null;

export interface BaseCliArgs {
  command: CommandType;
  help?: boolean;
  version?: boolean;
}

export interface StartCommandArgs extends BaseCliArgs {
  command: 'start';
  workspace?: string;
  lsp?: string;
  loglevel?: string;
  configPath?: string;
  console?: boolean;
}

export interface RunCommandArgs extends BaseCliArgs {
  command: 'run';
  workspace?: string;
  loglevel?: string;
  console?: boolean;
  directCommand: {
    commandName: string;
    commandArgs: string[];
  };
}

export interface ConfigInitArgs {
  subcommand: 'init';
  global?: boolean;
  local?: boolean;
  workspace?: string;
  force?: boolean;
}

export interface ConfigShowArgs {
  subcommand: 'show';
  configPath?: string;
  workspace?: string;
  format?: 'yaml' | 'json';
}

export interface ConfigPathArgs {
  subcommand: 'path';
  workspace?: string;
  all?: boolean;
}

export type ConfigSubcommandArgs =
  | ConfigInitArgs
  | ConfigShowArgs
  | ConfigPathArgs;

export interface ConfigCommandArgs extends BaseCliArgs {
  command: 'config';
  subcommandArgs: ConfigSubcommandArgs;
}

export type CliArgs =
  | BaseCliArgs
  | StartCommandArgs
  | RunCommandArgs
  | ConfigCommandArgs;

/**
 * Parse command-line arguments using yargs with subcommands
 */
export function parseCliArgs(args: string[] = process.argv): CliArgs {
  logger.debug('[CLI] Raw arguments received', {
    rawArgs: args,
    cwd: process.cwd(),
    pid: process.pid,
  });

  const argv = yargs(hideBin(args))
    .scriptName('symbols')
    .usage('Usage: $0 <command> [options]')
    .example('$0 run gopls', 'Quick start with Go LSP')
    .example(
      '$0 run -w /path/to/project pyright-langserver --stdio',
      'Run Python LSP with custom workspace'
    )
    .example('$0 start', 'Start with auto-detected LSP from config')
    .command('run', 'Run the Language Server command directly', (yargs) => {
      return yargs
        .parserConfiguration({
          'unknown-options-as-args': true, // Treat unknown options as positional args
          'populate--': true, // Populate argv._ with args after --
        })
        .option('workspace', {
          alias: 'w',
          type: 'string',
          describe: 'Workspace directory (default: current directory)',
          requiresArg: true,
        })
        .option('loglevel', {
          type: 'string',
          describe: 'Log level for the MCP server',
          choices: ['debug', 'info', 'warn', 'error'],
          requiresArg: true,
        })
        .option('console', {
          type: 'boolean',
          describe:
            'Output logs to console instead of log files (for troubleshooting only - do not use when running as MCP server)',
          default: false,
        })
        .example(
          '$0 run typescript-language-server --stdio',
          'Run TypeScript language server'
        )
        .example(
          '$0 run --workspace /path/to/project pyright-langserver --stdio',
          'Run with custom workspace'
        )
        .example(
          '$0 run -w /path --loglevel debug -- typescript-language-server --stdio',
          'Run with explicit separator (optional)'
        )
        .strictOptions(false) // Allow unknown options (LSP command arguments)
        .strictCommands(false) // Allow any positional args (LSP command)
        .check((argv) => {
          if (argv.workspace) {
            const workspacePath = path.resolve(argv.workspace);
            if (!fs.existsSync(workspacePath)) {
              throw new Error(
                `Workspace directory does not exist: ${argv.workspace}`
              );
            }
            if (!fs.statSync(workspacePath).isDirectory()) {
              throw new Error(
                `Workspace path is not a directory: ${argv.workspace}`
              );
            }
          }
          return true;
        });
    })
    .command(
      'start',
      'Start MCP server with Language Server auto-detection using configuration',
      (yargs) => {
        return yargs
          .option('config', {
            alias: 'c',
            type: 'string',
            describe: 'Path to configuration file',
            requiresArg: true,
          })
          .option('lsp', {
            alias: 'l',
            type: 'string',
            describe: 'Explicitly specify name of LSP to use from config',
            requiresArg: true,
          })
          .option('workspace', {
            alias: 'w',
            type: 'string',
            describe: 'Workspace directory (default: current directory)',
            requiresArg: true,
          })
          .option('loglevel', {
            type: 'string',
            describe: 'LSP server log level',
            choices: ['debug', 'info', 'warn', 'error'],
            requiresArg: true,
          })
          .option('console', {
            type: 'boolean',
            describe:
              'Output logs to console instead of log files (for troubleshooting only - do not use when running as MCP server)',
            default: false,
          })
          .example('$0 start', 'Start with auto-detection')
          .example(
            '$0 start --lsp typescript --workspace ./my-project',
            'Start with specific LSP'
          )
          .example(
            '$0 start --config ./language-servers.yaml',
            'Start with custom configuration'
          )
          .strictOptions() // Strict validation for start command
          .check((argv) => {
            if (argv.workspace) {
              const workspacePath = path.resolve(argv.workspace);
              if (!fs.existsSync(workspacePath)) {
                throw new Error(
                  `Workspace directory does not exist: ${argv.workspace}`
                );
              }
              if (!fs.statSync(workspacePath).isDirectory()) {
                throw new Error(
                  `Workspace path is not a directory: ${argv.workspace}`
                );
              }
            }
            if (argv.config) {
              const configPath = path.resolve(argv.config);
              if (!fs.existsSync(configPath)) {
                throw new Error(`Config file does not exist: ${argv.config}`);
              }
              if (!fs.statSync(configPath).isFile()) {
                throw new Error(`Config path is not a file: ${argv.config}`);
              }
            }
            if (argv.lsp) {
              const availableLsps = listAvailableLsps(argv.config);
              if (availableLsps.length === 0) {
                throw new Error(
                  `No LSP servers configured. Run "symbols config init" to create a configuration file.`
                );
              }
              if (!availableLsps.includes(argv.lsp)) {
                throw new Error(
                  `Unknown LSP server: ${argv.lsp}\nAvailable: ${availableLsps.join(', ')}`
                );
              }
            }
            return true;
          });
      }
    )
    .command('config', 'Manage configuration files', (yargs) => {
      return yargs
        .command('init', 'Initialize a new configuration file', (yargs) => {
          return yargs
            .option('local', {
              type: 'boolean',
              describe:
                'Create local config in current directory (default: ./language-servers.yaml)',
            })
            .option('global', {
              type: 'boolean',
              describe:
                'Create global config (~/.config/symbols/language-servers.yaml)',
              conflicts: 'local',
            })
            .option('workspace', {
              alias: 'w',
              type: 'string',
              describe:
                'Target directory for local config (default: current dir)',
              requiresArg: true,
            })
            .option('force', {
              alias: 'f',
              type: 'boolean',
              describe: 'Overwrite existing configuration file',
              default: false,
            })
            .example('$0 config init --local', 'Create local configuration')
            .example('$0 config init --global', 'Create global configuration')
            .check((argv) => {
              if (argv.workspace && argv.global) {
                throw new Error('--workspace can only be used with --local');
              }
              return true;
            });
        })
        .command('show', 'Display the effective configuration', (yargs) => {
          return yargs
            .option('config', {
              alias: 'c',
              type: 'string',
              describe: 'Show specific configuration file',
              requiresArg: true,
            })
            .option('workspace', {
              alias: 'w',
              type: 'string',
              describe:
                'Workspace directory for context (default: current dir)',
              requiresArg: true,
            })
            .option('format', {
              type: 'string',
              describe: 'Output format',
              choices: ['yaml', 'json'],
              default: 'yaml',
            })
            .example(
              '$0 config show',
              'Show effective configuration for current directory'
            )
            .example(
              '$0 config show --config ./language-servers.yaml',
              'Show specific configuration file'
            )
            .example(
              '$0 config show --format json',
              'Show configuration as JSON'
            );
        })
        .command('path', 'Show configuration file location', (yargs) => {
          return yargs
            .option('workspace', {
              alias: 'w',
              type: 'string',
              describe: 'Workspace directory (default: current directory)',
              requiresArg: true,
            })
            .option('all', {
              type: 'boolean',
              describe: 'Show all possible config locations and their status',
              default: false,
            })
            .example('$0 config path', 'Show active config path')
            .example(
              '$0 config path --all',
              'Show all config locations and whether they exist'
            );
        })
        .demandCommand(1, 'Please specify a config subcommand')
        .example('$0 config init --local', 'Initialize local configuration')
        .example('$0 config show', 'Show effective configuration');
    })
    .demandCommand(1, 'Please specify a command')
    .help()
    .alias('help', 'h')
    .version(false)
    .strictCommands() // Validate commands but allow unknown args for 'run' command
    .parseSync();

  // Extract command
  const command = argv._[0] as string;

  // Handle 'run' command with optional -- delimiter
  if (command === 'run') {
    const rawArgs = hideBin(args);
    const dashIndex = rawArgs.indexOf('--');

    // Find where the LSP command starts
    // It's either after '--' or the first non-flag argument after 'run'
    let commandParts: string[];

    if (dashIndex !== -1) {
      // Explicit separator: everything after '--' is the command
      commandParts = rawArgs.slice(dashIndex + 1);
    } else {
      // No separator: find first non-flag argument after 'run'
      // Known flags: --workspace/-w, --loglevel, --console, --help/-h
      const knownFlags = new Set([
        '--workspace',
        '-w',
        '--loglevel',
        '--console',
        '--help',
        '-h',
      ]);

      let commandStartIndex = -1;
      let skipNext = false;

      for (let i = 0; i < rawArgs.length; i++) {
        const arg = rawArgs[i];

        // Type guard: skip if arg is undefined
        if (!arg) {
          continue;
        }

        // Skip this iteration if previous flag requires an argument
        if (skipNext) {
          skipNext = false;
          continue;
        }

        // Skip the 'run' command itself
        if (arg === 'run') {
          continue;
        }

        // Check if it's a known flag
        if (knownFlags.has(arg)) {
          // Flags that require arguments: --workspace, -w, --loglevel
          if (arg === '--workspace' || arg === '-w' || arg === '--loglevel') {
            skipNext = true;
          }
          continue;
        }

        // Check if it's a flag with = syntax (--workspace=/path)
        if (arg.startsWith('--') && arg.includes('=')) {
          const flagName = arg.split('=')[0];
          if (flagName && knownFlags.has(flagName)) {
            continue;
          }
        }

        // Check if it's a boolean flag (--debug, --no-debug)
        if (arg.startsWith('--') || arg.startsWith('-')) {
          // Could be an unknown flag or part of the command
          // To be safe, assume this is the start of the command
          commandStartIndex = i;
          break;
        }

        // Found first non-flag argument - this is the command
        commandStartIndex = i;
        break;
      }

      if (commandStartIndex === -1) {
        throw new Error(
          'run command requires a language server command\n' +
            'Examples:\n' +
            '  symbols run typescript-language-server --stdio\n' +
            '  symbols run --workspace /path pyright-langserver --stdio\n' +
            '  symbols run -- typescript-language-server --stdio'
        );
      }

      commandParts = rawArgs.slice(commandStartIndex);
    }

    if (commandParts.length === 0) {
      throw new Error(
        'run command requires a language server command\n' +
          'Examples:\n' +
          '  symbols run typescript-language-server --stdio\n' +
          '  symbols run --workspace /path pyright-langserver --stdio\n' +
          '  symbols run -- typescript-language-server --stdio'
      );
    }

    const [commandName, ...commandArgs] = commandParts;

    return {
      command: 'run',
      workspace: argv.workspace,
      loglevel: argv.loglevel,
      console: Boolean(argv.console),
      directCommand: { commandName, commandArgs },
    } as RunCommandArgs;
  }

  // Handle 'start' command
  if (command === 'start') {
    return {
      command: 'start',
      workspace: argv.workspace,
      lsp: argv.lsp,
      loglevel: argv.loglevel,
      configPath: argv.config,
      console: Boolean(argv.console),
    } as StartCommandArgs;
  }

  // Handle 'config' command
  if (command === 'config') {
    const subcommand = argv._[1] as string;

    if (subcommand === 'init') {
      // Default to local mode if neither --global nor --local is specified
      const isGlobal = Boolean(argv.global);
      const isLocal = argv.local !== undefined ? Boolean(argv.local) : !isGlobal;

      return {
        command: 'config',
        subcommandArgs: {
          subcommand: 'init',
          global: isGlobal,
          local: isLocal,
          workspace: argv.workspace,
          force: Boolean(argv.force),
        },
      } as ConfigCommandArgs;
    }

    if (subcommand === 'show') {
      return {
        command: 'config',
        subcommandArgs: {
          subcommand: 'show',
          configPath: argv.config,
          workspace: argv.workspace,
          format: (argv.format as 'yaml' | 'json') || 'yaml',
        },
      } as ConfigCommandArgs;
    }

    if (subcommand === 'path') {
      return {
        command: 'config',
        subcommandArgs: {
          subcommand: 'path',
          workspace: argv.workspace,
          all: Boolean(argv.all),
        },
      } as ConfigCommandArgs;
    }
  }

  // No command or unknown command
  return {
    command: null,
    help: Boolean(argv.help),
  } as BaseCliArgs;
}

/**
 * Resolve configuration from start command args and environment variables
 */
export function resolveStartConfig(cliArgs: StartCommandArgs): {
  workspace: string;
  lsp?: string;
  loglevel: string;
  configPath?: string;
  console: boolean;
} {
  const lsp = cliArgs.lsp || process.env.SYMBOLS_LSP;
  const configPath = cliArgs.configPath || process.env.SYMBOLS_CONFIG_PATH;

  const result: {
    workspace: string;
    lsp?: string;
    loglevel: string;
    configPath?: string;
    console: boolean;
  } = {
    workspace:
      cliArgs.workspace || process.env.SYMBOLS_WORKSPACE || process.cwd(),
    loglevel: cliArgs.loglevel || process.env.SYMBOLS_LOGLEVEL || 'info',
    console: cliArgs.console || false,
  };

  if (lsp) {
    result.lsp = lsp;
  }

  if (configPath) {
    result.configPath = configPath;
  }

  return result;
}

/**
 * Resolve configuration from run command args and environment variables
 */
export function resolveRunConfig(cliArgs: RunCommandArgs): {
  workspace: string;
  loglevel: string;
  console: boolean;
} {
  return {
    workspace:
      cliArgs.workspace || process.env.SYMBOLS_WORKSPACE || process.cwd(),
    loglevel: cliArgs.loglevel || process.env.SYMBOLS_LOGLEVEL || 'info',
    console: cliArgs.console || false,
  };
}

/**
 * Initialize a new configuration file (config init subcommand)
 */
export function handleConfigInit(args: ConfigInitArgs): void {
  try {
    let configPath: string;
    let configDir: string;

    if (args.global) {
      // Create global config
      const paths = getAppPaths();
      configDir = paths.config;
      configPath = path.join(configDir, 'language-servers.yaml');
    } else {
      // Create local config
      const targetDir = args.workspace || process.cwd();
      configDir = targetDir;
      configPath = path.join(targetDir, 'language-servers.yaml');
    }

    // Check if file already exists
    if (fs.existsSync(configPath) && !args.force) {
      console.error(`Error: Configuration file already exists: ${configPath}`);
      console.error('Use --force to overwrite');
      process.exit(1);
    }

    // Ensure directory exists
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    // Read the default language servers configuration
    // Use relative path from current module for better reliability across different installation contexts
    const currentFilePath = fileURLToPath(import.meta.url);
    const defaultConfigPath = path.join(
      path.dirname(currentFilePath),
      '../../assets/default-language-servers.yaml'
    );
    const templateContent = fs.readFileSync(defaultConfigPath, 'utf8');

    // Write config file
    fs.writeFileSync(configPath, templateContent);

    console.log(`Configuration file created: ${configPath}`);
    console.log(
      '\nThe configuration includes TypeScript and Python Language Servers.'
    );
    console.log('You can add more LSPs or modify the configuration as needed.');
  } catch (error) {
    console.error(
      'Error creating configuration file:',
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

/**
 * Show effective configuration (config show subcommand)
 */
export function handleConfigShow(args: ConfigShowArgs): void {
  try {
    const configWithSource = loadLspConfig(args.configPath);

    if (args.format === 'json') {
      console.log(JSON.stringify(configWithSource.config, null, 2));
    } else {
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
      console.log(
        '# Use --config <file> to specify a custom configuration file'
      );
      console.log();
      console.log(yamlOutput);
    }
  } catch (error) {
    console.error(
      'Error loading configuration:',
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

/**
 * Show configuration file path (config path subcommand)
 */
export function handleConfigPath(args: ConfigPathArgs): void {
  const workspace = args.workspace || process.cwd();
  const paths = getAppPaths();

  const possiblePaths = [
    {
      name: 'Local workspace config',
      path: path.join(workspace, 'language-servers.yaml'),
    },
    {
      name: 'Global config',
      path: path.join(paths.config, 'language-servers.yaml'),
    },
  ];

  if (args.all) {
    console.log('Configuration file locations:\n');
    for (const { name, path: configPath } of possiblePaths) {
      const exists = fs.existsSync(configPath);
      const status = exists ? '✓ EXISTS' : '✗ NOT FOUND';
      console.log(`${name}:`);
      console.log(`  ${status}: ${configPath}`);
      console.log();
    }
  } else {
    // Show only the active config path
    for (const { path: configPath } of possiblePaths) {
      if (fs.existsSync(configPath)) {
        console.log(configPath);
        return;
      }
    }
    console.log('No configuration file found');
    console.log('Use "symbols config init" to create one');
  }
}
