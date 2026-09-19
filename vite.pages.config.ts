import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import { fileURLToPath, URL } from 'node:url';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import type { Plugin } from 'vite';
import deployment from './deployment.json' with { type: 'json' };
function offlineShell(): Plugin {
  let outputDirectory = '';
  return {
    name: 'hafhaf-offline-shell',
    apply: 'build',
    configResolved(config) { outputDirectory = resolve(config.root, config.build.outDir); },
    async closeBundle() {
      const files: string[] = [];
      async function visit(directory: string) {
        for (const entry of await readdir(directory, { withFileTypes: true })) {
          const path = join(directory, entry.name);
          if (entry.isDirectory()) await visit(path);
          else if (entry.name !== 'sw.js' && !entry.name.endsWith('.map')) files.push(path);
        }
      }
      await visit(outputDirectory);
      files.sort();
      const hash = createHash('sha256');
      const assets = [];
      for (const path of files) {
        const name = relative(outputDirectory, path).replaceAll('\\', '/');
        assets.push(name);
        hash.update(name).update(await readFile(path));
      }
      const workerPath = join(outputDirectory, 'sw.js');
      const source = await readFile(workerPath, 'utf8');
      hash.update(source);
      await writeFile(workerPath, `self.__HAFHAF_SHELL__ = ${JSON.stringify({ version: hash.digest('hex').slice(0, 20), assets })};\n${source}`);
    },
  };
}
export default defineConfig(({ mode }) => {
  if (deployment.environment !== 'production' || deployment.convexUrl !== `https://${deployment.convexDeployment}.convex.cloud`) {
    throw new Error('Invalid Production deployment configuration');
  }
  return {
    base: deployment.base,
    plugins: [react(), offlineShell()],
    // Published builds always use Production, even when .env.local points to Development.
    define: mode === 'production' ? { 'import.meta.env.VITE_CONVEX_URL': JSON.stringify(deployment.convexUrl) } : {},
    resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
    css: { postcss: { plugins: [tailwindcss()] } },
    build: { outDir: 'dist-pages', emptyOutDir: true },
  };
});
