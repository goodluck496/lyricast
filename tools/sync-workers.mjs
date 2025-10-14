import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const WORKERS_PATH = path.join(ROOT, 'dist', 'apps', 'workers');
const ELECTRON_WORKERS_PATH = path.join(ROOT, 'dist', 'apps', 'electron', 'workers');

function copyDir(src, dst) {
  if (!fs.existsSync(src)) throw new Error(`src not found: ${src}`);
  fs.mkdirSync(dst, { recursive: true });

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

if (!fs.existsSync(WORKERS_PATH)) {
  console.error('[sync-workers] no dist/apps/workers found, skipping.');
  process.exit(1);
}

const workerNames = fs.readdirSync(WORKERS_PATH).filter((f) =>
  fs.statSync(path.join(WORKERS_PATH, f)).isDirectory()
);

if (workerNames.length === 0) {
  console.error('[sync-workers] no worker builds found.');
  process.exit(1);
}

for (const w of workerNames) {
  const from = path.join(WORKERS_PATH, w);
  const to = path.join(ELECTRON_WORKERS_PATH, w);
  console.log(`[sync-workers] ${from} -> ${to}`);
  copyDir(from, to);
}

console.log('[sync-workers] done');
