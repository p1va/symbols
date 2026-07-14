# Reviewed Surfaces

The repository-wide scan completed all 111 generated source and privileged-surface worklist rows. Every row has a full-file receipt, no work was deferred, and the final disposition of each risk surface is summarized below.

| Surface | Risk Area | Outcome | Notes |
| --- | --- | --- | --- |
| Workspace and executable configuration | Untrusted configuration promoted to child-process policy | Reported | Workspace-local YAML is selected ahead of shared configuration and can choose the executable and arguments used by an ordinary file-backed request. |
| Configuration reload | Revocation and session-state races | Rejected | A narrow race was reproduced, but the executable was already authorized and running, status exposes the stale condition, and shutdown eventually stops it. |
| File-backed MCP paths | Unintended local-file reads | Rejected | An outside-workspace excerpt is possible, but no lower-privileged recipient or independent exfiltration principal was established in the local single-user model. |
| Rename workspace edits | Outside-workspace writes and partial application | No issue found | Targets are canonicalized under the real workspace, symlink escape and invalid edits are rejected, and content is staged before replacement. Multi-file atomicity remains reliability hardening. |
| LSP protocol and diagnostics | Unbounded server-controlled cardinality and output | Reported | An ordinary TypeScript server produced 10,000 retained diagnostics and an 868,893-character MCP response from hostile workspace content. |
| Preload files | Config-directed reads and resource use | Rejected | Escaping preload paths add no capability beyond the executable authority already granted to the same profile; selection remains one file per entry. |
| Logs and resources | Sensitive or unbounded agent-visible output | Reported | Window messages and generic logs are bounded; diagnostics independently lack storage and response bounds. |
| Session lifecycle | Retention, hangs, and stale ownership | Rejected | Retained documents and reload state are local lifecycle issues; the initialize timeout lacks a lower-authority security trigger. |
| YAML parsing | Unsafe deserialization and object-shape abuse | No issue found | Safe parsing and strict Zod transforms prevent executable YAML tags and no dynamic-property execution sink was found. |
| Plugin package metadata | Mutable package selection and manifest drift | No issue found | Manifests consistently invoke the intended package. The explicit `latest` policy remains ecosystem hardening rather than a repository substitution flaw. |
| Installation skills | Third-party language-server provenance | No issue found | Shipped mirrors are byte-identical and point to official ecosystem packages or releases with executable verification guidance. |
| CI and release | Privileged supply-chain execution | Rejected | Mutable MCP publisher download execution is real hardening debt, but exploitation requires compromise of the protected official upstream release authority plus a maintainer release tag. |
| Production dependencies | Known reachable dependency vulnerabilities | Not applicable | `pnpm audit --prod --json` reported zero known vulnerabilities across 149 production dependencies at scan time. |
| Network behavior | SSRF and callback abuse | Not applicable | The shipped runtime has no HTTP server or outbound network client; LSP communication is local stdio. |
| Authentication and queries | Authn, authz, tenant, and query injection | Not applicable | Symbols has no accounts, database, hosted routes, tenant model, or query engine. |
| Agent-visible text | Evaluation, template injection, and prompt-to-action | No issue found | Repository and LSP text is returned as data and is not evaluated or automatically connected to a privileged action by Symbols. |
| Generated and developer assets | Hidden release or execution drift | Not applicable | Generated reports are ignored and unshipped; playgrounds and sync/config scripts are development-only explicit maintainer surfaces. |

Supporting evidence is recorded in `repository_coverage_ledger.md` and `../02_discovery/work_ledger.jsonl`.
