import React, { useState, useEffect } from 'react';
import { api, DbStatusInfo, getApiBaseUrl, setCustomApiUrl } from '../lib/api';
import { Lock, ShieldCheck, AlertCircle, RefreshCw, Server, Settings, CheckCircle2, X, ExternalLink, Database, Info } from 'lucide-react';
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
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [customUrlInput, setCustomUrlInput] = useState('');
  const [testingConnection, setTestingConnection] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  const checkStatus = async () => {
    try {
      const status = await api.getDbStatus();
      setDbStatus(status);
    } catch {
      setDbStatus(null);
    }
  };

  useEffect(() => {
    checkStatus();
    setCustomUrlInput(getApiBaseUrl());
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

  const handleSaveConfig = async () => {
    setTestingConnection(true);
    setSaveSuccessMsg(null);
    setErrorMsg(null);

    setCustomApiUrl(customUrlInput);
    await checkStatus();
    setTestingConnection(false);
    setSaveSuccessMsg('Configuração atualizada com sucesso!');
    setTimeout(() => {
      setSaveSuccessMsg(null);
    }, 3000);
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4 font-sans relative">
      <Card className="w-full max-w-sm border-none shadow-2xl bg-white overflow-hidden z-10">
        <div className="h-1.5 bg-claro w-full" />
        <CardContent className="p-8">
          <div className="flex flex-col items-center mb-8">
            <div className="h-16 w-16 bg-red-50 text-claro rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-red-100">
              <ShieldCheck size={32} />
            </div>
            <h1 className="text-2xl font-black tracking-tighter text-zinc-900 uppercase text-center">Certidão de Atendimento</h1>
            <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400 mt-1.5">Acesso Restrito ao Sistema</p>
            
            {/* Status do Banco Hostinger */}
            <button 
              type="button"
              onClick={() => setShowConfigModal(true)}
              className="mt-3 flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-100 hover:bg-zinc-200 text-[10px] font-bold text-zinc-700 transition-colors cursor-pointer"
              title="Clique para ver instruções de conexão e configuração"
            >
              <Server size={12} className={dbStatus?.connected ? "text-emerald-500" : "text-amber-500 animate-pulse"} />
              <span>Hostinger MySQL: {dbStatus?.connected ? 'Conectado' : 'Conectando / Configurar'}</span>
              <Settings size={10} className="text-zinc-400 ml-0.5" />
            </button>
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
                placeholder="admin"
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
                placeholder="123"
                className="w-full h-11 px-3.5 rounded-xl border border-zinc-200 focus:border-claro focus:ring-2 focus:ring-red-100 outline-none text-sm text-zinc-800 font-medium transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-claro hover:bg-claro-hover text-white rounded-xl font-bold text-xs uppercase tracking-wider shadow-lg shadow-red-200 flex items-center justify-center gap-2 transition-all disabled:opacity-50 mt-2 cursor-pointer"
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

          <div className="mt-8 pt-6 border-t border-zinc-100 text-center flex flex-col items-center gap-2">
            <p className="text-[10px] text-zinc-400 font-medium">Gestão Operacional de Qualidade & Produtividade</p>
            <button
              type="button"
              onClick={() => setShowConfigModal(true)}
              className="text-[10px] font-bold text-claro hover:underline flex items-center gap-1 cursor-pointer"
            >
              <Settings size={12} />
              Configurar Banco de Dados Hostinger
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Modal de Configuração e Instruções da Hostinger */}
      {showConfigModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden border border-zinc-200">
            <div className="px-6 py-4 bg-zinc-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database size={18} className="text-claro" />
                <h3 className="text-sm font-black uppercase tracking-wider">Configuração Hostinger MySQL</h3>
              </div>
              <button 
                type="button" 
                onClick={() => setShowConfigModal(false)}
                className="text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
              {/* Status Atual */}
              <div className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-200 flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-zinc-700 block">Status da Conexão:</span>
                  <span className="text-zinc-500 text-[11px]">
                    {dbStatus?.connected ? 'Conectado ao MySQL com sucesso' : (dbStatus?.error || 'Aguardando configuração')}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`h-2.5 w-2.5 rounded-full ${dbStatus?.connected ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                  <span className="font-black text-[11px] uppercase">{dbStatus?.connected ? 'ONLINE' : 'OFFLINE'}</span>
                </div>
              </div>

              {/* Guia Passo a Passo Hostinger */}
              <div className="space-y-3">
                <h4 className="text-xs font-black uppercase tracking-wider text-zinc-900 flex items-center gap-1.5">
                  <Info size={14} className="text-claro" />
                  Como conectar na Hostinger (Hospedagem Web):
                </h4>
                
                <div className="text-xs text-zinc-600 space-y-2.5 leading-relaxed bg-zinc-50 p-4 rounded-xl border border-zinc-100">
                  <p>
                    <strong>1. Crie seu banco no hPanel da Hostinger:</strong><br />
                    Acesse <em>Bancos de Dados &gt; Gerenciamento de Banco de Dados MySQL</em> e anote o <strong>Nome do Banco</strong>, <strong>Usuário</strong> e <strong>Senha</strong>.
                  </p>
                  <p>
                    <strong>2. Arquivo de configuração automático:</strong><br />
                    No <em>Gerenciador de Arquivos</em> da Hostinger, na pasta <code className="bg-zinc-200 px-1 py-0.5 rounded text-zinc-800 font-mono text-[11px]">public_html/api/config.php</code>, insira os dados do banco:
                  </p>
                  <pre className="bg-zinc-900 text-zinc-200 p-3 rounded-lg text-[11px] font-mono overflow-x-auto">
{`define('DB_HOST', 'localhost');
define('DB_USER', 'u123456_usuario');
define('DB_PASSWORD', 'SuaSenhaForte123');
define('DB_NAME', 'u123456_certidao');`}
                  </pre>
                  <p className="text-[11px] text-zinc-500">
                    O sistema cria automaticamente as tabelas e o usuário inicial <strong className="text-zinc-700">admin / 123</strong> assim que conectar.
                  </p>
                </div>
              </div>

              {/* URL da API Customizada (Opcional) */}
              <div className="space-y-2 pt-2 border-t border-zinc-100">
                <label className="block text-[11px] font-bold text-zinc-700">
                  URL da API Backend (Opcional se usar servidor externo / Cloud Run):
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customUrlInput}
                    onChange={(e) => setCustomUrlInput(e.target.value)}
                    placeholder="Vazio = usar PHP da Hostinger local"
                    className="flex-1 h-10 px-3 rounded-xl border border-zinc-200 text-xs font-mono outline-none focus:border-claro"
                  />
                  <button
                    type="button"
                    onClick={handleSaveConfig}
                    disabled={testingConnection}
                    className="h-10 px-4 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {testingConnection ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                    <span>Testar & Salvar</span>
                  </button>
                </div>
                {saveSuccessMsg && (
                  <p className="text-[11px] font-bold text-emerald-600">{saveSuccessMsg}</p>
                )}
              </div>
            </div>

            <div className="px-6 py-4 bg-zinc-50 border-t border-zinc-200 flex justify-end">
              <button
                type="button"
                onClick={() => setShowConfigModal(false)}
                className="px-5 py-2 bg-claro hover:bg-claro-hover text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
