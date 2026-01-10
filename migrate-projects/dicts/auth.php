<?php
declare(strict_types=1);

require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/auth-lib.php';

api_setup_cors();
api_handle_options_preflight();

$configPath = auth_get_config_path();
$styleStr = '<style>.auth{width: 100vw; height: 100vh; position: absolute; left: 0; top: 0; overflow: hidden; display: flex; flex-direction: column; align-items: center; justify-content: center; }</style>';

try {
  $cfg = auth_load_mysql_config($configPath);
  $pdo = auth_pdo_mysql($cfg);
  auth_ensure_schema($pdo);
} catch (Throwable $e) {
  http_response_code(500);
  header('Content-Type: text/plain; charset=utf-8');
  echo 'Auth configuration error: ' . $e->getMessage();
  exit;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$accept = $_SERVER['HTTP_ACCEPT'] ?? '';
$accept = is_string($accept) ? $accept : '';
$wantsJson = stripos($accept, 'application/json') !== false;

if ($method === 'POST') {
  $email = isset($_POST['email']) && is_string($_POST['email']) ? trim($_POST['email']) : '';

  try {
    $info = auth_ensure_user_and_device($pdo, $email);
  } catch (Throwable $e) {
    $error = $e->getMessage();

    if ($wantsJson) {
      http_response_code(401);
      header('Content-Type: application/json; charset=utf-8');
      echo json_encode([
        'ok' => false,
        'error' => $error,
      ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
      exit;
    }

    render_form($error, $email, $styleStr);
    exit;
  }

  if (!$info['is_allowed']) {
    // устройство не разрешено
    $error = 'Для этого email уже есть другое разрешённое устройство. Доступ с текущего устройства запрещён.';
    if ($wantsJson) {
      http_response_code(403);
      header('Content-Type: application/json; charset=utf-8');
      echo json_encode([
        'ok' => false,
        'error' => $error,
      ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
      exit;
    }

    render_form($error, $email, $styleStr);
    exit;
  }

  $token = auth_create_session($pdo, $info['user_id'], $info['device_id']);

  setcookie('auth_token', $token, [
    'expires' => time() + 86400,
    'path' => '/',
    'secure' => isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
    'httponly' => true,
    'samesite' => 'Lax',
  ]);

  // Ответ при успешной авторизации
  if ($wantsJson) {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
      'ok' => true,
      'token' => $token,
      'userId' => (int)$info['user_id'],
      'deviceId' => (int)$info['device_id'],
      'expiresIn' => 86400,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
  }

  // Для обычного браузера — редирект или HTML-страница
  $redirect = $_GET['return'] ?? ($_POST['return'] ?? '');
  if (is_string($redirect) && $redirect !== '') {
    header('Location: ' . $redirect, true, 302);
    exit;
  }

  header('Content-Type: text/html; charset=utf-8');
  echo '<!doctype html><html><head><meta charset="utf-8"><title>Авторизация успешна</title>';
  echo $styleStr;
  echo '</head><body>';
  echo '<div class="auth">Авторизация успешна. Теперь вы можете вернуться в приложение.</div>';
  echo '</body></html>';
  exit;
}
  
render_form(null, '', $styleStr);

function render_form(?string $error, string $email, string $styleStr): void {
  header('Content-Type: text/html; charset=utf-8');
  echo '<!doctype html><html><head><meta charset="utf-8"><title>Авторизация</title>';
  echo $styleStr;
  echo '</head><body>';
  echo '<div class="auth"><h1>Авторизация</h1>';
  if ($error) {
    echo '<p style="color:red">' . htmlspecialchars($error, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</p>';
  }
  echo '<form method="post">';
  echo '<label>Email: <input type="email" name="email" required value="' . htmlspecialchars($email, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '"></label>';
  if (!empty($_GET['return']) && is_string($_GET['return'])) {
    $ret = htmlspecialchars($_GET['return'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    echo '<input type="hidden" name="return" value="' . $ret . '">';
  }
  echo '<button type="submit">Войти</button>';
  echo '</form>';
  echo '</div></body></html>';
}
