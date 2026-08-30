import mysql, { Pool, PoolOptions } from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

// Hostinger / MySQL environment configuration
const DB_HOST = process.env.DB_HOST || process.env.MYSQL_HOST || '';
const DB_PORT = parseInt(process.env.DB_PORT || process.env.MYSQL_PORT || '3306', 10);
const DB_USER = process.env.DB_USER || process.env.MYSQL_USER || '';
const DB_PASSWORD = process.env.DB_PASSWORD || process.env.MYSQL_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || process.env.MYSQL_DATABASE || '';
const DB_SSL = process.env.DB_SSL === 'true' || process.env.MYSQL_SSL === 'true';

let pool: Pool | null = null;
let isConnected = false;
let lastError: string | null = null;

export function getDbConfig() {
  return {
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    database: DB_NAME,
    hasPassword: Boolean(DB_PASSWORD),
    ssl: DB_SSL,
    isConfigured: Boolean(DB_HOST && DB_USER && DB_NAME)
  };
}

export function isHostingerConfigured(): boolean {
  return Boolean(DB_HOST && DB_USER && DB_NAME && DB_PASSWORD);
}

export function isDbConnected(): boolean {
  return isConnected;
}

export function getDbConnectionStatus() {
  return {
    configured: isHostingerConfigured(),
    connected: isConnected,
    host: DB_HOST || 'Não configurado',
    port: DB_PORT,
    database: DB_NAME || 'Não configurado',
    user: DB_USER || 'Não configurado',
    error: lastError,
    timestamp: new Date().toISOString()
  };
}

export async function initDatabase(): Promise<boolean> {
  if (!isHostingerConfigured()) {
    console.log('[Hostinger DB] Credenciais de banco de dados não configuradas no .env. Operando em modo híbrido/fallback.');
    return false;
  }

  try {
    console.log(`[Hostinger DB] Conectando ao banco MySQL em ${DB_HOST}:${DB_PORT} (Base: ${DB_NAME}, Usuário: ${DB_USER})...`);
    
    const poolConfig: PoolOptions = {
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
      connectTimeout: 15000,
      ssl: DB_SSL ? { rejectUnauthorized: false } : undefined
    };

    pool = mysql.createPool(poolConfig);

    // Test connection
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();

    isConnected = true;
    lastError = null;
    console.log('[Hostinger DB] Conexão com banco Hostinger MySQL estabelecida com sucesso!');

    // Initialize tables
    await createTablesIfNotExist();
    return true;
  } catch (error: any) {
    isConnected = false;
    lastError = error.message;
    console.error('[Hostinger DB] Erro ao conectar ao MySQL da Hostinger:', error.message);
    return false;
  }
}

async function createTablesIfNotExist() {
  if (!pool) return;

  try {
    console.log('[Hostinger DB] Verificando e criando tabelas necessárias (profiles, fca_entries, diario_bordo)...');

    // 1. Profiles / Users Table
    await pool.query(`
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
    `);

    // 2. FCA Entries Table
    await pool.query(`
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
    `);

    // 3. Diário de Bordo Table
    await pool.query(`
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
    `);

    // Seed default admin user if profiles table is empty
    const [rows]: [any[], any] = await pool.query('SELECT COUNT(*) as count FROM profiles');
    const userCount = rows[0]?.count || 0;

    if (userCount === 0) {
      console.log('[Hostinger DB] Tabela profiles vazia. Criando usuário admin inicial...');
      const adminId = 'admin-' + Date.now();
      await pool.query(
        'INSERT INTO profiles (id, username, password, password_plain, role, empresas) VALUES (?, ?, ?, ?, ?, ?)',
        [adminId, 'admin', 'admin123', 'admin123', 'admin', JSON.stringify(['TODAS'])]
      );
      console.log('[Hostinger DB] Usuário admin criado com sucesso (Login: admin / Senha: admin123).');
    }

    console.log('[Hostinger DB] Tabelas do banco Hostinger prontas e sincronizadas!');
  } catch (error: any) {
    console.error('[Hostinger DB] Erro ao criar/verificar tabelas:', error.message);
  }
}

export function getPool(): Pool | null {
  return pool;
}
