import React from 'react';
import { AuditLog } from '../types/index.js';
import { Shield, Clock, Terminal, User, Search } from 'lucide-react';

interface AuditProps {
  logs: AuditLog[];
}

export default function AuditLogs({ logs }: AuditProps) {
  const [searchQuery, setSearchQuery] = React.useState('');

  const filteredLogs = searchQuery.trim() === ''
    ? logs
    : logs.filter(l => 
        l.user_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        l.action.toLowerCase().includes(searchQuery.toLowerCase()) || 
        l.target.toLowerCase().includes(searchQuery.toLowerCase())
      );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="border-b border-slate-100 dark:border-slate-800 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="font-extrabold text-slate-800 dark:text-slate-100 text-lg flex items-center space-x-2">
            <Terminal className="w-5 h-5 text-indigo-500" />
            <span>Trilha de Auditoria Operacional (Logs)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">Registro imutável e transparente de ações, transferências, conexões de WhatsApp e faturas emitidas.</p>
        </div>

        {/* Search Input */}
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Filtrar logs..."
            className="border border-slate-200 dark:border-slate-800 dark:bg-slate-900 rounded-xl pl-9 pr-4 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500 w-full sm:w-56"
          />
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
        </div>
      </div>

      {/* Logs Table / List */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="divide-y divide-slate-50 dark:divide-slate-800 max-h-[500px] overflow-y-auto">
          {filteredLogs.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              Nenhum registro de auditoria localizado para o filtro inserido.
            </div>
          ) : (
            filteredLogs.map(log => {
              // Action custom visual tag colors
              let badgeColor = "bg-slate-50 text-slate-500";
              if (log.action.includes("CRIAR") || log.action.includes("CONEXAO")) {
                badgeColor = "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400";
              } else if (log.action.includes("EXCLUIR")) {
                badgeColor = "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400";
              } else if (log.action.includes("TRANSFERIR") || log.action.includes("ASSUMIR")) {
                badgeColor = "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400";
              } else if (log.action.includes("MOVER")) {
                badgeColor = "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400";
              }

              return (
                <div key={log.id} className="p-4 flex items-start space-x-3.5 hover:bg-slate-50/40 dark:hover:bg-slate-800/30 transition text-xs leading-relaxed">
                  <div className="p-2 bg-slate-50 dark:bg-slate-950 rounded-lg text-slate-400 flex-shrink-0 mt-0.5">
                    <Clock className="w-4 h-4" />
                  </div>

                  <div className="flex-1 space-y-1 block select-text">
                    <div className="flex flex-wrap items-center gap-1.5 leading-none">
                      <span className="font-bold text-slate-750 dark:text-slate-250 flex items-center space-x-1">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        <span>{log.user_name}</span>
                      </span>
                      <span className="text-[10px] text-slate-400">({log.user_email})</span>
                      <span className="text-[10px] text-slate-300">•</span>
                      <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded ${badgeColor}`}>
                        {log.action}
                      </span>
                    </div>

                    <div className="text-slate-600 dark:text-slate-300 leading-normal">{log.target}</div>

                    <div className="text-[9px] font-mono text-slate-400">
                      {new Date(log.timestamp).toLocaleString('pt-BR')}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
