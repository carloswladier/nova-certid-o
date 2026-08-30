/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Version: 1.1.0 - Realtime Sync & Cache Busting
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
/*
  SUPABASE SQL SETUP:
  Run this in your Supabase SQL Editor to enable user roles:

  CREATE TABLE profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    username TEXT,
    role TEXT CHECK (role IN ('admin', 'editor', 'user')) DEFAULT 'editor',
    password_plain TEXT -- Stores plain text password for admin reference
  );

  -- Enable RLS
  ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

  -- Policies
  CREATE POLICY "Profiles are viewable by everyone" ON profiles FOR SELECT USING (true);
  CREATE POLICY "Admins can update profiles" ON profiles FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
  CREATE POLICY "Admins can insert profiles" ON profiles FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
  CREATE POLICY "Admins can delete profiles" ON profiles FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

  -- Trigger to create profile on signup (optional but recommended)
  CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS trigger AS $$
  BEGIN
    INSERT INTO public.profiles (id, username, role)
    VALUES (new.id, SPLIT_PART(new.email, '@', 1), 'editor')
    ON CONFLICT (id) DO NOTHING;
    RETURN new;
  END;
  $$ LANGUAGE plpgsql SECURITY DEFINER;

  CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
*/
import * as XLSX from 'xlsx';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, AreaChart, Area, LabelList
} from 'recharts';
import { 
  UploadCloud, FileSpreadsheet, AlertTriangle, CheckCircle, Info, AlertCircle, 
  User, Clock, ShieldCheck, Briefcase, X, Settings, Plus, Edit, Save,
  LogOut, Lock, RefreshCw, Search, Download, ArrowUp, Calendar, Trash2
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './components/ui/card';
import { api } from './lib/api';
import { MESES, RESTRICOES_RECURSOS, CATEGORIAS, EMPRESA_MAPPING, TODAS_AS_EMPRESAS, parseEmpresasProfile } from './constants';
import { Login } from './components/Login';
import { Usuarios } from './components/Usuarios';
import { Registro, FCAEntry, DiarioBordoEntry, UserProfile } from './types';

// Interface para os registros com as colunas específicas solicitadas
// (Interfaces movidas para types.ts)

interface ResumoCategoria {
  name: string;
  value: number;
  color: string;
}

// Configuração das categorias de classificação
// (CATEGORIAS movido para constants.ts)

// Base URL for API calls - use VITE_API_URL if defined (e.g. in Netlify), 
// otherwise fallback to the hardcoded dev URL when on Netlify, 
// or empty string when running locally/on AI Studio.
const API_BASE_URL = import.meta.env.VITE_API_URL || (window.location.hostname.includes('netlify.app') 
  ? 'https://ais-dev-mcmywtpwb6jc3yb7g5d3h2-10059141469.us-west2.run.app' 
  : '');

const GITHUB_EXCEL_URL = import.meta.env.VITE_GITHUB_EXCEL_URL || 'https://raw.githubusercontent.com/carloswladier/certidao-data/main/Certidao_Atendimento.xlsx';

const normalizarChave = (chave: string) => {
  if (!chave) return "";
  return chave.toString().toUpperCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove acentos
    .replace(/[^A-Z0-9]/g, '_') // Substitui caracteres especiais por _
    .replace(/_+/g, '_') // Remove múltiplos _
    .replace(/^_+|_+$/g, '') // Remove _ no início e fim
    .trim();
};

const formatarData = (data: any) => {
  if (!data) return '-';
  
  // Se for uma string no formato YYYY-MM-DD (comum em inputs de data e bancos de dados)
  if (typeof data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data)) {
    const [year, month, day] = data.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('pt-BR');
  }

  if (data instanceof Date && !isNaN(data.getTime())) {
    return data.toLocaleDateString('pt-BR');
  }
  
  if (typeof data === 'number') {
    const dateObj = new Date(Math.round((data - 25569) * 86400 * 1000));
    return dateObj.toLocaleDateString('pt-BR');
  }

  // Fallback para outros formatos de string
  const parsed = new Date(data);
  if (!isNaN(parsed.getTime())) {
    // Se a string contém apenas a data (sem hora), o JS pode interpretar como UTC.
    // Vamos tentar detectar se houve esse shift.
    return parsed.toLocaleDateString('pt-BR');
  }

  return data.toString();
};

const getNotaColor = (nota: string) => {
  if (!nota || nota === '-' || nota === '0.0%' || nota === '0%') return 'text-zinc-400';
  const value = parseFloat(nota.replace('%', ''));
  if (isNaN(value)) return 'text-zinc-400';
  if (value >= 80) return 'text-green-600';
  if (value >= 70) return 'text-yellow-600';
  return 'text-red-600';
};

const getNotaBgColor = (nota: string) => {
  if (!nota || nota === '-' || nota === '0.0%' || nota === '0%') return 'bg-zinc-200';
  const value = parseFloat(nota.replace('%', ''));
  if (isNaN(value)) return 'bg-zinc-200';
  if (value >= 80) return 'bg-green-500';
  if (value >= 70) return 'bg-yellow-500';
  return 'bg-red-500';
};

const getNotaColorHex = (value: number) => {
  if (value >= 80) return '#16a34a'; // green-600
  if (value >= 70) return '#ca8a04'; // yellow-600
  return '#dc2626'; // red-600
};

export interface StatusDefinicao {
  key: string;
  shortName: string;
  label: string;
  color: string;
  textColor: string;
  barColor: string;
  isValidado: boolean;
  match: (s: string) => boolean;
}

export const STATUS_DEFINICOES: StatusDefinicao[] = [
  {
    key: 'VALIDADO - SEM FALHA',
    shortName: 'V. SEM FALHA',
    label: 'Validado - Sem Falha',
    color: '#000000',
    textColor: 'text-zinc-900',
    barColor: 'bg-zinc-900',
    isValidado: true,
    match: (s: string) => {
      const u = s.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      return (u.includes('VALIDADO') && u.includes('SEM FALHA') && !u.includes('NAO')) || u === 'OK' || u === 'VALIDADO';
    }
  },
  {
    key: 'VALIDADO - COM FALHA',
    shortName: 'V. COM FALHA',
    label: 'Validado - Com Falha',
    color: '#EE2924',
    textColor: 'text-claro',
    barColor: 'bg-claro',
    isValidado: true,
    match: (s: string) => {
      const u = s.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      return u === 'VALIDADO - COM FALHA' || u === 'VALIDADO COM FALHA' || (u.includes('VALIDADO') && u.includes('COM FALHA') && !u.includes('JUSTIFICADO') && !u.includes('API') && !u.includes('NAO'));
    }
  },
  {
    key: 'VALIDADO - COM FALHA API',
    shortName: 'V. FALHA API',
    label: 'Validado - Falha API',
    color: '#b91c1c',
    textColor: 'text-red-700',
    barColor: 'bg-red-700',
    isValidado: true,
    match: (s: string) => {
      const u = s.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      return u.includes('VALIDADO') && u.includes('FALHA') && u.includes('API') && !u.includes('NAO');
    }
  },
  {
    key: 'VALIDADO - COM FALHA - JUSTIFICADO',
    shortName: 'V. JUSTIFICADO',
    label: 'Validado - Justificado',
    color: '#333333',
    textColor: 'text-zinc-800',
    barColor: 'bg-zinc-800',
    isValidado: true,
    match: (s: string) => {
      const u = s.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      return u.includes('JUSTIFICADO') && u.includes('VALIDADO') && !u.includes('NAO');
    }
  },
  {
    key: 'NAO VALIDADO - COM FALHA',
    shortName: 'NV. COM FALHA',
    label: 'Não Validado - Com Falha',
    color: '#ef4444',
    textColor: 'text-red-500',
    barColor: 'bg-red-500',
    isValidado: false,
    match: (s: string) => {
      const u = s.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      return u.includes('NAO') && u.includes('VALIDADO') && u.includes('COM FALHA') && !u.includes('API') && !u.includes('JUSTIFICADO');
    }
  },
  {
    key: 'NAO VALIDADO - SEM FALHA',
    shortName: 'NV. SEM FALHA',
    label: 'Não Validado - Sem Falha',
    color: '#3b82f6',
    textColor: 'text-blue-500',
    barColor: 'bg-blue-500',
    isValidado: false,
    match: (s: string) => {
      const u = s.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      return u.includes('NAO') && u.includes('VALIDADO') && u.includes('SEM FALHA');
    }
  },
  {
    key: 'NAO VALIDADO - COM FALHA API',
    shortName: 'NV. FALHA API',
    label: 'Não Validado - Falha API',
    color: '#f97316',
    textColor: 'text-orange-500',
    barColor: 'bg-orange-500',
    isValidado: false,
    match: (s: string) => {
      const u = s.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      return u.includes('NAO') && u.includes('VALIDADO') && u.includes('FALHA') && u.includes('API');
    }
  }
];

