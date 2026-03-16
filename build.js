#!/usr/bin/env node
/**
 * @fileoverview Build script using esbuild for Break Compliance addon.
 * Bundles TypeScript source, copies static assets, outputs to dist/.
 */

import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
const VERSION = packageJson.version;

const isProduction = process.argv.includes('--production');
const isWatch = process.argv.includes('--watch');

console.log(`Building BreakCheck v${VERSION} (${isProduction ? 'production' : 'development'})...`);

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const file of fs.readdirSync(src)) {
      copyRecursive(path.join(src, file), path.join(dest, file));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

function processIndexHtml() {
  let html = fs.readFileSync('index.html', 'utf8');
  html = html.replace(
    /<script type="module" src="js\/main\.js[^"]*"><\/script>/,
    `<script type="module" src="js/app.bundle.js?v=${VERSION}"></script>`
  );
  html = html.replace(
    '</body>',
    `  <footer class="version-footer">BreakCheck v${VERSION}</footer>\n</body>`
  );
  return html;
}

async function build() {
  if (fs.existsSync('dist')) fs.rmSync('dist', { recursive: true });
  fs.mkdirSync('dist', { recursive: true });
  fs.mkdirSync('dist/js', { recursive: true });
  fs.mkdirSync('dist/css', { recursive: true });

  const entryPoint = fs.existsSync('js/main.ts') ? 'js/main.ts' : 'js/main.js';

  const buildOptions = {
    entryPoints: [entryPoint],
    bundle: true,
    outfile: 'dist/js/app.bundle.js',
    format: 'esm',
    platform: 'browser',
    target: ['es2020'],
    sourcemap: isProduction ? 'external' : 'linked',
    minify: isProduction,
    define: {
      'process.env.VERSION': JSON.stringify(VERSION),
      'process.env.NODE_ENV': JSON.stringify(isProduction ? 'production' : 'development'),
    },
    banner: {
      js: `// BreakCheck v${VERSION} - Built ${process.env.SOURCE_DATE_EPOCH ? new Date(parseInt(process.env.SOURCE_DATE_EPOCH, 10) * 1000).toISOString() : new Date().toISOString()}\n`,
    },
    logLevel: 'info',
  };

  if (isWatch) {
    const context = await esbuild.context(buildOptions);
    await context.watch();
    console.log('Watching for changes...');
  } else {
    const result = await esbuild.build({ ...buildOptions, metafile: true });
    if (isProduction && result.metafile) {
      fs.writeFileSync('dist/meta.json', JSON.stringify(result.metafile));
      const text = await esbuild.analyzeMetafile(result.metafile, { verbose: false });
      console.log('\nBundle analysis:\n' + text);
    }
  }

  console.log('Copying static assets...');
  const processedHtml = processIndexHtml();
  fs.writeFileSync('dist/index.html', processedHtml);

  if (fs.existsSync('css')) copyRecursive('css', 'dist/css');
  if (fs.existsSync('icon.svg')) fs.copyFileSync('icon.svg', 'dist/icon.svg');

  if (fs.existsSync('manifest.json')) {
    const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
    if (process.env.MANIFEST_BASE_URL) manifest.baseUrl = process.env.MANIFEST_BASE_URL;
    fs.writeFileSync('dist/manifest.json', JSON.stringify(manifest, null, 2));
    // Also copy as extensionless "manifest" so static servers match
    // the Worker's /manifest → /manifest.json rewrite
    fs.copyFileSync('dist/manifest.json', 'dist/manifest');
  }

  console.log(`Build complete! Output in dist/`);
  console.log(`  Version: ${VERSION}`);
  console.log(`  Mode: ${isProduction ? 'production (minified)' : 'development'}`);
}

build().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
