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
- A separate database leaves old CAS JSON data untouched. Its root-path name remains `gaculator-firebird`; project paths have separate namespaces. Web Locks prevent concurrent writers. Automatic saves require changed input, at least 2 seconds idle and at least 30 seconds since the previous automatic save; held touch contact defers them. Hiding immediately flushes unsaved changes, reusing an existing completed save when nothing changed. Success is reported only after the transaction commits. Input arriving during a save stays dirty and is committed before a hidden-page pause.
- States bind to the exact core/device identity. Incompatible states are retained and rejected instead of silently overwritten. The main UI keeps LCD/keypad without the former toolbar. The corner “⋯” and settings dialog are removed at the user’s request; ON holds provide native reload confirmation; initial loading shows cache/startup status. Transactional autosave remains; visible backup export/import and cross-core migration are unavailable. Existing databases were not deleted.
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

The certificate must cover the actual URL and be trusted by the phone. Use `GACULATOR_LAN_ADDRESS` to correct a multi-interface address. Android uses browser installation; iOS Safari uses Share → Add to Home Screen. Initial precaching finishes before the Worker starts, avoiding concurrent duplicate downloads of the roughly 20 MB device package. Later launches use local caches but still verify, decompress and initialize the emulator. Cache failure/timeouts are reported; online startup may continue without claiming offline readiness. Keep the first startup/install online, then perform the disconnected cold-start acceptance below.

Ordinary LAN HTTP lacks the required secure context for Service Workers/Web Locks. A QR code neither installs a certificate nor silently installs the PWA. Without a trusted domain certificate, the user must complete certificate trust on the phone. No public tunnel, firmware upload or system trust changes were performed.

Acceptance requires the computer off, phone disconnected, app fully closed and cold-started from its installed icon, followed by new CAS calculation, save/reopen, and graph/document checks. Running an OS does not prove every OS workflow passed.

## Checks and limitations

JS/Python regression tests, production build, release verification and local project-subpath delivery checks pass. Earlier actual WASM boot/math/snapshot checks remain evidence for the unchanged binary. `npm run test:touchpad` exercises the same GUI-gesture/Worker-input modules against the real TI graph page and verifies its framebuffer cursor moved right and contact released. Original NAND/WASM and saved-state identity are unchanged. This pass uses isolated ports 4193/4194 and checks 402×874, 390×664, 320×568, 874×402 and desktop viewports for page overflow. Reload after stopping the local server still reports offline assets ready and loads the emulator. These are desktop-browser checks, not real-phone acceptance. Actual deployment status belongs to the corresponding GitHub Actions run; iPhone visual/haptic/disconnected cold-start acceptance remains unverified. Reports are under `temp/qa/firebird/` and `temp/qa/delivery-check.json`.

## Cache, phone layout and uninstall cleanup

