<?php
declare(strict_types=1);

function api_setup_cors(): void {
  $origin = $_SERVER['HTTP_ORIGIN'] ?? '*';
  header('Access-Control-Allow-Origin: ' . $origin);
  header('Vary: Origin');
  header('Access-Control-Allow-Credentials: true');
  header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
  // Разрешаем заголовки, которые нужны фронтенду для токен-авторизации (в т.ч. с localhost)
  header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-Auth-Token, Accept');
}

function api_handle_options_preflight(): void {
  if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
  }
}
