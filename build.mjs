import { build } from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

await mkdir('dist/assets', { recursive: true });
await Promise.all([
  build({ entryPoints: ['src/views/index.jsx'], outfile: 'dist/views.js', bundle: true, format: 'esm', packages: 'external', platform: 'node', jsx: 'automatic' }),
  build({ entryPoints: ['src/views/client.jsx'], outfile: 'dist/assets/client.js', bundle: true, minify: true, format: 'esm', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } }),
  copyFile('node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2', 'dist/assets/geist.woff2'),
]);
execFileSync('node_modules/.bin/tailwindcss', ['-i', 'src/public/app.css', '-o', 'dist/assets/app.css', '--minify'], { stdio: 'inherit' });
