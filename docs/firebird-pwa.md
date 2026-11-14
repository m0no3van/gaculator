# Firebird PWA：当前路线

[English](firebird-pwa.en.md) · 2026-11-14，Europe/London。

## 需求变更

用户明确要求推倒原独立 CAS，直接移植 Firebird 并打包本机镜像、扫码安装；随后允许大幅修改、删除不再需要的内容。因此，旧文档中的“不运行 Firebird / TI OS / 不打包镜像 / 自制全部 LCD 资产”不再是当前产品约束。仍保持本机离线计算、原始镜像保护、手机/桌面同一核心，以及如实验收边界。

## 实际实现

| 层 | 当前入口与职责 |
| --- | --- |
| 模拟核心 | `third_party/firebird/core/`，固定上游提交 `ccd0d1dfa1cf87133e2dea44c482d648d99a789b`，GPLv3 |
| WASM 适配 | `tools/firebird/bridge.cpp`，复用真实 ARM/Thumb 解释器、NAND、外设、LCD、键盘与快照；不编译 Qt/GIF/JIT |
| 编译 | `tools/build-firebird.py`，Emscripten 3.1.74；32 MiB 初始、512 MiB WASM 上限，允许增长 |
| 用户界面 | Vue 3.5.44；`src/firebird/App.vue`、`Keypad.vue`，320×240 真实 RGB565 framebuffer 转 RGBA Canvas |
| 运算 | `src/firebird/worker.js`，独立 Worker 本机运行 TI 系统；无服务端计算、运行时 CDN 或原生模拟器依赖 |
| 存档 | 独立 IndexedDB；根路径名 `gaculator-firebird` 不变，项目路径另设命名空间；快照包含 RAM、外设和 NAND 改动；30 秒及隐藏页面尝试保存 |
| 分发 | Vite 6.4.5、qrcode 1.5.4、完整版本化缓存；`tools/serve.mjs` 只分发 `temp/firebird-dist/` |

上游旧 Emscripten Makefile 没有直接拿来构建：它缺少当前 C++ keypad/CX II 源文件。适配器改为手动步进、浏览器时间预算和 100 Hz 虚拟节拍；计算不阻塞页面主线程。无原生 JIT，性能不能照搬桌面 Firebird。

上游改动：Emscripten 分支的退出使用 abort 避免关闭 assert 后未定义返回；补齐 OS 头文件；NAND 映射后关闭输入文件、释放 MEMFS 大缓冲；修复 `flash_suspend` 写失败错误返回成功。GIF 录制未提供。对应修改和重建脚本在随附 `source.zip` 中。

LCD 按实际核心输出，字体、菜单与 CAS 来自所运行的 OS。前景检测到背光关闭时触发电源唤醒中断，不额外合成 Home 键；隐藏时保存并暂停 Worker。长时间闲置自动唤醒仍需真实浏览器持续验证，不能仅由代码推断验收通过。

## 镜像与存储保护

- 仅打包指定 **CX CAS 4.5.2.8**：Boot1 524,288 字节、NAND 138,412,032 字节；原 `Snapshot` 不进入包。
- NAND SHA-256 固定为 `43a00d93c97a06969bfcdefca1d7a0356256286c1cbc5e7109a9b0d7a126dc1e`，打包前验证。运行后再次验证原件相同。
- 两份输入 gzip 后共 **19,726,938 字节**。`device.json` 保存压缩/原始大小与 SHA-256、WASM 身份；Worker 核验下载字节后解压。
- 原文件仅读取；运行时写入独立内存 NAND，持久化为浏览器快照。完整分发包包含 NAND，可能含原有或已删除文档的残留；用户已明确授权将其随 `site/` 公开上传到 `m0no3van/gaculator`。对应源码 ZIP 不包含镜像。
- 快照以“核心 WASM + 镜像”身份绑定，版本不符时保留并拒绝自动覆盖。多窗口使用 Web Locks 防止同一存档被并发写入。
- 保存必须等 IndexedDB 事务完成才报告成功。保存队列不丢弃排在其后的按键；失败保留上一次已提交存档。浏览器强制终止/配额回收仍可能损失未保存的最近输入。
- 当前主界面保留 LCD 和键盘；顶部保存/备份/安装/二维码等工具栏已移除。屏幕右上角“⋯”打开缓存状态与卸载前清理。首次加载显示缓存/启动状态。30 秒/切后台的事务自动保存保留；目前没有可见的备份导出/导入 UI，也未实现跨核心版本快照迁移。原浏览器数据库未删除，旧独立 CAS 的 JSON 不迁入模拟器。

