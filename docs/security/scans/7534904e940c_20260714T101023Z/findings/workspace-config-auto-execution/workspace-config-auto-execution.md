# Executive Summary

Symbols automatically treats a workspace-local `language-servers.yaml` as
executable policy. A repository author can place this file and a referenced
script in a checkout; when a user starts Symbols in that workspace and invokes
an ordinary file-backed language-server operation, Symbols launches the
repository-selected command without first establishing that the workspace
configuration was approved.

| Field | Assessment |
| --- | --- |
| Severity | **High** |
| Priority | **P1** |
| Confidence | **0.95** |
| Affected revision | `7534904e940c5585a8675624ca71eb4e247d37e8` |
| Package metadata at that revision | `@p1va/symbols` `0.0.22`; Git description `v0.0.22-1-g7534904` |
| Fixed release | None known at the time of this report |
| Weakness | Untrusted executable configuration; arbitrary same-user command execution |

The attacker begins with control of repository content, such as a repository,
branch, or pull-request checkout. They do not need control of the victim's
account, global Symbols configuration, shell, or administrator privileges.
Successful exploitation runs code with the same OS identity and ambient access
as Symbols. It is therefore not privilege escalation, but it crosses the
important boundary from untrusted project data to code execution on the user's
machine.

I reviewed the source at the exact revision above and executed the production
manager, session, and client path locally with a functioning minimal LSP. The
test proved automatic config selection, process execution, environment-canary
inheritance, and a complete initialize/shutdown lifecycle. I did not test every
MCP host's approval UX, and I did not access real secrets, establish
persistence, or make network requests.

# Background

## Workspace-config mode

Symbols is a local MCP bridge that launches language-server processes on
demand. The shipped plugin definition starts the package in workspace-config
mode (`plugins/symbols/.mcp.json:4-6`):

```json
"command": "npx",
"args": ["-y", "@p1va/symbols@latest", "start"]
```

The `start` command needs a workspace and a set of language-server profiles.
Each profile includes a command, extensions used for routing, and optional
environment or workspace settings. Executing a command from a configuration
that the user deliberately selected or previously approved is expected
functionality. The security-sensitive question is how Symbols distinguishes
that trusted policy from a YAML file supplied by an unfamiliar checkout.

In the affected revision it does not make that distinction. If the caller does
not supply a workspace, `resolveStartConfig` uses the current directory
(`src/utils/cli.ts:533-535`):

```typescript
workspace:
  cliArgs.workspace || process.env.SYMBOLS_WORKSPACE || process.cwd(),
```

That default makes sense operationally, but it means the normal plugin process
starts with a directory whose contents may have been authored by a different,
less-trusted party. Workspace data therefore must not become executable policy
until a separate trust decision has been recorded.

## Lazy process startup

Symbols does not eagerly launch every configured language server. Instead, it
loads profiles and starts the appropriate server when a file-backed tool routes
a matching file. This keeps normal startup lean, but also makes a navigation or
inspection request the trigger for the selected profile's command. The user
does not have to run an explicit install or execute action at that point.

# Vulnerability Details

## Workspace YAML outranks shared configuration

We first reach `loadLspConfig`. It constructs workspace-local candidates from
the resolved workspace (`src/config/lsp-config.ts:113-118`):

```typescript
// Try different config locations with priority: CLI > workspace > repo > cwd > home
const workspaceConfigPaths = workspacePath
  ? [
      path.join(workspacePath, 'language-servers.yaml'),
      path.join(workspacePath, 'language-servers.yml'),
    ]
  : [];
```

Those paths are inserted immediately after an explicit CLI path and before the
repo/cwd and shared candidates (`src/config/lsp-config.ts:138-142`):

```typescript
...workspaceConfigPaths.map((p) => ({
  path: p,
  type: 'workspace' as const,
  description: `Found in workspace directory (${workspacePath})`,
})),
```

For each candidate, the loader checks existence, parses YAML, validates its
shape, expands environment substitutions, and returns the first valid result
(`src/config/lsp-config.ts:188-209`). No trust state is consulted before the
workspace source is returned:

```typescript
for (const source of configSources) {
  if (!fs.existsSync(source.path)) continue;

  const resolvedPath = path.resolve(source.path);
  const yamlContent = fs.readFileSync(source.path, 'utf8');
  const parsed = yaml.load(yamlContent);
  const config = ConfigFileSchema.parse(parsed);
  const expandedConfig = expandEnvironmentVariables(config);

  return {
    config: expandedConfig,
    source: { path: resolvedPath, type: source.type,
              description: source.description },
  };
}
```

