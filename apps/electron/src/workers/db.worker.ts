import Database from 'better-sqlite3';
let db;

export default async function (payload) {
  console.log('call', payload);
  switch (payload.type) {
    case 'init': {
      db = new Database(payload.dbPath);
      // db.pragma('journal_mode = WAL');
      // db.pragma('synchronous = NORMAL');

      return true;
    }
    case 'get:books': {
      try {
        const res = await db.prepare('select * from books');
        return res.all();
      } catch (e) {
        console.log('err', e);
      }
    }
  }
}
