# Claude Code Comparison Plan For Symbols

This document turns the Claude Code LSP review into a concrete plan for
`@p1va/symbols`.

The goal is not to copy Claude Code blindly.

The goal is to preserve the parts where Symbols is already stronger, borrow the
runtime and packaging ideas that materially help agent adoption, and package the
result in a way that is easy to install in Gemini CLI and Codex.

## Executive Summary

Symbols is not behind Claude Code across the board.

Symbols is already stronger in a few important areas:

- richer and more flexible YAML configuration
- direct command mode
- explicit file lifecycle strategies
- Roslyn-specific workspace initialization
- push and pull diagnostics support
- tested support for the official C# language server

The main weaknesses are architectural and operational:

- a single global LSP session
- MCP startup hard-coupled to LSP startup
- no always-available status or restart control plane
- no lazy multi-session runtime
- no host-native packaging yet for Gemini CLI and Codex

Claude Code's most reusable ideas are:

- a manager / instance / client split
- lazy spawning on demand
- a runtime that can exist before any LSP is running
- persistent open document state per session
- a machine-readable distribution format paired with human install docs
- a small additional operation surface such as call hierarchy

## Keep These Symbols Strengths

Do not regress these areas while refactoring:

- YAML config with multiple named language servers and config-source precedence
- environment expansion in config values and commands
- `start` mode with auto-detection and `run` mode with inline commands
- explicit `workspace_loader` support, especially Roslyn
- `preload_files` as a first-class concept
- push and pull diagnostics strategies
- dynamic diagnostic provider discovery via capabilities and registrations
- explicit file lifecycle policy rather than purely ad hoc opens

## Borrow These Claude Code Ideas

### 1. Runtime split

Borrow the separation of concerns, not the exact file layout.

Recommended internal split:

- `SessionManager`: owns runtime lifecycle and routing
- `LspSession`: owns one server process, one JSON-RPC connection, one document set
- `LspClient`: owns protocol transport and request / notification plumbing
- `Operation layer`: maps MCP tools to LSP requests
- `Formatter layer`: maps raw LSP responses to stable output shapes

This is the most important change.

### 2. Degraded startup

Symbols should be able to boot the MCP server before a working LSP exists.

Required runtime states:

- `no_config`
- `detected_not_started`
- `spawn_failed`
- `initialize_failed`
- `ready`
- `stopped`

This enables `setup.status`, `setup.detect`, `setup.restart`, and agent-led
repair.

### 3. Lazy server startup

Claude Code loads config eagerly but spawns LSP servers only on first use.

Symbols should do the same when it eventually supports multiple sessions:

- load all candidate profiles at startup
- choose a session per file or workspace
- spawn only when a tool call or preload action actually requires it

### 4. Persistent document ownership

Claude Code's practical advantage for TypeScript is that once a file is opened,
it stays open for the session.

Symbols should keep its explicit lifecycle model, but move to a per-session
document registry with:

- persistent anchor files kept open intentionally
- transient opens used only where they actually help
- real `didChange` and `didSave` handling
- monotonic document versions per URI

### 5. More operations

Port the missing read-only navigation operations:

- `prepareCallHierarchy`
- `incomingCalls`
- `outgoingCalls`

These fit naturally into the existing Symbols tool surface.

### 6. Better response normalization

Claude Code has a cleaner normalization + formatting separation than Symbols.

Borrow these patterns:

- normalize `LocationLink` into a stable location form
- normalize document symbols before formatting
- separate raw LSP payload handling from user-facing text formatting
- keep per-operation summary counts and grouped output

## Do Not Borrow These Claude Code Choices

These choices are not upgrades for Symbols:

- plugin-only config in place of YAML
- hardcoded `version: 1` for all opened or changed documents
- relying on "restart on next use" as the main recovery story
- weak document-close integration
- under-specified capability gating

## Current Gaps In Symbols

These are the main gaps to close.

### Architecture

- module-level mutable runtime state in `src/main/index.ts`
- `createContext()` throws when LSP is unavailable
- startup path is blocked on successful LSP initialization

### Lifecycle

- no first-class restart API
- no always-available status surface
- no explicit session abstraction
- no lazy multi-session orchestration

### File state

- most operations use `transient` open / request / close behavior
- no central per-session open-document registry beyond preload tracking
- no `didChange` / `didSave` lifecycle for ongoing session coherence

### Tooling surface

- no call hierarchy operations
- no setup tool or setup resources
- no host-native plugin / extension packaging

### Presentation

- transport concerns, normalization, and formatting are still more mixed than
  they should be
- output consistency can improve by pulling formatting into dedicated helpers

## Recommended Implementation Sequence

### PR 1: Introduce a runtime seam

Add a narrow runtime object, for example:

- `status()`
- `start()`
- `restart()`
- `shutdown()`
- `getContext()`

This PR should move mutable lifecycle state out of `src/main/index.ts` without
attempting multi-LSP yet.

### PR 2: Allow degraded MCP startup

Make the MCP server start even if:

- no config is found
- the binary is missing
- spawn fails
- initialize fails

LSP-dependent tools should return structured actionable errors instead of making
the whole server unavailable.

### PR 3: Add setup control plane

Add an always-available setup tool with subcommands:

- `status`
- `detect`
- `restart`

Add setup resources:

- `symbols://setup/status`
- `symbols://setup/instructions`
- `symbols://setup/profiles`

### PR 4: Improve session document management

Add a real session document store:
