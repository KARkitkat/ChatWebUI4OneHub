<?php
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/db.php';

function respond($code, $payload) {
    http_response_code($code);
    echo json_encode($payload);
    exit;
}

define('ADMIN_KEY', '1234567890');

$admin_key = $_POST['admin_key'] ?? '';
$id = $_POST['id'] ?? '';

if ($admin_key !== ADMIN_KEY) {
    respond(403, ['status' => 'error', 'error' => 'Forbidden']);
}

if (empty($id) || !preg_match('/^\d{18}$/', $id)) {
    respond(400, ['status' => 'error', 'error' => 'Invalid ID format']);
}

try {
    $pdo = get_pdo();
    $stmt = $pdo->prepare('DELETE FROM chat_sessions WHERE id = ?');
    $stmt->execute([$id]);

    if ($stmt->rowCount() === 0) {
        respond(404, ['status' => 'error', 'error' => 'Chat not found']);
    }

    echo json_encode(['status' => 'success']);
    exit;
} catch (PDOException $e) {
    respond(500, ['status' => 'error', 'error' => 'Database write failed']);
}
