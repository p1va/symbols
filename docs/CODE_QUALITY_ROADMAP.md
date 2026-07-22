# Code Quality Roadmap

Status: implemented 2026-07-21 and released in v0.0.25 on 2026-07-22. This is
now a decision record for the contracts introduced by the refactor. The
remaining sweep ideas are optional cleanup candidates, not active ordered
phases.

## Why

The architecture is sound — the layering (tools → preparation → operations →
session) is sound, and the strict TypeScript, lint, unused-code checks, and test
coverage are a strong foundation. What reads as uncurated is paragraph-level:
external protocol data is sometimes trusted too early and checked again too
late, the same small problem is solved differently in several places, and
there is ceremony that never pays off. The goal of this roadmap is not new
features or clever abstractions; it is making boundaries and invariants honest
enough that the rest of the code gets to lean on them.

## Principles (what "done well" means here)

- **Parse external data once.** TypeScript does not validate JSON received from
  a language server. Accept the official protocol union (or `unknown`) at the
  boundary, validate or normalize it there, and expose one honest internal
  shape. Downstream code contains zero protocol-shape checks.
- **One concept, one place.** A fact (coordinate base, "rest of line", URI →
  path) is established exactly once and imported everywhere else.
- **No ceremony without payoff.** An abstraction that is immediately unwrapped
  or has one variant gets deleted, not maintained.
- **Abstractions are earned.** A little duplication is preferable to a shared
  framework that hides meaningful differences between operations.
- **Comments are load-bearing.** A comment records a constraint the code cannot
  express (e.g. a server deviating from spec). Narration and changelog comments
  are deleted.
- **Make sameness explicit and differences deliberate.** The same problem is
  solved the same way; genuine domain differences remain visible rather than
  being forced through one abstraction.
- **Contracts are executable.** Tests pin down boundary variants, invariants,
  and public output before a refactor relies on them.

---

## Phase 0 — Characterize the contracts

Status: implemented 2026-07-21. Boundary variants and public rendering
contracts are covered by focused tests.

**Problem.** The tests are good at asserting which requests are sent and that
operations succeed, but less complete at pinning down normalized return shapes
and final rendered tool output. "Public behavior does not change" is difficult
to enforce without that baseline.

**Contract.** Small table-driven tests describe every protocol variant we
accept and the invariants our internal types promise. A few compact output
tests protect the public MCP presentation; avoid large snapshots. Admission
bar for every test in this phase: a later phase could realistically break it.
Characterization, not coverage for its own sake.

**Tasks.**

- Cover `Location`, `Location[]`, `LocationLink[]`, and `null` definition
  responses, plus malformed or server-deviating responses where we intentionally
  tolerate them.
- Cover completion, reference, workspace-symbol, diagnostic, and rename `null`
  or union variants from the official protocol types.
- Pin the line 1, character 1 boundary so 0-based/1-based regressions are
  obvious.
- Prove enrichment preserves input order and cardinality across interleaved
  files, missing URIs, and unreadable files. Exercise the live failure path:
  interleaved-file input through `enrichSymbolsWithCode` as zipped back by
  index in `references.ts`, not just the enrichment function in isolation.
- Prove errors preserve their causes and document cleanup still happens.
- Add a few exact rendered-output assertions for position tools.

**Done when** the following refactors can break a focused contract test rather
than relying on live testing to reveal a shape or formatting regression.

---

## Phase 1 — One coordinate contract

Status: implemented 2026-07-21. Protocol-derived coordinates now remain
zero-based through operations, enrichment, and workspace edits; all
user-facing output uses `formatZeroBasedPosition` at the render edge.

**Problem.** MCP/user positions are 1-based, LSP is 0-based (see CLAUDE.md),
but the conversion happens inline and ad hoc: `+ 1` scattered through
`src/lsp/operations/operations.ts` (inspect, references, completion, rename),
and `src/tools/inspect.ts` then subtracts 1 back before enrichment and prints
the originals. A +1/-1 round trip between layers means the layer contract is
muddled. The branded `OneBasedPosition` / `ZeroBasedPosition` types in
`src/types/position.ts` are the right idea, not carried through.

