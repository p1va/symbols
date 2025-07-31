# Outstanding Work & Next Steps

This document is a living punch-list of **open technical tasks**. It is an
extraction of the latest architectural review (July 2025) so that developers
can see _at a glance_ what still needs doing without having to re-read the
full review narrative.

If an item has a corresponding GitHub issue, add the link in brackets.

---

## 1 Immediate priorities (≤ 1 iteration)

|  ID | Task                                                                                              | Owner | Status |
| --: | ------------------------------------------------------------------------------------------------- | :---: | :----: |
| P-1 | **Structured error handling** – introduce `ApplicationServiceError`, `ErrorCode`, new `Result<T>` |       |   ⬜   |
| P-2 | Finish **file-lifecycle v2** and delete legacy implementation (`file-lifecycle.js`)               |       |   ⬜   |
| P-3 | Refactor diagnostics/window-log stores → functional & capped                                      |       |   ⬜   |
| P-4 | Add ESLint + Prettier _pre-commit_ hook; remove “.js” suffixes from TS imports                    |       |   ⬜   |
| P-5 | Minimal **CI** – run `pnpm test && pnpm lint` on every PR                                         |       |   ⬜   |

## 2 Short-term backlog (1–3 iterations)

- End-to-end test for one complex tool (suggest: `findReferences`).
- Eviction logic unit-test for capped stores (≥1000 window-log entries).
- Extract `getLogLevelName()` into a standalone util (and reuse everywhere).
- Decide fate of `dist/` artefacts – keep and automate, or `.gitignore` them.

## 3 Medium horizon (>3 iterations)

- Public SDK surface for external callers once error model is stable.
- Language-ID helper instead of manual switch statements.
- Documentation & contributor guide refresh after folder consolidation.

---

### How this file relates to the other docs

- **docs/IMPROVEMENTS.md** – historical roadmap created during the first
  review. All still-valid tasks are copied here.
- **docs/STRUCTURE_REVIEW.md** – discusses folder layout rationale; keep it
  for background context.

Those two files can stay where they are for now; when their content becomes
obsolete we can move them into `docs/archive/` or delete them. Until then
this _OUTSTANDING.md_ will be the single source of truth for open work.

---

_Last updated: 2025-07-30_
