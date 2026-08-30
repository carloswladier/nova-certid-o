import { LucideIcon } from 'lucide-react';

export interface Registro {
  LGN_TEC?: string;
  RECURSO_UN?: string;
  JORNADA?: string;
  VALIDACAO?: string;
  MUNICIPIO?: string;
  DSC_MUNICIPIO_BI?: string;
  NR_CONTRATO?: string;
  TP_OS?: string;
  DT_EXECUCAO?: any;
  DIA?: any;
  MES?: string;
  OFDMA?: string;
  OBS_UP_PORTAS_FAIL?: string;
  OBS_DOWN_PORTAS_FAIL?: string;
  ID_PONTO?: string;
  Pontuacao?: number;
  Categoria?: string;
  COD_BAIXA?: string;
  DESC_NODE?: string;
  TIPO_PRODUTO?: string;
  GRUPO_BAIXA?: string;
  [key: string]: any;
}

export interface FCAEntry {
  id: string;
  mes: string;
  login: string;
  jornada: string;
  recurso: string;
  municipio: string;
  fato: string;
  causa: string;
  acao: string;
  responsavel?: string;
  data_acao?: string;
  status?: string;
  s1?: string;
  s2?: string;
  s3?: string;
  s4?: string;
  s5?: string;
  dataCriacao: string;
  data_ultima_alteracao?: string;
}

export interface DiarioBordoEntry {
  id: string;
  data: string;
  chamado: string;
  descricao: string;
  status: string;
  dataConclusao?: string;
  dataCriacao: string;
  login?: string;
  recurso?: string;
  data_ultima_alteracao?: string;
}

export interface UserProfile {
  id: string;
  username: string;
  role: 'admin' | 'editor' | 'user';
  password_plain?: string;
  empresas?: string[] | string;
}

export interface CategoriaConfig {
  nome: string;
  limite: number;
  cor: string;
  icone: LucideIcon;
}
