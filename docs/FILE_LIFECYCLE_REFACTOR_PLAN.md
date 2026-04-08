# File Lifecycle Refactor Plan

Date: 2026-04-02

Status: partially completed

This document captures the next cleanup target after the manager/session
refactor. The runtime architecture is now:

- `LspManager`
  - routing, lifecycle, status, and cross-session ownership index
- `LspSession`
  - one live LSP process, one client, one workspace view, one document set
- `LspClient`
  - transport only

The remaining awkward area is the file lifecycle layer under
`src/lsp/file-lifecycle`.

## Current Status

Completed in the current refactor:

- `LspSession` is now the public owner of document lifecycle
- the generic `DocumentLifecycleObserver` plumbing has been removed
- manager ownership propagation now uses a narrow session callback shape
- the old public `src/lsp/file-lifecycle/manager.ts` surface has been removed
- `src/lsp/file-lifecycle/ops.ts` is now just low-level transport plumbing

Still worth doing in a follow-up:

- rename `PreloadedFiles` to a session-document-oriented name
- add focused tests for session-owned lifecycle behavior if we see regressions

Current design choice:

- do not prioritize `didChange` for normal tool operations
- prefer open/read fresh content/close for transient requests
- keep only anchor or preloaded files open when needed to preserve workspace
- avoid assuming this process is the single source of truth for document edits

Important distinction:

- `preload_files` stays as profile configuration for anchor files that should
  remain open
- the runtime document store should be named for session documents, not for
  preloads

## Original Problem

`src/lsp/file-lifecycle/manager.ts` is no longer shaped correctly for the
current architecture.

What is odd about it:

- it is called `manager`, but it is not a manager in the runtime sense
- it exposes a public API even though it is now effectively a session-internal
  implementation detail
- `LspSession` is the true owner of document lifecycle, but the helper
  functions still require session internals to be threaded in as parameters:
  - `client`
  - `preloadedFiles`
  - `workspacePath`
  - `configPath`
  - lifecycle observer
- the generic observer pattern is too indirect for what is now just
  session-to-manager ownership propagation
- `PreloadedFiles` is serving as both:
  - preload/anchor-file state
  - general open-document state
- `openFileWithStrategy(...)` currently does too much:
  - path normalization
  - disk reads
  - language ID resolution
  - version selection
  - reopen logic
  - LSP notifications
  - document store mutation
  - lifecycle callbacks

## What To Keep

These parts are still useful:

- explicit `FileLifecycleStrategy`
  - `transient`
  - `persistent`
  - `respect_existing`
- small transport helpers in `ops.ts`
  - `openFile`
  - `closeFile`
  - `forceCloseFile`
- the idea that transient operations may need fresh disk content while
  persistent/preloaded files remain open to keep the workspace alive

## What To Change

The core change is:

- file lifecycle should become a session concern, not a public subsystem

That means:

- `LspSession` should own document open/close/ensure semantics directly
- manager should only receive ownership updates from session
- low-level helpers should stop receiving generic observers

## Target Architecture

### 1. Session owns document lifecycle

`LspSession` should expose session-local methods such as:

- `ensureDocument(filePath, strategy)`
- `openDocument(filePath, strategy)`
- `closeDocument(filePath, reason?)`
- `withDocument(filePath, strategy, operation)`
- `withCursorContext(operationName, filePath, position, strategy, operation)`

These methods should:

- normalize the path
- consult/update session document state
- choose content and version
- send `didOpen` / `didClose` and later `didChange`
- update ownership locally

### 2. Manager gets narrow ownership signals

If the manager keeps `documentOwners`, it still needs session-to-manager
signals. But the current generic lifecycle observer is broader than needed.

Replace it with a narrow session callback shape such as:

- `onDocumentClaimed(sessionKey, filePath, uri)`
- `onDocumentReleased(sessionKey, filePath, uri)`

This keeps the manager informed without leaking generic helper-layer concepts
through the stack.

### 3. File lifecycle helpers become private plumbing

The code in `src/lsp/file-lifecycle` should either:

- move into `src/runtime/lsp-session.ts`, or
- be renamed and kept as clearly internal helpers

If kept as a module, it should not be named `manager.ts`.

Better names would be:

- `document-lifecycle.ts`
- `document-ops.ts`
- `document-store.ts`

### 4. Rename `PreloadedFiles`

`PreloadedFiles` no longer describes the full responsibility of the store.

It should become something like:

- `DocumentRegistry`
- `OpenDocumentStore`
- `SessionDocuments`

That store should model:

- current content
- current version
- open/closed state
- whether the document is an anchor/preloaded document

## Design Choice On Ownership Propagation

There are two valid designs.

### Option A. Manager keeps `documentOwners`

Pros:

- fast routing for file -> session
- clear single ownership index

Cons:

- session needs to notify manager when ownership changes

Recommendation:

- keep this option
- use narrow session -> manager callbacks
- do not keep the current generic observer threading
- only let ownership short-circuit routing when a document is genuinely open in
  a session

### Option B. Manager computes ownership on demand

Pros:

- simpler data model
- no callbacks needed

Cons:

- manager must scan sessions to answer file ownership
- weaker incremental view of routing state

This is valid, but not the recommended next step.

## Short-Term Improvement Goals

This cleanup should achieve:

- clearer names
- fewer pass-through abstractions
- session owns what session actually does
- manager knows only what it needs for routing
- less generic observer plumbing
- better fit with the Claude Code mental model:
  - manager -> session -> client

## Important Non-Goals For This Pass

Do not mix this refactor with:

- profile upsert / config mutation
- built-in install catalog
- host packaging for Gemini/Codex
- call hierarchy
- multi-instance session keys

Those are still next-tier priorities, but they should sit on top of a cleaner
session/document boundary.

## Proposed Sequence

### Step 1. Replace the generic observer pattern

Status: done

- remove `DocumentLifecycleObserver` from the file-lifecycle public surface
- add a narrow session -> manager ownership callback
- keep manager `documentOwners`

### Step 2. Pull lifecycle entrypoints into `LspSession`

Status: done

- make session methods the only public lifecycle API
- stop exporting lifecycle orchestration as a public subsystem

### Step 3. Rename the document state store

Status: pending

- rename `PreloadedFiles` to a session-document-oriented name
- preserve current behavior while improving the model name
- keep `preload_files` as the config-level anchor-file term

### Step 4. Rename or fold `file-lifecycle/manager.ts`

Status: done

- either fold the logic into session
- or rename it away from `manager.ts`

### Step 5. Revisit reopen behavior

Status: deferred by design

Current behavior for already-open files is effectively:

- close
- reopen

That is acceptable for the current tool model. Symbols is not acting like a
single-editor process with authoritative in-memory buffers. Files may be edited
externally by IDEs, agents, or other tools, so the safer default for
non-anchor operations is still:

- read from disk
- open
- perform operation
- close again

Using `didChange` may still make sense later for more editor-like workflows,
but it is not the current target and should not be treated as the default next
step for this refactor track.

## Verification Expectations

After this refactor, verify at minimum:

- `pnpm build`
- `pnpm test:unit`

If behavior changes materially, add or update focused tests around:

- transient lifecycle
- persistent/preloaded files
- ownership propagation to manager
- file reopen / close decisions
