# CLI Refactoring Plan

## Problem Statement

The current CLI has two execution modes mixed together:
1. **Direct command mode**: Run a specific LSP command directly (uses `-- <command>`)
2. **Auto-detection mode**: Start server with configuration and auto-detection

This creates ambiguity where some flags are valid in one mode but not another, leading to confusion.

## Solution: Explicit Subcommands

Introduce three top-level subcommands with clear responsibilities:

### 1. `symbols start` - Auto-detection/Configuration Mode
- Starts MCP server with LSP auto-detection or configuration
- Accepts: `--config`, `--lsp`, `--workspace`, `--loglevel`, `--debug`
- Does NOT accept: `-- <command>`

### 2. `symbols run` - Direct Command Mode
- Runs an LSP directly with a custom command
- Accepts: `--workspace`, `--loglevel`, `--debug`, `-- <command>`
- Does NOT accept: `--config`, `--lsp`

### 3. `symbols config` - Configuration Management
- Subcommands: `init`, `show`, `path`
- Replaces `--show-config` flag with `config show` subcommand
- Only creates config files when explicitly requested

## Key Behavioral Changes

### No Auto-Creation of Config Files
- ❌ **Old**: Global config auto-created on first run
- ✅ **New**: Config files ONLY created via `symbols config init --global` or `--local`
- Server works fine with built-in defaults if no config exists

### Configuration Resolution Order
1. Command-line specified config (`--config`)
2. Local workspace config (`./language-servers.yaml` or `language-servers.yaml` in `--workspace`)
3. Global config (`~/.config/symbols/language-servers.yaml`)
4. Built-in defaults with auto-detection

### Flag Organization
- No "global flags" that don't actually apply globally
- `--debug`: Only on `start` and `run`
- `--workspace`: On `start`, `run`, and relevant `config` subcommands
- Each command shows only flags that are valid for it

## Command Structure

```
symbols
├── start [--config] [--lsp] [--workspace] [--loglevel] [--debug]
├── run [--workspace] [--loglevel] [--debug] -- <command> [args...]
└── config
    ├── init [--local|--global] [--workspace] [--force]
    ├── show [--config] [--workspace] [--format]
    └── path [--workspace] [--all]
```

## Config Init Behavior

### Single Template Approach
- `config init` generates ONE comprehensive config with all LSPs
- Includes: TypeScript, Python, C#, Go, Rust, Java
- LSPs can be enabled/disabled or commented out as needed
- No separate templates (minimal, typescript, python, etc.)

### Options
- `--local`: Create `./language-servers.yaml` in current directory (default)
- `--global`: Create `~/.config/symbols/language-servers.yaml`
- `--workspace <path>`: Target directory for local config
- `--force`: Overwrite existing config file

## Examples

```bash
# Start with auto-detection
symbols start

# Start with specific LSP
symbols start --lsp typescript --workspace ./my-project

# Run custom LSP command
symbols run -- typescript-language-server --stdio

# Run with debug logging
symbols run --debug --loglevel debug -- gopls serve

# Initialize local configuration
symbols config init --local

# Initialize global configuration
symbols config init --global

# Show effective configuration
symbols config show

# Show config for specific workspace
symbols config show --workspace /path/to/project

# Show config file location
symbols config path
```

## Migration Notes

### Breaking Changes
- No backward compatibility with old CLI syntax
- Users must update to new subcommand structure
- `--show-config` flag removed (use `config show` instead)

### Implementation Order
1. Implement command parsing for new structure
2. Implement `config init` (remove auto-creation logic)
3. Implement `config show` (migrate from `--show-config`)
4. Implement `config path`
5. Update `start` command (rename from auto-detection mode)
6. Keep `run` command logic (just move to subcommand)
7. Update documentation and examples

## Benefits

- ✅ Clear separation of execution modes
- ✅ Invalid flag combinations impossible by design
- ✅ Explicit config file creation (no surprises)
- ✅ Follows common CLI patterns (git, docker, npm)
- ✅ Easier to document and explain
- ✅ Scalable for future additions