Schema validation answers whether a file is well formed; it cannot answer
whether its author is trusted to choose a program. Indeed, the command parser's
own comment acknowledges the boundary (`src/config/lsp-config.ts:382-399`):

```typescript
// SECURITY NOTE: Commands are parsed from configuration files using shell-quote.
// Only load configuration files from trusted sources, as malicious configs could
// execute arbitrary commands. Never load configs from untrusted or user-uploaded sources.
const parsedParts: ShellQuoteToken[] = shellParse(lspConfig.command.trim());
```

The parser rejects operators and other non-string shell tokens. A plain command
such as `node repository-script.mjs`, however, consists only of valid string
tokens. It is exactly the kind of command the product is designed to run.

## A normal file route reaches the spawn sink

We can now carry the automatically selected profile into the runtime. Manager
configuration calls `loadLspConfig(resolved.configPath, resolved.workspace)` at
`src/runtime/lsp-manager.ts:218-221`. With no explicit `--config`, the workspace
file above wins.

When a matching file is requested, `routeFile` resolves the profile and starts
its session (`src/runtime/lsp-manager.ts:573-596`):

```typescript
async function routeFile(filePath: string): Promise<LspSession> {
  ensureProfilesLoaded();
  // ... existing ownership and profile lookup ...
  const session = getOrCreateSession(profile);
  return startSession(session);
}
```

The session transitions from `not_started` to `starting`, constructs the
workspace configuration, and calls `createLspClient` with the profile at
`src/runtime/lsp-session.ts:811-827` (the client call begins at line 820).

The client filters only environment keys beginning with `SYMBOLS_`; other
ambient variables remain available to the child (`src/lsp-client.ts:119-127`).
It then verifies that the executable exists or is present on `PATH` and invokes
it directly (`src/lsp-client.ts:136-204`; the sink is at lines 200-204):

```typescript
const serverProcess = cp.spawn(processedCommandName, processedCommandArgs, {
  env: lspEnv,
  stdio: ['pipe', 'pipe', 'pipe'],
});
```

Direct argv spawning is good hardening against shell-metacharacter injection.
It does not make an attacker-selected interpreter and script safe. The
repository controls the script argument, and a Node runtime is a realistic
available interpreter because Symbols itself runs on Node.js.

## The missing invariant

The affected state transition is concise:

```text
untrusted checkout
  -> workspace YAML selected by location
  -> schema-valid command accepted
  -> matching file route lazily starts profile
  -> command spawned with the Symbols user's authority
```

The missing invariant is: **workspace-local executable policy must be denied
until the user or containing host has explicitly approved that exact canonical
configuration, and the approval must remain valid for its exact content.**
Neither a source label nor later visibility of the effective config path is an
approval decision.

# Exploitability Analysis

## Strongest practical route

The reliable route needs only ordinary repository files:

1. We add `language-servers.yaml` with a profile for an extension present in
   the checkout.
2. We set its command to an installed interpreter plus a repository script.
3. We include a matching source file so a routine outline, inspection,
   references, completion, diagnostics, or rename request selects the profile.
4. When Symbols routes that file, the script runs before it needs to behave as
   a useful language server. A more discreet payload can implement enough LSP
   framing to finish initialization, as the bundled PoC does.

This gives the script the filesystem, environment, and network authority of the
Symbols process. Plausible outcomes include reading user-accessible source or
credentials, modifying user-writable files, and making network requests. These
are consequences of the proven same-user process primitive, not claims that a
specific credential store or persistence mechanism was tested.

## Constraints and existing controls

Several constraints are meaningful, but none restores the missing trust gate:

- The user must activate Symbols for the checkout and invoke a matching
  file-backed tool. Merely downloading the repository is not enough.
- Execution is same-OS-user. The issue does not grant root, administrator, or
  a different account's authority by itself.
- Shell operators are rejected and `cp.spawn` does not use a shell. This blocks
  a shell-injection route, but not `node repo-script.mjs`, `python script.py`,
  or another valid executable/argv pair.
- The executable must exist or resolve on `PATH`. An attacker can select a
  runtime likely to be present and keep the controlled logic in the repository
  script.
- An explicit `--config` has higher precedence. A careful deployment that
  always supplies a trusted path can avoid this route, but that is optional and
  not the shipped default workflow.
- Symbols can expose the effective config path through status/resources.
  Visibility may help investigation, but it does not prevent execution.
- A particular MCP host may add a process or tool approval prompt. I did not
  characterize every host. Such a prompt is an external limitation, not a
  repository-enforced decision that binds approval to this YAML's identity and
  content.

These preconditions keep the issue below critical severity. They still leave a
low-friction boundary crossing for users who reasonably treat a read-only code
navigation request as non-executable.

# Proof of Concept

