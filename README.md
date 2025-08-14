<div align="center">

# symbols

An MCP server for searching, reading, inspecting codebase symbols

![Python](https://img.shields.io/badge/python-3670A0?&logo=python&logoColor=ffdd54)
![C#](https://img.shields.io/badge/c%23-%23239120.svg?logo=csharp&logoColor=white)
![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?logo=typescript&logoColor=white)
![Go](https://img.shields.io/badge/go-%2300ADD8.svg?logo=go&logoColor=white)
![Rust](https://img.shields.io/badge/rust-%23000000.svg?logo=rust&logoColor=white)

</div>

## Introduction

Powered by a Language Server of choice, this MCP server offers tools to enable Coding Agents to efficently discover and navigate the codebase and its dependencies.

The result is a shortened feedback loop, codebase-aware generation and efficent use of the model's context.

## MCP Tools

The MCP server provides the following tools:

- **`search`**: searches symbols across the codebase
- **`read`**: reads symbols in a code file with different level of preview (`none`, `signature`, `full`) and depth
- **`inspect`**: inspects a code symbol and returns its documentation, its definition and implementation
- **`completion`**: suggests a list of contextual completions at a given location
- **`references`**: finds references for a code symbol across the codebase
- **`rename`**: renames a code symbol across the codebase
- **`diagnostics`**: retrieves active diagnostics in a file
- **`logs`**: retrieves logs from the underlying Language Server

## Installation

### MCP Server

```bash
npx -y github:p1va/symbols
```

### Language Servers

Depending on the configuration this server will spawn an [LSP](https://microsoft.github.io/language-server-protocol/)-compatible Language Server that also needs installing.

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

In case of virtual environment not being detected add the following to your `pyproject.toml` to correctly point to it.
```toml
[tool.pyright]
venvPath = "."
venv = ".venv"
```

> ⚠️ A sympthom of Pyright not being properly configured is the `diagnostics` tool only reporting module import errors even when none appear in the IDE.

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

<summary><b>Go - Gopls</b></summary>

### Installation 

```sh
go install golang.org/x/tools/gopls@latest
```

To double-check the outcome of the installation run the command below

```sh
gopls version
```

### Troubleshooting

Make sure your Go environment is properly configured:

```sh
go env GOPATH GOROOT
```

If you encounter module resolution issues, ensure your project has a `go.mod` file:

```sh
cd your-project
go mod init your-module-name
```

> ⚠️ gopls works best when run from the module root (directory containing `go.mod`). The MCP server automatically detects Go projects by looking for `go.mod` or `go.work` files.

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

### Troubleshooting

If `rust-analyzer` is not in your PATH after installation, you may need to add the Rust toolchain to your PATH:

```sh
source ~/.cargo/env
```

Ensure your Rust project has a `Cargo.toml` file:

```sh
cd your-project
cargo init  # or cargo new project-name
```

> ⚠️ rust-analyzer works best with projects that have proper `Cargo.toml` files. The MCP server automatically detects Rust projects by looking for `Cargo.toml` or `Cargo.lock` files.

</details>

<details>

<summary><b>C# - Roslyn</b></summary>

### Installation

A self-contained executable of the Csharp Language Server is distributed over nuget.

To download it, create a temporary project file named `ServerDownload.csproj` with the below content

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
Pick the platform identifier matching your machine between these 
- `win-x64`
- `win-arm64`
- `linux-x64`
- `linux-arm64`
- `linux-musl-x64`
- `linux-musl-arm64`
- `osx-x64`
- `osx-arm64`
- `neutral`

Then restore to download the language server to the `ServerPath`

```sh
dotnet restore ServerDownload.csproj \
  /p:Platform=YOUR-PLATFORM-ID \
  /p:ServerPath=$HOME/.csharp-lsp/
```

After that double check by running

```sh
$HOME/.csharp-lsp/Microsoft.CodeAnalysis.LanguageServer --version
```

</details>


## Configuration

Instructions on how to configure the server and using it with coding agents

<details>

<summary><b>Claude Code</b></summary>

Update your `.mcp.json` file with a `csharp` where the path and sln files match the ones of your repo

```json
{
  "mcpServers": {
    "symbols": {
      "command": "npx",
      "args": ["-y", "github:p1va/symbols"]
    }
  }
}
```

Update your `CLAUDE.md` with instructions on tool use recommending to prefer LSP-based discovery over traditional file read.

</details>

<details>

<summary><b>OpenAI Codex</b></summary>

Add or update your `$HOME/.codex/config.toml`. Doesn't seem to work at repo level yet.

```toml
[mcp_servers.csharp]
command = "npx"
args = ["-y", "github:p1va/symbols"]
```

Update your `AGENTS.md` with instructions on tool use like [here](AGENTS.md).

</details>

<details>

<summary><b>Copilot in VS Code</b></summary>

Add or update your `.vscode/mcp.toml` to include the server and provide your own solution file name

```json
{
  "servers": {
    "symbols": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "-y",
        "github:p1va/symbols"
      ]
    }
  }
}
```

</details>

## Development

- `pnpm lint` outputs the lint violations
- `pnpm lint:fix` attempts to fix lint violations
- `pnpm format` formats the codebase
- `pnpm dev` starts in development mode
- `pnpm build` runs the linter and build
- `pnpm start` starts the built artifacts
- `pnpm test` runs the tests
