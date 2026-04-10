# AGENTS

This file captures the durable principles for working on Symbols.

Use it as the short operational guide. For deeper background, see:

- [README.md](README.md)
- [docs/PLUGIN_CONTROL_PLANE_DIRECTION.md](docs/PLUGIN_CONTROL_PLANE_DIRECTION.md)
- [docs/SERENA_TAKEAWAYS.md](docs/SERENA_TAKEAWAYS.md)
- [docs/LANGUAGE_SERVER_REFERENCE_PLAN.md](docs/LANGUAGE_SERVER_REFERENCE_PLAN.md)
- [docs/SYMBOLS_HANDOFF_2026-04-03.md](docs/SYMBOLS_HANDOFF_2026-04-03.md)

## Product Boundary

Symbols is a lightweight MCP bridge to Language Servers.

Keep the responsibilities split like this:

- skills and plugin/extension assets carry installation and troubleshooting guidance
- `language-servers.yaml` is the desired state
- MCP resources expose effective config and runtime state
- MCP tools perform navigation, inspection, search, rename, diagnostics, and control-plane actions

Do not grow Symbols into:

- a managed installer framework
- a large MCP recipe catalog
- a broad workflow product with shell/file/memory tooling

## Code Style

Prefer strict, readable TypeScript with a pragmatic blend of functional and
imperative style.

- prefer small functions, plain data, and explicit transforms
- prefer pure helpers when they keep the code simpler
- prefer immutable-style updates when they are cheap and readable
- use stateful or imperative structures when they are the clearer fit for
  runtime lifecycle, stores, sessions, or protocol plumbing

Do not force functional purity when it makes the code worse. Clarity, type
safety, and maintainability matter more than style ideology.

## Tool Surface

Prefer a small set of agent-oriented tools over exposing raw LSP requests 1:1.

For the exact current public tool and resource lists, prefer
[README.md](README.md) over duplicating inventories across multiple agent docs.

Current tools are intentionally task-shaped:

- `outline`
- `inspect`
- `search`
- `references`
- `call_hierarchy`
- `rename`
- `diagnostics`
- `completion`
- `reload`

When adding a tool:

- prefer one coherent agent action over multiple protocol-shaped actions
- default to bounded, readable output
- preserve important information even when it is inconvenient, for example multiple prepared call hierarchy targets

## Runtime Principles

Keep runtime behavior small, generic, and evidence-driven.

- Lazy-start language servers on demand. Do not eagerly start everything at boot.
- Support multiple language servers per workspace.
- Keep preload/anchor files narrow and bounded.
- Use loaders only when a language truly needs global startup gating for correctness.
- Prefer operation-specific mitigation over global startup delays.

The default startup posture should stay lean:

- `workspace_ready_delay_ms` defaults to `0`
- do not add fixed delays to compensate for one flaky operation
- if a server-specific issue affects only one operation, fix that operation instead

## Search Warm-Up

Workspace symbol search has its own warm-up policy.

Current rule:

- empty `search` results may be retried during a short post-ready warm-up window
- this is bounded and configurable via `search.warmup_window_ms`
- this is preferable to a fixed global `workspace_ready_delay_ms`

Why:

- some servers can answer most requests before workspace-wide symbol search is fully warm
- blocking the whole session for a search-specific race is the wrong tradeoff

TypeScript is the canonical example:

- cold `workspace/symbol` may miss once because `typescript-language-server` maps it to tsserver `navto`
- the first request can race project loading
- the right fix is a bounded search retry, not a custom global delay

## Loaders

Loaders are justified only when readiness genuinely gates most or all useful operations.

Use a loader for cases like Roslyn where project/solution load is foundational.

Do not add or keep a custom loader when:

- the issue only affects one operation
- the benefit is speculative
- the same problem can be solved more cleanly in the operation itself

If a custom loader is proposed, require clear live evidence that it improves behavior materially.

## Skills Over Installers

Prefer skill-first installation and configuration.

Per-language knowledge should live in:

- `.agents/skills/install-language-server/SKILL.md`
- `.agents/skills/install-language-server/references/*.md`

Each language reference should converge on:

- supported extensions
- install
- verify
- good config setup
- profile snippet
- validation notes
- gotchas
- troubleshooting
- source of truth

If a language-server-specific failure mode is learned, write it down in the relevant reference file. Do not leave it only in a PR, issue, or someone's memory.

## Config And Control Plane

Treat config editing and runtime inspection as the main workflow.

Preferred flow:

1. inspect `language-servers://profiles`
2. edit the active `language-servers.yaml`
3. call `reload`
4. validate on a real file
5. inspect `language-servers://profiles/{name}` and `/logs` if needed

Important:

- edit the active config path reported by the resources
- config-only changes can usually be applied with `reload`
- changes to MCP tool registration or runtime code require restarting the session before live validation

## Output And Formatting

Optimize tool output for model usefulness, not protocol fidelity.

- keep responses bounded
- favor grouped and summarized output
- include short source snippets where they materially improve comprehension
- avoid flooding context with huge result sets

For broad or noisy features such as `call_hierarchy`:

- prefer truncation with explicit “more not shown” markers
- default to the forgiving mode when it helps, for example both incoming and outgoing calls
- keep direction filtering available for readability

## Decision Style

When choosing an implementation, bias toward:

- the smallest change that solves the observed problem
- language-agnostic behavior first
- server-specific behavior only when proven necessary
- preserving a clear and elegant codebase over adding knobs or subsystems prematurely

Good questions to ask before adding complexity:

- Is this a global readiness problem or a single-operation problem?
- Can this live in a skill/reference instead of runtime code?
- Is the behavior backed by live evidence, not just theory?
- Does this make Symbols more focused or more bloated?
