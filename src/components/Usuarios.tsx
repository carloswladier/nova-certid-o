import React, { useState, useEffect, useMemo } from 'react';
import { api, DbStatusInfo } from '../lib/api';
import { UserProfile } from '../types';
import { TODAS_AS_EMPRESAS, parseEmpresasProfile } from '../constants';
import { 
  Plus, Trash2, Edit, Save, X, Users, CheckCircle, AlertCircle, 
  Building2, Check, ShieldCheck, Database, RefreshCw, Server, Eye, EyeOff, Copy
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';

interface UsuariosProps {
  adminProfile: UserProfile | null;
  todasEmpresasDisponiveis?: string[];
}

export const Usuarios = ({ adminProfile, todasEmpresasDisponiveis = [] }: UsuariosProps) => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [dbStatus, setDbStatus] = useState<DbStatusInfo | null>(null);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Form State
  const [newLogin, setNewLogin] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(true);
  const [newRole, setNewRole] = useState<'admin' | 'editor' | 'viewer'>('editor');
  const [selectedEmpresas, setSelectedEmpresas] = useState<string[]>(['TODAS']);

  // Edit Empresas State
  const [editingEmpresasFor, setEditingEmpresasFor] = useState<string | null>(null);
  const [editEmpresasList, setEditEmpresasList] = useState<string[]>([]);
  const [updatingEmpresas, setUpdatingEmpresas] = useState(false);

  // Edit Password State
  const [editingPasswordFor, setEditingPasswordFor] = useState<string | null>(null);
  const [newPasswordValue, setNewPasswordValue] = useState('');
  const [showEditPassword, setShowEditPassword] = useState(true);
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [hiddenPasswordsMap, setHiddenPasswordsMap] = useState<{ [id: string]: boolean }>({});

  const empresasCadastradas = useMemo(() => {
    const list = todasEmpresasDisponiveis.length > 0 ? todasEmpresasDisponiveis : TODAS_AS_EMPRESAS;
    return Array.from(new Set(list)).filter(Boolean).sort();
  }, [todasEmpresasDisponiveis]);

  const fetchDbStatus = async () => {
    try {
      const status = await api.getDbStatus();
      setDbStatus(status);
    } catch {
      // ignore
    }
  };

  const fetchUsers = async () => {
    try {
      const data = await api.getUsers();
      setUsers(data || []);
    } catch (error: any) {
      console.error('Erro ao buscar usuários:', error);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchDbStatus();
  }, []);

  // Lógica do checkbox "TODAS" no formulário de novo usuário
  const isTodasSelected = selectedEmpresas.includes('TODAS') || 
    (empresasCadastradas.length > 0 && empresasCadastradas.every(emp => selectedEmpresas.includes(emp)));

  const handleToggleTodas = () => {
    if (isTodasSelected) {
      setSelectedEmpresas([]);
    } else {
      setSelectedEmpresas(['TODAS', ...empresasCadastradas]);
    }
  };

  const handleToggleEmpresa = (empresa: string) => {
    let updated: string[];
    if (isTodasSelected) {
      updated = empresasCadastradas.filter(e => e !== empresa);
    } else if (selectedEmpresas.includes(empresa)) {
      updated = selectedEmpresas.filter(e => e !== empresa && e !== 'TODAS');
    } else {
      updated = [...selectedEmpresas.filter(e => e !== 'TODAS'), empresa];
      if (empresasCadastradas.every(e => updated.includes(e))) {
        updated = ['TODAS', ...empresasCadastradas];
      }
    }
    setSelectedEmpresas(updated);
  };

  // Lógica para edição de empresas de usuário existente
  const isEditingTodasSelected = editEmpresasList.includes('TODAS') ||
    (empresasCadastradas.length > 0 && empresasCadastradas.every(emp => editEmpresasList.includes(emp)));

  const handleToggleEditTodas = () => {
    if (isEditingTodasSelected) {
      setEditEmpresasList([]);
    } else {
      setEditEmpresasList(['TODAS', ...empresasCadastradas]);
    }
  };

  const handleToggleEditEmpresa = (empresa: string) => {
    let updated: string[];
    if (isEditingTodasSelected) {
      updated = empresasCadastradas.filter(e => e !== empresa);
    } else if (editEmpresasList.includes(empresa)) {
      updated = editEmpresasList.filter(e => e !== empresa && e !== 'TODAS');
    } else {
      updated = [...editEmpresasList.filter(e => e !== 'TODAS'), empresa];
      if (empresasCadastradas.every(e => updated.includes(e))) {
        updated = ['TODAS', ...empresasCadastradas];
      }
    }
    setEditEmpresasList(updated);
  };

  const handleStartEditEmpresas = (u: UserProfile) => {
    setEditingEmpresasFor(u.id);
    const parsed = parseEmpresasProfile(u.empresas);
    if (u.role === 'admin' || parsed.includes('TODAS') || parsed.length === 0) {
      setEditEmpresasList(['TODAS', ...empresasCadastradas]);
    } else {
      setEditEmpresasList(parsed);
    }
  };

  const handleSaveEditEmpresas = async (userId: string) => {
    setUpdatingEmpresas(true);
    try {
      const finalEmpresas = isEditingTodasSelected ? ['TODAS'] : editEmpresasList;
      const res = await api.updateUserEmpresas(userId, finalEmpresas, adminProfile?.id);

      if (res.success) {
        setMessage({ text: 'Permissões de empresa atualizadas com sucesso!', type: 'success' });
        setEditingEmpresasFor(null);
        fetchUsers();
      } else {
        setMessage({ text: res.error || 'Erro ao atualizar empresas.', type: 'error' });
      }
    } catch (err: any) {
      console.error('Erro ao atualizar empresas do usuário:', err);
      setMessage({ text: 'Erro ao atualizar empresas: ' + (err.message || 'Verifique sua conexão'), type: 'error' });
    } finally {
      setUpdatingEmpresas(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanLogin = newLogin.trim();
    if (!cleanLogin) {
      setMessage({ text: 'Informe o nome de usuário / login.', type: 'error' });
      return;
    }

    setLoading(true);
    setMessage(null);

    const finalEmpresas = isTodasSelected ? ['TODAS'] : selectedEmpresas;
    
    try {
      const res = await api.createUser({
        login: cleanLogin,
        password: newPassword,
        role: newRole,
        adminId: adminProfile?.id,
        empresas: finalEmpresas
      });

      if (res.success) {
        setMessage({ text: `Usuário "${cleanLogin}" cadastrado com sucesso no banco Hostinger!`, type: 'success' });
        setNewLogin('');
        setNewPassword('');
        setSelectedEmpresas(['TODAS']);
        fetchUsers();
        setTimeout(() => setMessage(null), 5000);
      } else {
        setMessage({ text: res.error || 'Erro ao criar usuário.', type: 'error' });
      }
    } catch (err: any) {
      setMessage({ text: err.message || 'Erro ao cadastrar usuário', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId: string, username: string) => {
    if (username === 'admin') {
      alert('O usuário administrador principal "admin" não pode ser excluído.');
      return;
    }

    const displayName = username || 'este perfil';
    if (!confirm(`Deseja realmente excluir ${displayName}?`)) return;

    try {
      const res = await api.deleteUser(userId, adminProfile?.id);
      if (res.success) {
        setMessage({ text: `Usuário ${displayName} excluído com sucesso.`, type: 'success' });
        fetchUsers();
      } else {
        setMessage({ text: res.error || 'Erro ao excluir usuário.', type: 'error' });
      }
    } catch (err: any) {
      alert('Erro ao excluir: ' + err.message);
    }
  };

  const handleSavePassword = async (userId: string, username: string) => {
    if (!newPasswordValue.trim()) {
      alert('Informe a nova senha.');
      return;
    }

    setUpdatingPassword(true);
    try {
      const res = await api.updatePassword(userId, newPasswordValue.trim(), adminProfile?.id);
      if (res.success) {
        setMessage({ text: `Senha de "${username}" alterada com sucesso.`, type: 'success' });
        setEditingPasswordFor(null);
        setNewPasswordValue('');
        fetchUsers();
      } else {
        setMessage({ text: res.error || 'Erro ao alterar senha.', type: 'error' });
      }
    } catch (err: any) {
      alert('Erro ao alterar senha: ' + err.message);
    } finally {
      setUpdatingPassword(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header & Status Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-zinc-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-red-50 text-claro">
              <Users size={24} />
            </div>
            <div>
              <h2 className="text-xl font-black tracking-tight text-zinc-900">Gerenciamento de Usuários</h2>
              <p className="text-xs text-zinc-500 font-medium">Controle de acessos, perfis e permissões por empresa parceira</p>
            </div>
          </div>
        </div>

        {/* Status Conexão Hostinger */}
        <div className="flex items-center gap-3 bg-zinc-50 px-4 py-2.5 rounded-xl border border-zinc-200">
          <Server size={18} className={dbStatus?.connected ? "text-emerald-500" : "text-amber-500"} />
          <div className="text-xs">
            <div className="font-bold text-zinc-800">
              Hostinger MySQL: <span className={dbStatus?.connected ? "text-emerald-600 font-black" : "text-amber-600"}>{dbStatus?.connected ? "Conectado" : "Offline / Aguardando"}</span>
            </div>
            <div className="text-[10px] text-zinc-500">
              {dbStatus?.host !== 'Offline' ? `${dbStatus?.host} (${dbStatus?.database})` : 'Configure os Secrets do MySQL'}
            </div>
          </div>
          <button 
            onClick={() => { fetchDbStatus(); fetchUsers(); }} 
            className="p-1.5 hover:bg-zinc-200 rounded-lg text-zinc-500 transition-colors"
            title="Atualizar status"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-xl flex items-center gap-3 text-xs font-semibold ${
          message.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {message.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Grid: Novo Usuário & Lista */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Formulário de Criação */}
        <div className="lg:col-span-1">
          <Card className="border border-zinc-200 shadow-sm rounded-2xl overflow-hidden bg-white">
            <CardHeader className="bg-zinc-50/50 border-b border-zinc-100 p-5">
              <CardTitle className="text-sm font-black tracking-tight text-zinc-900 flex items-center gap-2">
                <Plus size={16} className="text-claro" />
                Novo Usuário
              </CardTitle>
              <CardDescription className="text-xs text-zinc-500">
                Cadastrar novo perfil de acesso no banco Hostinger
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5">
              <form onSubmit={handleCreateUser} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-500 mb-1.5">
                    Nome de Usuário / Login
                  </label>
                  <input
                    type="text"
                    required
                    value={newLogin}
                    onChange={(e) => setNewLogin(e.target.value)}
                    placeholder="Ex: joao.silva"
                    className="w-full h-10 px-3 rounded-xl border border-zinc-200 focus:border-claro focus:ring-2 focus:ring-red-100 outline-none text-xs text-zinc-800 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-500 mb-1.5">
                    Senha Inicial
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type={showNewPassword ? "text" : "password"}
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Digite a senha..."
                      className="w-full h-10 px-3 pr-10 rounded-xl border border-zinc-200 focus:border-claro focus:ring-2 focus:ring-red-100 outline-none text-xs text-zinc-800 font-bold font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-2.5 p-1 text-zinc-400 hover:text-zinc-700 transition-colors"
                      title={showNewPassword ? "Ocultar senha" : "Ver senha"}
                    >
                      {showNewPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-500 mb-1.5">
                    Nível de Acesso (Perfil)
                  </label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as any)}
                    className="w-full h-10 px-3 rounded-xl border border-zinc-200 focus:border-claro focus:ring-2 focus:ring-red-100 outline-none text-xs text-zinc-800 font-medium bg-white"
                  >
                    <option value="editor">Editor (Registra FCA e Diário)</option>
                    <option value="admin">Administrador (Acesso Total)</option>
                    <option value="viewer">Visualizador (Apenas Leitura)</option>
                  </select>
                </div>

                {/* Seletor de Empresas */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-500">
                      Empresas Autorizadas
                    </label>
                    <span className="text-[10px] font-bold text-claro">
                      {isTodasSelected ? 'Acesso a TODAS' : `${selectedEmpresas.length} selecionada(s)`}
                    </span>
                  </div>

                  {/* Opção TODAS */}
                  <div 
                    onClick={handleToggleTodas}
                    className={`flex items-center justify-between p-2.5 rounded-xl border mb-2 cursor-pointer transition-all ${
                      isTodasSelected 
                        ? 'bg-red-50/80 border-claro/40 text-claro font-black' 
                        : 'bg-zinc-50 border-zinc-200 text-zinc-700 hover:bg-zinc-100 font-semibold'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-xs">
                      <Building2 size={15} />
                      <span>TODAS AS EMPRESAS (Acesso Geral)</span>
                    </div>
                    <div className={`w-5 h-5 rounded-lg flex items-center justify-center ${isTodasSelected ? 'bg-claro text-white' : 'border border-zinc-300'}`}>
                      {isTodasSelected && <Check size={13} strokeWidth={3} />}
                    </div>
                  </div>

                  {/* Lista de Empresas Individuais */}
                  <div className="max-h-44 overflow-y-auto space-y-1.5 p-2 rounded-xl border border-zinc-200 bg-zinc-50/50">
                    {empresasCadastradas.map((empresa) => {
                      const isChecked = isTodasSelected || selectedEmpresas.includes(empresa);
                      return (
                        <div
                          key={empresa}
                          onClick={() => handleToggleEmpresa(empresa)}
                          className={`flex items-center justify-between p-2 rounded-lg text-xs cursor-pointer transition-colors ${
                            isChecked 
                              ? 'bg-white text-zinc-900 font-bold border border-zinc-200 shadow-2xs' 
                              : 'text-zinc-500 hover:bg-zinc-100'
                          }`}
                        >
                          <span className="truncate pr-2">{empresa}</span>
                          <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 ${isChecked ? 'bg-claro text-white' : 'border border-zinc-300'}`}>
                            {isChecked && <Check size={11} strokeWidth={3} />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-10 bg-claro hover:bg-claro-hover text-white rounded-xl font-bold text-xs uppercase tracking-wider shadow-md shadow-red-100 flex items-center justify-center gap-2 transition-all disabled:opacity-50 mt-4"
                >
                  {loading ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
                  <span>Salvar Usuário</span>
                </button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Tabela de Usuários */}
        <div className="lg:col-span-2">
          <Card className="border border-zinc-200 shadow-sm rounded-2xl overflow-hidden bg-white">
            <CardHeader className="bg-zinc-50/50 border-b border-zinc-100 p-5 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-black tracking-tight text-zinc-900">
                  Usuários Cadastrados ({users.length})
                </CardTitle>
                <CardDescription className="text-xs text-zinc-500">
                  Perfis salvos no banco de dados Hostinger MySQL
                </CardDescription>
              </div>
              <button
                onClick={fetchUsers}
                className="p-2 text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 rounded-xl transition-colors text-xs font-bold flex items-center gap-1.5"
              >
                <RefreshCw size={13} />
                <span>Atualizar</span>
              </button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-50 text-[10px] uppercase font-black tracking-wider text-zinc-500 border-b border-zinc-100">
                    <tr>
                      <th className="p-4">Usuário</th>
                      <th className="p-4">Perfil</th>
                      <th className="p-4">Empresas Autorizadas</th>
                      <th className="p-4 text-center">Senha</th>
                      <th className="p-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {users.map((u) => {
                      const parsedEmpresas = parseEmpresasProfile(u.empresas);
                      const isMaster = u.role === 'admin' || parsedEmpresas.includes('TODAS') || parsedEmpresas.length === 0;
                      const isEditingThisUser = editingEmpresasFor === u.id;
                      const isEditingThisPassword = editingPasswordFor === u.id;

                      return (
                        <tr key={u.id} className="hover:bg-zinc-50/60 transition-colors">
                          <td className="p-4 font-bold text-zinc-900">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-lg bg-zinc-100 text-zinc-700 flex items-center justify-center font-black text-xs uppercase">
                                {(u.username || 'U').substring(0, 2)}
                              </div>
                              {u.username ? (
                                <span>{u.username}</span>
                              ) : (
                                <span className="text-zinc-400 italic font-normal text-[11px]">(Nome em branco)</span>
                              )}
                            </div>
                          </td>

                          <td className="p-4">
                            <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                              u.role === 'admin' 
                                ? 'bg-red-50 text-claro border border-red-100' 
                                : u.role === 'editor'
                                ? 'bg-blue-50 text-blue-700 border border-blue-100'
                                : 'bg-zinc-100 text-zinc-600'
                            }`}>
                              {u.role || 'editor'}
                            </span>
                          </td>

                          <td className="p-4">
                            {isEditingThisUser ? (
                              <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200 space-y-2.5">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-black uppercase text-zinc-500">Editar Permissões</span>
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      onClick={() => handleSaveEditEmpresas(u.id)}
                                      disabled={updatingEmpresas}
                                      className="px-2 py-1 bg-emerald-600 text-white rounded-md text-[10px] font-bold flex items-center gap-1 hover:bg-emerald-700"
                                    >
                                      <Save size={11} />
                                      <span>Salvar</span>
                                    </button>
                                    <button
                                      onClick={() => setEditingEmpresasFor(null)}
                                      className="p-1 text-zinc-400 hover:text-zinc-700"
                                    >
                                      <X size={13} />
                                    </button>
                                  </div>
                                </div>

                                <div 
                                  onClick={handleToggleEditTodas}
                                  className={`flex items-center justify-between p-1.5 rounded-lg border text-[11px] cursor-pointer ${
                                    isEditingTodasSelected ? 'bg-red-50 border-claro/30 text-claro font-bold' : 'bg-white border-zinc-200'
                                  }`}
                                >
                                  <span>TODAS AS EMPRESAS</span>
                                  {isEditingTodasSelected && <Check size={12} />}
                                </div>

                                <div className="max-h-32 overflow-y-auto space-y-1 p-1 bg-white rounded-lg border border-zinc-200">
                                  {empresasCadastradas.map((emp) => {
                                    const isChecked = isEditingTodasSelected || editEmpresasList.includes(emp);
                                    return (
                                      <div
                                        key={emp}
                                        onClick={() => handleToggleEditEmpresa(emp)}
                                        className={`flex items-center justify-between px-2 py-1 rounded text-[10px] cursor-pointer ${
                                          isChecked ? 'bg-zinc-100 font-bold text-zinc-900' : 'text-zinc-500'
                                        }`}
                                      >
                                        <span className="truncate pr-1">{emp}</span>
                                        {isChecked && <Check size={10} className="text-claro" />}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                {isMaster ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100">
                                    <Building2 size={12} />
                                    <span>TODAS</span>
                                  </span>
                                ) : (
                                  <div className="flex flex-wrap gap-1 max-w-xs">
                                    {parsedEmpresas.map(emp => (
                                      <span key={emp} className="px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-700 text-[10px] font-semibold">
                                        {emp}
                                      </span>
                                    ))}
                                  </div>
                                )}
                                <button
                                  onClick={() => handleStartEditEmpresas(u)}
                                  className="p-1 text-zinc-400 hover:text-claro transition-colors"
                                  title="Editar empresas autorizadas"
                                >
                                  <Edit size={13} />
                                </button>
                              </div>
                            )}
                          </td>

                          <td className="p-4 text-center">
                            {isEditingThisPassword ? (
                              <div className="inline-flex items-center gap-1.5 justify-center bg-zinc-50 p-1.5 rounded-xl border border-zinc-200 shadow-2xs">
                                <div className="relative flex items-center">
                                  <input
                                    type={showEditPassword ? "text" : "password"}
                                    value={newPasswordValue}
                                    onChange={(e) => setNewPasswordValue(e.target.value)}
                                    placeholder="Nova senha"
                                    className="h-8 w-28 px-2 pr-7 rounded-lg border border-zinc-300 text-xs font-mono font-bold bg-white text-zinc-900 focus:border-claro outline-none"
                                    autoFocus
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setShowEditPassword(!showEditPassword)}
                                    className="absolute right-1 text-zinc-400 hover:text-zinc-700"
                                    title={showEditPassword ? "Ocultar" : "Mostrar"}
                                  >
                                    {showEditPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                                  </button>
                                </div>
                                <button
                                  onClick={() => handleSavePassword(u.id, u.username)}
                                  disabled={updatingPassword}
                                  className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
                                  title="Salvar nova senha"
                                >
                                  <Save size={13} />
                                </button>
                                <button
                                  onClick={() => {
                                    setEditingPasswordFor(null);
                                    setNewPasswordValue('');
                                  }}
                                  className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200 rounded-lg transition-colors"
                                  title="Cancelar"
                                >
                                  <X size={13} />
                                </button>
                              </div>
                            ) : (
                              (() => {
                                const isHidden = hiddenPasswordsMap[u.id] === true;
                                const pwd = u.password_plain || (u as any).password || (u.username === 'admin' ? '123' : '123');

                                return (
                                  <div className="inline-flex items-center gap-1.5 bg-zinc-100/90 hover:bg-zinc-100 px-2.5 py-1.5 rounded-xl border border-zinc-200/80 shadow-2xs transition-colors">
                                    <span className="font-mono font-bold text-xs text-zinc-900 tracking-wider select-all">
                                      {isHidden ? '••••••' : pwd}
                                    </span>

                                    <button
                                      type="button"
                                      onClick={() => {
                                        setHiddenPasswordsMap(prev => ({ ...prev, [u.id]: !isHidden }));
                                      }}
                                      className="p-1 text-zinc-400 hover:text-zinc-700 rounded-md transition-colors"
                                      title={isHidden ? "Mostrar senha" : "Ocultar senha"}
                                    >
                                      {isHidden ? <Eye size={13} /> : <EyeOff size={13} />}
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => {
                                        navigator.clipboard.writeText(pwd);
                                        setCopiedId(u.id);
                                        setTimeout(() => setCopiedId(null), 2000);
                                      }}
                                      className="p-1 text-zinc-400 hover:text-zinc-700 rounded-md transition-colors"
                                      title="Copiar senha"
                                    >
                                      {copiedId === u.id ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingPasswordFor(u.id);
                                        setNewPasswordValue(pwd);
                                        setShowEditPassword(true);
                                      }}
                                      className="p-1 text-zinc-400 hover:text-claro rounded-md transition-colors ml-0.5"
                                      title="Alterar senha"
                                    >
                                      <Edit size={13} />
                                    </button>
                                  </div>
                                );
                              })()
                            )}
                          </td>

                          <td className="p-4 text-right">
                            {u.username !== 'admin' && (
                              <button
                                onClick={() => handleDeleteUser(u.id, u.username)}
                                className="p-2 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                                title="Excluir usuário"
                              >
                                <Trash2 size={15} />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
