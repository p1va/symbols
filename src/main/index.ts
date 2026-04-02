import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  parseCliArgs,
  handleConfigInit,
  handleConfigPath,
  handleConfigShow,
  ConfigCommandArgs,
  RunCommandArgs,
  StartCommandArgs,
} from '../utils/cli.js';
import logger from '../utils/logger.js';
import { createServer } from './create-server.js';
import { createLspManager } from '../runtime/lsp-manager.js';
import { setupShutdown } from './shutdown.js';

/**
 * Main entry point - routes commands and starts appropriate handlers
 */
export async function main(): Promise<void> {
  logger.debug('MCP server starting up');

  const cliArgs = parseCliArgs();
  logger.debug('Parsed CLI arguments', { command: cliArgs.command });

  if (cliArgs.command === 'config') {
    const configArgs = cliArgs as ConfigCommandArgs;
    if (configArgs.subcommandArgs.subcommand === 'init') {
      handleConfigInit(configArgs.subcommandArgs);
      process.exit(0);
    } else if (configArgs.subcommandArgs.subcommand === 'show') {
      handleConfigShow(configArgs.subcommandArgs);
      process.exit(0);
    } else if (configArgs.subcommandArgs.subcommand === 'path') {
      handleConfigPath(configArgs.subcommandArgs);
      process.exit(0);
    }
  }

  const manager = createLspManager();

  if (cliArgs.command === 'start') {
    await manager.configureForStart(cliArgs as StartCommandArgs);
  } else if (cliArgs.command === 'run') {
    await manager.configureForRun(cliArgs as RunCommandArgs);
  } else {
    console.error('Please specify a command: start, run, or config');
    console.error('Run "symbols --help" for usage information');
    process.exit(1);
  }

  const managerStatus = manager.getStatus();
  logger.info('Symbols manager configured', {
    state: managerStatus.state,
    mode: managerStatus.mode,
    workspacePath: managerStatus.workspacePath,
    configPath: managerStatus.configPath,
    defaultProfile: managerStatus.defaultProfileName,
    profileCount: managerStatus.profiles.length,
    issues: managerStatus.issues,
  });

  const server = createServer(manager);
  setupShutdown(server, manager);

  logger.debug('Starting MCP server transport');
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('MCP server ready');
}
