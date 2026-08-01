/**
 * 分入口构建脚本
 *
 * MV3 限制:
 *  - service_worker 必须是单文件
 *  - content_scripts 的 js 数组文件按顺序加载, 但不同入口间不能共享 chunk
 *  - 同一 IIFE bundle 内 inlineDynamicImports 也不支持多 input
 *
 * 解决方案: 对每个入口分别跑一次 vite build, 各自 IIFE 输出到 dist/.
 */

import { build, createServer } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');

const mode = process.argv.includes('--watch')
  ? 'development'
  : process.env.NODE_ENV === 'production'
    ? 'production'
    : 'development';

const isProd = mode === 'production';
const isWatch = process.argv.includes('--watch');

const outDir = path.resolve(ROOT, 'dist');

const entries = [
  { name: 'background', input: path.resolve(ROOT, 'src/background/index.ts') },
  { name: 'content', input: path.resolve(ROOT, 'src/content/index.tsx') },
  { name: 'inject', input: path.resolve(ROOT, 'src/content/inject.ts') },
];

function makeConfig(entry) {
  return {
    configFile: false,
    root: ROOT,
    mode,
    plugins: [react()],
    build: {
      outDir,
      emptyOutDir: false,
      target: 'es2022',
      minify: isProd ? 'esbuild' : false,
      sourcemap: !isProd,
      cssCodeSplit: false,
      assetsInlineLimit: 0,
      watch: isWatch ? {} : null,
      rollupOptions: {
        input: entry.input,
        output: {
          format: 'iife',
          entryFileNames: `${entry.name}.js`,
          chunkFileNames: `${entry.name}-[name].js`,
          assetFileNames: `${entry.name}-[name][extname]`,
          extend: true,
          inlineDynamicImports: true,
        },
      },
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(mode),
      __DEV__: JSON.stringify(!isProd),
    },
    server: {
      port: 5174,
      strictPort: true,
    },
  };
}

async function ensureManifestCopied() {
  const src = path.resolve(ROOT, 'public/manifest.json');
  const dest = path.resolve(outDir, 'manifest.json');
  fs.copyFileSync(src, dest);
  // icon
  const iconSrc = path.resolve(ROOT, 'public/icon.png');
  if (fs.existsSync(iconSrc)) {
    fs.copyFileSync(iconSrc, path.resolve(outDir, 'icon.png'));
  }
  // flash icon
  const flashSrc = path.resolve(ROOT, 'public/flash.png');
  if (fs.existsSync(flashSrc)) {
    fs.copyFileSync(flashSrc, path.resolve(outDir, 'flash.png'));
  }
}

async function main() {
  // 清空 dist (仅非 watch 模式)
  if (!isWatch && fs.existsSync(outDir)) {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
  fs.mkdirSync(outDir, { recursive: true });

  await ensureManifestCopied();

  for (const entry of entries) {
    console.log(`[build] ${entry.name} (mode=${mode})`);
    await build(makeConfig(entry));
  }

  if (isWatch) {
    // watch 模式下手工持续运行
    console.log('[build] watching...');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
