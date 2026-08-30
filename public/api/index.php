<?php
/**
 * API REST PHP para Hostinger MySQL
 * Fornece todos os endpoints consumidos pelo painel React:
 * - /api/health
 * - /api/db/status
 * - /api/auth/login
 * - /api/profiles
 * - /api/admin/*
 * - /api/fca
 * - /api/diario
 */

require_once __DIR__ . '/config.php';

// Headers CORS e JSON
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, apikey");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Obter rota requisitada
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$method = $_SERVER['REQUEST_METHOD'];

// Normalizar rota removendo prefixo e barras
// Ex: /api/auth/login -> auth/login ou /index.php/auth/login -> auth/login
$path = preg_replace('#^.*?api/#', '', $uri);
$path = trim($path, '/');
$segments = explode('/', $path);

// Obter corpo da requisição JSON
$rawInput = file_get_contents('php://input');
$body = json_decode($rawInput, true) ?: [];

$pdo = getDatabaseConnection();

// ----------------------------------------------------
// 1. HEALTH & STATUS
// ----------------------------------------------------
if ($path === 'health' || $path === '') {
    echo json_encode([
        'status' => 'ok',
        'hostingerDb' => [
            'configured' => (bool)$pdo,
            'connected' => (bool)$pdo,
            'host' => DB_HOST,
            'database' => DB_NAME
        ],
        'runtime' => 'PHP ' . phpversion() . ' (Hostinger)',
        'timestamp' => date('c')
    ]);
    exit;
}

if ($path === 'db/status') {
    $tables = [];
    $stats = ['users' => 1, 'fca' => 0, 'diario' => 0];

    if ($pdo) {
        try {
            $stmt = $pdo->query("SHOW TABLES");
            $tables = $stmt->fetchAll(PDO::FETCH_COLUMN);

            if (in_array('profiles', $tables)) {
                $stats['users'] = (int)$pdo->query("SELECT COUNT(*) FROM profiles")->fetchColumn();
            }
            if (in_array('fca_entries', $tables)) {
                $stats['fca'] = (int)$pdo->query("SELECT COUNT(*) FROM fca_entries")->fetchColumn();
            }
            if (in_array('diario_bordo', $tables)) {
                $stats['diario'] = (int)$pdo->query("SELECT COUNT(*) FROM diario_bordo")->fetchColumn();
            }
        } catch (Exception $e) {
            $stats['error'] = $e->getMessage();
        }
    }

    echo json_encode([
        'configured' => !empty(DB_USER) && !empty(DB_NAME),
        'connected' => (bool)$pdo,
        'host' => DB_HOST,
        'port' => (int)DB_PORT,
        'database' => DB_NAME ?: 'Não configurado',
        'user' => DB_USER ?: 'Não configurado',
        'tables' => $tables,
        'stats' => $stats,
        'provider' => 'Hostinger MySQL (PHP)',
        'timestamp' => date('c')
    ]);
    exit;
}

