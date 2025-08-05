/**
 * Command-line argument parsing utilities
 */

export interface CliArgs {
  workspace?: string;
  lsp?: string;
  loglevel?: string;
  help?: boolean;
}

/**
 * Parse command-line arguments
 */
export function parseCliArgs(args: string[] = process.argv): CliArgs {
  const parsed: CliArgs = {};
  
  for (let i = 2; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--workspace':
        if (i + 1 < args.length) {
          const value = args[++i];
          if (value) {
            parsed.workspace = value;
          }
        }
        break;
        
      case '--lsp':
        if (i + 1 < args.length) {
          const value = args[++i];
          if (value) {
            parsed.lsp = value;
          }
        }
        break;
        
      case '--loglevel':
        if (i + 1 < args.length) {
          const value = args[++i];
          if (value) {
            parsed.loglevel = value;
          }
        }
        break;
        
      case '--help':
      case '-h':
        parsed.help = true;
        break;
        
      default:
        // Ignore unknown arguments
        break;
    }
  }
  
  return parsed;
}

/**
 * Show help information
 */
export function showHelp(): void {
  console.log(`
MCP Symbols Server - Language Server Protocol integration for Claude Code

Usage:
  node dist/index.js [options]

Options:
  --workspace <path>    Workspace directory path (default: current directory)
  --lsp <name>         LSP server to use (auto-detected if not specified)
  --loglevel <level>   Log level: debug, info, warn, error (default: info)
  --help, -h           Show this help message

Environment Variables:
  SYMBOLS_WORKSPACE    Workspace directory path
  SYMBOLS_LSP          LSP server name
  LOGLEVEL             Log level

LSP Auto-detection:
  - TypeScript: package.json, tsconfig.json
  - Python: pyproject.toml, requirements.txt, setup.py
  - Go: go.mod, go.work
  - C#: *.sln, *.csproj, global.json

Examples:
  node dist/index.js --workspace /path/to/python/project
  node dist/index.js --lsp pyright --workspace /path/to/project
  node dist/index.js --loglevel debug
`);
}

/**
 * Resolve configuration from CLI args, environment variables, and defaults
 */
export function resolveConfig(cliArgs: CliArgs): {
  workspace: string;
  lsp?: string;
  loglevel: string;
} {
  const lsp = cliArgs.lsp || process.env.SYMBOLS_LSP;
  const result: { workspace: string; lsp?: string; loglevel: string } = {
    workspace: cliArgs.workspace || process.env.SYMBOLS_WORKSPACE || process.cwd(),
    loglevel: cliArgs.loglevel || process.env.LOGLEVEL || 'info'
  };
  
  if (lsp) {
    result.lsp = lsp;
  }
  
  return result;
}