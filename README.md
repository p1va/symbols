<div align="center">

# symbols

An MCP server for reading, inspecting and searching codebase symbols

![Python](https://img.shields.io/badge/python-3670A0?&logo=python&logoColor=ffdd54)
![C#](https://img.shields.io/badge/c%23-%23239120.svg?logo=csharp&logoColor=white)
![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?logo=typescript&logoColor=white)
![Go](https://img.shields.io/badge/go-%2300ADD8.svg?logo=go&logoColor=white)
![Rust](https://img.shields.io/badge/rust-%23000000.svg?logo=rust&logoColor=white)

</div>

## Introduction

When paired with a Language Server of choice, the Symbols MCP server offers a set of tools that enable Coding Agents to discover and navigate the codebase and its dependencies in a way that is faster and a more efficient use of the model's context.

## MCP Tools

The MCP server provides the following tools:

- **`search`**: searches symbols across the codebase [see here](examples/01-search.md)
- **`read`**: reads symbols in a code file with different level of preview (`none`, `signature`, `full`) [see here](examples/02-read-signature-mode.md)
- **`inspect`**: inspects a symbol and returns its documentation, its definition and implementation for both local and external symbols [see here](examples/03-inspect-codebase-symbol.md) and [here](examples/04-inspect-third-party-library.md)
- **`completion`**: suggests a list of contextual completions at a given location [see here](examples/06-completion.md)
- **`references`**: finds references for a symbol across the codebase [see here](examples/05-references.md)
- **`rename`**: renames a symbol across the codebase
- **`diagnostics`**: retrieves active diagnostics in a file
- **`logs`**: retrieves logs from the underlying Language Server

## Installation

### 1. Install Language Server(s)

For the MCP server to work it is important to install the Language Server(s) relevant for the programming language of the codebase

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

Configuration can be provided and overwritten at different levels. For the sake of simplicty here we will be adding it system-wide. More options can be seen as described in the `--help` command

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
- When discovering prefer **`mcp__symbols__read`** first and start with previewMode: `none` to get a sense of what is in there then if needed increase to `signature` or `full` symbols in a given file with different level of details.
- Use **`mcp__symbols__inspect`** when looking to find out about what a symbol does, its signature, its definition, its implementation. Then if needed keep exploring the suggested locations with `mcp__symbols__read`
- **`mcp__symbols__completion`**: suggests a list of completions
- Use **`mcp__symbols__references`** when looking for a symbol references across the codebase
- Use **`mcp__symbols__rename`** when wanting to rename a symbol across the codebase
- Use **`mcp__symbols__diagnostics`** to retrieve active diagnostics for a given document
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