- Portrait phones use the dynamic viewport (`100dvh`) and safe-area insets to allocate LCD/full keypad height. Keyboard vertical dimensions follow the available space; page overflow and scroll bounce are disabled. Landscape keeps LCD/keypad side by side; at heights up to 600 CSS pixels, margins, gap and LCD padding shrink to 6 pixels while measured safe areas remain. The canvas itself keeps a 4:3 aspect ratio, centers on both axes and uses the largest size allowed by both container dimensions without cropping the framebuffer. Safari browser chrome remains system-controlled; Home Screen standalone mode has more usable space.
- After caching, subsequent launches at the same URL do not redownload device images. Existing snapshots use the same restore path. Decompression, roughly 331 MB of WASM initialization and TI system execution still take time; instant startup is not promised. Browser eviction requires recaching online. Updates retain IndexedDB saves.
- The ON reload cleanup requires explicit confirmation of permanent deletion. It stops the Worker/autosave, waits for pending storage writes, closes the database, and holds the project session lock while unregistering the exact-scope Service Worker, waiting out any active cache installation, and deleting all project cache versions and the current Firebird database. Failures are reported and can be retried. Other projects and the former independent CAS data remain untouched.
- A page cannot reliably observe uninstall. Removing a Home Screen icon does not establish zero browser residue; see the [W3C Manifest discussion](https://lists.w3.org/Archives/Public/public-webapps-github/2026Jul/0522.html). There is no separate in-app cleanup menu. For complete uninstall cleanup, remove the icon and clear the site in system website-data settings. Safari may have a separate copy: Settings → Apps → Safari → Advanced → Website Data; remove the site. System clearing can affect other projects on the same domain; see [Apple's instructions](https://support.apple.com/en-us/105082). App cleanup does not claim to erase system HTTP caches, browsing history or separate storage containers; use system website-data removal for all site residue.

## Installed iOS sizing and duplicate input

The screenshot’s bottom gap is consistent with [WebKit 313800](https://bugs.webkit.org/show_bug.cgi?id=313800), reporting screen height 874, viewport 812 and top safe inset 62; a screenshot alone does not prove actual API values. viewport.js corrects root height from the measured screen only for iOS navigator.standalone at normal zoom, full screen width, and a deficit equal to the measured top inset. Browser tabs, normal standalone geometry, split windows and rotations retain native viewport behavior. Safe-area padding remains. An OS compositor-owned gutter may still be clipped and cannot be promised away by CSS; actual-device validation is required.

Installed-mode keyboard flicker also involves a sizing feedback loop: after correction WebKit can alternate between reduced/full reported heights. The correction now stays stable for the same screen geometry and writes style only when its value changes; split windows, real size changes and rotation trigger reassessment. Regression tests alternate 812↔874 without repeatedly writing root height.

Duplicate letters came from pointerdown submitting input, then a zero-detail Safari click being mistaken for an assistive activation. Per-gesture consumption lets default activation consume an already handled pointer, without treating zero detail as sufficient evidence of assistive activation or using a time debounce that drops fast taps. Keyboard and pointer-free assistive activations remain. DEL and other keys use fixed visible boundaries. Restored Safari haptic controls are one pixel, clipped and excluded from pointer hit testing; the visible label forwards browser-default activation. Press feedback does not move hit regions. Pointer capture and measured-boundary checks prevent drag releases or expanded browser hit regions from activating the book key below.

## Responsiveness and keyboard appearance

The core already uses C/C++ → WebAssembly. This change retains ARM/Thumb semantics, the WASM binary and save identity. Previously every Worker batch ran for at most 8 ms then slept a fixed 16 ms. Scheduling now compares the 100 Hz guest clock with elapsed wall time: yield and continue when behind, wait only when ahead. Resume resets the pacing origin rather than replaying hidden time. Idle LCD checks run at 30 FPS; for 150 ms after input, each CPU batch prioritizes checking changed pixels. Input cancels the previous wait and wakes the Worker immediately. A 32-bit pixel comparison suppresses identical frames, with at most one frame awaiting main-thread acknowledgement.

Pointerdown submits input immediately, retaining keyboard and assistive-technology activation. Physical press colors follow the pointer: matching release, cancellation, leaving the key or lost capture clears them immediately, without a 90 ms feedback timer or 70 ms CSS color transition. Safari does not rely on potentially stale :active state. The 90 ms pulse remains only for keyboard/assistive activation. Keys hold for four guest ticks with a two-tick release gap (40/20 ms virtual time), replacing 100/40 ms. Modifiers lead the primary key by four ticks, fixing missed Shift/Ctrl chords from simultaneous presses. `npm run test:keyboard` compares conservative/faster timing against the same real NAND/snapshot, including 28 repeated/different digits and integral/derivative templates; only a vertical blinking caret may differ. Shift+plus opens integral, Shift+minus derivative. Above plus/minus, only cyan ∫ / d/dx labels remain with a shared regular weight, without arrows. Desktop Shift+numpad add/subtract and Shift+minus preserve the modifier; ordinary typed `+` still means addition.

`npm run test:performance` measures real Worker scheduling with the same WASM/restored snapshot and Node nested timers clamped to at least 4 ms. This computer's baseline was about 0.592× guest real time and 4201 ms to drain 16 keys; optimized results were about 1.005× and 1016 ms. The roughly 4.1× improvement describes **queue drain time**, not every calculation or an iPhone benchmark. WASM stepping consumed 440/455 ms during the two roughly six-second runs; the main differences are scheduling and pulse duration. Reports are in `temp/qa/performance/`; the baseline is a temporary copy of the previous Worker. User snapshots are not distributed.

The user rejected the previous restyle based on [TI's official CX CAS product photo](https://education.ti.com/en/products/calculators/graphing-calculators/ti-nspire-cx-cas?category=accessories). This pass restores the preceding flat colors, dark purple keys and cyan legends, retaining viewport/safe-area fitting, touchpad behavior and calculus hints. Only visual styling rolls back; validated input, caching and save fixes remain.

This pass adds `npm run test:latency`: eight digit/integral/derivative samples using the same real WASM/restored state measure Worker input arrival to the first changed math-glyph frame, excluding vertical caret blinking. A paired desktop sample measured median 79.70 → 53.42 ms, slowest 104.18 → 82.83 ms; frame messages 50 → 13 and transmitted bytes 15,360,000 → 656,640 (about 95.7% less). This small desktop sample excludes iPhone touch dispatch, Canvas/compositor and physical refresh; it does not establish native phone latency.

Changed frames transfer only full-width rows from the first through last changed pixel (`bytes/y/height`); the initial frame remains full 320×240. The frontend applies each patch at its original coordinates. Tests reconstruct and compare the complete framebuffer byte-for-byte, covering a single pixel, separated rows and the bottom row, without predicting glyphs. JS/Python regression checks pass; actual-core keyboard/calculus/touchpad checks retain the same binary.

The latency tool now covers 14 scenarios, including x², power, exponential, trigonometry and catalog functions after entering 2, and reports queue, core execution and painting separately. Desktop samples measured x² first-glyph response around 41–55 ms and catalog around 268–317 ms, with substantial firmware work in the latter; no long x² core stall was reproduced. Synchronous snapshot compression separately blocked the Worker for about 1.4–2.2 seconds, reproducing an intermittent stall. Automatic saves now require changed input and idle time, skipping redundant compression with no new changes. Input arriving during compression remains dirty; hiding waits and commits the latest generation. Lingering press feedback is cleared synchronously on actual release. A synchronous snapshot already underway cannot be preempted and can still cause a brief stall; WASM and save identity remain unchanged. These samples exclude iPhone touch, browser composition and physical refresh, and do not guarantee instant completion of every function. Actual WASM also verifies scratchpad calculation→Ctrl+right→graph→Ctrl+left→calculation navigation.

## Hold ON to confirm a fresh reload

Holding ON for at least five seconds and releasing waits a 500 ms quiet interval before native window.confirm. A new pointer/key event, blur or hiding cancels the pending confirmation during that interval. Threshold vibration is attempted at five seconds; confirmation waits for release so the same gesture or held Enter cannot accidentally accept it. Message text follows navigator.languages[0], falling back to navigator.language: Chinese locales use Chinese, others English, with no bilingual concatenation. Native button labels follow the browser/system language. It explicitly warns of permanent local save/cache deletion, about 20 MB of downloads, and no personal-save cloud backup. A short release sends one ordinary ON tap; the long hold never sends ON/power-off first. Moving out, cancellation, another pointer, blur, hiding or unmounting cancels the hold. Focusing ON and holding Enter/Space provides the keyboard equivalent.

Cancel changes nothing. Confirmation first makes uncached HEAD availability checks for project HTML, the offline script and NAND, bypassing the GET-only offline handler. Failed checks retain emulation/data and ask the user to reconnect. Success holds the session lock while stopping autosave/Worker, awaiting pending saves, closing the database and reusing project-scoped cleanup, then navigates to project index.html with a one-time query. A still-controlling old Worker falls through to network HTML on a cache miss. New installation uses cache: reload, and offline-script updates bypass HTTP caches. Other projects and the old CAS database remain untouched.

Preflight does not mean the complete package has already downloaded. A disconnection after confirmed deletion requires reconnecting/reopening; deleted personal saves cannot be recovered from the server. Normal updates still retain saves and do not require destructive reload. Automated checks cover cancellation, initial-offline retention, cleanup errors, pending writes, old-Worker navigation fallback and the five-second/cancellation/multi-pointer gesture. Actual iPhone hold behavior, redownload and disconnected cold start remain unaccepted.

## Touchpad and key feedback

Previously pointerdown/move always sent `down=true`, treating sliding as holding a click, and relied on `event.buttons` for touch movement. `touchpad.js` now separates contact and down: slides do not click; movement within six CSS pixels produces a tap. Pointer Capture retains out-of-pad release; cancel/blur/hiding release contact. Settled taps send actual direction/select keys by pad region and retain Ctrl/Shift state. In scratchpad, Ctrl+right moves calculation to graph and Ctrl+left returns to calculation, following the firmware’s forward/back page navigation. Slides still send real touchpad movement. The Worker paces/coalesces movement on guest ticks to avoid overflowing int8 relative registers and releases after delivering the final point. Saves wait for gestures to finish.

On devices supporting Vibration API, entry/operator/control/confirm regions use 4 ms, 8 ms, 12 ms and a double pulse. Center/select and direction taps also request control feedback. These are timing differences, not physical motor intensity. Press colors remain while interaction boundaries stay fixed.

At the ON hold threshold a [30, 40, 30] ms vibration is attempted before confirmation. The [W3C implementation report](https://w3c.github.io/vibration/reports/implementation.html) confirms WebKit has no Vibration API; a timer cannot generate a trusted native-switch click. Five-second vibration is therefore not promised on iPhone PWA, and no synthetic click pretends otherwise.

When native switch support is detected in Safari, ordinary keys and pad direction/center regions use fixed visible labels containing one-pixel clipped native switches with `pointer-events: none`. The full-key hidden input overlay stays removed. A user tap on the visible label is forwarded by browser-default label activation to request system tap feedback, without JavaScript `.click()`. [WebKit's announcement](https://webkit.org/blog/15443/news-from-wwdc24-webkit-in-safari-18-beta/) and [switch implementation](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/html/CheckboxInputType.cpp) describe single-tap feedback and trusted user-event requirements. ON retains its ordinary button and hold-confirmation path. Physical feedback still depends on hardware, OS version and settings and remains unaccepted on a real iPhone; five-second timer vibration is still not promised.

If iPhone-specific light/medium/heavy or continuous textures become mandatory, keep the local WASM and add a native WKWebView shell calling [UIImpactFeedbackGenerator](https://developer.apple.com/documentation/uikit/uiimpactfeedbackgenerator) or Core Haptics. That requires native signing/installation, is outside this PWA edit, and adds no dependency here.

Earlier Node v20.17.0 / Windows x64 continuous-stepping startup/restore checks took about 29–43 seconds; load and added validation steps change total time, so use the actual report. WASM memory was **331,415,552 bytes**, with an approximately 10 MB snapshot. This excludes browser timer delays and is not a phone benchmark; decompression/startup peak memory is higher.

Real phones, certificate setup, phone disconnected cold start, sustained idle wake, all CAS/graph/document/USB workflows and OS screen-reader content remain unaccepted. Canvas and hardware keys have accessible names; the emulated OS has no DOM text accessibility tree.

Firebird GPLv3 and TI OS rights are separate. Local readability and the user's upload authorization do not establish TI permission for public firmware redistribution.