## 编译和本地访问

```powershell
npm ci
npm run build:firebird -- --emcc <Emscripten-3.1.74目录>/emcc.py
npm run build
npm run serve
```

已生成核心时不必每次重编。可用 `EMCC` 指定 emcc.py，用 `GACULATOR_DEVICE_DIR` 指定包含同名输入的目录。默认镜像路径为 `D:/01-Software/VirtualMachines/Calculator`。编译器/缓存/派生文件在 `temp/`；`npm run build` 从明确允许的资源准备 `temp/firebird-public/`，不会把旧 Pyodide/MathLive/字体打包进去。

服务器默认仅监听 `127.0.0.1:4173`，可用 `PORT` 换端口。浏览器 QA 使用独立端口 4186，避免覆盖旧来源的缓存/文档。此时旧独立 CAS 的 IndexedDB 仍保留。

现在本地试用可直接 `npm start`，在电脑浏览器打开 `http://localhost:4173/`，无需安装证书。`npm run pages:package` 在本机生成包含发布流程的静态 ZIP；完整步骤见 [Pages 发布](github-pages.md)。

## 手机扫码与安装

正式分发目标：用户计划后续使用 **GitHub Pages**。`github.io` 站点默认提供浏览器信任的 HTTPS，因此届时不再需要本机 CA、描述文件或电脑常开；二维码编码正式 HTTPS 网址，完整缓存后仍在手机本机离线运行。[GitHub 官方 HTTPS 说明](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https)

当前 `base: './'`、Manifest、Worker 资源和 Service Worker 使用相对路径，支持根站点及 `https://<user>.github.io/<repo>/` 项目站点。缓存、数据库与写入锁按项目路径隔离，保留根路径原数据库；不会删除其他项目缓存或旧独立 CAS 数据。换网址不会自动搬迁存档。

已配置 `npm run pages:package`：仅从生产资源白名单生成 `temp/gaculator-github-pages.zip`，内含 `site/`、发布工作流、SHA-256 清单与核验脚本；GitHub 上不需要镜像输入路径或编译器。用户已明确授权向公开仓库 `m0no3van/gaculator` 推送源码及完整 NAND 运行包，排除私钥、原 Snapshot 与浏览器存档。部署状态以 GitHub Actions 为准。使用方法见 [Pages 发布](github-pages.md)。以下本机证书方案保留为可选局域网测试，不用于正式 Pages 分发。

用户已明确确认向当前可信局域网分发。运行 `npm run lan` 使用本机已安装的 OpenSSL，在 `temp/firebird-certs/` 生成 CA 和服务器证书；HTTP 4187 提供手机安装说明、公开 CA/Apple 描述文件，HTTPS 8443 提供应用。二维码在 `temp/qa/firebird/install-qr.png`；可用 `GACULATOR_LAN_ADDRESS` 指定实际可达 IPv4。证书链/IP 会先自检，私钥不由任何 HTTP 路由分发，也不进入源码包。电脑/手机的系统信任仍由用户手动设置。

已有手机信任的 LAN 证书时，也可直接运行：

```powershell
$env:GACULATOR_HOST = '0.0.0.0'
$env:GACULATOR_CERT = 'D:/path/to/trusted-lan-cert.pem'
$env:GACULATOR_KEY = 'D:/path/to/trusted-lan-key.pem'
npm run serve
```

必须使用证书覆盖且手机信任的实际地址；多网卡地址用 `GACULATOR_LAN_ADDRESS` 更正。Android 使用浏览器安装功能，iOS Safari 使用“分享 → 添加到主屏幕”。首次先完成全部资源离线缓存，再启动 Worker，避免缓存安装与模拟器重复下载约 20 MB 的压缩镜像；之后使用本地缓存，但每次仍需校验、解压和初始化。缓存失败/超时会报告，允许在线启动，不宣称此时已经可以离线。首次应保持联网完成启动、安装，再按下文断网冷启动验收。

