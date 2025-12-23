import { existsSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';
import { getSourceDataPath } from './paths';

/**
 * Обеспечивает наличие распакованных переводов Библии в user-assets.
 *
 * В prod ожидается архив bibles.zip в:
 *   ${SOURCE_DATA_PATH}/assets/bibles.zip
 *
 * При первом запуске архив распаковывается в:
 *   ${SOURCE_DATA_PATH}/assets/complete-jsons/bibles
 */
export async function ensureBiblesUnpacked(): Promise<void> {
  const sourceRoot = getSourceDataPath();
  const targetDir = join(sourceRoot, 'assets', 'complete-jsons', 'bibles');

  console.log('[BiblesAssets] ensureBiblesUnpacked', {
    sourceRoot,
    targetDir,
  });

  // Если папка существует, проверяем, есть ли в ней *.bible.json.
  // Если есть хотя бы один файл перевода — считаем, что распаковка уже была.
  if (existsSync(targetDir)) {
    try {
      const files = readdirSync(targetDir);
      const hasBibles = files.some((f) => f.toLowerCase().endsWith('.bible.json'));
      if (hasBibles) {
        return;
      }
    } catch {
      // на ошибке чтения попробуем продолжить и распаковать заново
    }
  }

  // В проде архив кладётся в resources/assets/complete-jsons/bibles/bibles.zip
  const zipPath = join(targetDir, 'bibles.zip');

  console.log('[BiblesAssets] resolved paths', { sourceRoot, zipPath });

  if (!existsSync(zipPath)) {
    console.warn('[BiblesAssets] bibles.zip not found at', zipPath);
    return;
  }

  // Ленивая загрузка, чтобы не тянуть adm-zip, если архива нет
  const AdmZip = (await import('adm-zip')).default as any;

  mkdirSync(targetDir, { recursive: true });

  try {
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(targetDir, true);

    const extracted = readdirSync(targetDir);
    console.log('[BiblesAssets] Extracted bibles.zip to', targetDir, {
      files: extracted,
    });
  } catch (e) {
    console.error('[BiblesAssets] Failed to extract bibles.zip', e);
  }
}
