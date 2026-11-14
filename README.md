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

当前界面仅保留屏幕与键盘，自动存档和后台缓存继续。触控板区分滑动与点击；真实 WASM 图形页已验证光标移动。19 项测试与构建通过；原有冷启动、数学、存档恢复证据见文档。按键区域有分区反馈；Safari 只尝试可信原生开关的单次系统轻触，不能控制分区强度。iPhone 震感和真机离线冷启动尚未验收。运行内存约 331 MB。

```powershell
npm test
npm run test:wasm
npm run test:touchpad
npm run check:docs
npm run check:delivery -- http://127.0.0.1:4173/
```

旧依赖（SymPy/Pyodide、MathLive、KaTeX、CE）已移出 package.json。用户具体确认后，旧源码、文档、测试、资源和工具共 103 项、约 55 MB 已删除。[清理记录](docs/firebird-cleanup.md)。此前工程保留在被忽略的 `temp/legacy-before-firebird.zip`。

镜像包可能含 NAND 中原有的文档。用户已于 2026-11-14 明确允许将完整运行包公开上传至 `m0no3van/gaculator`；证书私钥、原 Snapshot、浏览器存档和其他临时文件仍不发布。Firebird 的 GPLv3 不授予 TI 镜像再分发权。

发布包支持根站点及仓库子路径，缓存/存档按路径隔离。实际 GitHub Actions、正式地址和手机离线冷启动尚未验收。见 [Pages 发布说明](docs/github-pages.md)。

## English

On **2026-11-14**, the user replaced the independent CAS approach with **Firebird → WebAssembly → local offline PWA**. The sole production entry is `src/firebird/main.js`; the old CAS no longer participates in the build.

The private local package contains **CX CAS 4.5.2.8 NAND and Boot1** from the user's calculator directory. Originals stay read-only; a device-local Worker runs the emulator without streaming. This is not a CX II / 6.4 port. The native `Snapshot` is excluded; first startup boots from Boot1.

Use the commands above. Emscripten **3.1.74** builds the core once; subsequent app builds reuse it. Output is `temp/firebird-dist/`, including compressed verified device files, a complete offline inventory, GPLv3 and corresponding source.

For local preview, run `npm start` and open `http://localhost:4173/` on the computer without certificates. The server listens on loopback by default. `npm run pages:package` prepares `temp/gaculator-github-pages.zip` with its Pages workflow; follow the [deployment guide](docs/github-pages.en.md). Pages trusted HTTPS needs no user certificate profile. The target is [m0no3van/gaculator](https://github.com/m0no3van/gaculator); Actions determines deployment status. The optional `npm run lan` certificate helper remains available for LAN testing; see [architecture and acceptance](docs/firebird-pwa.en.md).

The UI now contains only LCD/keypad, retaining autosave/background caching. Touchpad slides/clicks are distinct; actual WASM graph cursor movement is verified. Nineteen tests/build pass; prior boot/math/snapshot evidence is documented. Key regions have distinct feedback; Safari attempts a trusted native-switch system tick, without programmable regional intensity. iPhone physical haptics and disconnected cold start remain unverified. WASM memory is about 331 MB.

The former CAS/editor dependencies were removed. After specific user confirmation, 103 old source/doc/test/tool/resource entries totaling about 55 MB were deleted. See [cleanup record](docs/firebird-cleanup.en.md). The earlier project is archived under ignored `temp/legacy-before-firebird.zip`.

The NAND may contain existing documents. On 2026-11-14 the user explicitly authorized public upload of the complete runtime to `m0no3van/gaculator`. Certificate private keys, original Snapshot, browser saves and unrelated temporary files remain excluded. Firebird's GPLv3 does not grant redistribution rights to TI firmware.

The release supports root/project URLs with isolated caches and saves. Actual GitHub Actions, production URLs and phone offline cold start remain unaccepted. See the [Pages deployment guide](docs/github-pages.en.md).
