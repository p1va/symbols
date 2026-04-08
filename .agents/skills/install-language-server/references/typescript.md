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
    workspace_ready_delay_ms: 3000
    diagnostics:
      strategy: 'push'
      wait_timeout_ms: 2000
```

### Validation Notes

- Prefer a real `.ts` or `.tsx` file inside the current workspace.
- `workspace_files` decide when TypeScript counts as a workspace-wide search candidate. Keep them specific.
- If search quality matters, confirm the profile owns at least one preload file after first use.
- Prefer bounded glob patterns for `preload_files`. Each pattern resolves to the first matching file, so the config is easier to reuse across repositories without opening every file.
- If cold search is flaky, add a small `workspace_ready_delay_ms` so tsserver has time to build project state after the anchor file opens.

### Troubleshooting

- `preload_files` matter for search and broader index quality.
- Add `package.json` to `workspace_files` only if you intentionally want plain JS repos without `tsconfig.json` or `jsconfig.json` to count as TypeScript workspaces.
- If the server starts but search still looks cold, check whether the configured preload entries actually matched files in this workspace.
- If preload entries match but cold search still races, increase `workspace_ready_delay_ms` modestly before adding more anchors.
- If startup latency matters, prefer the global install above over repeated `npx` startup.

### More Information

- https://www.npmjs.com/package/typescript-language-server
- https://github.com/typescript-language-server/typescript-language-server
