# Configuration Examples

This directory contains example configuration files for the symbols MCP server. Each configuration focuses on a single language to make it easy to understand, test, and customize.

## Quick Start

1. Copy one of the configuration files to your project root as `language-servers.yaml`
2. Modify paths and commands as needed for your environment
3. Run symbols: `symbols --workspace /path/to/your/project`

## Available Configurations

### Single Language Configurations

- **[typescript.yaml](configs/typescript.yaml)** - TypeScript/JavaScript projects
- **[pyright.yaml](configs/pyright.yaml)** - Python projects with Pyright
- **[csharp.yaml](configs/csharp.yaml)** - C#/.NET projects
- **[go.yaml](configs/go.yaml)** - Go projects with gopls
- **[rust.yaml](configs/rust.yaml)** - Rust projects with rust-analyzer

## Configuration Structure

Each configuration file follows this basic structure:

```yaml
language-servers:
  <lsp-name>:
    command: '<command-to-start-lsp-server>'
    extensions: # Optional - merged with built-in defaults
      '<file-extension>': '<language-id>'
    workspace_files:
      - '<project-files-that-indicate-this-language>'
    diagnostics:
      strategy: 'push | pull'
      wait_timeout_ms: <timeout-in-milliseconds> # only applies to push diagnostics
    symbols:
      max_depth: <number-or-null>
      kinds: [] # Empty array means all symbol kinds
    environment: # Optional
      <ENV_VAR>: '<value>' # Supports $VAR and ${VAR} expansion
    workspace_loader: '<custom-loader>' # Optional
```

### Extension Mappings

The `extensions` field is **optional** and **merged with built-in defaults**:

- **Default behavior**: All common file extensions (`.js`, `.ts`, `.py`, `.go`, `.rs`, `.cs`, etc.) are pre-mapped
- **When to specify**: Only add `extensions` when you need custom mappings or want to override defaults
- **Merging**: Your extensions are merged with defaults - you don't lose any defaults by specifying extensions
- **Override**: Your custom extensions take precedence over defaults when there's a conflict

**Example - No extensions needed:**
```yaml
language-servers:
  typescript:
    command: typescript-language-server --stdio
    # No extensions field - all defaults (.ts, .js, .tsx, .jsx, etc.) work automatically!
```

**Example - Adding custom extensions:**
```yaml
language-servers:
  typescript:
    command: typescript-language-server --stdio
    extensions:
      '.config.ts': 'typescript'  # Add custom extension
      # All defaults (.ts, .js, .tsx, etc.) still work!
```

The list of allowed language id can be found [here](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#:~:text=use%20those%20ids.-,Language,-Identifier)

## Environment Variable Expansion

Configuration values support environment variable expansion using both `$VAR` and `${VAR}` syntax:

```yaml
language-servers:
  go:
    command: 'gopls'
    environment:
      GOPATH: '$HOME/go' # Expands to /home/username/go
      GOCACHE: '${HOME}/.cache/go' # Expands to /home/username/.cache/go
      CUSTOM_PATH: '$HOME/custom/${USER}/path' # Mixed expansion
```

**Supported locations:**

- `command` field - for executable paths that include environment variables
- `environment` section - for setting environment variables passed to the LSP server

**Examples:**

- `$HOME` → `/home/username`
- `${USER}` → `username`
- `$HOME/.cache` → `/home/username/.cache`
- If a variable doesn't exist, the original text is kept unchanged

## Language Server Requirements

Make sure you have the appropriate language servers installed:

- **TypeScript**: `npm install -g typescript-language-server typescript`
- **Python**: `npm install -g pyright` or `pip install pyright`
- **Go**: `go install golang.org/x/tools/gopls@latest`
- **Rust**: `rustup component add rust-analyzer`
- **C#**: Download from [Microsoft.CodeAnalysis.LanguageServer releases](https://github.com/dotnet/roslyn/releases)

## Usage Examples

```bash
# Use a specific configuration
symbols --config examples/configs/typescript-only.yaml --workspace /path/to/project

# Copy and customize
cp examples/configs/pyright.yaml language-servers.yaml
# Edit language-servers.yaml as needed
symbols --workspace /path/to/project

# Check what configuration is active
symbols --show-config
```

## Testing Configurations

You can test any configuration file before using it:

```bash
# Validate the configuration loads correctly
symbols --show-config --config examples/configs/typescript.yaml

# Test with a specific workspace
symbols --show-config --config examples/configs/rust.yaml --workspace /path/to/rust/project
```

Multi-language configurations can be created by combining these single-language examples once you've tested each language server individually.
