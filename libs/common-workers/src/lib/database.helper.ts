
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

  let dbPath: string;
  let isNewDb = false;

  if (isPackaged) {
    // PRODUCTION LOGIC
    const destinationDbPath = path.join(userDataPath, 'databases', dbName);

    if (!fs.existsSync(destinationDbPath)) {
      isNewDb = true;
      const destinationDir = path.dirname(destinationDbPath);
      if (!fs.existsSync(destinationDir)) {
        fs.mkdirSync(destinationDir, { recursive: true });
      }

      if (copyFromSourceInProd) {
        const sourceDbPathFull = path.join(sourceDataPath, 'assets', 'databases', dbName);

        if (fs.existsSync(sourceDbPathFull)) {
          fs.copyFileSync(sourceDbPathFull, destinationDbPath);
          isNewDb = false;
        }
      }
    }
    dbPath = destinationDbPath;
  } else {
    // DEVELOPMENT LOGIC
    dbPath = path.resolve(sourceDataPath, 'data', dbName);
    if (!fs.existsSync(dbPath)) {
      isNewDb = true;
    }
  }

  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  return { dbPath, isNewDb };
}
