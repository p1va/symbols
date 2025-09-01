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

Powered by a Language Server of choice, the Symbols MCP server offers over stdio a set of tools that enable Coding Agents to discover and navigate the codebase and its dependencies in a way that is faster and a more efficient use of the model's context.

## MCP Tools

The MCP server provides the following tools:

- **`search`**: searches symbols across the codebase
- **`read`**: reads symbols in a code file with different level of preview (`none`, `signature`, `full`) and depth
- **`inspect`**: inspects a symbol and returns its documentation, its definition and implementation for both local and external symbols
- **`completion`**: suggests a list of contextual completions at a given location
- **`references`**: finds references for a symbol across the codebase
- **`rename`**: renames a symbol across the codebase
- **`diagnostics`**: retrieves active diagnostics in a file
- **`logs`**: retrieves logs from the underlying Language Server

## Examples

To see the MCP tools in action and understand their benefits, check out our comprehensive examples in the [`examples/`](examples/) directory:

- **[Search Tool](examples/01-search.md)** - Discover symbols across your entire codebase instantly
- **[Read Tool (Signature Mode)](examples/02-read-signature-mode.md)** - Explore large files with optimal information density
- **[Inspect Tool (Codebase)](examples/03-inspect-codebase-symbol.md)** - Get comprehensive symbol information with navigation
- **[Inspect Tool (Third-Party)](examples/04-inspect-third-party-library.md)** - Understand external library APIs without documentation
- **[References Tool](examples/05-references.md)** - Find all symbol usages across your codebase
- **[Completion Tool](examples/06-completion.md)** - Get intelligent code completion suggestions

These examples demonstrate how the symbols MCP server provides more efficient and precise codebase exploration compared to traditional file-based approaches, making it invaluable for AI-assisted development.

## Installation

### 1. Install MCP Server

`npx -y @p1va/symbols`
`npx -y @p1va/symbols --help`
`npx -y @p1va/symbols --show-config`
`npx -y @p1va/symbols --config path/to/config.yaml --show-config`
`npx -y @p1va/symbols --config path/to/config.yaml --lsp typescript`

### 2. Configure MCP Server

The MCP server can be configured through a YAML file (examples [here](examples/configs/)). In priority order

- `--config` argument e.g. `symbols --config path/to/my-config.yaml`
- By convention `{workspace}/symbols.y(a)ml` when `--workspace` is provided
- `symbols.y(a)ml` relative to current working directory
- OS-specific config directory:
  - **Windows**: `%APPDATA%\symbols-nodejs\Config\symbols.yaml` (e.g., `C:\Users\USERNAME\AppData\Roaming\symbols-nodejs\Config\symbols.yaml`)
  - **macOS**: `~/Library/Preferences/symbols-nodejs/symbols.yaml`
  - **Linux**: `~/.config/symbols-nodejs/symbols.yaml` (or `$XDG_CONFIG_HOME/symbols-nodejs/symbols.yaml`)

Examples configurations can be found under [this folder](examples/configs/) and include [csharp](examples/configs/csharp.yaml), [csharp through VSCode](examples/configs/vscode-csharp.yaml), [pyright](examples/configs/pyright.yaml), [typescript](examples/configs/typescript.yaml), [go](examples/configs/rust.yaml), [rust](examples/configs/go.yaml) and [java](examples/configs/java.yaml)

They can be pulled to a repo via
`curl -o symbols.yaml https://raw.githubusercontent.com/p1va/symbols/refs/heads/main/examples/configs/csharp.yaml`

It's possible to double check and validate the active configuration by running

`symbols --show-config`

### Install Language Server(s)

Depending on the configuration and the detected project, the MCP server will spawn a [LSP](https://microsoft.github.io/language-server-protocol/)-compatible Language Server that also needs installing.

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

A sympthom of Pyright not being properly configured is the `diagnostics` tool only reporting module import errors even when none appear in the IDE.

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

### Configuration in Coding Agents

Pseudo-instructions on how to add the MCP server to coding agents via the various configuration files like `.mcp.json`

To list all possible options you can use the help command

```sh
symbols --help
```

When running via npx start with

```
command: "npx"
args: ["-y", "@p1va/symbols", "other args here"]
```

When instead installing globally start with

```
command: "symbols"
args: ["other args here"]
```

To rely on default config locations and autodetection run with

```
command: "symbols"
args: []
```

For a more precise configuration use

```
command: "symbols"
args: [
  "--config",
  "typescript.yaml",
  "--loglevel",
  "debug",
  "--workspace",
  "path/to/workspace",
  "--lsp"
  "csharp"
]
```

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

## Development

- `pnpm lint` outputs the lint violations
- `pnpm lint:fix` attempts to fix lint violations
- `pnpm format` formats the codebase
- `pnpm dev` starts in development mode
- `pnpm build` runs the linter and build
- `pnpm start` starts the built artifacts
- `pnpm test:unit` runs the unit tests
- `pnpm test:integration:{language id}` runs the integration tests for a given language
