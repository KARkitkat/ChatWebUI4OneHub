<?php
function get_pdo() {
    $dbHost = '127.0.0.1';
    $dbPort = '3306';
    $dbName = 'openai_chat';
    $dbUser = 'root';
    $dbPass = 'root';
    $dbCharset = 'utf8mb4';

    $dsn = "mysql:host={$dbHost};port={$dbPort};dbname={$dbName};charset={$dbCharset}";

    $options = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ];

    return new PDO($dsn, $dbUser, $dbPass, $options);
}
?>
