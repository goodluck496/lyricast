<?php
declare(strict_types=1);

// Общие функции авторизации через MySQL

function auth_get_config_path(): string {
  // Конфиг MySQL вынесен на уровень корня хостинг-юзера, на ~5 уровней выше каталога api
  // Имя файла: lyricast.mysql.config
  return dirname(__DIR__, 5) . '/lyricast.mysql.config';
}

function auth_load_mysql_config(string $path): array {
  if (!is_file($path)) {
    throw new RuntimeException('mysql.config not found');
  }
  $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
  if ($lines === false) {
    throw new RuntimeException('Cannot read mysql.config');
  }
  $cfg = [];
  foreach ($lines as $ln) {
    $ln = trim($ln);
    // пропускаем комментарии и маркеры ```
    if ($ln === '' || $ln[0] === '#' || substr($ln, 0, 3) === '```') continue;
    $pos = strpos($ln, '=');
    if ($pos === false) continue;
    $k = strtoupper(trim(substr($ln, 0, $pos)));
    $v = trim(substr($ln, $pos + 1));
    if ($k !== '') {
      $cfg[$k] = $v;
    }
  }
  return $cfg;
}

function auth_pdo_mysql(array $cfg): PDO {
  $host = $cfg['HOST'] ?? 'localhost';
  $port = isset($cfg['PORT']) ? (int)$cfg['PORT'] : 3306;
  $db   = $cfg['DB'] ?? '';
  $user = $cfg['USER'] ?? '';
  $pass = $cfg['PASS'] ?? '';
  $charset = $cfg['CHARSET'] ?? 'utf8mb4';

  if ($db === '' || $user === '') {
    throw new RuntimeException('MySQL DB/USER not configured');
  }

  $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=%s', $host, $port, $db, $charset);
  $pdo = new PDO($dsn, $user, $pass, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
  ]);
  return $pdo;
}

