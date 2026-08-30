<?php
/**
 * Configuração de Conexão com o Banco de Dados MySQL na Hostinger
 * 
 * Preencha com os dados do seu banco MySQL criado no hPanel da Hostinger:
 * 1. Acesse hPanel > Bancos de Dados > Gerenciamento de Banco de Dados MySQL
 * 2. Crie ou copie o Nome do Banco, Usuário e Senha
 * 3. Se o site e o banco estão na mesma conta Hostinger, DB_HOST geralmente é 'localhost'
 */

// Permite ler do arquivo .env caso exista na raiz
if (file_exists(__DIR__ . '/../.env')) {
    $envLines = file(__DIR__ . '/../.env', FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($envLines as $line) {
        if (strpos(trim($line), '#') === 0) continue;
        if (strpos($line, '=') !== false) {
            list($name, $value) = explode('=', $line, 2);
            $name = trim($name);
            $value = trim($value, " \t\n\r\0\x0B\"'");
            if (!empty($name) && !getenv($name)) {
                putenv("$name=$value");
                $_ENV[$name] = $value;
            }
        }
    }
}

// Configurações do Banco MySQL Hostinger
define('DB_HOST', getenv('DB_HOST') ?: getenv('MYSQL_HOST') ?: 'localhost');
define('DB_PORT', getenv('DB_PORT') ?: getenv('MYSQL_PORT') ?: '3306');
define('DB_USER', getenv('DB_USER') ?: getenv('MYSQL_USER') ?: 'u688072783_CWCERTIDAO');
define('DB_PASSWORD', getenv('DB_PASSWORD') ?: getenv('MYSQL_PASSWORD') ?: 'Cwrocha2026');
define('DB_NAME', getenv('DB_NAME') ?: getenv('MYSQL_DATABASE') ?: 'u688072783_CERTIDAO');

/**
 * Função de Conexão PDO com Hostinger MySQL
 */
function getDatabaseConnection() {
    static $pdo = null;
    if ($pdo !== null) {
        return $pdo;
    }

    if (empty(DB_USER) || empty(DB_NAME)) {
        return null;
    }

    try {
        $dsn = "mysql:host=" . DB_HOST . ";port=" . DB_PORT . ";dbname=" . DB_NAME . ";charset=utf8mb4";
        $options = [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
            PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4"
        ];
        
        $pdo = new PDO($dsn, DB_USER, DB_PASSWORD, $options);
        
        // Garante que as tabelas existem
        initDatabaseTables($pdo);
        return $pdo;
    } catch (PDOException $e) {
        error_log("[Hostinger DB PHP] Erro na conexão PDO: " . $e->getMessage());
        return null;
    }
}

/**
 * Criação e Sincronização Automática das Tabelas
 */
function initDatabaseTables($pdo) {
    try {
        // 1. Tabela profiles (usuários e permissões)
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS profiles (
                id VARCHAR(64) PRIMARY KEY,
                username VARCHAR(100) NOT NULL UNIQUE,
                password VARCHAR(255) NULL,
                password_plain VARCHAR(255) NULL,
                role VARCHAR(20) DEFAULT 'editor',
                empresas TEXT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        // 2. Tabela fca_entries (registros de FCA)
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS fca_entries (
                id VARCHAR(64) PRIMARY KEY,
                mes VARCHAR(50) NULL,
                login VARCHAR(100) NULL,
                jornada VARCHAR(100) NULL,
                recurso VARCHAR(100) NULL,
                municipio VARCHAR(100) NULL,
                fato TEXT NULL,
                causa TEXT NULL,
                acao TEXT NULL,
                responsavel VARCHAR(100) NULL,
                data_acao VARCHAR(50) NULL,
                status VARCHAR(50) DEFAULT 'Ativo',
                s1 VARCHAR(20) NULL,
                s2 VARCHAR(20) NULL,
                s3 VARCHAR(20) NULL,
                s4 VARCHAR(20) NULL,
                s5 VARCHAR(20) NULL,
                dataCriacao VARCHAR(50) NULL,
                data_ultima_alteracao VARCHAR(50) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        // 3. Tabela diario_bordo (chamados e diário de bordo)
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS diario_bordo (
                id VARCHAR(64) PRIMARY KEY,
                data VARCHAR(50) NULL,
                chamado VARCHAR(100) NULL,
                descricao TEXT NULL,
                status VARCHAR(50) DEFAULT 'Aberto',
                dataConclusao VARCHAR(50) NULL,
                dataCriacao VARCHAR(50) NULL,
                login VARCHAR(100) NULL,
                recurso VARCHAR(100) NULL,
                data_ultima_alteracao VARCHAR(50) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        // Usuário admin inicial padrão se tabela estiver vazia
        $stmt = $pdo->query("SELECT COUNT(*) as count FROM profiles");
        $count = $stmt->fetchColumn();
        if ($count == 0) {
            $adminId = 'admin_master';
            $ins = $pdo->prepare("INSERT INTO profiles (id, username, password, password_plain, role, empresas) VALUES (?, ?, ?, ?, ?, ?)");
            $ins->execute([$adminId, 'admin', '123', '123', 'admin', json_encode(['TODAS'])]);
        }
    } catch (Exception $e) {
        error_log("[Hostinger DB PHP] Erro ao verificar tabelas: " . $e->getMessage());
    }
}