普通 LAN HTTP 不满足手机安全上下文/Web Locks/Service Worker；二维码不会安装根证书，应用不能静默安装 PWA。没有自有可信域名证书时，用户须在手机上完成证书信任设置。未设置公网隧道、未上传镜像、未修改系统信任。

完整安装验收：关闭电脑，手机飞行模式，彻底关闭应用，从安装图标冷启动，完成新 CAS 运算、保存、重开，并验证图形/文档。已运行 OS 自带功能不等于这些路径都通过验收。

## 验证与剩余限制

已通过：21 项 JS、4 项 Python 测试、生产构建、发布包核验及本地项目子路径分发检查；真实 WASM 冷启动/数学/存档恢复沿用此前验证；`npm run test:touchpad` 在真实 TI 图形页检查接触移动后 LCD 内的原生光标向右移动、抬手释放，覆盖从 GUI 手势到 Worker 输入处理的同一模块。原始 NAND 与 WASM 二进制未改动，现有存档身份不变。本次在独立 4193/4194 端口验证 402×874、390×664、320×568、874×402 与桌面布局，整页无溢出；停掉本地服务器后重载仍显示离线资源就绪并加载模拟器。这是桌面浏览器视口验证，不能代替真机；实际发布状态以对应提交的 GitHub Actions 为准；真实 iPhone 视觉/震感/断网冷启动未验收。报告见 `temp/qa/firebird/` 和 `temp/qa/delivery-check.json`。

## 缓存、手机布局与卸载清理