// ----------------------------------------------------
// 2. AUTHENTICATION (Login)
// ----------------------------------------------------
if ($path === 'auth/login' && $method === 'POST') {
    $login = trim($body['login'] ?? '');
    $password = (string)($body['password'] ?? '');

    if (empty($login) || empty($password)) {
        http_response_code(400);
        echo json_encode(['error' => 'Informe usuário e senha.']);
        exit;
    }

    $normalized = strtolower(preg_replace('/@.+$/', '', $login));

    // 1. Tenta validar no MySQL Hostinger se banco estiver conectado
    if ($pdo) {
        try {
            $stmt = $pdo->prepare("SELECT * FROM profiles WHERE LOWER(TRIM(username)) = ? LIMIT 1");
            $stmt->execute([$normalized]);
            $user = $stmt->fetch();

            if ($user) {
                $passValid = ($user['password_plain'] && $user['password_plain'] === $password) ||
                             ($user['password'] && $user['password'] === $password);

                if ($passValid) {
                    $empresas = ['TODAS'];
                    if (!empty($user['empresas'])) {
                        $dec = json_decode($user['empresas'], true);
                        $empresas = is_array($dec) ? $dec : explode(',', $user['empresas']);
                    }

                    echo json_encode([
                        'success' => true,
                        'source' => 'hostinger_mysql',
                        'user' => [
                            'id' => $user['id'],
                            'email' => $normalized . '@atendimento.com.br',
                            'username' => $user['username'],
                            'role' => $user['role'] ?: 'editor',
                            'empresas' => $empresas
                        ]
                    ]);
                    exit;
                } else {
                    http_response_code(401);
                    echo json_encode(['error' => 'Senha incorreta. Verifique suas credenciais.']);
                    exit;
                }
            }
        } catch (Exception $e) {
            error_log("[Hostinger Auth] Erro ao consultar banco: " . $e->getMessage());
        }
    }

    // 2. Fallback de Administrador Master se banco não estiver preenchido ou usuário não cadastrado
    if (($normalized === 'admin' || $login === 'admin@claro.com.br') && ($password === '123' || $password === 'admin123')) {
        echo json_encode([
            'success' => true,
            'source' => 'local_master',
            'user' => [
                'id' => 'admin_master',
                'email' => 'admin@atendimento.com.br',
                'username' => 'admin',
                'role' => 'admin',
                'empresas' => ['TODAS']
            ]
        ]);
        exit;
    }

    http_response_code(401);
    echo json_encode(['error' => 'Usuário ou senha inválidos.']);
    exit;
}

// ----------------------------------------------------
// 3. PROFILES / USERS
// ----------------------------------------------------
if ($path === 'profiles' && $method === 'GET') {
    if ($pdo) {
        try {
            // Limpar automaticamente registros inválidos com username vazio caso existam
            $pdo->exec("DELETE FROM profiles WHERE username IS NULL OR TRIM(username) = ''");

            $stmt = $pdo->query("SELECT id, username, role, password_plain, empresas FROM profiles ORDER BY username ASC");
            $rows = $stmt->fetchAll();
            $result = [];
            foreach ($rows as $r) {
                $empresas = ['TODAS'];
                if (!empty($r['empresas'])) {
                    $dec = json_decode($r['empresas'], true);
                    $empresas = is_array($dec) ? $dec : explode(',', $r['empresas']);
                }
                $result[] = [
                    'id' => $r['id'],
                    'username' => $r['username'],
                    'role' => $r['role'] ?: 'editor',
                    'password_plain' => $r['password_plain'] ?: '123',
                    'empresas' => $empresas
                ];
            }
            echo json_encode($result);
            exit;
        } catch (Exception $e) {
            error_log("[Hostinger Profiles] " . $e->getMessage());
        }
    }

    // Fallback padrão
    echo json_encode([[
        'id' => 'admin_master',
        'username' => 'admin',
        'role' => 'admin',
        'password_plain' => '123',
        'empresas' => ['TODAS']
    ]]);
    exit;
}