**Contract.** Protocol-derived coordinates — operation results, enrichment,
grouping, and workspace edits — stay in 0-based LSP coordinates. Conversion to
1-based happens exactly once at the textual render edge. MCP/user input remains
1-based at the input and cursor-context boundary and is converted once when an
LSP request is prepared.

**Tasks.**

- Remove all inline `+ 1` transforms from `operations.ts`; operations return
  raw LSP coordinates.
- Delete the compensating `- 1` logic in `src/tools/inspect.ts`
  (`formatLocationGroup`).
- Add a single display formatter next to the branded position types; prefer a
  final string such as `line:character` over another intermediate
  `DisplayPosition` object.
- Internal result types (`SymbolReference`, `RenameResult` entries, completion
  `textEdit`) drop their duplicated pre-converted line/character fields.

**Done when** `grep -n "line + 1\|character + 1" src/` only hits the display
helper.

## Phase 2 — Type and normalize the LSP boundary

Status: implemented 2026-07-21. Session requests now accept official typed
request descriptors, and protocol unions are normalized at the operations
boundary. Inspect locations are always `Location[]`, including normalized
`LocationLink` targets; nullable results and typed diagnostic reports no longer
leak protocol-shape checks into tool formatters.

**Problem.** Protocol unions leak into formatters, which then guard against
every shape: `Location | Location[]` triple-checks in `inspect.ts`,
`Array.isArray` on already-typed arrays and structural `'x' in y` probes in
`transformWorkspaceSymbols`, `CompletionList | CompletionItem[]` handling in
`completion`, hand-cast diagnostic reports in `getPullDiagnostics`. More
fundamentally, `SessionDocumentScope.request<TResult>(method: string, ...)`
allows a caller to claim any result type for external JSON, independently of
the method and parameter types.

**Contract.** The request method, parameters, and result are coupled using the
official `vscode-languageserver-protocol` request descriptors. The operations
boundary absorbs every supported protocol variant and returns one clean
internal shape (`Location[]`, always; `CompletionItem[]`, always; a typed
diagnostic report). Runtime guards are allowed and expected at this external
boundary. Formatters become straight-line code with no protocol guards or
casts.

**Tasks.**

- Replace unchecked string/generic requests with typed request descriptors such
  as `HoverRequest.type`, `DefinitionRequest.type`, and
  `ReferencesRequest.type`.
- Normalize `Location | Location[] | LocationLink[] | null` once in
  `inspectSymbol`; simplify `inspect.ts` accordingly. Either normalize link
  targets defensively or explicitly document why negotiated client
  capabilities make them impossible.
- Rewrite `extractHoverContent` against the real protocol union types
  (`MarkupContent`, `MarkedString`) instead of `as` casts after `in` checks.
- Replace hand-cast shapes in `getPullDiagnostics` with
  `vscode-languageserver-protocol` report types.
- Handle the official nullable results for workspace symbols, references,
  completion, and rename.
- Collapse `transformWorkspaceSymbols` to a single honest transform over the
  official union.

**Done when** method/result mismatches cannot be expressed through an unchecked
`request<TResult>(string, ...)`, and files under `src/tools/` contain no
`Array.isArray`, `in`, or `as` checks against protocol data.

## Phase 3 — Make enrichment order-preserving and intention-revealing

Status: implemented 2026-07-21. One extent-based enrichment API now preserves
input order and cardinality, shares one cached read per file, and returns an
explicit result for every request. Callers request an exact range, complete
line, or declaration directly; the fake reference-symbol adapter, duplicate
location entry point, URI conversion, and `character: 1000` sentinels are gone.

**Problem.** Two overlapping entry points (`enrichSymbolsWithCode`,
`enrichSymbolLocations`) have different shapes; `references.ts` fabricates
fake symbols (`name: 'reference', kind: 1`) purely to satisfy the parameter
type; "rest of line" is expressed as `character: 1000` in three files; and the
URI → path helpers are duplicated.

There is also a correctness bug: enrichment groups inputs by file and appends
results file-by-file. Interleaved inputs (`A, B, A`) can become (`A, A, B`),
while callers in references and call hierarchy associate results with inputs
by array index. Inputs without a URI can disappear entirely.

Blast radius, verified: `references.ts` is the live exposure — nothing in the
LSP spec forbids a server returning references interleaved across files, and
its index-zip then attaches previews to the wrong references. `call-hierarchy.ts`
also zips by index but invokes enrichment per-file, so it is safe only by
coincidence; `search.ts` reads the symbol back from each result and is
unaffected; `inspect.ts` uses the order-preserving `enrichSymbolLocations`
entry point.

