from pathlib import Path
import importlib.util
import json
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('package_pages', ROOT / 'tools/package-pages.py')
pages = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pages)


class PagesReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=ROOT / 'temp')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.build = self.root / 'build'
        self.build.mkdir()
        self.names = ['index.html', 'manifest.webmanifest', 'assets/index-test.js',
                      'vendor/firebird/firebird.wasm', 'vendor/firebird/source.zip',
                      'vendor/firebird/LICENSE.txt', 'vendor/firebird-device/device.json',
                      'vendor/firebird-device/boot1.img.gz', 'vendor/firebird-device/flash.img.gz']
        for name in self.names:
            path = self.build / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(name.encode())
        self.inventory(self.names)

    def inventory(self, names):
        (self.build / 'sw.js').write_text('const ASSETS=' + json.dumps(names) + ';\n', encoding='utf-8')

    def package(self):
        return pages.package(self.build, self.root / 'releases')

    def test_complete_release_excludes_unlisted_private_files_and_has_workflow(self):
        (self.build / 'private.key').write_text('secret', encoding='utf-8')
        folder, archive = self.package()
        pages.checker.check(folder)
        with zipfile.ZipFile(archive) as content:
            names = set(content.namelist())
            self.assertIn('.github/workflows/pages.yml', names)
            self.assertIn('site/vendor/firebird-device/flash.img.gz', names)
            self.assertIn('site/vendor/firebird/source.zip', names)
            self.assertIn('site/.nojekyll', names)
            self.assertFalse(any('private' in name or name.endswith('.pem') for name in names))

    def test_private_or_escaping_inventory_is_rejected(self):
        for name in ['private.key', '../secret', '/secret', 'vendor/firebird-device/Snapshot']:
            with self.subTest(name=name):
                self.inventory(self.names + [name])
                with self.assertRaises(ValueError):
                    self.package()

    def test_missing_runtime_is_rejected(self):
        self.inventory([name for name in self.names if not name.endswith('firebird.wasm')])
        with self.assertRaisesRegex(ValueError, 'Incomplete'):
            self.package()

    def test_deployment_rejects_modified_and_extra_files(self):
        folder, _ = self.package()
        (folder / 'site/index.html').write_text('changed', encoding='utf-8')
        with self.assertRaisesRegex(ValueError, 'changed'):
            pages.checker.check(folder)
        folder, _ = self.package()
        (folder / 'site/private.key').write_text('secret', encoding='utf-8')
        with self.assertRaisesRegex(ValueError, 'inventory'):
            pages.checker.check(folder)


if __name__ == '__main__':
    unittest.main()
