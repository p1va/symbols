/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseCliArgs } from '../../src/utils/cli.js';
import type {
  RunCommandArgs,
  StartCommandArgs,
  ConfigCommandArgs,
} from '../../src/utils/cli.js';

// Mock dependencies
vi.mock('../../src/config/lsp-config.js', () => ({
  listAvailableLsps: vi.fn(() => ['typescript', 'python', 'go', 'rust']),
  loadLspConfig: vi.fn(() => ({
    config: { languageServers: {} },
    source: { description: 'test', path: 'test' },
  })),
}));

vi.mock('../../src/utils/logger.js', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock fs to make workspace and config validation pass
vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    existsSync: vi.fn(() => true), // All paths "exist"
    statSync: vi.fn((filePath: string) => {
      // Config files (*.yaml, *.yml) are files, everything else is a directory
      const isConfigFile = typeof filePath === 'string' &&
        (filePath.endsWith('.yaml') || filePath.endsWith('.yml'));
      return {
        isDirectory: () => !isConfigFile,
        isFile: () => isConfigFile,
      };
    }),
  };
});

// Mock app-paths
vi.mock('../../src/utils/app-paths.js', () => ({
  getAppPaths: vi.fn(() => ({
    config: '/mock/.config/symbols',
    data: '/mock/.local/share/symbols',
    globalConfigDir: '/mock/.config/symbols',
  })),
}));

// Mock process.exit to throw instead of exiting
vi.spyOn(process, 'exit').mockImplementation((code) => {
  throw new Error(`process.exit(${code})`);
});

