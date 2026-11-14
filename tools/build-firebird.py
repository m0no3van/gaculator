"""Build the pinned GPL Firebird core with an existing Emscripten SDK, locally."""
from pathlib import Path
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'third_party/firebird'
OUT = ROOT / 'public/vendor/firebird'


def archive_source():
    OUT.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(OUT / 'source.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
        for folder in [SOURCE, ROOT / 'tools/firebird', ROOT / 'src/firebird', ROOT / 'tests/firebird']:
            for path in sorted(folder.rglob('*')):
                if path.is_file():
                    archive.write(path, path.relative_to(ROOT).as_posix())
        for name in ['tools/build-firebird.py', 'tools/package-firebird.mjs', 'tools/serve.mjs',
                     'tools/test-firebird.mjs', 'tools/test-touchpad.mjs', 'tools/test-keyboard.mjs', 'tools/test-performance.mjs',
                     'tools/test-input-latency.mjs',
                     'tools/check-delivery.mjs', 'tools/check_docs.py', 'tools/lan-firebird.mjs',
                     'tools/package-pages.py', '.github/workflows/pages.yml', '.github/scripts/check-pages.py',
                     'vite.config.js', 'package.json', 'package-lock.json', 'index.html', 'LICENSE', 'README.md',
                     'docs/firebird-pwa.md', 'docs/firebird-pwa.en.md', 'docs/github-pages.md', 'docs/github-pages.en.md']:
            archive.write(ROOT / name, name)
        for name in ['icon.svg', 'icon-192.png', 'icon-512.png', 'manifest.webmanifest']:
            archive.write(ROOT / 'public' / name, 'public/' + name)


def build(emcc: Path):
    OUT.mkdir(parents=True, exist_ok=True)
    work = ROOT / 'temp/firebird-build'
    work.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    env['EM_CACHE'] = str(work / 'cache')
    config = work / '.emscripten'
    sdk = emcc.parent.parent
    node = shutil.which('node')
    config.write_text(f'LLVM_ROOT = {str(sdk / "bin")!r}\nBINARYEN_ROOT = {str(sdk)!r}\nNODE_JS = {node!r}\n', encoding='utf-8')
    env['EM_CONFIG'] = str(config)
    flags = ['-O3', '-DNDEBUG', '-I' + str(SOURCE), '-sUSE_ZLIB=1']
    excluded = {'gif.cpp', 'translate_x86.c', 'translate_x86_64.c', 'translate_arm.cpp', 'translate_aarch64.cpp'}
    sources = sorted(p for p in (SOURCE / 'core').iterdir() if p.suffix in ('.c', '.cpp') and p.name not in excluded)
    sources += [SOURCE / 'core/os/os-emscripten.c', ROOT / 'tools/firebird/bridge.cpp']
    objects = []
    for source in sources:
        obj = work / (source.stem + '.o')
        # Rebuild after any header changes as well as source/toolchain changes.
        objects.append(str(obj))
        print('Compile', source.name, flush=True)
        subprocess.run([sys.executable, str(emcc), *flags, '-std=' + ('c++17' if source.suffix == '.cpp' else 'c11'),
                        '-c', str(source), '-o', str(obj)], env=env, check=True)
    exports = ['_fb_start', '_fb_step', '_fb_key', '_fb_touch', '_fb_release', '_fb_save', '_fb_ticks', '_fb_paint', '_malloc', '_free']
    subprocess.run([sys.executable, str(emcc), '-O3', *objects, '-sUSE_ZLIB=1', '--no-entry',
                    '-sMODULARIZE=1', '-sEXPORT_ES6=1', '-sEXPORT_NAME=createFirebird',
                    '-sENVIRONMENT=web,worker,node', '-sALLOW_MEMORY_GROWTH=1',
                    '-sINITIAL_MEMORY=33554432', '-sMAXIMUM_MEMORY=536870912', '-sSTACK_SIZE=1048576',
                    '-sEXPORTED_FUNCTIONS=' + json.dumps(exports), '-sEXPORTED_RUNTIME_METHODS=["FS"]',
                    '-sFILESYSTEM=1', '-sASSERTIONS=1', '-o', str(OUT / 'firebird.mjs')], env=env, check=True)
    shutil.copyfile(SOURCE / 'LICENSE', OUT / 'LICENSE.txt')
    notices = []
    for name in ['LICENSE', 'system/lib/libc/musl/COPYRIGHT', 'system/lib/libcxx/LICENSE.TXT',
                 'system/lib/libcxxabi/LICENSE.TXT', 'system/lib/compiler-rt/LICENSE.TXT']:
        notices.append(name + '\n\n' + (emcc.parent / name).read_text(encoding='utf-8'))
    notices.append('zlib 1.2.13\n\n' + (work / 'cache/ports/zlib/zlib-1.2.13/README').read_text(encoding='utf-8'))
    (OUT / 'compiler-notices.txt').write_text('\n\n---\n\n'.join(notices), encoding='utf-8')
    archive_source()
    version = subprocess.check_output([sys.executable, str(emcc), '--version'], env=env, text=True).splitlines()[0]
    info = {'upstream': 'https://github.com/nspire-emus/firebird',
            'commit': 'ccd0d1dfa1cf87133e2dea44c482d648d99a789b', 'compiler': version,
            'wasmSha256': hashlib.sha256((OUT / 'firebird.wasm').read_bytes()).hexdigest()}
    (OUT / 'build.json').write_text(json.dumps(info, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(info, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--emcc', type=Path, default=Path(os.environ.get('EMCC', 'emcc.py')))
    parser.add_argument('--source-only', action='store_true')
    args = parser.parse_args()
    if args.source_only:
        archive_source()
    else:
        build(args.emcc.resolve())
