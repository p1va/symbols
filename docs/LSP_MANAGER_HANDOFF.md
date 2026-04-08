# LSP Manager Handoff

Date: 2026-04-02

This document is the current handoff point for the LSP refactor in `symbols`.
It supersedes the live architectural picture in older docs that were written
before the manager/session split was implemented.

## Current State

The runtime model is no longer "one global LSP client".

The active concepts are:

- `LspManager`
  - file: `src/runtime/lsp-manager.ts`
  - owns configured profiles, live sessions, lazy startup, status, restart/stop,
    and file-to-session routing
- `LspSession`
  - file: `src/runtime/lsp-session.ts`
  - owns one live server process, one JSON-RPC client, one workspace view, and
    one document set
- `LspClient`
  - existing transport / protocol wrapper

The current routing model is:

1. Manager receives a file-scoped request.
2. Manager tries to reuse the session that already owns that file.
3. Otherwise manager resolves a profile from config and lazy-starts or reuses
   that profile's session.

The current document ownership model is:

- session owns the real open-document state
- manager owns the cross-session ownership index
- ownership is updated from actual document open/close lifecycle events

Important distinction:

- `preload_files` remains a profile/config concept for anchor files that should
  stay open to preserve the workspace
- the runtime document store is a session concept for documents currently known
  to that session, including anchor files and transiently-opened files

## What Has Been Completed

### 1. Manager/session split

- `LspRuntime` was renamed to `LspManager`
- manager now owns:
  - configured profiles
  - session registry
  - session status / restart / stop / shutdown
  - `documentOwners` routing table
- session now owns:
  - process/client lifecycle
  - workspace initialization
  - stores
  - document ownership within the session

### 2. Lazy routing

- file-based tools no longer target a single global client
- manager resolves a session lazily per file / profile
- workspace search can fan out across sessions

### 3. Session-backed document lifecycle seam

Document lifecycle is now owned by `LspSession` directly.

The session exposes:

- `executeWithCursorContext(...)`
- `executeWithDocumentLifecycle(...)`

Those methods are created by the session and close over:

- the live client
- the session's open document store
- workspace path and config path
- narrow ownership callbacks to manager

This means operations no longer need to orchestrate document open/close by
manually threading:

- `client`
- open document state
- `workspacePath`
- lifecycle callbacks

The low-level lifecycle helpers still exist, but they are now internal session
plumbing rather than the public abstraction used by tools and operations.

### 4. `LspContext` removal

`LspContext` is no longer part of the runtime architecture.

The current surface is:

- manager returns sessions:
  - `getSessionForFile(...)`
  - `getSearchSessions(...)`
  - `getStartedSessions(...)`
- tools call operations with `LspSession`
- validation depends on `LspSession`
- operations depend on `LspSession`

This means the runtime model is now the same conceptual shape we wanted:

- `LspManager`
  - routing and lifecycle
- `LspSession`
  - operation-facing server/session object
- `LspClient`
  - transport only

### 5. Current verification status

The current state after the latest refactor is green:

- `pnpm build`
- `pnpm test:unit`

## Current Open Questions

The main architectural cleanup is done. The remaining work is now feature and
product surface, not runtime shape.

The main open questions are:

- how to expose installable/built-in LSP recipes
- how to let an agent upsert/update profile config safely
- when to introduce multi-instance session keys for the same profile family
- how to expose restart/log/status in a host-friendly way for Codex/Gemini
- which additional LSP operations to add next, especially call hierarchy

## Proposed Sequence

### Step 1. Add install/catalog surface

Build the setup/distribution layer on top of the manager:

- built-in recipe catalog for known LSPs
- install instructions as MCP resources or equivalent structured data
- profile-aware setup actions that are easy for an agent to call

The important rule is: do not make the agent hand-author YAML if we can avoid
it. Tool inputs should stay structured, and Symbols should persist YAML.

### Step 2. Add profile mutation APIs

Extend `setup` with safe config mutation:

- `upsert_profile`
- `remove_profile`
- `show_recipe`
- possibly `validate_profile`

That is what enables the interactive flow:

1. inspect recipe
2. install binary
3. write/update profile
4. start or restart the session
5. verify with inspect/outline/diagnostics

### Step 3. Add call hierarchy

Claude Code already supports:

- prepare call hierarchy
- incoming calls
- outgoing calls

Those are a good next functional addition now that the session boundary is
cleaner.

### Step 4. Improve multi-session routing

Today the manager can host multiple sessions, but the session key is still the
simple `profile::workspace` shape.

Future work should support:

- multiple instances of the same profile family where needed
- stronger routing policy when several profiles claim the same extension
- explicit selection rules when several profiles claim the same extension

## Things Not To Prioritize Yet

Do not prioritize these before the setup/profile surface lands:

- polishing alternative abstraction layers over `LspSession`
- premature multi-instance complexity without a user-facing need
- broadening the operation set further before install/start workflows are solid
- warm-session heuristics that override straightforward profile-based routing

## Older Docs To Treat Carefully

Some older docs still describe the system before the manager/session refactor,
or from the phase where introducing `LspContext` was the main improvement.

In particular:

- `docs/IMPLEMENTATION_PLAN.md`
- `docs/IMPROVEMENTS.md`

They are still useful historically, but they no longer describe the desired
end-state architecture.

`docs/CLAUDE_CODE_COMPARISON_PLAN.md` is still directionally useful, but some
of its "next step" runtime items are now completed.
