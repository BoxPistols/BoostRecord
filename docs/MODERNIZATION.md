# Boostnote Legacy — Modernization Roadmap

This document tracks the plan for bringing this legacy codebase up to a more
current environment. It is intentionally **risk-tiered**: the foundational and
low-risk work is done first and verified automatically; the high-risk major
upgrades are planned explicitly and require human verification before merging.

> **Key constraint.** The Electron 4 desktop app cannot currently be *built or
> run* on Apple Silicon (arm64) in this environment. Automated CI verifies
> `lint`, the AVA data-layer suite, and the Jest suite under Node 14 — but it
> does **not** exercise the packaged Electron runtime. Therefore any change
> that could affect runtime/build behavior (Electron, React, Webpack, Babel,
> native modules) must be manually verified with `npm run dev` / `npm run
> compile` on a supported machine before merging. Do not auto-merge those.

## Current versions (baseline)

| Package    | Current   | Latest  | Tier |
|------------|-----------|---------|------|
| electron   | 4.2.12    | 42.x    | 3 — hardest |
| react / react-dom | 16.8.6 | 19.x | 3 |
| webpack    | 1.15.0    | 5.x     | 3 |
| babel-core | 6.26.3    | 7.x     | 3 |
| grunt      | 0.4.5     | 1.6.x   | 2 |
| eslint     | 4.18.2    | 9.x     | 2 |
| jest       | 22.4.3    | 30.x    | 2 |
| ava        | 0.25.0    | 6.x     | 2 |

## Done (foundation — merged, CI-verified)

These restored a working, verifiable baseline. Before this work the test suite
could not run at all (0 tests); now the full suite is green and CI guards it.

- **Jest suite restored**: `.babelrc` filetypes syntax, `testURL` for
  localStorage, missing `sugarss` dependency, writable test `localStorage`,
  and scoping `react-css-modules` to dev/prod only (so the test transform no
  longer chokes on Stylus syntax). 0 → 128 passing.
- **AVA suite restored**: writable `window`/`document`/`navigator`/
  `localStorage` in the browser-env helper. 0 → 14 passing.
- **ESLint**: replaced the deprecated `react/jsx-space-before-closing` rule.
- **CI**: GitHub Actions running `lint` + `ava` + `jest` on Node 14 for every
  push/PR (replaces the defunct Travis pipeline). Includes a `git://` → `https://`
  rewrite because a transitive dep (`eve`) is fetched over the protocol GitHub
  disabled in 2022.

## Tier 1 — safe, automatically verifiable (do next)

Low blast radius; CI (lint + ava + jest) is sufficient verification.

- [ ] **Lockfile / package-manager hygiene.** The repo tracks `yarn.lock` but
      gitignores `package-lock.json`, and CI uses `npm install`. `sugarss` was
      added to `package.json` but not to `yarn.lock`, so `yarn install
      --frozen-lockfile` is currently out of sync. Decision needed: standardize
      on **one** package manager. Recommendation: standardize on npm (matches
      CI and historical Travis), commit a `package-lock.json`, and remove
      `yarn.lock` — or, if yarn is preferred, regenerate `yarn.lock` with a
      Node-14-compatible Yarn 1.x and drop the npm lockfile from `.gitignore`.
- [ ] **In-range dependency refresh.** `npm update` within existing semver
      ranges to pick up security/bug patches (already mostly current).
- [ ] **Security patches** that do not change major versions (`npm audit`
      review; only same-major fixes here, majors are Tier 2/3).

## Tier 2 — dev tooling majors (isolated from the Electron runtime)

These do not ship in the app, so CI verification is meaningful, but they are
large config migrations. Do each on its own branch, one at a time.

- [ ] **ESLint 4 → 8** (then evaluate 9 flat-config), with matching
      `eslint-config-standard` / `standard-jsx` / `prettier-eslint` bumps.
