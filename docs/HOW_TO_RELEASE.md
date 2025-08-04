# Releasing `@p1va/symbols`

This note walks you through turning the repository into an npm-published CLI
that is automatically built, tested and released whenever you push a Git tag
named `v*` (for example `v1.3.0`).

Legend

- **You do once** – repository or account level set-up.
- **You do per release** – regular day-to-day flow.

---

## 1 Entry point & build

1. Add a she-bang to **`src/index.ts`**:

```ts
#!/usr/bin/env node
```

2. Ensure `package.json` exposes the compiled file:

```jsonc
{
  "bin": {
    "symbols": "./dist/index.js",
  },
  "exports": "./dist/index.js",
  "type": "module",
}
```

3. Build command – pick **either** plain `tsc` (already present) **or**
   a bundler such as `tsup`:

```jsonc
{
  "scripts": {
    "build": "tsc -p tsconfig.json", // or: "tsup src/index.ts --format esm"
  },
}
```

---

## 2 npm package metadata

```jsonc
{
  "name": "@p1va/symbols",
  "version": "0.1.0",
  "files": ["dist", "README.md", "LICENSE"],
  "publishConfig": {
    "access": "public",
  },
}
```

Optional: add a `.npmignore` if you prefer **not** to use the `files` field.

---

## 3 GitHub secrets (you do once)

- **`NPM_TOKEN`** – npm automation token with _publish_ rights for the
  `@p1va` scope.
- **`GH_TOKEN`** – GitHub token (public-repo + workflow) – only needed if you
  want GitHub Releases in addition to npm publishing.

Save them under _Settings → Secrets → Actions_ in the repository.

---

## 4 CI workflow – `.github/workflows/release.yml`

```yaml
name: CI & Release

on:
  push:
    tags:
      - 'v*' # runs only on semantic version tags

jobs:
  build-test-publish:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: 'https://registry.npmjs.org'

      - run: corepack enable # optional, if you rely on pnpm/yarn
      - run: pnpm install --frozen-lockfile # or: npm ci / yarn install
      - run: pnpm run build
      - run: pnpm run test # vitest / eslint / etc.

      - run: pnpm publish --access public --no-git-checks
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      - uses: softprops/action-gh-release@v1
        if: success()
        with:
          generate_release_notes: true
        env:
          GITHUB_TOKEN: ${{ secrets.GH_TOKEN }}
```

Feel free to switch `pnpm` to `npm` or `yarn` as suits your stack.

---

## 5 Release flow (you do per release)

```bash
npm version patch|minor|major   # bumps version & creates a vX.Y.Z tag
git push --follow-tags          # pushes commit **and** tag
```

The pushed tag triggers the GitHub Action, which builds, tests and publishes
`@p1va/symbols@X.Y.Z`. After the workflow is green you can test it via:

```bash
npx -y @p1va/symbols --help
```

---

## 6 Optional enhancements

- Nightly / snapshot builds: add a second workflow on `push` to `main` that
  publishes under the `next` dist-tag.
- [`release-please`](https://github.com/googleapis/release-please) for
  automated CHANGELOG and version bump PRs.

---

That’s all – once this file’s checklist is applied, shipping a new release is
as easy as `npm version` + `git push`.
