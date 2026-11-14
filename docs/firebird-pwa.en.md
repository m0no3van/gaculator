# Firebird PWA: current direction

[中文](firebird-pwa.md) · 2026-11-14, Europe/London.

## Changed requirements

The user explicitly replaced the independent CAS with a Firebird port bundling the local device, followed by permission for substantial cleanup. Earlier prohibitions against executing/bundling Firebird/TI OS and using OS display assets are superseded. Local offline execution, protection of original files, one shared phone/desktop core and honest acceptance limits remain.

## Implementation

The GPLv3 core in `third_party/firebird/core/` is pinned to `ccd0d1dfa1cf87133e2dea44c482d648d99a789b`. `tools/firebird/bridge.cpp` exposes the real ARM/Thumb interpreter, NAND/peripherals, LCD, keypad and snapshots. Qt, native JIT and GIF recording are not used. Emscripten **3.1.74** builds with 32 MiB initial / 512 MiB maximum growing WASM memory.

Vue 3.5.44 renders the frontend; the real 320×240 RGB565 framebuffer becomes RGBA Canvas. `src/firebird/worker.js` runs the OS entirely on-device, with bounded stepping and 100 Hz virtual ticks. There is no native-emulator stream, runtime CDN or server calculation. Vite 6.4.5 and qrcode 1.5.4 build/distribute it.

The old upstream Emscripten Makefile is not used unchanged: it lacks the current C++ keypad/CX II sources. Changes to the core include an abort on Emscripten fatal exit instead of undefined return with disabled asserts, missing OS headers, closing the large MEMFS NAND input after mapping, and correcting a successful return on failed `flash_suspend` writes. Corresponding modified source/build scripts accompany the WASM as `source.zip`.

Foreground backlight-off detection requests a power wake interrupt without synthesizing Home; hidden pages save/pause the Worker. Sustained idle wake behavior still needs browser acceptance, beyond inspecting code.

## Device and state

- The local **CX CAS 4.5.2.8** Boot1 is 524,288 bytes and NAND 138,412,032 bytes. Native `Snapshot` is excluded; the first launch boots normally. This is not CX II / 6.4.
- NAND SHA-256 is pinned to `43a00d93c97a06969bfcdefca1d7a0356256286c1cbc5e7109a9b0d7a126dc1e`; post-test verification is unchanged. Inputs are read-only.
- Both compressed inputs total **19,726,938 bytes**. `device.json` records sizes, digests and WASM identity. The Worker verifies downloads and decompresses them locally.
- Runtime NAND writes stay in private memory; IndexedDB snapshots include RAM, peripherals and NAND deltas. The package includes the full base NAND, which may contain existing/deleted document data. The user explicitly authorized its public upload under `site/` in `m0no3van/gaculator`; corresponding-source ZIPs exclude firmware.
- A separate database leaves old CAS JSON data untouched. Its root-path name remains `gaculator-firebird`; project paths have separate namespaces. Web Locks prevent concurrent writers. Saves are attempted every 30 seconds/on hide and reported successful only after their transaction commits. Queued saves do not discard later queued input.
- States bind to the exact core/device identity. Incompatible states are retained and rejected instead of silently overwritten. At the user's request the normal UI now contains only LCD/keypad: toolbars, explanations and version/status text are gone. Transactional autosave remains; visible backup export/import and cross-core migration are unavailable. Existing databases were not deleted.
- Forced browser termination, quota eviction or clearing site data can still lose recent unsaved input.

## Build and local preview

Run `npm ci`, `npm run build:firebird -- --emcc <Emscripten-3.1.74>/emcc.py`, `npm run build`, then `npm run serve`. Reuse the compiled core for subsequent app builds. `EMCC` can identify emcc.py; `GACULATOR_DEVICE_DIR` selects the directory holding the same named inputs, defaulting to `D:/01-Software/VirtualMachines/Calculator`.

Tools/cache/derived outputs live in `temp/`. Build prepares only allowlisted resources under `temp/firebird-public/`, excluding old Pyodide/MathLive/fonts. Production is `temp/firebird-dist/`. The server defaults to **127.0.0.1:4173**, overridable with `PORT`; browser QA uses a separate origin on port 4186 to avoid old caches/documents.

For local preview, use `npm start` and open `http://localhost:4173/` on the computer without installing certificates. `npm run pages:package` prepares the static ZIP and deployment workflow locally; see [Pages deployment](github-pages.en.md).

## Phone QR/install

The user plans **GitHub Pages** for future production distribution. `github.io` sites provide browser-trusted HTTPS automatically, removing the need for the local CA/profile or a continuously running computer. QR codes will encode the production HTTPS URL; computation remains device-local after complete caching. [GitHub HTTPS documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https)

The relative Vite base, Manifest, Worker resources and Service Worker support root sites and project paths such as `https://<user>.github.io/<repo>/`. Caches, databases and writer locks are isolated by project path, retaining the existing root database and other project/old CAS data. Changing URLs does not migrate saves.

