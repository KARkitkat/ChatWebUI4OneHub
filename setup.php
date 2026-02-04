<?php
header('Content-Type: text/plain; charset=utf-8');

$dbHost = '127.0.0.1';
$dbPort = '3306';
$dbName = 'openai_chat';
$dbUser = 'root';
$dbPass = 'root';
$dbCharset = 'utf8mb4';

$dsn = "mysql:host={$dbHost};port={$dbPort};charset={$dbCharset}";

$options = [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES => false,
];

try {
    $pdo = new PDO($dsn, $dbUser, $dbPass, $options);

    $pdo->exec("CREATE DATABASE IF NOT EXISTS `{$dbName}` CHARACTER SET {$dbCharset} COLLATE {$dbCharset}_unicode_ci");
    $pdo->exec("USE `{$dbName}`");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS `chat_sessions` (
            `key_hash` CHAR(64) NOT NULL,
            `id` CHAR(18) NOT NULL,
            `title` VARCHAR(100) NOT NULL DEFAULT '',
            `model` VARCHAR(100) NOT NULL DEFAULT '',
            `content` MEDIUMTEXT NOT NULL,
            `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (`key_hash`, `id`),
            KEY `idx_key_updated` (`key_hash`, `updated_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET={$dbCharset};
    ");

    try {
        $pdo->exec("ALTER TABLE `chat_sessions` ADD COLUMN `title` VARCHAR(100) NOT NULL DEFAULT '' AFTER `id`");
    } catch (PDOException $e) {
        $code = $e->getCode();
        $errNo = $e->errorInfo[1] ?? 0;
        if (!($code === '42S21' || $errNo === 1060)) {
            throw $e;
        }
    }

    try {
        $pdo->exec("ALTER TABLE `chat_sessions` ADD COLUMN `model` VARCHAR(100) NOT NULL DEFAULT '' AFTER `title`");
    } catch (PDOException $e) {
        $code = $e->getCode();
        $errNo = $e->errorInfo[1] ?? 0;
        if (!($code === '42S21' || $errNo === 1060)) {
            throw $e;
        }
    }

    echo "OK: database and tables are ready.\n";
} catch (PDOException $e) {
    http_response_code(500);
    echo "ERROR: " . $e->getMessage() . "\n";
    exit;
}
?>
