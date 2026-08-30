import React, { useState, useEffect } from 'react';
import { api, DbStatusInfo } from '../lib/api';
import { Lock, ShieldCheck, AlertCircle, RefreshCw, Database, Server } from 'lucide-react';
import { Card, CardContent } from './ui/card';

interface LoginProps {
  onLoginSuccess?: (user: any) => void;
}

export const Login = ({ onLoginSuccess }: LoginProps) => {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [dbStatus, setDbStatus] = useState<DbStatusInfo | null>(null);

  useEffect(() => {
    api.getDbStatus().then(status => {
      setDbStatus(status);
    }).catch(() => {});
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await api.login(login, password);

      if (res.success && res.user) {
        localStorage.setItem('certidao_user_session', JSON.stringify(res.user));
        if (onLoginSuccess) {
          onLoginSuccess(res.user);
        } else {
          window.location.reload();
        }
        return;
      }

      setErrorMsg(res.error || 'Usuário ou senha incorretos.');
    } catch (err: any) {
      console.error('Erro no login:', err);
      setErrorMsg(`Erro de conexão com o servidor: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4 font-sans">
      <Card className="w-full max-w-sm border-none shadow-2xl bg-white overflow-hidden">
        <div className="h-1.5 bg-claro w-full" />
        <CardContent className="p-8">
          <div className="flex flex-col items-center mb-8">
            <div className="h-16 w-16 bg-red-50 text-claro rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-red-100">
              <ShieldCheck size={32} />
            </div>
            <h1 className="text-2xl font-black tracking-tighter text-zinc-900 uppercase text-center">Certidão de Atendimento</h1>
            <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400 mt-1.5">Acesso Restrito ao Sistema</p>
            
            {/* Status do Banco Hostinger */}
            <div className="mt-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-100 text-[9px] font-bold text-zinc-600">
              <Server size={12} className={dbStatus?.connected ? "text-emerald-500" : "text-amber-500 animate-pulse"} />
              <span>Hostinger MySQL: {dbStatus?.connected ? 'Conectado' : 'Conectando / Offline'}</span>
            </div>
          </div>

          {errorMsg && (
            <div className="mb-6 p-3 rounded-xl bg-red-50 border border-red-100 flex items-start gap-2.5 text-red-700 text-xs animate-in fade-in">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{errorMsg}</div>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-500 mb-1.5">Usuário</label>
              <input
                type="text"
                required
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                placeholder="Ex: admin ou seu usuário"
                className="w-full h-11 px-3.5 rounded-xl border border-zinc-200 focus:border-claro focus:ring-2 focus:ring-red-100 outline-none text-sm text-zinc-800 font-medium transition-all"
              />
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-500 mb-1.5">Senha</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full h-11 px-3.5 rounded-xl border border-zinc-200 focus:border-claro focus:ring-2 focus:ring-red-100 outline-none text-sm text-zinc-800 font-medium transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-claro hover:bg-claro-hover text-white rounded-xl font-bold text-xs uppercase tracking-wider shadow-lg shadow-red-200 flex items-center justify-center gap-2 transition-all disabled:opacity-50 mt-2"
            >
              {loading ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  <span>Autenticando...</span>
                </>
              ) : (
                <>
                  <Lock size={16} />
                  <span>Acessar Painel</span>
                </>
              )}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-zinc-100 text-center">
            <p className="text-[10px] text-zinc-400 font-medium">Gestão Operacional de Qualidade & Produtividade</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
