## TypeScript

### Supported Extensions

`.ts`, `.tsx`, `.js`, `.jsx`, `.mts`, `.cts`, `.mjs`, `.cjs`

### Install

Prefer the shipped `npx` command. TypeScript 7 includes the native compiler and
Language Server, so no separate LSP wrapper is required:

```sh
npx -y -p typescript@^7.0.2 tsc --version
```

For a project-local installation instead:

```sh
npm install --save-dev typescript@^7.0.2
```

### Verify

Verify the same package range used by the profile:

```sh
npx -y -p typescript@^7.0.2 tsc --version
```

The result should report a TypeScript 7.x release.

### Good Config Setup

- Prefer `tsconfig.json` or `jsconfig.json` in `workspace_files`. Add
  `package.json` only if plain JavaScript repositories without a config file
  should route to this profile.
- Do not add `preload_files` or a fixed `workspace_ready_delay_ms` by default.
  The native server can answer workspace search immediately after its LSP
  handshake in ordinary projects.
- Use pull diagnostics. The native server advertises the standard LSP
  diagnostic provider.
- Keep an existing legacy profile only when a real project incompatibility has
  been observed.

### Profile Snippet

Merge this block into the active config file. Keep unrelated profiles already
present in that file.

```yaml
language-servers:
  typescript:
    command: npx -y -p typescript@^7.0.2 tsc --lsp --stdio
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
    diagnostics:
      strategy: 'pull'
```

### Validation Notes

- Prefer a real `.ts` or `.tsx` file inside the current workspace.
- Validate both a file-backed operation such as `outline` and a workspace-wide
  `search` from a freshly started profile.
- A successful first search without `preload_files` is the important readiness
  check for the native server.
- TypeScript 7 changes some compiler defaults and removes some legacy options.
  Run the project's TypeScript build separately from LSP validation so config
  migration errors are not mistaken for a Symbols integration problem.

### Gotchas

- The LSP mode requires both flags: `tsc --lsp --stdio`. Omitting `--stdio`
  exits immediately.
- TypeScript 7 does not yet expose the JavaScript programmatic compiler API.
  Tools that import `typescript` may temporarily need the official
  `@typescript/typescript6` compatibility package even when the `tsc` binary and
  LSP use TypeScript 7.
- If a project exposes a native-server incompatibility, the previous Node LSP
  wrapper remains a useful fallback:

  ```yaml
  language-servers:
    typescript-legacy:
      command: npx -y typescript-language-server --stdio
      extensions:
        '.js': 'javascript'
        '.jsx': 'javascriptreact'
        '.ts': 'typescript'
        '.tsx': 'typescriptreact'
      workspace_files:
        - 'tsconfig.json'
        - 'jsconfig.json'
      preload_files:
        - './src/{index,main,app}.ts'
        - './{index,main}.ts'
      diagnostics:
        strategy: 'push'
        wait_timeout_ms: 2000
  ```

### Troubleshooting

- If the server exits immediately, confirm the command includes `--lsp` and
  `--stdio`, then run the verify command above.
- If the project reports configuration errors, run
  `npx -y -p typescript@^7.0.2 tsc --noEmit` in that project and migrate its
  `tsconfig.json` before changing Symbols readiness settings.
- Add `package.json` to `workspace_files` only when plain JavaScript repositories
  without `tsconfig.json` or `jsconfig.json` should count as TypeScript
  workspaces.
- If the native profile works for file operations but not workspace search,
  inspect its logs before adding preload or delay settings. Use the legacy
  fallback only when the failure is reproducible.

### Source Of Truth

- https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/
- https://github.com/microsoft/typescript-go
- https://www.npmjs.com/package/typescript
