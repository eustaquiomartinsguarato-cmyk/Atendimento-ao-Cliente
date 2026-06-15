import React from 'react';
import { Conversation, Sector, User } from '../types/index.js';
import { MessageSquare, Users, UserCheck, Shield, HelpCircle, Activity, LayoutGrid, ArrowRight } from 'lucide-react';

interface DashboardMainProps {
  conversations: Conversation[];
  sectors: Sector[];
  users: User[];
  activeAgent: User;
  whatsAppStatus?: { status: string; number: string; qrCodeUrl: string | null };
  onSetTab: (tab: string) => void;
}

export default function DashboardMain({
  conversations,
  sectors,
  users,
  activeAgent,
  whatsAppStatus,
  onSetTab
}: DashboardMainProps) {
  // Filter conversations for statistics based on routing access permissions
  const visibleConversations = conversations.filter(c => {
    if (activeAgent.role === 'admin' || activeAgent.role === 'access_total') return true;
    return c.attendant_id === activeAgent.id;
  });

  const totalConversations = visibleConversations.length;
  const waitingCount = visibleConversations.filter(c => c.status === 'waiting').length;
  const activeCount = visibleConversations.filter(c => c.status === 'active').length;
  const chatbotCount = visibleConversations.filter(c => c.status === 'chatbot').length;

  const getStatusColor = () => {
    switch (whatsAppStatus?.status) {
      case 'CONNECTED': return 'bg-emerald-500';
      case 'SCANNING_QR': return 'bg-amber-500';
      case 'INITIALIZING': return 'bg-blue-500';
      default: return 'bg-rose-500';
    }
  };

  const getStatusText = () => {
    switch (whatsAppStatus?.status) {
      case 'CONNECTED': return 'WhatsApp Conectado';
      case 'SCANNING_QR': return 'Aguardando QR Code';
      case 'INITIALIZING': return 'Iniciando WhatsApp...';
      default: return 'WhatsApp Desconectado';
    }
  };

  return (
    <div className="space-y-6">
      {/* Visual greeting card banner */}
      <div className="bg-gradient-to-r from-brand-sidebar to-slate-900 dark:from-slate-900 dark:to-slate-950 p-6 rounded-3xl text-white shadow-md flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] bg-white/10 text-white font-extrabold px-3 py-1 rounded-full uppercase tracking-widest border border-white/20">ÁREA DE COMANDO GERAL</span>
            <div className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tight text-white ${getStatusColor()} animate-pulse`}>
              <div className="w-1.5 h-1.5 rounded-full bg-white animate-ping"></div>
              <span>{getStatusText()}</span>
            </div>
          </div>
          <h2 className="text-xl font-extrabold tracking-tight text-white">Seja bem-vindo, {activeAgent.name}!</h2>
          <p className="text-xs text-slate-300 max-w-lg leading-relaxed leading-normal">Seu painel de controle operacional centralizado para o roteamento, monitoramento de robôs inteligentes e atendimento de balcão da corporação.</p>
        </div>
        <div className="flex gap-4">
          <div className="p-3.5 bg-white/5 rounded-2xl border border-white/10 text-center flex-1 md:flex-none">
            <div className="text-[10px] text-slate-300 uppercase font-bold tracking-wider mb-0.5 select-none leading-none">Minha Fila</div>
            <div className="text-lg font-black text-brand-sidebar">{conversations.filter(c => c.attendant_id === activeAgent.id).length}</div>
          </div>
          <div className="p-3.5 bg-white/5 rounded-2xl border border-white/10 text-center flex-1 md:flex-none">
            <div className="text-[10px] text-slate-300 uppercase font-bold tracking-wider mb-0.5 select-none leading-none">Aguardando</div>
            <div className="text-lg font-black text-amber-300">{waitingCount}</div>
          </div>
        </div>
      </div>

      {/* Grid boxes layouts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Main stats layout */}
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
          <h3 className="font-bold text-brand-title dark:text-brand-title text-xs uppercase tracking-wider flex items-center space-x-2">
            <Activity className="w-4 h-4 text-brand-sidebar" />
            <span>Resumo Operacional</span>
          </h3>
          
          <div className="space-y-2.5">
            <div className="flex items-center justify-between border-b border-slate-50 dark:border-slate-800 pb-2">
              <span className="text-xs font-medium text-slate-500">Autoatendimento (Robô)</span>
              <span className="text-xs font-extrabold text-slate-800 dark:text-slate-100">{chatbotCount}</span>
            </div>
            <div className="flex items-center justify-between border-b border-slate-50 dark:border-slate-800 pb-2">
              <span className="text-xs font-medium text-slate-500">Aguardando Operador</span>
              <span className="text-xs font-extrabold text-amber-500">{waitingCount}</span>
            </div>
            <div className="flex items-center justify-between border-b border-slate-50 dark:border-slate-800 pb-2">
              <span className="text-xs font-medium text-slate-500">Chats com Operadores</span>
              <span className="text-xs font-extrabold text-emerald-500">{activeCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Total de Atendimentos ativos</span>
              <span className="text-xs font-black text-slate-800 dark:text-slate-100">{totalConversations}</span>
            </div>
          </div>
        </div>

        {/* Shortcuts card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
          <h3 className="font-bold text-brand-title dark:text-brand-title text-xs uppercase tracking-wider flex items-center space-x-2">
            <LayoutGrid className="w-4 h-4 text-brand-sidebar" />
            <span>Atalhos Rápidos</span>
          </h3>
          
          <div className="grid grid-cols-2 gap-2 text-xs">
            <button
               onClick={() => onSetTab('chat')}
              className="p-3 bg-slate-50 hover:bg-brand-primary/10 dark:bg-slate-950 dark:hover:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl font-bold flex flex-col items-center justify-center gap-1.5 transition text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              <MessageSquare className="w-4 h-4 text-brand-sidebar" />
              <span>Painel Chat</span>
            </button>
            <button
              onClick={() => onSetTab('settings')}
              className="p-3 bg-slate-50 hover:bg-slate-100 dark:bg-slate-950 dark:hover:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl font-bold flex flex-col items-center justify-center gap-1.5 transition text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              <Shield className="w-4 h-4 text-slate-600 dark:text-slate-400" />
              <span>Configurações</span>
            </button>
            <button
              onClick={() => onSetTab('users')}
              className="p-3 bg-slate-50 hover:bg-slate-100 dark:bg-slate-950 dark:hover:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl font-bold flex flex-col items-center justify-center gap-1.5 transition text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              <Users className="w-4 h-4 text-slate-600 dark:text-slate-400" />
              <span>Funcionários</span>
            </button>
            <button
              onClick={() => onSetTab('reports')}
              className="p-3 bg-slate-50 hover:bg-slate-100 dark:bg-slate-950 dark:hover:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl font-bold flex flex-col items-center justify-center gap-1.5 transition text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              <Activity className="w-4 h-4 text-slate-600 dark:text-slate-400" />
              <span>Métricas</span>
            </button>
          </div>
        </div>

        {/* System parameters checklist */}
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
          <div className="space-y-3">
            <h3 className="font-bold text-brand-title dark:text-brand-title text-xs uppercase tracking-wider flex items-center space-x-1.5">
              <span>Distribuição Organizacional</span>
            </h3>
            <p className="text-slate-400 text-[11px] leading-relaxed leading-normal select-none">Mecanismo de triagem automática: os clientes respondem ao menu, escolhem setores vinculados e o sistema os distribui de forma inteligente aos atendentes disponíveis.</p>
          </div>

          <button
            onClick={() => onSetTab('sectors')}
            className="w-full bg-slate-50 hover:bg-slate-100 border border-slate-100 dark:bg-slate-950 dark:border-slate-800 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-200 font-extrabold text-[11px] uppercase tracking-wider py-2.5 rounded-xl flex items-center justify-center space-x-1 transition mt-4 cursor-pointer"
          >
            <span>Ver Setores Cadastrados ({sectors.length})</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

      </div>
    </div>
  );
}
