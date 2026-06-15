import React from 'react';
import { Conversation, Message, Sector } from '../types/index.js';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell } from 'recharts';
import { TrendingUp, Users, MessageSquare, Clock, BarChart3, PieChartIcon } from 'lucide-react';

interface ReportsProps {
  conversations: Conversation[];
  sectors: Sector[];
  messages: Message[];
}

export default function ReportsPage({ conversations, sectors }: ReportsProps) {
  // 1. Calculate general metric counts
  const totalChats = conversations.length;
  const activeChats = conversations.filter(c => c.status === 'active').length;
  const waitingChats = conversations.filter(c => c.status === 'waiting').length;
  const botChats = conversations.filter(c => c.status === 'chatbot').length;
  const closedChats = conversations.filter(c => c.status === 'closed').length;

  // 2. Data by Sector
  const sectorData = sectors.map(sec => {
    const chatsInSec = conversations.filter(c => c.sector_id === sec.id);
    return {
      name: sec.name.toUpperCase(),
      atendimentos: chatsInSec.length,
      ativos: chatsInSec.filter(c => c.status === 'active').length,
      fila: chatsInSec.filter(c => c.status === 'waiting').length,
    };
  });

  // 3. Data Traffic by hour simulation
  const hourlyData = [
    { hour: '08:00', chats: 5 },
    { hour: '10:00', chats: 12 },
    { hour: '12:00', chats: 8 },
    { hour: '14:00', chats: 15 },
    { hour: '16:00', chats: 19 },
    { hour: '18:00', chats: 7 },
  ];

  // 4. Pie data status distribution
  const statusDistribution = [
    { name: 'Robô / Chatbot', value: botChats, color: '#6366f1' },
    { name: 'Fila de Espera', value: waitingChats, color: '#f59e0b' },
    { name: 'Em Atendimento', value: activeChats, color: '#10b981' },
    { name: 'Encerrados', value: closedChats, color: '#64748b' }
  ].filter(item => item.value > 0);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="border-b border-slate-100 dark:border-slate-800 pb-4">
        <h2 className="font-extrabold text-slate-800 dark:text-slate-100 text-lg flex items-center space-x-2">
          <BarChart3 className="w-5 h-5 text-indigo-500" />
          <span>Dashboard Geral de Métricas & Desempenho</span>
        </h2>
        <p className="text-xs text-slate-400 mt-1 leading-relaxed">Avalie o tempo médio de fila, gargalos de atendimento por setor, engajamento do chatbot e conversões.</p>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] text-slate-400 space-x-1 font-bold uppercase tracking-wider block">Total de Contatos</span>
            <span className="text-2xl font-extrabold text-slate-800 dark:text-slate-50">{totalChats}</span>
          </div>
          <div className="p-3 bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 rounded-xl">
            <MessageSquare className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] text-slate-450 space-x-1 font-bold uppercase tracking-wider block">Atendimentos Ativos</span>
            <span className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">{activeChats}</span>
          </div>
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-xl">
            <Users className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] text-slate-450 space-x-1 font-bold uppercase tracking-wider block">Aguardando Fila</span>
            <span className="text-2xl font-extrabold text-amber-500 dark:text-amber-400">{waitingChats}</span>
          </div>
          <div className="p-3 bg-amber-50 dark:bg-amber-950/40 text-amber-500 dark:text-amber-400 rounded-xl">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] text-slate-450 space-x-1 font-bold uppercase tracking-wider block">Encerrados hoje</span>
            <span className="text-2xl font-extrabold text-slate-500">{closedChats}</span>
          </div>
          <div className="p-3 bg-slate-50 dark:bg-slate-800 text-slate-500 rounded-xl">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Charts section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Sector Bar Chart */}
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
          <h3 className="font-bold text-slate-800 dark:text-slate-100 text-xs uppercase tracking-wider mb-4">Volume de Atendimentos por Setor</h3>
          <div className="h-64 text-slate-800">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sectorData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} />
                <Tooltip contentStyle={{ fontSize: '11px', borderRadius: '12px' }} />
                <Bar dataKey="atendimentos" name="Total de Conversas" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                <Bar dataKey="ativos" name="Em Andamento" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Traffic Area Chart */}
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
          <h3 className="font-bold text-slate-800 dark:text-slate-100 text-xs uppercase tracking-wider mb-4">Tráfego de Entrada Recente (Contatos por Hora)</h3>
          <div className="h-64 text-slate-800">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={hourlyData}>
                <defs>
                  <linearGradient id="colorChats" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="hour" stroke="#94a3b8" fontSize={10} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} />
                <Tooltip contentStyle={{ fontSize: '11px', borderRadius: '12px' }} />
                <Area type="monotone" dataKey="chats" name="Mensagens" stroke="#6366f1" fillOpacity={1} fill="url(#colorChats)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Status distribution Pie chart */}
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-6 shadow-sm md:col-span-2 flex flex-col md:flex-row items-center gap-6">
          <div className="flex-1 space-y-4">
            <h3 className="font-bold text-slate-800 dark:text-slate-100 text-xs uppercase tracking-wider flex items-center space-x-2">
              <PieChartIcon className="w-4 h-4 text-indigo-500" />
              <span>Distribuição de Conversas por Estado Ativo</span>
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed leading-normal">Veja como estão divididos os contatos do seu painel neste momento: entre atendimentos do robô inicial, fila de espera pendente, atendimentos com o operador humano ou contatos encerrados.</p>
            
            <div className="grid grid-cols-2 gap-3 text-xs">
              {statusDistribution.map(item => (
                <div key={item.name} className="flex items-center space-x-2">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }}></span>
                  <span className="font-semibold text-slate-700 dark:text-slate-350">{item.name}: <span className="font-extrabold text-slate-900 dark:text-slate-100">{item.value}</span></span>
                </div>
              ))}
            </div>
          </div>

          <div className="w-56 h-56 flex-shrink-0 relative">
            {statusDistribution.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-slate-400">Sem dados estatísticos</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusDistribution}
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {statusDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            )}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">{totalChats}</span>
              <span className="text-[9px] uppercase font-bold tracking-widest text-slate-400">Total</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
