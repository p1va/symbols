<div align="center">

# Symbols MCP

Read, inspect and navigate through codebase symbols by connecting to a Language Server

![NPM Version](https://img.shields.io/npm/v/%40p1va%2Fsymbols?style=flat)

</div>

## Introduction

By connecting to a Language Server of choice this MCP server makes it easy and efficient for coding agents to explore and navigate the codebase and its dependencies.
The server offers a minimal toolset intended to be simple to use and light on the model's context.

### Available Tools

- **`outline`**: returns an outline of code symbols in a file, optionally with a small code snippet
- **`inspect`**: returns docs, signature, declaration, and implementation locations for a symbol, including third-party symbols
- **`search`**: returns matching symbols across the codebase
- **`references`**: finds all references of a symbol across the codebase
- **`rename`**: renames all references of a symbol across the codebase
- **`diagnostics`**: returns active diagnostics in a given file
- **`completion`**: returns contextual completions at a given location
- **`logs`**: returns recent Language Server window log messages for troubleshooting
- **`setup`**: reloads the effective config and reapplies it to currently running language servers

### Available Resources

- **`symbols://language-servers`**: returns the effective language-server configuration overlaid with runtime session state for all profiles
- **`symbols://language-servers/{name}`**: returns detailed config and runtime state for one language-server profile
- **`symbols://language-servers/{name}/logs`**: returns recent Language Server window log messages for one profile

## Installation

### Agent Installation

<h4>
  <picture>
    <img src="https://img.shields.io/badge/-8E75B2?&logo=google%20gemini&logoColor=white" valign="middle">
  </picture>
  &nbsp;
  <b>Gemini</b>
</h4>

- **Add Extension:** `gemini extensions install p1va/symbols`
- **Ask Gemini:** `please install the language servers relevant to this codebase`

<h4>
  <picture>
    <img src="https://custom-icon-badges.demolab.com/badge/-74aa9c?logo=openai&logoColor=white" valign="middle">
  </picture>
  &nbsp;
  <b>Codex</b>
</h4>

- **Add MCP Server:** `codex mcp add symbols -- npx -y @p1va/symbols@latest start`
- **Add Language Server Skills:** `npx skills add p1va/symbols -a codex`
- **Restart and ask Codex:** `please install the language servers relevant to this codebase`

### Traditional Installation

For manual configuration, language-specific setup examples, and the `config` / `start` workflow, see [docs/INSTALLATION.md#traditional-installation](docs/INSTALLATION.md#traditional-installation).

## Development

- `pnpm lint` outputs the lint violations
- `pnpm lint:fix` attempts to fix lint violations
- `pnpm format` formats the codebase
- `pnpm dev` starts in development mode
- `pnpm build` runs the linter and build
- `pnpm start` starts the built artifacts
- `pnpm test:unit` runs the unit tests
- `pnpm test:integration:{language id}` runs the integration tests for a given language
