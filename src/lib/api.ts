import { FCAEntry, DiarioBordoEntry, UserProfile } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

async function safeFetchJson<T>(url: string, options?: RequestInit, defaultValue: T = [] as any): Promise<T> {
  try {
    const res = await fetch(url, options);
    if (!res.ok) {
      console.warn(`[API] Requisição para ${url} retornou status ${res.status}`);
      return defaultValue;
    }
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      console.warn(`[API] Resposta de ${url} não é JSON (${contentType})`);
      return defaultValue;
    }
    return await res.json();
  } catch (e: any) {
    console.warn(`[API] Falha de conexão em ${url}:`, e.message);
    return defaultValue;
  }
}

export interface DbStatusInfo {
  configured: boolean;
  connected: boolean;
  host: string;
  port: number;
  database: string;
  user: string;
  error?: string | null;
  tables?: string[];
  stats?: {
    users?: number;
    fca?: number;
    diario?: number;
  };
  provider?: string;
}

export const api = {
  // Database status
  async getDbStatus(): Promise<DbStatusInfo> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/db/status`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error('Resposta do servidor não foi em formato JSON');
      }
      return await res.json();
    } catch (e: any) {
      return {
        configured: false,
        connected: false,
        host: 'Offline',
        port: 3306,
        database: 'Offline',
        user: 'Offline',
        error: e.message,
        provider: 'Indisponível'
      };
    }
  },

  // Auth Login
  async login(login: string, password: string): Promise<{ success: boolean; user?: any; error?: string }> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login, password })
      });
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        return { success: false, error: 'Servidor temporariamente indisponível.' };
      }
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || 'Falha ao autenticar.' };
      }
      return { success: true, user: data.user };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  // Users & Profiles
  async getUsers(): Promise<UserProfile[]> {
    return safeFetchJson<UserProfile[]>(`${API_BASE_URL}/api/profiles`, undefined, [
      { id: 'admin_master', username: 'admin', role: 'admin', empresas: ['TODAS'] }
    ]);
  },

  async createUser(userData: { login: string; password: string; role: string; adminId?: string; empresas?: string[] }): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/create-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData)
      });
      const data = await res.json().catch(() => ({ success: res.ok }));
      if (!res.ok) return { success: false, error: data.error || 'Erro ao criar usuário.' };
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  async updateUserEmpresas(userId: string, empresas: string[], adminId?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/update-user-empresas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, empresas, adminId })
      });
      const data = await res.json().catch(() => ({ success: res.ok }));
      if (!res.ok) return { success: false, error: data.error || 'Erro ao atualizar empresas.' };
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  async updatePassword(userId: string, newPassword: string, adminId?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/update-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, newPassword, adminId })
      });
      const data = await res.json().catch(() => ({ success: res.ok }));
      if (!res.ok) return { success: false, error: data.error || 'Erro ao alterar senha.' };
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  async deleteUser(userId: string, adminId?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/delete-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, adminId })
      });
      const data = await res.json().catch(() => ({ success: res.ok }));
      if (!res.ok) return { success: false, error: data.error || 'Erro ao excluir usuário.' };
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  // FCA Entries
  async getFCA(): Promise<FCAEntry[]> {
    return safeFetchJson<FCAEntry[]>(`${API_BASE_URL}/api/fca`, undefined, []);
  },

  async saveFCA(entry: Partial<FCAEntry>): Promise<{ success: boolean; error?: string; data?: FCAEntry }> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/fca`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry)
      });
      const data = await res.json().catch(() => ({ success: res.ok, data: entry as FCAEntry }));
      if (!res.ok) return { success: false, error: data.error || 'Erro ao salvar FCA' };
      return { success: true, data: data.data || entry as FCAEntry };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  async updateFCA(id: string, entry: Partial<FCAEntry>): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/fca/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry)
      });
      const data = await res.json().catch(() => ({ success: res.ok }));
      if (!res.ok) return { success: false, error: data.error || 'Erro ao atualizar FCA' };
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  async deleteFCA(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/fca/${id}`, {
        method: 'DELETE'
      });
      const data = await res.json().catch(() => ({ success: res.ok }));
      if (!res.ok) return { success: false, error: data.error || 'Erro ao excluir FCA' };
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  // Diário de Bordo
  async getDiario(): Promise<DiarioBordoEntry[]> {
    return safeFetchJson<DiarioBordoEntry[]>(`${API_BASE_URL}/api/diario`, undefined, []);
  },

  async saveDiario(entry: Partial<DiarioBordoEntry>): Promise<{ success: boolean; error?: string; data?: DiarioBordoEntry }> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/diario`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry)
      });
      const data = await res.json().catch(() => ({ success: res.ok, data: entry as DiarioBordoEntry }));
      if (!res.ok) return { success: false, error: data.error || 'Erro ao salvar Diário' };
      return { success: true, data: data.data || entry as DiarioBordoEntry };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  async updateDiario(id: string, entry: Partial<DiarioBordoEntry>): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/diario/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry)
      });
      const data = await res.json().catch(() => ({ success: res.ok }));
      if (!res.ok) return { success: false, error: data.error || 'Erro ao atualizar Diário' };
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  async deleteDiario(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/diario/${id}`, {
        method: 'DELETE'
      });
      const data = await res.json().catch(() => ({ success: res.ok }));
      if (!res.ok) return { success: false, error: data.error || 'Erro ao excluir Diário' };
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }
};
