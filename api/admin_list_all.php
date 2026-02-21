<?php
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/db.php';

function respond($code, $payload) {
    http_response_code($code);
    echo json_encode($payload);
    exit;
}

// 管理员密钥（仅后端校验，与前端一致）
define('ADMIN_KEY', '1234567890');

$admin_key = $_POST['admin_key'] ?? '';

if ($admin_key !== ADMIN_KEY) {
    respond(403, ['status' => 'error', 'error' => 'Forbidden']);
}

try {
    $pdo = get_pdo();
    $stmt = $pdo->query('SELECT key_hash, id, title, model, content, updated_at FROM chat_sessions ORDER BY updated_at DESC');
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $list = [];
    foreach ($rows as $row) {
        $list[] = [
            'key_hash' => $row['key_hash'] ?? '',
            'id' => $row['id'] ?? '',
            'title' => $row['title'] ?? '',
            'model' => $row['model'] ?? '',
            'content' => $row['content'] ?? '',
            'updated_at' => $row['updated_at'] ?? '',
        ];
    }

    echo json_encode(['status' => 'success', 'list' => $list]);
    exit;
} catch (PDOException $e) {
    respond(500, ['status' => 'error', 'error' => 'Database query failed']);
}
