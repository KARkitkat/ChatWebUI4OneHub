<?php
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/db.php';

function respond($code, $payload) {
    http_response_code($code);
    echo json_encode($payload);
    exit;
}

function normalize_title($title) {
    $title = preg_replace('/\s+/u', ' ', (string)$title);
    $title = trim(preg_replace('/[[:cntrl:]]/u', '', $title));
    if ($title === '') {
        return '';
    }
    if (function_exists('mb_substr')) {
        if (mb_strlen($title, 'UTF-8') > 60) {
            $title = mb_substr($title, 0, 60, 'UTF-8');
        }
    } else {
        if (strlen($title) > 60) {
            $title = substr($title, 0, 60);
        }
    }
    return $title;
}

$key = $_POST['key'] ?? '';
$id = $_POST['id'] ?? '';
$title = $_POST['title'] ?? '';

if (empty($key) || !preg_match('/^[a-f0-9]{64}$/', $key)) {
    respond(400, ['status' => 'error', 'error' => 'Invalid key format']);
}

if (empty($id) || !preg_match('/^\d{18}$/', $id)) {
    respond(400, ['status' => 'error', 'error' => 'Invalid ID format']);
}

$title = normalize_title($title);
if ($title === '') {
    respond(400, ['status' => 'error', 'error' => 'Title cannot be empty']);
}

try {
    $pdo = get_pdo();
    $stmt = $pdo->prepare('UPDATE chat_sessions SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE key_hash = ? AND id = ?');
    $stmt->execute([$title, $key, $id]);

    if ($stmt->rowCount() === 0) {
        $check = $pdo->prepare('SELECT 1 FROM chat_sessions WHERE key_hash = ? AND id = ? LIMIT 1');
        $check->execute([$key, $id]);
        if (!$check->fetchColumn()) {
            respond(404, ['status' => 'error', 'error' => 'Chat not found']);
        }
    }

    echo json_encode(['status' => 'success', 'title' => $title]);
    exit;
} catch (PDOException $e) {
    respond(500, ['status' => 'error', 'error' => 'Database write failed']);
}
?>
