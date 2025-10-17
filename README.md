<div align="center">

# Symbols MCP

Read, inspect and navigate through codebase symbols by connecting to a Language Server

![NPM Version](https://img.shields.io/npm/v/%40p1va%2Fsymbols?style=flat)


</div>

## Introduction

By connecting to a Language Server of choice this MCP server makes it easy and efficient for coding agents to explore and navigate the codebase and its dependencies.
The server offers a minimal toolset intended to be simple to use and light on the model's context. Language Server configuration is kept in a dedicated file to keep MCP settings clean.

### Available Tools

- **`outline`**: returns a concise outline of code symbols in a given file
  - `preview: false` keeps it compact with just names and kinds
  - `preview: true` includes a code snippet with signatures, modifiers, return types...
- **`inspect`**: returns context for a given symbol. Works for both local and third-party ones (e.g. installed from npm, NuGet, ... )
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

✅ This Language Server is installed as a dependency of the MCP server and does not need installation.

#### Configuration

✅ A default configuration for this Language Server is created during startup so things *should* just work.

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

### TypeScript Language Server for TS and JS

#### Installation

✅ This Language Server is installed as a dependency of the MCP server and does not need installation.

#### Configuration

✅ A default configuration for this Language Server is created during startup so things *should* just work.

</details>

<details>

<summary>
  &nbsp;
  <picture>
    <img src="https://img.shields.io/badge/C%23-blueviolet?logo=dotnet" valign="middle">
  </picture>
  &nbsp;
  <b>Roslyn</b> via NuGet Feed
</summary>

### Roslyn Language Server

#### Installation

The official C# Language Server is distributed over the [VS IDE NuGet feed](https://pkgs.dev.azure.com/azure-public/vside/_packaging/vs-impl/nuget/v3/index.json) as a self-contained executable.

To download it we use the `dotnet` CLI with a temporary project file named `ServerDownload.csproj` with the following content:

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

We then pick the platform identifier matching the machine from:

- `win-x64`
- `win-arm64`
- `linux-x64`
- `linux-arm64`
- `linux-musl-x64`
- `linux-musl-arm64`
- `osx-x64`
- `osx-arm64`
- `neutral`

And finally restore the temporary project to trigger the download of the Language Server.

Adjust both `RestorePackagesPath` and `ServerPath` to your machine and keep track of the latter.

```sh
ServerPath=$HOME/.csharp-lsp/
```

```sh
dotnet restore ServerDownload.csproj \
  /p:Platform=your-platform-id \
  /p:RestorePackagesPath=/tmp/your/download/location \
  /p:ServerPath=$ServerPath
```

#### Verify Installation

To verify the outcome of the installation we run the command below

```sh
$ServerPath/Microsoft.CodeAnalysis.LanguageServer --version
```

#### Configuration

Initialize a configuration file for the repository with

```sh
npx -y @p1va/symbols@latest template show csharp > lsps.yaml
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

#### Verify Installation

To double-check the outcome of the installation run the command below

```sh
gopls version
```

#### Configuration

Initialize a config file by running this command and review paths

```sh
npx -y @p1va/symbols@latest template show go > lsps.yaml
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

#### Verify Installation

To double-check the outcome of the installation run the command below

```sh
rust-analyzer --version
```

#### Configuration

Initialize a configuration file for the repository by running

```sh
npx -y @p1va/symbols@latest template show rust > lsps.yaml
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

Config can also be provided at workspace level where LSPs declared in files named either `symbols.y(a)ml` or `lsps.y(a)ml` are automatically loaded.

- **Global** config file is created on the first run and includes Typescript and Python by default
  - Linux: `~/.config/symbols-nodejs/language-servers.yaml`
  - MacOS: `~/Library/Preferences/symbols-nodejs/language-servers.yaml`
  - Windows: `%APPDATA%\symbols-nodejs\Config\language-servers.yaml`
- **Workspace** level config file is searched with the name `language-servers.y(a)ml`
- **Override** via CLI arg `npx -y @p1va/symbols@latest --config path/to/language-servers.yaml`

A workspace can be explicitly set by adding the `--workspace path/to/dir` flag when launching the MCP server.

#### Argument

A config flag provided when launching the MCP server allows to force a specific file name

 `--config path/to/language-servers.yaml`

#### Troubleshooting

Active config can be seen with `npx -y @p1va/symbols@latest --show-config`.

#### Language Server Resolution

The MCP server launches the Language Server listing in its `workspace_files` any file detected in the current working directory. 
e.g. pyproject.toml launches Pyright, package.json TypeScript

These mappings can be updated or extended by modifying the configuration.

Language Server resolution can be made explicit by providing the exact Language Server to launch with this flag `--lsp name-of-ls`

</details>

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

