# Gaculator — Firebird PWA

[English](AGENTS.en.md)

2026-11-14 用户明确改为：直接移植 Firebird、打包本机镜像、局域网扫码安装，并确认删除 `temp/firebird-cleanup-plan.json` 中的 103 项旧内容。原独立 CAS 路线已终止。随后用户明确确认“同时公开上传完整 NAND 运行包”，授权将源码和完整运行包推送至公开仓库 `m0no3van/gaculator`。

开始前读 [README](README.md) 和 [当前架构与验收](docs/firebird-pwa.md)。只以当前文件和实际测试判断状态。

- 唯一入口 `src/firebird/main.js`。Vue 仅负责 UI；真实 Firebird ARM/Thumb/外设核心在 Worker 中本机执行。不要重新引入独立 CAS、MathLive 或 DOM 光栅化。
- Firebird 来源固定提交 `ccd0d1dfa1cf87133e2dea44c482d648d99a789b`，保留 GPLv3、修改说明和对应可重建源码。不得称为原创模拟核心。
- 当前运行对象为 CX CAS **4.5.2.8**，不是 CX II / 6.4。本机原始 NAND、Boot1、Snapshot 保持只读；原 Snapshot 不打包。输入路径及 SHA-256 见当前文档。
- 打包完整 NAND 是当前要求，可能含文档；用户已明确允许将其公开上传至 `m0no3van/gaculator`。授权不包含证书私钥、原 Snapshot 或浏览器存档；对应源码归档仍不得包含镜像、存档和私钥。
- 桌面左 LCD / 右完整键盘，手机上 LCD / 下完整键盘，不显示 Swipe here。LCD 是真实 320×240 framebuffer；按键矩阵按固定 Firebird 源码验证。按键时长以虚拟时钟计算。
- 前景不因闲置而必须手动按 ON；当前使用背光关闭后的电源中断唤醒。隐藏页面保存/暂停，恢复与长时间闲置须分别测试。
- IndexedDB 快照保存要事务完成才报成功；失败不能覆盖旧存档；更新不清除用户数据库。CPU 错误、超时、存储失败均须明确报告。旧独立 CAS 的浏览器数据库不删除。
- 普通手机 LAN HTTP 不等于可安装离线 PWA。可信 HTTPS、完整缓存、手机断网、电脑关闭后的图标冷启动必须实测。证书私钥不得进入静态包或二维码。
- 文档中英文对应，代码英文标识符。临时/派生产物放被忽略的 `temp/`。不需要插件系统或远程计算。
- 修改前检查全部调用者。非平凡逻辑与 bug 修复有相应测试；不为了文档新增框架。主要命令为 `npm test`、`npm run test:wasm`、`npm run build`、`npm run check:docs`、`npm run check:delivery`。原分析/旧 CAS 检查脚本已移除。

报告实现、验证和限制；没有真机测试就写未验证。内存约 331 MB，不能将桌面结果推广到手机。备份导入/跨核心快照迁移目前未提供。
