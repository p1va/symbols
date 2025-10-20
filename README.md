<div align="center">

# Symbols MCP

Read, inspect and navigate through codebase symbols by connecting to a Language Server

![NPM Version](https://img.shields.io/npm/v/%40p1va%2Fsymbols?style=flat)


</div>

## Introduction

By connecting to a Language Server of choice this MCP server makes it easy and efficient for coding agents to explore and navigate the codebase and its dependencies.
The server offers a minimal toolset intended to be simple to use and light on the model's context.

### Available Tools

- **`outline`**: returns an outline of code symbols in a file. Either compact or with a small code snippet
- **`inspect`**: returns docs, signature, declaration and implementation locations for a symbol. For local and third-party ones (e.g. npm, NuGet, ... )
- **`search`**: returns matching symbols across the codebase
- **`references`**: finds all references of a symbol across the codebase
- **`rename`**: renames all references of a symbol across the codebase
- **`diagnostics`**: returns active diagnostics in a given file
- **`completion`**: returns a list of contextual completions at a given location
- **`logs`**: returns Language Server own logs for troubleshooting

## Installation

### Quickstart (`run` command)

Use the `run` command to start the MCP server with the desired Language Server command defined inline.

`npx -y "@p1va/symbols" run [run options] <lsp-cmd> [lsp args]`

See below configurations for the Language Servers tested. Other stdio Language Servers *should* work too. For simplicity examples follow Claude Code schema.

<details>
<summary>
  &nbsp;
  <picture>
    <img src="https://img.shields.io/badge/-3670A0?&logo=python&logoColor=ffdd54" valign="middle">
  </picture>
  &nbsp;
  <b>Pyright</b>
</summary>

### Pyright

#### Installation

`npm install -g pyright`

#### Verify Installation

`pyright-langserver` should be available

#### Configuration

```jsonc
{
  "mcpServers": {
    "symbols": {
      "command": "npx",
      "args": [
        "-y", "@p1va/symbols@latest", "run",
        "-w", "optional/path/to/workspace",
        "pyright-langserver", "--stdio"
      ]
    }
  }
}
```

> ℹ️ If you'd rather avoid installing **pyright** globally and are fine with a slower start up, you can substitute `pyright-langserver --stdio` in the JSON above with `npx -y -p pyright pyright-langserver --stdio`

#### Troubleshooting

**Virtual Env not found**

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
    <img src="https://img.shields.io/badge/-%23007ACC.svg?logo=typescript&logoColor=white" valign="middle">
  </picture>
  &nbsp;
  <b>TypeScript</b>
</summary>

### TypeScript Language Server

#### Installation

`npm install -g typescipt-language-server`

#### Verify Installation

`typescipt-language-server --version`

#### Configuration

```jsonc
{
  "mcpServers": {
    "symbols": {
      "command": "npx",
      "args": [
        "-y", "@p1va/symbols@latest", "run",
        "-w", "optional/path/to/workspace",
        "typescript-language-server", "--stdio"
      ],
      "env": {
        // Keep at least one code file open for search to work
        "SYMBOLS_PRELOAD_FILES": "src/index.ts;",
        "SYMBOLS_DIAGNOSTICS_STRATEGY": "push"
      }
    }
  }
}
```

> ℹ️ If you'd rather avoid installing **typescript-language-server** globally and are fine with a slower start up, you can substitute `typescript-language-server --stdio` in the JSON above with `npx -y typescript-language-server --stdio`

#### Troubleshooting

**Search: No results**

For the search functionality to work the TS Language Server needs to compute the codebase index and keep in memory.
This is done by keeping at least one code file open at any time. Use the `SYMBOLS_PRELOAD_FILES="src/index.ts` variable with paths to a few files.

</details>

<details>

<summary>
  &nbsp;
  <picture>
    <img src="https://img.shields.io/badge/-blueviolet?logo=dotnet" valign="middle">
  </picture>
  &nbsp;
  <b>Roslyn</b>
</summary>

### Roslyn Language Server

#### Installation

The official C# Language Server is distributed over the [VS IDE NuGet feed](https://pkgs.dev.azure.com/azure-public/vside/_packaging/vs-impl/nuget/v3/index.json) as a self-contained executable.

To facilitate download and extraction we use the `dotnet` CLI with a temporary project file named `ServerDownload.csproj` with the following content:

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

We then pick the platform identifier matching the machine from this list:

`win-x64`, `win-arm64`, `linux-x64`, `linux-arm64`, `linux-musl-x64`, `linux-musl-arm64`, `osx-x64`, `osx-arm64` or `neutral`

And finally restore the temporary project to trigger the download of the Language Server.

Adjust both `RestorePackagesPath` and `ServerPath` to work on your machine and keep track of the latter.

```sh
SYMBOLS_ROSLYN_PATH=$HOME/.csharp-lsp
```

```sh
dotnet restore ServerDownload.csproj \
  /p:Platform=your-platform-id \
  /p:RestorePackagesPath=/tmp/your/download/location \
  /p:ServerPath=$SYMBOLS_ROSLYN_PATH
```

#### Verify Installation

To verify the outcome of the installation we run the command below

```sh
$SYMBOLS_ROSLYN_PATH/Microsoft.CodeAnalysis.LanguageServer --version
```

#### Configuration

```jsonc
{
  "mcpServers": {
    "symbols": {
      "command": "npx",
      "args": [
        "-y", "@p1va/symbols@latest", "run",
        "-w", "optional/path/to/workspace",
        "dotnet", "$SYMBOLS_ROSLYN_PATH/Microsoft.CodeAnalysis.LanguageServer.dll",
        "--logLevel=Information",
        "--extensionLogDirectory=$SYMBOLS_ROSLYN_PATH/logs",
        "--stdio"
      ],
      "env": {
        "SYMBOLS_WORKSPACE_LOADER": "roslyn",
        // Adjust this to your installation path
        "SYMBOLS_ROSLYN_PATH": "$HOME/.csharp-lsp",
      }
    }
  }
}
```

> ℹ️ Roslyn Language Server is also provided with the C# Dev Kit extension for VS Code however the launch command is a bit more complicated and changes each time the extension is updated. If wanting to try it i suggest trying the other modality (`config init` * `start`) which brings a template for the launch command

#### Troubleshooting

**Search: No Results Found**

If `search` doesn't find results before a file was read for the first time it's possible to warm up by pre-loading a few files from different projects with
`"SYMBOLS_PRELOAD_FILES": "src/Project/Program.cs"`

**Linux: Max Number of Inotify Instances Reached**

If on Linux LSP logs suggest that the maximum number of inotify per user instances has been reached it's possible to increase it with a value greater than the actual

`sudo sysctl fs.inotify.max_user_instances=512`

This allows the Language Server to keep monitoring files in the Solution/Project

Additionally JetBrains has more details on [this issue](https://youtrack.jetbrains.com/articles/SUPPORT-A-1715/Inotify-Watches-Limit-Linux)

</details>

<details>
  
<summary>
  &nbsp;
  <picture>
    <img src="https://img.shields.io/badge/-%2300599C.svg?logo=c%2B%2B&logoColor=white" valign="middle">
  </picture>
  &nbsp;
  <b>Clang</b>
</summary>

### Clang for C/C++

#### Verify Installation

`clangd --help` is available

#### Configuration

```jsonc
{
  "mcpServers": {
    "symbols": {
      "command": "npx",
      "args": [
        "-y", "@p1va/symbols@latest", "run",
        "-w", "optional/path/to/workspace",
        "clangd",
      ],
      "env": {
        "SYMBOLS_DIAGNOSTICS_STRATEGY": "push",
        "SYMBOLS_PRELOAD_FILES": "path/to/file.cpp"
      }
    }
  }
}
```

#### Troubleshooting

**General Errors**

Ensure either `compile_commands.json` is found in the working directory or provide its directory path with  `--compile-commands-dir=path/to/dir` 

**Search: No Results Found**

Index is generate when the first file is opened. To warm up is possible to pre load and keep a one or more files opened by providing a list in ` SYMBOLS_PRELOAD_FILES` 


</details>

<details>

<summary>
  &nbsp;
  <picture>
    <img src="https://img.shields.io/badge/-%2300ADD8.svg?logo=go&logoColor=white" valign="middle">
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

```sh
gopls version
```

#### Configuration

```jsonc
{
  "mcpServers": {
    "symbols": {
      "command": "npx",
      "args": [
        "-y", "@p1va/symbols@latest", "run",
        "-w", "optional/path/to/workspace",
        "gopls"
      ],
      "env": {
        "SYMBOLS_DIAGNOSTICS_STRATEGY": "push",
        // Adjust these to your machine
        "GOPATH" : "$HOME/go",
        "GOCACHE": "$HOME/.cache/go-build",
        "GOMODCACHE": "$HOME/go/pkg/mod"
      }
    }
  }
}
```

</details>

<details>

<summary>
  &nbsp;
  <picture>
    <img src="https://img.shields.io/badge/-%23000000.svg?logo=rust&logoColor=white" valign="middle">
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

```sh
rust-analyzer --version
```

#### Configuration

```jsonc
{
  "mcpServers": {
    "symbols": {
      "command": "npx",
      "args": [
        "-y", "@p1va/symbols@latest", "run",
        "-w", "optional/path/to/workspace",
        "rust-analyzer"
      ]
    }
  }
}
```

</details>

<details>
  
<summary>
  &nbsp;
  <picture>
    <img src="https://img.shields.io/badge/-ED8B00?logo=openjdk&logoColor=white" valign="middle">
  </picture>
  &nbsp;
  <b>Eclipse JDT</b>
</summary>

### Eclipse JDT Language Server

#### Installation

Follow installation instructions on the [Project's GitHub README](https://github.com/eclipse-jdtls/eclipse.jdt.ls?tab=readme-ov-file#installation)

#### Verify Installation

```sh
$SYMBOLS_JDTLS_PATH/bin/jdtls --help
```

#### Configuration

```jsonc
{
  "mcpServers": {
    "symbols": {
      "command": "npx",
      "args": [
        "-y", "@p1va/symbols@latest", "run",
        "-w", "optional/path/to/workspace",
        "$SYMBOLS_JDTLS_PATH/bin/jdtls",
        "-configuration", "$HOME/.cache/jdtls/config",
        "-data", "$HOME/.cache/jdtls/workspace/$SYMBOLS_WORKSPACE_NAME"
      ],
      "env": {
        "SYMBOLS_DIAGNOSTICS_STRATEGY": "push",
        "SYMBOLS_JDTLS_PATH": "$HOME/.java-lsp/jdtls",
      }
    }
  }
}
```

</details>

### Auto-detection (`config` & `start` commands)

If you prefer to keep your MCP config minimal and portable, it's possible to move Language Server definitions out to a dedicated file and have the MCP server read from there and auto-detect which Language Server to launch depending on the codebase.

<details>

<summary>
  &nbsp;
  🆕
  &nbsp;
  <b>1. <code>config init</code></b>
</summary>

#### Initialize Config

**User-wide**

To create a user-wide config file run the following command

`npx -y "@p1va/symbols@latest" config init --global`

This will create a configuration file to be found at:

- On Linux: `~/.config/symbols-nodejs/language-servers.yaml`
- On MacOS: `~/Library/Preferences/symbols-nodejs/language-servers.yaml`
- On Windows: `%APPDATA%\symbols-nodejs\Config\language-servers.yaml`

**Workspace (Defaults to Current Directory)**

To create a workspace config file run this instead

`npx -y "@p1va/symbols@latest" config init -w path/to/workspace`

- Will initialize `path/to/workspace/language-servers.yaml`

`npx -y "@p1va/symbols@latest" config init` 

- Will initialize `./language-servers.yaml`

</details>

<details>

<summary>
  &nbsp;
  ⚙️
  &nbsp;
  <b>2. <code>config show</code></b>
</summary>

#### Tweak Config

Use your editor (here i use `code`) to tweak the generated config file and comment, uncomment or add new language servers.

`code $(npx -y @p1va/symbols config path)`

#### Show Active Config

Finally run the command in your workspace (e.g. where you launch Claude Code) to see that the changes are being applied

`npx -y @p1va/symbols config show`

`npx -y @p1va/symbols config show -w path/to/workspace`

`npx -y @p1va/symbols config show -c path/to/config.yaml`

</details>

<details>

<summary>
  &nbsp;
  ⚡️
  &nbsp;
  <b>3. <code>start</code></b>
</summary>

Update your MCP configuration with this MCP server. The first Language Server having `workspace_files` matching any of the files seen at the root of the workspace will be launched

```jsonc
{
  "mcpServers": {
    "symbols": {
      "command": "npx",
      "args": [
        "-y", "@p1va/symbols@latest", "start",
        // Defaults to current directory
        "-w", "optional/path/to/workspace",
        // Defaults to language-servers.yaml in current workspace
        "-c", "optional/path/to/config.yaml",
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
- `pnpm test:unit` runs the unit tests
- `pnpm test:integration:{language id}` runs the integration tests for a given language