# GitHub Pages deployment

[中文](github-pages.md)

## Local web preview

Run `npm start`, then open `http://localhost:4173/` on the computer. No certificate is needed. This builds and serves the app; use `npm run serve` if already built. Ordinary phone LAN HTTP still lacks the secure context this app requires.

## Prepare the release

Run `npm run pages:package`. It creates `temp/gaculator-github-pages.zip` and `temp/github-pages/<version>/`. This machine reuses its compiled WASM; see [the architecture guide](firebird-pwa.en.md) for rebuilding elsewhere.

The ZIP root contains:

- `site/`: runtime resources, complete compressed NAND/Boot1, GPL notices, corresponding rebuildable source and offline worker.
- `.github/workflows/pages.yml`: the official GitHub Pages Actions deployment flow.
- `.github/scripts/check-pages.py` and `release.json`: exact file-list, size and SHA-256 checks before deployment.
- `README.md`: bilingual upload instructions.

Only allowlisted production resources enter the package. Certificates, private keys, original Snapshot, browser saves, legacy project and other temporary files are excluded. The package includes the complete local NAND, which may contain documents. On 2026-11-14 the user explicitly authorized its public upload to `m0no3van/gaculator`. The packaging command itself never uploads or publishes. Firebird GPLv3 does not grant TI firmware redistribution rights.

## Upload later

1. Extract the ZIP and upload **all extracted contents**, including `.github`, to a repository's `main` branch. Do not upload the ZIP itself or the development workspace.
2. Select **Settings → Pages → Build and deployment → Source → GitHub Actions**.
3. Run **Actions → Deploy prepared Pages site → Run workflow** once. Subsequent pushes changing `site/` or `release.json` on `main` deploy automatically; source-only pushes do not trigger deployment.
4. Open the HTTPS URL shown by the `github-pages` deployment. Users need no CA/profile/certificate installation. On iPhone Safari, use Share → Add to Home Screen.

GitHub only verifies and deploys `site/`: no Windows input paths, Emscripten installation or remote emulation. Relative URLs support both root sites and `https://<user>.github.io/<repo>/` without a hardcoded repository name. See [GitHub's workflow guide](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) and [HTTPS documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https).

For updates, replace `site/`, `release.json` and `.github/` with the new package, removing obsolete site files. Modified or extra files fail verification. Keep the same site URL to retain its browser saves. Caches, databases and writer locks are isolated by project path; the root keeps its original local database name. Domain/path changes and moving from localhost to Pages do not migrate saves automatically. Incompatible core/device identities retain and reject existing states.

## Acceptance boundary

Local checks cover package completeness, exclusion of private files, tampered/extra-file rejection, and project cache/save isolation. The release is checked over a locally served project subpath. Actual GitHub Actions, production HTTPS, real iPhones and disconnected icon cold start remain unverified; complete [phone offline acceptance](firebird-pwa.en.md) after deployment.
