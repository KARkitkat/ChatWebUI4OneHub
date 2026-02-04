<?php
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/db.php';

function respond($code, $payload) {
    http_response_code($code);
    echo json_encode($payload);
    exit;
}

// 1. 获取 key
$key = $_POST['key'] ?? '';

// 2. 校验 key：前端传的是 sha256 hex
if (empty($key) || !preg_match('/^[a-f0-9]{64}$/', $key)) {
    respond(400, ['status' => 'error', 'error' => 'Invalid key format']);
}

// 3. 查询数据库（按更新时间倒序）
try {
    $pdo = get_pdo();
    $stmt = $pdo->prepare('SELECT id, title, model FROM chat_sessions WHERE key_hash = ? ORDER BY updated_at DESC');
    $stmt->execute([$key]);
    $rows = $stmt->fetchAll();

    $result = [];
    foreach ($rows as $row) {
        if (!isset($row['id'])) {
            continue;
        }
        $result[] = [
            'id' => $row['id'],
            'title' => $row['title'] ?? '',
            'model' => $row['model'] ?? '',
        ];
    }

    echo json_encode($result);
    exit;
} catch (PDOException $e) {
    respond(500, ['status' => 'error', 'error' => 'Database query failed']);
}
?>
