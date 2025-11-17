
import path from 'path';
import fs from 'fs';

export interface DbPathOptions {
  dbName: string;
  copyFromSourceInProd?: boolean;
}

export interface DbPathResult {
  dbPath: string;
  isNewDb: boolean;
}

export function getDbPath(options: DbPathOptions): DbPathResult {
  const { dbName, copyFromSourceInProd } = options;

  const isPackaged = process.env.IS_PACKAGED === 'true';
  const userDataPath = process.env.USER_DATA_PATH;
  const sourceDataPath = process.env.SOURCE_DATA_PATH;

  if (!sourceDataPath || !userDataPath) {
    throw new Error('Database paths are not configured. Required environment variables are missing.');
  }

  // Единственная "живая" точка хранения БД — внутри USER_DATA_PATH/databases,
  // как в dev, так и в prod. SOURCE_DATA_PATH используется только как источник шаблонной БД.
  const dbPath = path.join(userDataPath, 'databases', dbName);
  let isNewDb = false;

  if (!fs.existsSync(dbPath)) {
    isNewDb = true;
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    // В prod-режиме при желании можно скопировать стартовую БД из ресурсов.
    if (isPackaged && copyFromSourceInProd) {
      const sourceDbPathFull = path.join(sourceDataPath, 'assets', 'databases', dbName);

      if (fs.existsSync(sourceDbPathFull)) {
        // Avoid copying a file onto itself when source and destination are the same
        if (path.resolve(sourceDbPathFull) !== path.resolve(dbPath)) {
          fs.copyFileSync(sourceDbPathFull, dbPath);
        }
        // В этом случае база не считается "новой" — она уже содержит данные из шаблона.
        isNewDb = false;
      }
    }
  }

  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  return { dbPath, isNewDb };
}
