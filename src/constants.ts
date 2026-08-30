import { AlertTriangle, AlertCircle, CheckCircle } from 'lucide-react';

export const CATEGORIAS = {
  CRITICO: { nome: 'Crítico', limite: 25, cor: '#EE2924', icone: AlertTriangle },
  ATENCAO: { nome: 'Atenção', limite: 50, cor: '#f59e0b', icone: AlertCircle },
  EXCELENTE: { nome: 'Excelente', limite: 100, cor: '#333333', icone: CheckCircle },
};

export const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

export const EMPRESA_MAPPING: Record<string, string[]> = {
  'AFLINE': [
    'SLS-AFLINE_02_VT', 'SLS-AFLINE_02', 'MAN-AFLINE_01_VT', 'BLM-AFLINE_03_VT', 
    'BLM-AFLINE_02_VT', 'CXS-AFLINE', 'ITZ-AFLINE', 'MBA-AFLINE', 'TMN-AFLINE', 'BLM-AFLINE',
    'MAN-AFLINE'
  ],
  'VIA': [
    'AIU-VIA', 'AIU-VIA_VT', 'BLM-VIA', 'BLM-VIA_01_VT', 'BLM-VIA_02_VT', 
    'BLM-VIA_04_VT', 'BLM-VIA_04-VT', 'CAH-VIA', 'PGN-VIA'
  ],
  'ENGETEC': [
    'MAN-ENGETEC', 'MAN-ENGETEC_03_VT', 'MPA-ENGETEC', 'SQA_ENGETEC', 'SQA-ENGETEC'
  ],
  'TILOG': [
    'MAN-TILOG', 'PUP-TILOG'
  ],
  'SEVEN': [
    'SLS-SEVEN'
  ],
  'HUSERVICOS': [
    'BLM-HUSERVICOS', 'MAN-HUSERVICOS'
  ],
  'CLARO': [
    'BLM-TIME01', 'MAN-TIME02', 'SLS-TIME01'
  ]
};

export const TODAS_AS_EMPRESAS = Object.keys(EMPRESA_MAPPING).sort();

export const parseEmpresasProfile = (empresas: any): string[] => {
  if (!empresas) return [];
  if (Array.isArray(empresas)) return empresas;
  if (typeof empresas === 'string') {
    try {
      const parsed = JSON.parse(empresas);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Not JSON string
    }
    return empresas.split(',').map(s => s.trim()).filter(Boolean);
  }
  return [];
};

export const RESTRICOES_RECURSOS: Record<string, string[]> = {
  'afline': EMPRESA_MAPPING['AFLINE'],
  'via': EMPRESA_MAPPING['VIA'],
  'engetec': EMPRESA_MAPPING['ENGETEC'],
  'huservicos': EMPRESA_MAPPING['HUSERVICOS'],
  'tilog': EMPRESA_MAPPING['TILOG'],
  'seven': EMPRESA_MAPPING['SEVEN'],
  'claro': EMPRESA_MAPPING['CLARO']
};

export const formatarLoginParaEmail = (login: string) => {
  const cleanLogin = login.toLowerCase().trim();
  if (cleanLogin.includes('@')) return cleanLogin;
  // Mantém apenas letras, números e alguns caracteres especiais permitidos em e-mails
  const sanitized = cleanLogin.replace(/[^a-z0-9._-]/g, '');
  return `${sanitized}@atendimento.com.br`;
};
