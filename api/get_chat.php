<?php
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/db.php';

function respond($code, $payload) {
    http_response_code($code);
    echo json_encode($payload);
    exit;
}

// 1. 获取参数 (建议使用 POST 以避免 Key 留在服务器日志中)
$key = $_POST['key'] ?? '';
$id = $_POST['id'] ?? '';

// 2. 验证 Key 格式 (sha256 hex)
if (empty($key) || !preg_match('/^[a-f0-9]{64}$/', $key)) {
    respond(400, ['status' => 'error', 'error' => 'Invalid key format']);
}

// 3. 验证 ID 格式 (必须是18位纯数字)
if (empty($id) || !preg_match('/^\d{18}$/', $id)) {
    respond(400, ['status' => 'error', 'error' => 'Invalid ID format']);
}

// 4. 查询数据库
try {
    $pdo = get_pdo();
    $stmt = $pdo->prepare('SELECT content, title, model FROM chat_sessions WHERE key_hash = ? AND id = ? LIMIT 1');
    $stmt->execute([$key, $id]);
    $row = $stmt->fetch();

    if ($row && isset($row['content'])) {
        echo json_encode([
            'status' => 'success',
            'content' => $row['content'],
            'title' => $row['title'] ?? '',
            'model' => $row['model'] ?? '',
        ]);
        exit;
    }
} catch (PDOException $e) {
    respond(500, ['status' => 'error', 'error' => 'Database query failed']);
}

respond(404, ['status' => 'error', 'error' => 'Chat not found']);
?>