- [ ] **Prettier 1 → 3** — will reformat the codebase (large but mechanical
      diff); run as a dedicated formatting-only PR.
- [ ] **Jest 22 → 29/30** — the recently-fixed setup (testURL, localStorage)
      will need re-validation; `testURL` becomes `testEnvironmentOptions.url`.
- [ ] **AVA 0.25 → 6** — ESM-first; the data-layer tests will need updating.
- [ ] **grunt 0.4 → 1.6** for the build orchestration.

## Tier 3 — runtime/build majors (require manual app verification)

Highest risk. Each needs `npm run dev` + `npm run compile` validated by hand on
a supported machine, plus smoke-testing the packaged app. Sequence matters.

> **Verified coupling (spike, 2026-06).** A Babel 6→7 spike on a throwaway
> branch proved these majors are a **coupled big-bang, not incremental**:
> - **Jest works on Babel 7** by adding `babel-core@7.0.0-bridge.0` alongside
>   `@babel/core` (lets jest 22's `babel-jest` load Babel 7). 128/128 passed.
> - **AVA 0.25 is hard-bound to babel-core 6** — it bundles its own
>   `babel-core@6` and rejects `"babel": false`, so it cannot process Babel-7
>   presets. Babel 7 therefore forces an **AVA 0.25 → 4+** upgrade.
> - **`babel-loader@8` requires webpack ≥ 2**; under webpack 1 it silently
>   produces a broken ~29 KB bundle (vs the real ~13 MB / 1602 modules), even
>   though webpack 1 still exits 0. Babel 7 therefore forces the **Webpack
>   1 → 2+** upgrade too.
> - The test-time `browser/...` import resolution (`babel-plugin-webpack-alias`)
>   has a Babel-7 replacement that works: `babel-plugin-webpack-alias-7`.
>
> Net: **Babel 7 + Webpack 2+ + babel-loader 8 + AVA 4** must land together.
> Do them on one branch, gated by the CI build + suite, with manual app
> smoke-testing before merge.

1. [ ] **Babel 6 → 7 + Webpack 1 → 5 + AVA 0.25 → 4 (one coordinated branch)**
       — preset renames (`babel-preset-es2015` → `@babel/preset-env`,
       `@babel/preset-react`), `@babel/register` for AVA, `babel-loader@8`,
       `babel-core@7.0.0-bridge.0` for jest, `babel-plugin-webpack-alias-7`,
       and rewriting the webpack-1 loader syntax
       (`style!css?modules!stylus`) to `module.rules`. The dev HMR preset
       (`react-hmre` / `babel-plugin-react-transform`) → `react-hot-loader`.
2. [ ] **React 16 → 18 (feasible) / → 19 (gated)** — audit (2026-06):
       - Class lifecycles are already migrated to `UNSAFE_` prefixes (no bare
         `componentWillMount`/`WillReceiveProps`/`WillUpdate`), so they keep
         working through React 18.
       - Only **2** `ReactDOM.render` call sites → `createRoot`.
       - **~229 string refs** (`this.refs.X`): deprecated but functional in
         React 18, **removed in React 19** — so React 19 is gated on migrating
         all of them to callback refs / `createRef`. Target React 18 first.
3. [ ] **Electron 4 → latest** — the largest change: arm64 support, context
       isolation, `remote` module removal, `nodeIntegration` review, native
       module rebuilds, and security-model changes. Also unblocks running the
       app on Apple Silicon, which in turn makes Tier 3 verifiable locally.

## Suggested order

Foundation (done) → Tier 1 → Tier 2 → **(Babel 7 + Webpack 5 + AVA 4 as one
coordinated step)** → React 18 → Electron latest. The Babel/Webpack/AVA step is
a single big-bang because of the coupling documented above. Electron is listed
last because every other upgrade is easier to verify once the app builds, but
bringing Electron forward is also what finally enables local arm64
verification — so it may be worth a spike early to unblock the rest.
