# PruneR

[<img src="https://s3.ap-south-1.amazonaws.com/shared.aashutosh.dev/PruneR.svg" align="right" width="100">](https://pruner.aashutosh.dev)

Reviewing PRs is hard. Dependabot PRs flood your list, and test file changes add noise to every review. **PruneR** helps you cut through the clutter:

- 🧹 **Hide dependabot / dependency PRs** from the PR list with one click  
- 👁️ **Auto-mark test files as "Viewed"** on PR file pages so you never have to look at `.test.ts` noise again  

Hence the name *P*rune*R*

> [!NOTE]  
> This is for very<sup>3</sup> lazy and my kinda people, who don't want to do anything manually.

---

## Features ✨

### 1. Toggle dependency PRs

Click the PruneR icon in your toolbar while you're on a GitHub PR list page
(`https://github.com/org/repo/pulls`). It adds `-label:dependencies` to the URL,
hiding all dependabot / dependency PRs in one click. Click again to show them.

While the filter is active, the icon shows a **badge with the number of open
dependency PRs currently hidden**, so you always know what's being pruned.
(The count comes from the GitHub Search API and may not appear on private
repositories.)

### 2. Auto-mark test files as viewed

When you open a PR's **Files changed** tab (`/pull/*/files`), PruneR
automatically checks the "Viewed" checkbox on:

| Pattern | Examples |
|---|---|
| `*.test.{ts,tsx,js,jsx,mjs,cjs}` | `button.test.tsx` |
| `*.spec.{ts,tsx,js,jsx,mjs,cjs}` | `utils.spec.ts` |
| `__tests__/` | `__tests__/foo.ts` |
| `test/` or `tests/` | `test/setup.ts` |
| `__mocks__/` | `__mocks__/fs.ts` |
| `__fixtures__/`, `fixtures/` | `fixtures/data.json` |
| `__snapshots__/`, `*.snap` | `__snapshots__/button.test.tsx.snap` |
| `*.stories.{ts,tsx,js,jsx}` | `button.stories.tsx` |
| `mock/`, `mocks/` | `mocks/handlers.ts` |

These files are still visible in the diff — they're just marked "Viewed"
so they collapse out of your review flow. Focus on the actual logic changes.

> **Toggle on/off:** Right-click the PruneR icon in your toolbar and select
> "Auto-mark test files as viewed" to enable or disable this feature.
> A checkmark ✓ means it's active.
>
> Prefer a UI? Open **PruneR Options** — right-click the toolbar icon and pick
> "PruneR Options", or find it under `chrome://extensions/` → PruneR → Details →
> Extension options.

---

## Installation

[link-chrome]: https://chrome.google.com/webstore/detail/pruner/dmnfcgnmillpemklpladliejgigipcen 'Version published on Chrome Web Store'

[<img src="https://raw.githubusercontent.com/alrra/browser-logos/90fdf03c/src/chrome/chrome.svg" width="48" alt="Chrome" valign="middle">][link-chrome] [<img valign="middle" src="https://img.shields.io/chrome-web-store/v/dmnfcgnmillpemklpladliejgigipcen.svg?label=%20">][link-chrome] and other Chromium browsers

### Install from the latest release 📦

Prefer to run it locally, or want a version before it clears Web Store review?

[link-release]: https://github.com/aashutoshrathi/PruneR/releases/latest 'Latest release'

[<img valign="middle" src="https://img.shields.io/github/v/release/aashutoshrathi/PruneR?label=Download%20latest%20ZIP&style=for-the-badge&logo=github">][link-release]

1. Download the `.zip` from the [latest release][link-release]
2. Unzip it somewhere you'll keep it — Chrome loads the extension from this folder every time it starts
3. Open Chrome and navigate to `chrome://extensions/`
4. Enable **"Developer mode"** (toggle in the top-right corner)
5. Click **"Load unpacked"** and select the unzipped folder
6. The PruneR icon should now show up in your toolbar

---

## Demo 🎥

[![Walkthrough of PruneR](https://img.youtube.com/vi/R--YNMb8tNE/0.jpg)](https://www.youtube.com/watch?v=R--YNMb8tNE "PruneR Demo")

---

## Development

```sh
git clone https://github.com/aashutoshrathi/PruneR.git
cd PruneR
```

Then load the folder as an unpacked extension in Chrome:
1. Go to `chrome://extensions/` & enable **Developer Mode**
2. Click **"Load unpacked"** and select the cloned folder

---

## Publishing

A new release triggers a [GitHub Actions workflow](.github/workflows/publish.yml) that:

1. Checks the manifest version matches the release tag
2. Builds the ZIP package
3. Publishes to the Chrome Web Store (signed with the Verified CRX key)
4. Attaches the ZIP to the release

To publish a new version:
1. Bump `version` in `manifest.json`
2. Commit: `git commit -m ":arrow_up: bump: vX.Y.Z"`
3. Tag: `git tag vX.Y.Z`
4. Push: `git push && git push --tags`
5. Create a release from the tag on GitHub — the workflow handles the rest

---

## License

MIT © [Aashutosh Rathi](https://aashutosh.dev)