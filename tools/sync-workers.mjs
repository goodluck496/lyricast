import fs from 'fs';
import path from 'path';

const WORKERS_PATH = path.join('dist', 'apps', 'workers');
const ELECTRON_WORKERS_PATH = path.join('dist', 'apps', 'electron', 'workers');

const ROOT = process.cwd();

const SRC_BASE = path.join(ROOT, WORKERS_PATH);
const DST_BASE = path.join(ROOT, ELECTRON_WORKERS_PATH);

const workerNames = fs.readdirSync(WORKERS_PATH);

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

for (const w of workerNames) {
  const from = path.join(SRC_BASE, w);
  const to = path.join(DST_BASE, w);
  console.log(`[sync-workers] ${from} -> ${to}`);
  copyDir(from, to);
}

console.log('[sync-workers] done');