`npm run pages:package` prepares `temp/gaculator-github-pages.zip` from allowlisted production assets, containing `site/`, the workflow, SHA-256 inventory and verifier. GitHub needs no Windows device path or compiler. The user explicitly authorized pushing source and the complete NAND runtime to the public `m0no3van/gaculator` repository, excluding private keys, original Snapshot and browser saves. GitHub Actions determines deployment status. See [Pages deployment](github-pages.en.md). The certificate flow below is optional LAN testing, separate from production Pages delivery.

The user explicitly authorized delivery on the current trusted LAN. `npm run lan` uses installed OpenSSL to generate a CA/server certificate under `temp/firebird-certs/`, serves setup/public CA/Apple profile on HTTP 4187 and the application on HTTPS 8443, and writes `temp/qa/firebird/install-qr.png`. Set `GACULATOR_LAN_ADDRESS` for a different phone-reachable IPv4. The chain/IP are self-checked; private keys have no HTTP route and never enter source archives. System trust on the phone/computer remains a manual user action.

Alternatively, with an existing phone-trusted LAN certificate, set:

```powershell
$env:GACULATOR_HOST = '0.0.0.0'
$env:GACULATOR_CERT = 'D:/path/to/trusted-lan-cert.pem'
$env:GACULATOR_KEY = 'D:/path/to/trusted-lan-key.pem'
npm run serve
```

The certificate must cover the actual URL and be trusted by the phone. Use `GACULATOR_LAN_ADDRESS` to correct a multi-interface address. Android uses browser installation; iOS Safari uses Share → Add to Home Screen. Complete background caching still runs, with status available to assistive technology but no visible status text. Keep the first startup/install online, then perform the disconnected cold-start acceptance below.

Ordinary LAN HTTP lacks the required secure context for Service Workers/Web Locks. A QR code neither installs a certificate nor silently installs the PWA. Without a trusted domain certificate, the user must complete certificate trust on the phone. No public tunnel, firmware upload or system trust changes were performed.

Acceptance requires the computer off, phone disconnected, app fully closed and cold-started from its installed icon, followed by new CAS calculation, save/reopen, and graph/document checks. Running an OS does not prove every OS workflow passed.

## Checks and limitations

Fifteen JS tests, four Python tests, production build, release verification and local project-subpath delivery checks pass. Earlier actual WASM boot/math/snapshot checks remain evidence for the unchanged binary. `npm run test:touchpad` exercises the same GUI-gesture/Worker-input modules against the real TI graph page and verifies its framebuffer cursor moved right and contact released. Original NAND/WASM and saved-state identity are unchanged. Windows browser validation was stopped because Computer Use could not establish the current URL confidently; that restriction was not bypassed. Actual GitHub Actions, production URLs and iPhone visual/haptic/disconnected cold-start acceptance remain unverified. Reports are under `temp/qa/firebird/` and `temp/qa/delivery-check.json`.

## Touchpad and key feedback

Previously pointerdown/move always sent `down=true`, treating sliding as holding a click, and relied on `event.buttons` for touch movement. `touchpad.js` now separates contact and down: slides do not click; movement within six CSS pixels produces a tap. Pointer Capture retains out-of-pad release; cancel/blur/hiding release contact. The Worker paces/coalesces movement on guest ticks to avoid overflowing int8 relative registers and releases after delivering the final point. Saves wait for gestures to finish.

On devices supporting Vibration API, entry/operator/control/confirm regions use 4 ms, 8 ms, 12 ms and a double pulse. These are timing differences, not physical motor intensity. Distinct press animations honor reduced-motion settings.

Feature-detected Safari uses a directly user-tapped native `<input type="checkbox" switch>`, never a synthetic JavaScript click. [WebKit's announcement](https://webkit.org/blog/15443/news-from-wwdc24-webkit-in-safari-18-beta/) describes a single system tap, and [its implementation](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/html/CheckboxInputType.cpp) requires trusted events/user gestures. This is not a programmable haptic API or a guarantee for every device/version/setting. Different Safari-region vibration strengths/rhythms cannot be promised; dragging the pad does not simulate repeated switch clicks.

If iPhone-specific light/medium/heavy or continuous textures become mandatory, keep the local WASM and add a native WKWebView shell calling [UIImpactFeedbackGenerator](https://developer.apple.com/documentation/uikit/uiimpactfeedbackgenerator) or Core Haptics. That requires native signing/installation, is outside this PWA edit, and adds no dependency here.

Earlier Node v20.17.0 / Windows x64 continuous-stepping startup/restore checks took about 29–43 seconds; load and added validation steps change total time, so use the actual report. WASM memory was **331,415,552 bytes**, with an approximately 10 MB snapshot. This excludes browser timer delays and is not a phone benchmark; decompression/startup peak memory is higher.

Real phones, certificate setup, phone disconnected cold start, sustained idle wake, all CAS/graph/document/USB workflows and OS screen-reader content remain unaccepted. Canvas and hardware keys have accessible names; the emulated OS has no DOM text accessibility tree.

Firebird GPLv3 and TI OS rights are separate. Local readability and the user's upload authorization do not establish TI permission for public firmware redistribution.
