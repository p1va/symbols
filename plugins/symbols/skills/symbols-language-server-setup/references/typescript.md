## TypeScript

Prefer the shipped `npx` command first. It avoids a separate install step.

### Recommended profile

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

### Notes

- `preload_files` matter for search and broader index quality.
- If startup latency matters, an optional global install is:
  `npm install -g typescript-language-server`
- A simple validation path is `outline` or `inspect` on a `.ts` or `.tsx` file.
