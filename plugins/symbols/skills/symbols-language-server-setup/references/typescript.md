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

```sh
typescript-language-server --version
```

### Recommended Profile

```yaml
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
    - 'package.json'
    - 'tsconfig.json'
  preload_files:
    - './src/index.ts'
    - './index.ts'
    - './src/main.ts'
    - './main.ts'
  diagnostics:
    strategy: 'push'
    wait_timeout_ms: 2000
```

### Validate

- Run `outline` or `inspect` on a real `.ts` or `.tsx` file.
- If search quality matters, confirm the profile owns at least one preload file after first use.

### Troubleshooting

- `preload_files` matter for search and broader index quality.
- If startup latency matters, prefer the global install above over repeated `npx` startup.

### More Information

- https://www.npmjs.com/package/typescript-language-server
- https://github.com/typescript-language-server/typescript-language-server