**Contract.** One enrichment function returns exactly one result per input, in
the original order: `output.length === input.length` and `output[i]` always
describes `input[i]`. Its request type expresses whether the caller wants an
exact range, a complete line, or a declaration. It does not represent "whole
line" using a fabricated LSP range with an arbitrary ending character.

**Tasks.**

- Replace the two entry points with one explicit request shape, for example a
  discriminated union with `extent: 'range' | 'line' | 'declaration'`.
- Preserve order and cardinality while still reading each file only once.
- Return a result (including a useful error) for missing URIs and unreadable
  files.
- Delete the fake-symbol adapter in `references.ts`.
- Centralize URI → path conversion.
- Remove every `character: 1000` sentinel; enrichment calculates a real line
  extent after reading the file.

**Done when** the order/cardinality tests from Phase 0 pass, the fake-symbol
adapter is gone, and `grep -rn "character: 1000" src/` returns nothing.

## Phase 4 — One error model

Status: implemented 2026-07-21. Operations and document lifecycle callbacks
now return values or throw native errors. Operation context is added once at
the MCP-facing operation boundary with the original error retained as
`cause`; session cleanup runs in `finally` without replacing the primary
failure. `Result` remains for validation and initialization paths that
genuinely branch on success and failure.

**Problem.** Operations wrap everything in `tryResultAsync` with eight
hand-copied `createLspError(...)` mapping closures, and the first consumer
does `if (!result.ok) throw new Error(result.error.message)` — paying the full
cost of `Result` and keeping none of its benefit (original stacks are lost).
`ErrorCode` has exactly one member.

The same ceremony exists in the session lifecycle: its callbacks require
`Promise<Result<T>>`, then unwrap a failure into a new `Error` containing only
the message. That loses the original stack and cause.

**Contract.** MCP handlers must throw, so commit to exceptions across the
operation and session-lifecycle path. Preserve the original `cause` and
translate an error for MCP once. Introduce `LspOperationError` only if callers
use its operation metadata; otherwise prefer native `Error(message, { cause
})`. Keep `Result` where a caller genuinely branches on it, e.g. validation.

**Done when** the eight error-mapper closures are gone, lifecycle callbacks no
longer require a `Result` only to rethrow it, causes survive, cleanup behavior
is unchanged, and no caller unwraps a `Result` only to throw.

## Phase 5 — Re-evaluate the tool skeleton

Status: implemented 2026-07-21. Position handlers keep file-to-session routing
explicit, then resolve the session-bound file and coordinate target through one
top-to-bottom `resolveSymbolTarget` step. Single-text MCP results have one
constructor. The review found no larger registration skeleton worth adding:
rename, inspect, call hierarchy, and completion retain meaningfully different
control flow, while cursor-context section ordering remains clearer when kept
explicit in each formatter.

**Problem.** `inspect.ts`, `references.ts`, `call-hierarchy.ts`,
`completion.ts`, and `rename.ts` repeat parts of the same position-tool
pipeline. They also have real differences: rename applies a transaction and
refreshes sessions, call hierarchy has directions and multiple targets, and
inspect composes several protocol operations. Extracting one registration
framework before the earlier phases risks hiding those differences.

**Contract.** First extract only small concepts that are already identical,
such as MCP text-response construction, cursor-context sectioning, or common
position preparation. Introduce a larger registration helper only if, after
Phases 1–4, at least three handlers remain genuinely isomorphic and their
differences can be expressed without hooks or branching flags.

**Done when** repeated plumbing is smaller and consistent without making the
unique control flow of rename, call hierarchy, or inspect harder to follow. It
is acceptable for this phase to conclude that no full tool skeleton is needed.

## Phase 6 — Sweep

Status: implemented 2026-07-21. The multiline formatters in `inspect.ts`,
`references.ts`, and `completion.ts` now assemble explicit lines and sections;
their exact rendering contracts and multi-file reference ordering remain
covered by unit tests. The remaining `result +=` uses are short optional
suffixes rather than multiline builders with trailing trim. Rename rendering
now reads each changed file once for all of its previews, and symbol-kind names
come from one module-level lookup rather than rebuilding the table per call.
The supported Node floor is now pinned at 22.13.0 in `.nvmrc`, consumed by CI,
and aligned with the current development dependency requirements.

