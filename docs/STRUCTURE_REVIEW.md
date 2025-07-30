# Repository structure review

This document captures the **non-blocking** refactor/organisation suggestions that came out of the initial code-base review. Use it as a punch-list – adopt items that make sense and ignore the rest.

---

## General observations

- Current `/src` is ~1.6 kLoC; individual files rarely exceed ~300 LoC – good, but some files already mix unrelated concerns.
- Try to follow _“one public concept per file”_ plus its private helpers.
- Side-effectful _startup_ code, pure _helpers_, and _tool registration_ are intermingled right now; consider teasing them apart.

## Proposed high-level layout

```
src/
├─ main/                 ← side-effectful application entry point
│  └─ index.ts
│  └─ createServer.ts
│
├─ lsp/
│  ├─ client.ts
│  ├─ operations/
│  │   ├─ goToDefinition.ts
│  │   ├─ goToImplementation.ts
│  │   └─ …
│  └─ fileLifecycle/
│      ├─ manager.ts
│      └─ ops.ts
│
├─ tools/                ← one MCP tool per file (inspect.ts, findReferences.ts, …)
│  └─ …
│
├─ state/
│  ├─ diagnostics.ts
│  └─ windowLog.ts
│  └─ index.ts (re-exports)
│
├─ types/
│  ├─ lsp.ts
│  ├─ mcp.ts
│  └─ index.ts (barrel)
│
└─ utils/
    └─ logLevel.ts
```

### Rationale per area

1. **`src/index.ts` (≈370 LoC)**
   _Currently holds:_ startup logic _and_ helper functions _and_ tool registration.
   _Refactor:_
   - `main/index.ts` – **only** bootstraps app & starts server.
   - `main/createServer.ts` – builds and exports configured `McpServer`.
   - `utils/logLevel.ts` – `getLogLevelName`, `getDefaultPreloadFiles`.
   - `tools/` – one file per MCP tool for clean, discoverable registrations.

2. **`src/lsp-operations.ts` (≈260 LoC)**
   _Exports multiple navigation helpers._ Move each operation into `lsp/operations/` and keep a thin `index.ts` barrel.

3. **`src/file-lifecycle*.ts` (≈450 LoC total)**
   Decide which version is canonical. Afterwards split into:
   - `fileLifecycle/manager.ts` – stateful orchestration
   - `fileLifecycle/ops.ts` – small pure helpers (`openFile`, `closeFile`, …)

4. **`src/stores.ts`**
   When more stores appear, move to `state/` folder to group domain concerns.

5. **`src/types.ts`**
   Acceptable today; once >200 LoC or multiple domains, split into `types/lsp.ts`, `types/mcp.ts`, etc., with a barrel re-export.

6. **`dist/` in VCS**
   Generated artefacts are committed. Either document why or add to `.gitignore`.

## Decision checklist

✔ Will the split expose a clear public concept?  
✔ Does it avoid circular imports?  
✔ Does it keep most files <300 LoC?  
✔ Does it improve testability (pure helpers importable without side-effects)?

---

Adopting even a subset of these suggestions should keep growth under control and make future onboarding easier.
