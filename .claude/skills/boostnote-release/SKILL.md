---
name: boostnote-release
description: Step-by-step release process for The Boosters legacy app (v0.x.y tags → mac + windows installers). Load before bumping version or pushing a release tag.
---

# The Boosters — Release Process

## Prerequisites

- All intended changes are committed to `main` and pushed
- `git status --short` is empty (no uncommitted changes)
- You know which version increment applies (patch / minor / major)

---

## Step 1 — Pre-flight

Run the full pre-release gate:
```bash
npm run pre-release
```

This sequence must fully pass:
1. ESM/CJS compat check
2. Lint (0 errors)
3. AVA (data layer tests)
4. Jest (component + lib tests)
5. Vite production build
6. Bundle size >500 KB

If any step fails → fix it and re-run before continuing.

Also verify CI is green on `main`:
```bash
gh run list --branch main --limit 3
```

---

## Step 2 — Decide version increment

| Change type | Increment | Example |
|---|---|---|
| Bug fix, security patch, no new features | **patch** | 0.16.10 → 0.16.11 |
| New user-visible feature, no breaking changes | **minor** | 0.16.x → 0.17.0 |
| Breaking change (e.g. Electron major bump, storage format change) | **major** | reserved |

---

## Step 3 — Bump version

Edit `package.json` `"version"` field:
```bash
# Example: bump to 0.16.12
# Edit package.json: "version": "0.16.12"
```

---

## Step 4 — Commit + tag + push

```bash
git add package.json
git commit -m "$(cat <<'EOF'
chore(release): v0.X.Y

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
git tag v0.X.Y
git push origin main --tags
```

**Tag format:** `v0.X.Y` (matches `release-legacy.yml` trigger `v*`, excludes `app-v*`).

---

## Step 5 — Monitor workflows

Two workflows trigger on the tag push:

```bash
gh run list --limit 5
```

| Workflow | File | Runtime | What it does |
|---|---|---|---|
| CI | `ci.yml` | ~3 min | ESM/CJS + lint + tests + build assertion |
| Release | `release-legacy.yml` | ~12–15 min | mac universal dmg/zip + windows nsis → GitHub Release |

Wait for **both** to show `completed success`.

---

## Step 6 — Verify GitHub Release assets

```bash
gh release view v0.X.Y
```

Expected asset list:
- `The.Boosters-0.X.Y-mac.zip` (universal mac, for quarantine-bypass)
- `The.Boosters-0.X.Y.dmg` (mac installer, arm64 + x64 universal)
- `The-Boosters-Setup-0.X.Y.exe` (windows nsis installer)
- `latest-mac.yml`, `latest.yml` (electron-updater manifests)

If assets are missing: check the Release workflow logs.
```bash
gh run view <run-id> --log-failed
```

---

## Step 7 — Windows smoke test (recommended after renderer changes)

The Windows smoke test installs the real NSIS installer and asserts the main UI
renders. Trigger manually:
```bash
gh workflow run win-smoke.yml -f tag=v0.X.Y
gh run watch
```

This takes ~10 min. Required if any of these changed:
- `browser/` JS or Stylus files
- `vite.renderer.config.mjs`
- Electron main process (`lib/`, `index.js`)

---

## Step 8 — Update release notes (optional)

```bash
gh release edit v0.X.Y --notes "$(cat <<'EOF'
## What's new

- <user-facing description>

## Install

**macOS**: Download `The.Boosters-0.X.Y.dmg`. First launch: right-click → Open (unsigned build).
**Windows**: Download `The-Boosters-Setup-0.X.Y.exe`. SmartScreen → More info → Run anyway.
EOF
)"
```

---

## Version history (recent)

| Version | Key change |
|---|---|
| 0.16.11 | ESM/CJS mismatch fix (setLanguage crash) + CI detection script |
| 0.16.10 | First successful Mac+Windows Vite release (5 Windows path fixes) |
| 0.16.9  | Vite renderer replace webpack; AI inline writing assist |
