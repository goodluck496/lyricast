<?php
declare(strict_types=1);

// Локальные константы такие же, как в creator.php, но определяем только если их ещё нет
if (!defined('DATA_DIR')) {
  date_default_timezone_set('Asia/Bishkek');
  define('DATA_DIR', __DIR__ . DIRECTORY_SEPARATOR . 'data');
}
if (!defined('DB_NAME_REGEX')) {
  define('DB_NAME_REGEX', '/^[a-zA-Z0-9._-]+\\.sqlite$/');
}

function sqlite_files_get_list(): array {
  $dir = DATA_DIR;
  if (!is_dir($dir)) {
    return ['dir' => $dir, 'files' => [], 'error' => 'DATA_DIR не существует'];
  }

  $raw = scandir($dir) ?: [];
  $files = [];
  foreach ($raw as $f) {
    if ($f === '.' || $f === '..') continue;
    $full = $dir . DIRECTORY_SEPARATOR . $f;
    if (!is_file($full)) continue;
    $files[] = [
      'name' => $f,
      'path' => $full,
      'size' => @filesize($full) ?: 0,
      'mtime' => @filemtime($full) ?: 0,
      'is_sqlite' => (bool)preg_match(DB_NAME_REGEX, $f),
    ];
  }

  return ['dir' => $dir, 'files' => $files, 'error' => null];
}

function render_sqlite_files_table(): void {
  $data = sqlite_files_get_list();
  $dir = $data['dir'];
  $files = $data['files'];
  $error = $data['error'];
  // Не показываем полный путь до public_html, только имя каталога
  $displayDir = basename($dir);
  ?>
  <hr style="margin: 32px 0; border-color: #333;" />
  <h2>Файлы в DATA_DIR</h2>
  <p class="muted">Каталог: <code><?php echo htmlspecialchars($displayDir, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?></code></p>
  <?php if ($error): ?>
    <p class="muted"><?php echo htmlspecialchars($error, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?></p>
    <?php return; endif; ?>

  <table>
    <tr>
      <th>Имя файла</th>
      <th>Размер</th>
      <th>Обновлён</th>
      <th>Действия</th>
    </tr>
    <?php foreach ($files as $file): ?>
      <tr>
        <td>
          <?php echo htmlspecialchars($file['name'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>
          <?php if ($file['is_sqlite']): ?>
            <span class="muted">(sqlite)</span>
          <?php endif; ?>
        </td>
        <td><?php echo number_format((float)$file['size'], 0, '.', ' '); ?> байт</td>
        <td><?php echo $file['mtime'] ? date('Y-m-d H:i:s', (int)$file['mtime']) : '-'; ?></td>
        <td>
          <?php if ($file['is_sqlite']): ?>
            <?php $dbName = $file['name']; ?>
            <a href="sqlite-creator.php?action=download&amp;db=<?php echo urlencode($dbName); ?>">SQLite</a>
            |
            <a href="sqlite-songs.php?db=<?php echo urlencode($dbName); ?>">Песни</a>
            |
            <a href="sqlite-creator.php?action=exportBook&amp;db=<?php echo urlencode($dbName); ?>">JSON</a>
            |
            <form method="post" action="api.php" class="delete-row">
              <input type="hidden" name="action" value="db.delete" />
              <input type="hidden" name="db" value="<?php echo htmlspecialchars($dbName, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>" />
              <input type="hidden" name="returnUrl" value="sqlite-creator.php" />
              <a href="#" style="color:#ff6b6b;" onclick="return (confirm('Удалить файл <?php echo htmlspecialchars($dbName, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?> и связанные файлы?') ? (this.closest('form').submit(), false) : false);">Удалить</a>
            </form>
          <?php else: ?>
            <span class="muted">—</span>
          <?php endif; ?>
        </td>
      </tr>
    <?php endforeach; ?>
  </table>

  <p style="margin-top:16px;" class="muted">
    Файлы с расширением <code>.sqlite</code> можно скачать через <code>sqlite-creator.php?action=download&amp;db=...</code>,
    а также выгрузить книгу в JSON через <code>sqlite-creator.php?action=exportBook&amp;db=...&amp;fileKey=...</code>.
  </p>
  <?php
}

// Если скрипт вызывается напрямую, отрисуем простую страницу-обёртку
if (php_sapi_name() !== 'cli' && (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === basename(__FILE__))) {
  ?><!doctype html>
  <html lang="ru">
  <head>
    <meta charset="utf-8">
    <title>SQLite файлы (DATA_DIR)</title>
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
    <?php render_sqlite_files_table(); ?>
  </body>
  </html><?php
}
