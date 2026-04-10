## TypeScript

### Supported Extensions

`.ts`, `.tsx`, `.js`, `.jsx`, `.mts`, `.cts`, `.mjs`, `.cjs`

### Install

Prefer the shipped `npx` command first. It avoids a separate install step.

Optional global install:

```sh
npm install -g typescript-language-server typescript
```

### Verify

If you use the default `npx` profile, verify that command path directly:

```sh
npx -y typescript-language-server --version
```

If you installed the server globally, verify the global binary instead:

```sh
typescript-language-server --version
```

### Good Config Setup

- Prefer `tsconfig.json` or `jsconfig.json` in `workspace_files`. Add
  `package.json` only if you intentionally want plain JS repos without a config
  file to route to this profile.
- Keep `preload_files` narrow and reusable. One or two bounded glob patterns are
  better than a repo-specific exact file.
- Leave `workspace_ready_delay_ms` unset unless you are debugging a specific
  server startup issue. The search warm-up retry is the preferred mitigation
  for cold TypeScript workspace search.
- If this repo is large enough that the first cold workspace search still misses
  occasionally, increase `search.warmup_window_ms` instead of reintroducing a
  global startup delay.

### Profile Snippet

Merge this block into the active config file. Keep unrelated profiles already present in that file.

```yaml
language-servers:
  typescript:
    command: npx -y typescript-language-server --stdio
    extensions:
      '.js': 'javascript'
      '.mjs': 'javascript'
      '.cjs': 'javascript'
      '.jsx': 'javascriptreact'
      '.ts': 'typescript'
      '.mts': 'typescript'
      '.cts': 'typescript'
      '.tsx': 'typescriptreact'
    workspace_files:
      - 'tsconfig.json'
      - 'jsconfig.json'
    preload_files:
      - './src/{index,main,app}.ts'
      - './{index,main}.ts'
    # Optional: widen the empty-search retry window for very large workspaces.
    # search:
    #   warmup_window_ms: 10000
    diagnostics:
      strategy: 'push'
      wait_timeout_ms: 2000
```

### Validation Notes

- Prefer a real `.ts` or `.tsx` file inside the current workspace.
- `workspace_files` decide when TypeScript counts as a workspace-wide search candidate. Keep them specific.
- If search quality matters, confirm the profile owns at least one preload file after first use.
- Prefer bounded glob patterns for `preload_files`. Each pattern resolves to the first matching file, so the config is easier to reuse across repositories without opening every file.

### Gotchas

- Search quality depends heavily on project state. Without a matching preload
  file, cross-file navigation and search can look cold even when the server is
  running.
- On a cold start, the first workspace-wide `search` can miss even after the
  server starts cleanly. Upstream `typescript-language-server` implements
  `workspace/symbol` using tsserver `navto`, and during initial project loading
  that request may be served by the syntax server before semantic project
  loading finishes. If the first cold search unexpectedly returns no matches,
  let Symbols perform its bounded warm-up retry before treating it as
  authoritative. If this still happens in a very large workspace, increase
  `search.warmup_window_ms`.
- This server is a thin LSP wrapper over `tsserver`, so behavior often depends
  on the workspace TypeScript configuration rather than only on the launcher
  command.

### Troubleshooting

- `preload_files` matter for search and broader index quality.
- Add `package.json` to `workspace_files` only if you intentionally want plain JS repos without `tsconfig.json` or `jsconfig.json` to count as TypeScript workspaces.
- If the server starts but search still looks cold, check whether the configured preload entries actually matched files in this workspace and retry the first cold workspace search once.
- If startup latency matters, prefer the global install above over repeated `npx` startup.

### Source Of Truth

- https://www.npmjs.com/package/typescript-language-server
- https://github.com/typescript-language-server/typescript-language-server
- https://github.com/typescript-language-server/typescript-language-server/blob/master/docs/configuration.md
