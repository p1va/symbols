# Planned Improvements

This document collects concrete, _actionable_ enhancements that emerged during
the architectural review (see chat on 2025-07-29). Each item is phrased as a
task so that we can easily turn the list into GitHub issues or a project
board.

---

## 1 API ergonomics – introduce `LspContext`

- Create a `Readonly<LspContext>` type that bundles the shared cross-cutting
  services:
  - `client: LspClient`
  - `preloadedFiles: PreloadedFiles`
  - `diagnosticsStore: DiagnosticsStore`
  - `windowLogStore: WindowLogStore`
- Add a small `createContext()` factory in `src/index.ts` once the LSP client
  has been initialised.
- Refactor _one_ operation (`getDocumentSymbols`) to accept
  `(ctx, request)` and destructure only the fields it needs. If that feels
  good, migrate the remaining seven operations.

## 2 Structured error handling

- Replace the current `Result<T>` with the discriminated-union pattern from
  `IMPLEMENTATION_PLAN.md`:

  ```ts
  interface ApplicationServiceError {
    message: string;
    errorCode: ErrorCode;
    originalError?: Error;
  }
  type Result<T> =
    | { success: true; data: T }
    | { success: false; error: ApplicationServiceError };
  ```

- Define `enum ErrorCode` with at least the four baseline values
  (`WorkspaceLoadInProgress`, `FileNotFound`, `LSPError`, `InvalidPosition`).
- Update return types and tests accordingly.

## 3 Complete at least one non-trivial LSP operation end-to-end

Goal: validate the full stack – position conversion, file lifecycle, text
enrichment, result typing, error surfaces.

Suggested candidate: **`getDocumentSymbols`**.

Steps:

1. Implement internal helper `getDocumentSymbolsInternal`.
2. Use `executeWithFileLifecycle`.
3. Filter/transform to `DocumentSymbol[]` with 1-based positions.
4. Write a Vitest integration test against a real
   `typescript-language-server` child-process.

## 4 File-lifecycle – handle pre-loaded files correctly

- In `file-lifecycle.ts` implement the “preloaded close/re-open” algorithm
  described in the plan so that context-files stay resident.
- Unit-test both code paths: preloaded vs. regular file.

## 5 Stores – functional & capacity-limited

- Refactor `createDiagnosticsStore` / `createWindowLogStore` to close over
  their internal `Map`/array and expose pure accessor functions (no outward
  mutation).
- Impose caps: diagnostics – unlimited; window logs – max 1000 newest
  entries (evict older ones).

## 6 TypeScript & linting alignment with Next.js style

- Remove explicit `.js` extensions from intra-repo imports and rely on TS path
  resolution.
- Enable strict compiler flags in `tsconfig.json`:
  `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.
- Add ESLint + Prettier pre-commit hook (or extend existing config) to enforce
  the conventions.

## 7 Utility refinements

- Extract `getLogLevelName()` to `src/logger.ts` (or similar) for reuse.
- Replace manual language-id switch with a tiny lookup map or a helper from
  `vscode-languageserver-textdocument`.

---

Feel free to open individual PRs linked to the tasks above; they are designed
to be largely independent so the team can work in parallel.

---

## Progress snapshot – 2025-07-29

Legend: ✅ done 🔄 partial / in-flight ⬜ still to do

| #   | Task                                     | Status | Notes                                                                                                   |
| --- | ---------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------- |
| 1   | API ergonomics – introduce `LspContext`  | ✅     | `LspContext` interface exists, `createContext()` factory wired; all operations consume `(ctx, request)` |
| 2   | Structured error handling                | ⬜     | `Result<T>` still string-error variant; no `ApplicationServiceError` / `ErrorCode` enum yet             |
| 3   | Complete `getDocumentSymbols` end-to-end | 🔄     | `readSymbols` implemented with lifecycle wrapper; need 1-based conversion + Vitest integration test     |
| 4   | File-lifecycle – handle pre-loaded files | 🔄     | `file-lifecycle-v2.ts` present, pre-load branch not yet finished; unit tests missing                    |
| 5   | Stores – functional & capacity-limited   | ⬜     | Stores still expose internals; no eviction logic                                                        |
| 6   | TS & linting alignment                   | 🔄     | `strict` on; extra flags & ESLint/Prettier hook missing; still using “.js” import suffixes              |
| 7   | Utility refinements                      | 🔄     | `getLogLevelName()` exists but in `index.ts`; language-id helper not added                              |

Next recommended steps (descending priority): 1. land new `Result<T>` shape, 2. finish lifecycle & tests for `readSymbols`, 3. refactor stores, 4. decide on import-extension strategy & update lint config.
