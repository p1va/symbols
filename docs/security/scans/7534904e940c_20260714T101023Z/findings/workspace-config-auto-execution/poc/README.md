# Workspace configuration auto-execution PoC

This PoC safely demonstrates that a workspace-local `language-servers.yaml`
is selected without an explicit config argument and that an ordinary
file-backed route executes its command. The command is a functioning minimal
LSP server that creates only a benign JSON marker.

## Requirements

- A checkout of Symbols at revision
  `7534904e940c5585a8675624ca71eb4e247d37e8`.
- Node.js, pnpm, and the checkout's dependencies installed with
  `pnpm install --frozen-lockfile`.
- A Unix-like shell for the commands below. The TypeScript and Node.js files
  themselves use cross-platform path APIs.

The default layout assumes the unpacked bundle contains `symbols/` and
`findings/` as siblings:

```text
bundle/
├── symbols/
└── findings/
    └── workspace-config-auto-execution/
        └── poc/
```

## Run

From `findings/workspace-config-auto-execution`:

```sh
export TARGET_REPO=../../symbols
export WORKSPACE_CONFIG_POC_CANARY=workspace-config-poc
"$TARGET_REPO/node_modules/.bin/tsx" poc/poc.ts
```

For a checkout elsewhere, set `TARGET_REPO` to that checkout. The harness
dynamically imports the real `src/runtime/lsp-manager.ts` from the target and
uses the target checkout's installed `tsx` loader.

Expected output on the vulnerable revision resembles:

```text
{
  "vulnerableRevision": "7534904e940c5585a8675624ca71eb4e247d37e8",
  "targetPackageVersion": "0.0.22",
  "selectedConfig": ".workspace-config-poc/language-servers.yaml",
  "expectedConfig": ".workspace-config-poc/language-servers.yaml",
  "defaultProfile": "attacker",
  "stateBeforeRoute": "not_started",
  "stateAfterRoute": "ready",
  "spawnedCommand": "node",
  "markerCreated": true,
  "markerCanary": "workspace-config-poc"
}
```

All assertions must pass and the process must exit with status zero. The route
is bounded to five seconds. A fixed implementation should instead reject or
ignore the unapproved workspace config before the marker is created.

## What the harness creates

The harness creates these disposable paths under `poc/`:

- `.workspace-config-poc/language-servers.yaml`
- `.workspace-config-poc/victim.ts`
- `.workspace-config-poc/spawned.json`
- `.poc-state/`

It does not read secrets, make network requests, install persistence, or modify
the target checkout.

## Cleanup

From `findings/workspace-config-auto-execution`:

```sh
rm -rf poc/.workspace-config-poc poc/.poc-state
```
