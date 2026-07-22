# symbols

This file is a compatibility guide for agents that look for `CLAUDE.md`.

`AGENTS.md` is the canonical engineering guide for this repository.
`README.md` is the canonical source for the public product surface: current
tools, resources, installation, and usage.

Read first:

- [AGENTS.md](AGENTS.md)
- [README.md](README.md)
- [docs/MAINTENANCE.md](docs/MAINTENANCE.md) for accepted follow-up work
- [docs/PLUGIN_CONTROL_PLANE_DIRECTION.md](docs/PLUGIN_CONTROL_PLANE_DIRECTION.md)
- [docs/CODE_QUALITY_ROADMAP.md](docs/CODE_QUALITY_ROADMAP.md) for the
  rationale behind the current TypeScript contracts

## Repo Summary

Symbols is a lightweight MCP bridge to Language Servers.

It is intentionally small:

- skills and plugin assets carry installation and troubleshooting guidance
- `language-servers.yaml` is the desired state
- MCP resources expose effective config and runtime state
- MCP tools perform navigation, inspection, search, rename, diagnostics, and
  control-plane actions

Do not treat Symbols as:

- a managed installer framework
- a large MCP recipe catalog
- a broad workflow product with file, shell, or memory tooling

## Engineering Preferences

- TypeScript and `pnpm`; use the pinned toolchain (`nvm use`)
- strict typing and build health matter
- prefer small modules, explicit data flow, and simple typed helpers
- prefer a pragmatic blend of functional and imperative style: pure helpers
  and plain transforms where they stay simple, stateful or imperative
  structures where they are the clearer fit (lifecycle, stores, plumbing)
- establish each fact once: coordinate base, URI conversion, normalization,
  and output limits each have one implementation
- earn abstractions: a little direct duplication beats a framework with hooks
  or branching flags
- keep comments that record constraints the type system cannot express;
  delete narration and changelog comments

## Architecture Contracts

The flow is `tools -> preparation -> operations -> session -> client`.

- Language Server responses are external data. Operations issue requests via
  the official typed LSP request descriptors and normalize each supported
  protocol union once at that boundary; downstream code contains no
  protocol-shape checks.
- MCP/user positions are 1-based; LSP protocol positions are 0-based. Convert
  exactly twice: once during preparation, once at the user-facing render edge.
- Enrichment returns exactly one result per request, in input order.
- Operations and lifecycle callbacks return values or throw, preserving the
  original error as `cause`; use `Result` only where callers genuinely
  branch. Cleanup runs in `finally` and never replaces the primary failure.

## Implementation Notes

- Language servers start lazily on demand; multiple servers may exist for one
  workspace.
- `reload` is the config apply step for YAML-only changes. Runtime or tool
  registration changes require restarting the MCP session before live
  validation.
- Workspace-wide `search` may use a bounded warm-up retry; prefer that over
  fixed startup delays.
- `.agents/skills/` is the canonical skill source; the root `skills/` and
  `plugins/symbols/skills/` directories are generated mirrors. Edit canonical
  files only, run `pnpm sync:skills`, and commit the mirrors.

## Verification

For normal code changes run `pnpm format:check`, `pnpm build`,
`pnpm test:unit`, `pnpm check:unused`, and `pnpm check:unused:ts`. Run the
relevant language integration test after changing protocol behavior, session
lifecycle, preparation, routing, or tool output.

## Keep In Sync

- Do not duplicate the current tool list here unless there is a strong reason.
  Refer to [README.md](README.md) for the public surface.
- Keep this file aligned with [AGENTS.md](AGENTS.md).
- If the repo direction changes, update both files together.