const MultiSelect = ({ 
  label, 
  options, 
  selected, 
  onChange, 
  placeholder,
  required = false
}: { 
  label: string; 
  options: string[]; 
  selected: string[]; 
  onChange: (val: string[]) => void; 
  placeholder: string;
  required?: boolean;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  const normalize = (str: string) => 
    str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const filteredOptions = options.filter(opt => 
    normalize(opt).includes(normalize(searchTerm))
  );

  const isAllSelected = selected.length === 0 || (options.length > 0 && options.every(opt => selected.includes(opt)));

  const toggleOption = (option: string) => {
    if (selected.length === 0) {
      // Se estava em "TODOS", ao clicar em uma opção específica seleciona apenas ela
      onChange([option]);
    } else if (selected.includes(option)) {
      const next = selected.filter(item => item !== option);
      onChange(next);
    } else {
      onChange([...selected, option]);
    }
  };

  const toggleAll = () => {
    if (selected.length === 0) {
      onChange([]);
    } else {
      onChange([]);
    }
  };

  const toggleAllFiltered = () => {
    const allFilteredSelected = filteredOptions.length > 0 && filteredOptions.every(opt => selected.includes(opt));
    if (allFilteredSelected || selected.length === 0) {
      onChange([]);
    } else {
      const newSelection = Array.from(new Set([...selected, ...filteredOptions]));
      onChange(newSelection);
    }
  };

  return (
    <div className="w-full relative">
      <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-1.5 block">
        {label} {required && <span className="text-claro">*</span>}
      </label>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-zinc-50 border-none rounded-lg px-3 py-2.5 text-sm font-bold cursor-pointer flex justify-between items-center min-h-[42px] hover:ring-2 hover:ring-claro/5 transition-all shadow-sm group"
      >
        <span className={`truncate pr-2 transition-colors ${selected.length > 0 ? 'text-zinc-800 font-bold group-hover:text-claro' : 'text-zinc-600 font-semibold'}`}>
          {selected.length === 0 
            ? placeholder 
            : selected.length === 1 
              ? selected[0] 
              : `${selected.length} selecionados`}
        </span>
        <Settings size={14} className={`transition-transform text-zinc-400 shrink-0 ${isOpen ? 'rotate-180 text-claro' : 'group-hover:text-claro'}`} />
      </div>
      
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setIsOpen(false); setSearchTerm(''); }}></div>
          <div className="absolute top-full left-0 mt-1.5 bg-white border border-zinc-100 rounded-xl shadow-[0_20px_40px_rgba(0,0,0,0.2)] z-50 max-h-[500px] w-full min-w-[240px] md:min-w-[300px] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-3 border-b border-zinc-100 bg-zinc-50/50">
              <input 
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Pesquisar..."
                className="w-full bg-white border border-zinc-200 rounded-lg px-3.5 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-claro/10 focus:border-claro transition-all"
                autoFocus
              />
            </div>
            
            <div className="flex justify-between items-center px-3 py-2 bg-white border-b border-zinc-50">
              <div className="flex gap-3">
                <button 
                  type="button"
                  onClick={toggleAllFiltered}
                  className="text-[10px] font-black uppercase tracking-widest text-claro hover:opacity-80 transition-opacity"
                >
                  {selected.length === 0 || (filteredOptions.length > 0 && filteredOptions.every(opt => selected.includes(opt))) ? 'Desmarcar' : 'Selecionar'}
                </button>
                <span className="text-[10px] font-bold text-zinc-200">|</span>
                <button 
                  type="button"
                  onClick={() => { onChange([]); setIsOpen(false); setSearchTerm(''); }}
                  className="text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-zinc-600"
                >
                  Limpar
                </button>
              </div>
              <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">{filteredOptions.length} {filteredOptions.length === 1 ? 'item' : 'itens'}</span>
            </div>

            <div className="overflow-y-auto p-1 space-y-0.5 custom-scrollbar bg-white max-h-[300px]">
              {/* Opção TODOS sempre visível no topo da lista */}
              {!searchTerm && (
                <div 
                  onClick={toggleAll}
                  className={`flex items-center gap-3 px-3 py-2 hover:bg-zinc-50 rounded-lg cursor-pointer transition-all border-b border-zinc-100 mb-1 ${selected.length === 0 ? 'bg-claro/5' : ''}`}
                >
                  <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${selected.length === 0 ? 'bg-claro border-claro text-white' : 'border-zinc-300 bg-white'}`}>
                    {selected.length === 0 && <CheckCircle size={10} strokeWidth={3} />}
                  </div>
                  <span className={`text-xs font-black uppercase tracking-wider ${selected.length === 0 ? 'text-claro font-black' : 'text-zinc-700'}`}>
                    TODOS ({options.length})
                  </span>
                </div>
              )}

              {filteredOptions.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-zinc-400 text-[10px] font-black uppercase tracking-widest">Não encontrado</p>
                </div>
              ) : (
                filteredOptions.map(opt => {
                  const isExplicitlySelected = selected.includes(opt);
                  return (
                    <div 
                      key={opt}
                      onClick={() => toggleOption(opt)}
                      className={`flex items-center gap-3 px-3 py-2 hover:bg-zinc-50 rounded-lg cursor-pointer transition-all ${isExplicitlySelected ? 'bg-claro/5' : ''}`}
                    >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${isExplicitlySelected ? 'bg-claro border-claro text-white' : 'border-zinc-300 bg-white'}`}>
                        {isExplicitlySelected && <CheckCircle size={10} strokeWidth={3} />}
                      </div>
                      <span className={`text-xs font-bold truncate ${isExplicitlySelected ? 'text-claro font-black' : 'text-zinc-600'}`}>{opt}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// Cache para persistir dados entre re-montagens do componente App (ex: flicker de sessão)
let cachedDados: Registro[] = [];
let cachedFcaEntries: FCAEntry[] = [];
let cachedDiarioEntries: DiarioBordoEntry[] = [];

export default function App() {
  const [user, setUser] = useState<any>(() => {
    try {
      const localSession = localStorage.getItem('certidao_user_session');
      if (localSession) {
        const parsed = JSON.parse(localSession);
        if (parsed && (parsed.id || parsed.username)) {
          return { id: parsed.id, email: parsed.email || `${parsed.username}@atendimento.com.br`, ...parsed };
        }
      }
    } catch {}
    return null;
  });

  const [profile, setProfile] = useState<UserProfile | null>(() => {
    try {
      const localSession = localStorage.getItem('certidao_user_session');
      if (localSession) {
        const parsed = JSON.parse(localSession);
        if (parsed && (parsed.id || parsed.username)) {
          return {
            id: parsed.id,
            username: parsed.username,
            role: parsed.role || 'editor',
            empresas: parsed.empresas || ['TODAS']
          };
        }
      }
    } catch {}
    return null;
  });

  const [loadingSession, setLoadingSession] = useState(false);
  const [abaAtiva, setAbaAtiva] = useState<'dashboard' | 'fca' | 'diario' | 'usuarios' | 'analitico'>('dashboard');
  const [searchAnalitico, setSearchAnalitico] = useState('');
  const [dados, setDados] = useState<Registro[]>(cachedDados);
  
  const [fcaEntries, setFcaEntries] = useState<FCAEntry[]>(cachedFcaEntries);
  const [diarioEntries, setDiarioEntries] = useState<DiarioBordoEntry[]>(cachedDiarioEntries);
  
  // Sincronizar cache
  useEffect(() => { cachedDados = dados; }, [dados]);
  useEffect(() => { cachedFcaEntries = fcaEntries; }, [fcaEntries]);
  useEffect(() => { cachedDiarioEntries = diarioEntries; }, [diarioEntries]);
  const [editingDiario, setEditingDiario] = useState<DiarioBordoEntry | null>(null);
  const [editingFCA, setEditingFCA] = useState<FCAEntry | null>(null);
  const [fcaParaExcluir, setFcaParaExcluir] = useState<FCAEntry | null>(null);
  const [diarioParaExcluir, setDiarioParaExcluir] = useState<DiarioBordoEntry | null>(null);
  const [isExcluindo, setIsExcluindo] = useState<boolean>(false);

  // Estados controlados para o formulário da aba FCA com suporte a multi-seleção e opção TODOS
  const [fcaFormMes, setFcaFormMes] = useState<string[]>([]);
  const [fcaFormRecurso, setFcaFormRecurso] = useState<string[]>([]);
  const [fcaFormMunicipio, setFcaFormMunicipio] = useState<string[]>([]);
  const [fcaFormLogin, setFcaFormLogin] = useState<string[]>([]);
  const [fcaFormJornada, setFcaFormJornada] = useState<string[]>([]);
  const [fcaFormS1, setFcaFormS1] = useState<string>('');
  const [fcaFormS2, setFcaFormS2] = useState<string>('');
  const [fcaFormS3, setFcaFormS3] = useState<string>('');
  const [fcaFormS4, setFcaFormS4] = useState<string>('');
  const [fcaFormS5, setFcaFormS5] = useState<string>('');
  const [fcaFormFato, setFcaFormFato] = useState<string>('');
  const [fcaFormCausa, setFcaFormCausa] = useState<string>('');
  const [fcaFormAcao, setFcaFormAcao] = useState<string>('');
  const [fcaFormResponsavel, setFcaFormResponsavel] = useState<string>('');
  const [fcaFormDataAcao, setFcaFormDataAcao] = useState<string>('');

  const dataAtualizacao = useMemo(() => {
    if (!dados.length) return null;
    const datas = dados
      .map(d => {
        if (d.DIA instanceof Date) return d.DIA;
        if (!d.DIA) return null;
        const parsed = new Date(d.DIA);
        return isNaN(parsed.getTime()) ? null : parsed;
      })
      .filter((d): d is Date => d !== null);
    
    if (datas.length === 0) return null;
    // Encontrar a maior data
    return new Date(Math.max(...datas.map(d => d.getTime())));
  }, [dados]);

  const fetchFCAEntries = useCallback(async () => {
    try {
      const data = await api.getFCA();
      setFcaEntries(data || []);
    } catch (e) {
      console.warn('Erro ao buscar FCA:', e);
    }
  }, []);

  const fetchDiarioEntries = useCallback(async () => {
    try {
      const data = await api.getDiario();
      setDiarioEntries(data || []);
    } catch (e) {
      console.warn('Erro ao buscar Diário de Bordo:', e);
    }
  }, []);

  useEffect(() => {
    fetchFCAEntries();
    fetchDiarioEntries();

    // Polling regular para atualização em tempo real
    const interval = setInterval(() => {
      fetchFCAEntries();
      fetchDiarioEntries();
    }, 15000);

    return () => clearInterval(interval);
  }, [fetchFCAEntries, fetchDiarioEntries]);

  useEffect(() => {
    // Verifica sessão personalizada do Hostinger DB
    const localSession = localStorage.getItem('certidao_user_session');
    if (localSession) {
      try {
        const parsed = JSON.parse(localSession);
        if (parsed && (parsed.id || parsed.username)) {
          setUser({ id: parsed.id, email: parsed.email || `${parsed.username}@atendimento.com.br`, ...parsed } as any);
          setProfile({
            id: parsed.id,
            username: parsed.username,
            role: parsed.role || 'editor',
            empresas: parsed.empresas || ['TODAS']
          });
          setLoadingSession(false);
          return;
        }
      } catch (e) {
        console.error('Erro ao recuperar sessão local:', e);
      }
    }
    setLoadingSession(false);
  }, []);

  const [prevUserId, setPrevUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setProfile(null);
    }
    
    // Only reset filters if the user ID has actually changed to a DIFFERENT non-null user
    if (user && prevUserId && user.id !== prevUserId) {
      console.log("User changed, resetting filters...");
      setFiltroRecurso([]);
      setFiltroJornada([]);
      setFiltroMunicipio([]);
      setFiltroLogin([]);
      setFiltroMes([]);
      setFiltroEmpresa([]);
      setSearchAnalitico('');
      setSelectedValidationStatus(null);
      setSelectedMunicipioClick(null);
      setSelectedTPOSClick(null);
    }
    
    if (user?.id) {
      setPrevUserId(user.id);
    }
  }, [user, prevUserId]);

  const handleLogout = async () => {
    localStorage.removeItem('certidao_user_session');
    cachedDados = [];
    cachedFcaEntries = [];
    cachedDiarioEntries = [];
    setDados([]); // Limpa os dados ao sair
    setFcaEntries([]);
    setDiarioEntries([]);
    setAbaAtiva('dashboard');
    // Reset filters
    setFiltroRecurso([]);
    setFiltroJornada([]);
    setFiltroMunicipio([]);
    setFiltroLogin([]);
    setFiltroMes([]);
    setFiltroEmpresa([]);
    setSearchAnalitico('');
    setSelectedValidationStatus(null);
    setSelectedMunicipioClick(null);
    setSelectedTPOSClick(null);
    setPrevUserId(null);
    setUser(null);
    setProfile(null);
  };

  const isAdmin = !profile || profile.role === 'admin';
  const isEditor = !profile || profile.role === 'editor' || profile.role === 'admin';
  const canEdit = isAdmin || isEditor;

  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [githubUrl, setGithubUrl] = useState<string>(() => {
    const envUrl = import.meta.env.VITE_GITHUB_EXCEL_URL;
    let finalUrl = 'https://raw.githubusercontent.com/carloswladier/nova-certid-o/main/CERTIDAO_ATUALIZADA.xlsx';
    
    if (envUrl && envUrl.trim().length > 10) {
      finalUrl = envUrl.trim();
      console.log("Usando URL do ambiente (VITE_GITHUB_EXCEL_URL):", finalUrl);
    } else {
      console.log("Usando URL padrão (hardcoded):", finalUrl);
    }
    return finalUrl;
  });
  const [showUrlEdit, setShowUrlEdit] = useState(false);
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [ultimaSincronizacao, setUltimaSincronizacao] = useState<Date | null>(null);

  // Debug logging
  useEffect(() => {
    console.log("Estado do App:", { 
      hasUser: !!user, 
      userEmail: user?.email,
      hasProfile: !!profile, 
      profileRole: profile?.role,
      dadosCount: dados.length,
      carregando,
      hasErro: !!erro
    });
  }, [user, profile, dados, carregando, erro]);

  // 2. Lógica de classificação dos registros nas 4 categorias
  const processarDados = useCallback((jsonData: any[], resetFilters = true) => {
    const dadosProcessados = jsonData.map(item => {
      // Cria um novo objeto com chaves normalizadas para facilitar o mapeamento
      const itemNormalizado: any = {};
      Object.keys(item).forEach(key => {
        itemNormalizado[normalizarChave(key)] = item[key];
      });

      // Mapeamento específico baseado no que o usuário relatou e variações comuns
      const LGN_TEC = itemNormalizado['LGN_TEC'] || itemNormalizado['LOGIN_TECNICO'] || itemNormalizado['LOGIN'] || item['LGN_TEC'];
      const RECURSO_UN = itemNormalizado['RECURSO_UN'] || itemNormalizado['RECURSO_UNIDADE'] || itemNormalizado['RECURSO'] || itemNormalizado['RECURSO_UNIDADE'] || item['RECURSO_UN'];
      const JORNADA = itemNormalizado['JORNADA'] || itemNormalizado['JORNADA_TRABALHO'] || item['JORNADA'];
      const MUNICIPIO = itemNormalizado['MUNICIPIO'] || itemNormalizado['DSC_MUNICIPIO_BI'] || itemNormalizado['CIDADE'] || item['MUNICIPIO'];
      const DSC_MUNICIPIO_BI = itemNormalizado['DSC_MUNICIPIO_BI'] || itemNormalizado['MUNICIPIO'] || item['DSC_MUNICIPIO_BI'];
      const VALIDACAO = itemNormalizado['VALIDACAO'] || itemNormalizado['STATUS_VALIDACAO'] || item['VALIDACAO'];
      const NR_CONTRATO = itemNormalizado['NR_CONTRATO'] || itemNormalizado['CONTRATO'] || item['NR_CONTRATO'];
      const TP_OS = itemNormalizado['TP_OS'] || itemNormalizado['TIPO_OS'] || item['TP_OS'];
      const DIA = itemNormalizado['DIA'] || itemNormalizado['DATA'] || itemNormalizado['DT_EXECUCAO'] || item['DIA'] || item['DATA'] || item['DT_EXECUCAO'];
      const MES_COL = itemNormalizado['MES'] || itemNormalizado['MES_REFERENCIA'] || item['MÊS'] || item['MES'] || item['MES_REFERENCIA'];
      
      const OFDMA = itemNormalizado['OFDMA'] || item['OFDMA'] || '';
      const OBS_UP_PORTAS_FAIL = itemNormalizado['OBS_UP_PORTAS_FAIL'] || item['OBS_UP_PORTAS_FAIL'] || '';
      const OBS_DOWN_PORTAS_FAIL = itemNormalizado['OBS_DOWN_PORTAS_FAIL'] || item['OBS_DOWN_PORTAS_FAIL'] || '';
      const ID_PONTO = itemNormalizado['ID_PONTO'] || item['ID_PONTO'] || '';

      const COD_BAIXA = itemNormalizado['COD_BAIXA'] || itemNormalizado['CODIGO_BAIXA'] || item['COD_BAIXA'] || item['CODIGO_BAIXA'] || '';
      const DESC_NODE = itemNormalizado['DESC_NODE'] || itemNormalizado['DS_NODE'] || item['DESC_NODE'] || item['DS_NODE'] || '';
      const TIPO_PRODUTO = itemNormalizado['TIPO_PRODUTO'] || itemNormalizado['TP_PRODUTO'] || item['TIPO_PRODUTO'] || item['TP_PRODUTO'] || '';
      const GRUPO_BAIXA = itemNormalizado['GRUPO_BAIXA'] || itemNormalizado['GRUPO_DE_BAIXA'] || itemNormalizado['DS_GRUPO_BAIXA'] || itemNormalizado['DESC_GRUPO_BAIXA'] || item['GRUPO_BAIXA'] || item['DS_GRUPO_BAIXA'] || '';

      // Extração do mês
      let mesNome = '';
      let dateObj: Date | null = null;

      // Tenta converter DIA para um objeto Date válido
      if (DIA) {
        if (DIA instanceof Date && !isNaN(DIA.getTime())) {
          dateObj = DIA;
        } else if (typeof DIA === 'number') {
          // Excel serial date (only if cellDates: true didn't catch it or for some reason it's still a number)
          dateObj = new Date(Math.round((DIA - 25569) * 86400 * 1000));
        } else if (typeof DIA === 'string') {
          const cleanStr = DIA.trim();
          // Tenta formato DD/MM/YYYY ou DD-MM-YYYY
          const dmyMatch = cleanStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
          if (dmyMatch) {
            const day = parseInt(dmyMatch[1]);
            const month = parseInt(dmyMatch[2]) - 1;
            let year = parseInt(dmyMatch[3]);
            if (year < 100) year += 2000;
            dateObj = new Date(year, month, day);
          } else {
            const parsed = new Date(cleanStr);
            if (!isNaN(parsed.getTime())) {
              dateObj = parsed;
            }
          }
        }
      }

      // Prioriza a coluna MÊS se ela existir e for válida
      if (MES_COL) {
        const mesStr = MES_COL.toString().trim();
        // Verifica se é um nome de mês válido
        const mesEncontrado = MESES.find(m => m.toLowerCase() === mesStr.toLowerCase());
        if (mesEncontrado) {
          mesNome = mesEncontrado;
        } else {
          const mesNum = parseInt(mesStr);
          if (!isNaN(mesNum) && mesNum >= 1 && mesNum <= 12) {
            mesNome = MESES[mesNum - 1];
          }
        }
      }

      // Se não encontrou o mês na coluna MES, tenta extrair do dateObj
      if (!mesNome && dateObj && !isNaN(dateObj.getTime())) {
        // Ajuste para evitar problemas de fuso horário (pegar o mês local)
        mesNome = MESES[dateObj.getMonth()];
      }

      let pontuacao = itemNormalizado['PONTUACAO'] !== undefined 
        ? Number(itemNormalizado['PONTUACAO']) 
        : (VALIDACAO === 'OK' || VALIDACAO === 'Validado' || (VALIDACAO && VALIDACAO.toString().includes('SEM FALHA')) ? 90 : Math.floor(Math.random() * 100));

      let categoria = '';
      if (pontuacao <= CATEGORIAS.CRITICO.limite) categoria = CATEGORIAS.CRITICO.nome;
      else if (pontuacao <= CATEGORIAS.ATENCAO.limite) categoria = CATEGORIAS.ATENCAO.nome;
      else categoria = CATEGORIAS.EXCELENTE.nome;

      return {
        ...item,
        LGN_TEC: LGN_TEC?.toString() || '',
        RECURSO_UN: RECURSO_UN?.toString() || '',
        JORNADA: JORNADA?.toString() || '',
        MUNICIPIO: MUNICIPIO?.toString() || '',
        VALIDACAO: VALIDACAO?.toString() || '',
        NR_CONTRATO: NR_CONTRATO?.toString() || '',
        TP_OS: TP_OS?.toString() || '',
        DSC_MUNICIPIO_BI: DSC_MUNICIPIO_BI?.toString() || '',
        OFDMA: OFDMA?.toString() || '',
        OBS_UP_PORTAS_FAIL: OBS_UP_PORTAS_FAIL?.toString() || '',
        OBS_DOWN_PORTAS_FAIL: OBS_DOWN_PORTAS_FAIL?.toString() || '',
        ID_PONTO: ID_PONTO?.toString() || '',
        COD_BAIXA: COD_BAIXA?.toString() || '',
        DESC_NODE: DESC_NODE?.toString() || '',
        TIPO_PRODUTO: TIPO_PRODUTO?.toString() || '',
        GRUPO_BAIXA: GRUPO_BAIXA?.toString() || '',
        DIA: dateObj || DIA,
        MES: mesNome,
        Pontuacao: pontuacao,
        Categoria: categoria
      };
    });

    setDados(dadosProcessados);
    // Resetar filtros ao carregar nova planilha (opcional)
    if (resetFilters) {
      setFiltroRecurso([]);
      setFiltroJornada([]);
      setFiltroMunicipio([]);
      setFiltroLogin([]);
      setFiltroMes([]);
      setFiltroEmpresa([]);
      setFiltroGrupoBaixa([]);
      setFiltroStatus([]);
    }
  }, []);

  // Check server connection
  useEffect(() => {
    const checkConnection = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/health`);
        if (res.ok) setServerStatus('online');
        else setServerStatus('offline');
      } catch (err) {
        console.error("Connection check failed:", err);
        setServerStatus('offline');
      }
    };
    checkConnection();
  }, []);

  // Estados para filtros
  const [filtroRecurso, setFiltroRecurso] = useState<string[]>([]);
  const [filtroJornada, setFiltroJornada] = useState<string[]>([]);
  const [filtroMunicipio, setFiltroMunicipio] = useState<string[]>([]);
  const [filtroLogin, setFiltroLogin] = useState<string[]>([]);
  const [filtroMes, setFiltroMes] = useState<string[]>([]);
  const [filtroEmpresa, setFiltroEmpresa] = useState<string[]>([]);
  const [filtroGrupoBaixa, setFiltroGrupoBaixa] = useState<string[]>([]);
  const [filtroStatus, setFiltroStatus] = useState<string[]>([]);
  const [selectedValidationStatus, setSelectedValidationStatus] = useState<string | null>(null);
  const [selectedMunicipioClick, setSelectedMunicipioClick] = useState<string | null>(null);
  const [selectedTPOSClick, setSelectedTPOSClick] = useState<string | null>(null);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [showScrollTop, setShowScrollTop] = useState(false);

  // Monitorar scroll para mostrar/esconder botão de voltar ao topo
  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 300) {
        setShowScrollTop(true);
      } else {
        setShowScrollTop(false);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };

  // 1. Função para leitura do arquivo Excel
  const lerArquivoExcel = useCallback((file: File) => {
    setCarregando(true);
    setErro(null);
    setLoadingProgress(0);

    const progressInterval = setInterval(() => {
      setLoadingProgress(prev => {
        if (prev >= 95) {
          clearInterval(progressInterval);
          return 95;
        }
        return prev + 5;
      });
    }, 100);

    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        
        // Pega a primeira aba da planilha
        const primeiraAba = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[primeiraAba];
        
        // Converte para JSON
        const jsonData = XLSX.utils.sheet_to_json<Registro>(worksheet);
        
        if (jsonData.length === 0) {
          throw new Error("O arquivo está vazio.");
        }

        setLoadingProgress(100);
        setTimeout(() => {
          processarDados(jsonData);
          setCarregando(false);
          clearInterval(progressInterval);
        }, 200);
      } catch (err) {
        setErro("Erro ao processar o arquivo. Certifique-se de que é um Excel válido.");
        console.error(err);
        setCarregando(false);
        clearInterval(progressInterval);
      }
    };

    reader.onerror = () => {
      setErro("Erro ao ler o arquivo.");
      setCarregando(false);
      clearInterval(progressInterval);
    };

    reader.readAsArrayBuffer(file);
  }, []);

  // Função para normalizar o link do GitHub para o formato RAW
  const normalizarLinkGithub = (url: string) => {
    let normalized = url.trim();
    
    // Se for link do tipo blob: https://github.com/user/repo/blob/branch/path
    if (normalized.includes('github.com') && normalized.includes('/blob/')) {
      normalized = normalized.replace('github.com', 'raw.githubusercontent.com')
                             .replace('/blob/', '/');
    }
    
    // Se for link do tipo raw na interface: https://github.com/user/repo/raw/branch/path
    if (normalized.includes('github.com') && normalized.includes('/raw/')) {
      normalized = normalized.replace('github.com', 'raw.githubusercontent.com')
                             .replace('/raw/', '/');
    }

    // Remove refs/heads/ se estiver presente (comum em links copiados de certos lugares)
    if (normalized.includes('/refs/heads/')) {
      normalized = normalized.replace('/refs/heads/', '/');
    }

    // Garante que usa raw.githubusercontent.com se for github.com
    if (normalized.includes('github.com') && !normalized.includes('raw.githubusercontent.com')) {
      normalized = normalized.replace('github.com', 'raw.githubusercontent.com');
    }

    return normalized;
  };

  // Nova função para carregar do GitHub
  const carregarDadosDoGithub = useCallback(async () => {
    console.log("carregarDadosDoGithub chamado. URL:", githubUrl);
    if (!githubUrl) {
      console.warn("githubUrl está vazio, abortando carregamento.");
      return;
    }
    
    const urlNormalizada = normalizarLinkGithub(githubUrl);
    // Adiciona um parâmetro de cache-busting para garantir que pegamos a versão mais recente
    const urlComCacheBuster = `${urlNormalizada}${urlNormalizada.includes('?') ? '&' : '?'}t=${new Date().getTime()}`;
    
    setCarregando(true);
    setErro(null);
    setLoadingProgress(0);

    const progressInterval = setInterval(() => {
      setLoadingProgress(prev => {
        if (prev >= 95) {
          clearInterval(progressInterval);
          return 95;
        }
        return prev + 5;
      });
    }, 100);
    
    try {
      // Tenta buscar diretamente primeiro
      let response;
      try {
        response = await fetch(urlComCacheBuster, { cache: 'no-store' });
      } catch (fetchErr: any) {
        console.error("Erro inicial de fetch:", fetchErr);
        // Se falhar o fetch inicial (comum em erros de CORS ou rede), tenta avisar o usuário
        throw new Error("Falha na conexão (Failed to fetch). Isso geralmente ocorre por: 1. Repositório Privado (o arquivo deve ser público), 2. Bloqueio de CORS pelo navegador, ou 3. Falta de internet.");
      }

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Arquivo não encontrado (404). O link pode estar incorreto ou o repositório é PRIVADO. Certifique-se de que o repositório no GitHub seja PÚBLICO.`);
        }
        throw new Error(`Erro ${response.status}: ${response.statusText}. Verifique se o link está correto e se o arquivo existe.`);
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('text/html')) {
        let errorMsg = "O link fornecido retornou uma página HTML em vez de um arquivo Excel.";
        if (urlNormalizada.includes('github.com') && !urlNormalizada.includes('raw.githubusercontent.com')) {
          errorMsg += " Dica: Você está usando o link da interface do GitHub. Use o link 'RAW' (raw.githubusercontent.com).";
        }
        throw new Error(errorMsg);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      const data = new Uint8Array(arrayBuffer);
      
      let workbook;
      try {
        workbook = XLSX.read(data, { type: 'array', cellDates: true });
      } catch (xlsxErr) {
        console.error("Erro ao ler Excel:", xlsxErr);
        throw new Error("O arquivo baixado não é um Excel válido. Verifique se o link aponta para o arquivo .xlsx real.");
      }
      
      const primeiraAba = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[primeiraAba];
      const jsonData = XLSX.utils.sheet_to_json<Registro>(worksheet);
      
      if (jsonData.length === 0) {
        throw new Error("O arquivo do GitHub está vazio.");
      }

      setLoadingProgress(100);
      setTimeout(() => {
        processarDados(jsonData, false); // Não resetar filtros ao carregar do GitHub
        setUltimaSincronizacao(new Date());
        setCarregando(false);
        clearInterval(progressInterval);
      }, 200);
    } catch (err: any) {
      setErro(`Erro ao carregar dados do GitHub: ${err.message}`);
      console.error(err);
      setCarregando(false);
      clearInterval(progressInterval);
    }
  }, [githubUrl, processarDados]);

  // Initial load effect
  useEffect(() => {
    if (user && dados.length === 0 && !carregando && !erro) {
      console.log("Auto-load trigger: Iniciando carregamento...");
      carregarDadosDoGithub();
    }
  }, [user, carregarDadosDoGithub]); // Reduced dependencies to prevent loops

  // Auto-refresh effect
  useEffect(() => {
    if (!user) return;

    console.log("Configurando auto-refresh (15 min)...");
    const interval = setInterval(() => {
      // We check carregando inside to avoid stale closure if we use a ref, 
      // but here we can just call it and it will handle its own state.
      // To be safe, we only trigger if the tab is active or just let it run.
      console.log("Auto-refresh interval triggered");
      carregarDadosDoGithub();
    }, 15 * 60 * 1000);

    return () => {
      console.log("Limpando auto-refresh");
      clearInterval(interval);
    };
  }, [user, carregarDadosDoGithub]);

  // 2. Lógica de classificação dos registros nas 4 categorias

  // Helper para obter os recursos permitidos com base nas permissões de empresa do usuário
  const recursosPermitidos = useMemo(() => {
    if (!profile) return null;
    if (profile.role === 'admin') return null; // Admin tem acesso total irrestrito

    // 1. Se tem empresas cadastradas/marcadas no perfil
    const empresasDoPerfil = parseEmpresasProfile(profile.empresas);
    if (empresasDoPerfil.length > 0) {
      if (empresasDoPerfil.includes('TODAS') || empresasDoPerfil.includes('todas')) {
        return null; // Acesso a todas as empresas
      }
      const unidades = empresasDoPerfil.flatMap(emp => EMPRESA_MAPPING[emp.toUpperCase()] || EMPRESA_MAPPING[emp] || []);
      return unidades.length > 0 ? unidades : null;
    }

    // 2. Fallback para mapeamento legado baseado no prefixo do nome de usuário
    const userPrefix = profile.username?.toLowerCase() || '';
    if (RESTRICOES_RECURSOS[userPrefix]) {
      return RESTRICOES_RECURSOS[userPrefix];
    }

    return null;
  }, [profile]);

  // Base de dados considerando todos os filtros EXCETO o filtro de Status e seleção de clique em status
  const dadosBaseSemFiltroStatus = useMemo(() => {
    // Unidades das empresas selecionadas no filtro de tela
    const unidadesDasEmpresas = filtroEmpresa.flatMap(emp => EMPRESA_MAPPING[emp] || []);

    return dados.filter(item => {
      // Aplica restrição se o usuário estiver restrito a empresas específicas
      if (recursosPermitidos && item.RECURSO_UN && !recursosPermitidos.includes(item.RECURSO_UN)) {
        return false;
      }

      const matchRecurso = filtroRecurso.length === 0 || (item.RECURSO_UN && filtroRecurso.includes(item.RECURSO_UN));
      const matchJornada = filtroJornada.length === 0 || (item.JORNADA && filtroJornada.includes(item.JORNADA));
      const matchMunicipio = filtroMunicipio.length === 0 || (item.MUNICIPIO && filtroMunicipio.includes(item.MUNICIPIO));
      const matchLogin = filtroLogin.length === 0 || (item.LGN_TEC && filtroLogin.includes(item.LGN_TEC));
      const matchMes = filtroMes.length === 0 || (item.MES && filtroMes.includes(item.MES));
      const matchEmpresa = filtroEmpresa.length === 0 || (item.RECURSO_UN && unidadesDasEmpresas.includes(item.RECURSO_UN));
      const matchGrupoBaixa = filtroGrupoBaixa.length === 0 || (item.GRUPO_BAIXA && filtroGrupoBaixa.includes(item.GRUPO_BAIXA));
      const matchClickMunicipio = !selectedMunicipioClick || item.MUNICIPIO === selectedMunicipioClick;
      const matchClickTPOS = !selectedTPOSClick || item.TP_OS === selectedTPOSClick;

      return matchRecurso && matchJornada && matchMunicipio && matchLogin && matchMes && matchEmpresa && matchGrupoBaixa && matchClickMunicipio && matchClickTPOS;
    });
  }, [dados, filtroRecurso, filtroJornada, filtroMunicipio, filtroLogin, filtroMes, filtroEmpresa, filtroGrupoBaixa, recursosPermitidos, selectedMunicipioClick, selectedTPOSClick]);

  // Filtragem dos dados completa (com filtro de status e clique de status aplicados)
  const dadosFiltrados = useMemo(() => {
    return dadosBaseSemFiltroStatus.filter(item => {
      const matchStatus = filtroStatus.length === 0 || (item.VALIDACAO && filtroStatus.includes(item.VALIDACAO));
      const matchClickStatus = !selectedValidationStatus || item.VALIDACAO === selectedValidationStatus;
      return matchStatus && matchClickStatus;
    });
  }, [dadosBaseSemFiltroStatus, filtroStatus, selectedValidationStatus]);

  // Opções únicas para os filtros
  const opcoesMes = useMemo(() => {
    const unidadesDasEmpresas = filtroEmpresa.flatMap(emp => EMPRESA_MAPPING[emp] || []);

    const filtered = dados.filter(d => 
      (!recursosPermitidos || (d.RECURSO_UN && recursosPermitidos.includes(d.RECURSO_UN))) &&
      (filtroEmpresa.length === 0 || (d.RECURSO_UN && unidadesDasEmpresas.includes(d.RECURSO_UN)))
    );
    const unique = Array.from(new Set(filtered.map(d => d.MES).filter(Boolean))) as string[];
    // Ordenar conforme a ordem cronológica dos meses
    return unique.sort((a, b) => MESES.indexOf(a) - MESES.indexOf(b));
  }, [dados, filtroEmpresa, recursosPermitidos]);

  const opcoesEmpresa = useMemo(() => {
    if (profile?.role === 'admin') {
      return Object.keys(EMPRESA_MAPPING).sort();
    }

    const empresasDoPerfil = parseEmpresasProfile(profile?.empresas);
    if (empresasDoPerfil.length > 0) {
      if (empresasDoPerfil.includes('TODAS') || empresasDoPerfil.includes('todas')) {
        return Object.keys(EMPRESA_MAPPING).sort();
      }
      return Object.keys(EMPRESA_MAPPING)
        .filter(emp => empresasDoPerfil.includes(emp) || empresasDoPerfil.includes(emp.toUpperCase()))
        .sort();
    }

    const userPrefix = profile?.username?.toLowerCase() || '';
    const recursos = RESTRICOES_RECURSOS[userPrefix];
    if (recursos) {
      return Object.keys(EMPRESA_MAPPING).filter(emp => 
        EMPRESA_MAPPING[emp].some(unidade => recursos.includes(unidade))
      ).sort();
    }

    return Object.keys(EMPRESA_MAPPING).sort();
  }, [profile]);

  const opcoesMunicipio = useMemo(() => {
    const unidadesDasEmpresas = filtroEmpresa.flatMap(emp => EMPRESA_MAPPING[emp] || []);

    const filtered = dados.filter(d => 
      (filtroMes.length === 0 || (d.MES && filtroMes.includes(d.MES))) &&
      (filtroEmpresa.length === 0 || (d.RECURSO_UN && unidadesDasEmpresas.includes(d.RECURSO_UN))) &&
      (filtroGrupoBaixa.length === 0 || (d.GRUPO_BAIXA && filtroGrupoBaixa.includes(d.GRUPO_BAIXA))) &&
      (filtroStatus.length === 0 || (d.VALIDACAO && filtroStatus.includes(d.VALIDACAO))) &&
      (!recursosPermitidos || (d.RECURSO_UN && recursosPermitidos.includes(d.RECURSO_UN)))
    );
    const unique = Array.from(new Set(filtered.map(d => d.MUNICIPIO).filter(Boolean)));
    return unique.sort();
  }, [dados, filtroMes, filtroEmpresa, filtroGrupoBaixa, filtroStatus, recursosPermitidos]);

  const opcoesJornada = useMemo(() => {
    const unidadesDasEmpresas = filtroEmpresa.flatMap(emp => EMPRESA_MAPPING[emp] || []);

    const filtered = dados.filter(d => 
      (filtroMes.length === 0 || (d.MES && filtroMes.includes(d.MES))) &&
      (filtroMunicipio.length === 0 || (d.MUNICIPIO && filtroMunicipio.includes(d.MUNICIPIO))) &&
      (filtroEmpresa.length === 0 || (d.RECURSO_UN && unidadesDasEmpresas.includes(d.RECURSO_UN))) &&
      (filtroGrupoBaixa.length === 0 || (d.GRUPO_BAIXA && filtroGrupoBaixa.includes(d.GRUPO_BAIXA))) &&
      (filtroStatus.length === 0 || (d.VALIDACAO && filtroStatus.includes(d.VALIDACAO))) &&
      (!recursosPermitidos || (d.RECURSO_UN && recursosPermitidos.includes(d.RECURSO_UN)))
    );
    const unique = Array.from(new Set(filtered.map(d => d.JORNADA).filter(Boolean)));
    return unique.sort();
  }, [dados, filtroMes, filtroMunicipio, filtroEmpresa, filtroGrupoBaixa, filtroStatus, recursosPermitidos]);

  const opcoesRecurso = useMemo(() => {
    const unidadesDasEmpresas = filtroEmpresa.flatMap(emp => EMPRESA_MAPPING[emp] || []);
    
    const filtered = dados.filter(d => 
      (filtroMes.length === 0 || (d.MES && filtroMes.includes(d.MES))) &&
      (filtroMunicipio.length === 0 || (d.MUNICIPIO && filtroMunicipio.includes(d.MUNICIPIO))) &&
      (filtroJornada.length === 0 || (d.JORNADA && filtroJornada.includes(d.JORNADA))) &&
      (filtroEmpresa.length === 0 || (d.RECURSO_UN && unidadesDasEmpresas.includes(d.RECURSO_UN))) &&
      (filtroGrupoBaixa.length === 0 || (d.GRUPO_BAIXA && filtroGrupoBaixa.includes(d.GRUPO_BAIXA))) &&
      (filtroStatus.length === 0 || (d.VALIDACAO && filtroStatus.includes(d.VALIDACAO))) &&
      (!recursosPermitidos || (d.RECURSO_UN && recursosPermitidos.includes(d.RECURSO_UN)))
    );
    const unique = Array.from(new Set(filtered.map(d => d.RECURSO_UN).filter(Boolean)));
    return unique.sort();
  }, [dados, filtroMes, filtroMunicipio, filtroJornada, filtroEmpresa, filtroGrupoBaixa, filtroStatus, recursosPermitidos]);

  const opcoesLogin = useMemo(() => {
    const unidadesDasEmpresas = filtroEmpresa.flatMap(emp => EMPRESA_MAPPING[emp] || []);

    const filtered = dados.filter(d => 
      (filtroMes.length === 0 || (d.MES && filtroMes.includes(d.MES))) &&
      (filtroMunicipio.length === 0 || (d.MUNICIPIO && filtroMunicipio.includes(d.MUNICIPIO))) &&
      (filtroJornada.length === 0 || (d.JORNADA && filtroJornada.includes(d.JORNADA))) &&
      (filtroRecurso.length === 0 || (d.RECURSO_UN && filtroRecurso.includes(d.RECURSO_UN))) &&
      (filtroEmpresa.length === 0 || (d.RECURSO_UN && unidadesDasEmpresas.includes(d.RECURSO_UN))) &&
      (filtroGrupoBaixa.length === 0 || (d.GRUPO_BAIXA && filtroGrupoBaixa.includes(d.GRUPO_BAIXA))) &&
      (filtroStatus.length === 0 || (d.VALIDACAO && filtroStatus.includes(d.VALIDACAO))) &&
      (!recursosPermitidos || (d.RECURSO_UN && recursosPermitidos.includes(d.RECURSO_UN)))
    );
    const unique = Array.from(new Set(filtered.map(d => d.LGN_TEC).filter(Boolean)));
    return unique.sort();
  }, [dados, filtroMes, filtroMunicipio, filtroJornada, filtroRecurso, filtroEmpresa, filtroGrupoBaixa, filtroStatus, recursosPermitidos]);

  const opcoesStatus = useMemo(() => {
    const unidadesDasEmpresas = filtroEmpresa.flatMap(emp => EMPRESA_MAPPING[emp] || []);

    const filtered = dados.filter(d => 
      (filtroMes.length === 0 || (d.MES && filtroMes.includes(d.MES))) &&
      (filtroMunicipio.length === 0 || (d.MUNICIPIO && filtroMunicipio.includes(d.MUNICIPIO))) &&
      (filtroJornada.length === 0 || (d.JORNADA && filtroJornada.includes(d.JORNADA))) &&
      (filtroRecurso.length === 0 || (d.RECURSO_UN && filtroRecurso.includes(d.RECURSO_UN))) &&
      (filtroLogin.length === 0 || (d.LGN_TEC && filtroLogin.includes(d.LGN_TEC))) &&
      (filtroEmpresa.length === 0 || (d.RECURSO_UN && unidadesDasEmpresas.includes(d.RECURSO_UN))) &&
      (filtroGrupoBaixa.length === 0 || (d.GRUPO_BAIXA && filtroGrupoBaixa.includes(d.GRUPO_BAIXA))) &&
      (!recursosPermitidos || (d.RECURSO_UN && recursosPermitidos.includes(d.RECURSO_UN)))
    );
    const unique = Array.from(new Set(filtered.map(d => d.VALIDACAO).filter(Boolean)));
    return unique.sort() as string[];
  }, [dados, filtroMes, filtroMunicipio, filtroJornada, filtroRecurso, filtroLogin, filtroEmpresa, filtroGrupoBaixa, recursosPermitidos]);

  const opcoesValidacao = opcoesStatus;

  const opcoesGrupoBaixa = useMemo(() => {
    const unidadesDasEmpresas = filtroEmpresa.flatMap(emp => EMPRESA_MAPPING[emp] || []);

    const filtered = dados.filter(d => 
      (filtroMes.length === 0 || (d.MES && filtroMes.includes(d.MES))) &&
      (filtroMunicipio.length === 0 || (d.MUNICIPIO && filtroMunicipio.includes(d.MUNICIPIO))) &&
      (filtroJornada.length === 0 || (d.JORNADA && filtroJornada.includes(d.JORNADA))) &&
      (filtroRecurso.length === 0 || (d.RECURSO_UN && filtroRecurso.includes(d.RECURSO_UN))) &&
      (filtroLogin.length === 0 || (d.LGN_TEC && filtroLogin.includes(d.LGN_TEC))) &&
      (filtroEmpresa.length === 0 || (d.RECURSO_UN && unidadesDasEmpresas.includes(d.RECURSO_UN))) &&
      (filtroStatus.length === 0 || (d.VALIDACAO && filtroStatus.includes(d.VALIDACAO))) &&
      (!recursosPermitidos || (d.RECURSO_UN && recursosPermitidos.includes(d.RECURSO_UN)))
    );
    const unique = Array.from(new Set(filtered.map(d => d.GRUPO_BAIXA).filter(Boolean)));
    return unique.sort() as string[];
  }, [dados, filtroMes, filtroMunicipio, filtroJornada, filtroRecurso, filtroLogin, filtroEmpresa, filtroStatus, recursosPermitidos]);

  // Base de dados exclusiva da aba FCA respeitando as permissões do perfil de login
  const dadosFcaPermitidos = useMemo(() => {
    if (!recursosPermitidos) return dados;
    return dados.filter(d => d.RECURSO_UN && recursosPermitidos.includes(d.RECURSO_UN));
  }, [dados, recursosPermitidos]);

  // Opções dinâmicas em cascata para a aba FCA (respeitando o perfil e os filtros selecionados)
  const fcaOpcoesMes = useMemo(() => {
    const filtered = dadosFcaPermitidos.filter(d =>
      (fcaFormRecurso.length === 0 || (d.RECURSO_UN && fcaFormRecurso.includes(d.RECURSO_UN))) &&
      (fcaFormMunicipio.length === 0 || (d.MUNICIPIO && fcaFormMunicipio.includes(d.MUNICIPIO))) &&
      (fcaFormLogin.length === 0 || (d.LGN_TEC && fcaFormLogin.includes(d.LGN_TEC))) &&
      (fcaFormJornada.length === 0 || fcaFormJornada.includes('TODAS') || (d.JORNADA && fcaFormJornada.includes(d.JORNADA)))
    );
    const unique = Array.from(new Set(filtered.map(d => d.MES).filter(Boolean))) as string[];
    return unique.sort((a, b) => MESES.indexOf(a) - MESES.indexOf(b));
  }, [dadosFcaPermitidos, fcaFormRecurso, fcaFormMunicipio, fcaFormLogin, fcaFormJornada]);

  const fcaOpcoesMunicipio = useMemo(() => {
    const filtered = dadosFcaPermitidos.filter(d =>
      (fcaFormMes.length === 0 || (d.MES && fcaFormMes.includes(d.MES))) &&
      (fcaFormRecurso.length === 0 || (d.RECURSO_UN && fcaFormRecurso.includes(d.RECURSO_UN))) &&
      (fcaFormLogin.length === 0 || (d.LGN_TEC && fcaFormLogin.includes(d.LGN_TEC))) &&
      (fcaFormJornada.length === 0 || fcaFormJornada.includes('TODAS') || (d.JORNADA && fcaFormJornada.includes(d.JORNADA)))
    );
    const unique = Array.from(new Set(filtered.map(d => d.MUNICIPIO).filter(Boolean))) as string[];
    return unique.sort();
  }, [dadosFcaPermitidos, fcaFormMes, fcaFormRecurso, fcaFormLogin, fcaFormJornada]);

  const fcaOpcoesRecurso = useMemo(() => {
    const filtered = dadosFcaPermitidos.filter(d =>
      (fcaFormMes.length === 0 || (d.MES && fcaFormMes.includes(d.MES))) &&
      (fcaFormMunicipio.length === 0 || (d.MUNICIPIO && fcaFormMunicipio.includes(d.MUNICIPIO))) &&
      (fcaFormLogin.length === 0 || (d.LGN_TEC && fcaFormLogin.includes(d.LGN_TEC))) &&
      (fcaFormJornada.length === 0 || fcaFormJornada.includes('TODAS') || (d.JORNADA && fcaFormJornada.includes(d.JORNADA)))
    );
    const unique = Array.from(new Set(filtered.map(d => d.RECURSO_UN).filter(Boolean))) as string[];
    return unique.sort();
  }, [dadosFcaPermitidos, fcaFormMes, fcaFormMunicipio, fcaFormLogin, fcaFormJornada]);

  const fcaOpcoesLogin = useMemo(() => {
    const filtered = dadosFcaPermitidos.filter(d =>
      (fcaFormMes.length === 0 || (d.MES && fcaFormMes.includes(d.MES))) &&
      (fcaFormRecurso.length === 0 || (d.RECURSO_UN && fcaFormRecurso.includes(d.RECURSO_UN))) &&
      (fcaFormMunicipio.length === 0 || (d.MUNICIPIO && fcaFormMunicipio.includes(d.MUNICIPIO))) &&
      (fcaFormJornada.length === 0 || fcaFormJornada.includes('TODAS') || (d.JORNADA && fcaFormJornada.includes(d.JORNADA)))
    );
    const unique = Array.from(new Set(filtered.map(d => d.LGN_TEC).filter(Boolean))) as string[];
    return unique.sort();
  }, [dadosFcaPermitidos, fcaFormMes, fcaFormRecurso, fcaFormMunicipio, fcaFormJornada]);

  const fcaOpcoesJornada = useMemo(() => {
    const filtered = dadosFcaPermitidos.filter(d =>
      (fcaFormMes.length === 0 || (d.MES && fcaFormMes.includes(d.MES))) &&
      (fcaFormRecurso.length === 0 || (d.RECURSO_UN && fcaFormRecurso.includes(d.RECURSO_UN))) &&
      (fcaFormMunicipio.length === 0 || (d.MUNICIPIO && fcaFormMunicipio.includes(d.MUNICIPIO))) &&
      (fcaFormLogin.length === 0 || (d.LGN_TEC && fcaFormLogin.includes(d.LGN_TEC)))
    );
    const unique = Array.from(new Set(filtered.map(d => d.JORNADA).filter(Boolean))) as string[];
    return unique.sort();
  }, [dadosFcaPermitidos, fcaFormMes, fcaFormRecurso, fcaFormMunicipio, fcaFormLogin]);

  // Handlers para seleção nos filtros do FCA
  const handleFcaMunicipioChange = (municipios: string[]) => {
    setFcaFormMunicipio(municipios);
  };

  const handleFcaRecursoChange = (recursos: string[]) => {
    setFcaFormRecurso(recursos);
  };

  const handleFcaLoginChange = (logins: string[]) => {
    setFcaFormLogin(logins);
  };

  const handleFcaJornadaChange = (jornadas: string[]) => {
    setFcaFormJornada(jornadas);
  };

  const handleFcaMesChange = (meses: string[]) => {
    setFcaFormMes(meses);
  };

  const handleResetFcaForm = () => {
    setEditingFCA(null);
    setFcaFormMes([]);
    setFcaFormRecurso([]);
    setFcaFormMunicipio([]);
    setFcaFormLogin([]);
    setFcaFormJornada([]);
    setFcaFormS1('');
    setFcaFormS2('');
    setFcaFormS3('');
    setFcaFormS4('');
    setFcaFormS5('');
    setFcaFormFato('');
    setFcaFormCausa('');
    setFcaFormAcao('');
    setFcaFormResponsavel('');
    setFcaFormDataAcao('');
  };

  // Sincronizar campos quando entra ou sai de modo edição
  useEffect(() => {
    if (editingFCA) {
      const parseField = (val?: string) => {
        if (!val || val === 'TODOS' || val === 'TODAS') return [];
        return val.split(',').map(s => s.trim()).filter(Boolean);
      };
      setFcaFormMes(parseField(editingFCA.mes));
      setFcaFormRecurso(parseField(editingFCA.recurso));
      setFcaFormMunicipio(parseField(editingFCA.municipio));
      setFcaFormLogin(parseField(editingFCA.login));
      setFcaFormJornada(parseField(editingFCA.jornada));
      setFcaFormS1(editingFCA.s1 || '');
      setFcaFormS2(editingFCA.s2 || '');
      setFcaFormS3(editingFCA.s3 || '');
      setFcaFormS4(editingFCA.s4 || '');
      setFcaFormS5(editingFCA.s5 || '');
      setFcaFormFato(editingFCA.fato || '');
      setFcaFormCausa(editingFCA.causa || '');
      setFcaFormAcao(editingFCA.acao || '');
      setFcaFormResponsavel(editingFCA.responsavel || '');
      setFcaFormDataAcao(editingFCA.data_acao ? new Date(editingFCA.data_acao).toISOString().split('T')[0] : '');
    }
  }, [editingFCA]);

  // Helper para extração robusta de data em formatos Date, number (Excel) ou string
  const extrairDataRegistro = useCallback((item: any): Date | null => {
    const dataRaw = item.DIA || item.DT_EXECUCAO || item.DATA || item.DT_FIM;
    if (!dataRaw) return null;

    if (typeof dataRaw === 'number') {
      return new Date(Math.round((dataRaw - 25569) * 86400 * 1000));
    }
    if (dataRaw instanceof Date) {
      return isNaN(dataRaw.getTime()) ? null : dataRaw;
    }
    if (typeof dataRaw === 'string') {
      const cleanStr = dataRaw.trim();
      const dmyMatch = cleanStr.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
      if (dmyMatch) {
        const day = parseInt(dmyMatch[1]);
        const month = parseInt(dmyMatch[2]) - 1;
        let year = dmyMatch[3] ? parseInt(dmyMatch[3]) : new Date().getFullYear();
        if (year < 100) year += 2000;
        return new Date(year, month, day);
      }
      const parsed = new Date(cleanStr);
      if (!isNaN(parsed.getTime())) return parsed;
    }
    return null;
  }, []);

  // Helper para checagem se o status de validação é considerado Validado (OK/Conforme)
  const isItemValidado = useCallback((validacaoRaw: string | undefined): boolean => {
    const val = (validacaoRaw || '').trim();
    if (!val) return false;
    const def = STATUS_DEFINICOES.find(d => d.match(val) || d.key === val);
    if (def) return def.isValidado;
    const upper = val.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    return (upper.startsWith('VALIDADO') && !upper.includes('NAO')) || upper === 'OK';
  }, []);

  // Registros correspondentes à seleção ativa no formulário FCA
  const registrosFcaSelecionados = useMemo(() => {
    return dadosFcaPermitidos.filter(d =>
      (fcaFormMes.length === 0 || (d.MES && fcaFormMes.includes(d.MES))) &&
      (fcaFormRecurso.length === 0 || (d.RECURSO_UN && fcaFormRecurso.includes(d.RECURSO_UN))) &&
      (fcaFormMunicipio.length === 0 || (d.MUNICIPIO && fcaFormMunicipio.includes(d.MUNICIPIO))) &&
      (fcaFormLogin.length === 0 || (d.LGN_TEC && fcaFormLogin.includes(d.LGN_TEC))) &&
      (fcaFormJornada.length === 0 || fcaFormJornada.includes('TODAS') || (d.JORNADA && fcaFormJornada.includes(d.JORNADA)))
    );
  }, [dadosFcaPermitidos, fcaFormMes, fcaFormRecurso, fcaFormMunicipio, fcaFormLogin, fcaFormJornada]);

  // Métricas calculadas para a seleção atual do formulário FCA (inclui todos os status de validação)
  const fcaMetricasCalculadas = useMemo(() => {
    const total = registrosFcaSelecionados.length;
    const contagemStatus: Record<string, number> = {};
    STATUS_DEFINICOES.forEach(def => {
      contagemStatus[def.key] = 0;
    });

    let validados = 0;
    let naoValidados = 0;
    const outros: Record<string, number> = {};

    registrosFcaSelecionados.forEach(item => {
      const status = (item.VALIDACAO || '').trim();
      if (!status) return;

      const def = STATUS_DEFINICOES.find(d => d.match(status) || d.key === status);
      if (def) {
        contagemStatus[def.key] = (contagemStatus[def.key] || 0) + 1;
        if (def.isValidado) {
          validados++;
        } else {
          naoValidados++;
        }
      } else {
        const upper = status.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        if ((upper.startsWith('VALIDADO') && !upper.includes('NAO')) || upper === 'OK') {
          validados++;
        } else {
          naoValidados++;
        }
        outros[status] = (outros[status] || 0) + 1;
      }
    });

    const nota = total > 0 ? (validados / total) * 100 : 0;

    const statusDetalhados = STATUS_DEFINICOES.map(def => ({
      key: def.key,
      shortName: def.shortName,
      label: def.label,
      count: contagemStatus[def.key] || 0,
      isValidado: def.isValidado,
      color: def.color,
      textColor: def.textColor
    })).filter(s => s.count > 0);

    return {
      nota,
      validados,
      naoValidados,
      total,
      contagemStatus,
      statusDetalhados,
      validadosSemFalha: contagemStatus['VALIDADO - SEM FALHA'] || 0,
      validadosFalha: contagemStatus['VALIDADO - COM FALHA'] || 0,
      validadosFalhaApi: contagemStatus['VALIDADO - COM FALHA API'] || 0,
      validadosJustificado: contagemStatus['VALIDADO - COM FALHA - JUSTIFICADO'] || 0,
      naoValidadosFalha: contagemStatus['NAO VALIDADO - COM FALHA'] || 0,
      naoValidadosSemFalha: contagemStatus['NAO VALIDADO - SEM FALHA'] || 0,
      naoValidadosFalhaApi: contagemStatus['NAO VALIDADO - COM FALHA API'] || 0
    };
  }, [registrosFcaSelecionados]);

  // Auto-cálculo de semanas S1 a S5 com base nos registros selecionados
  useEffect(() => {
    if (editingFCA) return;
    if (registrosFcaSelecionados.length === 0) {
      setFcaFormS1('');
      setFcaFormS2('');
      setFcaFormS3('');
      setFcaFormS4('');
      setFcaFormS5('');
      return;
    }

    const semanaCounts: Record<string, { total: number; validos: number }> = {
      'S1': { total: 0, validos: 0 },
      'S2': { total: 0, validos: 0 },
      'S3': { total: 0, validos: 0 },
      'S4': { total: 0, validos: 0 },
      'S5': { total: 0, validos: 0 },
    };

    registrosFcaSelecionados.forEach(item => {
      const dateObj = extrairDataRegistro(item);
      if (!dateObj) return;

      const diaNum = dateObj.getDate();
      if (diaNum <= 0) return;

      let sem = 'S5';
      if (diaNum >= 1 && diaNum <= 7) sem = 'S1';
      else if (diaNum >= 8 && diaNum <= 14) sem = 'S2';
      else if (diaNum >= 15 && diaNum <= 21) sem = 'S3';
      else if (diaNum >= 22 && diaNum <= 28) sem = 'S4';
      else sem = 'S5';

      if (semanaCounts[sem]) {
        semanaCounts[sem].total++;
        if (isItemValidado(item.VALIDACAO)) {
          semanaCounts[sem].validos++;
        }
      }
    });

    setFcaFormS1(semanaCounts.S1.total > 0 ? ((semanaCounts.S1.validos / semanaCounts.S1.total) * 100).toFixed(1) + '%' : '-');
    setFcaFormS2(semanaCounts.S2.total > 0 ? ((semanaCounts.S2.validos / semanaCounts.S2.total) * 100).toFixed(1) + '%' : '-');
    setFcaFormS3(semanaCounts.S3.total > 0 ? ((semanaCounts.S3.validos / semanaCounts.S3.total) * 100).toFixed(1) + '%' : '-');
    setFcaFormS4(semanaCounts.S4.total > 0 ? ((semanaCounts.S4.validos / semanaCounts.S4.total) * 100).toFixed(1) + '%' : '-');
    setFcaFormS5(semanaCounts.S5.total > 0 ? ((semanaCounts.S5.validos / semanaCounts.S5.total) * 100).toFixed(1) + '%' : '-');
  }, [registrosFcaSelecionados, editingFCA, extrairDataRegistro, isItemValidado]);

  // Lista de FCA filtrada estritamente pelas permissões do perfil e pelos filtros ativos
  const fcaFiltrados = useMemo(() => {
    return fcaEntries.filter(e => {
      // Regra de perfil do login: apenas recursos permitidos
      const matchPermissao = !recursosPermitidos || (e.recurso && recursosPermitidos.includes(e.recurso));
      if (!matchPermissao) return false;

      const matchMes = filtroMes.length === 0 || (e.mes && filtroMes.includes(e.mes));
      const matchMunicipio = filtroMunicipio.length === 0 || (e.municipio && filtroMunicipio.includes(e.municipio));
      const matchJornada = filtroJornada.length === 0 || !e.jornada || e.jornada === 'TODAS' || filtroJornada.includes(e.jornada);
      const matchRecurso = filtroRecurso.length === 0 || (e.recurso && filtroRecurso.includes(e.recurso));
      const matchLogin = filtroLogin.length === 0 || (e.login && filtroLogin.includes(e.login));
      return matchMes && matchMunicipio && matchJornada && matchRecurso && matchLogin;
    });
  }, [fcaEntries, filtroMes, filtroMunicipio, filtroJornada, filtroRecurso, filtroLogin, recursosPermitidos]);

  // 3. Estrutura de dados organizada para o painel (baseada nos dados filtrados)
  const resumo = useMemo(() => {
    const contagem: Record<string, number> = {
      [CATEGORIAS.EXCELENTE.nome]: 0,
      [CATEGORIAS.ATENCAO.nome]: 0,
      [CATEGORIAS.CRITICO.nome]: 0,
    };

    dadosFiltrados.forEach(item => {
      if (item.Categoria && contagem[item.Categoria] !== undefined) {
        contagem[item.Categoria]++;
      }
    });

    return [
      { name: CATEGORIAS.EXCELENTE.nome, value: contagem[CATEGORIAS.EXCELENTE.nome], color: CATEGORIAS.EXCELENTE.cor },
      { name: CATEGORIAS.ATENCAO.nome, value: contagem[CATEGORIAS.ATENCAO.nome], color: CATEGORIAS.ATENCAO.cor },
      { name: CATEGORIAS.CRITICO.nome, value: contagem[CATEGORIAS.CRITICO.nome], color: CATEGORIAS.CRITICO.cor },
    ];
  }, [dadosFiltrados]);

  // Dados para o gráfico de Volume de Atendimento (por status de validação específico)
  const volumeValidacao = useMemo(() => {
    const contagem: Record<string, number> = {};
    STATUS_DEFINICOES.forEach(item => {
      contagem[item.key] = 0;
    });

    const outros: Record<string, number> = {};

    dadosBaseSemFiltroStatus.forEach(item => {
      const val = (item.VALIDACAO || '').trim();
      if (!val) return;
      
      const found = STATUS_DEFINICOES.find(def => def.match(val) || def.key === val);
      if (found) {
        contagem[found.key]++;
      } else {
        outros[val] = (outros[val] || 0) + 1;
      }
    });

    const totalCalculado = Object.values(contagem).reduce((acc, val) => acc + val, 0) + Object.values(outros).reduce((acc, val) => acc + val, 0);
    const totalVolume = totalCalculado > 0 ? totalCalculado : dadosBaseSemFiltroStatus.length;

    const lista = STATUS_DEFINICOES.map(def => {
      const val = contagem[def.key] || 0;
      const pct = totalVolume > 0 ? ((val / totalVolume) * 100).toFixed(1) : '0.0';
      return {
        name: def.key,
        shortName: `${def.shortName} (${pct}%)`,
        value: val,
        percentage: pct,
        color: def.color
      };
    });

    // Se houver outros status personalizados no dataset com contagem > 0, adiciona ao gráfico
    Object.entries(outros).forEach(([nome, val]) => {
      if (val > 0) {
        const pct = totalVolume > 0 ? ((val / totalVolume) * 100).toFixed(1) : '0.0';
        lista.push({
          name: nome,
          shortName: `${nome} (${pct}%)`,
          value: val,
          percentage: pct,
          color: '#64748b'
        });
      }
    });

    return lista;
  }, [dadosBaseSemFiltroStatus]);

  // Identifica quais status estão ativos no momento (via clique ou via filtro da barra)
  const statusSelecionados = useMemo(() => {
    if (selectedValidationStatus) {
      return [selectedValidationStatus];
    }
    if (filtroStatus.length > 0) {
      return filtroStatus;
    }
    return [];
  }, [selectedValidationStatus, filtroStatus]);

  const isStatusAtivo = statusSelecionados.length > 0;

  // Função auxiliar para verificar se um registro pertence ao alvo do cálculo:
  // - Se há status selecionado: retorna true se o item pertence aos status selecionados
  // - Se NÃO há status selecionado: retorna true se o item for VALIDADO (OK/Conforme)
  const isRegistroAlvo = useCallback((validacaoRaw: string | undefined): boolean => {
    const val = (validacaoRaw || '').trim();
    if (!val) return false;

    if (isStatusAtivo) {
      return statusSelecionados.some(target => {
        if (target === val) return true;
        const def = STATUS_DEFINICOES.find(d => d.key === target || d.match(target));
        if (def && (def.match(val) || def.key === val)) return true;
        return false;
      });
    }

    return isItemValidado(val);
  }, [isStatusAtivo, statusSelecionados, isItemValidado]);

  // Dados para o gráfico de TP_OS
  const volumeTPOS = useMemo(() => {
    const agrupado: Record<string, { total: number, statusCount: number }> = {};
    
    dadosBaseSemFiltroStatus.forEach(item => {
      const tp = item.TP_OS || 'N/A';
      if (!agrupado[tp]) {
        agrupado[tp] = { total: 0, statusCount: 0 };
      }
      agrupado[tp].total++;
      if (isRegistroAlvo(item.VALIDACAO)) {
        agrupado[tp].statusCount++;
      }
    });

    const palette = ['#EE2924', '#333333', '#C4121A', '#666666', '#999999', '#000000'];

    const sorted = Object.entries(agrupado)
      .map(([name, stats], index) => {
        const val = isStatusAtivo ? stats.statusCount : stats.total;
        const pct = stats.total > 0 ? ((stats.statusCount / stats.total) * 100).toFixed(1) : '0.0';
        return {
          name,
          value: val,
          total: stats.total,
          statusCount: stats.statusCount,
          percentage: pct,
          color: palette[index % palette.length]
        };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    return sorted;
  }, [dadosBaseSemFiltroStatus, isRegistroAlvo, isStatusAtivo]);

  // Dados para o gráfico de Nota por Mês
  const notaMensal = useMemo(() => {
    const stats: Record<string, { total: number, conformes: number }> = {};
    MESES.forEach(m => stats[m] = { total: 0, conformes: 0 });

    // Filtramos os dados para o gráfico mensal respeitando os filtros laterais,
    // exceto o filtro de mês para manter a visão de evolução temporal completa.
    const dadosParaGrafico = dados.filter(item => {
      // Aplica restrição se o usuário estiver restrito a empresas específicas
      if (recursosPermitidos && item.RECURSO_UN && !recursosPermitidos.includes(item.RECURSO_UN)) {
        return false;
      }

      const unidadesDasEmpresas = filtroEmpresa.flatMap(emp => EMPRESA_MAPPING[emp] || []);

      const matchRecurso = filtroRecurso.length === 0 || (item.RECURSO_UN && filtroRecurso.includes(item.RECURSO_UN));
      const matchJornada = filtroJornada.length === 0 || (item.JORNADA && filtroJornada.includes(item.JORNADA));
      const matchMunicipio = filtroMunicipio.length === 0 || (item.MUNICIPIO && filtroMunicipio.includes(item.MUNICIPIO));
      const matchLogin = filtroLogin.length === 0 || (item.LGN_TEC && filtroLogin.includes(item.LGN_TEC));
      const matchEmpresa = filtroEmpresa.length === 0 || (item.RECURSO_UN && unidadesDasEmpresas.includes(item.RECURSO_UN));
      const matchGrupoBaixa = filtroGrupoBaixa.length === 0 || (item.GRUPO_BAIXA && filtroGrupoBaixa.includes(item.GRUPO_BAIXA));
      const matchClickMunicipio = !selectedMunicipioClick || item.MUNICIPIO === selectedMunicipioClick;
      const matchClickTPOS = !selectedTPOSClick || item.TP_OS === selectedTPOSClick;
      
      return matchRecurso && matchJornada && matchMunicipio && matchLogin && matchEmpresa && matchGrupoBaixa && matchClickMunicipio && matchClickTPOS;
    });

    dadosParaGrafico.forEach(item => {
      if (item.MES && stats[item.MES]) {
        stats[item.MES].total++;
        if (isRegistroAlvo(item.VALIDACAO)) {
          stats[item.MES].conformes++;
        }
      }
    });

    return MESES.map(m => {
      const s = stats[m];
      const nota = s.total > 0 ? (s.conformes / s.total) * 100 : 0;
      return {
        name: m,
        value: Number(nota.toFixed(1)),
        total: s.total,
        conformes: s.conformes,
        color: '#EE2924'
      };
    }).filter(m => m.total > 0);
  }, [dados, filtroRecurso, filtroJornada, filtroMunicipio, filtroLogin, filtroEmpresa, filtroGrupoBaixa, profile, selectedMunicipioClick, selectedTPOSClick, isRegistroAlvo]);

  // Dados para o gráfico diário de Nota da Certidão
  const evolucaoDiaria = useMemo(() => {
    const agrupado: Record<string, { soma: number, total: number }> = {};
    let minDate: Date | null = null;
    let maxDate: Date | null = null;

    dadosBaseSemFiltroStatus.forEach(item => {
      const dateObj = extrairDataRegistro(item);
      if (!dateObj) return;

      const d = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
      if (!minDate || d < minDate) minDate = d;
      if (!maxDate || d > maxDate) maxDate = d;

      const dataStr = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
      if (!agrupado[dataStr]) {
        agrupado[dataStr] = { soma: 0, total: 0 };
      }

      agrupado[dataStr].total++;
      if (isRegistroAlvo(item.VALIDACAO)) {
        agrupado[dataStr].soma++;
      }
    });

    if (!minDate || !maxDate) return [];

    // Forçar início no dia 01 do mês mínimo encontrado
    const startDate = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    // Forçar fim no último dia do mês máximo encontrado
    const endDate = new Date(maxDate.getFullYear(), maxDate.getMonth() + 1, 0);
    
    const result = [];
    const current = new Date(startDate);
    while (current <= endDate) {
      const dataStr = `${current.getFullYear()}-${(current.getMonth() + 1).toString().padStart(2, '0')}-${current.getDate().toString().padStart(2, '0')}`;
      const values = agrupado[dataStr] || { soma: 0, total: 0 };
      
      result.push({
        data: current.getDate().toString(),
        nota: values.total > 0 ? Number(((values.soma / values.total) * 100).toFixed(1)) : null,
        soma: values.soma,
        total: values.total
      });
      
      current.setDate(current.getDate() + 1);
    }

    return result;
  }, [dadosBaseSemFiltroStatus, extrairDataRegistro, isRegistroAlvo]);

  const evolucaoDiariaInstalacaoManutencao = useMemo(() => {
    const agrupado: Record<string, { 
      instSoma: number, instTotal: number,
      manSoma: number, manTotal: number 
    }> = {};

    let minDate: Date | null = null;
    let maxDate: Date | null = null;

    dadosBaseSemFiltroStatus.forEach(item => {
      const dateObj = extrairDataRegistro(item);
      if (!dateObj) return;

      const d = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
      if (!minDate || d < minDate) minDate = d;
      if (!maxDate || d > maxDate) maxDate = d;

      const dataStr = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
      if (!agrupado[dataStr]) {
        agrupado[dataStr] = { instSoma: 0, instTotal: 0, manSoma: 0, manTotal: 0 };
      }

      const tpOS = (item.TP_OS || '').toString().trim().toUpperCase();
      const isInstalacao = tpOS.includes('INSTALACAO') || tpOS.includes('INSTALAÇÃO') || tpOS.includes('INSTAL');
      const isManutencao = tpOS.includes('MANUTENCAO') || tpOS.includes('MANUTENÇÃO') || tpOS.includes('MANUT') || tpOS.includes('REPARO') || tpOS.includes('ASSIST');

      if (isInstalacao) {
        agrupado[dataStr].instTotal++;
        if (isRegistroAlvo(item.VALIDACAO)) {
          agrupado[dataStr].instSoma++;
        }
      } else if (isManutencao) {
        agrupado[dataStr].manTotal++;
        if (isRegistroAlvo(item.VALIDACAO)) {
          agrupado[dataStr].manSoma++;
        }
      }
    });

    if (!minDate || !maxDate) return [];

    // Forçar início no dia 01 do mês mínimo encontrado
    const startDate = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    // Forçar fim no último dia do mês máximo encontrado
    const endDate = new Date(maxDate.getFullYear(), maxDate.getMonth() + 1, 0);
    
    const result = [];
    const current = new Date(startDate);
    while (current <= endDate) {
      const dataStr = `${current.getFullYear()}-${(current.getMonth() + 1).toString().padStart(2, '0')}-${current.getDate().toString().padStart(2, '0')}`;
      const values = agrupado[dataStr] || { instSoma: 0, instTotal: 0, manSoma: 0, manTotal: 0 };
      
      result.push({
        data: current.getDate().toString(),
        instalacao: values.instTotal > 0 ? Number(((values.instSoma / values.instTotal) * 100).toFixed(1)) : null,
        manutencao: values.manTotal > 0 ? Number(((values.manSoma / values.manTotal) * 100).toFixed(1)) : null
      });
      
      current.setDate(current.getDate() + 1);
    }

    return result;
  }, [dadosBaseSemFiltroStatus, extrairDataRegistro, isRegistroAlvo]);

  // Dados para o gráfico de Nota por Cidade (Top 13)
  const notaPorCidade = useMemo(() => {
    const agrupado: Record<string, { soma: number, total: number }> = {};

    dadosBaseSemFiltroStatus.forEach(item => {
      const cidade = item.MUNICIPIO || 'N/A';
      if (!agrupado[cidade]) {
        agrupado[cidade] = { soma: 0, total: 0 };
      }
      agrupado[cidade].total++;
      if (isRegistroAlvo(item.VALIDACAO)) {
        agrupado[cidade].soma++;
      }
    });

    return Object.entries(agrupado)
      .map(([name, values]) => {
        const nota = values.total > 0 ? Number(((values.soma / values.total) * 100).toFixed(1)) : 0;
        return {
          name,
          value: nota,
          soma: values.soma,
          total: values.total
        };
      })
      .sort((a, b) => {
        if (b.value !== a.value) return b.value - a.value;
        return b.soma - a.soma;
      })
      .slice(0, 13); // Top 13 cidades
  }, [dadosBaseSemFiltroStatus, isRegistroAlvo]);

  const notaPorLogin = useMemo(() => {
    const agrupado: Record<string, { soma: number, total: number }> = {};

    dadosBaseSemFiltroStatus.forEach(item => {
      const login = item.LGN_TEC || 'N/A';
      if (!agrupado[login]) {
        agrupado[login] = { soma: 0, total: 0 };
      }
      agrupado[login].total++;
      if (isRegistroAlvo(item.VALIDACAO)) {
        agrupado[login].soma++;
      }
    });

    return Object.entries(agrupado)
      .map(([login, values]) => {
        const value = values.total > 0 ? Number(((values.soma / values.total) * 100).toFixed(1)) : 0;
        let color = '#EE2924'; // Red (< 70%)
        if (!isStatusAtivo) {
          if (value >= 80) color = '#22c55e'; // Green (>= 80%)
          else if (value >= 70) color = '#f59e0b'; // Yellow (70-79%)
        }
        
        return {
          name: login,
          value,
          soma: values.soma,
          total: values.total,
          color
        };
      })
      .sort((a, b) => b.value - a.value);
  }, [dadosBaseSemFiltroStatus, isRegistroAlvo, isStatusAtivo]);

  const notaPorRecurso = useMemo(() => {
    const agrupado: Record<string, { soma: number, total: number }> = {};

    dadosBaseSemFiltroStatus.forEach(item => {
      const recurso = item.RECURSO_UN || 'N/A';
      if (!agrupado[recurso]) {
        agrupado[recurso] = { soma: 0, total: 0 };
      }
      agrupado[recurso].total++;
      if (isRegistroAlvo(item.VALIDACAO)) {
        agrupado[recurso].soma++;
      }
    });

    return Object.entries(agrupado)
      .map(([recurso, values]) => {
        const value = values.total > 0 ? Number(((values.soma / values.total) * 100).toFixed(1)) : 0;
        let color = '#EE2924'; // Red (< 70%)
        if (!isStatusAtivo) {
          if (value >= 80) color = '#22c55e'; // Green (>= 80%)
          else if (value >= 70) color = '#f59e0b'; // Yellow (70-79%)
        }
        
        return {
          name: recurso,
          value,
          soma: values.soma,
          total: values.total,
          color
        };
      })
      .sort((a, b) => b.value - a.value);
  }, [dadosBaseSemFiltroStatus, isRegistroAlvo, isStatusAtivo]);

  const notaSemanalConsolidada = useMemo(() => {
    const stats: Record<string, { soma: number, total: number }> = {
      'S1': { soma: 0, total: 0 },
      'S2': { soma: 0, total: 0 },
      'S3': { soma: 0, total: 0 },
      'S4': { soma: 0, total: 0 },
      'S5': { soma: 0, total: 0 }
    };

    dadosBaseSemFiltroStatus.forEach(item => {
      const dateObj = extrairDataRegistro(item);
      if (!dateObj) return;

      const dia = dateObj.getDate();
      let semana = 'S5';
      if (dia <= 7) semana = 'S1';
      else if (dia <= 14) semana = 'S2';
      else if (dia <= 21) semana = 'S3';
      else if (dia <= 28) semana = 'S4';

      stats[semana].total++;
      if (isRegistroAlvo(item.VALIDACAO)) {
        stats[semana].soma++;
      }
    });

    return Object.entries(stats).map(([name, values]) => ({
      name,
      value: values.total > 0 ? Number(((values.soma / values.total) * 100).toFixed(1)) : 0,
      soma: values.soma,
      total: values.total
    }));
  }, [dadosBaseSemFiltroStatus, extrairDataRegistro, isRegistroAlvo]);

  const notaSemanalPorLogin = useMemo(() => {
    const agrupado: Record<string, Record<string, { soma: number, total: number }>> = {};

    dadosBaseSemFiltroStatus.forEach(item => {
      const login = item.LGN_TEC || 'N/A';
      const dateObj = extrairDataRegistro(item);
      if (!dateObj) return;
      
      const dia = dateObj.getDate();
      let semana = 'S5';
      if (dia <= 7) semana = 'S1';
      else if (dia <= 14) semana = 'S2';
      else if (dia <= 21) semana = 'S3';
      else if (dia <= 28) semana = 'S4';

      if (!agrupado[login]) {
        agrupado[login] = {
          'S1': { soma: 0, total: 0 },
          'S2': { soma: 0, total: 0 },
          'S3': { soma: 0, total: 0 },
          'S4': { soma: 0, total: 0 },
          'S5': { soma: 0, total: 0 }
        };
      }

      agrupado[login][semana].total++;
      if (isRegistroAlvo(item.VALIDACAO)) {
        agrupado[login][semana].soma++;
      }
    });

    const result: Record<string, Record<string, string>> = {};
    Object.entries(agrupado).forEach(([login, semanas]) => {
      result[login] = {};
      Object.entries(semanas).forEach(([semana, values]) => {
        result[login][semana] = values.total > 0 
          ? ((values.soma / values.total) * 100).toFixed(1) + '%'
          : '';
      });
    });

    return result;
  }, [dadosBaseSemFiltroStatus, extrairDataRegistro, isRegistroAlvo]);

  // Contagem de Validados e Não Validados + Cálculo da Nota e % de Impacto
  const metricasCalculadas = useMemo(() => {
    const totalBase = dadosBaseSemFiltroStatus.length;
    
    const contagemStatus: Record<string, number> = {};
    STATUS_DEFINICOES.forEach(def => {
      contagemStatus[def.key] = 0;
    });

    let validados = 0;
    let naoValidados = 0;
    const outros: Record<string, number> = {};

    dadosBaseSemFiltroStatus.forEach(item => {
      const status = (item.VALIDACAO || '').trim();
      if (!status) return;

      const def = STATUS_DEFINICOES.find(d => d.match(status) || d.key === status);
      if (def) {
        contagemStatus[def.key] = (contagemStatus[def.key] || 0) + 1;
        if (def.isValidado) {
          validados++;
        } else {
          naoValidados++;
        }
      } else {
        const upper = status.toUpperCase();
        if (upper.startsWith('VALIDADO') || upper === 'OK') {
          validados++;
        } else {
          naoValidados++;
        }
        outros[status] = (outros[status] || 0) + 1;
      }
    });

    // Determina o status ativo (por clique ou por dropdown) e calcula a nota
    let nota = 0;
    let notaTitulo = 'Nota Certidão';
    let notaSubtitulo = 'Geral';
    let statusAtivoChave: string | null = null;

    if (selectedValidationStatus) {
      statusAtivoChave = selectedValidationStatus;
      const def = STATUS_DEFINICOES.find(d => d.key === selectedValidationStatus || d.match(selectedValidationStatus));
      
      let vol = 0;
      if (def) {
        vol = contagemStatus[def.key] || 0;
        notaSubtitulo = `${def.shortName} (${vol.toLocaleString('pt-BR')} / ${totalBase.toLocaleString('pt-BR')})`;
      } else {
        vol = outros[selectedValidationStatus] || dadosBaseSemFiltroStatus.filter(d => d.VALIDACAO === selectedValidationStatus).length;
        notaSubtitulo = `${selectedValidationStatus} (${vol.toLocaleString('pt-BR')} / ${totalBase.toLocaleString('pt-BR')})`;
      }
      notaTitulo = 'Nota (% Impacto)';
      nota = totalBase > 0 ? (vol / totalBase) * 100 : 0;
    } else if (filtroStatus.length === 1) {
      const statusEscolhido = filtroStatus[0];
      statusAtivoChave = statusEscolhido;
      const def = STATUS_DEFINICOES.find(d => d.key === statusEscolhido || d.match(statusEscolhido));

      let vol = 0;
      if (def) {
        vol = contagemStatus[def.key] || 0;
        notaSubtitulo = `${def.shortName} (${vol.toLocaleString('pt-BR')} / ${totalBase.toLocaleString('pt-BR')})`;
      } else {
        vol = outros[statusEscolhido] || dadosBaseSemFiltroStatus.filter(d => d.VALIDACAO === statusEscolhido).length;
        notaSubtitulo = `${statusEscolhido} (${vol.toLocaleString('pt-BR')} / ${totalBase.toLocaleString('pt-BR')})`;
      }
      notaTitulo = 'Nota (% Impacto)';
      nota = totalBase > 0 ? (vol / totalBase) * 100 : 0;
    } else if (filtroStatus.length > 1) {
      let vol = 0;
      filtroStatus.forEach(st => {
        const def = STATUS_DEFINICOES.find(d => d.key === st || d.match(st));
        if (def) {
          vol += contagemStatus[def.key] || 0;
        } else {
          vol += outros[st] || dadosBaseSemFiltroStatus.filter(d => d.VALIDACAO === st).length;
        }
      });
      notaTitulo = 'Nota (% Impacto)';
      notaSubtitulo = `${filtroStatus.length} Status Selecionados (${vol.toLocaleString('pt-BR')} / ${totalBase.toLocaleString('pt-BR')})`;
      nota = totalBase > 0 ? (vol / totalBase) * 100 : 0;
    } else {
      // Cálculo padrão de Nota da Certidão (Validados / Total)
      nota = totalBase > 0 ? (validados / totalBase) * 100 : 0;
      notaTitulo = 'Nota Certidão';
      notaSubtitulo = `Geral (${validados.toLocaleString('pt-BR')} / ${totalBase.toLocaleString('pt-BR')})`;
    }

    const pctValidados = totalBase > 0 ? ((validados / totalBase) * 100).toFixed(1) : '0.0';
    const pctNaoValidados = totalBase > 0 ? ((naoValidados / totalBase) * 100).toFixed(1) : '0.0';

    const statusCards = STATUS_DEFINICOES.map(def => {
      const vol = contagemStatus[def.key] || 0;
      const pct = totalBase > 0 ? ((vol / totalBase) * 100).toFixed(1) : '0.0';
      const isAtivo = Boolean(
        selectedValidationStatus === def.key || 
        (selectedValidationStatus && def.match(selectedValidationStatus)) || 
        filtroStatus.includes(def.key) ||
        filtroStatus.some(s => def.match(s))
      );

      return {
        ...def,
        volume: vol,
        impactoPct: pct,
        isAtivo
      };
    });

    return {
      totalBase,
      validados,
      naoValidados,
      pctValidados,
      pctNaoValidados,
      nota,
      notaTitulo,
      notaSubtitulo,
      statusCards,
      statusAtivoChave,
      validadosFalha: contagemStatus['VALIDADO - COM FALHA'] || 0,
      naoValidadosFalha: contagemStatus['NAO VALIDADO - COM FALHA'] || 0,
      naoValidadosSemFalha: contagemStatus['NAO VALIDADO - SEM FALHA'] || 0,
      naoValidadosApi: contagemStatus['NAO VALIDADO - COM FALHA API'] || 0
    };
  }, [dadosBaseSemFiltroStatus, selectedValidationStatus, filtroStatus]);

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv'))) {
      lerArquivoExcel(file);
    } else {
      setErro("Por favor, envie um arquivo Excel (.xlsx, .xls) ou CSV.");
    }
  };

  const exportarFCA = () => {
    if (fcaFiltrados.length === 0) return;
    
    const ws = XLSX.utils.json_to_sheet(fcaFiltrados.map(e => ({
      'Mês': e.mes,
      'Login (Técnico)': e.login,
      'Jornada': e.jornada,
      'Recurso / Unidade': e.recurso,
      'Município': e.municipio,
      'Fato': e.fato,
      'Causa': e.causa,
      'Ação': e.acao,
      'Responsável': e.responsavel || '',
      'Data Ação': e.data_acao ? formatarData(e.data_acao) : '',
      'S1': e.s1 || '',
      'S2': e.s2 || '',
      'S3': e.s3 || '',
      'S4': e.s4 || '',
      'S5': e.s5 || '',
      'Data de Criação': e.dataCriacao
    })));
    
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "FCA");
    XLSX.writeFile(wb, "FCA_Export.xlsx");
  };

  const exportarDados = () => {
    if (dadosFiltrados.length === 0) return;
    
    const ws = XLSX.utils.json_to_sheet(dadosFiltrados.map(d => ({
      'LGN_TEC': d.LGN_TEC,
      'RECURSO_UN': d.RECURSO_UN,
      'NR_CONTRATO': d.NR_CONTRATO,
      'TP_OS': d.TP_OS,
      'MUNICIPIO': d.MUNICIPIO,
      'OFDMA': d.OFDMA,
      'OBS_UP_PORTAS_FAIL': d.OBS_UP_PORTAS_FAIL,
      'OBS_DOWN_PORTAS_FAIL': d.OBS_DOWN_PORTAS_FAIL,
      'ID_PONTO': d.ID_PONTO,
      'JORNADA': d.JORNADA,
      'VALIDACAO': d.VALIDACAO,
      'DIA': formatarData(d.DIA),
      'MES': d.MES
    })));
    
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Dados_Processados");
    XLSX.writeFile(wb, "Certidao_Atendimento_Export.xlsx");
  };

  const handleAddFCA = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!fcaFormFato.trim() || !fcaFormCausa.trim() || !fcaFormAcao.trim() || !fcaFormResponsavel.trim() || !fcaFormDataAcao) {
      alert('Por favor, preencha todos os campos obrigatórios (Fato, Causa, Ação, Responsável e Data Ação).');
      return;
    }
    
    const mesVal = fcaFormMes.length > 0 ? fcaFormMes.join(', ') : 'TODOS';
    const recVal = fcaFormRecurso.length > 0 ? fcaFormRecurso.join(', ') : 'TODOS';
    const munVal = fcaFormMunicipio.length > 0 ? fcaFormMunicipio.join(', ') : 'TODOS';
    const logVal = fcaFormLogin.length > 0 ? fcaFormLogin.join(', ') : 'TODOS';
    const jorVal = fcaFormJornada.length > 0 && !fcaFormJornada.includes('TODAS') ? fcaFormJornada.join(', ') : 'TODAS';

    const newEntry: FCAEntry = {
      id: 'fca_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      mes: mesVal,
      login: logVal,
      jornada: jorVal,
      recurso: recVal,
      municipio: munVal,
      fato: fcaFormFato,
      causa: fcaFormCausa,
      acao: fcaFormAcao,
      responsavel: fcaFormResponsavel,
      data_acao: fcaFormDataAcao,
      status: 'Ativo',
      s1: fcaFormS1 || null,
      s2: fcaFormS2 || null,
      s3: fcaFormS3 || null,
      s4: fcaFormS4 || null,
      s5: fcaFormS5 || null,
      dataCriacao: new Date().toISOString(),
      data_ultima_alteracao: new Date().toISOString()
    };
    
    const res = await api.saveFCA(newEntry as any);

    if (!res.success) {
      alert('Erro ao gravar FCA: ' + (res.error || 'Falha ao comunicar com o servidor'));
      return;
    }

    setFcaEntries([newEntry as FCAEntry, ...fcaEntries]);
    handleResetFcaForm();
    fetchFCAEntries();
    alert('FCA gravado com sucesso!');
  };

  const handleUpdateFCA = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingFCA) return;
    
    const mesVal = fcaFormMes.length > 0 ? fcaFormMes.join(', ') : editingFCA.mes || 'TODOS';
    const recVal = fcaFormRecurso.length > 0 ? fcaFormRecurso.join(', ') : editingFCA.recurso || 'TODOS';
    const munVal = fcaFormMunicipio.length > 0 ? fcaFormMunicipio.join(', ') : editingFCA.municipio || 'TODOS';
    const logVal = fcaFormLogin.length > 0 ? fcaFormLogin.join(', ') : editingFCA.login || 'TODOS';
    const jorVal = fcaFormJornada.length > 0 && !fcaFormJornada.includes('TODAS') ? fcaFormJornada.join(', ') : (editingFCA.jornada || 'TODAS');

    const updatedEntry = {
      mes: mesVal,
      login: logVal,
      jornada: jorVal,
      recurso: recVal,
      municipio: munVal,
      fato: fcaFormFato || editingFCA.fato,
      causa: fcaFormCausa || editingFCA.causa,
      acao: fcaFormAcao || editingFCA.acao,
      responsavel: fcaFormResponsavel || editingFCA.responsavel,
      data_acao: fcaFormDataAcao || editingFCA.data_acao,
      status: editingFCA.status || 'Ativo',
      s1: fcaFormS1 || null,
      s2: fcaFormS2 || null,
      s3: fcaFormS3 || null,
      s4: fcaFormS4 || null,
      s5: fcaFormS5 || null,
      data_ultima_alteracao: new Date().toISOString()
    };

    const res = await api.updateFCA(editingFCA.id, updatedEntry);
    if (!res.success) {
      alert('Erro ao atualizar FCA: ' + (res.error || 'Falha ao comunicar com o servidor'));
    }

    setEditingFCA(null);
    handleResetFcaForm();
    fetchFCAEntries();
    alert('Registro FCA atualizado com sucesso!');
  };

  const executarExclusaoFCA = async (id: string) => {
    setIsExcluindo(true);
    try {
      const res = await api.deleteFCA(id);
      if (res.success) {
        setFcaEntries(prev => prev.filter(e => e.id !== id));
        if (editingFCA && editingFCA.id === id) {
          handleResetFcaForm();
        }
        fetchFCAEntries();
        setFcaParaExcluir(null);
      } else {
        alert('Erro ao excluir FCA: ' + (res.error || 'Falha ao comunicar com o servidor'));
      }
    } catch (err: any) {
      alert('Erro ao processar exclusão: ' + (err.message || 'Falha desconhecida'));
    } finally {
      setIsExcluindo(false);
    }
  };

  const executarExclusaoDiario = async (id: string) => {
    setIsExcluindo(true);
    try {
      const res = await api.deleteDiario(id);
      if (res.success) {
        setDiarioEntries(prev => prev.filter(e => e.id !== id));
        if (editingDiario && editingDiario.id === id) {
          setEditingDiario(null);
        }
        fetchDiarioEntries();
        setDiarioParaExcluir(null);
      } else {
        alert('Erro ao excluir do diário: ' + (res.error || 'Falha ao comunicar com o servidor'));
      }
    } catch (err: any) {
      alert('Erro ao processar exclusão: ' + (err.message || 'Falha desconhecida'));
    } finally {
      setIsExcluindo(false);
    }
  };

  const handleAddDiario = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    
    const entry = {
      id: 'dia_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      data: formData.get('data') as string,
      chamado: formData.get('chamado') as string,
      descricao: formData.get('descricao') as string,
      status: formData.get('status') as string,
      dataConclusao: formData.get('dataConclusao') as string || null,
      dataCriacao: new Date().toISOString()
    };

    const res = await api.saveDiario(entry);

    if (!res.success) {
      alert('Erro ao salvar no diário: ' + (res.error || 'Falha ao comunicar com o servidor'));
      return;
    }

    form.reset();
    fetchDiarioEntries();
    alert('Registro salvo com sucesso!');
  };

  const handleDeleteDiario = async (id: string) => {
    if (!canEdit) {
      alert('Você não tem permissão para excluir registros.');
      return;
    }
    if (!confirm('Tem certeza que deseja excluir este registro do diário?')) return;
    
    const res = await api.deleteDiario(id);
    if (!res.success) {
      alert('Erro ao excluir do diário: ' + (res.error || 'Falha ao comunicar com o servidor'));
    }
    fetchDiarioEntries();
  };

  const handleUpdateDiario = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingDiario) return;

    const form = e.currentTarget;
    const formData = new FormData(form);
    
    const updatedEntry = {
      data: formData.get('data') as string,
      chamado: formData.get('chamado') as string,
      descricao: formData.get('descricao') as string,
      status: formData.get('status') as string,
      dataConclusao: formData.get('dataConclusao') as string || null,
    };

    const res = await api.updateDiario(editingDiario.id, updatedEntry);
    if (!res.success) {
      alert('Erro ao atualizar diário: ' + (res.error || 'Falha ao comunicar com o servidor'));
    }

    setEditingDiario(null);
    fetchDiarioEntries();
    alert('Registro atualizado com sucesso!');
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      lerArquivoExcel(file);
    }
  };

  const limparFiltros = () => {
    setFiltroRecurso([]);
    setFiltroJornada([]);
    setFiltroMunicipio([]);
    setFiltroLogin([]);
    setFiltroMes([]);
    setFiltroEmpresa([]);
    setFiltroGrupoBaixa([]);
    setFiltroStatus([]);
    setSelectedValidationStatus(null);
    setSelectedMunicipioClick(null);
    setSelectedTPOSClick(null);
  };

  const dadosAnalitico = useMemo(() => {
    if (!searchAnalitico) return dadosFiltrados;
    const term = searchAnalitico.toLowerCase();
    return dadosFiltrados.filter(item => 
      Object.values(item).some(val => 
        val?.toString().toLowerCase().includes(term)
      )
    );
  }, [dadosFiltrados, searchAnalitico]);

  const exportarAnaliticoCSV = () => {
    if (dadosAnalitico.length === 0) return;
    
    const headers = Object.keys(dadosAnalitico[0]);
    const csvContent = [
      headers.join(','),
      ...dadosAnalitico.map(row => 
        headers.map(fieldName => {
          const value = row[fieldName as keyof typeof row];
          const stringValue = value instanceof Date ? value.toLocaleDateString('pt-BR') : String(value || '');
          return `"${stringValue.replace(/"/g, '""')}"`;
        }).join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `analitico_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 4. Código para renderizar o painel visual
  if (loadingSession) {
    return (
      <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-6">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw size={48} className="text-claro animate-spin" />
          <p className="text-xs font-black uppercase tracking-widest text-zinc-400 animate-pulse">Verificando Sessão...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <Login
        onLoginSuccess={(loggedInUser) => {
          setUser(loggedInUser);
          setProfile({
            id: loggedInUser.id,
            username: loggedInUser.username,
            role: loggedInUser.role || 'editor',
            empresas: loggedInUser.empresas || ['TODAS']
          });
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-6 font-sans text-zinc-900">
      <div className="max-w-[1600px] mx-auto space-y-6">
        
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-4xl font-black tracking-tighter text-zinc-900 uppercase">Certidão de Atendimento</h1>
              {dataAtualizacao && (
                <div className="flex flex-col">
                  <p className="text-[10px] font-black uppercase tracking-widest text-claro mt-1">
                    Dados atualizados até o dia {dataAtualizacao.getDate().toString().padStart(2, '0')}.{(dataAtualizacao.getMonth() + 1).toString().padStart(2, '0')}
                  </p>
                  {ultimaSincronizacao && (
                    <p className="text-[8px] font-bold uppercase tracking-widest text-zinc-400">
                      Sincronizado com GitHub em: {ultimaSincronizacao.toLocaleTimeString()}
                    </p>
                  )}
                </div>
              )}
              <div className="flex gap-4 mt-4">
                <button 
                  onClick={() => setAbaAtiva('dashboard')}
                  className={`text-xs font-black uppercase tracking-widest pb-2 border-b-2 transition-all ${abaAtiva === 'dashboard' ? 'border-claro text-claro' : 'border-transparent text-zinc-400 hover:text-zinc-600'}`}
                >
                  Dashboard
                </button>
                <button 
                  onClick={() => setAbaAtiva('fca')}
                  className={`text-xs font-black uppercase tracking-widest pb-2 border-b-2 transition-all ${abaAtiva === 'fca' ? 'border-claro text-claro' : 'border-transparent text-zinc-400 hover:text-zinc-600'}`}
                >
                  FCA
                </button>
                <button 
                  onClick={() => setAbaAtiva('diario')}
                  className={`text-xs font-black uppercase tracking-widest pb-2 border-b-2 transition-all ${abaAtiva === 'diario' ? 'border-claro text-claro' : 'border-transparent text-zinc-400 hover:text-zinc-600'}`}
                >
                  Diário de Bordo
                </button>
                <button 
                  onClick={() => setAbaAtiva('analitico')}
                  className={`text-xs font-black uppercase tracking-widest pb-2 border-b-2 transition-all ${abaAtiva === 'analitico' ? 'border-claro text-claro' : 'border-transparent text-zinc-400 hover:text-zinc-600'}`}
                >
                  Analítico
                </button>
                {isAdmin && (
                  <button 
                    onClick={() => setAbaAtiva('usuarios')}
                    className={`text-xs font-black uppercase tracking-widest pb-2 border-b-2 transition-all ${abaAtiva === 'usuarios' ? 'border-claro text-claro' : 'border-transparent text-zinc-400 hover:text-zinc-600'}`}
                  >
                    Usuários
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden md:flex flex-col items-end">
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">{profile?.username || ''}</p>
              <p className="text-xs font-bold text-zinc-900 uppercase">{profile?.role || 'Usuário'}</p>
            </div>
            <button 
              onClick={handleLogout}
              className="p-2 text-zinc-400 hover:text-claro transition-all"
              title="Sair"
            >
              <LogOut size={20} />
            </button>
            {dados.length > 0 && (
              <button 
                onClick={carregarDadosDoGithub}
                className="bg-claro text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-claro-dark transition-all flex items-center gap-2"
              >
                <RefreshCw size={16} className={carregando ? "animate-spin" : ""} />
                ATUALIZAR DADOS
              </button>
            )}
          </div>
        </header>

        {abaAtiva === 'dashboard' ? (
          <>
            {/* Área de Carregamento Automático / Erro */}
            {!dados.length && (
              <Card className="border-none shadow-sm bg-white overflow-hidden">
                <CardContent className="flex flex-col items-center justify-center py-32">
                  <div className="h-24 w-24 bg-zinc-100 text-zinc-900 rounded-full flex items-center justify-center mb-6 shadow-inner">
                    <FileSpreadsheet size={48} className={carregando ? "animate-bounce" : ""} />
                  </div>
                  <h3 className="text-2xl font-bold mb-2">
                    {carregando ? "Carregando Dados..." : "Certidão de Atendimento"}
                  </h3>
                  <div className="text-[9px] font-mono text-zinc-300 mb-4">v1.0.9 - Build: 08/03 15:42</div>
                  <p className="text-zinc-500 text-center max-w-sm mb-8">
                    {carregando 
                      ? "Buscando informações atualizadas diretamente do repositório..." 
                      : "O sistema tenta carregar os dados automaticamente. Se não carregar em alguns segundos, use o botão abaixo."}
                  </p>

                  {carregando && (
                    <div className="w-full max-w-xs mb-8">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Processando</span>
                        <span className="text-[10px] font-black uppercase tracking-widest text-claro">{loadingProgress}%</span>
                      </div>
                      <div className="h-2 w-full bg-zinc-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-claro transition-all duration-300 ease-out"
                          style={{ width: `${loadingProgress}%` }}
                        />
                      </div>
                    </div>
                  )}
                  
                  {erro && (
                    <div className="flex flex-col items-center gap-4 w-full max-w-lg">
                      <p className="text-red-600 font-bold bg-red-50 px-4 py-2 rounded-lg border border-red-100 text-center">
                        {erro}
                      </p>
                      
                      {isAdmin && (
                        <div className="w-full space-y-2">
                          <button 
                            onClick={() => setShowUrlEdit(!showUrlEdit)}
                            className="text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-zinc-600 flex items-center gap-1 mx-auto"
                          >
                            <Settings size={12} /> {showUrlEdit ? "Ocultar Configurações" : "Configurar Link do GitHub"}
                          </button>
                          
                          {showUrlEdit && (
                            <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-100 space-y-3">
                              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block">URL do Arquivo Excel (Link RAW)</label>
                              <input 
                                type="text"
                                value={githubUrl}
                                onChange={(e) => setGithubUrl(e.target.value)}
                                className="w-full bg-white border border-zinc-200 rounded-lg px-3 py-2 text-xs font-medium outline-none focus:ring-2 focus:ring-claro/20"
                                placeholder="https://raw.githubusercontent.com/..."
                              />
                              <div className="space-y-1">
                                <p className="text-[9px] text-zinc-400 leading-tight">
                                  • O repositório <strong>DEVE ser PÚBLICO</strong> no GitHub.
                                </p>
                                <p className="text-[9px] text-zinc-400 leading-tight">
                                  • Use o link que começa com <code>raw.githubusercontent.com</code>.
                                </p>
                                <p className="text-[9px] text-zinc-400 leading-tight">
                                  • Verifique se não há espaços extras no início ou fim do link.
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="flex flex-wrap justify-center gap-3">
                        <button 
                          onClick={carregarDadosDoGithub}
                          className="flex items-center gap-2 px-6 py-3 bg-claro text-white rounded-xl font-bold hover:bg-claro-dark transition-all shadow-lg shadow-red-200"
                        >
                          <RefreshCw size={18} /> TENTAR NOVAMENTE
                        </button>

                        <button 
                          onClick={() => window.open(githubUrl, '_blank')}
                          className="flex items-center gap-2 px-6 py-3 bg-white text-zinc-600 border border-zinc-200 rounded-xl font-bold hover:bg-zinc-50 transition-all shadow-sm"
                        >
                          <Info size={18} /> VERIFICAR LINK
                        </button>
                      </div>

                      <div className="mt-8 pt-8 border-t border-zinc-100 w-full text-center">
                        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-4">Ou se preferir, carregue manualmente:</p>
                        <input 
                          id="file-upload-fallback" 
                          type="file" 
                          className="hidden" 
                          accept=".xlsx, .xls, .csv"
                          onChange={handleFileInput}
                        />
                        <button 
                          onClick={() => document.getElementById('file-upload-fallback')?.click()}
                          className="flex items-center gap-2 px-6 py-3 bg-zinc-100 text-zinc-600 rounded-xl font-bold hover:bg-zinc-200 transition-all mx-auto"
                        >
                          <UploadCloud size={18} /> SELECIONAR ARQUIVO MANUALMENTE
                        </button>
                      </div>
                    </div>
                  )}

                  {!carregando && !erro && (
                    <button 
                      onClick={carregarDadosDoGithub}
                      className="flex items-center gap-2 px-6 py-3 bg-claro text-white rounded-xl font-bold hover:bg-claro-dark transition-all shadow-lg shadow-red-200"
                    >
                      <RefreshCw size={18} /> CARREGAR DADOS
                    </button>
                  )}
                </CardContent>
              </Card>
            )}

        {/* Dashboard de Resultados */}
        {dados.length > 0 && (
          <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            
            {/* Filtros no Topo */}
            <div className="w-full">
              {/* Painel VISÃO GERAL */}
              <Card className="border-none shadow-sm bg-white overflow-visible">
                <CardHeader className="bg-claro py-3">
                  <CardTitle className="text-xs font-black uppercase tracking-widest text-white">Filtros de Visão Geral</CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <MultiSelect 
                      label="Mês"
                      options={opcoesMes}
                      selected={filtroMes}
                      onChange={setFiltroMes}
                      placeholder="Todos os Meses"
                    />
                    <MultiSelect 
                      label="Empresa"
                      options={opcoesEmpresa}
                      selected={filtroEmpresa}
                      onChange={setFiltroEmpresa}
                      placeholder="Todas as Empresas"
                    />
                    <MultiSelect 
                      label="Recurso / Unidade"
                      options={opcoesRecurso}
                      selected={filtroRecurso}
                      onChange={setFiltroRecurso}
                      placeholder="Todos os Recursos"
                    />
                    <MultiSelect 
                      label="Jornada"
                      options={opcoesJornada}
                      selected={filtroJornada}
                      onChange={setFiltroJornada}
                      placeholder="Todas as Jornadas"
                    />
                    <MultiSelect 
                      label="Município"
                      options={opcoesMunicipio}
                      selected={filtroMunicipio}
                      onChange={setFiltroMunicipio}
                      placeholder="Todos os Municípios"
                    />
                    <MultiSelect 
                      label="Login (Técnico)"
                      options={opcoesLogin}
                      selected={filtroLogin}
                      onChange={setFiltroLogin}
                      placeholder="Todos os Logins"
                    />
                    <MultiSelect 
                      label="Grupo de Baixa"
                      options={opcoesGrupoBaixa}
                      selected={filtroGrupoBaixa}
                      onChange={setFiltroGrupoBaixa}
                      placeholder="Todos os Grupos"
                    />
                    <MultiSelect 
                      label="Status"
                      options={opcoesStatus}
                      selected={filtroStatus}
                      onChange={setFiltroStatus}
                      placeholder="Todos os Status"
                    />
                  </div>
                  
                  {/* Botão de Limpar Filtros */}
                  {(filtroMes.length > 0 || filtroEmpresa.length > 0 || filtroRecurso.length > 0 || filtroJornada.length > 0 || filtroMunicipio.length > 0 || filtroLogin.length > 0 || filtroGrupoBaixa.length > 0 || filtroStatus.length > 0) && (
                    <div className="mt-4 flex justify-end">
                      <button 
                        onClick={limparFiltros}
                        className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-claro transition-all flex items-center justify-center gap-2 border border-zinc-100 rounded-lg hover:border-claro/20"
                      >
                        <X size={12} /> Limpar Todos os Filtros
                      </button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Conteúdo Principal */}
            <div className="w-full space-y-6">
              {/* Métricas e Indicadores de Status */}
              <div className="space-y-3">
                {/* Linha 1: Resumo Executivo (Nota Certidão, Total Atendimentos, Validados, Não Validados) */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {/* Card Nota da Certidão / % Impacto */}
                  <Card className="border-none shadow-md overflow-hidden bg-claro text-white relative">
                    <CardContent className="p-4">
                      <div className="flex flex-col">
                        <div className="flex items-center justify-between">
                          <p className="text-[9px] font-black uppercase tracking-widest text-white/80 mb-1">{metricasCalculadas.notaTitulo}</p>
                          {metricasCalculadas.statusAtivoChave && (
                            <span className="text-[8px] font-bold bg-white/20 px-1.5 py-0.5 rounded text-white uppercase">Status Ativo</span>
                          )}
                        </div>
                        <h3 className="text-2xl lg:text-3xl font-black text-white">{metricasCalculadas.nota.toFixed(1)}%</h3>
                        <p className="text-[9px] font-bold text-white/70 mt-1 uppercase truncate" title={metricasCalculadas.notaSubtitulo}>
                          {metricasCalculadas.notaSubtitulo}
                        </p>
                      </div>
                    </CardContent>
                    <div className="h-1 w-full bg-claro-dark" />
                  </Card>

                  {/* Card Total Atendimentos */}
                  <Card className="border-none shadow-sm overflow-hidden bg-white">
                    <CardContent className="p-4">
                      <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1">Total Atendimentos</p>
                      <h3 className="text-2xl lg:text-3xl font-black text-zinc-900">{metricasCalculadas.totalBase.toLocaleString('pt-BR')}</h3>
                      <p className="text-[9px] font-bold text-zinc-400 mt-1 uppercase">100.0% Base Geral</p>
                    </CardContent>
                    <div className="h-1 w-full bg-zinc-400" />
                  </Card>

                  {/* Card Validado (Total) */}
                  <Card 
                    className="border-none shadow-sm overflow-hidden bg-white hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => {
                      setSelectedValidationStatus(null);
                      setFiltroStatus([]);
                    }}
                    title="Clique para resetar filtros de status"
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1">Validado</p>
                        <span className="text-[9px] font-bold text-green-700 bg-green-50 px-1.5 py-0.5 rounded-full">{metricasCalculadas.pctValidados}%</span>
                      </div>
                      <h3 className="text-2xl lg:text-3xl font-black text-zinc-900">{metricasCalculadas.validados.toLocaleString('pt-BR')}</h3>
                      <p className="text-[9px] font-bold text-green-600 mt-1 uppercase">% Impacto: {metricasCalculadas.pctValidados}%</p>
                    </CardContent>
                    <div className="h-1 w-full bg-green-500" />
                  </Card>

                  {/* Card Não Validado (Total) */}
                  <Card className="border-none shadow-sm overflow-hidden bg-white">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1">Não Validado</p>
                        <span className="text-[9px] font-bold text-red-700 bg-red-50 px-1.5 py-0.5 rounded-full">{metricasCalculadas.pctNaoValidados}%</span>
                      </div>
                      <h3 className="text-2xl lg:text-3xl font-black text-zinc-900">{metricasCalculadas.naoValidados.toLocaleString('pt-BR')}</h3>
                      <p className="text-[9px] font-bold text-red-600 mt-1 uppercase">% Impacto: {metricasCalculadas.pctNaoValidados}%</p>
                    </CardContent>
                    <div className="h-1 w-full bg-red-400" />
                  </Card>
                </div>

                {/* Linha 2: Detalhamento de Todos os Status (Volume + % Impacto + Interatividade) */}
                <div>
                  <div className="flex items-center justify-between mb-1.5 px-0.5">
                    <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">
                      Status de Validação <span className="font-normal text-zinc-400">({metricasCalculadas.statusCards.length} Categorias)</span>
                    </p>
                    {selectedValidationStatus && (
                      <button 
                        onClick={() => setSelectedValidationStatus(null)}
                        className="text-[9px] font-bold text-claro hover:underline flex items-center gap-1"
                      >
                        <X size={10} /> Limpar seleção de status ({selectedValidationStatus})
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2.5">
                    {metricasCalculadas.statusCards.map((st) => (
                      <Card 
                        key={st.key}
                        onClick={() => {
                          if (selectedValidationStatus === st.key) {
                            setSelectedValidationStatus(null);
                          } else {
                            setSelectedValidationStatus(st.key);
                          }
                        }}
                        className={`border transition-all cursor-pointer overflow-hidden bg-white hover:shadow-md ${
                          st.isAtivo 
                            ? 'ring-2 ring-claro border-claro shadow-md bg-red-50/20' 
                            : 'border-zinc-100 hover:border-zinc-300'
                        }`}
                      >
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-[8.5px] font-black text-zinc-500 uppercase tracking-wider truncate" title={st.label}>
                              {st.shortName}
                            </p>
                            {st.isAtivo && (
                              <span className="w-2 h-2 rounded-full bg-claro animate-pulse" title="Status Selecionado" />
                            )}
                          </div>
                          <h4 className="text-xl font-black text-zinc-900">{st.volume.toLocaleString('pt-BR')}</h4>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-[9px] font-bold text-zinc-400 uppercase">Impacto</span>
                            <span className={`text-[10px] font-black ${st.textColor}`}>
                              {st.impactoPct}%
                            </span>
                          </div>
                        </CardContent>
                        <div className={`h-1.5 w-full ${st.barColor}`} />
                      </Card>
                    ))}
                  </div>
                </div>
              </div>

            {/* Gráficos */}
            <div className="grid grid-cols-1 gap-6">
              <Card className="border-none shadow-sm bg-white">
                <CardHeader>
                  <CardTitle className="text-lg font-bold uppercase tracking-tight">
                    {isStatusAtivo ? `Impacto por Mês: ${statusSelecionados.join(', ')}` : 'Nota da Certidão por Mês'}
                  </CardTitle>
                  <CardDescription>
                    {isStatusAtivo ? 'Percentual do status selecionado sobre o total em cada mês' : 'Percentual de conformidade mensal (reflete filtros de Recurso, Município, etc.)'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%" debounce={100}>
                    <BarChart data={notaMensal} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                      <XAxis 
                        dataKey="name" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontWeight: 'bold', fontSize: '10px' }}
                      />
                      <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontWeight: 'bold', fontSize: '12px' }}
                        domain={[0, 100]}
                        unit="%"
                      />
                      <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontWeight: 'bold', fontSize: '12px' }}
                        formatter={(value: number, _name: string, props: any) => [`${value}% (${(props?.payload?.conformes || 0).toLocaleString('pt-BR')} / ${(props?.payload?.total || 0).toLocaleString('pt-BR')})`, isStatusAtivo ? 'Taxa do Status' : 'Nota da Certidão']}
                      />
                      <Bar dataKey="value" fill="#EE2924" radius={[4, 4, 0, 0]}>
                        <LabelList 
                          dataKey="value" 
                          position="top" 
                          formatter={(v: number) => `${v}%`} 
                          style={{ fontSize: '10px', fontWeight: 'bold', fill: '#EE2924' }} 
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="border-none shadow-sm bg-white">
                <CardHeader>
                  <CardTitle className="text-lg font-bold uppercase tracking-tight">
                    {isStatusAtivo ? `Impacto por Semana: ${statusSelecionados.join(', ')}` : 'Nota da Certidão por Semana'}
                  </CardTitle>
                  <CardDescription>
                    {isStatusAtivo ? 'Percentual do status selecionado sobre o total em cada semana' : 'Consolidado semanal (S1 a S5)'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%" debounce={100}>
                    <BarChart data={notaSemanalConsolidada} margin={{ top: 30, right: 30, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                      <XAxis 
                        dataKey="name" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontWeight: 'bold', fontSize: '10px' }}
                      />
                      <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontWeight: 'bold', fontSize: '12px' }}
                        domain={[0, 110]}
                        unit="%"
                      />
                      <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontWeight: 'bold', fontSize: '12px' }}
                        formatter={(value: number, _name: string, props: any) => [`${value}% (${(props?.payload?.soma || 0).toLocaleString('pt-BR')} / ${(props?.payload?.total || 0).toLocaleString('pt-BR')})`, isStatusAtivo ? 'Taxa do Status' : 'Nota da Certidão']}
                      />
                      <Bar dataKey="value" fill="#EE2924" radius={[4, 4, 0, 0]}>
                        <LabelList 
                          dataKey="value" 
                          position="top" 
                          formatter={(v: number) => `${v}%`} 
                          style={{ fontSize: '10px', fontWeight: 'bold', fill: '#EE2924' }} 
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="border-none shadow-sm bg-white">
                <CardHeader>
                  <CardTitle className="text-lg font-bold uppercase tracking-tight">
                    {isStatusAtivo ? `Evolução Diária: ${statusSelecionados.join(', ')}` : 'Evolução Diária da Nota'}
                  </CardTitle>
                  <CardDescription>
                    {isStatusAtivo ? 'Taxa diária do status selecionado sobre o total' : 'Percentual de conformidade ao longo do tempo'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%" debounce={100}>
                    <AreaChart data={evolucaoDiaria} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorNota" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#EE2924" stopOpacity={0.1}/>
                          <stop offset="95%" stopColor="#EE2924" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                      <XAxis 
                        dataKey="data" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontWeight: 'bold', fontSize: '10px' }}
                        interval={0}
                        minTickGap={5}
                      />
                      <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontWeight: 'bold', fontSize: '12px' }}
                        domain={[0, 100]}
                        unit="%"
                      />
                      <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontWeight: 'bold', fontSize: '12px' }}
                        formatter={(value: any, _name: string, props: any) => [`${value}% (${(props?.payload?.soma || 0).toLocaleString('pt-BR')} / ${(props?.payload?.total || 0).toLocaleString('pt-BR')})`, isStatusAtivo ? 'Taxa do Status' : 'Nota da Certidão']}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="nota" 
                        stroke="#EE2924" 
                        strokeWidth={3}
                        fillOpacity={1} 
                        fill="url(#colorNota)" 
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="border-none shadow-sm bg-white">
                <CardHeader>
                  <CardTitle className="text-lg font-bold uppercase tracking-tight">Volume de Atendimento</CardTitle>
                  <CardDescription>Quantidade absoluta e percentual por status de validação (clique para filtrar)</CardDescription>
                </CardHeader>
                <CardContent className="h-[400px]">
                  <ResponsiveContainer width="100%" height="100%" debounce={100}>
                    <BarChart 
                      data={volumeValidacao} 
                      layout="vertical"
                      margin={{ top: 20, right: 60, left: 10, bottom: 20 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f0f0f0" />
                      <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontWeight: 'bold', fontSize: '12px' }} />
                      <YAxis 
                        dataKey="shortName" 
                        type="category"
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontWeight: 'bold', fontSize: '11px', fill: '#3f3f46' }}
                        width={170}
                      />
                      <Tooltip 
                        cursor={{ fill: '#f9fafb' }}
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontWeight: 'bold', fontSize: '12px' }}
                        formatter={(value: any, _name: string, props: any) => [typeof value === 'number' ? `${value.toLocaleString('pt-BR')} (${props?.payload?.percentage || '0.0'}%)` : value, props?.payload?.name || _name]}
                      />
                      <Bar 
                        dataKey="value" 
                        radius={[0, 6, 6, 0]} 
                        barSize={24}
                        onClick={(data) => {
                          if (selectedValidationStatus === data.name) {
                            setSelectedValidationStatus(null);
                          } else {
                            setSelectedValidationStatus(data.name);
                          }
                        }}
                        style={{ cursor: 'pointer' }}
                      >
                        {volumeValidacao.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={entry.color} 
                            stroke={selectedValidationStatus === entry.name ? '#000' : 'none'}
                            strokeWidth={2}
                            fillOpacity={selectedValidationStatus && selectedValidationStatus !== entry.name ? 0.3 : 1}
                          />
                        ))}
                        <LabelList 
                          dataKey="value" 
                          position="right" 
                          formatter={(val: number) => val > 0 ? val.toLocaleString('pt-BR') : '0'}
                          style={{ fontSize: '11px', fontWeight: 'bold', fill: '#3f3f46' }} 
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="border-none shadow-sm bg-white">
                <CardHeader>
                  <CardTitle className="text-lg font-bold uppercase tracking-tight">
                    {isStatusAtivo ? `Distribuição por TP_OS (${statusSelecionados.join(', ')})` : 'Distribuição por TP_OS'}
                  </CardTitle>
                  <CardDescription>
                    {isStatusAtivo ? 'Volume e percentual no status selecionado por tipo de ordem' : 'Volume total por tipo de ordem de serviço'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="h-[400px]">
                  <ResponsiveContainer width="100%" height="100%" debounce={100}>
                    <BarChart 
                      data={volumeTPOS} 
                      layout="vertical"
                      margin={{ top: 20, right: 70, left: 100, bottom: 20 }}
                      onClick={(data) => {
                        if (data && data.activeLabel) {
                          const label = String(data.activeLabel);
                          if (selectedTPOSClick === label) {
                            setSelectedTPOSClick(null);
                          } else {
                            setSelectedTPOSClick(label);
                          }
                        }
                      }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f0f0f0" />
                      <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontWeight: 'bold', fontSize: '12px' }} />
                      <YAxis 
                        dataKey="name" 
                        type="category"
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontWeight: 'bold', fontSize: '10px', fill: '#71717a' }}
                        width={90}
                      />
                      <Tooltip 
                        cursor={{ fill: '#f9fafb' }}
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontWeight: 'bold', fontSize: '12px' }}
                        formatter={(value: any, _name: string, props: any) => [
                          `${props?.payload?.statusCount?.toLocaleString('pt-BR')} de ${props?.payload?.total?.toLocaleString('pt-BR')} (${props?.payload?.percentage}%)`,
                          isStatusAtivo ? 'Impacto Status' : 'Volume'
                        ]}
                      />
                      <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={24} style={{ cursor: 'pointer' }}>
                        {volumeTPOS.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={entry.color} 
                            stroke={selectedTPOSClick === entry.name ? '#000' : 'none'}
                            strokeWidth={2}
                            fillOpacity={selectedTPOSClick && selectedTPOSClick !== entry.name ? 0.3 : 1}
                          />
                        ))}
                        <LabelList 
                          dataKey="value" 
                          position="right" 
                          formatter={(val: number) => isStatusAtivo ? `${val.toLocaleString('pt-BR')}` : val.toLocaleString('pt-BR')}
                          style={{ fontSize: '10px', fontWeight: 'bold', fill: '#71717a' }} 
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <Card className="border-none shadow-sm bg-white">
              <CardHeader>
                <CardTitle className="text-lg font-bold uppercase tracking-tight">
                  {isStatusAtivo ? `Taxa por Cidade (Top 13): ${statusSelecionados.join(', ')}` : 'Nota por Cidade (Top 13)'}
                </CardTitle>
                <CardDescription>
                  {isStatusAtivo ? 'Percentual de incidência do status selecionado por município' : 'Percentual de conformidade por município'}
                </CardDescription>
              </CardHeader>
              <CardContent className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%" debounce={100}>
                  <BarChart 
                    data={notaPorCidade} 
                    layout="vertical"
                    margin={{ top: 20, right: 60, left: 100, bottom: 20 }}
                    onClick={(data) => {
                      if (data && data.activeLabel) {
                        const label = String(data.activeLabel);
                        if (selectedMunicipioClick === label) {
                          setSelectedMunicipioClick(null);
                        } else {
                          setSelectedMunicipioClick(label);
                        }
                      }
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f0f0f0" />
                    <XAxis 
                      type="number" 
                      domain={[0, 100]} 
                      unit="%" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontWeight: 'bold', fontSize: '12px' }} 
                    />
                    <YAxis 
                      dataKey="name" 
                      type="category"
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontWeight: 'bold', fontSize: '10px', fill: '#71717a' }}
                      width={90}
                    />
                    <Tooltip 
                      cursor={{ fill: '#f9fafb' }}
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontWeight: 'bold', fontSize: '12px' }}
                      formatter={(value: number, _name: string, props: any) => [`${value}% (${(props?.payload?.soma || 0).toLocaleString('pt-BR')} / ${(props?.payload?.total || 0).toLocaleString('pt-BR')})`, isStatusAtivo ? 'Taxa do Status' : 'Nota']}
                    />
                    <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={24} fill="#EE2924" style={{ cursor: 'pointer' }}>
                      {notaPorCidade.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill="#EE2924" 
                          stroke={selectedMunicipioClick === entry.name ? '#000' : 'none'}
                          strokeWidth={2}
                          fillOpacity={selectedMunicipioClick && selectedMunicipioClick !== entry.name ? 0.3 : 1}
                        />
                      ))}
                      <LabelList 
                        dataKey="value" 
                        position="right" 
                        formatter={(value: number) => `${value}%`}
                        style={{ fontSize: '10px', fontWeight: 'bold', fill: '#71717a' }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="border-none shadow-sm bg-white">
              <CardHeader>
                <CardTitle className="text-lg font-bold uppercase tracking-tight">
                  {isStatusAtivo ? `Taxa por Recurso / Unidade: ${statusSelecionados.join(', ')}` : 'Nota da Certidão por Recurso / Unidade'}
                </CardTitle>
                <CardDescription>
                  {isStatusAtivo ? 'Percentual do status selecionado por Unidade de Negócio' : 'Percentual de conformidade por Unidade de Negócio'}
                </CardDescription>
              </CardHeader>
              <CardContent style={{ height: `${Math.max(400, notaPorRecurso.length * 30)}px` }}>
                <ResponsiveContainer width="100%" height="100%" debounce={100}>
                  <BarChart 
                    data={notaPorRecurso} 
                    layout="vertical"
                    margin={{ top: 20, right: 60, left: 100, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f0f0f0" />
                    <XAxis 
                      type="number" 
                      domain={[0, 100]} 
                      unit="%" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontWeight: 'bold', fontSize: '12px' }} 
                    />
                    <YAxis 
                      dataKey="name" 
                      type="category"
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontWeight: 'bold', fontSize: '10px', fill: '#71717a' }}
                      width={150}
                    />
                    <Tooltip 
                      cursor={{ fill: '#f9fafb' }}
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontWeight: 'bold', fontSize: '12px' }}
                      formatter={(value: number, _name: string, props: any) => [`${value}% (${(props?.payload?.soma || 0).toLocaleString('pt-BR')} / ${(props?.payload?.total || 0).toLocaleString('pt-BR')})`, isStatusAtivo ? 'Taxa do Status' : 'Nota']}
                    />
                    <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={24}>
                      {notaPorRecurso.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                      <LabelList 
                        dataKey="value" 
                        position="right" 
                        formatter={(value: number) => `${value}%`}
                        style={{ fontSize: '10px', fontWeight: 'bold', fill: '#71717a' }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="border-none shadow-sm bg-white">
              <CardHeader>
                <CardTitle className="text-lg font-bold uppercase tracking-tight">
                  {isStatusAtivo ? `Taxa por Login: ${statusSelecionados.join(', ')}` : 'Nota da Certidão por Login'}
                </CardTitle>
                <CardDescription>
                  {isStatusAtivo ? 'Percentual do status selecionado por técnico' : 'Percentual de conformidade por técnico'}
                </CardDescription>
              </CardHeader>
              <CardContent style={{ height: `${Math.max(400, notaPorLogin.length * 30)}px` }}>
                <ResponsiveContainer width="100%" height="100%" debounce={100}>
                  <BarChart 
                    data={notaPorLogin} 
                    layout="vertical"
                    margin={{ top: 20, right: 60, left: 100, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f0f0f0" />
                    <XAxis 
                      type="number" 
                      domain={[0, 100]} 
                      unit="%" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontWeight: 'bold', fontSize: '12px' }} 
                    />
                    <YAxis 
                      dataKey="name" 
                      type="category"
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontWeight: 'bold', fontSize: '10px', fill: '#71717a' }}
                      width={120}
                    />
                    <Tooltip 
                      cursor={{ fill: '#f9fafb' }}
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontWeight: 'bold', fontSize: '12px' }}
                      formatter={(value: number, _name: string, props: any) => [`${value}% (${(props?.payload?.soma || 0).toLocaleString('pt-BR')} / ${(props?.payload?.total || 0).toLocaleString('pt-BR')})`, isStatusAtivo ? 'Taxa do Status' : 'Nota']}
                    />
                    <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={24}>
                      {notaPorLogin.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                      <LabelList 
                        dataKey="value" 
                        position="right" 
                        formatter={(value: number) => `${value}%`}
                        style={{ fontSize: '10px', fontWeight: 'bold', fill: '#71717a' }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Tabela de Dados removida do Dashboard conforme solicitado */}
          </div>
        </div>
      )}
    </>
  ) : abaAtiva === 'fca' ? (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col gap-6">
            {canEdit ? (
              <Card className="w-full border-none shadow-sm bg-white overflow-visible">
                <CardHeader className="bg-white border-b border-zinc-200/90 py-4 px-6 flex flex-col gap-3">
                  <div className="flex flex-row items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-claro ring-4 ring-claro/10" />
                      <CardTitle className="text-xs font-black uppercase tracking-widest text-zinc-900">
                        {editingFCA ? 'Editar Registro FCA' : 'Novo Registro FCA'}
                      </CardTitle>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleResetFcaForm}
                        className="text-[11px] font-black uppercase tracking-wider text-zinc-600 hover:text-zinc-900 bg-zinc-100 hover:bg-zinc-200 px-3 py-1.5 rounded-lg transition-colors border border-zinc-200"
                        title="Limpar formulário e reiniciar seleções"
                      >
                        Limpar
                      </button>
                      {editingFCA && (
                        <button 
                          type="button"
                          onClick={() => handleResetFcaForm()}
                          className="text-zinc-400 hover:text-zinc-700 p-1 rounded-md transition-colors"
                        >
                          <X size={16} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Resumo de Métricas e Todos os Status de Validação */}
                  <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-zinc-100">
                    <div className="flex items-center gap-2 bg-zinc-50 border border-zinc-200/90 px-3 py-1 rounded-lg shadow-2xs">
                      <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Nota</span>
                      <span className={`text-xs font-black px-2 py-0.5 rounded-md ${
                        fcaMetricasCalculadas.nota >= 80 ? 'bg-emerald-600 text-white' :
                        fcaMetricasCalculadas.nota >= 70 ? 'bg-amber-500 text-white' :
                        'bg-red-600 text-white'
                      }`}>
                        {fcaMetricasCalculadas.nota.toFixed(1)}%
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 bg-zinc-50 border border-zinc-200/90 px-3 py-1 rounded-lg shadow-2xs">
                      <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Total</span>
                      <span className="text-xs font-black text-zinc-900">{fcaMetricasCalculadas.total.toLocaleString('pt-BR')}</span>
                    </div>

                    <div className="flex items-center gap-1.5 bg-emerald-50/70 border border-emerald-200/90 px-3 py-1 rounded-lg shadow-2xs">
                      <span className="text-[9px] font-black uppercase tracking-widest text-emerald-800">Validados</span>
                      <span className="text-xs font-black text-emerald-700">
                        {fcaMetricasCalculadas.validados.toLocaleString('pt-BR')}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 bg-red-50/70 border border-red-200/90 px-3 py-1 rounded-lg shadow-2xs">
                      <span className="text-[9px] font-black uppercase tracking-widest text-red-800">Não Validados</span>
                      <span className="text-xs font-black text-red-700">
                        {fcaMetricasCalculadas.naoValidados.toLocaleString('pt-BR')}
                      </span>
                    </div>

                    {/* Todos os status detalhados com registros */}
                    {fcaMetricasCalculadas.statusDetalhados.map((st) => (
                      <div 
                        key={st.key}
                        className="flex items-center gap-1.5 text-[10px] font-bold bg-white border border-zinc-200/90 px-2.5 py-1 rounded-lg text-zinc-700 shadow-2xs hover:border-zinc-300 transition-colors"
                        title={st.label}
                      >
                        <span className={`w-2 h-2 rounded-full ${st.isValidado ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                        <span className="text-zinc-500 font-semibold">{st.shortName}:</span>
                        <span className="font-black text-zinc-900">{st.count.toLocaleString('pt-BR')}</span>
                      </div>
                    ))}
                  </div>
                </CardHeader>
                <CardContent className="p-6 overflow-visible">
                  <form onSubmit={editingFCA ? handleUpdateFCA : handleAddFCA} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <MultiSelect 
                            label="Mês"
                            options={fcaOpcoesMes}
                            selected={fcaFormMes}
                            onChange={handleFcaMesChange}
                            placeholder="Todos os meses"
                          />
                          <MultiSelect 
                            label="Município (DSC_MUNICIPIO_BI)"
                            options={fcaOpcoesMunicipio}
                            selected={fcaFormMunicipio}
                            onChange={handleFcaMunicipioChange}
                            placeholder="Todos os municípios"
                          />
                          <MultiSelect 
                            label="Recurso / Unidade"
                            options={fcaOpcoesRecurso}
                            selected={fcaFormRecurso}
                            onChange={handleFcaRecursoChange}
                            placeholder="Todos os recursos"
                          />
                          <MultiSelect 
                            label="Login (Técnico)"
                            options={fcaOpcoesLogin}
                            selected={fcaFormLogin}
                            onChange={handleFcaLoginChange}
                            placeholder="Todos os logins"
                          />
                          <div className="md:col-span-2">
                            <MultiSelect 
                              label="Jornada"
                              options={fcaOpcoesJornada}
                              selected={fcaFormJornada}
                              onChange={handleFcaJornadaChange}
                              placeholder="Todas as jornadas"
                            />
                          </div>
                        </div>
                      </div>
                  
                  <div className="grid grid-cols-5 gap-2">
                        <div>
                          <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-1 block">S1</label>
                          <input 
                            type="text" 
                            name="s1" 
                            value={fcaFormS1}
                            onChange={(e) => setFcaFormS1(e.target.value)}
                            className="w-full bg-zinc-50 border-none rounded-lg px-2 py-2 text-sm font-bold outline-none ring-1 ring-zinc-100 focus:ring-claro transition-all" 
                            placeholder="%" 
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-1 block">S2</label>
                          <input 
                            type="text" 
                            name="s2" 
                            value={fcaFormS2}
                            onChange={(e) => setFcaFormS2(e.target.value)}
                            className="w-full bg-zinc-50 border-none rounded-lg px-2 py-2 text-sm font-bold outline-none ring-1 ring-zinc-100 focus:ring-claro transition-all" 
                            placeholder="%" 
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-1 block">S3</label>
                          <input 
                            type="text" 
                            name="s3" 
                            value={fcaFormS3}
                            onChange={(e) => setFcaFormS3(e.target.value)}
                            className="w-full bg-zinc-50 border-none rounded-lg px-2 py-2 text-sm font-bold outline-none ring-1 ring-zinc-100 focus:ring-claro transition-all" 
                            placeholder="%" 
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-1 block">S4</label>
                          <input 
                            type="text" 
                            name="s4" 
                            value={fcaFormS4}
                            onChange={(e) => setFcaFormS4(e.target.value)}
                            className="w-full bg-zinc-50 border-none rounded-lg px-2 py-2 text-sm font-bold outline-none ring-1 ring-zinc-100 focus:ring-claro transition-all" 
                            placeholder="%" 
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-1 block">S5</label>
                          <input 
                            type="text" 
                            name="s5" 
                            value={fcaFormS5}
                            onChange={(e) => setFcaFormS5(e.target.value)}
                            className="w-full bg-zinc-50 border-none rounded-lg px-2 py-2 text-sm font-bold outline-none ring-1 ring-zinc-100 focus:ring-claro transition-all" 
                            placeholder="%" 
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div>
                        <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-1.5 block">Fato</label>
                        <textarea 
                          name="fato" 
                          required 
                          value={fcaFormFato}
                          onChange={(e) => setFcaFormFato(e.target.value)}
                          className="w-full bg-zinc-50 border-none rounded-lg px-3 py-2 text-sm font-bold outline-none min-h-[80px] ring-1 ring-zinc-100 focus:ring-claro transition-all" 
                          placeholder="Descreva o fato..." 
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-1.5 block">Causa</label>
                        <textarea 
                          name="causa" 
                          required 
                          value={fcaFormCausa}
                          onChange={(e) => setFcaFormCausa(e.target.value)}
                          className="w-full bg-zinc-50 border-none rounded-lg px-3 py-2 text-sm font-bold outline-none min-h-[80px] ring-1 ring-zinc-100 focus:ring-claro transition-all" 
                          placeholder="Descreva a causa..." 
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-1.5 block">Ação</label>
                        <textarea 
                          name="acao" 
                          required 
                          value={fcaFormAcao}
                          onChange={(e) => setFcaFormAcao(e.target.value)}
                          className="w-full bg-zinc-50 border-none rounded-lg px-3 py-2 text-sm font-bold outline-none min-h-[80px] ring-1 ring-zinc-100 focus:ring-claro transition-all" 
                          placeholder="Descreva a ação..." 
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-1.5 block">Responsável</label>
                        <input 
                          type="text" 
                          name="responsavel" 
                          required 
                          value={fcaFormResponsavel}
                          onChange={(e) => setFcaFormResponsavel(e.target.value)}
                          className="w-full bg-zinc-50 border-none rounded-lg px-3 py-2 text-sm font-bold outline-none ring-1 ring-zinc-100 focus:ring-claro transition-all" 
                          placeholder="Nome do responsável..." 
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-1.5 block">Data Ação</label>
                        <input 
                          type="date" 
                          name="data_acao" 
                          required 
                          value={fcaFormDataAcao}
                          onChange={(e) => setFcaFormDataAcao(e.target.value)}
                          className="w-full bg-zinc-50 border-none rounded-lg px-3 py-2 text-sm font-bold outline-none ring-1 ring-zinc-100 focus:ring-claro transition-all" 
                        />
                      </div>
                    </div>

                    <div className="flex gap-3">
                      {editingFCA && (
                        <>
                          <button
                            type="button"
                            onClick={() => setFcaParaExcluir(editingFCA)}
                            className="w-1/4 bg-red-50 text-red-600 border border-red-200 py-3 rounded-xl font-black uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all text-xs flex items-center justify-center gap-2 shadow-sm"
                            title="Excluir este registro FCA"
                          >
                            <Trash2 size={14} />
                            Excluir
                          </button>
                          <button
                            type="button"
                            onClick={handleResetFcaForm}
                            className="w-1/4 bg-zinc-100 text-zinc-700 py-3 rounded-xl font-black uppercase tracking-widest hover:bg-zinc-200 transition-all text-xs flex items-center justify-center gap-2 shadow-sm"
                          >
                            <X size={14} />
                            Cancelar
                          </button>
                        </>
                      )}
                      <button 
                        type="submit" 
                        className={`w-full ${editingFCA ? 'w-2/4' : ''} bg-claro text-white py-3 rounded-xl font-black uppercase tracking-widest hover:bg-claro-dark transition-all text-xs flex items-center justify-center gap-2 shadow-sm`}
                      >
                        {editingFCA ? <Save size={14} /> : <Plus size={14} />}
                        {editingFCA ? 'Salvar Alterações' : 'Gravar Informações'}
                      </button>
                    </div>
                  </form>
                </CardContent>
              </Card>
          ) : (
            <Card className="w-full border-none shadow-sm bg-white overflow-hidden flex flex-col items-center justify-center p-12 text-center">
              <Lock className="text-zinc-200 mb-4" size={48} />
              <h3 className="text-sm font-black uppercase tracking-widest text-zinc-400">Acesso de Leitura</h3>
              <p className="text-xs text-zinc-400 mt-2">Você não tem permissão para cadastrar ou editar registros FCA.</p>
            </Card>
          )}

            <div className="w-full space-y-6">
              <Card className="border-none shadow-sm bg-white overflow-hidden">
              <CardHeader className="border-b border-zinc-50 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg font-bold uppercase tracking-tight">Registros FCA Gravados</CardTitle>
                  <CardDescription>Análise de Fato, Causa e Ação</CardDescription>
                </div>
                <button 
                  onClick={exportarFCA}
                  disabled={fcaFiltrados.length === 0}
                  className="bg-zinc-900 text-white px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest hover:bg-zinc-800 transition-all disabled:opacity-50"
                >
                  Exportar FCA
                </button>
              </CardHeader>
              <CardContent className="p-0">
                {/* Mobile View - Cards */}
                <div className="md:hidden divide-y divide-zinc-100">
                  {fcaFiltrados.map((entry) => (
                    <div key={entry.id} className="p-4 space-y-4 bg-white hover:bg-zinc-50 transition-colors">
                      <div className="flex justify-between items-start">
                        <div className="space-y-1">
                          <h3 className="text-lg font-black text-zinc-900 leading-tight">{entry.mes}</h3>
                          <p className="text-xs font-black text-zinc-400 uppercase tracking-widest">{entry.login}</p>
                          <p className="text-xs text-zinc-500 font-bold">{entry.municipio} - {entry.jornada}</p>
                          <p className="text-[11px] text-zinc-400 italic">{entry.recurso}</p>
                          {entry.data_ultima_alteracao && (
                            <p className="text-[10px] text-claro font-bold mt-1">Alt: {formatarData(entry.data_ultima_alteracao)}</p>
                          )}
                        </div>
                        {canEdit && (
                          <div className="flex gap-2">
                            <button 
                              onClick={() => {
                                setEditingFCA(entry);
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              }}
                              className="p-2 bg-zinc-100 rounded-lg text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900 transition-all shadow-sm"
                              title="Editar Registro"
                            >
                              <Edit size={14} />
                            </button>
                            <button 
                              onClick={() => setFcaParaExcluir(entry)}
                              className="p-2 bg-red-50 rounded-lg text-red-600 hover:bg-red-600 hover:text-white transition-all shadow-sm"
                              title="Excluir Registro"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-100">
                        <div className="grid grid-cols-5 gap-3">
                          {[
                            { label: 'S1', val: entry.s1 },
                            { label: 'S2', val: entry.s2 },
                            { label: 'S3', val: entry.s3 },
                            { label: 'S4', val: entry.s4 },
                            { label: 'S5', val: entry.s5 }
                          ].map((s) => (
                            <div key={s.label} className="flex flex-col gap-1.5">
                              <span className="text-[9px] font-black text-zinc-400 uppercase tracking-tighter text-center">{s.label}</span>
                              <div className="h-12 w-full bg-white rounded-lg border border-zinc-200 flex flex-col items-center justify-center overflow-hidden relative shadow-sm">
                                <span className={`text-[10px] font-black z-10 ${getNotaColor(s.val || '')}`}>
                                  {s.val && s.val !== '-' ? s.val.replace('%', '') : '-'}
                                </span>
                                {s.val && s.val !== '-' && (
                                  <div 
                                    className={`absolute bottom-0 left-0 right-0 opacity-20 ${getNotaBgColor(s.val)}`} 
                                    style={{ height: s.val }}
                                  />
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="p-2 bg-zinc-50 rounded-lg border-l-2 border-zinc-300">
                          <p className="text-[10px] font-black text-zinc-400 uppercase mb-1">Fato</p>
                          <p className="text-xs text-zinc-700 font-bold">{entry.fato}</p>
                        </div>
                        <div className="p-2 bg-zinc-50 rounded-lg border-l-2 border-zinc-300">
                          <p className="text-[10px] font-black text-zinc-400 uppercase mb-1">Causa</p>
                          <p className="text-xs text-zinc-600">{entry.causa}</p>
                        </div>
                        <div className="p-2 bg-zinc-50 rounded-lg border-l-2 border-claro">
                          <p className="text-[10px] font-black text-claro uppercase mb-1">Ação</p>
                          <p className="text-xs text-zinc-600">{entry.acao}</p>
                          <div className="flex justify-between items-center mt-3 pt-3 border-t border-zinc-100">
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-1.5">
                                <User size={10} className="text-zinc-400" />
                                <p className="text-[10px] font-bold text-zinc-500">{entry.responsavel || 'N/A'}</p>
                              </div>
                              {entry.data_acao && (
                                <div className="flex items-center gap-1.5">
                                  <Calendar size={10} className="text-zinc-400" />
                                  <p className="text-[9px] font-bold text-zinc-400">{formatarData(entry.data_acao)}</p>
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              {canEdit && (
                                <>
                                  <button 
                                    onClick={() => setEditingFCA(entry)}
                                    className="p-2 bg-zinc-100 text-zinc-500 rounded-lg"
                                  >
                                    <Edit size={14} />
                                  </button>
                                  {isAdmin && (
                                    <button 
                                      onClick={async () => {
                                        if(confirm('Excluir este registro?')) {
                                          const res = await api.deleteFCA(entry.id);
                                          if (res.success) {
                                            setFcaEntries(fcaEntries.filter(e => e.id !== entry.id));
                                          } else {
                                            alert('Erro ao excluir FCA: ' + (res.error || 'Falha ao comunicar com o servidor'));
                                          }
                                        }
                                      }}
                                      className="p-2 bg-claro/10 text-claro rounded-lg"
                                    >
                                      <X size={14} />
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop View - Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-[10px] text-zinc-400 uppercase tracking-widest bg-zinc-50/50">
                      <tr>
                        <th className="px-6 py-4 font-black">Mês / Técnico / Município</th>
                        <th className="px-6 py-4 font-black">Notas Semanais</th>
                        <th className="px-6 py-4 font-black">Fato</th>
                        <th className="px-6 py-4 font-black">Causa</th>
                        <th className="px-6 py-4 font-black">Ação / Data Cadastro</th>
                        <th className="px-6 py-4 font-black">Responsável / Data Ação</th>
                        <th className="px-6 py-4 font-black text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-50">
                      {fcaFiltrados.map((entry) => (
                        <tr key={entry.id} className="hover:bg-zinc-50/50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex flex-col gap-1">
                              <p className="font-bold text-zinc-900 text-sm">{entry.mes}</p>
                              <p className="text-[10px] text-zinc-500 uppercase font-black tracking-wider">{entry.login}</p>
                              <p className="text-[10px] text-zinc-400 font-medium">{entry.municipio} - {entry.jornada}</p>
                              <p className="text-[10px] text-zinc-400 italic">{entry.recurso}</p>
                              {entry.data_ultima_alteracao && (
                                <p className="text-[9px] text-claro font-bold mt-1 bg-claro/5 px-1.5 py-0.5 rounded-full inline-block w-fit">
                                  Alt: {formatarData(entry.data_ultima_alteracao)}
                                </p>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="bg-zinc-50/50 p-4 rounded-xl border border-zinc-100/50 min-w-[280px]">
                              <div className="grid grid-cols-5 gap-x-4 gap-y-2">
                                {[
                                  { label: 'S1', val: entry.s1 },
                                  { label: 'S2', val: entry.s2 },
                                  { label: 'S3', val: entry.s3 },
                                  { label: 'S4', val: entry.s4 },
                                  { label: 'S5', val: entry.s5 }
                                ].map((s) => (
                                  <div key={s.label} className="flex flex-col gap-2">
                                    <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest text-center">{s.label}</span>
                                    <div className="h-14 w-full bg-white rounded-lg border border-zinc-200 flex flex-col items-center justify-center overflow-hidden relative shadow-sm">
                                      <span className={`text-[11px] font-black z-10 ${getNotaColor(s.val || '')}`}>
                                        {s.val && s.val !== '-' ? s.val.replace('%', '') : '-'}
                                        {s.val && s.val !== '-' && <span className="text-[8px] ml-0.5">%</span>}
                                      </span>
                                      {s.val && s.val !== '-' && (
                                        <div 
                                          className={`absolute bottom-0 left-0 right-0 opacity-20 ${getNotaBgColor(s.val)}`} 
                                          style={{ height: s.val }}
                                        />
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 max-w-[200px]">
                            <p className="font-bold text-zinc-700 text-xs">F: {entry.fato}</p>
                          </td>
                          <td className="px-6 py-4 max-w-[200px]">
                            <p className="text-xs text-zinc-500">C: {entry.causa}</p>
                          </td>
                          <td className="px-6 py-4 max-w-[250px]">
                            <div className="flex flex-col gap-2">
                              <div className="bg-zinc-50 p-2.5 rounded-lg border-l-4 border-claro">
                                <span className="text-[9px] font-black uppercase tracking-widest text-claro mb-1 block">Ação</span>
                                <p className="text-xs text-zinc-700 font-bold leading-relaxed">{entry.acao}</p>
                              </div>
                              <div className="flex items-center gap-1.5 text-[9px] text-zinc-400 font-bold ml-1">
                                <Clock size={10} />
                                <span>Criado em: {formatarData(entry.dataCriacao)}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col gap-2">
                              <div className="flex items-center gap-2 bg-zinc-50 px-3 py-2 rounded-lg border border-zinc-100">
                                <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm border border-zinc-100">
                                  <User size={14} className="text-claro" />
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 leading-none mb-1">Responsável</span>
                                  <span className="text-xs font-black text-zinc-800">{entry.responsavel || 'Não atribuído'}</span>
                                </div>
                              </div>
                              {entry.data_acao && (
                                <div className="flex items-center gap-2 bg-claro/5 px-3 py-2 rounded-lg border border-claro/10">
                                  <Calendar size={14} className="text-claro" />
                                  <div className="flex flex-col">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-claro/60 leading-none mb-1">Data Ação</span>
                                    <span className="text-xs font-black text-claro">{formatarData(entry.data_acao)}</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            {canEdit && (
                              <div className="flex items-center justify-end gap-2">
                                <button 
                                  onClick={() => {
                                    setEditingFCA(entry);
                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                  }}
                                  className="p-2 bg-zinc-100 text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900 rounded-lg transition-all shadow-sm"
                                  title="Editar Registro"
                                >
                                  <Edit size={14} />
                                </button>
                                <button 
                                  onClick={() => setFcaParaExcluir(entry)}
                                  className="p-2 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded-lg transition-all shadow-sm"
                                  title="Excluir Registro"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                      {fcaFiltrados.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-6 py-12 text-center text-zinc-400 font-bold uppercase tracking-widest">
                            Nenhum registro FCA gravado ainda.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    ) : abaAtiva === 'diario' ? (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="flex flex-col gap-6">
          {canEdit ? (
            <Card className="w-full border-none shadow-sm bg-white overflow-hidden">
              <CardHeader className="bg-claro py-3 flex flex-row items-center justify-between">
                <CardTitle className="text-xs font-black uppercase tracking-widest text-white">
                  {editingDiario ? 'Editar Registro' : 'Novo Registro Diário'}
                </CardTitle>
                {editingDiario && (
                  <button 
                    onClick={() => setEditingDiario(null)}
                    className="text-white/60 hover:text-white transition-colors"
                  >
                    <X size={16} />
                  </button>
                )}
              </CardHeader>
              <CardContent className="p-6">
                <form onSubmit={editingDiario ? handleUpdateDiario : handleAddDiario} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-1.5 block">Data</label>
                      <input 
                        type="date" 
                        name="data" 
                        required 
                        defaultValue={editingDiario?.data || ''}
                        key={editingDiario ? `edit-data-${editingDiario.id}` : 'new-data'}
                        className="w-full bg-zinc-50 border-none rounded-lg px-3 py-2 text-sm font-bold outline-none ring-1 ring-zinc-100 focus:ring-claro transition-all" 
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-1.5 block">Nº Chamado</label>
                      <input 
                        type="text" 
                        name="chamado" 
                        required 
                        defaultValue={editingDiario?.chamado || ''}
                        key={editingDiario ? `edit-chamado-${editingDiario.id}` : 'new-chamado'}
                        className="w-full bg-zinc-50 border-none rounded-lg px-3 py-2 text-sm font-bold outline-none ring-1 ring-zinc-100 focus:ring-claro transition-all" 
                        placeholder="Ex: 123456" 
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-1.5 block">Status</label>
                      <select 
                        name="status" 
                        required 
                        defaultValue={editingDiario?.status || 'Pendente'}
                        key={editingDiario ? `edit-status-${editingDiario.id}` : 'new-status'}
                        className="w-full bg-zinc-50 border-none rounded-lg px-3 py-2 text-sm font-bold outline-none ring-1 ring-zinc-100 focus:ring-claro transition-all"
                      >
                        <option value="Pendente">Pendente</option>
                        <option value="Em Andamento">Em Andamento</option>
                        <option value="Concluído">Concluído</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-1.5 block">Data da Conclusão</label>
                      <input 
                        type="date" 
                        name="dataConclusao" 
                        defaultValue={editingDiario?.dataConclusao || ''}
                        key={editingDiario ? `edit-concl-${editingDiario.id}` : 'new-concl'}
                        className="w-full bg-zinc-50 border-none rounded-lg px-3 py-2 text-sm font-bold outline-none ring-1 ring-zinc-100 focus:ring-claro transition-all" 
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-1.5 block">Descrição</label>
                    <textarea 
                      name="descricao" 
                      required 
                      defaultValue={editingDiario?.descricao || ''}
                      key={editingDiario ? `edit-desc-${editingDiario.id}` : 'new-desc'}
                      className="w-full bg-zinc-50 border-none rounded-lg px-3 py-2 text-sm font-bold outline-none min-h-[100px] ring-1 ring-zinc-100 focus:ring-claro transition-all" 
                      placeholder="Descreva o ocorrido..." 
                    />
                  </div>
                  <button type="submit" className="w-full bg-claro text-white py-3 rounded-xl font-black uppercase tracking-widest hover:bg-claro-dark transition-all text-xs mt-4 flex items-center justify-center gap-2">
                    {editingDiario ? <Save size={14} /> : <Plus size={14} />}
                    {editingDiario ? 'Salvar Alterações' : 'Gravar no Diário'}
                  </button>
                </form>
              </CardContent>
            </Card>
          ) : (
            <Card className="w-full border-none shadow-sm bg-white overflow-hidden flex flex-col items-center justify-center p-12 text-center">
              <Lock className="text-zinc-200 mb-4" size={48} />
              <h3 className="text-sm font-black uppercase tracking-widest text-zinc-400">Acesso de Leitura</h3>
              <p className="text-xs text-zinc-400 mt-2">Você não tem permissão para cadastrar ou editar o Diário de Bordo.</p>
            </Card>
          )}

          <div className="w-full space-y-6">
            <Card className="border-none shadow-sm bg-white overflow-hidden">
              <CardHeader className="border-b border-zinc-50">
                <CardTitle className="text-lg font-bold uppercase tracking-tight">Registros do Diário</CardTitle>
                <CardDescription>Histórico de chamados e ocorrências</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-[10px] text-zinc-400 uppercase tracking-widest bg-zinc-50/50">
                      <tr>
                        <th className="px-6 py-4 font-black">Data / Chamado</th>
                        <th className="px-6 py-4 font-black">Descrição</th>
                        <th className="px-6 py-4 font-black">Status / Conclusão</th>
                        <th className="px-6 py-4 font-black text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-50">
                      {diarioEntries.map((entry) => (
                        <tr key={entry.id} className="hover:bg-zinc-50/50 transition-colors">
                          <td className="px-6 py-4">
                            <p className="font-bold text-zinc-900">{formatarData(entry.data)}</p>
                            <p className="text-[10px] text-zinc-400 uppercase font-black">Chamado: {entry.chamado}</p>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-xs text-zinc-600 whitespace-pre-wrap">{entry.descricao}</p>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col gap-1">
                              <span className={`w-fit px-2 py-1 rounded-md text-[10px] font-black uppercase ${
                                entry.status === 'Concluído' ? 'bg-green-100 text-green-700' : 
                                entry.status === 'Em Andamento' ? 'bg-blue-100 text-blue-700' : 'bg-zinc-100 text-zinc-500'
                              }`}>
                                {entry.status}
                              </span>
                              {entry.dataConclusao && (
                                <p className="text-[9px] font-bold text-zinc-400">Concluído em: {formatarData(entry.dataConclusao)}</p>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            {canEdit && (
                              <div className="flex items-center justify-end gap-2">
                                <button 
                                  onClick={() => setEditingDiario(entry)}
                                  className="text-zinc-400 hover:text-zinc-700 p-1.5 rounded hover:bg-zinc-100 transition-colors"
                                  title="Editar"
                                >
                                  <Edit size={15} />
                                </button>
                                <button 
                                  onClick={() => setDiarioParaExcluir(entry)}
                                  className="text-zinc-400 hover:text-red-600 p-1.5 rounded hover:bg-red-50 transition-colors"
                                  title="Excluir"
                                >
                                  <Trash2 size={15} />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                      {diarioEntries.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-6 py-12 text-center text-zinc-400 font-bold uppercase tracking-widest">
                            Nenhum registro no diário ainda.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    ) : abaAtiva === 'analitico' ? (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <Card className="border-none shadow-sm bg-white overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between border-b border-zinc-50 pb-6">
            <div>
              <CardTitle className="text-xl font-black uppercase tracking-tight">Dados Analíticos</CardTitle>
              <CardDescription>Visualização detalhada de todos os registros processados</CardDescription>
            </div>
            <div className="flex items-center gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                <input 
                  type="text" 
                  placeholder="Pesquisar..." 
                  value={searchAnalitico}
                  onChange={(e) => setSearchAnalitico(e.target.value)}
                  className="pl-10 pr-4 py-2 bg-zinc-50 border border-zinc-100 rounded-xl text-sm font-bold outline-none focus:border-claro/30 transition-all w-64"
                />
              </div>
              <button 
                onClick={exportarAnaliticoCSV}
                className="flex items-center gap-2 bg-zinc-900 text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-zinc-800 transition-all"
              >
                <Download size={16} />
                Exportar CSV
              </button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-zinc-50 border-b border-zinc-100">
                    <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-zinc-400">DIA</th>
                    <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-zinc-400">LGN_TEC</th>
                    <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-zinc-400">RECURSO_UN</th>
                    <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-zinc-400">NR_CONTRATO</th>
                    <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-zinc-400">DSC_MUNICIPIO_BI</th>
                    <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-zinc-400">COD_BAIXA</th>
                    <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-zinc-400">DESC_NODE</th>
                    <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-zinc-400">TIPO_PRODUTO</th>
                    <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-zinc-400">TP_OS</th>
                    <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-zinc-400">JORNADA</th>
                    <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-zinc-400">VALIDACAO</th>
                    <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-zinc-400">OFDMA</th>
                    <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-zinc-400">UP_FAIL</th>
                    <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-zinc-400">DOWN_FAIL</th>
                    <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-zinc-400">ID_PONTO</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {dadosAnalitico.slice(0, 500).map((item, idx) => (
                    <tr key={idx} className="hover:bg-zinc-50/50 transition-colors">
                      <td className="px-4 py-4 text-xs font-bold text-zinc-600">
                        {item.DIA instanceof Date ? item.DIA.toLocaleDateString('pt-BR') : String(item.DIA || '-')}
                      </td>
                      <td className="px-4 py-4 text-xs font-black text-zinc-900">{item.LGN_TEC}</td>
                      <td className="px-4 py-4 text-xs font-bold text-zinc-500">{item.RECURSO_UN}</td>
                      <td className="px-4 py-4 text-xs font-bold text-zinc-500">{item.NR_CONTRATO}</td>
                      <td className="px-4 py-4 text-xs font-bold text-zinc-500">{item.DSC_MUNICIPIO_BI}</td>
                      <td className="px-4 py-4 text-xs font-bold text-zinc-500">{item.COD_BAIXA || '-'}</td>
                      <td className="px-4 py-4 text-xs font-bold text-zinc-500">{item.DESC_NODE || '-'}</td>
                      <td className="px-4 py-4 text-xs font-bold text-zinc-500">{item.TIPO_PRODUTO || '-'}</td>
                      <td className="px-4 py-4 text-xs font-bold text-zinc-500">{item.TP_OS}</td>
                      <td className="px-4 py-4 text-xs font-bold text-zinc-500">{item.JORNADA}</td>
                      <td className="px-4 py-4">
                        <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-md ${
                          item.VALIDACAO?.includes('SEM FALHA') ? 'bg-green-50 text-green-600' : 
                          item.VALIDACAO?.includes('COM FALHA') ? 'bg-red-50 text-claro' : 'bg-zinc-100 text-zinc-500'
                        }`}>
                          {item.VALIDACAO}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-xs font-bold text-zinc-500">{item.OFDMA}</td>
                      <td className="px-4 py-4 text-xs font-bold text-zinc-500">{item.OBS_UP_PORTAS_FAIL}</td>
                      <td className="px-4 py-4 text-xs font-bold text-zinc-500">{item.OBS_DOWN_PORTAS_FAIL}</td>
                      <td className="px-4 py-4 text-xs font-bold text-zinc-500">{item.ID_PONTO}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {dadosAnalitico.length > 500 && (
                <div className="p-6 text-center border-t border-zinc-50">
                  <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">
                    Exibindo os primeiros 500 registros de {dadosAnalitico.length}. Use o filtro ou exporte para ver tudo.
                  </p>
                </div>
              )}
              {dadosAnalitico.length === 0 && (
                <div className="p-20 text-center">
                  <p className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Nenhum registro encontrado.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    ) : abaAtiva === 'usuarios' && isAdmin ? (
      <Usuarios adminProfile={profile} todasEmpresasDisponiveis={TODAS_AS_EMPRESAS} />
    ) : null}

    {/* Botão flutuante para voltar ao topo */}
    {showScrollTop && (
      <button
        onClick={scrollToTop}
        className="fixed bottom-6 right-6 bg-claro text-white p-2.5 sm:p-3 rounded-full shadow-xl hover:bg-claro-dark hover:scale-105 active:scale-95 transition-all z-50 flex items-center justify-center cursor-pointer"
        aria-label="Voltar ao topo"
        title="Voltar ao topo"
      >
        <ArrowUp size={18} />
      </button>
    )}

    {/* Modal de Confirmação de Exclusão FCA */}
    {fcaParaExcluir && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
        <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-zinc-200 space-y-4 animate-in zoom-in-95 duration-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center text-red-600 shrink-0 border border-red-100">
              <Trash2 size={20} />
            </div>
            <div>
              <h3 className="text-base font-black text-zinc-900 leading-tight">Excluir Registro FCA</h3>
              <p className="text-xs text-zinc-500 font-medium">Esta ação não poderá ser desfeita.</p>
            </div>
          </div>

          <div className="bg-zinc-50 p-3.5 rounded-xl border border-zinc-200/80 space-y-2 text-xs">
            <div>
              <span className="text-zinc-400 font-bold uppercase text-[9px] block">Mês / Login</span>
              <p className="font-black text-zinc-800">{fcaParaExcluir.mes} — {fcaParaExcluir.login}</p>
            </div>
            <div>
              <span className="text-zinc-400 font-bold uppercase text-[9px] block">Município / Recurso</span>
              <p className="text-zinc-700 font-bold">{fcaParaExcluir.municipio} • {fcaParaExcluir.recurso}</p>
            </div>
            {fcaParaExcluir.fato && (
              <div>
                <span className="text-zinc-400 font-bold uppercase text-[9px] block">Fato</span>
                <p className="text-zinc-600 truncate">{fcaParaExcluir.fato}</p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => setFcaParaExcluir(null)}
              disabled={isExcluindo}
              className="px-4 py-2.5 text-xs font-black uppercase tracking-wider text-zinc-700 bg-zinc-100 hover:bg-zinc-200 rounded-xl transition-all"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => executarExclusaoFCA(fcaParaExcluir.id)}
              disabled={isExcluindo}
              className="px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white bg-claro hover:bg-claro-dark rounded-xl transition-all shadow flex items-center gap-2"
            >
              {isExcluindo ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
              {isExcluindo ? 'Excluindo...' : 'Sim, Excluir'}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Modal de Confirmação de Exclusão Diário */}
    {diarioParaExcluir && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
        <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-zinc-200 space-y-4 animate-in zoom-in-95 duration-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center text-red-600 shrink-0 border border-red-100">
              <Trash2 size={20} />
            </div>
            <div>
              <h3 className="text-base font-black text-zinc-900 leading-tight">Excluir Registro do Diário</h3>
              <p className="text-xs text-zinc-500 font-medium">Tem certeza que deseja remover este item?</p>
            </div>
          </div>

          <div className="bg-zinc-50 p-3.5 rounded-xl border border-zinc-200/80 space-y-1.5 text-xs">
            <div>
              <span className="text-zinc-400 font-bold uppercase text-[9px] block">Data / Chamado</span>
              <p className="font-black text-zinc-800">{formatarData(diarioParaExcluir.data)} — Chamado: {diarioParaExcluir.chamado}</p>
            </div>
            <div>
              <span className="text-zinc-400 font-bold uppercase text-[9px] block">Descrição</span>
              <p className="text-zinc-600 truncate">{diarioParaExcluir.descricao}</p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => setDiarioParaExcluir(null)}
              disabled={isExcluindo}
              className="px-4 py-2.5 text-xs font-black uppercase tracking-wider text-zinc-700 bg-zinc-100 hover:bg-zinc-200 rounded-xl transition-all"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => executarExclusaoDiario(diarioParaExcluir.id)}
              disabled={isExcluindo}
              className="px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white bg-claro hover:bg-claro-dark rounded-xl transition-all shadow flex items-center gap-2"
            >
              {isExcluindo ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
              {isExcluindo ? 'Excluindo...' : 'Sim, Excluir'}
            </button>
          </div>
        </div>
      </div>
    )}
      </div>
    </div>
  );
}
