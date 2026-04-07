# Symbols Handoff - 2026-04-03

## Current State

The `symbols` runtime has been refactored into the following shape:

- `LspManager`
- `LspSession`
- `LspClient`

The old `LspContext` runtime abstraction has been removed.

The code is now organized so that:

- manager handles routing, profile loading, session lifecycle, and status
- session owns one live LSP process and document lifecycle
- client is transport/protocol plumbing

This is much closer to Claude Code's manager/server/client split, but adapted
to Symbols' YAML-based configuration and MCP usage.

## Runtime Model

### Manager

Main file:

- `src/runtime/lsp-manager.ts`

Responsibilities:

- load effective profiles from config
- keep one session per profile/workspace
- route file requests to the right session
- expose control-plane state
- maintain document ownership across sessions

Routing policy is intentionally simple:

1. if a file is currently owned/open in a session, reuse that session
2. otherwise resolve the target profile by configured extension/default
3. reuse or lazily start that profile session

There is no warm-session heuristic anymore.

### Session

Main file:

- `src/runtime/lsp-session.ts`

Responsibilities:

- spawn/start/stop/restart one LSP server
- manage open documents for that session
- keep anchor/preload files open
- transiently open/close regular operation files
- expose scoped request execution for operations

Current document policy is intentional:

- transient open/close for normal operations
- keep configured preload files open as anchors
- do not move toward editor-like `didChange` ownership for all files

This matches the actual environment where files may be edited by IDEs or other
agents outside this process.

## Tool / Operation Boundary

The MCP tool flow is now:

1. parse MCP input
2. resolve session
3. prepare/validate request
4. run LSP operation
5. format result

Key files:

- `src/preparation.ts`
- `src/lsp/operations/operations.ts`
- `src/tools/*`

Operations now consume prepared input and session-scoped execution APIs rather
than reaching for a raw client directly.

## Control Plane

Main tool:

- `src/tools/setup.ts`

Supported actions:

- `reload`

`reload` was added so agents can edit `language-servers.yaml` directly and then
tell Symbols to reread effective state and reapply it to any currently running
LSP sessions.

## MCP Resources

Main resource module:

- `src/resources/language-servers.ts`

Current resource surface:

- `language-servers://profiles`
- `language-servers://profiles/{name}`
- `language-servers://profiles/{name}/logs`

Format choices:

- JSON for state resources
- text/plain for logs

These resources are now live and verified against the `symbols-dev` MCP server.

### Resource Semantics

`language-servers://profiles` is the main effective-state view for agents.

Each entry contains:

- `config`
  - configured command
  - parsed launch command
  - workspace files
  - declared extensions
  - preload files
  - diagnostics strategy
  - workspace loader
  - default marker
- `runtime`
  - session key
  - state
  - pid
  - last error
  - workspace readiness/loading
  - window log count
  - owned document count

Important recent refinement:

- non-running sessions report `workspaceReady` and `workspaceLoading` as
  `null` instead of `false`
- configured profiles that have never been launched report `not_started`
- previously running sessions that were explicitly stopped report `stopped`

That distinguishes:

- `not_started`
  from
- `starting but not ready`

The setup summary prints `workspace ready: n/a` for `not_started` and
`stopped` sessions.

## Config Direction

The agreed product direction is:

- plugin/extension + skills are the instruction surface
- YAML on disk is the desired state
- Symbols MCP is the runtime control plane and inspection layer

This is captured in:

- `docs/PLUGIN_CONTROL_PLANE_DIRECTION.md`

Important consequences:

- do not build a large recipe/install-doc catalog into MCP resources
- agents should edit config files directly
- then call `setup.reload` and inspect resources/logs

## Config Loading

Effective config remains YAML-based.

Key file:

- `src/config/lsp-config.ts`

Current loading behavior:

- precedence-based config selection
- not a merge of all `language-servers.yaml` files on disk

Recent important fix:

- manager status/resource `configPath` now reports the actually selected config
  source path, not just the CLI-provided path

This is critical for agent workflows because it tells the agent exactly which
file to edit.

## Extension Handling

This area changed significantly.

### Problem That Was Fixed

Previously, configured profiles inherited the global default extension table.
That caused profiles like `typescript` and `pyright` to appear to handle nearly
every file type, which made both routing and resource output misleading.

### Current Model

- configured profiles should explicitly declare which extensions they handle
- built-in fallback extension sets exist for known bundled profiles
- direct `run` mode can still use the broad default table because only one LSP
  is involved

Relevant files:

- `src/config/default-extensions.ts`
- `src/config/lsp-config.ts`
- `assets/default-language-servers.yaml`

Recent additions:

- profile-specific fallback maps for built-in profiles
- explicit TypeScript/Pyright extensions in default config asset

This now produces sane resource output such as:

- TypeScript: `.js`, `.jsx`, `.ts`, `.tsx`, etc.
- Pyright: `.py`, `.pyi`, `.pyw`

instead of a giant all-language list.

## Live Verification Already Done

The following were verified against the live `symbols-dev` MCP server:

- resources are registered
- summary resource works
- detail resource works
- logs resource works
- `setup.reload` works
- resource output now shows:
  - real `configPath`
  - scoped extension lists
  - clean stopped-session hints
  - nullable workspace state for stopped sessions

## Tests / Verification

Local verification passed after the latest changes:

- `pnpm build`
- `pnpm test:unit`

Key new or updated tests:

- `test/unit/language-server-resources.test.ts`
- `test/unit/lsp-config.test.ts`
- `test/unit/lsp-manager.test.ts`

## Docs Added During This Work

These docs are useful context:

- `docs/CLAUDE_CODE_COMPARISON_PLAN.md`
- `docs/LSP_MANAGER_HANDOFF.md`
- `docs/FILE_LIFECYCLE_REFACTOR_PLAN.md`
- `docs/TOOL_OPERATION_SIMPLIFICATION_PLAN.md`
- `docs/PLUGIN_CONTROL_PLANE_DIRECTION.md`

This handoff doc is the shortest entry point if starting fresh.

## Suggested Next Focus

The runtime/control-plane surface is in a good place.

The next likely layer of work is packaging and agent UX:

- create Codex plugin assets under `symbols`
- create Gemini extension packaging shape
- add skills for:
  - enabling a language server
  - troubleshooting setup
  - using LSP-aware rename/search flows

That plugin/skill layer should instruct the agent to:

1. install a language server binary
2. edit the effective `language-servers.yaml`
3. call `setup.reload`
4. run an LSP-backed tool on a matching file
5. inspect `language-servers://profiles` and logs

## Good Starting Files For The Next Session

- `src/runtime/lsp-manager.ts`
- `src/runtime/lsp-session.ts`
- `src/resources/language-servers.ts`
- `src/tools/setup.ts`
- `src/config/lsp-config.ts`
- `docs/PLUGIN_CONTROL_PLANE_DIRECTION.md`
- `docs/SYMBOLS_HANDOFF_2026-04-03.md`
