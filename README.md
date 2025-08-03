<div align="center">

# lsp-use

An MCP server to bring the structure of Language Servers to Coding Agents

![Python](https://img.shields.io/badge/python-3670A0?&logo=python&logoColor=ffdd54)
![C#](https://img.shields.io/badge/c%23-%23239120.svg?logo=csharp&logoColor=white)
![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?logo=typescript&logoColor=white)
![Go](https://img.shields.io/badge/go-%2300ADD8.svg?logo=go&logoColor=white)
![Rust](https://img.shields.io/badge/rust-%23000000.svg?logo=rust&logoColor=white)

</div>

## Introduction

By giving Coding Agents direct access to the same Language Server that powers VS Code and other IDEs the codebase becomes more structured, easy to discover and navigate. This shorten the feedback loop, allows for codebase-aware generation and is an efficent use of the model's context.

## Installation

```bash
npx -y @p1va/lsp-use
```

The tool spawn a Language Server process and then communicates over stdio with it according to the [Language Server Protocol](https://microsoft.github.io/language-server-protocol/). In order for the tool to work the Language Server for the language of choice needs to also be installed.

## Coding Agents

<details>

<summary><b>Claude Code</b></summary>

Update your `.mcp.json` file with a `csharp` where the path and sln files match the ones of your repo

```json
{
  "mcpServers": {
    "csharp": {
      "command": "lsp-use",
      "args": []
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
command = "lsp-use"
args = ["--workspace=/path/to/repo", "--sln=/path/to/repo/solution.sln"]
```

Update your `AGENTS.md` with instructions on tool use like [here](AGENTS.md).

</details>

<details>

<summary><b>Copilot in VS Code</b></summary>

Add or update your `.vscode/mcp.toml` to include this `csharp` server and provide your own solution file name

```json
{
  "servers": {
    "csharp": {
      "type": "stdio",
      "command": "npx -y @p1va/lsp-use",
      "args": []
    }
  }
}
```

</details>

## Available Tools

The server provides the following tools.

- **`search`**: add description
- **`read`**: add description
- **`inspect`**: add description
- **`completion`**: add description
- **`references`**: add description
- **`rename`**: add description
- **`diagnostics`**: add description
- **`logs`**: add description

## Development

- `pnpm lint` outputs the lint violations
- `pnpm lint:fix` attempts to fix lint violations
- `pnpm format` formats the codebase
- `pnpm dev` starts in development mode
- `pnpm start` starts in production mode
- `pnpm build` runs the linter and build
- `pnpm test` runs the tests
