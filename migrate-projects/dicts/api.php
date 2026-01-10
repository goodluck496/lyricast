<?php
declare(strict_types=1);

// Простой корневой роутер API для Angular-клиента.
// Пример вызова: /api/api.php?action=ping

date_default_timezone_set('Asia/Bishkek');

require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/sqlite-files.php';
require_once __DIR__ . '/auth-lib.php';

api_setup_cors();
api_handle_options_preflight();

// Базовый helper для JSON-ответа
function api_response($data, int $status = 200): void {
  http_response_code($status);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

function api_error(string $message, int $status = 400, array $extra = []): void {
  api_response(['ok' => false, 'error' => $message] + $extra, $status);
}

function api_get_db_path_and_name(): array {
  $db = $_GET['db'] ?? 'songs.sqlite';
  $db = is_string($db) ? $db : '';

  if ($db === '' || !preg_match(DB_NAME_REGEX, $db)) {
    api_error('Bad db name. Use *.sqlite with [a-zA-Z0-9._-]', 400);
    exit;
  }

  $dir = DATA_DIR;
  if (!is_dir($dir)) {
    // Пытаемся создать каталог, как в ensure_dir
    if (!@mkdir($dir, 0775, true) && !is_dir($dir)) {
      api_error('Cannot create data dir', 500);
      exit;
    }
  }

  $path = $dir . DIRECTORY_SEPARATOR . $db;
  if (!is_file($path)) {
    api_error('DB file not found', 404);
    exit;
  }

  return [$path, $db];
}

function api_pdo_sqlite(string $dbPath): PDO {
  $pdo = new PDO('sqlite:' . $dbPath, null, null, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
  ]);
  // Лёгкие оптимизации / совместимость с creator.php
  $pdo->exec('PRAGMA journal_mode = WAL;');
  $pdo->exec('PRAGMA synchronous = NORMAL;');
  $pdo->exec('PRAGMA foreign_keys = ON;');
  return $pdo;
}

function api_read_json_body(): array {
  $raw = file_get_contents('php://input');
  if ($raw === false || $raw === '') {
    api_error('Empty JSON body', 400);
    exit;
  }
  $data = json_decode($raw, true);
  if (!is_array($data)) {
    api_error('Invalid JSON body', 400);
    exit;
  }
  return $data;
}

function api_init_schema(PDO $pdo): void {
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

CREATE TABLE IF NOT EXISTS dataset_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  schema_version INTEGER NOT NULL,
  version TEXT NOT NULL,                   -- произвольная версия/etag
  updated_at TEXT NOT NULL                 -- ISO string
);

INSERT OR IGNORE INTO dataset_meta (id, schema_version, version, updated_at)
VALUES (1, 1, 'init', datetime('now'));

CREATE TABLE IF NOT EXISTS song_usage (
  song_id              INTEGER PRIMARY KEY, -- 1:1 к songs.id
  last_played_at       TEXT NULL,           -- ISO string
  avg_duration_seconds INTEGER NULL,        -- среднее время исполнения в секундах
  play_count           INTEGER NOT NULL DEFAULT 0,

  FOREIGN KEY(song_id) REFERENCES songs(id) ON DELETE CASCADE
);

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

