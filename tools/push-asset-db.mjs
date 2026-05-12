import pkg from 'electron';
const { app } = pkg;
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Инициализируем Electron app (без окна)
app.whenReady().then(() => {
  try {
    const userDataPath = app.getPath('userData');
    const dbPath = path.join(userDataPath, 'databases', 'assets.sqlite');
    
    console.log(`[PUSH] Pushing schema to: ${dbPath}`);
    
    // Устанавливаем переменную окружения для drizzle-kit
    process.env.ASSET_DB_PATH = dbPath;
    
    // Запускаем drizzle-kit push
    execSync('npx drizzle-kit push --config=drizzle.config.asset.ts', {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..'),
    });
    
    console.log('[PUSH] Schema pushed successfully');
  } catch (error) {
    console.error('[PUSH] Error pushing schema:', error);
    process.exit(1);
  } finally {
    app.quit();
  }
});