Optional cleanup candidates, safe to do piecemeal when a file is already open:

- Completed 2026-07-21: multiline formatters build `lines: string[]` +
  `join('\n')` instead of `result += ...` with a trailing `.trim()` to fix the
  accounting.
- Delete narration/changelog comments ("Using the new tryResult helper…",
  "Transform LSP response to our format"). Keep load-bearing ones (e.g. the
  `selectionRange` spec-deviation note in call-hierarchy.ts).
- `src/types.ts` grab-bag: split by concern (result/error helpers, client
  state, stores, request types); it currently mixes types and functions under
  a name that promises types.
- Prefer `vscode-languageserver-protocol` imports over the hand-declared
  duplicates in `src/types/lsp.ts` where they exist (keep only genuinely
  internal shapes; move `getDocumentSymbols` out of a types module).
- Split `operations.ts` by cohesive domain as the earlier phases touch it
  (navigation, workspace search, diagnostics, rename) if that improves local
  reasoning. Do not split stateful runtime modules solely because they are
  long.
- Completed 2026-07-21: `formatRenameResults` reads each file once, not once
  per change, and `getSymbolKindName` reuses one module-level lookup table.
- Completed 2026-07-21: make the supported Node floor reproducible. The package
  promises `>=22.13.0`, `.nvmrc` pins that minimum for development, and every
  CI job consumes the same file rather than floating on the latest Node 22.

---

## Verification

- Every phase: `pnpm build`, `pnpm test:unit`, `pnpm check:unused`, and
  `pnpm check:unused:ts` green before moving on.
- Phases 1–3 change operation or enrichment return shapes: update
  `test/unit/lsp-operations.test.ts` alongside, and live-validate at least one
  position tool (inspect or references) against a real session after the
  change, since tool registration changes require a session restart
  (CLAUDE.md).
- This roadmap is refactoring only. Public MCP tool behavior (names, schemas,
  rendered output) should not change except where output was inconsistent by
  accident; call out any deliberate output change in the PR.

---

## Review Findings — 2026-07-21 (Claude, post-implementation)

Review of the Phase 0–6 implementation. All "done when" criteria were checked
mechanically and hold; build, unit tests, knip, and unused-code checks are
green. The findings below were the residue. None were structural, and all were
completed in place on 2026-07-21.

1. **Completed — Phase 4 residue: file/workspace preparation used the banned
   unwrap-throw pattern.** `prepareFileRequest` and `prepareWorkspaceRequest`
   returned `Result<_, ValidationError>`, and all three consumers unwrapped
   and rethrew message-only: `src/tools/diagnostics.ts`,
   `src/tools/outline.ts`, `src/tools/search.ts`
   (`throw new Error(prepared.error.message)` — drops `ValidationErrorCode`
   and cause). None of these callers branch on the Result, so the "keep Result
   where callers genuinely branch" exemption does not apply, and the sibling
   `resolveSymbolTarget` already throws. Resolution: file, workspace, and
   position preparation now throw the same native error shape, with the full
   validation object retained as `cause`; the three unwrap sites and obsolete
   Result helpers are gone.

2. **Completed — leftover paranoia in `src/tools/references.ts`.** The
   `if (!uri || !ref.range) continue` guard checked internal data that the
   operations contract guarantees (`SymbolReference[]` is normalized
   `Location[]`; uri and range are always present). Resolution: enrichment now
   maps from the guaranteed references and attaches the corresponding result
   by index, so grouping consumes normalized references without shape checks.

3. **Completed — contract inconsistency in `src/lsp/operations/operations.ts`
   (`findReferences`).** `Array.isArray(references) ? references : []` guards
   a result the typed descriptor already narrows to `Location[] | null`.
   Resolution: `references ?? []` now states the descriptor's contract, as
   `callHierarchy` in the same file already does.

Also noted, no action needed: the Phase 5 conclusion (no registration
skeleton) diverged from the pre-implementation prediction and is accepted —
`resolveSymbolTarget` plus `textToolResult` removed the ceremony that made a
skeleton attractive, and the remaining per-handler duplication is a few
self-evident lines.
