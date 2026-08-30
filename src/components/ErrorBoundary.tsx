import React, { ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-6 font-sans">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border border-zinc-100">
            <div className="h-2 bg-claro w-full" />
            <div className="p-10 text-center">
              <div className="h-20 w-20 bg-red-50 text-claro rounded-3xl flex items-center justify-center mb-6 mx-auto shadow-lg shadow-red-100">
                <AlertCircle size={40} />
              </div>
              <h1 className="text-2xl font-black tracking-tighter text-zinc-900 uppercase mb-2">Ops! Algo deu errado</h1>
              <p className="text-sm font-bold text-zinc-500 mb-8">
                Ocorreu um erro inesperado na aplicação. Tente recarregar a página ou voltar para o início.
              </p>
              
              {this.state.error && (
                <div className="bg-zinc-50 rounded-xl p-4 mb-8 text-left overflow-auto max-h-32">
                  <p className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest mb-1">Detalhes do Erro:</p>
                  <p className="text-xs font-mono text-red-600 break-all">{this.state.error.message}</p>
                </div>
              )}

              <div className="flex flex-col gap-3">
                <button 
                  onClick={() => window.location.reload()}
                  className="w-full bg-claro text-white py-4 rounded-2xl font-black uppercase tracking-widest hover:bg-claro-dark transition-all shadow-xl shadow-red-200 flex items-center justify-center gap-3"
                >
                  <RefreshCw size={18} />
                  Recarregar Página
                </button>
                <button 
                  onClick={() => window.location.href = '/'}
                  className="w-full bg-zinc-100 text-zinc-600 py-4 rounded-2xl font-black uppercase tracking-widest hover:bg-zinc-200 transition-all flex items-center justify-center gap-3"
                >
                  <Home size={18} />
                  Voltar ao Início
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
