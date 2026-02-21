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
$mode = $_POST['mode'] ?? '';

if ($admin_key !== ADMIN_KEY) {
    respond(403, ['status' => 'error', 'error' => 'Forbidden']);
}

if (!in_array($mode, ['ids', 'key_hash', 'time_range', 'model'], true)) {
    respond(400, ['status' => 'error', 'error' => 'Invalid mode']);
}

try {
    $pdo = get_pdo();

    if ($mode === 'ids') {
        $ids_raw = $_POST['ids'] ?? '';
        $ids = array_filter(array_map('trim', explode(',', $ids_raw)));
        $ids = array_values(array_filter($ids, function ($id) {
            return preg_match('/^\d{18}$/', $id);
        }));
        if (empty($ids)) {
            respond(400, ['status' => 'error', 'error' => 'No valid ids']);
        }
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $pdo->prepare("DELETE FROM chat_sessions WHERE id IN ($placeholders)");
        $stmt->execute($ids);
        echo json_encode(['status' => 'success', 'deleted' => $stmt->rowCount()]);
        exit;
    }

    if ($mode === 'key_hash') {
        $key_hash = $_POST['key_hash'] ?? '';
        if (empty($key_hash) || !preg_match('/^[a-f0-9]{64}$/', $key_hash)) {
            respond(400, ['status' => 'error', 'error' => 'Invalid key_hash']);
        }
        $stmt = $pdo->prepare('DELETE FROM chat_sessions WHERE key_hash = ?');
        $stmt->execute([$key_hash]);
        echo json_encode(['status' => 'success', 'deleted' => $stmt->rowCount()]);
        exit;
    }

    if ($mode === 'time_range') {
        $time_from = $_POST['time_from'] ?? '';
        $time_to = $_POST['time_to'] ?? '';
        if ($time_from === '' || $time_to === '') {
            respond(400, ['status' => 'error', 'error' => 'time_from and time_to required']);
        }
        $from = date('Y-m-d H:i:s', strtotime($time_from));
        $to = date('Y-m-d H:i:s', strtotime($time_to));
        if ($from === false || $to === false) {
            respond(400, ['status' => 'error', 'error' => 'Invalid datetime format']);
        }
        $stmt = $pdo->prepare('DELETE FROM chat_sessions WHERE updated_at >= ? AND updated_at <= ?');
        $stmt->execute([$from, $to]);
        echo json_encode(['status' => 'success', 'deleted' => $stmt->rowCount()]);
        exit;
    }

    if ($mode === 'model') {
        $model = trim($_POST['model'] ?? '');
        if ($model === '') {
            respond(400, ['status' => 'error', 'error' => 'model required']);
        }
        $stmt = $pdo->prepare('DELETE FROM chat_sessions WHERE model = ?');
        $stmt->execute([$model]);
        echo json_encode(['status' => 'success', 'deleted' => $stmt->rowCount()]);
        exit;
    }

    respond(400, ['status' => 'error', 'error' => 'Invalid mode']);
} catch (PDOException $e) {
    respond(500, ['status' => 'error', 'error' => 'Database write failed']);
}
