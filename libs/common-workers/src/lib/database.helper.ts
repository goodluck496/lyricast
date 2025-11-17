import path from 'path';
import fs from 'fs';

export interface DbPathOptions {
  dbName: string;
}

export interface DbPathResult {
  dbPath: string;
  isNewDb: boolean;
}

export function getDbPath(options: DbPathOptions): DbPathResult {
  const { dbName } = options;

  const userDataPath = process.env.USER_DATA_PATH;

  if (!userDataPath) {
    throw new Error('Database paths are not configured. Required environment variables are missing.');
  }

  // Единственная "живая" точка хранения БД — внутри USER_DATA_PATH/databases,
  // как в dev, так и в prod.
  const dbPath = path.join(userDataPath, 'databases', dbName);
  let isNewDb = false;

  if (!fs.existsSync(dbPath)) {
    isNewDb = true;
  }

  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  return { dbPath, isNewDb };
}
