<?php
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/db.php';

function respond($code, $payload) {
    http_response_code($code);
    echo json_encode($payload);
    exit;
}

function generateId() {
    $id = '';
    for ($i = 0; $i < 18; $i++) {
        $id .= strval(random_int(0, 9));
    }
    return $id;
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

function normalize_model($model) {
    $model = preg_replace('/\s+/u', ' ', (string)$model);
    $model = trim(preg_replace('/[[:cntrl:]]/u', '', $model));
    if ($model === '') {
        return '';
    }
    $maxLen = 100;
    if (function_exists('mb_substr')) {
        if (mb_strlen($model, 'UTF-8') > $maxLen) {
            $model = mb_substr($model, 0, $maxLen, 'UTF-8');
        }
    } else {
        if (strlen($model) > $maxLen) {
            $model = substr($model, 0, $maxLen);
        }
    }
    return $model;
}

function extract_title_from_content($content) {
    $title = '';
    if (!is_string($content) || $content === '') {
        return '新会话';
    }

    $data = json_decode($content, true);
    if (json_last_error() === JSON_ERROR_NONE && is_array($data)) {
        if (!empty($data['title'])) {
            $title = $data['title'];
        } elseif (!empty($data['messages']) && is_array($data['messages'])) {
            foreach ($data['messages'] as $m) {
                if (!is_array($m)) {
                    continue;
                }
                if (($m['role'] ?? '') === 'user') {
                    $candidate = trim((string)($m['content'] ?? ''));
                    if ($candidate !== '') {
                        $title = $candidate;
                        break;
                    }
                }
            }
        }
    } else {
        $title = $content;
    }

    $title = normalize_title($title);
    return $title === '' ? '新会话' : $title;
}

// 1. 获取输入
$key = $_POST['key'] ?? '';
$id = $_POST['id'] ?? '';
$content = $_POST['content'] ?? '';
$model = $_POST['model'] ?? '';

// 2. 验证 Key (sha256 hex)
if (empty($key) || !preg_match('/^[a-f0-9]{64}$/', $key)) {
    respond(400, ['status' => 'error', 'error' => 'Invalid key format']);
}

// 3. 处理 ID (严格限制为18位纯数字)
$idProvided = !empty($id);
if (!$idProvided) {
    $id = generateId();
} else {
    if (!preg_match('/^\d{18}$/', $id)) {
        respond(400, ['status' => 'error', 'error' => 'ID must be exactly 18 digits']);
    }
}

// 4. 写入数据库
try {
    $pdo = get_pdo();
    $title = extract_title_from_content($content);
    $model = normalize_model($model);

    if ($idProvided) {
        $stmt = $pdo->prepare(
            'INSERT INTO chat_sessions (key_hash, id, title, model, content) VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE title = VALUES(title), model = VALUES(model), content = VALUES(content), updated_at = CURRENT_TIMESTAMP'
        );
        $stmt->execute([$key, $id, $title, $model, $content]);
        echo json_encode(['status' => 'success', 'id' => $id]);
        exit;
    }

    $maxTries = 5;
    for ($i = 0; $i < $maxTries; $i++) {
        try {
            $stmt = $pdo->prepare('INSERT INTO chat_sessions (key_hash, id, title, model, content) VALUES (?, ?, ?, ?, ?)');
            $stmt->execute([$key, $id, $title, $model, $content]);
            echo json_encode(['status' => 'success', 'id' => $id]);
            exit;
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') {
                $id = generateId();
                continue;
            }
            throw $e;
        }
    }

    respond(500, ['status' => 'error', 'error' => 'Failed to generate unique ID']);
} catch (PDOException $e) {
    respond(500, ['status' => 'error', 'error' => 'Database write failed']);
}
?>