- 手机竖屏用动态可视高度 `100dvh` 和安全区分配 LCD/完整键盘；键盘纵向尺寸随剩余高度调整，页面禁止溢出与滚动回弹。横屏保留左右排列。LCD 以原始 4:3 比例等比显示，不裁掉 framebuffer；Safari 的浏览器工具栏由系统控制，主屏幕 standalone 可用空间更大。
- 缓存完成后，同一网址的后续启动无需重复下载镜像；保存过快照时沿用原恢复路径。设备解压、约 331 MB 的 WASM 初始化及 TI 系统运行仍耗时，不保证秒开；存储被系统回收后需重新联网缓存。更新不会删除 IndexedDB 存档。
- “⋯ → 清除本机数据”必须明确确认永久删除；停止 Worker/自动保存、等待在途存储写入、关闭数据库，持有本项目会话锁时注销相同 scope 的 Service Worker，等待安装中的缓存任务结束，删除本项目所有版本缓存与当前 Firebird 存档库。失败显示错误，可重试；旧独立 CAS、其他项目数据库和缓存不删除。
- 网页不能可靠监听卸载；删除主屏幕图标不等于确认浏览器数据零残留。[W3C Manifest 讨论](https://lists.w3.org/Archives/Public/public-webapps-github/2026Jul/0522.html)说明这一限制。应在**已安装的主屏幕应用内**先清理，再删除图标；Safari 副本可能使用不同存储，需另在“设置 → App → Safari → 高级 → 网站数据”删除相应站点。系统清理可能影响同域名其他项目，参见 [Apple 清理说明](https://support.apple.com/en-us/105082)。应用清理不声称擦除系统 HTTP 缓存、浏览历史或其他独立存储空间；需要零站点残留时用系统网站数据清理。

## 操作响应与参考键盘

模拟核心原本就是 C/C++ → WebAssembly；本次不改 ARM/Thumb 指令语义、WASM 二进制或存档身份。原 Worker 每次最多执行 8 ms 后固定再睡 16 ms；现在按 100 Hz 虚拟时钟与实际经过时间安排下一次运行，落后时立即让出后继续，领先才等待。恢复前重置计时基准，不补跑后台时长。渲染最多 30 FPS，主线程确认绘制前不再发送下一帧，避免画面消息积压。

触摸按下立即提交输入，不再等抬手后的 click；键盘与辅助技术仍有激活路径。普通按键保持 4 个 guest tick、释放间隔 2 tick（40/20 ms 虚拟时间），替代 100/40 ms；修饰键先保持 4 tick，再按主键，修复 Shift/Ctrl 与主键同时入队时 OS 未识别组合的问题。`npm run test:keyboard` 用同一真实 NAND/快照比较快慢两种时长下 28 位重复/不同数字与积分/导数模板，忽略仅垂直光标闪烁的差异。Shift + 加号 = 积分，Shift + 减号 = 求导；电脑 Shift+小键盘加/减、Shift+减号也保留修饰键，普通键盘打出的 `+` 仍是加法。

`npm run test:performance` 在相同 WASM、相同恢复快照下测真实 Worker 调度，Node 嵌套定时器至少等待 4 ms。此电脑基线约 0.592× 虚拟实时速度、16 键排队 4201 ms；优化后约 1.005×、1016 ms。约 4.1 倍改善是**排队清空耗时**，不是所有运算加速倍数，也不是 iPhone 数据。两次约 6 秒运行的 WASM 步进耗时分别 440/455 ms，剩余差异主要来自调度与按键时长。报告在 `temp/qa/performance/`；基线脚本为修改前 Worker 的临时副本，不分发用户快照。

键盘参考 [TI 官方 CX CAS 产品图](https://education.ti.com/en/products/calculators/graphing-calculators/ti-nspire-cx-cas?category=accessories)，用 CSS 与内联 SVG 还原深色机身、浅蓝副标/ctrl、灰色数字键、黑色函数/字母键、触控板边框与方向标、Scratchpad/Catalog 图标。新增积分/求导 Shift 标记；没有把参考照片充当按键或 LCD。手机纵向会适配可用高度，因此不宣称像素级一致。参考图只保存在被忽略的 QA 目录，不作为产品资源发布。

## 触控板与按键反馈

原先 pointerdown/move 始终带 `down=true`，把滑动当作按住点击；还用 `event.buttons` 判断触摸移动，部分触摸事件可能被漏掉。现在 `touchpad.js` 区分 `contact` 与 `down`：接触/滑动不点击，6 CSS 像素内轻点才点击；Pointer Capture 接续板外抬手，取消/失焦/切后台解除接触。Worker 按 guest tick 合并/分段移动，避免 `int8` 相对位移溢出；最终位置被处理后才释放；保存等待手势结束。

数字/字母、运算、控制、确认区在支持 Vibration API 的设备上分别使用 4 ms、8 ms、12 ms、双脉冲时序；这是时序差异，不声称控制电机物理强度。区域按压动画也不同，尊重系统减少动态效果设置。

Safari 使用功能检测后由手指直接点击的原生 `<input type="checkbox" switch>` 产生系统轻触，不使用 JavaScript `.click()` 合成震动。[WebKit 官方说明](https://webkit.org/blog/15443/news-from-wwdc24-webkit-in-safari-18-beta/)仅说明单次轻触；[WebKit 当前实现](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/html/CheckboxInputType.cpp)要求可信事件/用户手势。它不是可编程震动 API，不能保证每种硬件、系统版本和设置都震动；Safari 上不同区域的实际震动强度/节奏目前不能兑现，触控板滑动也不伪装成反复点击开关。

若必须在 iPhone 实现轻/中/重、不同纹理及连续触觉，应在保留同一离线 WASM 的前提下增加原生 WKWebView 壳，通过 [UIImpactFeedbackGenerator](https://developer.apple.com/documentation/uikit/uiimpactfeedbackgenerator) 或 Core Haptics 发出原生反馈。这涉及原生签名/安装，不属于本次 PWA 修改；没有为此引入依赖或伪装浏览器已具备该能力。

本机 Node v20.17.0 / Windows x64 连续步进的早期启动/恢复检查约 29–43 秒；实际耗时随机器负载和验证步骤变化，以报告为准。WASM 内存 **331,415,552 字节**，快照约 10 MB。此数字不是手机启动时间或内存总占用；解压与初始化峰值更高。

未验收：真实手机、证书安装、手机离线冷启动、持续闲置恢复、全部数学命令/图形/文档/USB 功能、屏幕阅读器的 OS 内部内容。Canvas 有名称和可访问硬件键盘，但 TI OS 不提供 DOM 文本辅助树。6.4 更新包不属于本次运行对象。

Firebird GPLv3 与 TI OS 的权利分开；本地文件可读取和用户的上传授权不代表 TI 授予公开再分发许可。
