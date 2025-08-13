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

<summary><b>Install Pyright</b></summary>

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

<summary><b>Install Typescript</b></summary>

### Installation 

```sh
npm install -g typescript typescript-language-server
```

To double-check the outcome of the installation run the command below

```sh
typescript-language-server --version
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
