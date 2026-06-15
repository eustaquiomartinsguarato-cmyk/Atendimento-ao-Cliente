import React from 'react';
import { QrCode, Wifi, WifiOff, RefreshCw, Smartphone } from 'lucide-react';
import { formatBrazilianPhone } from '../lib/phoneFormatter';

interface QrProps {
  status: { status: string; number: string; qrCodeUrl: string | null };
  onSync: () => Promise<any>;
  onDisconnect: () => Promise<any>;
}

export default function QrCodeWhatsApp({ status, onSync, onDisconnect }: QrProps) {
  const [loading, setLoading] = React.useState(false);

  const handleSyncClick = async () => {
    setLoading(true);
    await onSync();
    setLoading(false);
  };

  const handleDisconnectClick = async () => {
    setLoading(true);
    await onDisconnect();
    setLoading(false);
  };

  const isScanning = status.status === 'SCANNING_QR';
  const isConnected = status.status === 'CONNECTED';
  const isInitializing = status.status === 'INITIALIZING';

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b border-slate-50 dark:border-slate-800 pb-3">
        <div className="flex items-center space-x-2">
          <Smartphone className="w-4 h-4 text-emerald-500" />
          <h3 className="font-bold text-slate-800 dark:text-slate-100 text-xs uppercase tracking-wide">WhatsApp LS GUARATO</h3>
        </div>
        <div className="flex items-center space-x-1.5">
          <span className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : isScanning ? 'bg-amber-400 animate-ping' : isInitializing ? 'bg-indigo-400 animate-pulse' : 'bg-red-500'}`}></span>
          <span className="text-[10px] uppercase font-bold text-slate-450 dark:text-slate-400">
            {isConnected ? 'Sincronizado' : isScanning ? 'Aguardando Leitura' : isInitializing ? 'Iniciando...' : 'Desconectado'}
          </span>
        </div>
      </div>

      {isConnected ? (
        <div className="space-y-4 text-xs">
          <div className="bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 p-3.5 rounded-xl border border-emerald-100 dark:border-emerald-900/40 leading-relaxed font-medium">
            ✅ Seu número de WhatsApp {status.number ? formatBrazilianPhone(status.number) : ''} está ativamente integrado no painel do operador. Todas as mensagens recebidas serão roteadas e respondidas pelo robô.
          </div>
          <button
            onClick={handleDisconnectClick}
            disabled={loading}
            className="w-full bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/20 dark:hover:bg-rose-900/30 text-rose-600 dark:text-rose-400 font-bold py-2.5 rounded-xl border border-rose-100 dark:border-rose-900/30 transition disabled:opacity-50 cursor-pointer"
          >
            {loading ? 'Processando...' : 'Desconectar WhatsApp'}
          </button>
        </div>
      ) : isScanning ? (
        <div className="flex flex-col items-center justify-center p-4 text-center space-y-4">
          <p className="text-xs text-slate-500 max-w-xs leading-relaxed font-medium">
            Abra o WhatsApp em seu celular, selecione "Aparelhos Conectados" e escaneie o código QR abaixo para conectar:
          </p>
          {status.qrCodeUrl ? (
            <div className="space-y-3 flex flex-col items-center">
              <div className="border border-slate-150 dark:border-slate-800 p-2 bg-white rounded-xl shadow-inner">
                <img src={status.qrCodeUrl} alt="QR Code do WhatsApp" className="w-48 h-48 block" />
              </div>
            </div>
          ) : (
            <div className="w-48 h-48 bg-slate-50 dark:bg-slate-950 rounded-xl flex items-center justify-center border border-dashed border-slate-200">
              <RefreshCw className="w-6 h-6 text-slate-400 animate-spin" />
            </div>
          )}
          <span className="text-[9px] font-bold text-amber-500 uppercase tracking-widest animate-pulse">Sincronizando em tempo real com BAILEYS...</span>
          
          <button
            onClick={handleDisconnectClick}
            disabled={loading}
            className="w-full mt-2 bg-slate-50 hover:bg-slate-100 dark:bg-slate-950 dark:hover:bg-slate-900 text-slate-500 text-[10px] font-bold py-1.5 rounded-lg border border-slate-250 dark:border-slate-805 transition cursor-pointer"
          >
            Cancelar Sincronização
          </button>
        </div>
      ) : isInitializing ? (
        <div className="flex flex-col items-center justify-center p-4 text-center space-y-4">
          <div className="w-48 h-48 bg-slate-50 dark:bg-slate-950 rounded-xl flex flex-col items-center justify-center border border-dashed border-slate-200 dark:border-slate-800 space-y-3 shadow-inner">
            <RefreshCw className="w-7 h-7 text-indigo-500 animate-spin" />
            <span className="text-[9px] font-bold text-indigo-500 uppercase tracking-widest animate-pulse">Carregando...</span>
          </div>
          <p className="text-xs text-slate-500 max-w-xs leading-relaxed font-semibold">
            Iniciando o serviço do WhatsApp...
          </p>
          <span className="text-[9px] text-slate-400 dark:text-slate-500 font-medium leading-relaxed">
            Preparando credenciais e iniciando canais de rede Baileys. Isso pode levar de 5 a 15 segundos. Aguarde por favor.
          </span>
          <button
            onClick={handleDisconnectClick}
            disabled={loading}
            className="w-full mt-2 bg-slate-50 hover:bg-slate-100 dark:bg-slate-950 dark:hover:bg-slate-900 text-slate-500 text-[10px] font-bold py-1.5 rounded-lg border border-slate-250 dark:border-slate-805 transition cursor-pointer"
          >
            Cancelar Inicialização
          </button>
        </div>
      ) : (
        <div className="space-y-4 text-xs py-2">
          <div className="bg-slate-55 bg-slate-50 dark:bg-slate-950/40 p-3.5 rounded-xl text-slate-500 dark:text-slate-400 leading-relaxed">
            ⚠️ O painel está temporariamente offline por falta de sincronização. Clique no botão abaixo para gerar uma nova seção.
          </div>
          <button
            onClick={handleSyncClick}
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl transition flex items-center justify-center space-x-2 cursor-pointer shadow-sm"
          >
            <QrCode className="w-4 h-4" />
            <span>{loading ? 'Gerando QR...' : 'Sincronizar Celular'}</span>
          </button>
        </div>
      )}
    </div>
  );
}
