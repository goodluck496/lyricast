import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';

const projectRoot = process.cwd();

// ==========================================
// 1. ПОДГОТОВКА БИБЛИЙ (ТОЛЬКО СИНОДАЛЬНЫЙ)
// ==========================================
const biblesDir = path.resolve(projectRoot, 'assets', 'complete-jsons', 'bibles');
const biblesZipPath = path.resolve(biblesDir, 'bibles.zip');

console.log('[prepare-bundled-assets] 1. Подготовка переводов Библии...');

if (!fs.existsSync(biblesDir)) {
  fs.mkdirSync(biblesDir, { recursive: true });
}

const biblesFiles = fs.readdirSync(biblesDir);
const synodalFileName = biblesFiles.find((name) => {
  const lower = name.toLowerCase();
  return (
    lower.endsWith('.bible.json') &&
    (lower.includes('синодальный') || lower.includes('synodal') || lower.includes('rus_synodal'))
  );
});

if (synodalFileName) {
  const synodalPath = path.resolve(biblesDir, synodalFileName);
  console.log(`[prepare-bundled-assets] Найден Синодальный перевод: ${synodalFileName}`);

  const zip = new AdmZip();
  zip.addLocalFile(synodalPath);
  zip.writeZip(biblesZipPath);
  console.log(`[prepare-bundled-assets] bibles.zip пересоздан (только Синодальный перевод).`);

  // Удаляем любые другие переводы из папки
  let removedBibles = 0;
  for (const file of biblesFiles) {
    if (file === 'bibles.zip' || file === synodalFileName) continue;
    if (file.toLowerCase().endsWith('.bible.json')) {
      fs.unlinkSync(path.resolve(biblesDir, file));
      removedBibles++;
      console.log(`[prepare-bundled-assets] Удален лишний перевод: ${file}`);
    }
  }
  console.log(`[prepare-bundled-assets] Библии готовы: Синодальный перевод в поставке (удалено лишних: ${removedBibles}).`);
} else {
  console.warn('[prepare-bundled-assets] Внимание: файл Синодального перевода не найден в', biblesDir);
}

// ==========================================
// 2. ПОДГОТОВКА ПЕСЕН (ТОЛЬКО ПЕСНЬ ВОЗРОЖДЕНИЯ 3000)
// ==========================================
const songsDir = path.resolve(projectRoot, 'assets', 'complete-jsons', 'songs');
console.log('\n[prepare-bundled-assets] 2. Подготовка сборников песен...');

if (!fs.existsSync(songsDir)) {
  fs.mkdirSync(songsDir, { recursive: true });
}

const targetPesnFile = path.resolve(songsDir, 'pesn_vozrojdeniya.songs.json');

// Если в папке songs еще нет песни возрождения, ищем источник в tmp/songs или assets/raw
if (!fs.existsSync(targetPesnFile)) {
  const sourceCandidates = [
    path.resolve(projectRoot, 'tmp', 'songs', 'pesn_vozrojdeniya.songs.json'),
    path.resolve(projectRoot, 'assets', 'raw', 'songs', 'pesn_vozrojdeniya.songs.json'),
  ];

  const sourceFile = sourceCandidates.find((cand) => fs.existsSync(cand));
  if (sourceFile) {
    fs.copyFileSync(sourceFile, targetPesnFile);
    console.log(`[prepare-bundled-assets] Скопирован базовый сборник «Песнь возрождения» из ${sourceFile} в ${targetPesnFile}`);
  } else {
    console.warn('[prepare-bundled-assets] Внимание: исходный файл pesn_vozrojdeniya.songs.json не найден!');
  }
} else {
  console.log(`[prepare-bundled-assets] Базовый сборник «Песнь возрождения» уже присутствует: ${targetPesnFile}`);
}

// Удаляем любые другие сборники песен из assets/complete-jsons/songs/ (только Песнь возрождения должна быть в поставке)
const songsFiles = fs.readdirSync(songsDir);
let removedSongs = 0;
for (const file of songsFiles) {
  if (file === 'pesn_vozrojdeniya.songs.json') continue;
  if (file.toLowerCase().endsWith('.songs.json')) {
    fs.unlinkSync(path.resolve(songsDir, file));
    removedSongs++;
    console.log(`[prepare-bundled-assets] Удален лишний сборник песен: ${file}`);
  }
}

console.log(`[prepare-bundled-assets] Песни готовы: только «Песнь возрождения 3000» в поставке (удалено лишних: ${removedSongs}).`);
console.log('\n[prepare-bundled-assets] Все ассеты поставки успешно подготовлены!');
