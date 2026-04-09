<div align="center">

# Symbols MCP

Read, inspect and navigate through codebase symbols by connecting to Language Servers.

![NPM Version](https://img.shields.io/npm/v/%40p1va%2Fsymbols?style=flat)

</div>

## Introduction

By connecting to a Language Server of choice this MCP server makes it easy and efficient for coding agents to explore and navigate the codebase and its dependencies.
The server offers a minimal set of tools, resources and skills intended to be simple to use and light on the model's context.

### Tools

- **`outline`**: returns an outline of code symbols in a file, optionally with a small code snippet
- **`inspect`**: returns docs, declaration and implementation locations for a symbol, including third-party ones
- **`search`**: returns matching symbols across the codebase
- **`references`**: finds all references of a symbol across the codebase
- **`call_hierarchy`**: returns incoming and outgoing call relationships for a callable symbol
- **`rename`**: renames all references of a symbol across the codebase
- **`diagnostics`**: returns active diagnostics in a given file
- **`completion`**: returns contextual completions at a given location
- **`reload`**: reloads the effective config and reapplies it to currently running language servers

### Resources

- **`language-servers://profiles`**: returns the configured language servers along with their state.
- **`language-servers://profiles/{name}`**: returns a more detailed view of one language server.
- **`language-servers://profiles/{name}/logs`**: returns the Language Server logs for troubleshooting.

### Skills

- **`install-language-server`**: installs, configures, validates, or troubleshoots a language-server profile for the current workspace.
- **`language-server-navigation`**: guides symbol inspection, references, rename, diagnostics, and search through Language Server tools before falling back to text search.

## Installation

### Agent Installation

Install the MCP Server, Agent Skills via Plugins and Extensions and then ask the agent to install any relevant language server for the codebase.

<h4>
  <picture>
    <img src="https://img.shields.io/badge/-8E75B2?&logo=google%20gemini&logoColor=white" valign="middle">
  </picture>
  &nbsp;
  <b>Gemini</b>
</h4>

- **Add Extension:** `gemini extensions install p1va/symbols`
- **Ask Gemini:** `Please install the language servers relevant to this codebase`

<h4>
  <picture>
    <img src="https://custom-icon-badges.demolab.com/badge/-74aa9c?logo=openai&logoColor=white" valign="middle">
  </picture>
  &nbsp;
  <b>Codex</b>
</h4>

- **Add MCP Server:** `codex mcp add language-servers -- npx -y @p1va/symbols@latest start`
- **Add Language Server Skills:** `npx skills add p1va/symbols -a codex`
- **Ask Codex:** `Please install the language servers relevant to this codebase`

### Manual Installation

For manual configuration and language servers examples see [here](docs/INSTALLATION.md#traditional-installation).

## Development

- `pnpm lint` outputs the lint violations
- `pnpm lint:fix` attempts to fix lint violations
- `pnpm format` formats the codebase
- `pnpm dev` starts in development mode
- `pnpm build` runs the linter and build
- `pnpm start` starts the built artifacts
- `pnpm test:unit` runs the unit tests
- `pnpm test:integration:{language id}` runs the integration tests for a given language

## Release

- `pnpm sync:skills` to mirror `.agents/skills/` into:
  - `skills/` for the Gemini Extension
  - `plugins/symbols/skills/` for the Codex Plugin.
- `pnpm version patch` to bump the version and create the tag. Then:
  - `pnpm sync:version` to update plugin and extension manifests.
  - `git push --follow-tags` to push the commit and tag.
