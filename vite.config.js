import { defineConfig } from 'vite';
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  base: './',
  publicDir: 'temp/firebird-public',
  optimizeDeps: { include: ['vue'] },
  build: { target: 'es2022', outDir: 'temp/firebird-dist' },
  worker: { format: 'es', plugins: () => [], },
  server: { fs: { strict: true, deny: ['**/temp/**', '**/.reference/**', '**/.agents/**', '**/.certs/**', '**/.git/**', '**/.env*'] } },
  plugins: [vue(), {
    name: 'offline-assets',
    async closeBundle() {
      const root = resolve('temp/firebird-dist');
      async function walk(directory = '') {
        const files = [];
        for (const entry of await readdir(resolve(root, directory), { withFileTypes: true })) {
          const path = directory ? `${directory}/${entry.name}` : entry.name;
          if (entry.isDirectory()) files.push(...await walk(path));
          else if (entry.isFile() && path !== 'sw.js') files.push(path);
        }
        return files;
      }
      const assets = (await walk()).sort();
      const digest = createHash('sha256');
      for (const path of assets) digest.update(path).update(await readFile(resolve(root, path)));
      const source = await readFile('src/firebird/service-worker.js', 'utf8');
      const version = digest.update(source).digest('hex').slice(0, 16);
      await writeFile(resolve(root, 'sw.js'), `const VERSION=${JSON.stringify(version)};\nconst ASSETS=${JSON.stringify(assets)};\n${source}`);
      console.log(`Offline manifest: ${assets.length} assets, build ${version}`);
    },
  }],
});
