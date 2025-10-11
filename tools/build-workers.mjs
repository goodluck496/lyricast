import esbuild from 'esbuild';

console.log('build workers?');

const isWatch = process.argv.includes('--watch');

const common = {
  // укажи конкретные файлы-воркеры
  entryPoints: ['apps/electron/src/**/workers/*.worker.ts'],
  outdir: 'dist/apps/electron/workers',
  platform: 'node',
  format: 'cjs',
  target: 'node22', // Node версии твоего Electron
  bundle: true, // тянем код из libs/**
  sourcemap: isWatch,
  external: ['better-sqlite3', 'bindings'], // нативный модуль вне бандла
  tsconfig: 'tsconfig.esbuild.json', // см. пункт 3
};

if (isWatch) {
  const ctx = await esbuild.context(common);
  await ctx.watch();
  console.log('[workers] esbuild watch started');
} else {
  await esbuild.build(common);
  console.log('[workers] bundled');
}