The sibling `poc/` directory contains a portable demonstration. It dynamically
imports the real `createLspManager` implementation from a target checkout,
creates a workspace YAML and matching victim file, then observes the profile
before and after `getSessionForFile`. Its repository-selected process is
`minimal-lsp.mjs`, which creates a benign JSON marker and completes the LSP
initialize/shutdown exchange. A five-second bound prevents an indefinite wait.

Prepare a checkout at the affected revision and install its dependencies. From
this report's directory, with that checkout at the documented sibling
location, run:

```sh
export TARGET_REPO=../../symbols
export WORKSPACE_CONFIG_POC_CANARY=workspace-config-poc
"$TARGET_REPO/node_modules/.bin/tsx" poc/poc.ts
```

Representative output from the affected revision is:

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

The important observations are that the selected path equals the generated
workspace config even though no explicit config was supplied, the profile
moves from `not_started` to `ready`, and the child receives the benign canary.
The PoC does not read secrets, use the network, or install persistence.

Full requirements and layout instructions are in `poc/README.md`. Cleanup from
the report directory is:

```sh
rm -rf poc/.workspace-config-poc poc/.poc-state
```

# Remediation

## Restore an explicit, content-bound trust invariant

Workspace config discovery may remain convenient, but discovery must not imply
authorization. Before parsing a workspace candidate into runtime policy,
Symbols should canonicalize the workspace and config paths, hash the config
bytes, and require a persisted approval matching all three values. An explicit
CLI config can remain trusted because the operator deliberately selected it;
shared user configuration can retain its current behavior. A changed file,
different canonical path, or symlink retarget must invalidate workspace
approval.

A minimal implementation can put the gate at the point where the loader knows
the source type and has the exact bytes. The concrete storage interface may
differ, but the security decision should resemble:

```typescript
import { createHash, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';

interface WorkspaceApproval {
  canonicalWorkspace: string;
  canonicalConfig: string;
  sha256: string;
}

function isApprovedWorkspaceConfig(
  workspacePath: string,
  configPath: string,
  bytes: string,
  approvals: readonly WorkspaceApproval[]
): boolean {
  const canonicalWorkspace = fs.realpathSync(workspacePath);
  const canonicalConfig = fs.realpathSync(configPath);
  const digest = createHash('sha256').update(bytes).digest('hex');

  return approvals.some((approval) =>
    approval.canonicalWorkspace === canonicalWorkspace &&
    approval.canonicalConfig === canonicalConfig &&
    timingSafeEqual(Buffer.from(approval.sha256, 'hex'),
                    Buffer.from(digest, 'hex'))
  );
}

// Inside loadLspConfig, after readFileSync and before parsing/returning:
if (
  source.type === 'workspace' &&
  (!workspacePath ||
    !isApprovedWorkspaceConfig(
      workspacePath,
      source.path,
      yamlContent,
      approvalStore.list()
    ))
) {
  throw new UntrustedWorkspaceConfigError(resolvedPath);
}
```

The approval operation itself should be an explicit control-plane action that
shows the canonical path and executable commands, then persists the digest
atomically in user-owned state. `reload` must re-evaluate the same invariant;
it must not turn prior in-memory use into blanket approval. If silently falling
back to shared config could confuse users about which server is active, fail
closed with a clear error rather than silently skipping the workspace file.

## Regression coverage

Tests should exercise the real manager/session boundary, not only the hash
helper:

- An untrusted workspace YAML is ignored or blocked and its command is never
  spawned.
- The same workspace is accepted after explicit persisted approval.
- An explicit CLI `--config` remains a trusted, intentional source.
- Approval remains available safely across `reload` when canonical path and
  content are unchanged.
- A symlinked workspace or config is checked by canonical path, and retargeting
  the symlink does not reuse approval.
- Editing any executable config content changes the digest and invalidates the
  approval.
- Normal shared user configuration continues to load and start profiles.
- A denied workspace config cannot become active through auto-detection,
  fallback lookup, or a second file-routing attempt.

# Summary

Symbols revision `7534904e940c5585a8675624ca71eb4e247d37e8`
automatically promotes repository-local YAML from workspace data to executable
language-server policy. We followed the shipped start workflow through current
directory resolution, workspace-first configuration lookup, lazy file routing,
session construction, and direct process spawning. The direct-argv and parser
controls are worthwhile, but they address shell syntax rather than whether the
command's author was trusted.

The bundled PoC demonstrates the complete production path with a benign marker
and functioning LSP. The appropriate fix is a default-deny, persisted,
canonical-path- and content-bound approval for workspace executable policy.
Variant review should examine every route that can load or reload executable
configuration and ensure none can bypass that single invariant.
