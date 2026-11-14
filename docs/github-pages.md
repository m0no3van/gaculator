# GitHub Pages 发布

[English](github-pages.en.md)

## 本地先试用

```powershell
npm start
```

在电脑浏览器打开 `http://localhost:4173/`，无需证书。命令会先构建再提供网页版；已构建时可直接 `npm run serve`。这是电脑本机入口，手机访问普通局域网 HTTP 仍不满足应用需要的安全环境。

## 准备发布包

```powershell
npm run pages:package
```

生成 `temp/gaculator-github-pages.zip` 和 `temp/github-pages/<版本>/`。当前机器已有 WASM，打包无需重新编译核心；换电脑重建所需步骤见 [当前架构](firebird-pwa.md)。

压缩包根目录包含：

- `site/`：运行资源、完整压缩 NAND/Boot1、GPL 许可、对应可重建源码和离线缓存脚本。
- `.github/workflows/pages.yml`：GitHub Pages 官方 Actions 发布流程。
- `.github/scripts/check-pages.py`、`release.json`：发布前逐文件核对清单、大小和 SHA-256。
- `README.md`：中英文上传说明。

只从明确允许的生产资源生成包；证书、私钥、原 Snapshot、浏览器存档、旧工程和其他临时文件不进入包。该包包含完整本机 NAND，可能含文档；用户已于 2026-11-14 明确允许将其公开上传到 `m0no3van/gaculator`。打包命令自身不会上传或发布。Firebird GPLv3 不授予 TI 镜像再分发权。

## 之后上传发布

1. 解压 ZIP，将**解压后的全部内容**（包括 `.github`）上传 GitHub 仓库的 `main` 分支。不要直接上传 ZIP 文件，也不要上传整个开发工作区。
2. 在仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。
3. 在 **Actions → Deploy prepared Pages site → Run workflow** 运行一次。以后向 `main` 推送 `site/` 或 `release.json` 的变更会自动发布；仅上传源码不会触发发布。
4. 使用工作流 `github-pages` 部署结果显示的 HTTPS 地址。用户无需安装 CA、描述文件或其他证书；iPhone Safari 用“分享 → 添加到主屏幕”。

流程在 GitHub 上仅核验并发布 `site/`，不读取 Windows 镜像路径、不安装 Emscripten、不运行远程模拟器。根站点与 `https://<用户名>.github.io/<仓库名>/` 项目站点均使用相对资源路径，无需修改仓库名配置。工作流参考 [GitHub 官方自定义发布流程](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)；可信 HTTPS 见 [官方说明](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https)。

更新时用新包替换 `site/`、`release.json` 和 `.github/`，同时移除旧 `site/` 文件；额外或被修改的文件会导致发布核验失败。保持相同站点地址以保留该来源的浏览器存档。缓存、数据库与写入锁按项目路径区分；根路径的原本地数据库名不变。更换域名/仓库路径或从 localhost 切换到 Pages 不会自动迁移存档；核心/镜像身份不符时拒绝覆盖旧存档。

## 验证边界

本地检查覆盖发布包完整性、私有文件排除、篡改/额外文件拒绝、项目路径缓存与存档隔离。发布包经本地项目子路径分发检查；实际 GitHub Actions、正式 HTTPS 地址、真实 iPhone 及手机断网图标冷启动尚未验证。正式站点上线后仍需完成 [手机离线验收](firebird-pwa.md)。
