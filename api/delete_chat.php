<?php
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/db.php';

function respond($code, $payload) {
    http_response_code($code);
    echo json_encode($payload);
    exit;
}

$key = $_POST['key'] ?? '';
$id = $_POST['id'] ?? '';

if (empty($key) || !preg_match('/^[a-f0-9]{64}$/', $key)) {
    respond(400, ['status' => 'error', 'error' => 'Invalid key format']);
}

if (empty($id) || !preg_match('/^\d{18}$/', $id)) {
    respond(400, ['status' => 'error', 'error' => 'Invalid ID format']);
}

try {
    $pdo = get_pdo();
    $stmt = $pdo->prepare('DELETE FROM chat_sessions WHERE key_hash = ? AND id = ?');
    $stmt->execute([$key, $id]);

    if ($stmt->rowCount() === 0) {
        respond(404, ['status' => 'error', 'error' => 'Chat not found']);
    }

    echo json_encode(['status' => 'success']);
    exit;
} catch (PDOException $e) {
    respond(500, ['status' => 'error', 'error' => 'Database write failed']);
}
?>
