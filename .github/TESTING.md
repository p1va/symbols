# Testing Symbols

The test suite combines focused unit and contract tests with end-to-end tests
against real Language Servers. `package.json` is the source of truth for local
commands, and `.github/workflows/build.yaml` is the source of truth for CI.

## Local Verification

Use the pinned Node version before installing or running checks:

```bash
nvm use
pnpm install
```

The normal verification set is:

```bash
pnpm format:check
pnpm build
pnpm test:unit
pnpm check:unused
pnpm check:unused:ts
```

`pnpm build` runs ESLint and the TypeScript build. The two unused-code commands
cover package/module reachability and strict TypeScript unused declarations.

## Unit And Contract Tests

```bash
pnpm test:unit
pnpm test:watch
```

Unit tests isolate protocol and runtime behavior where possible. Contract tests
pin down boundaries that are easy to regress:

- accepted nullable and union-shaped LSP responses
- one-based MCP and zero-based LSP coordinates
- session cleanup and preserved error causes
- enrichment order and cardinality
- bounded diagnostics and logs
- workspace-edit preflight and containment
- stable public tool rendering
- plugin and registry distribution metadata

Prefer a small exact assertion over a large snapshot. When production code
normalizes a new server response, add the corresponding boundary variant to a
contract test.

## Integration Tests

Each language suite launches Symbols and a real Language Server against a small
test workspace.

| Language   | Language Server         | Local command                      |
| ---------- | ----------------------- | ---------------------------------- |
| TypeScript | TypeScript 7 native LSP | `pnpm test:integration:typescript` |
| Python     | Pyright                 | `pnpm test:integration:python`     |
| C#         | Roslyn Language Server  | `pnpm test:integration:csharp`     |
| Go         | `gopls`                 | `pnpm test:integration:go`         |
| Rust       | `rust-analyzer`         | `pnpm test:integration:rust`       |

Run all language suites with:

```bash
pnpm test:integration
```

The regular commands launch the source through `tsx`. The matching `:ci`
commands set `CI=true` and launch the built `dist/index.js`; run `pnpm build`
first when reproducing that mode locally.

The TypeScript integration profile launches the native server explicitly:

```bash
npx -y -p typescript@^7.0.2 tsc --lsp --stdio
```

It does not use the repository's TypeScript 6 compatibility compiler and does
not require `typescript-language-server`. The package manager's npx cache avoids
bundling a language server into Symbols while keeping the tested server version
explicit.

Other suites require the corresponding runtime or server to be installed. The
CI workflow records the authoritative setup for Pyright, Roslyn, `gopls`, and
`rust-analyzer`.

## CI Shape

The `Build & Unit Tests` job runs first and gates the integration matrix. It
checks generated skill mirrors, formatting, lint, the build, and unit tests.

After it passes, five independent integration jobs run in parallel:

- TypeScript
- Python
- C#
- Go
- Rust

Every job uploads its Vitest HTML and JSON reports from `test-results/`, even on
failure. There is no separate coverage or aggregation job; the individual job
statuses are the merge signal.

## When Live Validation Is Required

Run the relevant integration suite after changing:

- typed LSP requests or response normalization
- session or document lifecycle
- profile routing, readiness, or reload behavior
- diagnostics strategy
- tool schemas or rendered output

Changes to MCP tool registration or runtime code require a fresh MCP process
before manual validation. Config-only changes can normally be applied through
`reload`.
