<div align="center">

# Symbols MCP

Read, inspect and navigate through codebase symbols by connecting to a Language Server

![NPM Version](https://img.shields.io/npm/v/%40p1va%2Fsymbols?style=flat)


</div>

## Introduction

By connecting to a Language Server of choice this MCP server makes it easy and efficent for coding agents to explore and navigate the codebase.
The server offers a minimal toolset intended to be simple to use and light on the model's context.

### Available Tools

- **`outline`**: returns a concise outline of code symbols in a given file
  - `preview: false` keeps it compact with just names and kinds
  - `preview: true` includes a code snippet with signatures, modifiers, return types...
- **`inspect`**: returns context for a given symbol. Works for both local and third-party ones (e.g. installed from npm, Nuget, ... )
  - any documentation and signature details
  - symbol declaration location with code preview
  - symbol implementation location with code preview
- **`search`**: returns matching symbols across the codebase
- **`references`**: finds all references of a symbol across the codebase
- **`rename`**: renames all references of a symbol across the codebase
- **`diagnostics`**: returns active diagnostics in a given file
- **`completion`**: returns a list of contextual completions at a given location
- **`logs`**: returns Language Server own logs for troubleshooting

## Installation

### 1. Add MCP Server

Add the MCP server to your coding agent of choice

<details>

<summary>
  &nbsp;
  <picture>
    <img src="https://img.shields.io/badge/Claude_Code-555?logo=claude" valign="middle">
  </picture>
</summary>

### Claude Code

To install the MCP server add this to your repository `.mcp.json` file

```json
{
  "mcpServers": {
    "symbols": {
      "command": "npx",
      "args": ["-y", "@p1va/symbols@latest"]
    }
  }
}
```

or

```sh
claude mcp add symbols -- npx -y @p1va/symbols@latest
```
</details>

<details>

<summary>
  &nbsp;
  <picture>
    <img src="https://img.shields.io/badge/OpenAI_Codex-%23412991?logo=openai&logoColor=white" valign="middle">
  </picture>
</summary>

### OpenAI Codex

To install the MCP server add this to your global `$HOME/.codex/config.toml` file

```toml
[mcp_servers.symbols]
command = "npx"
args = ["-y", "@p1va/symbols@latest"]
```
</details>

<details>
  
<summary>
  &nbsp;
  <picture>
    <img src="https://img.shields.io/badge/Gemini_CLI-8E75B2?logo=google%20gemini&logoColor=white" valign="middle">
  </picture>
</summary>  

### Google Gemini CLI

To install the MCP server add this to your repository `.gemini/settings.json` file

```json
{
  "mcpServers": {
    "symbols": {
      "command": "npx",
      "args": ["-y", "@p1va/symbols@latest"],
      "env": {},
      "cwd": ".",
      "timeout": 30000,
      "trust": true
    }
  }
}
```

</details>

<details>

<summary>
  &nbsp;
  <picture>
    <img src="https://img.shields.io/badge/GitHub_Copilot-8957E5?logo=github-copilot&logoColor=white" valign="middle">
  </picture>
</summary>

### GitHub Copilot

To install the MCP server add this to your repository's `.vscode/mcp.json` file

```json
{
  "servers": {
    "symbols": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@p1va/symbols@latest"]
    }
  }
}
```

</details>

### 2. Install Language Servers

Install the Language Servers relevant to your codebases

<details>
<summary>
  &nbsp;
  <picture>
    <img src="https://img.shields.io/badge/PY-3670A0?&logo=python&logoColor=ffdd54" valign="middle">
  </picture>
  &nbsp;
  <b>Pyright</b>
  &nbsp;
  (pre-installed)
</summary>

### Pyright

#### Installation

✅ This Language Server is installed as a dependecy of the MCP server and does not need installation.

#### Configuration

✅ A default configuration for this Language Server is created during startup so things *should* work out of the box.

#### Troubleshooting

If the `logs` tool output includes errors or the `diagnostics` tool only reports module import errors even when none appear in the IDE these might be signs of Pyright not detecting the virtual environment.

You can update your `pyproject.toml` to correctly point it to the virtual environment location.

```toml
[tool.pyright]
venvPath = "."
venv = ".venv"
```

</details>

<details>

<summary>
  &nbsp;
  <picture>
    <img src="https://img.shields.io/badge/TS-%23007ACC.svg?logo=typescript&logoColor=white" valign="middle">
  </picture>
  &nbsp;
  <b>TS Language Server</b>
  &nbsp;
  (pre-installed)
</summary>

### Typescript Language Server for TS and JS

#### Installation

✅ This Language Server is installed as a dependecy of the MCP server and does not need installation.

#### Configuration

✅ A default configuration for this Language Server is created during startup so things *should* work out of the box.

</details>

<details>

<summary>
  &nbsp;
  <picture>
    <img src="https://img.shields.io/badge/C%23-blueviolet?logo=dotnet" valign="middle">
  </picture>
  &nbsp;
  <b>Roslyn</b> via Nuget Feed
</summary>

### Roslyn Language Server

#### Installation

The official Csharp Language Server is distributed over the [VS IDE Nuget feed](https://pkgs.dev.azure.com/azure-public/vside/_packaging/vs-impl/nuget/v3/index.json) as a self-contained executable.

To download and extract it to an installation directory we use the `dotnet` CLI with a temporary project file named `ServerDownload.csproj` having the following content:

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <PackageNameBase>Microsoft.CodeAnalysis.LanguageServer</PackageNameBase>
    <PackageVersion>5.0.0-1.25353.13</PackageVersion>
    <RestorePackagesPath  Condition=" '$(RestorePackagesPath)' == '' ">/tmp/lsp-download</RestorePackagesPath>
    <ServerPath Condition=" '$(DownloadPath)' == '' ">./LspServer/</ServerPath>
    <TargetFramework>net9.0</TargetFramework>
    <DisableImplicitNuGetFallbackFolder>true</DisableImplicitNuGetFallbackFolder>
    <AutomaticallyUseReferenceAssemblyPackages>false</AutomaticallyUseReferenceAssemblyPackages>
    <RestoreSources>
      https://pkgs.dev.azure.com/azure-public/vside/_packaging/vs-impl/nuget/v3/index.json
    </RestoreSources>
  </PropertyGroup>
  <ItemGroup>
    <PackageDownload Include="$(PackageNameBase).$(Platform)" version="[$(PackageVersion)]" />
  </ItemGroup>
  <Target Name="SimplifyPath" AfterTargets="Restore">
    <PropertyGroup>
      <PackageIdFolderName>$(PackageNameBase.ToLower()).$(Platform.ToLower())</PackageIdFolderName>
      <PackageContentPath>$(RestorePackagesPath)/$(PackageIdFolderName)/$(PackageVersion)/content/LanguageServer/$(Platform)/</PackageContentPath>
    </PropertyGroup>
    <ItemGroup>
      <ServerFiles Include="$(PackageContentPath)**/*" />
    </ItemGroup>
    <Copy SourceFiles="@(ServerFiles)" DestinationFolder="$(ServerPath)%(RecursiveDir)" />
    <RemoveDir Directories="$(RestorePackagesPath)" />
  </Target>
</Project>
```

Then pick the platform identifier matching your machine

- `win-x64`
- `win-arm64`
- `linux-x64`
- `linux-arm64`
- `linux-musl-x64`
- `linux-musl-arm64`
- `osx-x64`
- `osx-arm64`
- `neutral`

Finally restore the temporary project to trigger the download the Language Server to `RestorePackagesPath` and extract it to its final location in  `ServerPath`.

```sh
dotnet restore ServerDownload.csproj \
  /p:Platform=YOUR-PLATFORM-ID \
  /p:RestorePackagesPath=/tmp/lsp-download \
  /p:ServerPath=$HOME/.csharp-lsp/
```

To double-check the outcome of the installation run the command below

```sh
$HOME/.csharp-lsp/Microsoft.CodeAnalysis.LanguageServer --version
```
</details>

<details>
  
<summary>
  &nbsp;
  <picture>
    <img src="https://custom-icon-badges.demolab.com/badge/C%23-0078d7.svg?logo=vsc&logoColor=white" valign="middle">
  </picture>
  &nbsp;
  <b>Roslyn</b> via C# DevKit for VSCode
</summary>

### Roslyn
x

#### Installation
x

</details>


<details>

<summary>
  &nbsp;
  <picture>
    <img src="https://img.shields.io/badge/GO-%2300ADD8.svg?logo=go&logoColor=white" valign="middle">
  </picture>
  &nbsp;
  <b>Gopls</b>
</summary>

### Gopls

#### Installation

```sh
go install golang.org/x/tools/gopls@latest
```

To double-check the outcome of the installation run the command below

```sh
gopls version
```

</details>

<details>

<summary>
  &nbsp;
  <picture>
    <img src="https://img.shields.io/badge/RS-%23000000.svg?logo=rust&logoColor=white" valign="middle">
  </picture>
  &nbsp;
  <b>Rust-analyzer</b>
</summary>

### Rust-analyzer

#### Installation

```sh
rustup component add rust-analyzer
```

To double-check the outcome of the installation run the command below

```sh
rust-analyzer --version
```

</details>

<details>
  
<summary>
  &nbsp;
  <picture>
    <img src="https://img.shields.io/badge/JV-ED8B00?logo=openjdk&logoColor=white" valign="middle">
  </picture>
  &nbsp;
  <b>Jdt.ls</b>
</summary>

### jdt.ls

x

#### Installation

x

</details>


### 3. Configuration

#### Quick Start (No Configuration Required)

For quick testing, you can run the tool without any configuration by using the `--` delimiter to specify the LSP command directly:

```bash
# TypeScript/JavaScript
npx -y @p1va/symbols@latest -- npx typescript-language-server --stdio

# Python (Pyright)
npx -y @p1va/symbols@latest -- npx pyright-langserver --stdio

# Go
npx -y @p1va/symbols@latest -- gopls

# Rust
npx -y @p1va/symbols@latest -- rust-analyzer

# Specify workspace and log level (the only options allowed with --)
npx -y @p1va/symbols@latest --workspace /path/to/project --loglevel debug -- gopls
```

This mode uses universal file extension mappings that work with all LSP servers. Perfect for trying out the tool before creating a configuration file!

**Note:** When using `--`, only `--workspace` and `--loglevel` options are allowed. The `--lsp`, `--config`, and `--show-config` options are incompatible with direct command mode since it bypasses configuration files.

#### Advanced Configuration

For production use, a YAML config file gives you full control over LSP configuration.
A default global one is created on first run and includes Typescript and Python.

Config can be set globally, loaded from the current working directory or explicitly passed with a command line argument.

- **Global** config file is created on the first run and includes Typescript and Python by default
  - Linux: `~/.config/symbols-nodejs/language-servers.yaml`
  - MacOS: `~/Library/Preferences/symbols-nodejs/language-servers.yaml`
  - Windows: `%APPDATA%\symbols-nodejs\Config\language-servers.yaml`
- **Workspace** level config file is searched with the name `language-servers.y(a)ml`
- **Override** via CLI arg `npx -y @p1va/symbols@latest --config path/to/language-servers.yaml`

Run `npx -y @p1va/symbols@latest --show-config` to inspect the active config.

#### Environment Variables

The MCP server supports environment variables for configuration. All variables use the `SYMBOLS_` prefix to clearly separate MCP server configuration from LSP-specific environment variables.

**MCP Server Configuration** (apply globally to the MCP server):

- `SYMBOLS_WORKSPACE` - Workspace directory path (defaults to current directory)
- `SYMBOLS_LSP` - LSP server name to use (overrides auto-detection)
- `SYMBOLS_LOGLEVEL` - Log level: `debug`, `info`, `warn`, or `error` (defaults to `info`)
- `SYMBOLS_CONFIG_PATH` - Path to configuration file

**LSP-Specific Configuration** (apply to the active LSP server):

- `SYMBOLS_WORKSPACE_LOADER` - Workspace loader type: `default`, `csharp`, etc.
- `SYMBOLS_DIAGNOSTICS_STRATEGY` - Diagnostics strategy: `push` or `pull` (defaults to `push`)
- `SYMBOLS_DIAGNOSTICS_WAIT_TIMEOUT` - Diagnostics wait timeout in milliseconds (100-30000, defaults to 2000)
- `SYMBOLS_PRELOAD_FILES` - Colon-separated (Unix) or semicolon-separated (Windows) list of files to preload during initialization

Configuration precedence: **Environment Variables** > **YAML Config** > **Defaults**

Example:
```bash
# Set diagnostics to pull mode with extended timeout
export SYMBOLS_DIAGNOSTICS_STRATEGY=pull
export SYMBOLS_DIAGNOSTICS_WAIT_TIMEOUT=5000

# Use C# workspace loader
export SYMBOLS_WORKSPACE_LOADER=csharp

# Preload specific files (Unix/Linux/macOS - use : as delimiter)
export SYMBOLS_PRELOAD_FILES="src/index.ts:src/types.ts:src/utils.ts"

# Preload specific files (Windows - use ; as delimiter)
# set SYMBOLS_PRELOAD_FILES=src\index.ts;src\types.ts;src\utils.ts

# Start the MCP server
npx -y @p1va/symbols@latest
```

## Development

- `pnpm lint` outputs the lint violations
- `pnpm lint:fix` attempts to fix lint violations
- `pnpm format` formats the codebase
- `pnpm dev` starts in development mode
- `pnpm build` runs the linter and build
- `pnpm start` starts the built artifacts
- `pnpm test:unit` runs the unit tests
- `pnpm test:integration:{language id}` runs the integration tests for a given language

