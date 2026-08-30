import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import dotenv from "dotenv";
import { 
  initDatabase, 
  getPool, 
  isHostingerConfigured, 
  isDbConnected,
  getDbConnectionStatus, 
  getDbConfig 
} from "./server/db";

dotenv.config();

// In-Memory resilient cache / fallback store
interface MemoryProfile {
  id: string;
  username: string;
  password?: string;
  password_plain?: string;
  role: string;
  empresas: string[];
}

const memoryProfiles: MemoryProfile[] = [
  {
    id: 'admin_master',
    username: 'admin',
    password: '123',
    password_plain: '123',
    role: 'admin',
    empresas: ['TODAS']
  }
];

let memoryFca: any[] = [];
let memoryDiario: any[] = [];

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Initialize Hostinger MySQL Database in background if credentials exist
  if (isHostingerConfigured()) {
    initDatabase().then(ready => {
      console.log(`[Server] Status Hostinger MySQL: ${ready ? 'CONECTADO E PRONTO' : 'FALHA NA CONEXÃO OU AGUARDANDO LIBERAÇÃO IP'}`);
    }).catch(err => {
      console.warn(`[Server] Aviso ao conectar Hostinger MySQL:`, err.message);
    });
  } else {
    console.log(`[Server] Hostinger MySQL aguardando credenciais completas (Host, User, Password, Database). Operando em modo resiliente.`);
  }

  app.set('trust proxy', true); 
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // CORS configuration
  app.use(cors({
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "apikey"]
  }));

  // Force HTTPS protocol header for iframe compatibility
  app.use((req, res, next) => {
    req.headers['x-forwarded-proto'] = 'https';
    next();
  });

  // Health check endpoint
  app.get("/api/health", async (req, res) => {
    const dbStatus = getDbConnectionStatus();
    res.json({ 
      status: "ok", 
      hostingerDb: dbStatus,
      timestamp: new Date().toISOString() 
    });
  });

  // Database Connection Diagnostics
  app.get("/api/db/status", async (req, res) => {
    const status = getDbConnectionStatus();
    const pool = getPool();
    let tables: string[] = [];
    let stats: any = {
      users: memoryProfiles.length,
      fca: memoryFca.length,
      diario: memoryDiario.length
    };

    if (pool && isDbConnected()) {
      try {
        const [tableRows]: any = await pool.query('SHOW TABLES');
        tables = tableRows.map((r: any) => Object.values(r)[0] as string);

        if (tables.includes('profiles')) {
          const [userCount]: any = await pool.query('SELECT COUNT(*) as count FROM profiles');
          stats.users = userCount[0]?.count || 0;
        }
        if (tables.includes('fca_entries')) {
          const [fcaCount]: any = await pool.query('SELECT COUNT(*) as count FROM fca_entries');
          stats.fca = fcaCount[0]?.count || 0;
        }
        if (tables.includes('diario_bordo')) {
          const [diarioCount]: any = await pool.query('SELECT COUNT(*) as count FROM diario_bordo');
          stats.diario = diarioCount[0]?.count || 0;
        }
      } catch (err: any) {
        stats.error = err.message;
      }
    }

    res.json({
      ...status,
      tables,
      stats,
      provider: 'Hostinger MySQL'
    });
  });

  // ----------------------------------------------------
  // AUTHENTICATION ROUTES (Hostinger MySQL + Fallback)
  // ----------------------------------------------------

  app.post("/api/auth/login", async (req, res) => {
    const { login, password } = req.body;
    if (!login || !password) {
      return res.status(400).json({ error: "Informe usuário e senha." });
    }

    const pool = getPool();
    const normalizedUsername = login.toLowerCase().trim().replace(/@.+$/, '');

    if (pool && isHostingerConfigured() && isDbConnected()) {
      try {
        const [rows]: any = await pool.query(
          'SELECT * FROM profiles WHERE LOWER(TRIM(username)) = ? LIMIT 1',
          [normalizedUsername]
        );

        if (rows && rows.length > 0) {
          const user = rows[0];
          const isValid = (user.password_plain && user.password_plain === password) ||
                          (user.password && user.password === password);

          if (isValid) {
            let empresasParsed = ['TODAS'];
            if (user.empresas) {
              try {
                empresasParsed = typeof user.empresas === 'string' ? JSON.parse(user.empresas) : user.empresas;
              } catch {
                empresasParsed = String(user.empresas).split(',').map((s: string) => s.trim());
              }
            }

            return res.json({
              success: true,
              source: 'hostinger',
              user: {
                id: user.id,
                email: `${normalizedUsername}@atendimento.com.br`,
                username: user.username,
                role: user.role || 'editor',
                empresas: empresasParsed
              }
            });
          } else {
            return res.status(401).json({ error: "Senha incorreta. Verifique suas credenciais." });
          }
        }
      } catch (err: any) {
        console.warn('[Hostinger Login Notice - Fallback]', err.message);
      }
    }

    // Check memory store
    const memUser = memoryProfiles.find(u => u.username.toLowerCase() === normalizedUsername);
    if (memUser) {
      if (memUser.password === password || memUser.password_plain === password) {
        return res.json({
          success: true,
          source: 'local_master',
          user: {
            id: memUser.id,
            email: `${memUser.username}@atendimento.com.br`,
            username: memUser.username,
            role: memUser.role,
            empresas: memUser.empresas
          }
        });
      } else {
        return res.status(401).json({ error: "Senha incorreta. Verifique suas credenciais." });
      }
    }

    // Default admin fallback
    if ((normalizedUsername === 'admin' || login === 'admin@claro.com.br') && (password === '123' || password === 'admin123')) {
      return res.json({
        success: true,
        source: 'local_master',
        user: {
          id: 'admin_master',
          email: 'admin@atendimento.com.br',
          username: 'admin',
          role: 'admin',
          empresas: ['TODAS']
        }
      });
    }

    return res.status(401).json({ error: "Usuário ou senha inválidos." });
  });

  // ----------------------------------------------------
  // PROFILES / USERS API (Hostinger MySQL + Fallback)
  // ----------------------------------------------------

  app.get("/api/profiles", async (req, res) => {
    const pool = getPool();
    if (pool && isHostingerConfigured() && isDbConnected()) {
      try {
        const [rows]: any = await pool.query('SELECT id, username, role, password, password_plain, empresas FROM profiles ORDER BY username ASC');
        const formatted = rows.map((u: any) => {
          let empresas = ['TODAS'];
          if (u.empresas) {
            try {
              empresas = typeof u.empresas === 'string' ? JSON.parse(u.empresas) : u.empresas;
            } catch {
              empresas = String(u.empresas).split(',').map((s: string) => s.trim());
            }
          }
          return {
            id: u.id,
            username: u.username,
            role: u.role || 'editor',
            password_plain: u.password_plain || u.password || (u.username === 'admin' ? '123' : '123'),
            empresas
          };
        });
        return res.json(formatted);
      } catch (err: any) {
        console.warn('[Hostinger Profiles Notice - Fallback]', err.message);
      }
    }

    return res.json(memoryProfiles.map(u => ({
      id: u.id,
      username: u.username,
      role: u.role || 'editor',
      password_plain: u.password_plain || u.password || (u.username === 'admin' ? '123' : '123'),
      empresas: u.empresas
    })));
  });

  // Admin: Create User
  app.post("/api/admin/create-user", async (req, res) => {
    const { login, password, role, empresas } = req.body;

    if (!login || !password || !role) {
      return res.status(400).json({ error: "Dados incompletos (login, password, role)." });
    }

    const normalizedUsername = login.toLowerCase().trim().replace(/[^a-z0-9._-]/g, '');
    const pool = getPool();
    const empresasArray = Array.isArray(empresas) ? empresas : (empresas ? [empresas] : ['TODAS']);
    const userId = 'usr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

    // Save in memory store
    const existingIndex = memoryProfiles.findIndex(u => u.username === normalizedUsername);
    const newProfile: MemoryProfile = {
      id: userId,
      username: normalizedUsername,
      password,
      password_plain: password,
      role,
      empresas: empresasArray
    };

    if (existingIndex >= 0) {
      memoryProfiles[existingIndex] = newProfile;
    } else {
      memoryProfiles.push(newProfile);
    }

    if (pool && isHostingerConfigured() && isDbConnected()) {
      try {
        await pool.query(
          `INSERT INTO profiles (id, username, password, password_plain, role, empresas) 
           VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE password = VALUES(password), password_plain = VALUES(password_plain), role = VALUES(role), empresas = VALUES(empresas)`,
          [userId, normalizedUsername, password, password, role, JSON.stringify(empresasArray)]
        );
      } catch (err: any) {
        console.warn('[Hostinger Create User Notice - Memory Saved]', err.message);
      }
    }

    return res.json({ 
      success: true, 
      message: `Usuário ${normalizedUsername} cadastrado com sucesso.`,
      user: { id: userId, username: normalizedUsername, role, empresas: empresasArray }
    });
  });

  // Admin: Update User Empresas
  app.post("/api/admin/update-user-empresas", async (req, res) => {
    const { userId, empresas } = req.body;
    if (!userId) {
      return res.status(400).json({ error: "userId não fornecido." });
    }

    const empresasArray = Array.isArray(empresas) ? empresas : (empresas ? [empresas] : ['TODAS']);
    
    // Update memory
    const user = memoryProfiles.find(u => u.id === userId || u.username === userId);
    if (user) {
      user.empresas = empresasArray;
    }

    const pool = getPool();
    if (pool && isHostingerConfigured() && isDbConnected()) {
      try {
        await pool.query(
          'UPDATE profiles SET empresas = ? WHERE id = ? OR username = ?',
          [JSON.stringify(empresasArray), userId, userId]
        );
      } catch (err: any) {
        console.warn('[Hostinger Update Empresas Notice - Memory Updated]', err.message);
      }
    }

    return res.json({ success: true, message: "Permissões de empresa atualizadas." });
  });

  // Admin: Update User Password
  app.post("/api/admin/update-password", async (req, res) => {
    const { userId, newPassword } = req.body;
    if (!userId || !newPassword) {
      return res.status(400).json({ error: "userId e newPassword são obrigatórios." });
    }

    // Update memory
    const user = memoryProfiles.find(u => u.id === userId || u.username === userId);
    if (user) {
      user.password = newPassword;
      user.password_plain = newPassword;
    }

    const pool = getPool();
    if (pool && isHostingerConfigured() && isDbConnected()) {
      try {
        await pool.query(
          'UPDATE profiles SET password = ?, password_plain = ? WHERE id = ? OR username = ?',
          [newPassword, newPassword, userId, userId]
        );
      } catch (err: any) {
        console.warn('[Hostinger Update Password Notice - Memory Updated]', err.message);
      }
    }

    return res.json({ success: true, message: "Senha alterada com sucesso." });
  });

  // Admin: Delete User
  app.post("/api/admin/delete-user", async (req, res) => {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: "userId é obrigatório." });
    }

    const idx = memoryProfiles.findIndex(u => u.id === userId || u.username === userId);
    if (idx >= 0) {
      memoryProfiles.splice(idx, 1);
    }

    const pool = getPool();
    if (pool && isHostingerConfigured() && isDbConnected()) {
      try {
        await pool.query('DELETE FROM profiles WHERE id = ? OR username = ?', [userId, userId]);
      } catch (err: any) {
        console.warn('[Hostinger Delete User Notice - Memory Deleted]', err.message);
      }
    }

    return res.json({ success: true, message: "Usuário excluído com sucesso." });
  });

  // ----------------------------------------------------
  // FCA ENTRIES API (Hostinger MySQL + Fallback)
  // ----------------------------------------------------

  app.get("/api/fca", async (req, res) => {
    const pool = getPool();
    if (pool && isHostingerConfigured() && isDbConnected()) {
      try {
        const [rows]: any = await pool.query('SELECT * FROM fca_entries ORDER BY dataCriacao DESC');
        if (Array.isArray(rows)) {
          return res.json(rows);
        }
      } catch (err: any) {
        console.warn('[Hostinger Get FCA Notice - Fallback]', err.message);
      }
    }

    return res.json(memoryFca);
  });

  app.post("/api/fca", async (req, res) => {
    const entry = req.body;
    const id = entry.id || 'fca_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    entry.id = id;
    if (!entry.dataCriacao) entry.dataCriacao = new Date().toISOString();
    if (!entry.data_ultima_alteracao) entry.data_ultima_alteracao = new Date().toISOString();

    // Update memory
    memoryFca = [entry, ...memoryFca.filter(e => e.id !== id)];

    const pool = getPool();
    if (pool && isHostingerConfigured() && isDbConnected()) {
      try {
        await pool.query(
          `INSERT INTO fca_entries 
           (id, mes, login, jornada, recurso, municipio, fato, causa, acao, responsavel, data_acao, status, s1, s2, s3, s4, s5, dataCriacao, data_ultima_alteracao)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id, entry.mes || '', entry.login || '', entry.jornada || '', entry.recurso || '', entry.municipio || '',
            entry.fato || '', entry.causa || '', entry.acao || '', entry.responsavel || '', entry.data_acao || '',
            entry.status || 'Ativo', entry.s1 || null, entry.s2 || null, entry.s3 || null, entry.s4 || null, entry.s5 || null,
            entry.dataCriacao, entry.data_ultima_alteracao
          ]
        );
      } catch (err: any) {
        console.warn('[Hostinger Insert FCA Notice - Memory Saved]', err.message);
      }
    }

    return res.json({ success: true, data: entry });
  });

  app.put("/api/fca/:id", async (req, res) => {
    const { id } = req.params;
    const entry = req.body;
    entry.id = id;
    entry.data_ultima_alteracao = new Date().toISOString();

    // Update memory
    const index = memoryFca.findIndex(e => e.id === id);
    if (index >= 0) {
      memoryFca[index] = { ...memoryFca[index], ...entry };
    } else {
      memoryFca.push(entry);
    }

    const pool = getPool();
    if (pool && isHostingerConfigured() && isDbConnected()) {
      try {
        await pool.query(
          `UPDATE fca_entries SET 
           mes = ?, login = ?, jornada = ?, recurso = ?, municipio = ?, fato = ?, causa = ?, acao = ?, 
           responsavel = ?, data_acao = ?, status = ?, s1 = ?, s2 = ?, s3 = ?, s4 = ?, s5 = ?, data_ultima_alteracao = ?
           WHERE id = ?`,
          [
            entry.mes || '', entry.login || '', entry.jornada || '', entry.recurso || '', entry.municipio || '',
            entry.fato || '', entry.causa || '', entry.acao || '', entry.responsavel || '', entry.data_acao || '',
            entry.status || 'Ativo', entry.s1 || null, entry.s2 || null, entry.s3 || null, entry.s4 || null, entry.s5 || null,
            entry.data_ultima_alteracao, id
          ]
        );
      } catch (err: any) {
        console.warn('[Hostinger Update FCA Notice - Memory Updated]', err.message);
      }
    }

    return res.json({ success: true, message: "Registro FCA atualizado." });
  });

  app.delete("/api/fca/:id", async (req, res) => {
    const { id } = req.params;
    memoryFca = memoryFca.filter(e => e.id !== id);

    const pool = getPool();
    if (pool && isHostingerConfigured() && isDbConnected()) {
      try {
        await pool.query('DELETE FROM fca_entries WHERE id = ?', [id]);
      } catch (err: any) {
        console.warn('[Hostinger Delete FCA Notice - Memory Deleted]', err.message);
      }
    }

    return res.json({ success: true, message: "Registro FCA excluído." });
  });

  // ----------------------------------------------------
  // DIÁRIO DE BORDO API (Hostinger MySQL + Fallback)
  // ----------------------------------------------------

  app.get("/api/diario", async (req, res) => {
    const pool = getPool();
    if (pool && isHostingerConfigured() && isDbConnected()) {
      try {
        const [rows]: any = await pool.query('SELECT * FROM diario_bordo ORDER BY dataCriacao DESC');
        if (Array.isArray(rows)) {
          return res.json(rows);
        }
      } catch (err: any) {
        console.warn('[Hostinger Get Diario Notice - Fallback]', err.message);
      }
    }

    return res.json(memoryDiario);
  });

  app.post("/api/diario", async (req, res) => {
    const entry = req.body;
    const id = entry.id || 'dia_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    entry.id = id;
    if (!entry.dataCriacao) entry.dataCriacao = new Date().toISOString();

    // Update memory
    memoryDiario = [entry, ...memoryDiario.filter(e => e.id !== id)];

    const pool = getPool();
    if (pool && isHostingerConfigured() && isDbConnected()) {
      try {
        await pool.query(
          `INSERT INTO diario_bordo (id, data, chamado, descricao, status, dataConclusao, dataCriacao, login, recurso)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id, entry.data || '', entry.chamado || '', entry.descricao || '', entry.status || 'Aberto',
            entry.dataConclusao || null, entry.dataCriacao, entry.login || '', entry.recurso || ''
          ]
        );
      } catch (err: any) {
        console.warn('[Hostinger Insert Diario Notice - Memory Saved]', err.message);
      }
    }

    return res.json({ success: true, data: entry });
  });

  app.put("/api/diario/:id", async (req, res) => {
    const { id } = req.params;
    const entry = req.body;
    entry.id = id;
    entry.data_ultima_alteracao = new Date().toISOString();

    const idx = memoryDiario.findIndex(e => e.id === id);
    if (idx >= 0) {
      memoryDiario[idx] = { ...memoryDiario[idx], ...entry };
    } else {
      memoryDiario.push(entry);
    }

    const pool = getPool();
    if (pool && isHostingerConfigured() && isDbConnected()) {
      try {
        await pool.query(
          `UPDATE diario_bordo SET data = ?, chamado = ?, descricao = ?, status = ?, dataConclusao = ?, data_ultima_alteracao = ?
           WHERE id = ?`,
          [
            entry.data || '', entry.chamado || '', entry.descricao || '', entry.status || 'Aberto',
            entry.dataConclusao || null, entry.data_ultima_alteracao, id
          ]
        );
      } catch (err: any) {
        console.warn('[Hostinger Update Diario Notice - Memory Updated]', err.message);
      }
    }

    return res.json({ success: true, message: "Registro do Diário atualizado." });
  });

  app.delete("/api/diario/:id", async (req, res) => {
    const { id } = req.params;
    memoryDiario = memoryDiario.filter(e => e.id !== id);

    const pool = getPool();
    if (pool && isHostingerConfigured() && isDbConnected()) {
      try {
        await pool.query('DELETE FROM diario_bordo WHERE id = ?', [id]);
      } catch (err: any) {
        console.warn('[Hostinger Delete Diario Notice - Memory Deleted]', err.message);
      }
    }

    return res.json({ success: true, message: "Registro do Diário excluído." });
  });

  // Catch-all for API routes that don't match
  app.all("/api/*", (req, res) => {
    console.warn(`[API 404] ${req.method} ${req.path}`);
    res.status(404).json({ error: `Rota API não encontrada: ${req.method} ${req.path}` });
  });

  // Global Error Handler
  app.use((err: any, req: any, res: any, next: any) => {
    console.error("Global error handler caught:", err);
    if (req.path.startsWith('/api')) {
      return res.status(500).json({ 
        error: "Erro interno no servidor", 
        details: err.message 
      });
    }
    next(err);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
