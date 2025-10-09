<div align="center">

# Symbols MCP

An MCP server for reading, inspecting and navigating codebase symbols

![Python](https://img.shields.io/badge/python-3670A0?&logo=python&logoColor=ffdd54)
![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?logo=typescript&logoColor=white)
![C#](https://img.shields.io/badge/c%23-%23239120.svg?logo=csharp&logoColor=white)
![Go](https://img.shields.io/badge/go-%2300ADD8.svg?logo=go&logoColor=white)
![Rust](https://img.shields.io/badge/rust-%23000000.svg?logo=rust&logoColor=white)

</div>

## Introduction

By connecting to a Language Server of choice this MCP server makes it easy and efficent for coding agents to explore and navigate the codebase.

### Available Tools

- **`outline`**: returns a concise outline of code symbols in a given file
  - `preview: false`: compact with just names and kinds
  - `preview: true`: with more info like signature, modifiers and return types
- **`inspect`**: returns context for a symbol at a given location
  - **documentation** and signature if applicable
  - **declaration location** and code preview
  - **implementation location** and code preview (for both local and external symbols) [see here](examples/03-inspect-codebase-symbol.md) and [here](examples/04-inspect-third-party-library.md)
  - **decompiled location** and preview (for both local and external symbols) [see here](examples/03-inspect-codebase-symbol.md) and [here](examples/04-inspect-third-party-library.md)

- **`search`**: searches symbols across the codebase [example](examples/01-search.md)

- **`references`**: finds references for a symbol across the codebase [see here](examples/05-references.md)
- **`rename`**: renames a symbol and all of its references across the codebase
- **`diagnostics`**: retrieves active diagnostics in a given file
- **`completion`**: returns a list of contextual completions at a given location [see here](examples/06-completion.md)
- **`logs`**: retrieves Language Server's logs

### Use Cases

<details>

<summary><b>Gather high-level understanding of codebase</b></summary>

**Tools:** `read` `search`

**Example prompt:** `Could you please explore the codebase and get a high-level understanding of its structure, components and responsibilities using the navigation tools from "symbols" MCP server. Please use the read tool with previewMode signature to efficently read a simple outline for each file you think is relevant.`

</details>

## Installation

### 1. Install Language Server(s)

`npx -y @p1va/symbols@latest`

The npm package comes with both **TypeScript** and Python's **Pyright** as dependencies. When you run  those binaries are available automatically. For other languages you need to install and update the LSP separately.

Configure each LSP according to your project’s needs (see the example configuration). The sections below list the recommended installation commands and quick health checks.

<details>

<summary><b>Python - Pyright</b></summary>

### Installation

```sh
npm install -g pyright
```

To double-check the outcome of the installation run the command below

```sh
pyright-langserver --stdio
```

### Troubleshooting

A symptom of Pyright not being properly configured is the `diagnostics` tool only reporting module import errors even when none appear in the IDE.

You can update your `pyproject.toml` to correctly point it to the virtual environment location.

```toml
[tool.pyright]
venvPath = "."
venv = ".venv"
```

</details>

<details>

<summary><b>TypeScript - TS Language Server</b></summary>

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

<summary><b>C# - Roslyn</b></summary>

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

<summary><b>Go - Gopls</b></summary>

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

<summary><b>Rust - rust-analyzer</b></summary>

### Installation

```sh
rustup component add rust-analyzer
```

To double-check the outcome of the installation run the command below

```sh
rust-analyzer --version
```

</details>

### 2. Configuration

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

### 3. Add MCP to Coding Agents

Once the Language Server(s) have been installed and the configuration download it is possible to add the MCP server command `npx -y @p1va/symbols@latest` to coding agents

<details>
<summary><b>Claude Code</b></summary>

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

<details>

<summary><b>OpenAI Codex</b></summary>

Add this to `$HOME/.codex/config.toml`

```toml
[mcp_servers.symbols]
command = "npx"
args = ["-y", "@p1va/symbols@latest"]
```

</details>

<details>

<summary><b>Copilot in VS Code</b></summary>

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

<details>
<summary>
Guidance for AGENTS.md and CLAUDE.md 
</summary>

Update your `CLAUDE.md` or `AGENTS.md` with instructions on tool use recommending to prefer LSP-based discovery over traditional file read.

```md
## Tool Usage Policy Addendum

The MCP server provides the following tools:

- Prefer **`mcp__symbols__search`** when searching for symbols (e.g. function names, types, ect), use your usual tool for other kinds of searches (e.g. \*.ts)
- When discovering prefer **`mcp__symbols__read`** first and start with previewMode: `none` to get a sense of what is in there then if needed increase to `signature` or `expanded` symbols in a given file with different level of details.
- Use **`mcp__symbols__inspect`** when looking to find out about what a symbol does, its signature, its definition, its implementation. Then if needed keep exploring the suggested locations with `mcp__symbols__read`
- **`mcp__symbols__completion`**: suggests a list of completions
- Use **`mcp__symbols__references`** when looking for a symbol references across the codebase
- Use **`mcp__symbols__rename`** when wanting to rename a symbol across the codebase
- Use **`mcp__symbols__diagnostics`** to retrieve active diagnostics for a given document
```

</details>

## Troubleshooting

- **Inspect the active configuration** – `npx -y @p1va/symbols@latest --show-config` prints the merged YAML along with the path it came from.
- **Check the logs** – every run writes to `~/.config/symbols-nodejs/log/*.log` (or the OS equivalent). The file name includes your workspace and LSP name.
- **Verify the LSP binary** – run the `command` listed in `symbols.yaml` with `--stdio` (or the appropriate flag) to ensure it starts cleanly. For `${LOCAL_NODE_MODULE}` commands, the server automatically resolves the executable in `node_modules`.
- **Increase verbosity** – set `LOGLEVEL=debug` before launching the server to see detailed connection messages and requests.
- **Workspace mismatch** – if symbols are missing, confirm the server is launched with the correct `--workspace` path so relative files resolve properly.

## Development

- `pnpm lint` outputs the lint violations
- `pnpm lint:fix` attempts to fix lint violations
- `pnpm format` formats the codebase
- `pnpm dev` starts in development mode
- `pnpm build` runs the linter and build
- `pnpm start` starts the built artifacts
- `pnpm test:unit` runs the unit tests
- `pnpm test:integration:{language id}` runs the integration tests for a given language

## Motivation

- Having fun while learning something new, better understanding of MCP by understanding LSP who inspired it
- Avoid long and complicated commands in .mcp.json file or similar and prefer a dedicated configuration file
- Supports for the official Microsoft Code Analysis Language Server for C# and both mechanisms of diagnostic publishing (pull and push)
- Keep tools productive but to the minimum (potentially allowing for hiding unused ones) and don't pollute the context
- Don't leak the complexity of the Language Server interaction

