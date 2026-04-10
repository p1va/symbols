# Language Server Reference Plan

This document tracks the desired shape of the per-language reference files used
by the `install-language-server` skill and compares the current references
language by language.

The goal is not to move installation logic into the runtime. The goal is to
make the Markdown references reliable enough that an agent can install,
configure, validate, and troubleshoot a language server with minimal guesswork.

## Target Structure

Each language reference should eventually provide:

- supported extensions
- install path
- verify command
- good config setup guidance
- profile snippet
- validation notes
- gotchas
- troubleshooting notes
- source-of-truth links for the language server

Some files already cover most of this, but the sections are not always named or
emphasized consistently. In practice, `good config setup` and `gotchas` are the
two areas that are still underspecified.

## Current Comparison

| Language | Current strengths | Gaps to fill next |
| --- | --- | --- |
| TypeScript | Strong install, verify, profile, preload, and search-readiness guidance. Good upstream links. | Keep the guidance centered on preload choice, cold-search warm-up behavior, and the `search.warmup_window_ms` knob rather than adding TypeScript-specific loader behavior. |
| Roslyn | Strong install, verify, profile, `workspace_loader`, and workspace-marker guidance. Good practical troubleshooting. | Add clearer source-of-truth references for the actual language-server package and runtime baseline. Call out solution/project expectations and `.NET` requirements as first-class gotchas. |
| Pyright | Good install coverage with `npx`, global, `pip`, and `pipx` options. Good virtualenv troubleshooting. | Expand the “good config setup” section for `pyproject.toml`, virtualenv detection, and when to prefer pull diagnostics. |
| Clangd | Good config guidance around `compile_commands.json`, `compile_flags.txt`, and preload files. Strong upstream links. | Separate semantic gotchas from generic troubleshooting, especially that compile database quality is often the real source of navigation quality. |
| Gopls | Good minimal install, verify, environment, and module-marker guidance. Good upstream links. | Add a stronger “good config setup” section around `go.mod`, `go.work`, and cache/path expectations. |
| JDTLS | Good profile shape and practical notes about Gradle/Maven markers and JDK baseline. | Strengthen source-of-truth links and installation guidance for non-Homebrew users. Add clearer gotchas around JDK vs JRE and persistent config/data directories. |
| Kotlin | Good minimal profile and workspace-marker guidance. | This is still thin. Add better source-of-truth links, platform install guidance beyond Homebrew, and known gotchas around Gradle/Maven workspace shape. |
| Lua | Good install coverage and a practical workspace-marker example for Neovim-style repos. | Add stronger gotchas around Lua runtime/globals/workspace-library configuration and point to the official configuration docs as source of truth. |
| PHP | Good minimal install and basic project-marker guidance. | Add stronger source-of-truth links and known gotchas around dependency indexing and project shape. “Good config setup” is still thin here. |
| Ruby | Good install coverage for both global gem and Bundler-based use. Good project-environment guidance. | Strengthen the “good config setup” story around `bundle exec ruby-lsp` and source-of-truth links for project-scoped use. |
| Rust | Clean, solid minimal reference with clear Cargo routing guidance and good source links. | Add a bit more “good config setup” detail for Cargo workspaces and when toolchain state affects results. |
| Swift | Good minimal setup with toolchain-based install model and sensible workspace markers. | Add stronger source-of-truth install links and clearer gotchas for Xcode-backed workspaces versus SwiftPM projects. |

## Priorities

Highest-value references to improve first:

1. TypeScript
2. Roslyn
3. Pyright
4. JDTLS
5. Kotlin

These either cover our most important ecosystems or currently have the biggest
gap between “works” and “guides the model well.”

## Recommended Section Naming

To make the references easier for agents to use consistently, we should
converge on these headings:

- `### Supported Extensions`
- `### Install`
- `### Verify`
- `### Good Config Setup`
- `### Profile Snippet`
- `### Validation Notes`
- `### Gotchas`
- `### Troubleshooting`
- `### Source Of Truth`

We do not need to rename every file immediately, but new edits should move in
this direction.

## Practical Rule

If we know a language-server-specific failure mode, it should not live only in
someone's memory or in a one-off issue thread. It should land in the reference
file as either:

- a `Good Config Setup` recommendation
- a `Gotchas` note
- a `Troubleshooting` note

That is the main way to get Serena-like reliability without importing Serena's
managed-install machinery into Symbols.
