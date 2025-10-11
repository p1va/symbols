<div align="center">

# Symbols MCP

Read, inspect and navigate through codebase symbols by connecting to a Language Server

![NPM Version](https://img.shields.io/npm/v/%40p1va%2Fsymbols?style=flat)


</div>

## Introduction

By connecting to a Language Server of choice this MCP server makes it easy and efficent for coding agents to explore and navigate the codebase.

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

### 1. MCP Server

<details>
<summary><img src="https://img.shields.io/badge/Claude_Code-555?logo=claude" alt="Claude Code" style="vertical-align: middle;"></summary>

Add this to `.mcp.json`

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

<details><summary><img src="https://img.shields.io/badge/OpenAI_Codex-%23412991?logo=openai&logoColor=white" alt="OpenAI Codex" style="vertical-align: middle;"></summary>

Add this to `$HOME/.codex/config.toml`

```toml
[mcp_servers.symbols]
command = "npx"
args = ["-y", "@p1va/symbols@latest"]
```
</details>

<details><summary><img src="https://img.shields.io/badge/Gemini_CLI-8E75B2?logo=google%20gemini&logoColor=white" alt="Gemini CLI" style="vertical-align: middle;"></summary>

Add this to `.gemini/settings.json`

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

<summary><img src="https://img.shields.io/badge/GitHub_Copilot-8957E5?logo=github-copilot&logoColor=white" alt="GitHub Copilo" style="vertical-align: middle;"></summary>

Add this to `.vscode/mcp.json`

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

### 2. Language Servers

<details>
<summary>
<img src="https://img.shields.io/badge/PY-3670A0?&logo=python&logoColor=ffdd54" alt="Python" style="vertical-align: middle;">
<b>(Pre-Installed)</b>
</summary>

### Python's Pyright

#### Installation

[Pyright]() is already installed as a dependecies of this MCP server and doesn't need installation

#### Configuration

A default configuration for Pyright is created during startup so things *should* work out of the box

#### Troubleshooting

A symptom of Pyright not being properly configured is the `diagnostics` tool only reporting module import errors even when none appear in the IDE.

You can update your `pyproject.toml` to correctly point it to the virtual environment location.

```toml
[tool.pyright]
venvPath = "."
venv = ".venv"
```

</details>


<details>
<summary>
<img src="https://img.shields.io/badge/TS-%23007ACC.svg?logo=typescript&logoColor=white" alt="Typescript" style="vertical-align: middle;">
<b>(Pre-Installed)</b>
</summary>

### Installation

```sh
npm install -g typescript typescript-language-server
```

To double-check the outcome of the installation run the command below

```sh
typescript-language-server --stdio
```

You should see the language server start and wait for LSP messages.

</details>

<details>
<summary>
<img src="https://img.shields.io/badge/CS-blueviolet?logo=dotnet" alt="C#" style="vertical-align: middle;">
<b></b>
</summary>

### Installation

The official Csharp Language Server is distributed over nuget as a self-contained executable.

To download it via the `dotnet` command, create a temporary project file named `ServerDownload.csproj` with the following content:

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

Finally restore the temporary project to download the Language Server to the `ServerPath` location

```sh
dotnet restore ServerDownload.csproj \
  /p:Platform=YOUR-PLATFORM-ID \
  /p:ServerPath=$HOME/.csharp-lsp/
```

To double-check the outcome of the installation run the command below

```sh
$HOME/.csharp-lsp/Microsoft.CodeAnalysis.LanguageServer --version
```
</details>


<details>
<summary>
<img src="https://img.shields.io/badge/GO-%2300ADD8.svg?logo=go&logoColor=white" alt="GO" style="vertical-align: middle;">
<b></b>
</summary>

### Installation

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
<img src="https://img.shields.io/badge/RS-%23000000.svg?logo=rust&logoColor=white" alt="RS" style="vertical-align: middle;">
<b></b>
</summary>

### Installation

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
<img src="https://img.shields.io/badge/JV-ED8B00?logo=openjdk&logoColor=white
" alt="JV" style="vertical-align: middle;">
<b></b>
</summary>

### Installation

</details>


### 3. Configuration

A configuration file tells the server which language servers are available, how to launch them, and what defaults to use. Settings are resolved in this order:

1. CLI flag `--config`
2. Workspace-local files (`$WORKSPACE/symbols.yaml`, `symbols.yml`, `lsps.yaml`, `lsps.yml`)
3. Current working directory (same filenames as above)
4. OS-specific config directory (e.g. `~/.config/symbols-nodejs/symbols.yaml` on Linux)

The schema is defined in [`src/config/lsp-config.ts`](src/config/lsp-config.ts). At a high level:

```yaml
lsps:
  typescript:
    command: ${LOCAL_NODE_MODULE}/typescript-language-server --stdio
    extensions:
      '.ts': typescript
      '.tsx': typescriptreact
    preload_files:
      - ./src/index.ts
    diagnostics:
      strategy: push
    symbols:
      max_depth: 2
```

- `command` supports `${LOCAL_NODE_MODULE}/package:bin` placeholders; the server resolves them to `node_modules/.bin` executables.
- `preload_files` keep specific files open so symbol indexing works immediately.
- `diagnostics.strategy` can be `push` (default) or `pull` depending on the LSP.
- `environment` lets you inject environment variables (e.g. `GOPATH`).

Run `npx @p1va/symbols --show-config` to inspect the final merged config.

#### Workspace behaviour

By default the server works relative to the current directory. Provide `--workspace /absolute/path` (or set `SYMBOLS_WORKSPACE`) so that file operations, preload paths, and config resolution happen from the project root. This is especially important when your agent launches the MCP server from a temporary folder.

<details>

<summary><b>Linux</b></summary>

```sh
mkdir -p ~/.config/symbols-nodejs && curl -o ~/.config/symbols-nodejs/symbols.yaml https://raw.githubusercontent.com/p1va/symbols/refs/heads/main/examples/configs/all-lsps.yaml
```

</details>

<details>

<summary><b>MacOS</b></summary>

```sh
mkdir -p ~/Library/Preferences/symbols-nodejs && curl -o ~/Library/Preferences/symbols-nodejs/symbols.yaml https://raw.githubusercontent.com/p1va/symbols/refs/heads/main/examples/configs/all-lsps.yaml
```

</details>

<details>

<summary><b>Windows</b></summary>

```sh
mkdir "%APPDATA%\symbols-nodejs\Config" && curl -o "%APPDATA%\symbols-nodejs\Config\symbols.yaml" https://raw.githubusercontent.com/p1va/symbols/refs/heads/main/examples/configs/all-lsps.yaml
```

</details>

## Development

- `pnpm lint` outputs the lint violations
- `pnpm lint:fix` attempts to fix lint violations
- `pnpm format` formats the codebase
- `pnpm dev` starts in development mode
- `pnpm build` runs the linter and build
- `pnpm start` starts the built artifacts
- `pnpm test:unit` runs the unit tests
- `pnpm test:integration:{language id}` runs the integration tests for a given language
