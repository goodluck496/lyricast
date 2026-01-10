<?php
declare(strict_types=1);

require_once __DIR__ . '/cors.php';

/**
 * sqlite-api.php
 *
 * Endpoints:
 *  - GET  ?action=init&db=songs.sqlite
 *  - POST ?action=upsertBook&db=songs.sqlite        body: ISongBook JSON
 *  - GET  ?action=download&db=songs.sqlite
 *  - GET  ?action=listBooks&db=songs.sqlite
 *  - GET  ?action=exportBook&db=songs.sqlite&fileKey=...
 *
 * Notes:
 *  - Requires PDO_SQLITE enabled.
 *  - Stores DB files in ./data/
 */


date_default_timezone_set('Asia/Bishkek');

api_setup_cors();
api_handle_options_preflight();

const DATA_DIR = __DIR__ . DIRECTORY_SEPARATOR . 'data';
const DB_NAME_REGEX = '/^[a-zA-Z0-9._-]+\.sqlite$/';
const MAX_BODY_BYTES = 50 * 1024 * 1024; // 50MB request body cap
// -------------------- helpers --------------------

function ensure_dir(string $path): void {
  if (!is_dir($path)) {
    if (!@mkdir($path, 0775, true) && !is_dir($path)) {
      http_response_code(500);
      exit('Cannot create data dir');
    }
  }
}

function json_response(array $data, int $status = 200): void {
  http_response_code($status);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}

function get_db_path(): string {
  $db = $_GET['db'] ?? 'songs.sqlite';
  $db = (string)$db;

  if (!preg_match(DB_NAME_REGEX, $db)) {
    json_response(['ok' => false, 'error' => 'Bad db name. Use *.sqlite with [a-zA-Z0-9._-]'], 400);
  }
  ensure_dir(DATA_DIR);
  return DATA_DIR . DIRECTORY_SEPARATOR . $db;
}

function pdo_sqlite(string $dbPath): PDO {
  $pdo = new PDO('sqlite:' . $dbPath, null, null, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
  ]);
  // WAL improves concurrency for read/write patterns
  $pdo->exec('PRAGMA journal_mode = WAL;');
  $pdo->exec('PRAGMA synchronous = NORMAL;');
  $pdo->exec('PRAGMA foreign_keys = ON;');
  return $pdo;
}

function read_json_body(): array {
  $len = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
  if ($len > MAX_BODY_BYTES) {
    json_response(['ok' => false, 'error' => 'Body too large'], 413);
  }
  $raw = file_get_contents('php://input');
  if ($raw === false || $raw === '') {
    json_response(['ok' => false, 'error' => 'Empty body'], 400);
  }
  $data = json_decode($raw, true);
  if (!is_array($data)) {
    json_response(['ok' => false, 'error' => 'Invalid JSON body'], 400);
  }
  return $data;
}

function assert_str($v, string $field, string $default = ''): string
{
  if ($v === null) {
    return $default;
  }

  if (!is_string($v)) {
    json_response(
      ['ok' => false, 'error' => "Field '$field' must be string"],
      400
    );
  }

  return $v;
}
function assert_int($v, string $field): int {
  if (!is_int($v)) json_response(['ok' => false, 'error' => "Field '$field' must be int"], 400);
  return $v;
}
function opt_str($v): ?string { return is_string($v) ? $v : null; }
function opt_int($v): ?int { return is_int($v) ? $v : null; }
function assert_array($v, string $field): array {
  if (!is_array($v)) json_response(['ok' => false, 'error' => "Field '$field' must be array"], 400);
  return $v;
}

// -------------------- schema --------------------

