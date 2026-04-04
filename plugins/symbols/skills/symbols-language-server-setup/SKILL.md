---
name: symbols-language-server-setup
description: Install, enable, reconfigure, or troubleshoot a language server in Symbols by editing the active language-servers.yaml, calling setup.reload, and validating with Symbols resources, logs, and file-backed LSP tools. Use when the user wants TypeScript, Python, Rust, C#, Go, Java, or another LSP to work in the current repo, or when a configured Symbols profile is failing to start or returning poor diagnostics.
---

# Symbols Language Server Setup

Use this skill for the setup loop:

1. find the active config
2. add or fix one profile
3. call `setup.reload`
4. validate on a real file
5. inspect resources and logs if it fails

Do not restart the MCP server after config edits unless the user explicitly asks. The intended apply-config action is `setup.reload`.

## Workflow

1. Read `symbols://language-servers` first.
   - Use it to find the active `configPath`, current profiles, and runtime state.
   - Edit that config path, not a guessed file.
2. If `configPath` is `null` or manager `state` is `uninitialized`, bootstrap the config first.
   - Prefer `./language-servers.yaml`.
   - `npx -y @p1va/symbols@latest config init` is the simplest bootstrap path.
   - Do this before `setup.reload` or any file-backed LSP validation call.
3. Choose the smallest useful profile for the target language.
   - For TypeScript, read `references/typescript.md`.
   - For Python/Pyright, read `references/pyright.md`.
   - For Rust, read `references/rust.md`.
   - For other languages, use the shipped default config shape as the starting point rather than inventing a brand-new schema.
4. Install or verify the server binary if needed.
   - Prefer the command already used by the profile.
   - If the profile uses `npx`, a separate global install is optional.
   - Verify the executable before assuming setup is correct.
5. Edit the YAML minimally.
   - Keep `command`, `extensions`, `workspace_files`, and `diagnostics` explicit.
   - Add `preload_files` only when the server needs them for indexing or search.
   - Add machine-specific `environment` only when required.
6. Call `setup.reload`.
   - Treat this as the one apply-config action.
   - It reloads config and restarts only the sessions that were already running.
   - Dormant profiles stay `not_started` until a matching file-backed tool call uses them.
7. Validate on a real file for that language.
   - Prefer `outline`, `inspect`, `references`, `completion`, or `diagnostics`.
   - Use a file with an extension that matches the configured profile.
8. If validation fails, inspect:
   - `symbols://language-servers/{name}`
   - `symbols://language-servers/{name}/logs`

## Guardrails

- If a profile still shows `not_started` after `setup.reload`, that is expected. Run an LSP-backed tool on a matching file.
- If `configPath` is `null` or manager state is `uninitialized`, do not call `setup.reload` yet. Create the config first.
- If the resource shows `error`, read the logs before broadening the config.
- Do not edit multiple config files speculatively. Use the active `configPath`.
- Prefer explicit extensions. Do not rely on unrelated profiles to inherit a global fallback map.
- Keep changes local to the target language. Do not rewrite the full config unless the user asked for that.

## Common Failures

- Wrong config file: the skill edited `./language-servers.yaml` but the active config is elsewhere.
- No file match: the profile exists but no tool was run on a matching file extension.
- Wrong workspace markers: `workspace_files` do not match the repo, so the profile never routes naturally.
- Binary missing: the configured command is not executable on this machine.
- Python env mismatch: Pyright starts, but diagnostics only show import or interpreter issues.
- TypeScript search weak or empty: no useful `preload_files`, so the server never builds enough index state.

## Output Expectations

- Say which config file was edited.
- Say which profile was added or changed.
- Confirm that `setup.reload` was run.
- Confirm the validation tool and target file used.
- If setup failed, report the specific resource or log evidence instead of giving generic advice.
