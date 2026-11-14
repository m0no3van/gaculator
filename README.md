# Gaculator · Firebird PWA

[中文](#中文) · [English](#english)

## 中文

路线已于 **2026-11-14** 按用户要求改为 **Firebird → WebAssembly → 本机离线 PWA**。唯一正式入口为 `src/firebird/main.js`；旧独立 CAS 不再参与构建。

本地私用构建包含 `D:/01-Software/VirtualMachines/Calculator` 中的 **CX CAS 4.5.2.8 NAND 和 Boot1**。原件只读，运行时在设备 Worker 内执行，不串流电脑画面。**不是 CX II / 6.4 移植**，原生 `Snapshot` 不打包，首次从 Boot1 开机。

```powershell
npm ci
npm run build:firebird -- --emcc <Emscripten-3.1.74目录>/emcc.py
npm run build
npm run serve
```

本机已编译好 WASM 时只需最后两条。产物在 `temp/firebird-dist/`；首次资源准备会把镜像压缩、校验并纳入完整离线清单。源码包与 GPLv3 许可随模拟核心分发。

本地试用直接运行 `npm start`，在电脑浏览器打开 `http://localhost:4173/`，无需证书；服务器默认仅监听本机。正式分发使用 GitHub Pages：`npm run pages:package` 生成带发布流程的 `temp/gaculator-github-pages.zip`，解压后按 [发布说明](docs/github-pages.md) 上传。Pages 的可信 HTTPS 无需用户安装证书描述文件；目标仓库为 [m0no3van/gaculator](https://github.com/m0no3van/gaculator)，发布状态以 Actions 为准。原 `npm run lan` 证书引导保留为可选局域网测试工具，见 [分发、架构与验收](docs/firebird-pwa.md)。

当前主界面只保留屏幕与完整键盘，右上角“⋯”及设置弹窗已移除。每次页面启动先限时检查云端版本，完整新版就绪后自动切换，获取失败或离线沿用当前缓存并保留存档；相同内容的镜像经校验后复用。首次完成离线缓存后才启动 Worker，避免重复下载镜像；后续本机加载仍需解压和初始化。手机界面按动态可视高度与安全区适配，整页不滚动；针对 iOS 安装态少报一个状态栏高度的情况增加稳定的布局补偿，避免高度反复切换引起闪烁。矮横屏收紧边距；LCD 在容器内居中，以最大可用尺寸保持 4:3。自动存档保留：有改动且输入空闲后才执行，切后台先补存改动；避免每 30 秒无条件压缩快照造成卡顿。Worker 按虚拟时钟运行；新输入立即唤醒，输入后优先发送变化画面，空闲按 30 FPS 检查且最多一帧在途；未变化的画面不重复发送。Shift + 加号为积分、Shift + 减号为求导，修饰键提前扫描已在真实 OS 验证。键盘已按用户要求回滚到前一版平面配色，保留满屏、安全区和组合键。长按 ON 满五秒后松手，经过 500 ms 保护间隔后使用系统原生确认框、按客户端语言单独显示中文或英文，先询问是否重载 PWA，确认后清空本项目本机数据、重新联网下载；普通更新保留存档。触控板区分滑动与点击；中央确认键恢复原来的显示尺寸，判定严格沿可见边缘，空白与圆角外区域不再确认；方向/中央轻点保留 Ctrl/Shift，Ctrl＋右方向键从便签板计算进入图形，Ctrl＋左方向键返回。真实 WASM 图形页已验证光标移动。测试与构建通过；原有冷启动、数学、存档恢复证据见文档。按键事件去重，避免 Safari 一次触摸输入两个字母；支持 Vibration API 的浏览器在 ON 长按完成时尝试双震提示。Safari 恢复普通按键和中央/方向键的原生轻触尝试，使用裁切为 1 像素且不参与触摸命中的开关，由固定可见标签激活；不恢复全键覆盖层。按压不移动边界，抬手立即清除颜色，避免 x²/功能键看起来仍被按住；积分/求导蓝色副标去掉箭头并统一字重。iPhone PWA 不保证五秒定时震动。iPhone 震感和真机离线冷启动尚未验收。运行内存约 331 MB。

```powershell
npm test
npm run test:wasm
npm run test:touchpad
npm run test:keyboard
npm run test:performance
npm run test:latency
npm run check:docs
npm run check:delivery -- http://127.0.0.1:4173/
```

旧依赖（SymPy/Pyodide、MathLive、KaTeX、CE）已移出 package.json。用户具体确认后，旧源码、文档、测试、资源和工具共 103 项、约 55 MB 已删除。[清理记录](docs/firebird-cleanup.md)。此前工程保留在被忽略的 `temp/legacy-before-firebird.zip`。

镜像包可能含 NAND 中原有的文档。用户已于 2026-11-14 明确允许将完整运行包公开上传至 `m0no3van/gaculator`；证书私钥、原 Snapshot、浏览器存档和其他临时文件仍不发布。Firebird 的 GPLv3 不授予 TI 镜像再分发权。

发布包支持根站点及仓库子路径，缓存/存档按路径隔离。本地停服后缓存重开已验证；手机离线冷启动尚未验收。见 [Pages 发布说明](docs/github-pages.md)。

旧版首次安装自动更新机制时，仍需等待“更新就绪”后关闭全部同站点窗口再打开一次；之后的页面启动会自动检查和切换完整新版。

## English

On **2026-11-14**, the user replaced the independent CAS approach with **Firebird → WebAssembly → local offline PWA**. The sole production entry is `src/firebird/main.js`; the old CAS no longer participates in the build.

The private local package contains **CX CAS 4.5.2.8 NAND and Boot1** from the user's calculator directory. Originals stay read-only; a device-local Worker runs the emulator without streaming. This is not a CX II / 6.4 port. The native `Snapshot` is excluded; first startup boots from Boot1.

Use the commands above. Emscripten **3.1.74** builds the core once; subsequent app builds reuse it. Output is `temp/firebird-dist/`, including compressed verified device files, a complete offline inventory, GPLv3 and corresponding source.

For local preview, run `npm start` and open `http://localhost:4173/` on the computer without certificates. The server listens on loopback by default. `npm run pages:package` prepares `temp/gaculator-github-pages.zip` with its Pages workflow; follow the [deployment guide](docs/github-pages.en.md). Pages trusted HTTPS needs no user certificate profile. The target is [m0no3van/gaculator](https://github.com/m0no3van/gaculator); Actions determines deployment status. The optional `npm run lan` certificate helper remains available for LAN testing; see [architecture and acceptance](docs/firebird-pwa.en.md).

The main UI contains only LCD/full keypad; the corner “⋯” and settings dialog are removed. Each page startup makes a bounded cloud version check, automatically switches only after the new cache is complete, and retains the current cached version and saves if checking/downloading fails or the device is offline. Matching cached image bytes are verified and reused. Initial precaching finishes before Worker startup to avoid duplicate device downloads; later local loads still decompress and initialize the core. The phone layout fits the dynamic viewport and safe areas without page scrolling, with a stable correction for an iOS installed-PWA status-bar-sized height deficit, avoiding oscillating height and flicker. Short landscape screens use compact spacing; the LCD centers in its container at the largest available 4:3 size. Autosave remains but runs only with changes after input becomes idle; hiding flushes changes, avoiding unconditional snapshot compression every 30 seconds. Guest-clock pacing replaces fixed Worker sleeps; new input wakes immediately and prioritizes changed frames. Idle checks remain at 30 FPS with one frame in flight, without posting identical pixels. Modifier lead-in fixes Shift+plus integral and Shift+minus derivative chords, verified in the real OS. At the user’s request, the keyboard returns to the previous flat appearance, retaining viewport/safe-area fitting and calculus chords. Holding ON for at least five seconds and releasing waits a 500 ms safety interval before showing native confirmation text in the client’s preferred Chinese or English language, asking whether to reload the PWA, then clears project data and downloads again only after confirmation; normal updates retain saves. Touchpad slides/clicks are distinct; the center key retains its original visible size, with hit testing strictly following its visible edge; blank regions and points outside its rounded outline never confirm. Direction/center taps retain Ctrl/Shift and Ctrl+right opens scratchpad graph from calculation and Ctrl+left returns. Actual WASM graph cursor movement is verified. Tests/build pass; prior boot/math/snapshot evidence is documented. Key events are deduplicated so one Safari touch does not type twice. Supporting browsers attempt a double vibration at the ON hold threshold. Safari key and center/direction tap feedback attempts return using one-pixel clipped, non-hit-testable native switches activated by fixed visible labels, without the full-key overlay. Press boundaries stay fixed and release immediately clears the color, avoiding lingering x²/function-key press appearance. Integral/derivative legends have no arrows and share one weight. Five-second timer vibration is not promised on iPhone PWA. iPhone physical haptics and disconnected cold start remain unverified. WASM memory is about 331 MB.

The former CAS/editor dependencies were removed. After specific user confirmation, 103 old source/doc/test/tool/resource entries totaling about 55 MB were deleted. See [cleanup record](docs/firebird-cleanup.en.md). The earlier project is archived under ignored `temp/legacy-before-firebird.zip`.

The NAND may contain existing documents. On 2026-11-14 the user explicitly authorized public upload of the complete runtime to `m0no3van/gaculator`. Certificate private keys, original Snapshot, browser saves and unrelated temporary files remain excluded. Firebird's GPLv3 does not grant redistribution rights to TI firmware.

The release supports root/project URLs with isolated caches and saves. Cached reload after stopping the local server is verified; phone offline cold start remains unaccepted. See the [Pages deployment guide](docs/github-pages.en.md).

When upgrading an older installation to the automatic updater for the first time, wait for “Update ready”, close all windows for this site and reopen once. Subsequent page startups check and switch to a complete new version automatically.
