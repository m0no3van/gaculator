"""Check a locally prepared release before uploading its static site to Pages."""
from pathlib import Path, PurePosixPath
import hashlib
import json


def check(root):
    site = root / 'site'
    manifest = json.loads((root / 'release.json').read_text(encoding='utf-8'))
    if manifest.get('format') != 1 or not isinstance(manifest.get('files'), dict):
        raise ValueError('Unsupported release manifest')
    expected = manifest['files']
    required = {'index.html', 'sw.js', 'manifest.webmanifest', '.nojekyll',
                'vendor/firebird/firebird.wasm', 'vendor/firebird/source.zip',
                'vendor/firebird/LICENSE.txt', 'vendor/firebird-device/device.json',
                'vendor/firebird-device/boot1.img.gz', 'vendor/firebird-device/flash.img.gz'}
    if not required <= expected.keys():
        raise ValueError('Incomplete site: run npm run pages:package locally first')
    if site.is_symlink() or any(path.is_symlink() for path in site.rglob('*')):
        raise ValueError('Symlinks are not allowed')
    actual = {path.relative_to(site).as_posix() for path in site.rglob('*') if path.is_file()}
    if actual != expected.keys():
        raise ValueError('Site files differ from the release inventory')
    for name, info in expected.items():
        path = PurePosixPath(name)
        if path.is_absolute() or '..' in path.parts or '\\' in name:
            raise ValueError('Unsafe release path')
        data = (site / name).read_bytes()
        if len(data) != info['size'] or hashlib.sha256(data).hexdigest() != info['sha256']:
            raise ValueError(f'Release file changed: {name}')
    print(f'Verified {len(expected)} static files; no cloud compilation or certificate required.')


if __name__ == '__main__':
    check(Path(__file__).resolve().parents[2])
