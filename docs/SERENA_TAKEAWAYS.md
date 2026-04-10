# Serena Takeaways For Symbols

This note captures what we learned from reviewing Serena's language-server
configuration docs and selected language-server wrappers, and how that should
shape Symbols.

Reviewed sources:

- https://oraios.github.io/serena/02-usage/050_configuration.html
- https://oraios.github.io/serena/01-about/035_tools.html
- https://github.com/oraios/serena/blob/main/src/solidlsp/language_servers/common.py
- https://github.com/oraios/serena/blob/main/src/solidlsp/language_servers/typescript_language_server.py
- https://github.com/oraios/serena/blob/main/src/solidlsp/language_servers/csharp_language_server.py
- https://github.com/oraios/serena/blob/main/src/solidlsp/language_servers/pascal_server.py

## Decision

Symbols should stay skill-first for language-server installation and setup.

We do not want to copy Serena's managed-install framework into the runtime.
Instead:

- installation and configuration guidance should live in Markdown skills and
  reference files
- the agent should perform the install and config work using that guidance
- the runtime should stay small and only grow special behavior where a real
  language-server quirk justifies it

This keeps the codebase lean while still allowing us to capture server-specific
knowledge in a repeatable form.

## What Serena Gets Right

Serena is strong in three areas:

- deterministic installation guidance, including pinned versions and explicit
  runtime requirements
- language-specific runtime hooks for known server quirks
- practical escape hatches such as overriding the language-server path instead
  of forcing a managed install

The TypeScript wrapper is especially relevant because it waits for
`$/typescriptVersion` and `$/progress` indexing signals instead of relying only
on timing guesses.

The C# wrapper is also a useful model for calling out solution/project
expectations, runtime prerequisites, and Roslyn-specific initialization needs.

## What We Do Not Want To Copy

We should not copy Serena's broader product shape:

- no large managed-install subsystem in the core runtime
- no per-platform downloader matrix in TypeScript for every supported server
- no expansion into file tools, shell tools, memories, modes, or other
  workflow-heavy MCP surface area

Serena is solving a broader agent product. Symbols should remain a focused LSP
bridge with a small, clear tool surface.

## Direction For Symbols

### 1. Put More Knowledge Into The Install Skill

The main place to absorb Serena's value is the existing
`install-language-server` skill and its per-language reference files.

Each language reference should converge on a consistent structure:

- preferred install path
- fallback install path
- verify command
- profile snippet
- readiness notes
- server-specific settings
- validation guidance
- troubleshooting notes

This gives us the repeatability of Serena's setup guidance without embedding a
large installer framework in the runtime.

### 2. Keep Runtime Behavior Narrow And Evidence-Driven

We should only add runtime special cases when they solve a known problem better
than generic config knobs.

Current best candidate:

- add a TypeScript workspace loader that watches `$/progress` readiness events
  when available, and falls back cleanly to the current preload/delay behavior

This is a good fit for Symbols because the loader abstraction already exists and
`$/progress` notifications are already plumbed through the client.

### 3. Keep Escape Hatches Simple

Serena's `ls_path` idea is sound even if we do not copy its full config model.

For Symbols, the equivalent principle is:

- prefer profiles that can point at an existing executable or local command
- keep machine-specific paths and overrides in YAML
- let the skill explain when to use a local install versus `npx`, `dotnet`, or
  another launcher

### 4. Preserve The Product Boundary

Symbols should continue to divide responsibilities like this:

- skills/docs carry installation knowledge
- YAML captures desired configuration
- MCP resources report effective config and runtime state
- MCP tools execute navigation and inspection actions

That boundary is cleaner than Serena's larger all-in-one tool surface.

## Concrete Follow-Ups

Near-term work that follows from this review:

1. Refresh the TypeScript and Roslyn install-skill reference docs with the best
   Serena-derived guidance.
2. Add a TypeScript workspace loader that waits on `$/progress` when the server
   provides it.
3. Keep using the current skill-first approach instead of building a managed
   installer subsystem in Symbols.

## Summary

The main lesson from Serena is not "build a bigger runtime."

The useful lesson is:

- encode known-good language-server guidance clearly
- keep installation logic in agent-facing instructions
- teach the runtime only the server-specific readiness behavior that is worth
  automating

That gives Symbols a better chance of reaching Serena-like reliability without
giving up a small and elegant codebase.
