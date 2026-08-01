import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 占位 vite 配置: 实际构建走 scripts/build.mjs
 * 这里仅保留 IDE 类型检查 + preview 静态服务能力.
 */
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    minify: mode === 'production' ? 'esbuild' : false,
    sourcemap: mode !== 'production',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5174,
    strictPort: true,
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(mode),
    __DEV__: JSON.stringify(mode !== 'production'),
  },
}));
