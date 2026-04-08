---
name: symbols-semantic-navigation
description: Prefer Language Server navigation and rename tools over text search when the user asks to inspect symbols, find references, rename code safely, gather diagnostics, or explore APIs in a language that has a configured profile.
---

# Language Server Navigation

Use this skill when the codebase already has a relevant language server, or when the task should check that first. The goal is to use the current Language Servers tool surface deliberately instead of falling back to grep-driven workflows too early.

For a compact tool-selection cheat sheet, read `references/tool-selection.md`.

## Workflow

1. Check `language-servers://profiles` for a matching profile.
   - If there is no suitable profile, use the `install-language-server` skill.
2. Start with the narrowest LSP-backed tool that answers the question.
   - `outline` for file structure and symbol locations
   - `inspect` for symbol details and docs
   - `references` for usages
   - `rename` for semantic renames
   - `diagnostics` for compile or type errors
   - `completion` for API discovery at a point
   - `search` when the server supports language-aware search
3. Use a real file path and precise line and character coordinates.
   - If the user did not provide coordinates, use `outline` first to find them.
4. Treat file-backed tool calls as stateful.
   - They can lazily start a dormant session.
   - They can change the runtime state you see in the resources.
5. If results look wrong, inspect:
   - `language-servers://profiles/{name}`
   - `language-servers://profiles/{name}/logs`
   - then use `setup.reload` only if the config changed

## Tool Choice Rules

- Prefer `rename` over grep-based renames when a matching LSP exists.
- Prefer `references` over text search for call sites or symbol usage.
- Prefer `inspect` over opening arbitrary files when you need docs, types, or declaration context.
- Use `search` only when the server and current indexing state can support it.
- Use plain text tools only when there is no working LSP profile or when the task is explicitly non-semantic.

## Rename Workflow

- Before renaming, use `inspect` or `references` on the declaration site to confirm you are on the right symbol.
- Use `references` to understand scope when the rename could be broad or risky.
- Prefer the Language Servers `rename` tool over manual text edits when the server supports it.
- After renaming, verify with diagnostics or a build if the task warrants it.
- If the server does not support rename for that language, say so explicitly and only then fall back to manual edits.

## Known Runtime Behaviors

- `not_started` after `setup.reload` is normal. The first matching file-backed tool call should start the profile.
- Search quality varies by server. TypeScript often needs a preload anchor to keep enough index state alive, and glob-based `preload_files` entries are usually easier to reuse than exact paths.
- Logs are best-effort. A running server may still have no window-log messages.
- Resources are the read surface. Use them for state and log inspection before guessing.

## Output Expectations

- Name the Language Servers tool you chose and why.
- Mention the file and coordinates used for the call.
- If you fall back to plain text search or manual edits, state why the LSP path was not suitable.
