/**
 * Zip the contents of addon/ into releases/Ankicaster-<human_version>.ankiaddon.
 * Paths are rooted at the zip root (manifest.json, __init__.py, web/…), not addon/.
 * Run via `npm run package:addon` (builds first).
 */
import { createWriteStream, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZipArchive } from 'archiver';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const addonDir = path.join(root, 'addon');
const manifest = JSON.parse(readFileSync(path.join(addonDir, 'manifest.json'), 'utf8'));
const human = String(manifest.human_version ?? '').trim();
if (!human) {
  console.error('addon/manifest.json is missing human_version');
  process.exit(1);
}

const releasesDir = path.join(root, 'releases');
mkdirSync(releasesDir, { recursive: true });
const outPath = path.join(releasesDir, `Ankicaster-${human}.ankiaddon`);

const SKIP_DIRS = new Set(['__pycache__', 'test', 'tests', '__tests__']);

function excluded(relPosix) {
  const parts = relPosix.split('/');
  const base = parts[parts.length - 1];
  if (parts.some((part) => SKIP_DIRS.has(part))) return true;
  if (base === '.DS_Store' || base === 'meta.json') return true;
  if (base.endsWith('.pyc') || base.endsWith('.pyo')) return true;
  if (base.endsWith('.map')) return true;
  if (/\.(test|spec)\.[^.]+$/.test(base)) return true;
  if (/^test_/.test(base) || /_test\.py$/.test(base)) return true;
  return false;
}

function collect(dir, prefix, out) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
    if (excluded(rel)) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) collect(full, rel, out);
    else if (ent.isFile()) out.push({ full, rel });
  }
}

const files = [];
collect(addonDir, '', files);
files.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));

const required = ['manifest.json', '__init__.py', 'web/index.html'];
for (const name of required) {
  if (!files.some((file) => file.rel === name)) {
    console.error(`Refusing to pack: missing ${name} at archive root layout`);
    process.exit(1);
  }
}

const output = createWriteStream(outPath);
const archive = new ZipArchive({ zlib: { level: 9 } });

const finished = new Promise((resolve, reject) => {
  output.on('close', resolve);
  output.on('error', reject);
  archive.on('warning', (err) => {
    if (err.code !== 'ENOENT') reject(err);
    else console.warn(err.message);
  });
  archive.on('error', reject);
});

archive.pipe(output);
for (const file of files) archive.file(file.full, { name: file.rel });
await archive.finalize();
await finished;

const size = statSync(outPath).size;
console.log(`Wrote ${path.relative(root, outPath)} (${size} bytes, ${files.length} files)`);
