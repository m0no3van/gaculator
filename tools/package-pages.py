"""Prepare a static GitHub Pages repository locally; never upload or publish it."""
from pathlib import Path
import hashlib
import importlib.util
import json
import re
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('check_pages', ROOT / '.github/scripts/check-pages.py')
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)


def package(build, destination):
    script = (build / 'sw.js').read_text(encoding='utf-8')
    match = re.search(r'^const ASSETS=(.+);$', script, re.MULTILINE)
    if not match:
        raise ValueError('Build an offline inventory first: npm run build')
    names = json.loads(match[1]) + ['sw.js']
    if len(names) != len(set(names)):
        raise ValueError('Duplicate offline asset')
    files = {}
    for name in names:
        path = build / name
        if name.startswith('/') or '\\' in name or '..' in Path(name).parts or not path.resolve().is_relative_to(build.resolve()):
            raise ValueError(f'Unsafe asset path: {name}')
        allowed = name in {'index.html', 'sw.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png'}
        allowed |= bool(re.fullmatch(r'assets/[\w-]+\.(js|css)', name))
        allowed |= name in {'vendor/firebird/' + file for file in [
            'firebird.mjs', 'firebird.wasm', 'build.json', 'source.zip', 'LICENSE.txt',
            'compiler-notices.txt', 'frontend-notices.txt']}
        allowed |= name in {'vendor/firebird-device/' + file for file in [
            'boot1.img.gz', 'flash.img.gz', 'device.json']}
        if not allowed or path.is_symlink():
            raise ValueError(f'Unexpected public asset: {name}')
        files[name] = path.read_bytes()
    files['.nojekyll'] = b''
    inventory = {name: {'size': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
                 for name, data in sorted(files.items())}
    manifest = {'format': 1, 'includesLocalNand': True, 'files': inventory}
    encoded = json.dumps(manifest, indent=2).encode() + b'\n'
    folder = destination / hashlib.sha256(encoded).hexdigest()[:16]
    folder.mkdir(parents=True, exist_ok=True)
    for name, data in files.items():
        target = folder / 'site' / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    (folder / 'release.json').write_bytes(encoded)
    for name in ['.github/workflows/pages.yml', '.github/scripts/check-pages.py']:
        target = folder / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / name, target)
    (folder / 'README.md').write_text(
        '# Gaculator Pages release / 静态发布包\n\n'
        'Contains the complete local NAND; review documents/privacy and firmware redistribution rights before publishing.\n'
        '包含完整本机 NAND；公开前检查文档隐私和镜像再分发范围。\n\n'
        'Upload all contents of this folder, including `.github`, to the `main` branch of a GitHub repository. '
        'Select Settings → Pages → Source: GitHub Actions, then run “Deploy prepared Pages site”.\n'
        '将本文件夹全部内容（含 `.github`）上传仓库 `main` 分支；在 Settings → Pages 选择 GitHub Actions，'
        '然后运行 “Deploy prepared Pages site”。\n\n'
        'Use the resulting HTTPS URL; no certificate profile is required. Safari: Share → Add to Home Screen.\n'
        '使用部署结果中的 HTTPS 地址；无需安装证书描述文件。Safari：分享 → 添加到主屏幕。\n\n'
        'For updates, replace `site/`, `release.json` and `.github/` with the newly packaged versions; '
        'remove obsolete site files. Keep the same Pages URL to retain browser saves.\n'
        '更新时用新包替换 `site/`、`release.json`、`.github/`，移除旧站点文件；保留相同网址以继续使用浏览器存档。\n',
        encoding='utf-8')
    checker.check(folder)
    archive_path = destination.parent / 'gaculator-github-pages.zip'
    with zipfile.ZipFile(archive_path, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name in [*('site/' + name for name in sorted(files)), 'release.json', 'README.md',
                     '.github/workflows/pages.yml', '.github/scripts/check-pages.py']:
            archive.write(folder / name, name)
    return folder, archive_path


if __name__ == '__main__':
    folder, archive = package(ROOT / 'temp/firebird-dist', ROOT / 'temp/github-pages')
    print(f'Release folder: {folder}\nUpload ZIP: {archive}\nContains local NAND. Nothing uploaded or published.')