function init_schema(PDO $pdo): void {
  $pdo->exec(<<<SQL
CREATE TABLE IF NOT EXISTS song_books (
  file_key     TEXT PRIMARY KEY,          -- ISongBookName.fileKey
  human_name   TEXT NOT NULL,             -- ISongBookName.humanName

  header_number   TEXT NOT NULL,          -- ISongBookHeader.number (string)
  header_title    TEXT NOT NULL,
  header_author   TEXT NOT NULL,
  header_updated_at TEXT NOT NULL,        -- ISO string
  header_book_key TEXT NOT NULL,          -- ISongBookHeader.bookKey
  header_disabled INTEGER NOT NULL        -- 0/1
);

CREATE TABLE IF NOT EXISTS songs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  book_file_key TEXT NOT NULL,            -- FK -> song_books.file_key

  number        INTEGER NOT NULL,
  title         TEXT NOT NULL,
  song_key      TEXT NOT NULL,            -- ISong.key
  key_signature TEXT NOT NULL,
  author        TEXT NOT NULL,
  ref           TEXT NULL,
  category      TEXT NULL,

  UNIQUE(book_file_key, number),
  FOREIGN KEY(book_file_key) REFERENCES song_books(file_key) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_songs_book ON songs(book_file_key);
CREATE INDEX IF NOT EXISTS idx_songs_title ON songs(title);

CREATE TABLE IF NOT EXISTS song_meta (
  song_id   INTEGER NOT NULL,
  idx       INTEGER NOT NULL,
  value     TEXT NOT NULL,

  PRIMARY KEY(song_id, idx),
  FOREIGN KEY(song_id) REFERENCES songs(id) ON DELETE CASCADE
);

-- Lyric = секция песни (куплет/припев/и т.п.)
CREATE TABLE IF NOT EXISTS lyrics (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  song_id         INTEGER NOT NULL,
  uniq_id         TEXT NOT NULL,           -- Lyric.uniqId
  section_title   TEXT NOT NULL,           -- Lyric.sectionTitle
  type            TEXT NOT NULL,           -- LyricTypeEnum
  split_lines_count INTEGER NOT NULL,      -- Lyric.splitLinesCount
  sort_index      INTEGER NOT NULL,        -- порядок в песне

  UNIQUE(song_id, uniq_id),
  FOREIGN KEY(song_id) REFERENCES songs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_lyrics_song ON lyrics(song_id);
CREATE INDEX IF NOT EXISTS idx_lyrics_type ON lyrics(type);

-- LyricLine (для casting) / либо просто строки lyric.lines (raw) тоже сюда
CREATE TABLE IF NOT EXISTS lyric_lines (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  lyric_id        INTEGER NOT NULL,

  range_index     TEXT NULL,               -- LyricLine.rangeIndex
  line_index      INTEGER NOT NULL,        -- LyricLine.index (или позиция строки)
  global_song_index INTEGER NULL,          -- LyricLine.globalSongIndex
  text            TEXT NOT NULL,
  repeat_count    INTEGER NOT NULL DEFAULT 1, -- сколько раз строка повторяется

  UNIQUE(lyric_id, line_index),
  FOREIGN KEY(lyric_id) REFERENCES lyrics(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_lines_lyric ON lyric_lines(lyric_id);

-- Метаданные датасета (для синка)
CREATE TABLE IF NOT EXISTS dataset_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  schema_version INTEGER NOT NULL,
  version TEXT NOT NULL,                   -- произвольная версия/etag
  updated_at TEXT NOT NULL                 -- ISO string
);

INSERT OR IGNORE INTO dataset_meta (id, schema_version, version, updated_at)
VALUES (1, 1, 'init', datetime('now'));

-- Статистика использования песен
CREATE TABLE IF NOT EXISTS song_usage (
  song_id              INTEGER PRIMARY KEY, -- 1:1 к songs.id
  last_played_at       TEXT NULL,           -- ISO string
  avg_duration_seconds INTEGER NULL,        -- среднее время исполнения в секундах
  play_count           INTEGER NOT NULL DEFAULT 0,

  FOREIGN KEY(song_id) REFERENCES songs(id) ON DELETE CASCADE
);

-- Метаданные книги (title/source/language/description/coverImage etc)
CREATE TABLE IF NOT EXISTS song_book_meta (
  file_key    TEXT NOT NULL,
  meta_key    TEXT NOT NULL,
  meta_value  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,

  PRIMARY KEY(file_key, meta_key),
  FOREIGN KEY(file_key) REFERENCES song_books(file_key) ON DELETE CASCADE
);
SQL);
}

function upsert_song_book_meta(PDO $pdo, string $fileKey, array $meta): void {
  $stmtSel = $pdo->prepare('SELECT COUNT(*) FROM song_book_meta WHERE file_key = :fk AND meta_key = :k');
  $stmtUpd = $pdo->prepare('UPDATE song_book_meta SET meta_value = :v, updated_at = :t WHERE file_key = :fk AND meta_key = :k');
  $stmtIns = $pdo->prepare('INSERT INTO song_book_meta (file_key, meta_key, meta_value, updated_at) VALUES (:fk, :k, :v, :t)');
  $now = gmdate('c');

  foreach ($meta as $k => $v) {
    if (!is_string($k) || $k === '') continue;
    if (!is_string($v) || $v === '') continue;

    $stmtSel->execute([':fk' => $fileKey, ':k' => $k]);
    $exists = (int)$stmtSel->fetchColumn() > 0;
    $params = [':fk' => $fileKey, ':k' => $k, ':v' => $v, ':t' => $now];
    if ($exists) {
      $stmtUpd->execute($params);
    } else {
      $stmtIns->execute($params);
    }
  }
}

function bump_dataset_version(PDO $pdo): void {
  $ver = bin2hex(random_bytes(8));
  $now = gmdate('c');
  $stmt = $pdo->prepare('UPDATE dataset_meta SET version = :v, updated_at = :t WHERE id = 1');
  $stmt->execute([':v' => $ver, ':t' => $now]);
}

// -------------------- upsert logic --------------------

/**
 * Upsert one ISongBook (header + songs + lyrics + lines/meta).
 *
 * Expected JSON body (пример):
 * {
 *   "header": { ... },
 *   "songs": [ ... ]
 * }
 * + в каждой песне поле bookName: { fileKey, humanName }
 */
function upsert_book(PDO $pdo, array $book): array {
  $header = assert_array($book['header'] ?? null, 'header');
  $songs  = assert_array($book['songs'] ?? null, 'songs');

  // bookName берём из первой песни, иначе — требуем отдельно (но у тебя оно в ISong)
  $firstSong = $songs[0] ?? null;
  if (!is_array($firstSong) || !isset($firstSong['bookName'])) {
    json_response(['ok' => false, 'error' => 'songs[0].bookName is required'], 400);
  }
  $bn = assert_array($firstSong['bookName'], 'songs[0].bookName');
  $fileKey = assert_str($bn['fileKey'] ?? null, 'bookName.fileKey');
  $humanName = assert_str($bn['humanName'] ?? null, 'bookName.humanName');

  $header_number = assert_str($header['number'] ?? null, 'header.number');
  $header_title = assert_str($header['title'] ?? null, 'header.title');
  $header_author = assert_str($header['author'] ?? null, 'header.author', '');
  // При импорте всегда используем текущее время, а не timestamp из справочника
  $header_updated_at = gmdate('c');
  $header_book_key = assert_str($header['bookKey'] ?? null, 'header.bookKey', '');
  $header_disabled = ($header['disabled'] ?? false) ? 1 : 0;

  $pdo->beginTransaction();
  try {
    // Upsert book (совместимо с SQLite < 3.24)
    $stmtBookSelect = $pdo->prepare('SELECT COUNT(*) FROM song_books WHERE file_key = :file_key');
    $stmtBookUpdate = $pdo->prepare(<<<SQL
UPDATE song_books
SET
  human_name = :human_name,
  header_number = :hn,
  header_title = :ht,
  header_author = :ha,
  header_updated_at = :hu,
  header_book_key = :hb,
  header_disabled = :hd
WHERE file_key = :file_key
SQL);
    $stmtBookInsert = $pdo->prepare(<<<SQL
INSERT INTO song_books (
  file_key, human_name,
  header_number, header_title, header_author, header_updated_at, header_book_key, header_disabled
) VALUES (
  :file_key, :human_name,
  :hn, :ht, :ha, :hu, :hb, :hd
)
SQL);

    $commonBookParams = [
      ':file_key' => $fileKey,
      ':human_name' => $humanName,
      ':hn' => $header_number,
      ':ht' => $header_title,
      ':ha' => $header_author,
      ':hu' => $header_updated_at,
      ':hb' => $header_book_key,
      ':hd' => $header_disabled,
    ];

    $stmtBookSelect->execute([':file_key' => $fileKey]);
    $existsBook = (int)$stmtBookSelect->fetchColumn() > 0;
    if ($existsBook) {
      $stmtBookUpdate->execute($commonBookParams);
    } else {
      $stmtBookInsert->execute($commonBookParams);
    }

    // Prepared statements reused (songs)
    $stmtSongSelect = $pdo->prepare('SELECT id FROM songs WHERE book_file_key = :bfk AND number = :num');
    $stmtSongUpdate = $pdo->prepare(<<<SQL
UPDATE songs
SET
  title = :title,
  song_key = :skey,
  key_signature = :ks,
  author = :author,
  ref = :ref,
  category = :cat
WHERE book_file_key = :bfk AND number = :num
SQL);
    $stmtSongInsert = $pdo->prepare(<<<SQL
INSERT INTO songs (
  book_file_key, number, title, song_key, key_signature, author, ref, category
) VALUES (
  :bfk, :num, :title, :skey, :ks, :author, :ref, :cat
)
SQL);

    $stmtSongId = $pdo->prepare('SELECT id FROM songs WHERE book_file_key = :bfk AND number = :num');

    $stmtMetaDel = $pdo->prepare('DELETE FROM song_meta WHERE song_id = :sid');
    $stmtMetaIns = $pdo->prepare('INSERT INTO song_meta (song_id, idx, value) VALUES (:sid, :idx, :val)');

    // Prepared statements reused (lyrics)
    $stmtLyricSelect = $pdo->prepare('SELECT id FROM lyrics WHERE song_id = :sid AND uniq_id = :uid');
    $stmtLyricUpdate = $pdo->prepare(<<<SQL
UPDATE lyrics
SET
  section_title = :st,
  type = :type,
  split_lines_count = :spl,
  sort_index = :si
WHERE song_id = :sid AND uniq_id = :uid
SQL);
    $stmtLyricInsert = $pdo->prepare(<<<SQL
INSERT INTO lyrics (
  song_id, uniq_id, section_title, type, split_lines_count, sort_index
) VALUES (
  :sid, :uid, :st, :type, :spl, :si
)
SQL);

    $stmtLyricId = $pdo->prepare('SELECT id FROM lyrics WHERE song_id = :sid AND uniq_id = :uid');

    $stmtLinesDel = $pdo->prepare('DELETE FROM lyric_lines WHERE lyric_id = :lid');
    $stmtLineIns = $pdo->prepare(<<<SQL
INSERT INTO lyric_lines (lyric_id, range_index, line_index, global_song_index, text)
VALUES (:lid, :ri, :li, :gsi, :txt)
SQL);

    $songsCount = 0;
    $lyricsCount = 0;
    $linesCount = 0;

    foreach ($songs as $s) {
      $s = assert_array($s, 'song');

      // bookName consistency
      $bn2 = assert_array($s['bookName'] ?? null, 'song.bookName');
      $fk2 = assert_str($bn2['fileKey'] ?? null, 'song.bookName.fileKey');
      if ($fk2 !== $fileKey) {
        json_response(['ok' => false, 'error' => 'All songs in book must share same bookName.fileKey'], 400);
      }

      $number = assert_int($s['number'] ?? null, 'song.number');
      $title = assert_str($s['title'] ?? null, 'song.title');
      $songKey = assert_str($s['key'] ?? null, 'song.key');
      $keySignature = assert_str($s['keySignature'] ?? null, 'song.keySignature');
      $author = assert_str($s['author'] ?? null, 'song.author');
      $ref = opt_str($s['ref'] ?? null);
      $cat = opt_str($s['category'] ?? null);

      $songParams = [
        ':bfk' => $fileKey,
        ':num' => $number,
        ':title' => $title,
        ':skey' => $songKey,
        ':ks' => $keySignature,
        ':author' => $author,
        ':ref' => $ref,
        ':cat' => $cat,
      ];

      $stmtSongSelect->execute([
        ':bfk' => $fileKey,
        ':num' => $number,
      ]);
      $existingSongId = $stmtSongSelect->fetchColumn();
      if ($existingSongId !== false) {
        $stmtSongUpdate->execute($songParams);
      } else {
        $stmtSongInsert->execute($songParams);
      }

      $stmtSongId->execute([':bfk' => $fileKey, ':num' => $number]);
      $sid = (int)($stmtSongId->fetchColumn() ?: 0);
      if ($sid <= 0) throw new RuntimeException('Failed to resolve song id');
      $songsCount++;

      // meta: проще пересоздавать (строки небольшие)
      $meta = $s['meta'] ?? [];
      $meta = is_array($meta) ? $meta : [];
      $stmtMetaDel->execute([':sid' => $sid]);
      $mi = 0;
      foreach ($meta as $mv) {
        if (!is_string($mv)) continue;
        $stmtMetaIns->execute([':sid' => $sid, ':idx' => $mi, ':val' => $mv]);
        $mi++;
      }

      // lyrics
      $lyrics = assert_array($s['lyrics'] ?? null, 'song.lyrics');
      $li = 0;
      foreach ($lyrics as $ly) {
        $ly = assert_array($ly, 'lyric');

        $uniqId = assert_str($ly['uniqId'] ?? null, 'lyric.uniqId');
        $sectionTitle = assert_str($ly['sectionTitle'] ?? null, 'lyric.sectionTitle');
        $type = assert_str($ly['type'] ?? null, 'lyric.type', 'COUPLET'); // COUPLET/CHORUS/PUBLIC/END
        $splitLinesCount = is_int($ly['splitLinesCount'] ?? null) ? (int)$ly['splitLinesCount'] : 0;

        $lyricParams = [
          ':sid' => $sid,
          ':uid' => $uniqId,
          ':st' => $sectionTitle,
          ':type' => $type,
          ':spl' => $splitLinesCount,
          ':si' => $li,
        ];

        $stmtLyricSelect->execute([
          ':sid' => $sid,
          ':uid' => $uniqId,
        ]);
        $existingLyricId = $stmtLyricSelect->fetchColumn();
        if ($existingLyricId !== false) {
          $stmtLyricUpdate->execute($lyricParams);
        } else {
          $stmtLyricInsert->execute($lyricParams);
        }

        $stmtLyricId->execute([':sid' => $sid, ':uid' => $uniqId]);
        $lid = (int)($stmtLyricId->fetchColumn() ?: 0);
        if ($lid <= 0) throw new RuntimeException('Failed to resolve lyric id');
        $lyricsCount++;

        // lines:
        // - if Lyric has `lines: string[]` => store as lyric_lines with line_index
        // - if you pass LyricForCasting-style `lines: LyricLine[]` => store rich fields
        $stmtLinesDel->execute([':lid' => $lid]);

        $lines = $ly['lines'] ?? [];
        if (!is_array($lines)) $lines = [];

        $lineIndex = 0;
        foreach ($lines as $ln) {
          if (is_string($ln)) {
            $stmtLineIns->execute([
              ':lid' => $lid,
              ':ri' => null,
              ':li' => $lineIndex,
              ':gsi' => null,
              ':txt' => $ln,
            ]);
            $lineIndex++;
            $linesCount++;
            continue;
          }

          // support LyricLine objects too
          if (is_array($ln)) {
            $rangeIndex = opt_str($ln['rangeIndex'] ?? null);
            $idx = opt_int($ln['index'] ?? null);
            $gsi = opt_int($ln['globalSongIndex'] ?? null);
            $text = opt_str($ln['text'] ?? null);

            if ($text === null) continue;
            $stmtLineIns->execute([
              ':lid' => $lid,
              ':ri' => $rangeIndex,
              ':li' => $idx ?? $lineIndex,
              ':gsi' => $gsi,
              ':txt' => $text,
            ]);
            $lineIndex++;
            $linesCount++;
          }
        }

        $li++;
      }
    }

    bump_dataset_version($pdo);
    $pdo->commit();

    return [
      'ok' => true,
      'book' => $fileKey,
      'songs' => $songsCount,
      'lyrics' => $lyricsCount,
      'lines' => $linesCount,
    ];
  } catch (Throwable $e) {
    $pdo->rollBack();
    return ['ok' => false, 'error' => $e->getMessage()];
  }
}

// -------------------- export logic --------------------

function export_book(PDO $pdo, string $fileKey): array {
  // book
  $stmt = $pdo->prepare('SELECT * FROM song_books WHERE file_key = :k');
  $stmt->execute([':k' => $fileKey]);
  $b = $stmt->fetch();
  if (!$b) return ['ok' => false, 'error' => 'Book not found'];

  // Fetch book metadata from song_book_meta table
  $metaStmt = $pdo->prepare('SELECT meta_key, meta_value FROM song_book_meta WHERE file_key = :fk');
  $metaStmt->execute([':fk' => $fileKey]);
  $bookMeta = [];
  while ($m = $metaStmt->fetch()) {
    $bookMeta[$m['meta_key']] = $m['meta_value'];
  }

  $out = [
    'header' => [
      'number' => $b['header_number'],
      'title' => $b['header_title'],
      'author' => $b['header_author'],
      'updatedAt' => $b['header_updated_at'],
      'bookKey' => $b['header_book_key'],
      'disabled' => ((int)$b['header_disabled']) === 1,
    ],
    'meta' => $bookMeta,
    'songs' => [],
  ];

  $bookName = [
    'fileKey' => $b['file_key'],
    'humanName' => $b['human_name'],
  ];

  $songs = $pdo->prepare('SELECT * FROM songs WHERE book_file_key = :k ORDER BY number');
  $songs->execute([':k' => $fileKey]);

  $metaStmt = $pdo->prepare('SELECT idx, value FROM song_meta WHERE song_id = :sid ORDER BY idx');
  $lyricsStmt = $pdo->prepare('SELECT * FROM lyrics WHERE song_id = :sid ORDER BY sort_index');
  $linesStmt = $pdo->prepare('SELECT id, range_index, line_index, global_song_index, text FROM lyric_lines WHERE lyric_id = :lid ORDER BY line_index');

  while ($s = $songs->fetch()) {
    $sid = (int)$s['id'];

    $metaStmt->execute([':sid' => $sid]);
    $meta = [];
    while ($m = $metaStmt->fetch()) $meta[] = $m['value'];

    $lyricsStmt->execute([':sid' => $sid]);
    $lyrics = [];
    while ($ly = $lyricsStmt->fetch()) {
      $lid = (int)$ly['id'];

      $linesStmt->execute([':lid' => $lid]);
      $lines = [];
      while ($ln = $linesStmt->fetch()) {
        // экспортируем как объекты LyricLine (id/songId/rangeIndex/index/globalSongIndex/text)
        $lines[] = [
          'id' => (int)$ln['id'],
          'songId' => (string)$s['number'],
          'rangeIndex' => $ln['range_index'],
          'index' => (int)$ln['line_index'],
          'globalSongIndex' => $ln['global_song_index'] !== null ? (int)$ln['global_song_index'] : null,
          'text' => $ln['text'],
        ];
      }

      $lyrics[] = [
        'songId' => (string)$s['number'], // у тебя string; на клиенте можешь маппить как хочешь
        'uniqId' => $ly['uniq_id'],
        'sectionTitle' => $ly['section_title'],
        'type' => $ly['type'],
        'splitLinesCount' => (int)$ly['split_lines_count'],
        'lines' => $lines,
      ];
    }

    $out['songs'][] = [
      'number' => (int)$s['number'],
      'title' => $s['title'],
      'key' => $s['song_key'],
      'keySignature' => $s['key_signature'],
      'author' => $s['author'],
      'meta' => $meta,
      'lyrics' => $lyrics,
      'ref' => $s['ref'],
      'category' => $s['category'],
      'bookName' => $bookName,
    ];
  }

  return ['ok' => true, 'data' => $out];
}

// -------------------- routing --------------------

$action = (string)($_GET['action'] ?? '');

// Важно: если просто открыли страницу без action, не создаём пустую SQLite по умолчанию.
// Иначе после удаления файла он будет появляться снова сразу после редиректа.
if ($action === '' && $_SERVER['REQUEST_METHOD'] !== 'POST') {
  require_once __DIR__ . '/sqlite-files.php';
  
  ?>
  <!doctype html>
  <html lang="ru">
  <head>
    <meta charset="utf-8">
    <title>Upload ISongBook JSON → SQLite</title>
    <style>
      body {
        font-family: monospace;
        background: #111;
        color: #eee;
        padding: 24px;
      }
      form {
        max-width: 600px;
        border: 1px solid #333;
        padding: 16px;
        border-radius: 8px;
        background: #161616;
      }
      /* delete row style */
      form.delete-row {
        display:inline;
        border: none;
        padding: 0;
        background: initial;
        margin-left: 10px;
      }
      label {
        display: block;
        margin-top: 12px;
      }
      input, button {
        width: 100%;
        margin-top: 6px;
        padding: 8px;
        background: #222;
        color: #eee;
        border: 1px solid #444;
      }
      button {
        margin-top: 16px;
        cursor: pointer;
      }
      button:hover {
        background: #2a2a2a;
      }
      .hint {
        font-size: 12px;
        color: #aaa;
        margin-top: 8px;
      }
      /* Стили таблицы файлов как в sqlite-files.php */
      table {
        border-collapse: collapse;
        width: 100%;
        max-width: 900px;
        background: #161616;
        border: 1px solid #333;
      }
      th, td {
        padding: 8px 10px;
        border-bottom: 1px solid #333;
        font-size: 14px;
      }
      th {
        text-align: left;
        background: #1f1f1f;
      }
      a {
        color: #4ea1ff;
        text-decoration: none;
      }
      a:hover {
        text-decoration: underline;
      }
      .muted {
        color: #aaa;
        font-size: 12px;
      }
    </style>
  </head>
  <body>

    <h2>Загрузка ISongBook JSON → SQLite</h2>

    <form method="post" enctype="multipart/form-data"
          action="?action=uploadJsonToSqlite">
      <label>
        SQLite файл (будет создан, если нет):
        <input type="text" name="db" value="songs.sqlite" required>
      </label>

      <label>
        Название (meta.title):
        <input type="text" name="bookTitle" value="">
      </label>

      <label>
        Источник (meta.source):
        <input type="text" name="bookSource" value="">
      </label>

      <label>
        Язык (meta.language):
        <input type="text" name="bookLanguage" value="">
      </label>

      <label>
        Описание (meta.description):
        <input type="text" name="bookDescription" value="">
      </label>

      <label>
        Обложка (meta.coverImage) файлом:
        <input type="file" name="coverImageFile" accept="image/*">
      </label>

      <label>
        JSON файл (ISongBook):
        <input type="file" name="json" accept=".json,application/json" required>
      </label>

      <button type="submit">Загрузить в SQLite</button>

      <div class="hint">
        JSON должен соответствовать интерфейсу <b>ISongBook</b><br>
        (header + songs[])
      </div>
    </form>
    <?php render_sqlite_files_table(); ?>

  </body>
  </html>
  <?php
  exit;
}

$dbPath = get_db_path();

if ($action === 'init') {
  $pdo = pdo_sqlite($dbPath);
  init_schema($pdo);
  json_response(['ok' => true, 'db' => basename($dbPath)]);
}

if ($action === 'download') {
  if (!is_file($dbPath)) {
    http_response_code(404);

    // Небольшая диагностика: что именно ищем и какие файлы есть в каталоге data
    $dbNameTried = basename($dbPath);
    $dir = DATA_DIR;
    $files = is_dir($dir) ? (scandir($dir) ?: []) : [];
    $visible = [];
    foreach ($files as $f) {
      if ($f === '.' || $f === '..') continue;
      if (!is_file($dir . DIRECTORY_SEPARATOR . $f)) continue;
      $visible[] = $f;
    }

    header('Content-Type: text/html; charset=utf-8');
    echo '<h2>DB not found</h2>';
    echo '<p>Искали файл: <code>' . htmlspecialchars($dbNameTried, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</code></p>';
    echo '<p>Каталог: <code>' . htmlspecialchars(basename($dir), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</code></p>';
    echo '<p>Файлы, которые видит PHP в этом каталоге:</p>';
    if ($visible) {
      echo '<ul>';
      foreach ($visible as $vf) {
        echo '<li><code>' . htmlspecialchars($vf, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</code></li>';
      }
      echo '</ul>';
    } else {
      echo '<p><i>Каталог пуст или недоступен.</i></p>';
    }
    echo '<p>Подсказка: имя из параметра <code>db=</code> должно точно совпадать с именем файла.</p>';
    exit;
  }
  $name = basename($dbPath);
  header('Content-Type: application/octet-stream');
  header('Content-Disposition: attachment; filename="' . $name . '"');
  header('Content-Length: ' . filesize($dbPath));
  readfile($dbPath);
  exit;
}


if ($action === 'uploadJsonToSqlite') {
  if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(['ok' => false, 'error' => 'POST required'], 405);
  }

  $dbName = $_POST['db'] ?? 'songs.sqlite';
  $_GET['db'] = $dbName; // чтобы get_db_path() отработал как обычно
  $dbPath = get_db_path();

  if (!isset($_FILES['json']) || $_FILES['json']['error'] !== UPLOAD_ERR_OK) {
    json_response(['ok' => false, 'error' => 'JSON upload failed'], 400);
  }

  $tmp = $_FILES['json']['tmp_name'];
  $raw = file_get_contents($tmp);
  if ($raw === false) {
    json_response(['ok' => false, 'error' => 'Cannot read uploaded file'], 400);
  }

  $data = json_decode($raw, true);
  if (!is_array($data)) {
    json_response(['ok' => false, 'error' => 'Invalid JSON file'], 400);
  }

  $pdo = pdo_sqlite($dbPath);
  init_schema($pdo);

  $res = upsert_book($pdo, $data);

  if (($res['ok'] ?? false) && isset($res['book']) && is_string($res['book']) && $res['book'] !== '') {
    $fileKey = (string)$res['book'];
    $metaToSave = [];

    $bookTitle = $_POST['bookTitle'] ?? '';
    $bookSource = $_POST['bookSource'] ?? '';
    $bookLanguage = $_POST['bookLanguage'] ?? '';
    $bookDescription = $_POST['bookDescription'] ?? '';

    if (is_string($bookTitle) && trim($bookTitle) !== '') $metaToSave['title'] = trim($bookTitle);
    if (is_string($bookSource) && trim($bookSource) !== '') $metaToSave['source'] = trim($bookSource);
    if (is_string($bookLanguage) && trim($bookLanguage) !== '') $metaToSave['language'] = trim($bookLanguage);
    if (is_string($bookDescription) && trim($bookDescription) !== '') $metaToSave['description'] = trim($bookDescription);

    if (isset($_FILES['coverImageFile']) && is_array($_FILES['coverImageFile']) && ($_FILES['coverImageFile']['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_OK) {
      $tmpCover = (string)($_FILES['coverImageFile']['tmp_name'] ?? '');
      if ($tmpCover !== '' && is_file($tmpCover)) {
        $bin = file_get_contents($tmpCover);
        if (is_string($bin) && $bin !== '') {
          $mime = (string)($_FILES['coverImageFile']['type'] ?? '');
          if ($mime === '') {
            $finfo = function_exists('finfo_open') ? finfo_open(FILEINFO_MIME_TYPE) : false;
            if ($finfo) {
              $detected = finfo_file($finfo, $tmpCover);
              finfo_close($finfo);
              if (is_string($detected) && $detected !== '') $mime = $detected;
            }
          }
          if ($mime === '') $mime = 'application/octet-stream';

          $metaToSave['coverImage'] = 'data:' . $mime . ';base64,' . base64_encode($bin);
        }
      }
    }

    if ($metaToSave) {
      try {
        $pdo->beginTransaction();
        upsert_song_book_meta($pdo, $fileKey, $metaToSave);
        bump_dataset_version($pdo);
        $pdo->commit();
      } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        // импорт книги не заваливаем из-за метаданных
        $res['metaWarning'] = $e->getMessage();
      }
    }
  }

  header('Content-Type: text/html; charset=utf-8');
  echo '<pre>';
  echo htmlspecialchars(json_encode($res, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
  echo '</pre>';
  echo '<p><a href="sqlite-creator.php">← Назад</a></p>';
  exit;
}


if ($action === 'upsertBook') {
  $pdo = pdo_sqlite($dbPath);
  init_schema($pdo);
  if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_response(['ok' => false, 'error' => 'POST required'], 405);
  $book = read_json_body();
  $res = upsert_book($pdo, $book);
  json_response($res, $res['ok'] ? 200 : 400);
}

if ($action === 'listBooks') {
  $pdo = pdo_sqlite($dbPath);
  init_schema($pdo);
  $rows = $pdo->query('SELECT file_key, human_name, header_title, header_updated_at, header_disabled FROM song_books ORDER BY file_key')->fetchAll();
  $meta = $pdo->query('SELECT schema_version, version, updated_at FROM dataset_meta WHERE id=1')->fetch();
  json_response(['ok' => true, 'dataset' => $meta, 'books' => $rows]);
}

if ($action === 'exportBook') {
  $pdo = pdo_sqlite($dbPath);
  init_schema($pdo);
  $fileKey = (string)($_GET['fileKey'] ?? '');

  if ($fileKey === '') {
    // Если fileKey не указан, пробуем авто-выбор: одна единственная книга в song_books
    $rows = $pdo->query('SELECT file_key FROM song_books ORDER BY file_key')->fetchAll();
    if (count($rows) === 1) {
      $fileKey = (string)$rows[0]['file_key'];
    } else {
      json_response([
        'ok' => false,
        'error' => 'fileKey required',
        'availableFileKeys' => array_map(static fn($r) => $r['file_key'], $rows),
      ], 400);
    }
  }

  $res = export_book($pdo, $fileKey);
  if (!$res['ok']) {
    json_response($res, 404);
  }
  // Возвращаем напрямую данные книги без обёртки ok/data
  json_response($res['data']);
}

json_response([
  'ok' => false,
  'error' => 'Unknown action',
  'actions' => [
    'GET  ?action=init&db=songs.sqlite',
    'POST ?action=upsertBook&db=songs.sqlite',
    'GET  ?action=download&db=songs.sqlite',
    'GET  ?action=listBooks&db=songs.sqlite',
    'GET  ?action=exportBook&db=songs.sqlite&fileKey=...',
  ],
], 400);
