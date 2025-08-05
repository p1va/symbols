<div align="center">

# symbols

An MCP server for searching, reading, inspecting symbols in a codebase

![Python](https://img.shields.io/badge/python-3670A0?&logo=python&logoColor=ffdd54)
![C#](https://img.shields.io/badge/c%23-%23239120.svg?logo=csharp&logoColor=white)
![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?logo=typescript&logoColor=white)
![Go](https://img.shields.io/badge/go-%2300ADD8.svg?logo=go&logoColor=white)
![Rust](https://img.shields.io/badge/rust-%23000000.svg?logo=rust&logoColor=white)

</div>

## Introduction

By giving Coding Agents a way to deal in code symbols like we do in IDEs the codebase becomes more structured, easy to discover and navigate. This shorten the feedback loop, allows for codebase-aware generation and is an efficent use of the model's context.

## Available Tools

The MCP server provides the following tools:

- **`search`**: searches symbols across the codebase
- **`read`**: reads symbols in a given file with different level of details
- **`inspect`**: inspects a given symbol and returns info about it, its definition and implementation
- **`completion`**: suggests a list of completions
- **`references`**: finds references of a given symbol across the codebase
- **`rename`**: renames a symbol across the codebase
- **`diagnostics`**: retrieves active diagnostics in a given document
- **`logs`**: returns logs from the underlying LSP

## Installation

```bash
npx -y @p1va/symbols
```

The tool spawn a Language Server process and then communicates over stdio with it according to the [Language Server Protocol](https://microsoft.github.io/language-server-protocol/). In order for the tool to work the Language Server for the language of choice needs to also be installed.

## Coding Agents

<details>

<summary><b>Claude Code</b></summary>

Update your `.mcp.json` file with a `csharp` where the path and sln files match the ones of your repo

```json
{
  "mcpServers": {
    "symbols": {
      "command": "npx",
      "args": ["-y", "@p1va/symbols"]
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
args = ["-y", "@p1va/symbols"]
```

Update your `AGENTS.md` with instructions on tool use like [here](AGENTS.md).

</details>

<details>

<summary><b>Copilot in VS Code</b></summary>

Add or update your `.vscode/mcp.toml` to include this `csharp` server and provide your own solution file name

```json
{
  "servers": {
    "symbols": {
      "type": "stdio",
      "command": "npx -y @p1va/symbols",
      "args": []
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
- `pnpm start` starts in production mode
- `pnpm build` runs the linter and build
- `pnpm test` runs the tests
