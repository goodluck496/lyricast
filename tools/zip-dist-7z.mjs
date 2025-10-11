import { exec } from '@actions/exec';
import progress from 'progress';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { path7za } from '7zip-bin';

console.log(process.cwd());

return;
// Конфигурация
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_PATH = path.join(__dirname, '..', 'dist');
const FOLDERS_TO_ZIP = ['win-ia32-unpacked']; // Папки для архивации
const USE_PARALLEL = true; // Параллельная архивация
const THREADS = 4; // Количество потоков 7-Zip

// Проверяем наличие 7-Zip
async function check7z() {
  try {
    await exec(path7za, ['--help']);
    return true;
  } catch (error) {
    console.error('7-Zip не запускается:', error);
    return false;
  }

  //
  // try {
  //   await exec('7z');
  //   return true;
  // } catch (error) {
  //   console.log(error);
  //   console.error('7-Zip не найден! Установите его:');
  //   console.log('Windows: https://www.7-zip.org/');
  //   console.log('Linux: sudo apt install p7zip-full');
  //   console.log('Mac: brew install p7zip');
  //   return false;
  // }
}

// Архивируем одну папку
async function zipFolder(folder) {
  const folderPath = path.join(DIST_PATH, folder);
  if (!fs.existsSync(folderPath)) {
    console.warn(`Папка "${folder}" не найдена, пропускаем.`);
    return;
  }

  // Ищем свободное имя архива
  let counter = 1;
  let zipPath;
  do {
    zipPath = path.join(DIST_PATH, `${folder}_${counter}.7z`);
    counter++;
  } while (fs.existsSync(zipPath));

  // Создаем прогресс-бар
  const bar = new progress(`Архивация ${folder} [:bar] :percent`, {
    width: 40,
    total: 100,
    complete: '=',
    incomplete: ' ',
  });

  // Запускаем 7-Zip с прогрессом
  await exec(
    path7za,
    [
      'a', // Команда "добавить"
      '-mmt=' + THREADS, // Многопоточность
      '-mx=5', // Уровень сжатия (1-9)
      '-bsp1', // Вывод прогресса
      '-bb3', // Подробный вывод
      zipPath, // Имя архива
      folderPath + '/*', // Что архивируем
    ],
    {
      listeners: {
        stdout: (data) => {
          const output = data.toString();
          // Парсим прогресс из вывода 7z (пример: "12%")
          const match = output.match(/(\d+)%/);
          if (match) bar.update(parseInt(match[1]) / 100);
        },
      },
    }
  );

  console.log(`Создан архив: ${zipPath}`);
}

// Основная функция
async function main() {
  if (!(await check7z())) return;

  if (USE_PARALLEL) {
    // Параллельная архивация
    await Promise.all(FOLDERS_TO_ZIP.map((folder) => zipFolder(folder)));
  } else {
    // Последовательная архивация
    for (const folder of FOLDERS_TO_ZIP) {
      await zipFolder(folder);
    }
  }

  console.log('Все архивы созданы!');
}

main()
  .catch(console.error)
  .then(() => {
    process.exit(0);
  });
