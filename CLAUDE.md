# symbols

This file is a compatibility guide for agents that look for `CLAUDE.md`.

`AGENTS.md` is the canonical engineering guide for this repository.
`README.md` is the canonical source for the public product surface: current
tools, resources, installation, and usage.

Read first:

- [AGENTS.md](AGENTS.md)
- [README.md](README.md)
- [docs/PLUGIN_CONTROL_PLANE_DIRECTION.md](docs/PLUGIN_CONTROL_PLANE_DIRECTION.md)
- [docs/SYMBOLS_HANDOFF_2026-04-03.md](docs/SYMBOLS_HANDOFF_2026-04-03.md)

## Repo Summary

Symbols is a lightweight MCP bridge to Language Servers.

It is intentionally small:

- skills and extension/plugin assets carry installation and troubleshooting guidance
- `language-servers.yaml` is the desired state
- MCP resources expose effective config and runtime state
- MCP tools provide a compact, agent-oriented navigation surface

Do not treat Symbols as:

- a managed installer framework
- a large MCP recipe catalog
- a broad workflow product with file, shell, or memory tooling

## Engineering Preferences

- TypeScript and `pnpm`
- strict typing and build health matter
- prefer small modules, explicit data flow, and simple typed helpers
- prefer a pragmatic blend of functional and imperative style

Functional patterns are useful here, but they are not a religion.

Prefer:

- pure functions when they keep code obvious
- plain objects and explicit transforms over unnecessary abstraction
- immutable-style updates when they are cheap and readable

Also use stateful or imperative structures when they are the clearer fit, for example:

- process/session lifecycle
- stores and runtime coordination
- transport/protocol plumbing

Clarity and type safety matter more than ideological purity.

## Implementation Notes

- MCP/user positions are 1-based; LSP protocol positions are 0-based.
- Language servers are started lazily on demand, not eagerly at startup.
- Multiple language servers may exist for one workspace.
- `reload` is the config apply step for YAML-only changes.
- Runtime/tool registration changes require restarting the session before live validation.
- Workspace-wide `search` may use a bounded warm-up retry; prefer that over fixed startup delays.

## Keep In Sync

- Do not duplicate the current tool list here unless there is a strong reason.
  Refer to [README.md](README.md) for the public surface.
- Keep this file aligned with [AGENTS.md](AGENTS.md).
- If the repo direction changes, update both files together.
