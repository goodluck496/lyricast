<?php
declare(strict_types=1);

// Простой просмотрщик песен из SQLite-файла.
// URL: sqlite-songs.php?db=songs.sqlite&page=1

if (!defined('DATA_DIR')) {
  date_default_timezone_set('Asia/Bishkek');
  define('DATA_DIR', __DIR__ . DIRECTORY_SEPARATOR . 'data');
}
if (!defined('DB_NAME_REGEX')) {
  define('DB_NAME_REGEX', '/^[a-zA-Z0-9._-]+\.sqlite$/');
}

const SONGS_PER_PAGE = 50;

function ss_get_db_path_and_name(): array {
  $db = $_GET['db'] ?? '';
  $db = (string)$db;

  if ($db === '' || !preg_match(DB_NAME_REGEX, $db)) {
    http_response_code(400);
    echo 'Неверное имя файла БД. Используйте *.sqlite с [a-zA-Z0-9._-]';
    exit;
  }

  $path = DATA_DIR . DIRECTORY_SEPARATOR . $db;
  if (!is_file($path)) {
    http_response_code(404);
    echo 'Файл БД не найден: ' . htmlspecialchars($db, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    exit;
  }

  return [$path, $db];
}

function ss_pdo_sqlite(string $dbPath): PDO {
  $pdo = new PDO('sqlite:' . $dbPath, null, null, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
  ]);
  return $pdo;
}

function ss_get_page(): int {
  $page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
  if ($page < 1) $page = 1;
  return $page;
}

function ss_fetch_songs(PDO $pdo, int $page): array {
  $limit = SONGS_PER_PAGE;
  $offset = ($page - 1) * $limit;

  // Считаем общее количество песен
  $total = (int)$pdo->query('SELECT COUNT(*) AS c FROM songs')->fetchColumn();

  // Берём песни, сортируя по номеру и книге
  $stmt = $pdo->prepare('SELECT s.id, s.number, s.title, s.author, s.book_file_key, b.header_updated_at
    FROM songs s
    LEFT JOIN song_books b ON b.file_key = s.book_file_key
    ORDER BY s.book_file_key, s.number
    LIMIT :limit OFFSET :offset');
  $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
  $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
  $stmt->execute();

  $rows = $stmt->fetchAll();

  return [
    'total' => $total,
    'rows' => $rows,
    'page' => $page,
    'pages' => $limit > 0 ? (int)max(1, ceil($total / $limit)) : 1,
    'limit' => $limit,
  ];
}

function ss_render_songs_table(): void {
  [$dbPath, $dbName] = ss_get_db_path_and_name();
  $page = ss_get_page();

  try {
    $pdo = ss_pdo_sqlite($dbPath);
    $data = ss_fetch_songs($pdo, $page);
  } catch (Throwable $e) {
    http_response_code(500);
    echo 'Ошибка при чтении БД: ' . htmlspecialchars($e->getMessage(), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    return;
  }

  $rows = $data['rows'];
  $total = $data['total'];
  $pages = $data['pages'];
  $currentPage = $data['page'];
  ?>
  <h1>Песни в БД: <?php echo htmlspecialchars($dbName, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?></h1>
  <p class="muted">Всего песен: <?php echo (int)$total; ?>. Страница <?php echo (int)$currentPage; ?> из <?php echo (int)$pages; ?>.</p>

  <table>
    <tr>
      <th>#</th>
      <th>Номер</th>
      <th>Название</th>
      <th>Книга (file_key)</th>
      <th>Автор</th>
      <th>Последнее изменение (книга)</th>
      <th>Действия</th>
    </tr>
    <?php if (!$rows): ?>
      <tr>
        <td colspan="7" class="muted">Нет песен</td>
      </tr>
    <?php else: ?>
      <?php
      $i = ($currentPage - 1) * SONGS_PER_PAGE;
      foreach ($rows as $row):
        $i++;
      ?>
        <tr>
          <td><?php echo $i; ?></td>
          <td><?php echo (int)$row['number']; ?></td>
          <td><?php echo htmlspecialchars((string)$row['title'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?></td>
          <td><?php echo htmlspecialchars((string)$row['book_file_key'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?></td>
          <td><?php echo htmlspecialchars((string)$row['author'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?></td>
          <td><?php echo htmlspecialchars((string)($row['header_updated_at'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?></td>
          <td>
            <!-- Здесь позже появится кнопка/ссылка для формы редактирования (Angular/PrimeNG) -->
            <button type="button" disabled>Редактировать (позже)</button>
          </td>
        </tr>
      <?php endforeach; ?>
    <?php endif; ?>
  </table>

  <?php if ($pages > 1): ?>
    <div class="pagination">
      <?php for ($p = 1; $p <= $pages; $p++): ?>
        <?php if ($p === $currentPage): ?>
          <span class="current-page"><?php echo $p; ?></span>
        <?php else: ?>
          <a href="?db=<?php echo urlencode($dbName); ?>&amp;page=<?php echo $p; ?>"><?php echo $p; ?></a>
        <?php endif; ?>
      <?php endfor; ?>
    </div>
  <?php endif; ?>
  <?php
}

// Если скрипт вызывается напрямую, рисуем простую страницу-обёртку
if (php_sapi_name() !== 'cli' && (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === basename(__FILE__))) {
  ?><!doctype html>
  <html lang="ru">
  <head>
    <meta charset="utf-8">
    <title>Песни в SQLite</title>
    <style>
      body {
        font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        background: #111;
        color: #eee;
        padding: 24px;
      }
      table {
        border-collapse: collapse;
        width: 100%;
        max-width: 1100px;
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
      .pagination {
        margin-top: 16px;
      }
      .pagination a,
      .pagination span {
        display: inline-block;
        margin-right: 8px;
        padding: 4px 8px;
        border-radius: 4px;
        border: 1px solid #333;
      }
      .pagination .current-page {
        background: #4ea1ff;
        color: #000;
        border-color: #4ea1ff;
      }
      button[disabled] {
        opacity: 0.4;
        cursor: not-allowed;
      }
    </style>
  </head>
  <body>
    <?php ss_render_songs_table(); ?>
  </body>
  </html><?php
}
