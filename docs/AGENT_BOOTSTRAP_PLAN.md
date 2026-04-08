# Agent Bootstrap Plan

This document captures a pragmatic roadmap for evolving `@p1va/symbols` toward agent-driven setup and long-term maintainability.

It is based on a review of the current codebase shape, the MCP integration discussion, and the main product question:

> Can Symbols become a tool that an agent can install, configure, restart, and validate by itself?

## Current Baseline

Clean `origin/main` is in decent shape:

- `pnpm build` passes
- `pnpm test:unit` passes
- `pnpm test:integration:typescript` passes

The codebase is not a rewrite candidate. The main structural constraint is that runtime state is currently centered around a single global LSP session in `src/main/index.ts` and a single `LspContext`.

That is the main reason to sequence work carefully.

## Goals

- Let the MCP server start even when no LSP is available
- Let an agent inspect setup status and recover iteratively
- Make installation/configuration agent-guidable instead of purely manual
- Preserve the current strengths around diagnostics, Roslyn support, and tool quality
- Avoid a large refactor until there is a proven bootstrap flow

## Non-Goals For The First Iteration

- Full multi-LSP orchestration
- Large tool-surface redesign
- Repo-map style passive context injection
- Broad installer automation embedded fully inside the MCP server

## Key Architectural Observation

The biggest simplification opportunity is not merging 8 tools into 1 tool.

The real complexity is in:

- startup and shutdown lifecycle
- config loading and detection
- single-session global state
- protocol compatibility handling

The 8-tool surface is not currently the main source of complexity.

## Recommended Order

### Phase 0: Protect The Baseline

Before adding major features:

- keep `main` building and linting clean
- avoid landing scratch/debug files
- add tests around runtime lifecycle before touching startup too much

Acceptance criteria:

- `pnpm build` passes
- unit tests pass
- at least one integration suite passes in CI

### Phase 1: Decouple MCP Startup From LSP Availability

This is the highest-priority change.

Today, Symbols effectively hard-fails if no LSP is detected or initialized. That blocks any agent-driven recovery flow because the MCP server never becomes usable.

Implement:

- server can start in a degraded mode without an active LSP
- runtime status distinguishes:
  - no LSP detected
  - LSP configured but failed to spawn
  - LSP spawned but failed to initialize
  - connected and ready
- tools that require LSP return a structured, actionable error

Suggested internal change:

- introduce an `LspManager` or `SessionManager` object
- move module-level mutable state out of `src/main/index.ts`
- make `createContext()` runtime-backed instead of depending on global variables

Acceptance criteria:

- `symbols start` can come up without a working LSP
- MCP clients can still list tools/resources
- the server can explain why it is degraded

### Phase 2: Add Minimal Setup Surface

Once startup is graceful, add the smallest useful control plane.

Add an always-available setup tool:

- `status`
- `detect`
- `restart`

Add always-available resources:

- `symbols://setup/status`
- `symbols://setup/instructions`
- optionally `symbols://setup/languages`

Keep this intentionally small. The goal is operational recovery, not a large management API.

Acceptance criteria:

- an agent can inspect setup state without shelling out blindly
- an agent can trigger a restart after changing config or installing an LSP
- instructions are readable through MCP resources

### Phase 3: Prove Agent-Led Installation

This is the core product experiment.

Target one narrow success path first:

1. TypeScript bootstrap
2. C# / Roslyn bootstrap

Recommended flow:

1. Agent adds or uses the Symbols MCP server
2. Agent calls `setup.status`
3. Agent reads setup instructions resource
4. Agent installs or locates the LSP through shell commands
5. Agent updates Symbols config if needed
6. Agent calls `setup.restart`
7. Agent verifies with `outline`, `inspect`, or `diagnostics`

Important design choice:

- host MCP config should only describe how to launch Symbols
- Symbols should own LSP-specific config
- discovered command paths or overrides should live in Symbols config, not host MCP config

Acceptance criteria:

- documented end-to-end TypeScript bootstrap succeeds
- documented end-to-end Roslyn bootstrap succeeds
- failure cases are diagnosable through status + logs

### Phase 4: Expand Read-Only Semantic Navigation

Add call hierarchy support only after bootstrap and recovery are proven.

Implement:

- prepare call hierarchy
- incoming calls
- outgoing calls

This improves parity and utility, but it is not the primary adoption unlock.

Acceptance criteria:

- tools work in at least TypeScript and one additional language
- output format remains consistent with the rest of Symbols

### Phase 5: Multi-LSP Runtime

This should be last.

Supporting multiple LSPs at the same time is valuable, but it is a materially larger refactor than the earlier phases.

Likely requirements:

- multiple runtime sessions instead of one global session
- routing rules per file/language/workspace
- per-session diagnostics and log ownership
- explicit resource and status reporting per session
- new config model for multiple active servers

Do not start here.

Acceptance criteria:

- runtime model no longer assumes a single `lspClient`
- diagnostics/logs/status are attributable to the correct session
- restart/reconfigure operations can target a specific session

## Recommended Testing Strategy

The current test suite is strongest around:

- CLI parsing
- operation-level unit tests
- selected integration flows

The weakest areas, and the ones most likely to break during this roadmap, are:

- startup lifecycle
- degraded startup
- restart behavior
- shutdown behavior
- LSP client request/notification compatibility
- workspace loader initialization