// ADMIN: Criar Usuário
if ($path === 'admin/create-user' && $method === 'POST') {
    $login = trim($body['login'] ?? '');
    $password = (string)($body['password'] ?? '');
    $role = $body['role'] ?? 'editor';
    $empresas = $body['empresas'] ?? ['TODAS'];

    if (empty($login) || empty($password)) {
        http_response_code(400);
        echo json_encode(['error' => 'Login e senha são obrigatórios.']);
        exit;
    }

    // Normalizar removendo acentos e convertendo para minúsculo
    $loginClean = $login;
    $from = ['á','à','â','ã','ä','é','è','ê','ë','í','ì','î','ï','ó','ò','ô','õ','ö','ú','ù','û','ü','ç','ñ',
             'Á','À','Â','Ã','Ä','É','È','Ê','Ë','Í','Ì','Î','Ï','Ó','Ò','Ô','Õ','Ö','Ú','Ù','Û','Ü','Ç','Ñ'];
    $to   = ['a','a','a','a','a','e','e','e','e','i','i','i','i','o','o','o','o','o','u','u','u','u','c','n',
             'a','a','a','a','a','e','e','e','e','i','i','i','i','o','o','o','o','o','u','u','u','u','c','n'];
    $loginClean = str_replace($from, $to, $loginClean);
    $normalized = strtolower(preg_replace('/[^a-zA-Z0-9._@-]/', '', $loginClean));

    if (empty($normalized)) {
        http_response_code(400);
        echo json_encode(['error' => 'Nome de usuário inválido. Digite letras ou números.']);
        exit;
    }

    $empresasArray = is_array($empresas) ? $empresas : [$empresas];

    if ($pdo) {
        try {
            // Verificar se já existe um usuário com esse username
            $checkStmt = $pdo->prepare("SELECT id, username FROM profiles WHERE LOWER(TRIM(username)) = ? LIMIT 1");
            $checkStmt->execute([$normalized]);
            $existing = $checkStmt->fetch();

            if ($existing) {
                // Se já existe, atualiza os dados daquele usuário específico
                $updateStmt = $pdo->prepare("
                    UPDATE profiles 
                    SET password = ?, password_plain = ?, role = ?, empresas = ?
                    WHERE id = ?
                ");
                $updateStmt->execute([$password, $password, $role, json_encode($empresasArray), $existing['id']]);

                echo json_encode([
                    'success' => true,
                    'message' => "Usuário '$normalized' atualizado com sucesso.",
                    'user' => ['id' => $existing['id'], 'username' => $normalized, 'role' => $role, 'empresas' => $empresasArray]
                ]);
                exit;
            } else {
                // Cria um novo usuário com ID único exclusivo
                $userId = 'usr_' . time() . '_' . substr(md5(uniqid(mt_rand(), true)), 0, 6);
                $insertStmt = $pdo->prepare("
                    INSERT INTO profiles (id, username, password, password_plain, role, empresas)
                    VALUES (?, ?, ?, ?, ?, ?)
                ");
                $insertStmt->execute([$userId, $normalized, $password, $password, $role, json_encode($empresasArray)]);

                echo json_encode([
                    'success' => true,
                    'message' => "Usuário '$normalized' cadastrado com sucesso.",
                    'user' => ['id' => $userId, 'username' => $normalized, 'role' => $role, 'empresas' => $empresasArray]
                ]);
                exit;
            }
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Erro ao salvar no banco MySQL: ' . $e->getMessage()]);
            exit;
        }
    }

    echo json_encode([
        'success' => true,
        'message' => "Usuário $normalized cadastrado com sucesso.",
        'user' => ['id' => 'usr_' . time(), 'username' => $normalized, 'role' => $role, 'empresas' => $empresasArray]
    ]);
    exit;
}

// ADMIN: Atualizar Empresas
if ($path === 'admin/update-user-empresas' && $method === 'POST') {
    $userId = $body['userId'] ?? '';
    $empresas = $body['empresas'] ?? ['TODAS'];
    $empresasArray = is_array($empresas) ? $empresas : [$empresas];

    if ($pdo && !empty($userId)) {
        try {
            $stmt = $pdo->prepare("UPDATE profiles SET empresas = ? WHERE id = ? OR username = ?");
            $stmt->execute([json_encode($empresasArray), $userId, $userId]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
            exit;
        }
    }

    echo json_encode(['success' => true, 'message' => 'Permissões atualizadas.']);
    exit;
}

// ADMIN: Atualizar Senha
if ($path === 'admin/update-password' && $method === 'POST') {
    $userId = $body['userId'] ?? '';
    $newPassword = $body['newPassword'] ?? '';

    if ($pdo && !empty($userId) && !empty($newPassword)) {
        try {
            $stmt = $pdo->prepare("UPDATE profiles SET password = ?, password_plain = ? WHERE id = ? OR username = ?");
            $stmt->execute([$newPassword, $newPassword, $userId, $userId]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
            exit;
        }
    }

    echo json_encode(['success' => true, 'message' => 'Senha atualizada com sucesso.']);
    exit;
}

// ADMIN: Excluir Usuário
if ($path === 'admin/delete-user' && $method === 'POST') {
    $userId = $body['userId'] ?? '';
    if ($pdo && !empty($userId)) {
        try {
            $stmt = $pdo->prepare("DELETE FROM profiles WHERE id = ? OR username = ?");
            $stmt->execute([$userId, $userId]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
            exit;
        }
    }
    echo json_encode(['success' => true, 'message' => 'Usuário excluído.']);
    exit;
}

// ----------------------------------------------------
// 4. FCA ENTRIES
// ----------------------------------------------------
if ($segments[0] === 'fca') {
    $fcaId = $segments[1] ?? null;

    if ($method === 'GET') {
        if ($pdo) {
            try {
                $stmt = $pdo->query("SELECT * FROM fca_entries ORDER BY dataCriacao DESC");
                echo json_encode($stmt->fetchAll());
                exit;
            } catch (Exception $e) {
                error_log("[Hostinger FCA GET] " . $e->getMessage());
            }
        }
        echo json_encode([]);
        exit;
    }

    if ($method === 'POST') {
        $id = $body['id'] ?? ('fca_' . time() . '_' . substr(md5(uniqid()), 0, 5));
        $body['id'] = $id;
        $body['dataCriacao'] = $body['dataCriacao'] ?? date('c');
        $body['data_ultima_alteracao'] = date('c');

        if ($pdo) {
            try {
                $stmt = $pdo->prepare("
                    INSERT INTO fca_entries 
                    (id, mes, login, jornada, recurso, municipio, fato, causa, acao, responsavel, data_acao, status, s1, s2, s3, s4, s5, dataCriacao, data_ultima_alteracao)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ");
                $stmt->execute([
                    $id,
                    $body['mes'] ?? '',
                    $body['login'] ?? '',
                    $body['jornada'] ?? '',
                    $body['recurso'] ?? '',
                    $body['municipio'] ?? '',
                    $body['fato'] ?? '',
                    $body['causa'] ?? '',
                    $body['acao'] ?? '',
                    $body['responsavel'] ?? '',
                    $body['data_acao'] ?? '',
                    $body['status'] ?? 'Ativo',
                    $body['s1'] ?? null,
                    $body['s2'] ?? null,
                    $body['s3'] ?? null,
                    $body['s4'] ?? null,
                    $body['s5'] ?? null,
                    $body['dataCriacao'],
                    $body['data_ultima_alteracao']
                ]);
            } catch (Exception $e) {
                http_response_code(500);
                echo json_encode(['error' => 'Erro ao salvar FCA no MySQL: ' . $e->getMessage()]);
                exit;
            }
        }

        echo json_encode(['success' => true, 'data' => $body]);
        exit;
    }

    if ($method === 'PUT' && $fcaId) {
        $dataUltima = date('c');
        if ($pdo) {
            try {
                $stmt = $pdo->prepare("
                    UPDATE fca_entries SET 
                    mes = ?, login = ?, jornada = ?, recurso = ?, municipio = ?, fato = ?, causa = ?, acao = ?, 
                    responsavel = ?, data_acao = ?, status = ?, s1 = ?, s2 = ?, s3 = ?, s4 = ?, s5 = ?, data_ultima_alteracao = ?
                    WHERE id = ?
                ");
                $stmt->execute([
                    $body['mes'] ?? '',
                    $body['login'] ?? '',
                    $body['jornada'] ?? '',
                    $body['recurso'] ?? '',
                    $body['municipio'] ?? '',
                    $body['fato'] ?? '',
                    $body['causa'] ?? '',
                    $body['acao'] ?? '',
                    $body['responsavel'] ?? '',
                    $body['data_acao'] ?? '',
                    $body['status'] ?? 'Ativo',
                    $body['s1'] ?? null,
                    $body['s2'] ?? null,
                    $body['s3'] ?? null,
                    $body['s4'] ?? null,
                    $body['s5'] ?? null,
                    $dataUltima,
                    $fcaId
                ]);
            } catch (Exception $e) {
                http_response_code(500);
                echo json_encode(['error' => $e->getMessage()]);
                exit;
            }
        }
        echo json_encode(['success' => true, 'message' => 'FCA atualizado com sucesso.']);
        exit;
    }

    if ($method === 'DELETE' && $fcaId) {
        if ($pdo) {
            try {
                $stmt = $pdo->prepare("DELETE FROM fca_entries WHERE id = ?");
                $stmt->execute([$fcaId]);
            } catch (Exception $e) {
                http_response_code(500);
                echo json_encode(['error' => $e->getMessage()]);
                exit;
            }
        }
        echo json_encode(['success' => true, 'message' => 'FCA excluído com sucesso.']);
        exit;
    }
}

// ----------------------------------------------------
// 5. DIÁRIO DE BORDO
// ----------------------------------------------------
if ($segments[0] === 'diario') {
    $diaId = $segments[1] ?? null;

    if ($method === 'GET') {
        if ($pdo) {
            try {
                $stmt = $pdo->query("SELECT * FROM diario_bordo ORDER BY dataCriacao DESC");
                echo json_encode($stmt->fetchAll());
                exit;
            } catch (Exception $e) {
                error_log("[Hostinger Diario GET] " . $e->getMessage());
            }
        }
        echo json_encode([]);
        exit;
    }

    if ($method === 'POST') {
        $id = $body['id'] ?? ('dia_' . time() . '_' . substr(md5(uniqid()), 0, 5));
        $body['id'] = $id;
        $body['dataCriacao'] = $body['dataCriacao'] ?? date('c');

        if ($pdo) {
            try {
                $stmt = $pdo->prepare("
                    INSERT INTO diario_bordo (id, data, chamado, descricao, status, dataConclusao, dataCriacao, login, recurso)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ");
                $stmt->execute([
                    $id,
                    $body['data'] ?? '',
                    $body['chamado'] ?? '',
                    $body['descricao'] ?? '',
                    $body['status'] ?? 'Aberto',
                    $body['dataConclusao'] ?? null,
                    $body['dataCriacao'],
                    $body['login'] ?? '',
                    $body['recurso'] ?? ''
                ]);
            } catch (Exception $e) {
                http_response_code(500);
                echo json_encode(['error' => $e->getMessage()]);
                exit;
            }
        }

        echo json_encode(['success' => true, 'data' => $body]);
        exit;
    }

    if ($method === 'PUT' && $diaId) {
        $dataUltima = date('c');
        if ($pdo) {
            try {
                $stmt = $pdo->prepare("
                    UPDATE diario_bordo SET data = ?, chamado = ?, descricao = ?, status = ?, dataConclusao = ?, data_ultima_alteracao = ?
                    WHERE id = ?
                ");
                $stmt->execute([
                    $body['data'] ?? '',
                    $body['chamado'] ?? '',
                    $body['descricao'] ?? '',
                    $body['status'] ?? 'Aberto',
                    $body['dataConclusao'] ?? null,
                    $dataUltima,
                    $diaId
                ]);
            } catch (Exception $e) {
                http_response_code(500);
                echo json_encode(['error' => $e->getMessage()]);
                exit;
            }
        }
        echo json_encode(['success' => true, 'message' => 'Diário atualizado com sucesso.']);
        exit;
    }

    if ($method === 'DELETE' && $diaId) {
        if ($pdo) {
            try {
                $stmt = $pdo->prepare("DELETE FROM diario_bordo WHERE id = ?");
                $stmt->execute([$diaId]);
            } catch (Exception $e) {
                http_response_code(500);
                echo json_encode(['error' => $e->getMessage()]);
                exit;
            }
        }
        echo json_encode(['success' => true, 'message' => 'Diário excluído com sucesso.']);
        exit;
    }
}

// Rota não encontrada
http_response_code(404);
echo json_encode(['error' => "Rota não encontrada: $method $path"]);
