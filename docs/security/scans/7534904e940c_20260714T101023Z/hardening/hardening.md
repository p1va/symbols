# Security Hardening Review: Symbols

## Source Scan

This review covers the complete reportable collection from scan
`7534904e940c_20260714T101023Z` at revision
`7534904e940c5585a8675624ca71eb4e247d37e8` and snapshot
`codex-security-snapshot/v1:sha256:11bb4e0b4b6f14f6c23723da8c5c39b77d78de9d6a2ba5a8f2c4bd3ed416b1fe`.
Source drift is `none`. The scan is not yet sealed, so we intentionally do not
record or claim a manifest digest.

I inspected both detailed findings, the threat model, the complete coverage
ledger, and the owning source paths. The evidence set contains two final
findings: **Workspace config auto-execution** and **Unbounded diagnostics
output**. The coverage ledger has no deferred rows.

## Constraints

We are using a balanced constraint profile. Symbols should remain a lightweight
local, single-user MCP-to-LSP bridge: skills own installation guidance,
`language-servers.yaml` remains desired state, and the MCP surface owns runtime
inspection and control. We should prefer the smallest language-agnostic change
and avoid introducing a managed installer, hosted service, broad workflow
subsystem, or generalized policy framework.

No measured performance or memory budget was supplied. Diagnostic limit values
therefore need measurement on representative workspaces; they cannot be
presented as benchmark-backed thresholds in this review. Likewise, the choice
between disabling automatic workspace-config discovery and preserving it behind
a narrow approval record is a product-compatibility decision, not evidence for
a larger architecture.

## Opportunity Portfolio

No structural hardening opportunity qualified. The findings do not share a
control owner, state transition, dangerous capability, or repeated preventive
control. Their common label—untrusted input—is too broad to form a useful
security boundary.

| Opportunity | Evidence | Options | Recommendation | Proposal |
| --- | --- | --- | --- | --- |
| No structural opportunity qualified | Workspace config auto-execution; unbounded diagnostics output | None | Apply the two focused remediations independently | None |

The source inspection instead supports these proportionate local changes:

| Finding | Closest control boundary | Proportionate remediation | Why it stays local |
| --- | --- | --- | --- |
| Workspace config auto-execution | Config-source selection in `src/config/lsp-config.ts`, before manager/session startup | Default-deny automatically discovered workspace executable policy unless the exact canonical path and content were explicitly selected or trusted; recheck on reload | Authorization belongs where the loader distinguishes workspace, explicit, and shared sources. It does not need a general workflow or installer service. |
| Unbounded diagnostics output | Diagnostics ingestion/store in `src/lsp-client.ts` and `src/state/stores.ts`, plus final formatting in `src/tools/diagnostics.ts` | Bound per-URI count, message size, URI retention, rendered entries, and final characters; preserve omission metadata for push and pull | The limits describe one LSP result type and already have focused precedents in window logs, completion, and call hierarchy. A global input-policy layer would obscure useful operation-specific budgets. |

## Recommendation Summary

The assessment outcome is **`local_remediation_preferred`**. I recommend we
fix each issue at its closest owned boundary and leave the architectural
portfolio empty.

For workspace configuration, discovery must stop implying authorization. The
smallest robust posture is default denial for automatically discovered
workspace executable policy, while preserving deliberate explicit config and
trusted shared-user config behavior. If the project keeps automatic discovery
for convenience, a narrow content-bound approval record can preserve that UX;
reload must re-evaluate it. We do not need a managed trust service or a wider
workflow product to enforce this state transition.

For diagnostics, we should cap data before storage and expensive mapping/sort
work, then apply an independent final text budget with a clear omission marker.
Push and pull strategies need the same output invariant. A tiny shared text
truncation primitive may be worthwhile if it reuses an existing pattern, but
the evidence does not support centralizing all LSP validation or all MCP output
behind a new framework.

What would change this conclusion is recurrence evidence: several additional
findings caused by inconsistent config authorization, or several model-facing
tools repeatedly implementing the same byte-budget protocol incorrectly. The
complete current scan does not show either pattern. Building that architecture
now would couple unrelated concerns and expand the product boundary without a
demonstrated security return.

These recommendations are not implemented and do not close either finding.
Each original path must be revalidated after its tactical change lands.

## Next Decisions

- Choose the workspace trust UX: require explicit `--config`, or retain
  discovery behind canonical-path- and content-bound approval. In either case,
  unapproved workspace config must fail closed before process creation and on
  reload.
- Select diagnostic count, message, URI-retention, and final-character budgets
  using representative repositories. Rerun the documented 10,000-error
  workload and record latency, output size, retained count, and peak memory
  where practical.
- Decide how existing errors/resources should expose config denial and
  diagnostic omission metadata without adding broad new MCP tools.
- Implement and revalidate the two fixes independently. Revisit structural
  consolidation only if later evidence shows repeated control drift.