Add tests in this order:

1. startup in degraded mode
2. restart after config change
3. restart after successful install
4. shutdown/restart race conditions
5. Roslyn-specific bootstrap path

## Development Speed-Ups

If the goal is to deliver this roadmap faster without destabilizing `main`, add a
small amount of delivery infrastructure first.

These are not product features. They are force multipliers for iteration speed.

### 1. Build A Fake LSP Harness

Add a lightweight stdio test server that can simulate:

- spawn succeeds but initialize fails
- spawn succeeds but initialize hangs
- spawn succeeds and exits early
- fully ready happy path

Use this for Phase 1 and Phase 2 tests instead of depending on real TypeScript
or Roslyn installs for every lifecycle case.

Why this matters:

- degraded startup becomes deterministic to test
- restart/shutdown races become reproducible
- CI becomes less dependent on external tooling
- product iteration stops being blocked on real LSP setup

### 2. Extract A Minimal Runtime Seam Early

Before adding setup tools, introduce the thinnest possible runtime object
(`LspManager`, `SessionManager`, or similar) with a narrow API such as:

- `status()`
- `start()`
- `restart()`
- `shutdown()`
- `getContext()` or `getActiveContext()`

The goal is not a large refactor.

The goal is to stop lifecycle logic from being trapped in module-level mutable
state inside `src/main/index.ts`.

Why this matters:

- startup behavior becomes unit-testable
- degraded mode becomes representable without throwing from `createContext()`
- later setup tools can reuse the same lifecycle entry points

### 3. Freeze The Setup Contract Before Wiring Internals

Before implementing `setup.status`, `setup.detect`, and `setup.restart`, define
their payload shapes and degraded error format.

That contract should answer, at minimum:

- what state the runtime is in
- what config source was used
- which LSP was requested or detected
- whether spawn failed, initialize failed, or no LSP was found
- what the next recommended recovery action is

Then add golden-style tests around those responses.

Why this matters:

- avoids churn across tools, docs, and demos
- keeps agent-facing behavior stable while internals move
- makes failure handling design explicit instead of accidental

### 4. Create A Bootstrap-Specific Test Lane

Add a dedicated test lane focused on bootstrap and recovery, separate from the
existing language integration suites.

Suggested cases:

1. no config found
2. LSP name unknown
3. command missing from `PATH`
4. process exits immediately after spawn
5. initialize request times out or fails
6. restart after config change
7. restart after successful install

Why this matters:

- the risky code in this roadmap is lifecycle code, not symbol lookup
- failures become easier to localize than in full language integration tests
- development feedback gets faster and more actionable

### 5. Surface Config Resolution In Status

The config loader already tracks where configuration came from. Expose that in
status output from the start.

Include:

- resolved config path
- config source category
- resolved workspace path
- selected or auto-detected LSP name

Why this matters:

- removes guesswork during bootstrap failures
- makes agent-led recovery more reliable
- reduces the need to inspect logs or shell state manually

### 6. Add Developer Loop Commands For Bootstrap Work

Add a few focused scripts or `just` recipes for the new workflow instead of
relying on general-purpose commands only.

Examples:

- run Symbols in degraded mode against a fake LSP
- restart after a config edit
- run only bootstrap/lifecycle tests
- run one end-to-end TypeScript bootstrap flow

Why this matters:

- lowers friction for repeated manual validation
- encourages testing the actual bootstrap path, not only internal helpers
- makes issue reproduction faster for Gemini/Codex threads

### 7. Add A Clean Resource Registration Seam

Setup resources are part of the plan, but the codebase currently only registers
tools.

Introduce a small registration seam for always-available resources before adding
many setup details.

Why this matters:

- avoids ad hoc resource wiring later
- keeps setup/status/instructions logic grouped cleanly
- reduces follow-up refactor cost when setup resources are added

### 8. Persist Last Startup Attempt And Recent Failure Context

When startup fails or degrades, persist enough structured state to report:

- last attempted command
- last failure stage
- last failure message
- recent window/log output when available

This can be in memory for the first iteration.

Why this matters:

- makes `setup.status` and `logs` much more useful immediately
- reduces turnaround time on bootstrap bugs
- helps agents recover without rerunning blind guesses

## Recommended Acceleration Order

If implementation speed is the priority, do these in order:

1. fake LSP harness
2. minimal runtime seam
3. degraded-start smoke tests
4. `setup.status`
5. documented TypeScript bootstrap
6. documented Roslyn bootstrap

## Suggested Deliverables

### Milestone 1

- graceful no-LSP startup
- structured degraded status
- no regression in current TypeScript integration

### Milestone 2

- `setup` tool with `status`, `detect`, `restart`
- setup resources
- logs available during degraded mode

### Milestone 3

- documented TypeScript agent bootstrap
- documented Roslyn bootstrap
- reproducible demo for Gemini/Codex issue threads

### Milestone 4

- call hierarchy support

### Milestone 5

- multi-LSP runtime manager

## Strategic Summary

If the goal is to make Symbols compelling for Gemini CLI and Codex users, the best path is:

1. make startup recoverable
2. make status inspectable
3. prove agent-led setup
4. add parity features after the bootstrap loop is real

The most valuable differentiator is not a bigger tool count.

It is a system that can:

- survive missing dependencies
- explain its own state
- help an agent recover
- keep working in difficult environments like Roslyn/C#