function auth_ensure_schema(PDO $pdo): void {
  // users
  $pdo->exec('CREATE TABLE IF NOT EXISTS auth_users (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP NULL,
    last_ip VARCHAR(64) NULL,
    last_user_agent TEXT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');

  // devices
  $pdo->exec('CREATE TABLE IF NOT EXISTS auth_devices (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    device_hash VARCHAR(255) NOT NULL,
    user_agent TEXT NULL,
    ip VARCHAR(64) NULL,
    is_allowed TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TIMESTAMP NULL,
    UNIQUE KEY uq_user_device (user_id, device_hash),
    CONSTRAINT fk_device_user FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');

  // sessions
  $pdo->exec('CREATE TABLE IF NOT EXISTS auth_sessions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    device_id BIGINT UNSIGNED NULL,
    token VARCHAR(255) NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TIMESTAMP NULL,
    ip VARCHAR(64) NULL,
    user_agent TEXT NULL,
    CONSTRAINT fk_session_user FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE,
    CONSTRAINT fk_session_device FOREIGN KEY (device_id) REFERENCES auth_devices(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');

  // allowed emails (whitelist)
  $pdo->exec('CREATE TABLE IF NOT EXISTS auth_allowed_emails (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    comment VARCHAR(255) NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
}

function auth_device_fingerprint(): string {
  $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
  $lang = $_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? '';
  // Фингерпринт завязан только на браузер (User-Agent) и язык, чтобы
  // запросы из того же браузера (включая async fetch/XHR) считались одним устройством.
  $raw = $ua . '|' . $lang;
  return hash('sha256', $raw);
}

function auth_ensure_user_and_device(PDO $pdo, string $email): array {
  $emailNorm = strtolower(trim($email));
  if ($emailNorm === '' || !filter_var($emailNorm, FILTER_VALIDATE_EMAIL)) {
    throw new RuntimeException('Invalid email');
  }

  // Проверяем, что email разрешён в таблице auth_allowed_emails
  $stmt = $pdo->prepare('SELECT id, is_active FROM auth_allowed_emails WHERE email = :email LIMIT 1');
  $stmt->execute([':email' => $emailNorm]);
  $allowedRow = $stmt->fetch();
  if (!$allowedRow || (int)$allowedRow['is_active'] !== 1) {
    throw new RuntimeException('Email is not allowed');
  }

  $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
  $ip = $_SERVER['REMOTE_ADDR'] ?? '';
  $now = (new DateTimeImmutable())->format('Y-m-d H:i:s');
  $deviceHash = auth_device_fingerprint();

  // user
  $stmt = $pdo->prepare('SELECT * FROM auth_users WHERE email = :email');
  $stmt->execute([':email' => $emailNorm]);
  $user = $stmt->fetch();
  if (!$user) {
    $ins = $pdo->prepare('INSERT INTO auth_users (email, last_login_at, last_ip, last_user_agent) VALUES (:email, :last_login_at, :ip, :ua)');
    $ins->execute([
      ':email' => $emailNorm,
      ':last_login_at' => $now,
      ':ip' => $ip,
      ':ua' => $ua,
    ]);
    $userId = (int)$pdo->lastInsertId();
  } else {
    $userId = (int)$user['id'];
    $upd = $pdo->prepare('UPDATE auth_users SET last_login_at = :last_login_at, last_ip = :ip, last_user_agent = :ua WHERE id = :id');
    $upd->execute([
      ':last_login_at' => $now,
      ':ip' => $ip,
      ':ua' => $ua,
      ':id' => $userId,
    ]);
  }

  // device
  $stmt = $pdo->prepare('SELECT * FROM auth_devices WHERE user_id = :uid AND device_hash = :dh');
  $stmt->execute([':uid' => $userId, ':dh' => $deviceHash]);
  $device = $stmt->fetch();

  if ($device) {
    $deviceId = (int)$device['id'];
    $upd = $pdo->prepare('UPDATE auth_devices SET last_seen_at = :ls, ip = :ip, user_agent = :ua WHERE id = :id');
    $upd->execute([
      ':ls' => $now,
      ':ip' => $ip,
      ':ua' => $ua,
      ':id' => $deviceId,
    ]);
    $isAllowed = (int)$device['is_allowed'] === 1;
  } else {
    // Проверяем, есть ли уже хоть одно разрешённое устройство у пользователя
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM auth_devices WHERE user_id = :uid AND is_allowed = 1');
    $stmt->execute([':uid' => $userId]);
    $hasAllowed = (int)$stmt->fetchColumn() > 0;
    $isAllowed = !$hasAllowed;

    $ins = $pdo->prepare('INSERT INTO auth_devices (user_id, device_hash, user_agent, ip, is_allowed, last_seen_at) VALUES (:uid, :dh, :ua, :ip, :allowed, :ls)');
    $ins->execute([
      ':uid' => $userId,
      ':dh' => $deviceHash,
      ':ua' => $ua,
      ':ip' => $ip,
      ':allowed' => $isAllowed ? 1 : 0,
      ':ls' => $now,
    ]);
    $deviceId = (int)$pdo->lastInsertId();
  }

  return [
    'user_id' => $userId,
    'device_id' => $deviceId,
    'is_allowed' => $isAllowed,
  ];
}

function auth_create_session(PDO $pdo, int $userId, ?int $deviceId, int $ttlSeconds = 86400): string {
  $token = bin2hex(random_bytes(32));
  $now = new DateTimeImmutable();
  $expires = $now->add(new DateInterval('PT' . $ttlSeconds . 'S'))->format('Y-m-d H:i:s');
  $ip = $_SERVER['REMOTE_ADDR'] ?? '';
  $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';

  $ins = $pdo->prepare('INSERT INTO auth_sessions (user_id, device_id, token, expires_at, last_seen_at, ip, user_agent) VALUES (:uid, :did, :token, :expires_at, :ls, :ip, :ua)');
  $ins->execute([
    ':uid' => $userId,
    ':did' => $deviceId,
    ':token' => $token,
    ':expires_at' => $expires,
    ':ls' => $now->format('Y-m-d H:i:s'),
    ':ip' => $ip,
    ':ua' => $ua,
  ]);

  return $token;
}

function auth_extract_token_from_request(): ?string {
  // 1) Authorization: Bearer <token>
  $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['Authorization'] ?? null) ?? ($_SERVER['authorization'] ?? null);
  
  // Альтернативный способ получения заголовков (для Apache/Nginx)
  if ($auth === null && function_exists('apache_request_headers')) {
    $headers = apache_request_headers();
    $auth = $headers['Authorization'] ?? $headers['authorization'] ?? null;
  }
  
  // Еще один fallback - проверяем все HTTP_* переменные
  if ($auth === null) {
    foreach ($_SERVER as $key => $value) {
      if (strpos(strtolower($key), 'authorization') !== false) {
        $auth = $value;
        break;
      }
    }
  }
  
  if (is_string($auth) && stripos($auth, 'Bearer ') === 0) {
    $token = trim(substr($auth, 7));
    if ($token !== '') return $token;
  }

  // 2) X-Auth-Token заголовок
  $headerToken = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? null;
  if (is_string($headerToken) && $headerToken !== '') {
    return $headerToken;
  }

  // 3) Fallback: кука auth_token (для старого браузерного флоу)
  if (!empty($_COOKIE['auth_token']) && is_string($_COOKIE['auth_token'])) {
    return $_COOKIE['auth_token'];
  }

  return null;
}

function auth_validate_cookie_session(): ?array {
  $token = auth_extract_token_from_request();
  if ($token === null || $token === '') {
    return null;
  }

  // Используем общий helper пути к MySQL-конфигу
  $configPath = auth_get_config_path();
  try {
    $cfg = auth_load_mysql_config($configPath);
    $pdo = auth_pdo_mysql($cfg);
    auth_ensure_schema($pdo);
  } catch (Throwable $e) {
    return null;
  }

  $now = (new DateTimeImmutable())->format('Y-m-d H:i:s');

  $stmt = $pdo->prepare('SELECT s.*, d.is_allowed AS device_allowed, u.email
    FROM auth_sessions s
    LEFT JOIN auth_devices d ON d.id = s.device_id
    LEFT JOIN auth_users u ON u.id = s.user_id
    WHERE s.token = :token AND s.expires_at > :now');
  $stmt->execute([':token' => $token, ':now' => $now]);
  $row = $stmt->fetch();
  if (!$row) {
    return null;
  }

  if (isset($row['device_allowed']) && (int)$row['device_allowed'] === 0) {
    return null;
  }

  // обновляем last_seen
  $upd = $pdo->prepare('UPDATE auth_sessions SET last_seen_at = :ls WHERE id = :id');
  $upd->execute([
    ':ls' => $now,
    ':id' => $row['id'],
  ]);

  return $row;
}
