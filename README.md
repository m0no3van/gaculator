# Gaculator

**在浏览器中本机运行的 TI-Nspire CX CAS 模拟器 · A TI-Nspire CX CAS emulator running locally in your browser**

[打开应用 / Open app](https://m0no3van.github.io/gaculator/) · [中文](#中文) · [English](#english)

## 中文

Gaculator 将 [Firebird](https://github.com/nspire-emus/firebird) 模拟核心编译为 WebAssembly，在设备的 Web Worker 中运行 **TI-Nspire CX CAS 4.5.2.8**。屏幕、计算、图形和系统菜单由真实 TI OS 输出；计算在当前设备完成，无需连接远程计算服务器。

### 使用与安装

打开 [网页版](https://m0no3van.github.io/gaculator/)，首次保持联网，等待资源缓存完成和系统启动。完整离线资源准备好后，可在本机继续运行。

- **iPhone / iPad：** 使用 Safari 打开，选择“分享 → 添加到主屏幕”。
- **Android / 桌面：** 使用浏览器提供的安装应用或添加快捷方式功能。
- **更新：** 每次启动检查新版，完整下载后切换；普通更新保留本机存档，离线时继续使用已缓存版本。

GitHub Pages 提供 HTTPS，无需安装证书描述文件。真机安装、手机断网且电脑关闭后从图标冷启动，仍需设备实测；本项目尚未完成 iPhone 的这些验收。

### 功能与操作

- **真实模拟核心：** Firebird ARM/Thumb 与外设模拟，320×240 framebuffer，OS 自带 CAS、图形和文档功能。
- **完整键盘：** 支持触摸与硬件键盘；桌面左屏幕、右键盘，手机竖屏上屏幕、下键盘。
- **触控板：** 滑动移动原生光标，方向键与中央确认区支持轻点；Ctrl＋右/左可在便签板计算与图形页间切换。
- **常用组合：** Shift＋加号打开积分模板，Shift＋减号打开求导模板。
- **本机存档：** 有输入改动且空闲后自动保存，切后台先补存再暂停。存档位于浏览器 IndexedDB，不会上传云端。

**长按 ON 至少五秒后松开**会询问是否清空本项目数据并重新下载。确认会永久删除当前本机存档和缓存；这不是普通更新所需的操作，取消则保留数据。

### 本地运行

仓库中的 `site/` 是准备好的静态发布包，无需编译即可在电脑本机试用：

```powershell
git clone https://github.com/m0no3van/gaculator.git
cd gaculator
python -m http.server 4173 --bind 127.0.0.1 --directory site
```

打开 `http://localhost:4173/`。普通手机局域网 HTTP 不满足离线 PWA 所需的安全环境；手机安装优先使用上面的 HTTPS 网页。

### 开发与构建

需要 Node.js 20+、Python 3，以及用于重建核心的 Emscripten 3.1.74。准备包含 `Boot1cx.img` 和 `TI-NspireCXCAS-4.5.2.8.bin` 的镜像目录；当前打包脚本固定校验对应 CX CAS 4.5.2.8 镜像。

```powershell
npm ci
$env:GACULATOR_DEVICE_DIR = 'D:\path\to\calculator'
npm run build:firebird -- --emcc 'C:\path\to\emscripten\emcc.py'
npm start
```

已有编译核心时，可将 `site/vendor/firebird/` 的内容复制到 `public/vendor/firebird/`，跳过 `build:firebird`。`npm start` 先构建，再提供本机预览；产物在 `temp/firebird-dist/`。`npm run pages:package` 生成包含完整缓存清单的 Pages 发布包，步骤见[发布说明](docs/github-pages.md)。

| 路径 | 职责 |
| --- | --- |
| `src/firebird/` | Vue 界面、输入、Worker 调度与存档 |
| `third_party/firebird/` | 固定版本的 Firebird 核心及修改说明 |
| `tools/firebird/bridge.cpp` | WASM 核心接口 |
| `tools/`、`tests/firebird/` | 构建、发布核验与回归测试 |
| `site/`、`release.json` | GitHub Pages 静态资源与校验清单 |

### 验证与已知限制

```powershell
npm test
npm run test:wasm
npm run test:keyboard
npm run test:touchpad
npm run test:performance
npm run test:latency
npm run check:docs
npm run build
npm run serve
# 在另一个终端执行：
npm run check:delivery -- http://127.0.0.1:4173/
```

已验证真实核心启动、运算输入、快照恢复、键盘组合、图形触控与本地静态分发。三轮桌面配对测试、每版 42 个样本中，最近一轮优化将 Worker 输入到数学变化帧的中位数从 **49.21 ms 降到 41.21 ms**，约降低 **16.3%**；这不包含触摸事件、Canvas 合成和物理屏幕刷新，也不意味着所有功能都更快。

- WASM 内存约 **331 MB**，初始化峰值更高；桌面表现不能直接推算为手机表现。
- 同步快照压缩仍可能阻塞 Worker 约 **1.4–2.1 秒**。
- 尚未完成真实 iPhone 的视觉、震感、离线冷启动与长时间闲置恢复验收；浏览器触觉能力因平台而异。
- 未提供备份导入或跨核心版本快照迁移；清除网站数据或浏览器回收存储可能丢失本机存档。
- 当前对象为 **CX CAS 4.5.2.8**；CX II / 6.4、全部数学/文档/USB 功能及 OS 内部屏幕阅读器支持未验收。

详细实现与证据见[当前架构与验收](docs/firebird-pwa.md)。

### 来源、许可与镜像

模拟核心来自 Firebird，固定提交 `ccd0d1dfa1cf87133e2dea44c482d648d99a789b`，遵循 [GPLv3](LICENSE)。运行包附带许可、修改说明和可重建源码 `source.zip`；这不是原创模拟核心。

本仓库的完整运行包包含压缩 NAND 与 Boot1，可能包含镜像中原有的文档。TI OS、固件和镜像的权利与 Firebird 的 GPLv3 分开，GPLv3 不授予 TI 镜像再分发权。原始 Snapshot、浏览器存档、证书私钥与其他本机临时数据不属于发布包。

## English

Gaculator compiles the [Firebird](https://github.com/nspire-emus/firebird) emulator core to WebAssembly and runs **TI-Nspire CX CAS 4.5.2.8** in a device-local Web Worker. The real TI OS produces the display, calculations, graphs and system menus. Computation stays on your device, without a remote calculation server.

### Use and install

Open the [web app](https://m0no3van.github.io/gaculator/). Stay online for the first resource download, cache preparation and system boot. Once the complete offline resources are ready, the app can continue running locally.

- **iPhone / iPad:** Open in Safari, then choose **Share → Add to Home Screen**.
- **Android / desktop:** Use your browser's install-app or shortcut option.
- **Updates:** Startup checks for a new version and switches after a complete download. Normal updates retain local saves; offline startup uses the cached version.

GitHub Pages supplies HTTPS without a certificate profile. Installation and disconnected icon cold startup with the computer turned off still require physical-device testing; these iPhone acceptance checks remain incomplete.

### Features and controls

- **Real emulation:** Firebird ARM/Thumb and peripheral emulation, a 320×240 framebuffer, and the OS's CAS, graphing and document features.
- **Full keypad:** Touch and hardware keyboard input. Desktop places the LCD beside the keypad; portrait phones place it above the keypad.
- **Touchpad:** Slide to move the native cursor, or tap the direction/center regions. Ctrl+right/left switches between scratchpad calculation and graph pages.
- **Useful chords:** Shift+plus opens the integral template; Shift+minus opens the derivative template.
- **Local saves:** Changed state saves automatically after input becomes idle. Hiding flushes changes before pausing. Saves stay in browser IndexedDB and are not uploaded.

**Hold ON for at least five seconds, then release** to request a fresh download and project-data reset. Confirming permanently deletes the current local save and cache. Normal updates do not require this reset; cancelling retains your data.

### Run locally

The repository's `site/` directory contains a prepared static release. Preview it on your computer without compiling:

```powershell
git clone https://github.com/m0no3van/gaculator.git
cd gaculator
python -m http.server 4173 --bind 127.0.0.1 --directory site
```

Open `http://localhost:4173/`. Plain LAN HTTP on a phone does not provide the secure environment required for the offline PWA. Use the HTTPS web app above for phone installation.

### Develop and build

Requirements: Node.js 20+, Python 3, and Emscripten 3.1.74 to rebuild the core. Prepare a device directory containing `Boot1cx.img` and `TI-NspireCXCAS-4.5.2.8.bin`. The packager validates the specific CX CAS 4.5.2.8 image used by this build.

```powershell
npm ci
$env:GACULATOR_DEVICE_DIR = 'D:\path\to\calculator'
npm run build:firebird -- --emcc 'C:\path\to\emscripten\emcc.py'
npm start
```

To reuse the compiled core, copy the contents of `site/vendor/firebird/` to `public/vendor/firebird/` and skip `build:firebird`. `npm start` builds and serves a local preview; output goes to `temp/firebird-dist/`. `npm run pages:package` creates a Pages package with a complete cache inventory. See the [deployment guide](docs/github-pages.en.md).

| Path | Purpose |
| --- | --- |
| `src/firebird/` | Vue UI, input, Worker scheduling and saves |
| `third_party/firebird/` | Pinned Firebird core and modification notes |
| `tools/firebird/bridge.cpp` | WASM core interface |
| `tools/`, `tests/firebird/` | Builds, release verification and regression tests |
| `site/`, `release.json` | GitHub Pages static assets and integrity inventory |

### Validation and limitations

```powershell
npm test
npm run test:wasm
npm run test:keyboard
npm run test:touchpad
npm run test:performance
npm run test:latency
npm run check:docs
npm run build
npm run serve
# Run in another terminal:
npm run check:delivery -- http://127.0.0.1:4173/
```

Checks cover actual-core boot, calculation input, snapshot restoration, keyboard chords, graph touch input and local static delivery. In three paired desktop runs with 42 samples per version, the latest optimization reduced median Worker-input-to-changed-math-frame latency from **49.21 ms to 41.21 ms**, about **16.3%**. This excludes touch dispatch, Canvas composition and physical display refresh, and does not establish that every function is faster.

- WASM memory is about **331 MB**, with a higher initialization peak. Desktop results do not establish phone performance.
- Synchronous snapshot compression can still block the Worker for about **1.4–2.1 seconds**.
- Real iPhone visuals, haptics, offline cold startup and sustained idle wake remain unaccepted. Browser haptic capabilities vary by platform.
- Backup import and cross-core snapshot migration are unavailable. Clearing website data or browser storage eviction can lose local saves.
- The current target is **CX CAS 4.5.2.8**. CX II / 6.4, exhaustive math/document/USB coverage and screen-reader access inside the emulated OS remain unaccepted.

See [architecture and acceptance](docs/firebird-pwa.en.md) for implementation details and evidence.

### Attribution, license and device images

The emulator core is Firebird at commit `ccd0d1dfa1cf87133e2dea44c482d648d99a789b`, under [GPLv3](LICENSE). Runtime distributions include the license, modification notes and rebuildable corresponding source in `source.zip`. This project does not claim an original emulator core.

The complete runtime in this repository contains compressed NAND and Boot1 and may include documents already present in the image. Rights to TI OS, firmware and device images are separate from Firebird's GPLv3; GPLv3 does not grant redistribution rights to TI images. Original snapshots, browser saves, certificate private keys and other local temporary data are excluded from the release.
