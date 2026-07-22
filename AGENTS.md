# AGENTS

This file captures the durable principles for working on Symbols. Keep it short,
current, and operational; historical plans are useful evidence, not active
policy.

Current sources of truth:

- [README.md](README.md) for the public tool, resource, skill, and install surface
- [docs/MAINTENANCE.md](docs/MAINTENANCE.md) for accepted follow-up work
- [docs/PLUGIN_CONTROL_PLANE_DIRECTION.md](docs/PLUGIN_CONTROL_PLANE_DIRECTION.md)
  for the product and distribution boundary
- [docs/LANGUAGE_SERVER_REFERENCE_PLAN.md](docs/LANGUAGE_SERVER_REFERENCE_PLAN.md)
  for per-language guidance
- [docs/CODE_QUALITY_ROADMAP.md](docs/CODE_QUALITY_ROADMAP.md) for the rationale
  behind the current TypeScript contracts

When an old plan conflicts with this file, current code, or the maintenance
backlog, update or archive the old plan instead of preserving two policies.

## Product Boundary

Symbols is a lightweight MCP bridge to Language Servers.

Keep the responsibilities split like this:

- skills and plugin assets carry installation and troubleshooting guidance
- `language-servers.yaml` is desired state
- MCP resources expose effective config and runtime state
- MCP tools perform navigation, inspection, search, rename, diagnostics, and
  control-plane actions

Do not grow Symbols into:

- a managed installer framework
- a large MCP recipe catalog
- a broad workflow product with shell, file, or memory tooling

## Architecture And Contracts

The intended flow is:

`tools -> preparation -> operations -> session -> client`

- tools parse MCP input, keep file-to-session routing visible, and render output
- preparation validates workspace, file, and position semantics and resolves
  session-bound targets
- operations issue protocol requests and normalize protocol responses
- sessions own process and document lifecycle
- the client owns transport and LSP initialization plumbing

Keep these contracts explicit:

- use official typed LSP request descriptors so method, parameters, and result
  types cannot drift independently
- treat Language Server responses as external data; normalize each supported
  protocol union once at the operations boundary and expose one honest internal
  shape
- MCP inputs are one-based and LSP coordinates are zero-based; convert once
  during preparation and once at the user-facing render edge
- enrichment returns exactly one result per request in input order
- operations and lifecycle callbacks return values or throw; preserve the
  original error as `cause`, and use `Result` only when callers genuinely branch
- cleanup belongs in `finally` paths and must not replace the primary failure

## Code Style

Prefer strict, readable TypeScript with a pragmatic blend of functional and
imperative style.

- prefer small functions, plain data, and explicit transforms
- prefer pure helpers and immutable-style updates when they remain simple
- use stateful or imperative structures when they are the clearer fit for
  runtime lifecycle, stores, sessions, or protocol plumbing
- establish each fact once: coordinate base, URI conversion, normalization,
  and output limits should have one implementation
- make sameness explicit and differences deliberate
- earn abstractions; a little direct duplication is better than a framework
  with hooks or branching flags
- keep comments that record constraints the type system cannot express; delete
  narration and changelog comments

Do not force functional purity or architectural symmetry when it makes the code
harder to understand. Clarity, type safety, and maintainability matter more than
style ideology.

## Tool Surface

Prefer a small set of agent-oriented tools over exposing raw LSP requests 1:1.
The README is authoritative for the current inventory.

When adding or changing a tool:

- prefer one coherent agent action over multiple protocol-shaped actions
- keep session routing and tool-specific control flow understandable from the
  handler
- default to bounded, readable output
- preserve important information even when it is inconvenient, such as
  multiple call-hierarchy targets returned by the server
- add a shared tool skeleton only when at least three handlers are genuinely
  isomorphic without hooks or mode flags

## Runtime Principles

Keep runtime behavior small, generic, and evidence-driven.

- lazy-start language servers on demand; do not eagerly start every profile
- support multiple language servers per workspace
- keep preload and anchor files narrow and bounded
- use a loader only when readiness gates most useful operations, as with Roslyn
  project or solution loading
- prefer an operation-specific mitigation over a global startup delay
- keep `workspace_ready_delay_ms` at its default of `0` unless live evidence
  proves a profile needs otherwise
- bounded search warm-up retries are appropriate for servers whose first
  `workspace/symbol` request races indexing; do not generalize that into a
  fixed delay for every operation

TypeScript 7's native Language Server normally needs neither preload files nor a
startup delay. Keep legacy `typescript-language-server` workarounds scoped to a
legacy profile and require a reproducible incompatibility before adding them.

## Skills And Distribution

Prefer skill-first installation and configuration.

`.agents/skills/` is the canonical source. The root `skills/` directory used by
Antigravity and `plugins/symbols/skills/` used by the Codex plugin are generated
mirrors.

- edit only the canonical skill files
- run `pnpm sync:skills` after skill changes
- commit both generated mirrors
- never repair drift by editing a generated copy directly

Per-language knowledge belongs in:

- `.agents/skills/install-language-server/SKILL.md`
- `.agents/skills/install-language-server/references/*.md`

Each language reference should cover supported extensions, install, verify,
good config setup, a profile snippet, validation, gotchas, troubleshooting, and
upstream sources. Record learned server-specific failures there rather than
leaving them only in a PR, issue, or conversation.

## Config And Control Plane

Treat config editing and runtime inspection as the main workflow:

1. inspect `language-servers://profiles`
2. edit the active `language-servers.yaml` reported by that resource
3. call `reload`
4. validate on a real file
5. inspect `language-servers://profiles/{name}` and its `/logs` resource if
   needed

Config-only changes can usually be applied with `reload`. Changes to MCP tool
registration or runtime code require restarting the MCP session before live
validation.

Language Server commands and environments are executable policy. Do not broaden
workspace-config discovery or automatic execution without resolving the trust
model tracked as `SEC-002`. Filesystem mutations must remain inside the
canonical workspace boundary and must be completely preflighted before writes.

## Output And Formatting

Optimize output for model usefulness, not protocol fidelity.

- keep responses bounded
- favor grouped and summarized output
- include short source snippets when they materially improve comprehension
- convert zero-based protocol positions only at the final display edge
- use explicit omission markers when truncating useful data
- cover stable public rendering with focused exact-output tests rather than
  large snapshots

For broad features such as `call_hierarchy`, default to the forgiving mode when
useful, retain direction filtering, and bound every target and call list.

## Verification

Use the pinned toolchain with `nvm use` and the repository's pnpm version.

For normal code changes, run:

- `pnpm format:check`
- `pnpm build`
- `pnpm test:unit`
- `pnpm check:unused`
- `pnpm check:unused:ts`

Run the relevant language integration test after changing protocol behavior,
session lifecycle, preparation, routing, or tool output. Add focused contract
tests for accepted protocol variants, coordinate boundaries, cleanup, mutation
preflight, enrichment cardinality, and public formatting.

## Decision Style

When choosing an implementation, bias toward:

- the smallest change that solves the observed problem
- language-agnostic behavior first
- server-specific behavior only when proven necessary
- operation-specific fixes over global delays or framework changes
- preserving a clear and elegant codebase over adding knobs or subsystems
  prematurely

Before adding complexity, ask:

- Is this a global readiness problem or a single-operation problem?
- Can this knowledge live in a skill or reference instead of runtime code?
- Is the behavior backed by live evidence?
- Does the abstraction expose a real invariant or merely hide different flows?
- Does this make Symbols more focused or more bloated?
