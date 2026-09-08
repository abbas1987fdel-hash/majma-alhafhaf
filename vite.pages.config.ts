import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import { fileURLToPath, URL } from 'node:url';
import deployment from './deployment.json' with { type: 'json' };
export default defineConfig(({ mode }) => {
  if (deployment.environment !== 'production' || deployment.convexUrl !== `https://${deployment.convexDeployment}.convex.cloud`) {
    throw new Error('Invalid Production deployment configuration');
  }
  return {
    base: deployment.base,
    plugins: [react()],
    // Published builds always use Production, even when .env.local points to Development.
    define: mode === 'production' ? { 'import.meta.env.VITE_CONVEX_URL': JSON.stringify(deployment.convexUrl) } : {},
    resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
    css: { postcss: { plugins: [tailwindcss()] } },
    build: { outDir: 'dist-pages', emptyOutDir: true },
  };
});
