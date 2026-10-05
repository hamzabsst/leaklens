import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

// The deployable source is already in dist. Validate it without a bundler,
// dependency installation, generated files, or network access.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const html = readFileSync(resolve(dist, 'index.html'), 'utf8');
function asset(path, base = dist) {
  if (/^(?:https?:|data:|#)/.test(path)) return;
  assert.ok(existsSync(resolve(base, path)), `Missing static asset: ${path}`);
}
for (const [, path] of html.matchAll(/(?:href|src)="([^"]+)"/g)) asset(path);
for (const [, path] of readFileSync(resolve(dist, 'styles.css'), 'utf8').matchAll(/url\("([^"]+)"\)/g)) asset(path);
for (const file of readdirSync(resolve(dist, 'js')).filter(name => name.endsWith('.js'))) {
  const path = resolve(dist, 'js', file);
  const result = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  for (const [, imported] of readFileSync(path, 'utf8').matchAll(/from ['"]([^'"]+)['"]/g)) asset(imported, dirname(path));
}
for (const font of ['Geist.woff2', 'GeistMono.woff2']) {
  assert.equal(readFileSync(resolve(dist, 'assets/fonts', font)).subarray(0, 4).toString(), 'wOF2');
}
console.log('Static build verified: JavaScript syntax, imports, assets, and fonts.');
