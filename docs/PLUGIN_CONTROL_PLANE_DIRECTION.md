# Plugin And Control Plane Direction

## Decision

Symbols should be delivered primarily as a host-native plugin or extension for
coding agents such as Codex and Gemini, not as an MCP server that also tries to
be the instruction catalog for installing language servers.

The MCP server remains important, but its role is narrower:

- expose effective language-server state
- let the agent control the runtime
- let the agent inspect failures and logs

Installation instructions, language-specific workflows, and recommended usage
patterns should live in the host plugin or extension as skills, README content,
and related host-native assets.

## Why

This matches how coding-agent ecosystems already work:

- plugins/extensions are the discoverable place for instructions
- skills are the natural way to guide an agent through installation and setup
- MCP is best used for runtime state and actions that only the running server
  can know

Trying to ship install recipes and long-form setup instructions through MCP
resources makes them less visible and duplicates what plugins/skills already do
well.

## Responsibilities

### Plugin / Extension

The plugin or extension should provide:

- the MCP server wiring for Symbols
- human-facing README material
- skills such as:
  - enable C#
  - enable TypeScript
  - enable Python
  - troubleshoot LSP setup
  - prefer semantic rename over grep-based rename

Those skills should tell the agent how to:

- install the LSP binary
- choose the correct config location
- update the config file with machine-specific paths or overrides
- reload and start the server through the MCP control plane

### Config Files

Config files on disk are the desired state.

The agent should be able to edit the effective `language-servers.yaml` directly.
That includes machine-specific settings such as a Roslyn installation path.

Symbols should continue to use YAML as the persisted configuration format.

Important: current config loading is precedence-based, not a merge of every
`language-servers.yaml` on disk. The active config file should therefore be
visible to the agent so it knows exactly which file to edit.

### Symbols MCP

Symbols MCP should act as a runtime control plane and inspection surface.

It should not be the primary install-instruction catalog.

## Primary Resource

Expose one main read-only resource:

- `symbols://language-servers`

This should present the effective configured profiles overlaid with runtime
session state.

Each entry should include:

- profile name
- active config path / source
- command
- extensions
- workspace files
- preload files
- diagnostics settings
- workspace loader settings
- default / detected markers where relevant
- session state: `not_started | starting | ready | error | stopped`
- pid if running
- last error if any
- workspace-ready signal
- owned/open document count

Use `not_started` for configured profiles that have never been launched, and
`stopped` for sessions that were previously running and then explicitly stopped.

This is intentionally a single effective-state view, not separate profile and
session resources.

The initial drill-down resources should be:

- `symbols://language-servers/{name}`
- `symbols://language-servers/{name}/logs`

Use profile `name` as the external handle. Include any internal `sessionKey`
only as debug data inside the payload, not as the primary resource identifier.

## Resource Format

Use JSON for state resources:

- `symbols://language-servers`
- `symbols://language-servers/{name}`

Use text for logs:

- `symbols://language-servers/{name}/logs`

State resources should separate:

- `config`: values sourced from config or validated effective config
- `runtime`: values sourced from the spawned session, if any

This keeps configuration facts distinct from process state, which is helpful
for agent troubleshooting.

## Control Plane Tools

The control plane should stay tool-based.

Useful actions:

- `setup.reload`
- `logs`

`setup.reload` should be the main apply-config action: reread the effective
config file, gracefully restart any currently running sessions with the updated
config, and leave dormant profiles stopped until first use.

The intended workflow is:

1. plugin skill explains how to install a language server
2. agent installs the binary
3. agent edits `language-servers.yaml`
4. agent calls `setup.reload`
5. agent uses an LSP-backed tool on a matching file
6. agent inspects `symbols://language-servers` and logs if needed

## What We Are Not Doing

We are not making the MCP server the primary recipe catalog.

That means:

- no large install-instruction corpus exposed primarily through MCP resources
- no attempt to replicate Claude Code's marketplace model inside Symbols MCP
- no requirement that Symbols itself choose the recommended LSP for a language

Recommendation and installation guidance belong in plugin skills. The runtime
only needs to load what the config declares.

## Immediate Implementation Implications

The next product-facing work should be:

1. add `symbols://language-servers`
2. add `symbols://language-servers/{name}`
3. add `symbols://language-servers/{name}/logs`
4. add `setup.reload`
5. make `setup.status` and the resource clearly report the active config path
6. keep direct config-file editing as the configuration workflow
7. package Symbols for Codex and Gemini as host-native plugin/extension bundles

## Relationship To Existing Docs

This document narrows some earlier ideas:

- `AGENT_BOOTSTRAP_PLAN.md` discussed setup resources and install instructions
  through MCP. That is no longer the preferred direction.
- `CLAUDE_CODE_COMPARISON_PLAN.md` remains useful for runtime architecture
  lessons, but the product packaging direction is now different.
- `LSP_MANAGER_HANDOFF.md`, `FILE_LIFECYCLE_REFACTOR_PLAN.md`, and
  `TOOL_OPERATION_SIMPLIFICATION_PLAN.md` still stand for the internal runtime
  refactors already completed.