describe('CLI Argument Parsing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('run command', () => {
    describe('basic parsing', () => {
      it('should parse basic run command', () => {
        const result = parseCliArgs(['node', 'symbols', 'run', 'gopls']);

        expect(result.command).toBe('run');
        if (result.command === 'run') {
          const runResult = result as RunCommandArgs;
          expect(runResult.directCommand.commandName).toBe('gopls');
          expect(runResult.directCommand.commandArgs).toEqual([]);
        }
      });

      it('should parse run command with LSP arguments', () => {
        const result = parseCliArgs([
          'node',
          'symbols',
          'run',
          'typescript-language-server',
          '--stdio',
        ]);

        if (result.command === 'run') {
          expect(result.directCommand.commandName).toBe(
            'typescript-language-server'
          );
          expect(result.directCommand.commandArgs).toEqual(['--stdio']);
        }
      });

      it('should parse run command with multiple LSP arguments', () => {
        const result = parseCliArgs([
          'node',
          'symbols',
          'run',
          'rust-analyzer',
          '--stdio',
          '--log-level',
          'debug',
        ]);

        if (result.command === 'run') {
          expect(result.directCommand.commandName).toBe('rust-analyzer');
          expect(result.directCommand.commandArgs).toEqual([
            '--stdio',
            '--log-level',
            'debug',
          ]);
        }
      });
    });

    describe('with -- delimiter', () => {
      it('should parse run command with -- delimiter', () => {
        const result = parseCliArgs([
          'node',
          'symbols',
          'run',
          '--',
          'typescript-language-server',
          '--stdio',
        ]);

        if (result.command === 'run') {
          expect(result.directCommand.commandName).toBe(
            'typescript-language-server'
          );
          expect(result.directCommand.commandArgs).toEqual(['--stdio']);
        }
      });

      it('should parse run with symbols flags before -- delimiter', () => {
        const result = parseCliArgs([
          'node',
          'symbols',
          'run',
          '--workspace',
          '/path',
          '--',
          'gopls',
        ]);

        if (result.command === 'run') {
          expect(result.workspace).toBe('/path');
          expect(result.directCommand.commandName).toBe('gopls');
          expect(result.directCommand.commandArgs).toEqual([]);
        }
      });

      it('should treat everything after -- as LSP command', () => {
        const result = parseCliArgs([
          'node',
          'symbols',
          'run',
          '--',
          'gopls',
          '--workspace',
          '/some/other/path',
        ]);

        if (result.command === 'run') {
          // --workspace after -- belongs to gopls, not symbols
          expect(result.workspace).toBeUndefined();
          expect(result.directCommand.commandName).toBe('gopls');
          expect(result.directCommand.commandArgs).toEqual([
            '--workspace',
            '/some/other/path',
          ]);
        }
      });
    });

    describe('workspace flag variations', () => {
      it('should parse --workspace flag before command', () => {
        const result = parseCliArgs([
          'node',
          'symbols',
          'run',
          '--workspace',
          '/path/to/project',
          'gopls',
        ]);

        if (result.command === 'run') {
          expect(result.workspace).toBe('/path/to/project');
          expect(result.directCommand.commandName).toBe('gopls');
        }
      });

      it('should parse -w short flag', () => {
        const result = parseCliArgs([
          'node',
          'symbols',
          'run',
          '-w',
          '/path',
          'gopls',
        ]);

        if (result.command === 'run') {
          expect(result.workspace).toBe('/path');
          expect(result.directCommand.commandName).toBe('gopls');
        }
      });

      it('should parse --workspace= syntax', () => {
        const result = parseCliArgs([
          'node',
          'symbols',
          'run',
          '--workspace=/path/to/project',
          'gopls',
        ]);

        if (result.command === 'run') {
          expect(result.workspace).toBe('/path/to/project');
          expect(result.directCommand.commandName).toBe('gopls');
        }
      });

      it('should handle path with spaces in workspace', () => {
        const result = parseCliArgs([
          'node',
          'symbols',
          'run',
          '--workspace=/path/with spaces',
          'gopls',
        ]);

        if (result.command === 'run') {
          expect(result.workspace).toBe('/path/with spaces');
          expect(result.directCommand.commandName).toBe('gopls');
        }
      });

      it('should handle path with equals sign', () => {
        const result = parseCliArgs([
          'node',
          'symbols',
          'run',
          '--workspace=/path/with=equals',
          'gopls',
        ]);

        if (result.command === 'run') {
          expect(result.workspace).toBe('/path/with=equals');
          expect(result.directCommand.commandName).toBe('gopls');
        }
      });
    });

    describe('loglevel flag', () => {
      it('should parse --loglevel flag', () => {
        const result = parseCliArgs([
          'node',
          'symbols',
          'run',
          '--loglevel',
          'debug',
          'gopls',
        ]);

        if (result.command === 'run') {
          expect(result.loglevel).toBe('debug');
          expect(result.directCommand.commandName).toBe('gopls');
        }
      });

      it('should parse --loglevel= syntax', () => {
        const result = parseCliArgs([
          'node',
          'symbols',
          'run',
          '--loglevel=error',
          'gopls',
        ]);

        if (result.command === 'run') {
          expect(result.loglevel).toBe('error');
          expect(result.directCommand.commandName).toBe('gopls');
        }
      });
    });

    describe('console flag', () => {
      it('should parse --console flag', () => {
        const result = parseCliArgs([
          'node',
          'symbols',
          'run',
          '--console',
          'gopls',
        ]);

        if (result.command === 'run') {
          expect(result.console).toBe(true);
          expect(result.directCommand.commandName).toBe('gopls');
        }
      });

      it('should default console to false when not specified', () => {
        const result = parseCliArgs(['node', 'symbols', 'run', 'gopls']);

        if (result.command === 'run') {
          expect(result.console).toBe(false);
        }
      });
    });

    describe('multiple flags combined', () => {
      it('should parse multiple flags with different syntaxes', () => {
        const result = parseCliArgs([
          'node',
          'symbols',
          'run',
          '--workspace=/path/to/project',
          '--loglevel',
          'debug',
          '--console',
          'rust-analyzer',
          '--stdio',
        ]);

        if (result.command === 'run') {
          expect(result.workspace).toBe('/path/to/project');
          expect(result.loglevel).toBe('debug');
          expect(result.console).toBe(true);
          expect(result.directCommand.commandName).toBe('rust-analyzer');
          expect(result.directCommand.commandArgs).toEqual(['--stdio']);
        }
      });

      it('should parse flags in different order', () => {
        const result = parseCliArgs([
          'node',
          'symbols',
          'run',
          '--console',
          '-w',
          '/path',
          '--loglevel=info',
          'gopls',
          'serve',
        ]);

        if (result.command === 'run') {
          expect(result.workspace).toBe('/path');
          expect(result.loglevel).toBe('info');
          expect(result.console).toBe(true);
          expect(result.directCommand.commandName).toBe('gopls');
          expect(result.directCommand.commandArgs).toEqual(['serve']);
        }
      });
    });

    describe('error cases', () => {
      it('should throw error when no command provided', () => {
        expect(() => {
          parseCliArgs(['node', 'symbols', 'run']);
        }).toThrow(/run command requires a language server command/);
      });

      it('should throw error when only flags provided', () => {
        expect(() => {
          parseCliArgs(['node', 'symbols', 'run', '--workspace', '/path']);
        }).toThrow(/run command requires a language server command/);
      });

      it('should throw error when -- delimiter with no command', () => {
        expect(() => {
          parseCliArgs(['node', 'symbols', 'run', '--']);
        }).toThrow(/run command requires a language server command/);
      });
    });

    describe('edge cases', () => {
      it('should handle unknown flags as part of LSP command', () => {
        const result = parseCliArgs([
          'node',
          'symbols',
          'run',
          '--unknown-flag',
          'value',
        ]);

        if (result.command === 'run') {
          // Unknown flags should be treated as the start of the LSP command
          expect(result.directCommand.commandName).toBe('--unknown-flag');
          expect(result.directCommand.commandArgs).toEqual(['value']);
        }
      });

      it('should pass --help to LSP when using -- delimiter', () => {
        const result = parseCliArgs([
          'node',
          'symbols',
          'run',
          '--',
          'gopls',
          '--help',
        ]);

        if (result.command === 'run') {
          expect(result.directCommand.commandName).toBe('gopls');
          expect(result.directCommand.commandArgs).toEqual(['--help']);
        }
      });

      it('should handle LSP command with dashes', () => {
        const result = parseCliArgs([
          'node',
          'symbols',
          'run',
          'typescript-language-server',
          '--stdio',
        ]);

        if (result.command === 'run') {
          expect(result.directCommand.commandName).toBe(
            'typescript-language-server'
          );
          expect(result.directCommand.commandArgs).toEqual(['--stdio']);
        }
      });
    });
  });

  describe('start command', () => {
    it('should parse basic start command', () => {
      const result = parseCliArgs(['node', 'symbols', 'start']);

      expect(result.command).toBe('start');
    });

    it('should parse start with --lsp flag', () => {
      const result = parseCliArgs([
        'node',
        'symbols',
        'start',
        '--lsp',
        'typescript',
      ]);

      expect(result.command).toBe('start');
      if (result.command === 'start') {
        expect(result.lsp).toBe('typescript');
      }
    });

    it('should parse start with --workspace flag', () => {
      const result = parseCliArgs([
        'node',
        'symbols',
        'start',
        '--workspace',
        '/path/to/project',
      ]);

      if (result.command === 'start') {
        expect(result.workspace).toBe('/path/to/project');
      }
    });

    it('should parse start with --config flag', () => {
      const result = parseCliArgs([
        'node',
        'symbols',
        'start',
        '--config',
        '/path/to/config.yaml',
      ]);

      if (result.command === 'start') {
        expect(result.configPath).toBe('/path/to/config.yaml');
      }
    });

    it('should parse start with --loglevel flag', () => {
      const result = parseCliArgs([
        'node',
        'symbols',
        'start',
        '--loglevel',
        'debug',
      ]);

      if (result.command === 'start') {
        expect(result.loglevel).toBe('debug');
      }
    });

    it('should parse start with --console flag', () => {
      const result = parseCliArgs([
        'node',
        'symbols',
        'start',
        '--console',
      ]);

      if (result.command === 'start') {
        expect(result.console).toBe(true);
      }
    });

    it('should parse start with multiple flags', () => {
      const result = parseCliArgs([
        'node',
        'symbols',
        'start',
        '--lsp',
        'python',
        '--workspace',
        '/project',
        '--config',
        '/config.yaml',
        '--loglevel',
        'info',
        '--console',
      ]);

      if (result.command === 'start') {
        expect(result.lsp).toBe('python');
        expect(result.workspace).toBe('/project');
        expect(result.configPath).toBe('/config.yaml');
        expect(result.loglevel).toBe('info');
        expect(result.console).toBe(true);
      }
    });

    it('should parse start with -w short flag', () => {
      const result = parseCliArgs([
        'node',
        'symbols',
        'start',
        '-w',
        '/path',
      ]);

      if (result.command === 'start') {
        expect(result.workspace).toBe('/path');
      }
    });

    it('should default console to false when not specified', () => {
      const result = parseCliArgs(['node', 'symbols', 'start']);

      if (result.command === 'start') {
        expect(result.console).toBe(false);
      }
    });
  });

  describe('config command', () => {
    describe('config init', () => {
      it('should parse config init', () => {
        const result = parseCliArgs(['node', 'symbols', 'config', 'init']);

        expect(result.command).toBe('config');
        if (result.command === 'config') {
          expect(result.subcommandArgs.subcommand).toBe('init');
        }
      });

      it('should reject --global due to conflict with --local default', () => {
        // NOTE: There's a CLI configuration issue where --local defaults to true
        // and --global conflicts with --local, causing this combination to fail.
        // This test documents the current behavior.
        expect(() => {
          parseCliArgs([
            'node',
            'symbols',
            'config',
            'init',
            '--global',
          ]);
        }).toThrow('process.exit(1)');
      });

      it('should parse config init --local', () => {
        const result = parseCliArgs([
          'node',
          'symbols',
          'config',
          'init',
          '--local',
        ]);

        if (result.command === 'config') {
          const subArgs = result.subcommandArgs;
          if (subArgs.subcommand === 'init') {
            expect(subArgs.local).toBe(true);
          }
        }
      });

      it('should parse config init --force', () => {
        const result = parseCliArgs([
          'node',
          'symbols',
          'config',
          'init',
          '--force',
        ]);

        if (result.command === 'config') {
          const subArgs = result.subcommandArgs;
          if (subArgs.subcommand === 'init') {
            expect(subArgs.force).toBe(true);
          }
        }
      });

      it('should parse config init with --workspace', () => {
        const result = parseCliArgs([
          'node',
          'symbols',
          'config',
          'init',
          '--workspace',
          '/custom/path',
        ]);

        if (result.command === 'config') {
          const subArgs = result.subcommandArgs;
          if (subArgs.subcommand === 'init') {
            expect(subArgs.workspace).toBe('/custom/path');
          }
        }
      });

      it('should parse config init with --local and --force', () => {
        // Using --local (default) with --force works fine
        const result = parseCliArgs([
          'node',
          'symbols',
          'config',
          'init',
          '--local',
          '--force',
        ]);

        if (result.command === 'config') {
          const subArgs = result.subcommandArgs;
          if (subArgs.subcommand === 'init') {
            expect(subArgs.local).toBe(true);
            expect(subArgs.force).toBe(true);
          }
        }
      });

      it('should default local to true', () => {
        const result = parseCliArgs(['node', 'symbols', 'config', 'init']);

        if (result.command === 'config') {
          const subArgs = result.subcommandArgs;
          if (subArgs.subcommand === 'init') {
            expect(subArgs.local).toBe(true);
          }
        }
      });
    });

    describe('config show', () => {
      it('should parse config show', () => {
        const result = parseCliArgs(['node', 'symbols', 'config', 'show']);

        expect(result.command).toBe('config');
        if (result.command === 'config') {
          expect(result.subcommandArgs.subcommand).toBe('show');
        }
      });

      it('should parse config show --format json', () => {
        const result = parseCliArgs([
          'node',
          'symbols',
          'config',
          'show',
          '--format',
          'json',
        ]);

        if (result.command === 'config') {
          const subArgs = result.subcommandArgs;
          if (subArgs.subcommand === 'show') {
            expect(subArgs.format).toBe('json');
          }
        }
      });

      it('should parse config show --format yaml', () => {
        const result = parseCliArgs([
          'node',
          'symbols',
          'config',
          'show',
          '--format',
          'yaml',
        ]);

        if (result.command === 'config') {
          const subArgs = result.subcommandArgs;
          if (subArgs.subcommand === 'show') {
            expect(subArgs.format).toBe('yaml');
          }
        }
      });

      it('should parse config show with --config', () => {
        const result = parseCliArgs([
          'node',
          'symbols',
          'config',
          'show',
          '--config',
          '/path/to/config.yaml',
        ]);

        if (result.command === 'config') {
          const subArgs = result.subcommandArgs;
          if (subArgs.subcommand === 'show') {
            expect(subArgs.configPath).toBe('/path/to/config.yaml');
          }
        }
      });

      it('should parse config show with --workspace', () => {
        const result = parseCliArgs([
          'node',
          'symbols',
          'config',
          'show',
          '--workspace',
          '/project',
        ]);

        if (result.command === 'config') {
          const subArgs = result.subcommandArgs;
          if (subArgs.subcommand === 'show') {
            expect(subArgs.workspace).toBe('/project');
          }
        }
      });
    });

    describe('config path', () => {
      it('should parse config path', () => {
        const result = parseCliArgs(['node', 'symbols', 'config', 'path']);

        expect(result.command).toBe('config');
        if (result.command === 'config') {
          expect(result.subcommandArgs.subcommand).toBe('path');
        }
      });

      it('should parse config path --all', () => {
        const result = parseCliArgs([
          'node',
          'symbols',
          'config',
          'path',
          '--all',
        ]);

        if (result.command === 'config') {
          const subArgs = result.subcommandArgs;
          if (subArgs.subcommand === 'path') {
            expect(subArgs.all).toBe(true);
          }
        }
      });

      it('should parse config path with --workspace', () => {
        const result = parseCliArgs([
          'node',
          'symbols',
          'config',
          'path',
          '--workspace',
          '/project',
        ]);

        if (result.command === 'config') {
          const subArgs = result.subcommandArgs;
          if (subArgs.subcommand === 'path') {
            expect(subArgs.workspace).toBe('/project');
          }
        }
      });
    });
  });

  describe('no command', () => {
    it('should exit with error when no command provided', () => {
      // yargs enforces that a command must be specified
      // When no command is provided, it calls process.exit(1)
      expect(() => {
        parseCliArgs(['node', 'symbols']);
      }).toThrow('process.exit(1)');
    });
  });

  describe('type safety', () => {
    it('should allow proper type narrowing for run command', () => {
      const result = parseCliArgs(['node', 'symbols', 'run', 'gopls']);

      if (result.command === 'run') {
        // TypeScript should know this is RunCommandArgs
        const runArgs: RunCommandArgs = result;
        expect(runArgs.directCommand).toBeDefined();
        expect(runArgs.directCommand.commandName).toBe('gopls');
      } else {
        throw new Error('Expected run command');
      }
    });

    it('should allow proper type narrowing for start command', () => {
      const result = parseCliArgs([
        'node',
        'symbols',
        'start',
        '--lsp',
        'typescript',
      ]);

      if (result.command === 'start') {
        // TypeScript should know this is StartCommandArgs
        const startArgs: StartCommandArgs = result;
        expect(startArgs.lsp).toBe('typescript');
      } else {
        throw new Error('Expected start command');
      }
    });

    it('should allow proper type narrowing for config command', () => {
      const result = parseCliArgs(['node', 'symbols', 'config', 'init']);

      if (result.command === 'config') {
        // TypeScript should know this is ConfigCommandArgs
        const configArgs: ConfigCommandArgs = result;
        expect(configArgs.subcommandArgs.subcommand).toBe('init');
      } else {
        throw new Error('Expected config command');
      }
    });
  });
});
