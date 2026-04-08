# Tool/Operation Simplification Plan

Date: 2026-04-02

Status: completed

This document now records the completed refactor and the resulting steady
state.

## What Changed

The previous awkward boundary between tools, validation, and operations has
been simplified into four clear stages:

1. tool parsing
2. session resolution
3. request preparation
4. operation execution + formatting

Concretely:

- `src/tools/validation.ts`
  - still owns MCP boundary parsing from `unknown`
- `src/preparation.ts`
  - now owns semantic validation and request normalization
- `src/lsp/operations/operations.ts`
  - now owns protocol translation only
- `src/runtime/lsp-session.ts`
  - now provides scoped request execution via session-owned callbacks

## Current Model

### 1. Tools are boundary-only

Tools now do this shape:

1. parse raw MCP input
2. ask `LspManager` for a session
3. prepare a request against that session
4. call an operation with `session + prepared request`
5. format the returned data

Tools no longer ask operations to validate file paths, workspace readiness, or
cursor bounds.

### 2. Preparation is the semantic boundary

`src/preparation.ts` now contains helpers such as:

- `prepareFileRequest(...)`
- `prepareSymbolPositionRequest(...)`
- `prepareRenameRequest(...)`
- `prepareWorkspaceRequest(...)`

Prepared requests now contain the normalized values operations actually need,
for example:

- `filePath`
- original one-based position
- zero-based `lspPosition`

### 3. Operations are protocol-focused

Operations in `src/lsp/operations/operations.ts` now:

- accept prepared inputs
- translate to LSP method names and wire params
- map responses back into Symbols result types

Operations no longer:

- call `validateSymbolPositionRequest(...)`
- call `validateFileRequest(...)`
- call `validateWorkspaceOperation(...)`
- call `session.getClient()`

### 4. Session owns scoped request execution

`LspSession` now exposes:

- `request(method, params)`
- `executeWithCursorContext(...)`
- `executeWithDocumentLifecycle(...)`

The scoped callbacks now receive small request scopes instead of a bare `uri`.

Current callback shape:

```ts
async ({ uri, cursorContext, request }) => {
  const hover = await request('textDocument/hover', params);
};
```

That keeps lifecycle scoped to the session while removing the old split where
operations grabbed the raw client outside the callback.

## Important Design Decisions

### Keep two validation concerns

The distinction remains:

- boundary parsing
- semantic preparation

But semantic preparation now happens before operations rather than inside them.

### Keep scoped session execution

The nested callback model stays because document lifecycle is a scoped concern.

What changed is the payload given to the callback, not the idea of scoped
execution itself.

### Do not reintroduce a context bag

The runtime model remains:

- `LspManager`
- `LspSession`
- `LspClient`

There is no return to a generic runtime context object.

## Test Coverage Added

This refactor added or updated tests for:

- preparation helpers in `test/unit/preparation.test.ts`
- operation request mapping in `test/unit/lsp-operations.test.ts`

Those tests now validate the new contract directly:

- prepared inputs go into operations
- operations talk to LSP through session-scoped `request(...)`

## Next Good Steps

The next work should not be more boundary refactoring. This area is now in a
good state.

Higher-value next steps are:

- setup/catalog/install surfaces for known LSP profiles
- safe profile mutation through `setup`
- call hierarchy operations
- later, stronger multi-session capabilities if needed
