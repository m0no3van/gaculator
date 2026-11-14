# Gaculator — Firebird PWA

[中文](AGENTS.md)

On 2026-11-14 the user explicitly switched to a Firebird port bundling the local device for LAN QR installation, then specifically confirmed deleting the 103 entries in `temp/firebird-cleanup-plan.json`. The independent CAS is discontinued. The user subsequently explicitly confirmed uploading the complete NAND runtime publicly, authorizing a push of source and runtime to the public `m0no3van/gaculator` repository.

Read [README](README.md) and [current architecture/acceptance](docs/firebird-pwa.en.md). Establish state from current files and real checks.

- Sole entry: `src/firebird/main.js`. Vue handles UI; a device-local Worker executes the real ARM/Thumb/peripheral core. Do not reintroduce an independent CAS, MathLive or DOM rasterization.
- Firebird is pinned to `ccd0d1dfa1cf87133e2dea44c482d648d99a789b`. Retain GPLv3, modification notes and rebuildable corresponding source; do not claim an original emulator core.
- The device is **CX CAS 4.5.2.8**, not CX II / 6.4. Original NAND/Boot1/Snapshot stay read-only; native Snapshot is excluded. Paths/digests are documented.
- Full NAND bundling is requested and may include documents; the user explicitly authorized public upload to `m0no3van/gaculator`. This excludes certificate private keys, the original Snapshot and browser saves. Corresponding-source archives still exclude firmware, snapshots and private keys.
- Desktop LCD left/keypad right; phone LCD above/full keypad below; no Swipe here. Use the real 320×240 framebuffer and verified physical matrix. Key durations use virtual time.
- Foreground idle must not require manual ON. The current adapter requests a power interrupt after backlight-off. Save/pause hidden pages; test resume and sustained idle separately.
- Report saves only after IndexedDB commits; failures retain previous saves. Updates never erase user databases. CPU/storage failures must be visible. Leave the old calculator browser database intact.
- LAN HTTP does not establish phone installation/offline. Verify trusted HTTPS, full cache, computer-off disconnected phone cold-start from the installed icon. Never ship certificate private keys.
- Maintain paired Chinese/English docs and English code identifiers. Derived/temporary work lives under ignored `temp/`. No plugin architecture or remote calculation is needed.
- Inspect callers before changes. Add meaningful tests for nontrivial logic/fixes. Use existing commands: `npm test`, `npm run test:wasm`, `npm run build`, `npm run check:docs`, `npm run check:delivery`. Old CAS/analyzer checks were removed.

Report changes/checks/limits. Real-phone acceptance remains unverified; approximately 331 MB WASM memory may exceed phone limits. Backup import and cross-core snapshot migration are not implemented.
