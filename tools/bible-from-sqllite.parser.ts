import * as fs from 'fs';
import * as path from 'path';
import { parseMyBibleSqlite } from '../libs/common/src/lib/bible/mybible-sqlite-parser';

async function processSqliteFile(sqlitePath: string, outputDir: string) {
  const fileBuffer = fs.readFileSync(sqlitePath);
  const translate = await parseMyBibleSqlite(fileBuffer);

  const fileName = `${translate.keyForSearch}.bible.json`;
  const fullOutputPath = path.resolve(outputDir, fileName);

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(fullOutputPath, JSON.stringify(translate, null, 2), 'utf8');

  console.log(`Создан файл: ${fullOutputPath}`);
}

async function main() {
  const projectRoot = process.cwd();
  const sqliteDir = path.resolve(projectRoot, 'assets', 'raw', 'bibles', 'sqlite');
  const outputDir = path.resolve(projectRoot, 'assets', 'complete-jsons', 'bibles');

  if (!fs.existsSync(sqliteDir)) {
    console.error('Директория с SQLite файлами не найдена:', sqliteDir);
    return;
  }

  const files = fs
    .readdirSync(sqliteDir)
    .filter((file) => file.toLowerCase().endsWith('.sqlite3') || file.toLowerCase().endsWith('.sqlite'));

  if (!files.length) {
    console.log('SQLite файлы не найдены в', sqliteDir);
    return;
  }

  for (const file of files) {
    const fullPath = path.resolve(sqliteDir, file);
    console.log('Обработка файла', fullPath);
    await processSqliteFile(fullPath, outputDir);
  }
}

main().catch((error) => {
  console.error('Ошибка при конвертации SQLite → JSON:', error);
});