function api_export_book(PDO $pdo, string $fileKey): array {
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

function api_song_book_get_version(PDO $pdo, string $fileKey): int {
  if ($fileKey === '') return 0;
  $stmt = $pdo->prepare("SELECT meta_value FROM song_book_meta WHERE file_key = :fk AND meta_key = 'version'");
  $stmt->execute([':fk' => $fileKey]);
  $v = $stmt->fetchColumn();
  if ($v === false || $v === null) return 0;
  return (int)$v;
}

function api_song_book_bump_version(PDO $pdo, string $fileKey): int {
  if ($fileKey === '') return 0;

  // Надёжно работаем без UPSERT (на случай старого SQLite)
  $stmtSel = $pdo->prepare("SELECT meta_value FROM song_book_meta WHERE file_key = :fk AND meta_key = 'version'");
  $stmtSel->execute([':fk' => $fileKey]);
  $current = $stmtSel->fetchColumn();
  $next = ((int)($current === false || $current === null ? 0 : $current)) + 1;

  $now = gmdate('c');
  if ($current === false || $current === null) {
    $stmtIns = $pdo->prepare("INSERT INTO song_book_meta (file_key, meta_key, meta_value, updated_at) VALUES (:fk, 'version', :v, :t)");
    $stmtIns->execute([':fk' => $fileKey, ':v' => (string)$next, ':t' => $now]);
  } else {
    $stmtUpd = $pdo->prepare("UPDATE song_book_meta SET meta_value = :v, updated_at = :t WHERE file_key = :fk AND meta_key = 'version'");
    $stmtUpd->execute([':fk' => $fileKey, ':v' => (string)$next, ':t' => $now]);
  }

  return $next;
}

function api_song_book_bump_version_with_user(PDO $pdo, string $fileKey, string $userEmail): int {
  if ($fileKey === '') return 0;
  if ($userEmail === '') return api_song_book_bump_version($pdo, $fileKey);

  // Надёжно работаем без UPSERT (на случай старого SQLite)
  $stmtSel = $pdo->prepare("SELECT meta_value FROM song_book_meta WHERE file_key = :fk AND meta_key = 'version'");
  $stmtSel->execute([':fk' => $fileKey]);
  $current = $stmtSel->fetchColumn();
  $next = ((int)($current === false || $current === null ? 0 : $current)) + 1;

  $now = gmdate('c');
  if ($current === false || $current === null) {
    $stmtIns = $pdo->prepare("INSERT INTO song_book_meta (file_key, meta_key, meta_value, updated_at) VALUES (:fk, 'version', :v, :t)");
    $stmtIns->execute([':fk' => $fileKey, ':v' => (string)$next, ':t' => $now]);
  } else {
    $stmtUpd = $pdo->prepare("UPDATE song_book_meta SET meta_value = :v, updated_at = :t WHERE file_key = :fk AND meta_key = 'version'");
    $stmtUpd->execute([':fk' => $fileKey, ':v' => (string)$next, ':t' => $now]);
  }

  // Записываем email пользователя, кто последним обновил книгу
  $stmtSelUser = $pdo->prepare("SELECT meta_value FROM song_book_meta WHERE file_key = :fk AND meta_key = 'updated_by'");
  $stmtSelUser->execute([':fk' => $fileKey]);
  $hasUser = $stmtSelUser->fetchColumn();
  if ($hasUser === false || $hasUser === null) {
    $stmtInsUser = $pdo->prepare("INSERT INTO song_book_meta (file_key, meta_key, meta_value, updated_at) VALUES (:fk, 'updated_by', :email, :t)");
    $stmtInsUser->execute([':fk' => $fileKey, ':email' => $userEmail, ':t' => $now]);
  } else {
    $stmtUpdUser = $pdo->prepare("UPDATE song_book_meta SET meta_value = :email, updated_at = :t WHERE file_key = :fk AND meta_key = 'updated_by'");
    $stmtUpdUser->execute([':fk' => $fileKey, ':email' => $userEmail, ':t' => $now]);
  }

  // Записываем дату последнего обновления книги
  $stmtSelTime = $pdo->prepare("SELECT meta_value FROM song_book_meta WHERE file_key = :fk AND meta_key = 'updated_at'");
  $stmtSelTime->execute([':fk' => $fileKey]);
  $hasTime = $stmtSelTime->fetchColumn();
  if ($hasTime === false || $hasTime === null) {
    $stmtInsTime = $pdo->prepare("INSERT INTO song_book_meta (file_key, meta_key, meta_value, updated_at) VALUES (:fk, 'updated_at', :t, :t)");
    $stmtInsTime->execute([':fk' => $fileKey, ':t' => $now]);
  } else {
    $stmtUpdTime = $pdo->prepare("UPDATE song_book_meta SET meta_value = :t, updated_at = :t WHERE file_key = :fk AND meta_key = 'updated_at'");
    $stmtUpdTime->execute([':fk' => $fileKey, ':t' => $now]);
  }

  return $next;
}

function api_upsert_song_book_meta(PDO $pdo, string $fileKey, array $meta): array {
  if ($fileKey === '' || !$meta) return [];

  $stmtSel = $pdo->prepare('SELECT COUNT(*) FROM song_book_meta WHERE file_key = :fk AND meta_key = :k');
  $stmtUpd = $pdo->prepare('UPDATE song_book_meta SET meta_value = :v, updated_at = :t WHERE file_key = :fk AND meta_key = :k');
  $stmtIns = $pdo->prepare('INSERT INTO song_book_meta (file_key, meta_key, meta_value, updated_at) VALUES (:fk, :k, :v, :t)');
  $now = gmdate('c');
  $updatedKeys = [];

  foreach ($meta as $k => $v) {
    if (!is_string($k)) continue;
    $key = trim($k);
    if ($key === '') continue;

    if (is_bool($v)) {
      $value = $v ? '1' : '0';
    } elseif (is_int($v) || is_float($v)) {
      $value = (string)$v;
    } elseif (is_string($v)) {
      $value = $v;
    } else {
      continue;
    }

    $stmtSel->execute([':fk' => $fileKey, ':k' => $key]);
    $exists = (int)$stmtSel->fetchColumn() > 0;
    $params = [':fk' => $fileKey, ':k' => $key, ':v' => $value, ':t' => $now];
    if ($exists) {
      $stmtUpd->execute($params);
    } else {
      $stmtIns->execute($params);
    }
    $updatedKeys[] = $key;
  }

  return $updatedKeys;
}

function api_delete_song_book_meta_keys(PDO $pdo, string $fileKey, array $keys): array {
  if ($fileKey === '' || !$keys) return [];

  $stmtDel = $pdo->prepare('DELETE FROM song_book_meta WHERE file_key = :fk AND meta_key = :k');
  $deleted = [];
  foreach ($keys as $key) {
    if (!is_string($key)) continue;
    $metaKey = trim($key);
    if ($metaKey === '') continue;

    $stmtDel->execute([':fk' => $fileKey, ':k' => $metaKey]);
    if ($stmtDel->rowCount() > 0) {
      $deleted[] = $metaKey;
    }
  }

  return $deleted;
}

function api_downscale_cover_image(string $dataUrl, int $maxSize = 512): ?string {
  if (!function_exists('imagecreatefromstring')) {
    return null;
  }

  if (!preg_match('#^data:(image/(?:png|jpe?g|webp));base64,(.+)$#i', $dataUrl, $matches)) {
    return null;
  }

  $mime = strtolower($matches[1]);
  if ($mime === 'image/jpg') {
    $mime = 'image/jpeg';
  }

  $base64Data = preg_replace('/\s+/', '', $matches[2]);
  $binary = base64_decode($base64Data, true);
  if ($binary === false || $binary === '') {
    return null;
  }

  $src = @imagecreatefromstring($binary);
  if ($src === false) {
    return null;
  }

  $width = imagesx($src);
  $height = imagesy($src);
  if ($width <= 0 || $height <= 0) {
    imagedestroy($src);
    return null;
  }

  $ratio = min(1.0, $maxSize / $width, $maxSize / $height);
  $targetW = max(1, (int)round($width * $ratio));
  $targetH = max(1, (int)round($height * $ratio));

  if ($ratio >= 1.0) {
    imagedestroy($src);
    return $dataUrl;
  }

  $dst = imagecreatetruecolor($targetW, $targetH);
  if ($mime === 'image/png' || $mime === 'image/webp') {
    imagealphablending($dst, false);
    imagesavealpha($dst, true);
    $transparent = imagecolorallocatealpha($dst, 0, 0, 0, 127);
    imagefilledrectangle($dst, 0, 0, $targetW, $targetH, $transparent);
  }

  imagecopyresampled($dst, $src, 0, 0, 0, 0, $targetW, $targetH, $width, $height);
  imagedestroy($src);

  ob_start();
  $outputMime = $mime;
  $encoded = '';
  switch ($mime) {
    case 'image/jpeg':
      imagejpeg($dst, null, 85);
      break;
    case 'image/png':
      imagepng($dst, null, 6);
      break;
    case 'image/webp':
      if (function_exists('imagewebp')) {
        imagewebp($dst, null, 80);
        break;
      }
      imagepng($dst, null, 6);
      $outputMime = 'image/png';
      break;
    default:
      imagepng($dst, null, 6);
      $outputMime = 'image/png';
      break;
  }
  $imageData = ob_get_clean();
  imagedestroy($dst);

  if ($imageData === false || $imageData === '') {
    return null;
  }

  $encoded = base64_encode($imageData);
  if ($encoded === false) {
    return null;
  }

  return 'data:' . $outputMime . ';base64,' . $encoded;
}

/**
 * Загрузить полную песню с её куплетами и строками по id.
 */
function api_load_song_with_lyrics(PDO $pdo, int $id): ?array {
  $stmt = $pdo->prepare('SELECT id, book_file_key, number, title, song_key, key_signature, author, ref, category
    FROM songs WHERE id = :id');
  $stmt->execute([':id' => $id]);
  $song = $stmt->fetch();
  if (!$song) {
    return null;
  }

  // Загружаем секции (lyrics)
  $stmtLy = $pdo->prepare('SELECT id, song_id, uniq_id, section_title, type, split_lines_count, sort_index
    FROM lyrics WHERE song_id = :sid ORDER BY sort_index, id');
  $stmtLy->execute([':sid' => $id]);
  $lyrics = $stmtLy->fetchAll();

  if (!$lyrics) {
    $song['lyrics'] = [];
    return $song;
  }

  // Собираем id секций и загружаем строки одним запросом
  $lyricIds = array_column($lyrics, 'id');
  $placeholders = implode(',', array_fill(0, count($lyricIds), '?'));
  $sqlLines = 'SELECT id, lyric_id, range_index, line_index, global_song_index, text
    FROM lyric_lines WHERE lyric_id IN (' . $placeholders . ')
    ORDER BY lyric_id, line_index, id';
  $stmtLines = $pdo->prepare($sqlLines);
  $stmtLines->execute($lyricIds);
  $lines = $stmtLines->fetchAll();

  // Группируем строки по lyric_id
  $linesByLyric = [];
  foreach ($lines as $ln) {
    $lid = (int)$ln['lyric_id'];
    if (!isset($linesByLyric[$lid])) {
      $linesByLyric[$lid] = [];
    }
    $linesByLyric[$lid][] = $ln;
  }

  // Собираем итоговую структуру lyrics[] с вложенными lines[]
  foreach ($lyrics as &$ly) {
    $lid = (int)$ly['id'];
    $ly['lines'] = $linesByLyric[$lid] ?? [];
  }
  unset($ly);

  $song['lyrics'] = $lyrics;
  return api_song_to_camel_case($song);
}

// Преобразование полей песни/lyrics/lines в camelCase для JSON-ответа
function api_song_row_to_camel_case(array $song): array {
  return [
    'id' => (int)($song['id'] ?? 0),
    'bookFileKey' => $song['book_file_key'] ?? null,
    'number' => (int)($song['number'] ?? 0),
    'title' => $song['title'] ?? null,
    'songKey' => $song['song_key'] ?? null,
    'keySignature' => $song['key_signature'] ?? null,
    'author' => $song['author'] ?? null,
    'ref' => $song['ref'] ?? null,
    'category' => $song['category'] ?? null,
  ];
}

function api_song_to_camel_case(array $song): array {
  $base = api_song_row_to_camel_case($song);

  $lyrics = $song['lyrics'] ?? [];
  $camelLyrics = [];
  foreach ($lyrics as $ly) {
    $camelLines = [];
    foreach ($ly['lines'] ?? [] as $ln) {
      $camelLines[] = [
        'id' => (int)($ln['id'] ?? 0),
        'lyricId' => (int)($ln['lyric_id'] ?? 0),
        'rangeIndex' => $ln['range_index'] ?? null,
        'lineIndex' => isset($ln['line_index']) ? (int)$ln['line_index'] : null,
        'globalSongIndex' => $ln['global_song_index'] ?? null,
        'text' => $ln['text'] ?? null,
        // если позже добавим repeat_count в SELECT, здесь можно будет отдать repeatCount
      ];
    }

    $camelLyrics[] = [
      'id' => (int)($ly['id'] ?? 0),
      'songId' => (int)($ly['song_id'] ?? 0),
      'uniqId' => $ly['uniq_id'] ?? null,
      'sectionTitle' => $ly['section_title'] ?? null,
      'type' => $ly['type'] ?? null,
      'splitLinesCount' => isset($ly['split_lines_count']) ? (int)$ly['split_lines_count'] : null,
      'sortIndex' => isset($ly['sort_index']) ? (int)$ly['sort_index'] : null,
      'lines' => $camelLines,
    ];
  }

  $base['lyrics'] = $camelLyrics;
  return $base;
}

$action = $_GET['action'] ?? $_POST['action'] ?? '';
$action = is_string($action) ? trim($action) : '';

if ($action === '') {
  api_error('Missing action parameter', 400);
  exit;
}

// OPTIONS-префлайты пропускаем без авторизации (выше уже сделали exit).
// Авторизацию по токену (Bearer / X-Auth-Token / кука) включаем для всех action, кроме auth.login.
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'OPTIONS' && $action !== 'auth.login') {
  $session = auth_validate_cookie_session();
  if ($session === null) {
    api_error('Auth token required', 401);
    exit;
  }
  // Глобально доступен email пользователя для логирования
  $currentUserEmail = $session['email'] ?? '';
}

// Простая маршрутизация по action..
// Позже можно вынести конкретные обработчики в отдельные файлы, например:
//   require __DIR__ . '/../src/libs/php/api/songs.php';
//   require __DIR__ . '/../src/libs/php/api/bible.php';
//   require __DIR__ . '/../src/libs/php/api/migrations.php';

try {
  switch ($action) {
    case 'auth.login':
      // JSON-логин по email, возвращаем токен для последующих запросов
      if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        api_error('POST required', 405);
        break;
      }

      // Поддерживаем и JSON, и x-www-form-urlencoded
      $ct = $_SERVER['CONTENT_TYPE'] ?? '';
      $ct = is_string($ct) ? strtolower($ct) : '';
      $email = '';
      if (strpos($ct, 'application/json') !== false) {
        $body = api_read_json_body();
        $email = isset($body['email']) && is_string($body['email']) ? trim($body['email']) : '';
      } else {
        // form-urlencoded: email может прийти в $_POST
        if (isset($_POST['email']) && is_string($_POST['email'])) {
          $email = trim($_POST['email']);
        }
      }

      if ($email === '') {
        api_error('Email is required', 400);
        break;
      }

      try {
        // Подключаемся к MySQL-конфигу через общий helper
        $cfg = auth_load_mysql_config(auth_get_config_path());
        $pdoMysql = auth_pdo_mysql($cfg);
        auth_ensure_schema($pdoMysql);

        $info = auth_ensure_user_and_device($pdoMysql, $email);
      } catch (Throwable $e) {
        api_error('Auth failed', 401, ['message' => $e->getMessage()]);
        break;
      }

      if (!$info['is_allowed']) {
        api_error('Device not allowed for this email', 403);
        break;
      }

      $token = auth_create_session($pdoMysql, $info['user_id'], $info['device_id']);

      // Опционально: ставим куку для удобства работы из браузера, но основной способ — токен в заголовке
      setcookie('auth_token', $token, [
        'expires' => time() + 86400,
        'path' => '/',
        'secure' => isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
        'httponly' => true,
        'samesite' => 'Lax',
      ]);

      api_response([
        'ok' => true,
        'token' => $token,
        'userId' => (int)$info['user_id'],
        'deviceId' => (int)$info['device_id'],
        'expiresIn' => 86400,
      ]);
      break;

    case 'ping':
      api_response([
        'ok' => true,
        'action' => 'ping',
        'pong' => true,
        'time' => date('c'),
      ]);
      break;

    case 'registry.list':
      // Список доступных SQLite-баз и их метаданных
      $list = sqlite_files_get_list();
      $items = [];
      foreach ($list['files'] as $file) {
        if (empty($file['is_sqlite'])) continue;

        $item = [
          'db' => $file['name'],
          'size' => (int)$file['size'],
          'mtime' => (int)$file['mtime'],
        ];

        // Пытаемся прочитать расширенные метаданные прямо из SQLite:
        // - song_books + song_book_meta
        // - количество песен в сборнике
        try {
          $pdo = api_pdo_sqlite($file['path']);

          // Список сборников в этой БД (сейчас предполагаем, что он один, но читаем обобщённо)
          $rows = $pdo->query('SELECT file_key FROM song_books ORDER BY file_key')->fetchAll();
          $books = [];

          if ($rows) {
            $stmtMeta = $pdo->prepare('SELECT meta_key, meta_value FROM song_book_meta WHERE file_key = :fk');
            $stmtCount = $pdo->prepare('SELECT COUNT(*) AS c FROM songs WHERE book_file_key = :fk');

            foreach ($rows as $r) {
              $fk = (string)$r['file_key'];
              if ($fk === '') continue;

              // meta ключ-значение
              $metaArr = [];
              $stmtMeta->execute([':fk' => $fk]);
              while ($m = $stmtMeta->fetch(PDO::FETCH_ASSOC)) {
                $k = (string)$m['meta_key'];
                $v = (string)$m['meta_value'];
                if ($k === '') continue;
                $metaArr[$k] = $v;
              }

              // Версия книги (монотонно растёт при изменениях песен)
              $metaArr['version'] = api_song_book_get_version($pdo, $fk);

              // количество песен
              $stmtCount->execute([':fk' => $fk]);
              $songCount = (int)$stmtCount->fetchColumn();

              $books[] = [
                'fileKey' => $fk,
                'meta' => $metaArr,
                'songCount' => $songCount,
              ];
            }
          }

          if ($books) {
            // Удобное summary-мета для API-клиента: основное название/картинка + язык, fileKey, вес и количество песен
            $totalSongs = 0;
            foreach ($books as $b) {
              $totalSongs += (int)($b['songCount'] ?? 0);
            }

            $primaryBook = $books[0] ?? [];
            $primaryMetaStatic = is_array($primaryBook['meta'] ?? null) ? $primaryBook['meta'] : [];

            $item['meta'] = [
              'fileKey' => $primaryBook['fileKey'] ?? null,
              'language' => $primaryMetaStatic['language'] ?? null,
              'title' => $primaryMetaStatic['title'] ?? null,
              'description' => $primaryMetaStatic['description'] ?? null,
              'coverImage' => $primaryMetaStatic['coverImage'] ?? null,
              'version' => isset($primaryMetaStatic['version']) ? (int)$primaryMetaStatic['version'] : 0,
              'updatedBy' => $primaryMetaStatic['updated_by'] ?? null,
              'updatedAt' => $primaryMetaStatic['updated_at'] ?? null,
              'size' => (int)$file['size'],
              'songCount' => $totalSongs,
            ];
          }
        } catch (Throwable $e) {
          // Не заваливаем весь список, если конкретная БД битая
          $item['metaError'] = $e->getMessage();
        }

        $items[] = $item;
      }

      api_response([
        'ok' => true,
        'dir' => basename($list['dir']),
        'items' => $items,
        'totalCount' => count($items),
      ]);
      break;

    case 'download.db':
      // Скачивание выбранного SQLite-файла
      $db = $_GET['db'] ?? '';
      $db = is_string($db) ? $db : '';

      if ($db === '' || !preg_match(DB_NAME_REGEX, $db)) {
        api_error('Invalid db name', 400);
        break;
      }

      $path = DATA_DIR . DIRECTORY_SEPARATOR . $db;
      if (!is_file($path)) {
        api_error('DB file not found', 404);
        break;
      }

      // Отдаём файл как бинарный ответ, без JSON-обёртки
      http_response_code(200);
      header('Content-Type: application/octet-stream');
      header('Content-Length: ' . (string)filesize($path));
      header('Content-Disposition: attachment; filename="' . rawurlencode($db) . '"');
      readfile($path);
      exit;

    case 'db.delete':
      if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        api_error('POST required', 405);
        break;
      }

      $returnUrl = $_POST['returnUrl'] ?? '';
      $returnUrl = is_string($returnUrl) ? trim($returnUrl) : '';
      // allow only same-dir relative urls like "sqlite-creator.php" (no slashes)
      if ($returnUrl !== '' && !preg_match('/^[a-zA-Z0-9._-]+\.php$/', $returnUrl)) {
        $returnUrl = '';
      }

      $accept = $_SERVER['HTTP_ACCEPT'] ?? '';
      $accept = is_string($accept) ? $accept : '';
      $wantsHtml = stripos($accept, 'text/html') !== false;
      if ($returnUrl === '' && $wantsHtml) {
        // Для формы из браузера — возвращаем обратно в UI
        $returnUrl = 'sqlite-creator.php';
      }

      $db = $_POST['db'] ?? '';
      $db = is_string($db) ? trim($db) : '';
      if ($db === '' || !preg_match(DB_NAME_REGEX, $db)) {
        api_error('Invalid db name', 400);
        break;
      }

      $path = DATA_DIR . DIRECTORY_SEPARATOR . $db;
      if (!is_file($path)) {
        api_error('DB file not found', 404);
        break;
      }

      $deleted = [];
      $errors = [];

      $candidates = [
        $path,
        $path . '-wal',
        $path . '-shm',
        $path . '-journal',
        $path . '.meta.json',
      ];

      foreach ($candidates as $p) {
        if (!is_file($p)) continue;
        if (@unlink($p)) {
          $deleted[] = basename($p);
        } else {
          $errors[] = basename($p);
        }
      }

      // Доп. проверка: основной файл обязан исчезнуть
      if (is_file($path)) {
        $errors[] = basename($path);
      }

      if ($errors) {
        $remaining = [];
        foreach ($candidates as $p) {
          if (is_file($p)) $remaining[] = basename($p);
        }

        api_error('Some files could not be deleted', 500, [
          'db' => $db,
          'deleted' => $deleted,
          'failed' => array_values(array_unique($errors)),
          'remaining' => $remaining,
        ]);
        break;
      }

      if ($returnUrl !== '') {
        // 303: после POST перейти на страницу (GET)
        header('Location: ' . $returnUrl, true, 303);
        exit;
      }

      api_response([
        'ok' => true,
        'db' => $db,
        'deleted' => $deleted,
      ]);
      break;

    case 'song.search':
      // Поиск песен по всем полям через query параметр
      [$dbPath, $dbName] = api_get_db_path_and_name();
      $pdo = api_pdo_sqlite($dbPath);

      $q = isset($_GET['query']) && is_string($_GET['query']) ? trim($_GET['query']) : '';
      $page = isset($_GET['page']) ? max(1, (int)$_GET['page']) : 1;
      $pageSize = isset($_GET['pageSize']) ? max(1, min(200, (int)$_GET['pageSize'])) : 50;
      $includeLyrics = isset($_GET['includeLyrics']) && (string)$_GET['includeLyrics'] !== '0';

      $where = [];
      $params = [];
      if ($q !== '') {
        // Поиск по всем полям включая номер
        $where[] = '(s.title LIKE :q OR s.author LIKE :q OR s.ref LIKE :q OR s.category LIKE :q OR 
                     CAST(s.number AS TEXT) LIKE :q OR EXISTS (
          SELECT 1 FROM lyric_lines ll 
          JOIN lyrics l ON ll.lyric_id = l.id 
          WHERE l.song_id = s.id AND ll.text LIKE :q
        ))';
        $params[':q'] = '%' . $q . '%';
      }

      $whereSql = $where ? ('WHERE ' . implode(' AND ', $where)) : '';

      $stmtCnt = $pdo->prepare("SELECT COUNT(DISTINCT s.id) AS c FROM songs s $whereSql");
      $stmtCnt->execute($params);
      $total = (int)$stmtCnt->fetchColumn();

      $offset = ($page - 1) * $pageSize;
      $stmt = $pdo->prepare("SELECT DISTINCT s.id, s.book_file_key, s.number, s.title, s.song_key, s.key_signature, s.author, s.ref, s.category
        FROM songs s
        $whereSql
        ORDER BY s.book_file_key, s.number
        LIMIT :limit OFFSET :offset");
      foreach ($params as $k => $v) {
        $stmt->bindValue($k, $v);
      }
      $stmt->bindValue(':limit', $pageSize, PDO::PARAM_INT);
      $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
      $stmt->execute();

      $rows = $stmt->fetchAll();

      // Преобразуем записи в camelCase структуры
      $items = [];
      foreach ($rows as $row) {
        $id = (int)($row['id'] ?? 0);
        if ($id <= 0) continue;

        if ($includeLyrics) {
          // Полная песня с lyrics/lines
          $song = api_load_song_with_lyrics($pdo, $id);
          if ($song !== null) {
            $items[] = $song;
          }
        } else {
          // Только плоская запись из songs
          $items[] = api_song_row_to_camel_case($row);
        }
      }

      api_response([
        'ok' => true,
        'db' => $dbName,
        'page' => $page,
        'pageSize' => $pageSize,
        'total' => $total,
        'items' => $items,
        'totalCount' => $total,
      ]);
      break;

    case 'song.get':
      // Получить одну полную песню по id (основная запись + lyrics + lyric_lines)
      [$dbPath, $dbName] = api_get_db_path_and_name();
      $pdo = api_pdo_sqlite($dbPath);

      $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
      if ($id <= 0) {
        api_error('Invalid song id', 400);
        break;
      }

      $song = api_load_song_with_lyrics($pdo, $id);
      if ($song === null) {
        api_error('Song not found', 404);
        break;
      }

      api_response([
        'ok' => true,
        'db' => $dbName,
        'song' => $song,
      ]);
      break;

    case 'song.save':
      // Создание/обновление песни (основная запись в songs)
      [$dbPath, $dbName] = api_get_db_path_and_name();
      $pdo = api_pdo_sqlite($dbPath);
      $body = api_read_json_body();

      // Поддерживаем и camelCase, и snake_case, но фронт должен слать camelCase
      $id = isset($body['id']) ? (int)$body['id'] : 0;

      $book_file_key = null;
      if (isset($body['bookFileKey']) && is_string($body['bookFileKey'])) {
        $book_file_key = trim($body['bookFileKey']);
      } elseif (isset($body['book_file_key']) && is_string($body['book_file_key'])) {
        $book_file_key = trim($body['book_file_key']);
      } else {
        $book_file_key = '';
      }

      $number = isset($body['number']) ? (int)$body['number'] : 0;
      $title = isset($body['title']) && is_string($body['title']) ? trim($body['title']) : '';

      if (isset($body['songKey']) && is_string($body['songKey'])) {
        $song_key = trim($body['songKey']);
      } elseif (isset($body['song_key']) && is_string($body['song_key'])) {
        $song_key = trim($body['song_key']);
      } else {
        // допускаем пустой song_key, он не обязателен при сохранении
        $song_key = '';
      }

      if (isset($body['keySignature']) && is_string($body['keySignature'])) {
        $key_signature = trim($body['keySignature']);
      } elseif (isset($body['key_signature']) && is_string($body['key_signature'])) {
        $key_signature = trim($body['key_signature']);
      } else {
        $key_signature = '';
      }

      // author делаем необязательным: по умолчанию пустая строка, чтобы удовлетворить NOT NULL
      $author = '';
      if (isset($body['author']) && is_string($body['author'])) {
        $author = trim($body['author']);
      }

      $ref = isset($body['ref']) && is_string($body['ref']) ? trim($body['ref']) : null;
      $category = isset($body['category']) && is_string($body['category']) ? trim($body['category']) : null;

      // song_key и author больше не обязательны, но key_signature пока требуем
      if ($book_file_key === '' || $number <= 0 || $title === '') {
        api_error('Missing required fields (book_file_key, number, title)', 400);
        break;
      }

      $stmtBookExists = $pdo->prepare('SELECT COUNT(*) FROM song_books WHERE file_key = :fk');
      $stmtBookExists->execute([':fk' => $book_file_key]);
      if ((int)$stmtBookExists->fetchColumn() === 0) {
        api_error('Book file key not found in song_books', 400);
        break;
      }

      $pdo->beginTransaction();
      try {
        $oldBookFileKey = null;

        // Если id не задан, пробуем найти существующую песню по (book_file_key, number)
        if ($id <= 0) {
          $stmtFind = $pdo->prepare('SELECT id FROM songs WHERE book_file_key = :bfk AND number = :num');
          $stmtFind->execute([
            ':bfk' => $book_file_key,
            ':num' => $number,
          ]);
          $foundId = (int)$stmtFind->fetchColumn();
          if ($foundId > 0) {
            $id = $foundId; // переключаемся в режим UPDATE
          }
        }

        if ($id > 0) {
          // Для bump версии справочника полезно знать, не изменился ли book_file_key (перенос песни между книгами)
          $stmtOld = $pdo->prepare('SELECT book_file_key FROM songs WHERE id = :id');
          $stmtOld->execute([':id' => $id]);
          $old = $stmtOld->fetchColumn();
          if ($old !== false && $old !== null) {
            $oldBookFileKey = (string)$old;
          }
        }

        if ($id > 0) {
          // UPDATE
          $stmt = $pdo->prepare('UPDATE songs SET
            book_file_key = :book_file_key,
            number = :number,
            title = :title,
            song_key = :song_key,
            key_signature = :key_signature,
            author = :author,
            ref = :ref,
            category = :category
            WHERE id = :id');
          $stmt->execute([
            ':book_file_key' => $book_file_key,
            ':number' => $number,
            ':title' => $title,
            ':song_key' => $song_key,
            ':key_signature' => $key_signature,
            ':author' => $author,
            ':ref' => $ref,
            ':category' => $category,
            ':id' => $id,
          ]);
        } else {
          // INSERT
          $stmt = $pdo->prepare('INSERT INTO songs (
            book_file_key, number, title, song_key, key_signature, author, ref, category
          ) VALUES (
            :book_file_key, :number, :title, :song_key, :key_signature, :author, :ref, :category
          )');
          $stmt->execute([
            ':book_file_key' => $book_file_key,
            ':number' => $number,
            ':title' => $title,
            ':song_key' => $song_key,
            ':key_signature' => $key_signature,
            ':author' => $author,
            ':ref' => $ref,
            ':category' => $category,
          ]);
          $id = (int)$pdo->lastInsertId();
        }

        // Если в запросе переданы lyrics, сохраняем их и строки
        if (isset($body['lyrics']) && is_array($body['lyrics'])) {
          // Собираем список секций, которые должны остаться у песни
          $keptLyricIds = [];

          foreach ($body['lyrics'] as $ly) {
            if (!is_array($ly)) continue;

            $lyricId = isset($ly['id']) ? (int)$ly['id'] : 0;
            $uniqId = isset($ly['uniqId']) && is_string($ly['uniqId']) ? trim($ly['uniqId']) : '';
            $sectionTitle = isset($ly['sectionTitle']) && is_string($ly['sectionTitle']) ? trim($ly['sectionTitle']) : '';
            $type = isset($ly['type']) && is_string($ly['type']) ? trim($ly['type']) : '';
            $splitLinesCount = isset($ly['splitLinesCount']) ? (int)$ly['splitLinesCount'] : 0;
            $sortIndex = isset($ly['sortIndex']) ? (int)$ly['sortIndex'] : 0;

            if ($uniqId === '' || $sectionTitle === '' || $type === '') {
              // пропускаем некорректную секцию, но не падаем
              continue;
            }

            if ($lyricId > 0) {
              // Обновляем существующую секцию, если она принадлежит этой песне
              $stmtLyUpd = $pdo->prepare('UPDATE lyrics SET
                uniq_id = :uniq_id,
                section_title = :section_title,
                type = :type,
                split_lines_count = :split_lines_count,
                sort_index = :sort_index
                WHERE id = :id AND song_id = :song_id');
              $stmtLyUpd->execute([
                ':uniq_id' => $uniqId,
                ':section_title' => $sectionTitle,
                ':type' => $type,
                ':split_lines_count' => $splitLinesCount,
                ':sort_index' => $sortIndex,
                ':id' => $lyricId,
                ':song_id' => $id,
              ]);
            } else {
              // Создаём новую секцию
              $stmtLyIns = $pdo->prepare('INSERT INTO lyrics (
                song_id, uniq_id, section_title, type, split_lines_count, sort_index
              ) VALUES (
                :song_id, :uniq_id, :section_title, :type, :split_lines_count, :sort_index
              )');
              $stmtLyIns->execute([
                ':song_id' => $id,
                ':uniq_id' => $uniqId,
                ':section_title' => $sectionTitle,
                ':type' => $type,
                ':split_lines_count' => $splitLinesCount,
                ':sort_index' => $sortIndex,
              ]);
              $lyricId = (int)$pdo->lastInsertId();
            }

            if ($lyricId > 0) {
              $keptLyricIds[] = $lyricId;
            }

            // Пересобираем строки для этой секции: сначала удаляем старые, потом вставляем новые
            $stmtDelLines = $pdo->prepare('DELETE FROM lyric_lines WHERE lyric_id = :lyric_id');
            $stmtDelLines->execute([':lyric_id' => $lyricId]);

            if (isset($ly['lines']) && is_array($ly['lines'])) {
              $stmtLineIns = $pdo->prepare('INSERT INTO lyric_lines (
                lyric_id, range_index, line_index, global_song_index, text
              ) VALUES (
                :lyric_id, :range_index, :line_index, :global_song_index, :text
              )');

              foreach ($ly['lines'] as $ln) {
                if (!is_array($ln)) continue;
                $rangeIndex = isset($ln['rangeIndex']) && is_string($ln['rangeIndex']) ? trim($ln['rangeIndex']) : null;
                $lineIndex = isset($ln['lineIndex']) ? (int)$ln['lineIndex'] : 0;
                $globalSongIndex = isset($ln['globalSongIndex']) ? (int)$ln['globalSongIndex'] : null;
                $text = isset($ln['text']) && is_string($ln['text']) ? trim($ln['text']) : '';

                // lineIndex может быть 0 (первая строка), поэтому отбрасываем только отрицательные индексы
                if ($lineIndex < 0 || $text === '') continue;

                $stmtLineIns->execute([
                  ':lyric_id' => $lyricId,
                  ':range_index' => $rangeIndex,
                  ':line_index' => $lineIndex,
                  ':global_song_index' => $globalSongIndex,
                  ':text' => $text,
                ]);
              }
            }
          }

          // Удаляем секции, которые не пришли в запросе (каскадно удалятся и их строки)
          $keptLyricIds = array_values(array_unique(array_filter($keptLyricIds, static fn($v) => ($v > 0))));
          if ($keptLyricIds) {
            $placeholders = implode(',', array_fill(0, count($keptLyricIds), '?'));
            $sqlDelete = 'DELETE FROM lyrics WHERE song_id = ? AND id NOT IN (' . $placeholders . ')';
            $stmtDelUnused = $pdo->prepare($sqlDelete);
            $paramsDel = array_merge([$id], $keptLyricIds);
            $stmtDelUnused->execute($paramsDel);
          } else {
            // Если ни одной валидной секции не осталось, очищаем все lyrics/lines для песни
            $stmtDelAllLyrics = $pdo->prepare('DELETE FROM lyrics WHERE song_id = :song_id');
            $stmtDelAllLyrics->execute([':song_id' => $id]);
          }
        }

        // Повышаем версию справочника, т.к. изменились данные песен внутри книги
        $bumpKeys = [];
        if (is_string($oldBookFileKey) && $oldBookFileKey !== '' && $oldBookFileKey !== $book_file_key) {
          $bumpKeys[] = $oldBookFileKey;
        }
        if ($book_file_key !== '') {
          $bumpKeys[] = $book_file_key;
        }
        $bumpKeys = array_values(array_unique($bumpKeys));
        foreach ($bumpKeys as $fk) {
          api_song_book_bump_version_with_user($pdo, $fk, $currentUserEmail);
        }

        $pdo->commit();
      } catch (Throwable $e) {
        $pdo->rollBack();
        api_error('Failed to save song', 500, ['exception' => ['message' => $e->getMessage()]]);
        break;
      }

      api_response([
        'ok' => true,
        'db' => $dbName,
        'id' => $id,
      ]);
      break;

    case 'song.delete':
      // Удаление песни по id (каскадно удалятся lyrics/lyric_lines по FK)
      [$dbPath, $dbName] = api_get_db_path_and_name();
      $pdo = api_pdo_sqlite($dbPath);

      $id = isset($_POST['id']) ? (int)$_POST['id'] : (isset($_GET['id']) ? (int)$_GET['id'] : 0);
      if ($id <= 0) {
        api_error('Invalid song id', 400);
        break;
      }

      $pdo->beginTransaction();
      try {
        $stmtSel = $pdo->prepare('SELECT book_file_key FROM songs WHERE id = :id');
        $stmtSel->execute([':id' => $id]);
        $bookFileKey = $stmtSel->fetchColumn();
        $bookFileKey = ($bookFileKey === false || $bookFileKey === null) ? '' : (string)$bookFileKey;

        $stmt = $pdo->prepare('DELETE FROM songs WHERE id = :id');
        $stmt->execute([':id' => $id]);

        if ($bookFileKey !== '') {
          api_song_book_bump_version_with_user($pdo, $bookFileKey, $currentUserEmail);
        }

        $pdo->commit();
      } catch (Throwable $e) {
        $pdo->rollBack();
        api_error('Failed to delete song', 500, ['exception' => ['message' => $e->getMessage()]]);
        break;
      }

      api_response([
        'ok' => true,
        'db' => $dbName,
        'id' => $id,
      ]);
      break;

    case 'book.meta.save':
      if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        api_error('POST required', 405);
        break;
      }

      [$dbPath, $dbName] = api_get_db_path_and_name();
      $pdo = api_pdo_sqlite($dbPath);

      $body = api_read_json_body();
      $fileKey = isset($body['fileKey']) && is_string($body['fileKey']) ? trim($body['fileKey']) : '';
      if ($fileKey === '') {
        api_error('fileKey is required', 400);
        break;
      }

      $metaInput = [];
      if (array_key_exists('meta', $body)) {
        if (!is_array($body['meta'])) {
          api_error('meta must be an object with string keys', 400);
          break;
        }
        $metaInput = $body['meta'];
        if (isset($metaInput['coverImage']) && is_string($metaInput['coverImage'])) {
          $resized = api_downscale_cover_image($metaInput['coverImage'], 512);
          if ($resized !== null) {
            $metaInput['coverImage'] = $resized;
          }
        }
      }

      $deleteKeys = [];
      if (array_key_exists('deleteKeys', $body)) {
        if (!is_array($body['deleteKeys'])) {
          api_error('deleteKeys must be an array of strings', 400);
          break;
        }
        foreach ($body['deleteKeys'] as $key) {
          if (!is_string($key)) continue;
          $k = trim($key);
          if ($k === '') continue;
          $deleteKeys[] = $k;
        }
      }

      if (!$metaInput && !$deleteKeys) {
        api_error('Provide meta to upsert and/or deleteKeys to remove', 400);
        break;
      }

      $stmtBookExists = $pdo->prepare('SELECT COUNT(*) FROM song_books WHERE file_key = :fk');
      $stmtBookExists->execute([':fk' => $fileKey]);
      if ((int)$stmtBookExists->fetchColumn() === 0) {
        api_error('Book not found', 404);
        break;
      }

      $pdo->beginTransaction();
      try {
        $updatedKeys = $metaInput ? api_upsert_song_book_meta($pdo, $fileKey, $metaInput) : [];
        $deletedKeys = $deleteKeys ? api_delete_song_book_meta_keys($pdo, $fileKey, $deleteKeys) : [];
        $version = api_song_book_get_version($pdo, $fileKey);

        if ($updatedKeys || $deletedKeys) {
          $version = api_song_book_bump_version_with_user($pdo, $fileKey, $currentUserEmail ?? '');
        }

        $pdo->commit();
      } catch (Throwable $e) {
        $pdo->rollBack();
        api_error('Failed to update book meta', 500, ['exception' => ['message' => $e->getMessage()]]);
        break;
      }

      api_response([
        'ok' => true,
        'db' => $dbName,
        'fileKey' => $fileKey,
        'updatedKeys' => $updatedKeys,
        'deletedKeys' => $deletedKeys,
        'version' => $version,
      ]);
      break;

    case 'book.versions.check':
      // Клиент присылает версии книг, сервер отвечает теми, которые "свежее".
      // POST JSON: { books: [ { fileKey: string, version: number } ] }
      if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        api_error('POST required', 405);
        break;
      }

      $body = api_read_json_body();
      
      // Если body пустой или нет books - возвращаем все доступные справочники
      if (!isset($body['books']) || !is_array($body['books']) || empty($body['books'])) {
        $list = sqlite_files_get_list();
        $allBooks = [];
        
        foreach ($list['files'] as $file) {
          if (empty($file['is_sqlite'])) continue;
          
          try {
            $pdo = api_pdo_sqlite($file['path']);
            $stmt = $pdo->query('SELECT file_key FROM song_books ORDER BY file_key');
            $books = $stmt->fetchAll(PDO::FETCH_COLUMN);
            
            foreach ($books as $fileKey) {
              if ($fileKey === '') continue;
              $version = api_song_book_get_version($pdo, $fileKey);
              $allBooks[] = [
                'fileKey' => $fileKey,
                'version' => $version,
                'db' => $file['name'],
                'downloadUrl' => 'api.php?action=exportBook&db=' . rawurlencode($file['name']) . '&fileKey=' . rawurlencode($fileKey),
              ];
            }
          } catch (Throwable $e) {
            // Пропускаем битые БД
            continue;
          }
        }
        
        api_response([
          'ok' => true,
          'books' => $allBooks,
          'totalCount' => count($allBooks),
        ]);
        break;
      }

      // Режим проверки версий: ищем каждую книгу во всех SQLite файлах
      $booksIn = $body['books'];
      $updates = [];
      
      // Получаем список всех SQLite файлов
      $list = sqlite_files_get_list();
      
      foreach ($booksIn as $bookIn) {
        if (!isset($bookIn['fileKey']) || !isset($bookIn['version'])) continue;
        
        $fileKey = (string)$bookIn['fileKey'];
        $clientVersion = (int)$bookIn['version'];
        
        if ($fileKey === '') continue;
        
        // Ищем книгу во всех SQLite файлах
        foreach ($list['files'] as $file) {
          if (empty($file['is_sqlite'])) continue;
          
          try {
            $pdo = api_pdo_sqlite($file['path']);
            
            // Проверяем есть ли такая книга в этой БД
            $stmt = $pdo->prepare('SELECT COUNT(*) FROM song_books WHERE file_key = :fk');
            $stmt->execute([':fk' => $fileKey]);
            $exists = (int)$stmt->fetchColumn();
            
            if ($exists > 0) {
              $serverVersion = api_song_book_get_version($pdo, $fileKey);
              
              if ($serverVersion > $clientVersion) {
                $updates[] = [
                  'fileKey' => $fileKey,
                  'version' => $serverVersion,
                  'downloadUrl' => 'api.php?action=exportBook&db=' . rawurlencode($file['name']) . '&fileKey=' . rawurlencode($fileKey),
                ];
              }
              // Found the book, exit the file loop
              break;
            }
          } catch (Throwable $e) {
            // Пропускаем битые БД
            continue;
          }
        }
      }
      
      api_response([
        'ok' => true,
        'db' => 'multiple', // Указываем что проверялись несколько БД
        'updates' => $updates,
        'totalCount' => count($updates),
      ]);
      break;

    case 'exportBook':
      // Экспорт книги в JSON под авторизацией
      // Если db не указан, возвращаем все доступные справочники
      $db = $_GET['db'] ?? '';
      $fileKey = (string)($_GET['fileKey'] ?? '');
      
      if ($db === '') {
        // Режим "все справочники" - возвращаем список всех книг во всех БД
        $list = sqlite_files_get_list();
        $allBooks = [];
        
        foreach ($list['files'] as $file) {
          if (empty($file['is_sqlite'])) continue;
          
          try {
            $pdo = api_pdo_sqlite($file['path']);
            api_init_schema($pdo);
            $stmt = $pdo->query('SELECT file_key FROM song_books ORDER BY file_key');
            $books = $stmt->fetchAll(PDO::FETCH_COLUMN);
            
            foreach ($books as $bookFileKey) {
              if ($bookFileKey === '') continue;
              $version = api_song_book_get_version($pdo, $bookFileKey);
              
              // Формируем URL для экспорта этой конкретной книги
              $exportUrl = 'api.php?action=exportBook&db=' . rawurlencode($file['name']) . '&fileKey=' . rawurlencode($bookFileKey);
              
              $allBooks[] = [
                'fileKey' => $bookFileKey,
                'dbName' => $file['name'],
                'version' => $version,
                'exportUrl' => $exportUrl,
              ];
            }
          } catch (Throwable $e) {
            // Пропускаем БД с ошибками
            continue;
          }
        }
        
        api_response([
          'ok' => true,
          'books' => $allBooks,
          'totalCount' => count($allBooks),
        ]);
        break;
      }
      
      // Режим конкретной БД
      [$dbPath, $dbName] = api_get_db_path_and_name();
      $pdo = api_pdo_sqlite($dbPath);
      api_init_schema($pdo);
      
      if ($fileKey === '') {
        // Если fileKey не указан, пробуем авто-выбор: одна единственная книга в song_books
        $rows = $pdo->query('SELECT file_key FROM song_books ORDER BY file_key')->fetchAll();
        if (count($rows) === 1) {
          $fileKey = (string)$rows[0]['file_key'];
        } else {
          api_error('fileKey required', 400, [
            'availableFileKeys' => array_map(static fn($r) => $r['file_key'], $rows),
          ]);
          break;
        }
      }

      $res = api_export_book($pdo, $fileKey);
      if (!$res['ok']) {
        api_error($res['error'], 404);
        break;
      }
      
      // Возвращаем напрямую данные книги без обёртки ok/data
      api_response($res['data']);
      break;

    default:
      api_error('Unknown action: ' . $action, 404);
  }
} catch (Throwable $e) {
  api_error('Internal server error', 500, [
    'exception' => [
      'message' => $e->getMessage(),
      // Детали стека при необходимости можно выключить на проде
      'type' => get_class($e),
    ],
  ]);
}
