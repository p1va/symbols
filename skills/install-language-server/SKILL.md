---
name: install-language-server
description: Install, configure, validate, or troubleshoot a language-server profile for the `language-servers` MCP by editing the active config, running `reload`, and checking a real file.
---

# Install Language Server

## Context

`language-servers` is an MCP bridge to one or more Language Server Protocol servers. The MCP does not contain TypeScript, Pyright, Rust, or Roslyn itself. Instead it reads the active config file reported by `language-servers://profiles`. Each entry under `language-servers:` declares one profile: how to launch the server, which file extensions it handles, which workspace markers it expects, and any preload or environment settings.

When an MCP tool like `outline`, `inspect`, `references`, `rename`, `completion`, or `diagnostics` is called on a matching file, the MCP chooses the matching profile, starts that language server over stdio if needed, and proxies the request.

This skill is for the part the MCP will not do automatically:

- make sure the `language-servers` MCP server is available in this session
- find or bootstrap the active config file
- install or verify the target language server binary
- add or update one profile in that YAML file
- run `reload` so the MCP rereads the YAML
- validate that a real file now routes to the right spawned language server

Use this skill for both setup and troubleshooting:

- Setup: bootstrap config if needed, add a new profile, reload, and validate.
- Troubleshooting: inspect the existing profile and logs first, verify the binary and routing on a real file, and only edit YAML if the evidence points to a config problem.

Use `language-servers://profiles` as the source of truth:

- it proves the MCP server is connected
- `manager.configPath` tells you which YAML file is active
- `manager.state` tells you whether config exists or setup is still `uninitialized`
- `profiles` shows the declared profiles from YAML with runtime state overlaid on top
- `language-servers://profiles/{name}` and `language-servers://profiles/{name}/logs` show per-profile details and logs

If `language-servers://profiles` is unavailable, stop and say that the `language-servers` MCP server is not connected in this session. Do not guess config state without the resource.

## Procedure

- [ ] Read `language-servers://profiles` MCP resource.
  - This is both the MCP-availability check and the config-discovery step.
  - Use `manager.configPath`, `manager.state`, and `profiles` to find the active YAML file and current runtime state.
  - Edit the active `configPath`. Do not guess a different YAML file.
- [ ] If troubleshooting an existing profile, inspect before editing.
  - Check whether the target profile already exists in `profiles`.
  - Read `language-servers://profiles/{name}` and `language-servers://profiles/{name}/logs` if the profile exists or is failing.
  - Try one matching file-backed tool call on a real file before changing YAML.
  - Only continue to install or reconfigure if the profile is missing, the binary is missing, routing is wrong, or the logs point to a config problem.
- [ ] Bootstrap config if needed.
  - If `manager.configPath` is `null` or `manager.state` is `uninitialized`, run `npx -y @p1va/symbols@latest config init`.
  - This usually creates `language-servers.yaml` in the current workspace unless the user chose a different config location.
  - Then read `language-servers://profiles` again and confirm the config path now exists.
- [ ] Choose the target language and open the matching reference.
  - The references only provide language-specific implementation details: install commands, verify commands, one profile snippet, and language-specific validation or troubleshooting notes.
  - Use this skill for the generic workflow: resource checks, config discovery, `reload`, and logs.
  - [C/C++](references/clangd.md): `.c .h .cpp .cc .cxx .hpp .hxx .C .H`
  - [C# / Roslyn](references/roslyn.md): `.cs`
  - [Go](references/gopls.md): `.go`
  - [Java](references/jdtls.md): `.java`
  - [Kotlin](references/kotlin.md): `.kt .kts`
  - [Lua](references/lua.md): `.lua`
  - [PHP](references/php.md): `.php`
  - [Python / Pyright](references/pyright.md): `.py .pyi`
  - [Ruby](references/ruby.md): `.rb .rake .gemspec .ru .erb`
  - [Rust](references/rust.md): `.rs`
  - [Swift](references/swift.md): `.swift`
  - [TypeScript](references/typescript.md): `.ts .tsx .js .jsx .mts .cts .mjs .cjs`
  - If the language is not listed, look up an LSP that speaks stdio and follows the Language Server Protocol, then model the config after the nearest reference.
- [ ] Install or verify the server binary.
  - Prefer the executable already shown in the reference profile.
  - If the profile uses `npx`, a separate global install may be unnecessary.
  - For troubleshooting, verify first and install only if the binary is actually missing.
- [ ] Merge the reference profile into the active config.
  - Edit only the target profile under `language-servers`.
  - Preserve unrelated profiles, local paths, environment variables, and workspace-specific tweaks.
  - Keep `command`, `extensions`, `workspace_files`, and `diagnostics` explicit.
  - Choose `workspace_files` carefully. They identify which repos count as a workspace for that server and which profiles can participate in workspace-wide search.
  - Prefer specific project markers over broad files like `package.json` unless you intentionally want that profile to apply to very mixed repositories.
  - Add `preload_files` only when the reference calls for it.
  - Prefer one or two bounded glob patterns over a single repo-specific exact file when you need a keepalive anchor. The runtime resolves each glob to the first matching file rather than opening every match.
  - The YAML file is the desired state for which language servers the MCP may spawn and how files route to them.
- [ ] Apply the config.
  - Run `reload`.
  - This makes the MCP reread the YAML and apply the new desired state.
  - Then read `language-servers://profiles` again and confirm the profile is present.
- [ ] Validate on a real file for that language.
  - Use `outline`, `inspect`, `completion`, `diagnostics`, or `references`.
  - Pick a file whose extension matches the configured profile.
  - A dormant profile may remain `not_started` until the first matching file-backed call. That is normal.
- [ ] If validation fails, inspect the profile resource and logs.
  - `language-servers://profiles/{name}`
  - `language-servers://profiles/{name}/logs`
  - Fix one issue, rerun `reload` if the config changed, then revalidate on the same file.

## Gotchas

- `reload` is the only apply-config action. Do not restart the MCP server unless the user explicitly asks.
- `not_started` after reload is expected. Use a matching file-backed tool call to start the profile.
- Do not replace an existing config with a copied example. Merge the target profile into the active file.
- If troubleshooting, do not edit YAML before checking the existing profile, logs, and one real file-backed request.
- Wrong `workspace_files` or missing `extensions` are common routing failures.
- Overly broad `workspace_files` can make workspace-wide search start the wrong server.
- Some servers need extra environment variables or project markers. Use the reference before inventing settings.
- If you need an unsupported language, start with the official implementor list: https://microsoft.github.io/language-server-protocol/implementors/servers/

## Output

- Say which config file was edited.
- Say whether the config was bootstrapped or an existing file was updated.
- Say which profile was added or changed.
- Say which tool and file were used for validation.
- If setup failed, cite the exact resource or log evidence.
