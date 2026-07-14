# Security Review: p1va/symbols

## Scope

Repository-wide review of the shipped TypeScript runtime, MCP and plugin metadata, configuration assets, language-server installation skills, privileged CI/release workflows, and executable developer/release helpers.

- Scan mode: repository
- Target kind: git_worktree
- Target ID: target_sha256_066096132b0bf434bab56b80832cff590f759d27759098ec94959aff590cfc4b
- Revision: 7534904e940c5585a8675624ca71eb4e247d37e8
- Snapshot digest: codex-security-snapshot/v1:sha256:11bb4e0b4b6f14f6c23723da8c5c39b77d78de9d6a2ba5a8f2c4bd3ed416b1fe
- Inventory strategy: repository
- Included paths: .
- Excluded paths: README.md, AGENTS.md, CLAUDE.md, docs/, examples/, test/, pnpm-lock.yaml, node_modules/, dist/, coverage/
- Runtime or test status: Node.js v22.14.0; pnpm build passed; all 216 unit tests passed; pnpm audit --prod reported zero known vulnerabilities across 149 production dependencies.
- Artifacts reviewed: 111-row generated source and privileged-surface worklist, all files under src/, package and distribution metadata, Codex and Antigravity plugin assets, language-server installation and navigation skills, GitHub Actions and release automation, production dependency resolution and advisory inventory
- Scan context: The threat model was generated during this scan. Symbols is a local, single-user stdio MCP bridge that lazily launches same-user language-server child processes; no hosted service, network listener, account, or tenant boundary is in scope.

Limitations and exclusions:
- Host-specific approval UX was not measured across every supported MCP client.
- The diagnostics reproduction invoked the registered public tool handler directly rather than a separate MCP stdio client, and no process-crash threshold was sought.
- Excluded documentation, examples, unit-test source, dependency contents, and generated build outputs were used only as context or verification inputs rather than exhaustive security-review worklist rows.
- Excluded README.md, AGENTS.md, CLAUDE.md, docs/\*\*, examples/\*\*: Documentation and examples were used as product context but were not runtime security-review worklist rows.
- Excluded test/\*\*: Unit tests were executed as verification; test source was not treated as shipped runtime attack surface.
- Excluded pnpm-lock.yaml, node_modules/\*\*: Dependency resolution was covered through the lockfile and production advisory audit rather than full-file dependency source review.
- Excluded dist/\*\*, coverage/\*\*: Generated build and coverage output was excluded from semantic source review.

### Scan Summary

| Field | Value |
| --- | --- |
| Reportable findings | 2 |
| Severity mix | high: 1, low: 1 |
| Confidence mix | high: 2 |
| Coverage | complete |
| Validation mode | Exhaustive static full-file review with bounded dynamic reproductions for both final findings and exact candidate-ledger reconciliation. |

Canonical artifacts: `scan-manifest.json`, `findings.json`, and `coverage.json`. This report is a deterministic projection of those files.

## Threat Model

The principal security boundaries are untrusted workspace/config content becoming executable language-server policy, untrusted LSP responses entering Symbols memory and model-facing output, and LSP workspace edits crossing into local filesystem mutation. The local stdio deployment limits network and cross-tenant concerns but does not make repository authors or protocol output trusted.

### Assets

- Integrity of files in the selected workspace
- Confidentiality of local source, credentials, environment, and logs accessible to the user
- Integrity of the user account and same-user child-process authority
- Availability and bounded context use of the Symbols session and connected agent
- Integrity and provenance of published packages, plugin assets, skills, and release automation

### Trust Boundaries

- MCP host to Symbols stdio tools and resources
- Workspace and config filesystem to executable runtime policy
- Symbols to same-user language-server child processes
- Language-server JSON-RPC to Symbols storage, formatting, and MCP output
- Language-server WorkspaceEdit to local filesystem mutation
- Repository and registries to installed plugin, language servers, and release artifacts

### Attacker Capabilities

- Control files, symlinks, project metadata, and workspace-local YAML in an untrusted checkout or branch
- Influence an AI caller through repository or language-server text
- Cause ordinary language servers to emit hostile cardinality, URIs, ranges, edits, markup, and diagnostics
- Contribute pull-request or release-adjacent content without already controlling the victim OS account

### Security Objectives

- Do not promote workspace-local executable configuration without an explicit trust decision
- Keep mutations within the canonical workspace and validate all edits before replacement
- Bound untrusted protocol retention, transformation, and model-facing output
- Keep read-only tools non-mutating and make lifecycle failures fail closed
- Preserve publication and plugin provenance across reviewed source and generated assets

### Assumptions

- The configured and approved language-server executable is trusted to run with the local user's authority.
- A separate OS user who already controls this user's config, binaries, or process memory is outside scope.
- Remote clients, hostile co-tenants, browser sessions, and hosted-service authorization are outside the current product model.
- Repository content and language-server results remain untrusted even though the MCP transport is local.

## Findings

