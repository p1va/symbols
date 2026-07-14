# Code Review Findings — 2026-07-13

Full-codebase review of the runtime, operations, and tools layers.
Status at review time: build passing, 239/239 tests passing on `main`
(with the pending working-tree changes applied).

Each finding lists the location, the defect, the impact, and the suggested fix.
Items are ordered most-impactful first within each section.

---

## Confirmed bugs

### 1. Any position on an empty line is rejected as invalid

- **Location:** `src/validation.ts:149` (`validatePosition`)
- **Defect:** `if (!lineContent)` is truthy for an empty string, so a blank
  line that exists in the file is reported as
  `Line X does not exist in file.`
- **Impact:** Every position-based tool (inspect, references, completion,
  rename, call hierarchy) fails when pointed at column 1 of a blank line.
  Agents do this frequently, e.g. requesting completion on a fresh line.
- **Fix:** Change the guard to `lineContent === undefined`. Column 1 on an
  empty line is valid (`character index 0 <= length 0`).
- **Verified:** Yes — reproduced the falsy behavior
  (`lines[i] === "" → !lineContent === true`).

### 2. Semantic tokens decoded against a hardcoded legend, not the server's

- **Location:** `src/types/lsp.ts:466` (`getSemanticTokens`)
- **Defect:** Token indices in a `textDocument/semanticTokens/full` response
  point into _the server's_ legend, delivered in the `initialize` result
  (`capabilities.semanticTokensProvider.legend`). That legend is stored on
  `client.serverCapabilities` (`src/lsp-client.ts:458`) but never read.
  Decoding uses a hardcoded 12-entry token-type list whose order matches no
  real server. The comment at `src/types/lsp.ts:463` acknowledges this.
- **Impact:** `tokenType` / `tokenModifiers` shown in cursor context
  ("At Cursor: (interface) foo") are systematically mislabeled for
  essentially every language server.
- **Fix:** Pass `client.serverCapabilities.semanticTokensProvider.legend`
  into `decodeSemanticTokens`, keeping the hardcoded list only as a fallback
  when the server provides no legend.

### 3. `workspace/configuration` reply violates the LSP contract

- **Location:** `src/lsp-client.ts:278` (generic `onRequest` handler)
- **Defect:** The LSP spec requires the result array to contain one element
  per entry in `params.items`. The handler returns `[]` unconditionally.
- **Impact:** Servers index into the result positionally; some (gopls and
  lua-language-server are known cases) crash or silently ignore settings
  when the array is shorter than `items`.
- **Fix:** `return params.items.map(() => null);`

### 4. Workspace URI built without percent-encoding

- **Location:** `src/runtime/lsp-manager.ts:170` and `:213`
- **Defect:** `` `file://${resolvedWorkspacePath}` `` produces an invalid
  `rootUri` / workspace-folder URI when the workspace path contains spaces
  or non-ASCII characters. Document URIs go through `pathToFileURL()` and
  are properly encoded, so the two disagree.
- **Impact:** The server sees documents that don't appear to live inside the
  workspace folder; behavior varies by server (indexing and workspace-wide
  features can silently degrade).
- **Fix:** Use `pathToFileURL(resolvedWorkspacePath).toString()` in both
  places, matching document URI construction.

### 5. `formatFilePath` prefix check can corrupt paths — and rename writes through it

- **Location:** `src/tools/utils.ts:54` (`formatFilePath`), consumed by
  `applyFileChanges` at `src/tools/utils.ts:113`
- **Defect:** `cleanPath.startsWith(cwd)` lacks a trailing-separator check.
  With cwd `/home/user/repo`, the file `/home/user/repo2/f.ts` is rewritten
  to the relative path `2/f.ts`.
- **Impact:** Cosmetic in display contexts, but `applyFileChanges` reads
  **and writes** files through this function, so a rename touching a sibling
  directory with a shared path prefix targets the wrong path. It also
  assumes cwd equals the workspace, which is not guaranteed when
  `--workspace` is passed.
- **Fix:** Compare against `cwd + path.sep`, and have `applyFileChanges`
  convert URIs to paths with `url.fileURLToPath` instead of a
  display-formatting helper.
- **Related (Windows):** All `uri.replace('file://', '')` sites break on
  Windows (`/C:/...` remains): `src/tools/utils.ts:43`,
  `src/tools/enrichment.ts:40`, `src/utils/cursor-context.ts:348`,
  `src/workspace/loaders/roslyn.ts:32`. `url.fileURLToPath` is the robust
  primitive if Windows is ever in scope.

---

## Design gaps

### 6. Rename edits disk but never tells the server

`applyWorkspaceChanges` (`src/tools/utils.ts:250`) writes rename edits
directly to disk, but no `didChange`/`didClose` is sent for documents the
server still has open (preloaded / persistent ones), and there is no
`workspace/didChangeWatchedFiles` support anywhere. Transient operations
self-heal because they force-reopen with fresh content, but after a
multi-file rename the server's view of _other_ preloaded files is stale
until each is individually touched. In an agent workflow where files change
constantly outside the LSP's view, this is the biggest conceptual gap in
the design. Options: re-open (didClose + didOpen) every written file that is
currently open, or add `didChangeWatchedFiles` support.

### 7. Unbounded memory growth in `WindowLogStore`

`src/state/stores.ts:106` — every `window/logMessage` is retained forever
(Roslyn is very chatty over long sessions) and each message is also
duplicated into the logger at info level. Suggested: ring buffer capped at a
few hundred entries; drop or demote the per-message `logger.info`.

### 8. Misleading search error when no profile matches workspace markers

`resolveSearchTargetSessions` (`src/runtime/lsp-manager.ts:532`) — in start
mode only profiles whose `workspace_files` match the workspace participate
in search, and a profile with an empty `workspace_files` list can never be
searched. When nothing matches, `getSearchSessions` throws
"No LSP profiles are currently configured" even though profiles exist.
Suggested: distinct message ("profiles configured but none matched workspace
markers"), and decide whether marker-less profiles should be included.

### 9. Crash during warmup can leave `state: 'ready'` with no client

`src/runtime/lsp-session.ts:824` — if the LSP process exits during the
`workspace_ready_delay_ms` sleep, the exit handler sets `state = 'error'`
and nulls `client`, but the tail of `start()` then unconditionally sets
`state = 'ready'`. `isReady()` stays correct (it checks `client !== null`),
but the status resource reports a ready session with a null pid. Fix: guard
the final assignment with `client !== null`.

---

## Positive notes

The pending working-tree diff already contains genuine fixes worth keeping:

- Configurable push-diagnostics wait (`wait_timeout_ms` instead of a fixed
  500 ms sleep) in `src/lsp/operations/operations.ts`.
- Process-kill check via `exitCode`/`signalCode` instead of `process.killed`
  in `src/runtime/lsp-session.ts`.
- Guard against snippet-style rename edits in the rename operation.

## Suggested fix order

1–3 are cheap, high-value fixes (with unit tests for the empty-line and
legend cases). 4–5 next. 6 deserves a small design decision before coding.
7–9 are cleanups that can ride along with other work.
