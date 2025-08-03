# 2025-08-02 TypeScript-idiomatic Review

This document captures the feedback that emerged after the “remove all ESLint
errors” sprint. None of the items below blocks the current green build; they
serve as guidance for the next hardening iterations.

---

## 1 Result / Error-handling pattern

|   # | Recommendation                                                                            | Rationale                                                                                                    |
| --: | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
|   1 | Give `Result` a _generic_ error parameter.<br>`type Result<T, E = LspOperationError> = …` | Lets us reuse the same wrapper for validation, network and domain errors without widening unions everywhere. |
|   2 | Flip the discriminant to `ok` / `error` and rely on **`never`** exhaustiveness.           | Eliminates accidental property access in the “happy” branch.                                                 |
|   3 | Provide a tiny helper (`result.try(fn)`) so callers can avoid `try/catch` boilerplate.    | Keeps tool handlers single-layer and easier to read.                                                         |

## 2 File-path imports

1. Remove explicit “`.js`” extensions in TypeScript source and rely on
   `paths` / `moduleSuffixes` in `tsconfig.json` to have the compiler fix them
   for ESM output.
2. Introduce an alias (e.g. `#/…`) so intra-repo imports stay short and
   refactor-friendly.

## 3 Zod schemas

- Call `.strict()` on every `z.object({ … })` to reject unknown keys early.
- Optionally extract a tiny `int()` helper that brands ints at the type level
  to avoid silent float-to-int coercions.

## 4 Stores

Diagnostics and window-log stores currently mutate `Map`/`Array` in place.
Wrapping them in an immutable layer (e.g. **Immer** or manual copies) would
unlock time-travel debugging and eventual Redux-DevTools integration for UI.

## 5 `dist/` artefacts in Git

The common workflow is:

- add `dist/` to `.gitignore`;
- run `pnpm build` in a `prepack` hook so published packages still contain JS.

## 6 Misc. TypeScript idioms

- Use `import type { … }` for purely-type imports – TS 5.x elides them in JS.
- Consider a namespace wrapper for one-based position helpers to group them
  semantically.
- Replace `any[] | string` multi-shape return values with discriminated
  unions so consumers can `switch` on a `kind` field instead of runtime
  `typeof` checks.

## 7 CI / Hooks

Once the pre-commit ESLint hook lands, enable `--max-warnings 0` so “yellow”
does not creep back in over time.

---

_Created: 2025-08-02_