| Finding | Severity | Confidence | Detailed write-up |
| --- | --- | --- | --- |
| [Workspace-local configuration executes repository-selected commands without approval](#finding-1) | high | high | [Open report](findings/workspace-config-auto-execution/workspace-config-auto-execution.md) |
| [Diagnostics are retained and returned without bounds](#finding-2) | low | high | [Open report](findings/unbounded-diagnostics-output/unbounded-diagnostics-output.md) |

### Confidence Scale

| Label | Meaning |
| --- | --- |
| high | Direct evidence supports the finding with no material unresolved blocker. |
| medium | Evidence supports a plausible issue, but material runtime or reachability proof remains. |
| low | Evidence is incomplete and the item is retained only for explicit follow-up. |

<a id="finding-1"></a>

### [1] Workspace-local configuration executes repository-selected commands without approval

| Field | Value |
| --- | --- |
| Severity | high |
| Confidence | high |
| Confidence rationale | The source-to-sink path was traced through configuration discovery, manager routing, session startup, and `cp.spawn`, then reproduced end to end with a functioning minimal LSP, an inherited benign canary, and a complete initialize/shutdown lifecycle. |
| Category | Untrusted executable configuration / arbitrary command execution |
| CWE | CWE-829: Inclusion of Functionality from Untrusted Control Sphere |
| Affected lines | src/utils/cli.ts:533-535, src/config/lsp-config.ts:113-175, src/runtime/lsp-manager.ts:218-221, src/runtime/lsp-manager.ts:573-596, src/runtime/lsp-session.ts:811-827, src/lsp-client.ts:199-204 |

#### Summary

See the [detailed technical write-up](findings/workspace-config-auto-execution/workspace-config-auto-execution.md).

#### Validation

See the [detailed technical write-up](findings/workspace-config-auto-execution/workspace-config-auto-execution.md).

#### Dataflow

See the [detailed technical write-up](findings/workspace-config-auto-execution/workspace-config-auto-execution.md).

#### Reachability

See the [detailed technical write-up](findings/workspace-config-auto-execution/workspace-config-auto-execution.md).

#### Severity

See the [detailed technical write-up](findings/workspace-config-auto-execution/workspace-config-auto-execution.md).

#### Remediation

See the [detailed technical write-up](findings/workspace-config-auto-execution/workspace-config-auto-execution.md).

<a id="finding-2"></a>

### [2] Diagnostics are retained and returned without bounds

| Field | Value |
| --- | --- |
| Severity | low |
| Confidence | high |
| Confidence rationale | The unbounded source, store, transform, sort, join, and response path is direct, and an unmodified `typescript-language-server` produced 10,000 retained and returned diagnostics from attacker-controlled source with measured output size and elapsed time. |
| Category | Resource exhaustion |
| CWE | CWE-770: Allocation of Resources Without Limits or Throttling |
| Affected lines | src/lsp-client.ts:604-609, src/state/stores.ts:54-68, src/lsp/operations/operations.ts:565-579, src/tools/diagnostics.ts:13-36, src/tools/diagnostics.ts:92-95 |

#### Summary

See the [detailed technical write-up](findings/unbounded-diagnostics-output/unbounded-diagnostics-output.md).

#### Validation

See the [detailed technical write-up](findings/unbounded-diagnostics-output/unbounded-diagnostics-output.md).

#### Dataflow

See the [detailed technical write-up](findings/unbounded-diagnostics-output/unbounded-diagnostics-output.md).

#### Reachability

See the [detailed technical write-up](findings/unbounded-diagnostics-output/unbounded-diagnostics-output.md).

#### Severity

See the [detailed technical write-up](findings/unbounded-diagnostics-output/unbounded-diagnostics-output.md).

#### Remediation

See the [detailed technical write-up](findings/unbounded-diagnostics-output/unbounded-diagnostics-output.md).

## Structural Hardening

The scan also produced derived, unsealed design guidance based on the complete finding collection. These proposals describe options and tradeoffs; they do not indicate that any finding has been remediated.

[Open the structural hardening portfolio](hardening/hardening.md)

## Reviewed Surfaces

| Surface | Risk Area | Outcome | Notes |
| --- | --- | --- | --- |
| Workspace and executable configuration | Untrusted configuration promoted to child-process policy | Reported | Workspace-local YAML is selected ahead of shared configuration and can choose the executable and arguments reached by an ordinary file-backed request. Evidence: artifacts/02_discovery/work_ledger.jsonl, artifacts/03_coverage/repository_coverage_ledger.md, artifacts/03_coverage/reviewed_surfaces.md |
| Configuration reload | Revocation and session-state races | Rejected | A narrow race was reproduced, but the executable was already authorized and running, status exposes the stale condition, and shutdown eventually stops it. Evidence: artifacts/02_discovery/work_ledger.jsonl, artifacts/03_coverage/repository_coverage_ledger.md |
| File-backed MCP paths | Unintended local-file reads | Rejected | An outside-workspace excerpt is possible, but no lower-privileged recipient or independent exfiltration principal was established in the local single-user model. Evidence: artifacts/02_discovery/work_ledger.jsonl, artifacts/03_coverage/repository_coverage_ledger.md |
| Rename workspace edits | Outside-workspace writes and partial application | No issue found | Targets are canonicalized under the real workspace, symlink escape and invalid edits are rejected, and content is staged before replacement. Multi-file atomicity remains reliability hardening. Evidence: artifacts/02_discovery/work_ledger.jsonl, artifacts/03_coverage/repository_coverage_ledger.md |
| LSP protocol and diagnostics | Unbounded server-controlled cardinality and output | Reported | An ordinary TypeScript server produced 10,000 retained diagnostics and an 868,893-character response from hostile workspace content. Evidence: artifacts/02_discovery/work_ledger.jsonl, artifacts/03_coverage/repository_coverage_ledger.md, artifacts/03_coverage/reviewed_surfaces.md |
| Preload files | Config-directed reads and resource use | Rejected | Escaping preload paths add no capability beyond the executable authority already granted to the same profile; selection remains one file per entry. Evidence: artifacts/02_discovery/work_ledger.jsonl, artifacts/03_coverage/repository_coverage_ledger.md |
| Logs and resources | Sensitive or unbounded model-facing output | Reported | Window messages and generic logs are bounded; diagnostics independently lack storage and response bounds. Evidence: artifacts/02_discovery/work_ledger.jsonl, artifacts/03_coverage/repository_coverage_ledger.md, artifacts/03_coverage/reviewed_surfaces.md |
| Session lifecycle | Retention, hangs, and stale ownership | Rejected | Retained documents and reload state are local lifecycle issues; the initialize timeout lacks a lower-authority security trigger. Evidence: artifacts/02_discovery/work_ledger.jsonl, artifacts/03_coverage/repository_coverage_ledger.md |
| YAML parsing | Unsafe deserialization and object-shape abuse | No issue found | Safe parsing and strict Zod transforms prevent executable YAML tags, and no dynamic-property execution sink was found. Evidence: artifacts/02_discovery/work_ledger.jsonl, artifacts/03_coverage/repository_coverage_ledger.md |
| Plugin package metadata | Mutable package selection and manifest drift | No issue found | Manifests consistently invoke the intended package. The explicit latest-tag policy remains ecosystem hardening rather than a repository substitution flaw. Evidence: artifacts/02_discovery/work_ledger.jsonl, artifacts/03_coverage/repository_coverage_ledger.md |
| Installation skills | Third-party language-server provenance | No issue found | Shipped mirrors are byte-identical and point to official ecosystem packages or releases with executable verification guidance. Evidence: artifacts/02_discovery/work_ledger.jsonl, artifacts/03_coverage/repository_coverage_ledger.md |
| CI and release | Privileged supply-chain execution | Rejected | Mutable MCP publisher download execution is real hardening debt, but exploitation requires compromise of the protected official upstream release authority plus a maintainer release tag. Evidence: artifacts/02_discovery/work_ledger.jsonl, artifacts/03_coverage/repository_coverage_ledger.md |
| Production dependencies | Known reachable dependency vulnerabilities | Not applicable | pnpm audit --prod reported zero known vulnerabilities across 149 production dependencies at scan time. Evidence: artifacts/02_discovery/work_ledger.jsonl, artifacts/03_coverage/repository_coverage_ledger.md |
| Network behavior | SSRF and callback abuse | Not applicable | The shipped runtime has no HTTP server or outbound network client; language-server communication is local stdio. Evidence: artifacts/02_discovery/work_ledger.jsonl, artifacts/03_coverage/repository_coverage_ledger.md |
| Authentication and queries | Authn, authz, tenant, and query injection | Not applicable | Symbols has no accounts, database, hosted routes, tenant model, or query engine. Evidence: artifacts/02_discovery/work_ledger.jsonl, artifacts/03_coverage/repository_coverage_ledger.md |
| Agent-visible text | Evaluation, template injection, and prompt-to-action | No issue found | Repository and LSP text is returned as data and is not evaluated or automatically connected to a privileged action by Symbols. Evidence: artifacts/02_discovery/work_ledger.jsonl, artifacts/03_coverage/repository_coverage_ledger.md |
| Generated and developer assets | Hidden release or execution drift | Not applicable | Generated reports are ignored and unshipped; playgrounds and sync/config scripts are development-only explicit maintainer surfaces. Evidence: artifacts/02_discovery/work_ledger.jsonl, artifacts/03_coverage/repository_coverage_ledger.md |

## Open Questions And Follow Up

- Do all supported MCP hosts show an approval that is explicitly tied to workspace-local executable configuration before the first file-backed request?
  - Follow-up prompt: Test the installed Symbols plugin in each supported MCP host using the workspace-config PoC and document the exact pre-spawn approval UX, if any.
- Which diagnostic count and text budgets preserve useful output on representative real repositories?
  - Follow-up prompt: Benchmark the diagnostics tool on representative TypeScript, Rust, C#, and Python projects, then select per-document count, message, retained-URI, and final-character limits with explicit omission metadata.
