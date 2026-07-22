# Diagnostics amplification PoC

This PoC generates a TypeScript file containing independent type errors, starts
an ordinary `typescript-language-server` through the target Symbols checkout,
and exercises both the push-diagnostics operation and the registered public
diagnostics-tool handler. It prints the retained diagnostic count and final MCP
text size.

## Prerequisites

- Node.js 22.12 or newer
- A Symbols checkout at revision
  `7534904e940c5585a8675624ca71eb4e247d37e8`
- The checkout's dependencies installed with `pnpm install --frozen-lockfile`
- `typescript-language-server` and TypeScript available on `PATH`

The commands below assume this layout:

```text
bundle/
├── symbols/
└── unbounded-diagnostics-output/
    └── poc/
```

From the `poc` directory, verify the target revision and start with 1,000
errors:

```sh
git -C ../../symbols rev-parse HEAD
../../symbols/node_modules/.bin/tsx ./diagnostics-amplification.ts \
  --repo ../../symbols --errors 1000
```

Run the validated 10,000-error case with:

```sh
../../symbols/node_modules/.bin/tsx ./diagnostics-amplification.ts \
  --repo ../../symbols --errors 10000
```

The included Makefile provides equivalent shortcuts:

```sh
make smoke
make run ERRORS=10000
```

On the vulnerable revision, the validated environment produced:

```text
{
  "generatedErrors": 10000,
  "sourceBytes": 327779,
  "returnedDiagnostics": 10000,
  "retainedDiagnostics": 10000,
  "maxReturnedMessageCharacters": 49,
  "finalMcpTextCharacters": 868893,
  "finalMcpTextLines": 10000,
  "omissionMarkerPresent": false,
  "elapsedMs": 10128
}
```

Timing varies by host. A fixed build should cap retained/returned diagnostics
and final text, and should set `omissionMarkerPresent` to `true` when results are
discarded.

## Safety and cleanup

This is a local availability test. It does not modify the Symbols checkout, but
large values consume CPU, memory, and model-context capacity. Begin with 1,000
errors and use a disposable session for larger runs. The script accepts at most
100,000 errors.

The generated `workspace/` directory is removed after the run. Pass `--keep` to
retain it for inspection; remove it afterward with:

```sh
rm -rf workspace
```
