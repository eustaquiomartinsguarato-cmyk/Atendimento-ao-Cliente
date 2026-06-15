import React, { useState } from 'react';
import { Sector } from '../types/index.js';
import { Briefcase, Trash2, Plus, AlertCircle, CheckCircle, Pencil, X } from 'lucide-react';

interface SectorsProps {
  sectors: Sector[];
  onCreateSector: (name: string, description: string) => Promise<any>;
  onDeleteSector: (id: string) => Promise<any>;
  onUpdateSector: (id: string, name: string, description: string, status?: 'ativo' | 'inativo') => Promise<any>;
}

export default function SectorsPage({ 
  sectors, 
  onCreateSector, 
  onDeleteSector,
  onUpdateSector
}: SectorsProps) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  
  // Custom states for editing & safe delete confirmation in iframe
  const [editingSectorId, setEditingSectorId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    try {
      if (editingSectorId) {
        await onUpdateSector(editingSectorId, name, desc);
        setEditingSectorId(null);
      } else {
        const result = await onCreateSector(name, desc);
        if (result?.error) {
          alert(`ERRO AO CADASTRAR: ${result.error}\n\nDETALHES: ${result.detail || 'Procure o suporte técnico.'}`);
          setLoading(false);
          return;
        }
      }
      setName('');
      setDesc('');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e: any) {
      console.error(e);
      alert("Erro ao salvar setor. Verifique a conexão com o servidor.");
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = (sec: Sector) => {
    setEditingSectorId(sec.id);
    setName(sec.name);
    setDesc(sec.description);
    setConfirmDeleteId(null);
  };

  const handleCancelEdit = () => {
    setEditingSectorId(null);
    setName('');
    setDesc('');
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="border-b border-slate-100 dark:border-slate-800 pb-4">
        <h2 className="font-extrabold text-slate-800 dark:text-slate-100 text-lg">Mapeamento de Setores (Fila de Roteamento)</h2>
        <p className="text-xs text-slate-400 mt-1 leading-relaxed">Defina os departamentos estruturais da empresa para o autoatendimento rotear os clientes de forma eficiente.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form to insert/edit sector */}
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4 h-fit">
          <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center justify-between border-b border-slate-50 dark:border-slate-800 pb-3">
            <span className="flex items-center space-x-2">
              <Plus className="w-4 h-4 text-indigo-500" />
              <span>{editingSectorId ? 'Editar Setor' : 'Cadastrar Novo Setor'}</span>
            </span>
            {editingSectorId && (
              <button 
                onClick={handleCancelEdit}
                className="text-slate-400 hover:text-rose-500 transition text-[11px] font-bold flex items-center space-x-1 border border-slate-200 dark:border-slate-700 px-2 py-1 rounded-lg"
              >
                <X className="w-3.5 h-3.5" />
                <span>Cancelar</span>
              </button>
            )}
          </h3>

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            {success && (
              <div className="bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 p-3 rounded-xl flex items-center space-x-2 border border-emerald-100 dark:border-emerald-900/30">
                <CheckCircle className="w-4 h-4 flex-shrink-0" />
                <span>Setor salvo com sucesso!</span>
              </div>
            )}

            <div className="space-y-1">
              <label className="font-bold text-slate-450 dark:text-slate-400 uppercase tracking-wider block">Nome do Setor</label>
              <input 
                type="text" required value={name} onChange={e => setName(e.target.value)}
                placeholder="Ex: RH, Cobrança, SAC, Vendas"
                className="w-full border border-slate-200 dark:border-slate-800 dark:bg-slate-950 rounded-xl px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500 font-sans"
              />
            </div>

            <div className="space-y-1">
              <label className="font-bold text-slate-450 dark:text-slate-400 uppercase tracking-wider block">Descrição do Setor</label>
              <textarea 
                value={desc} onChange={e => setDesc(e.target.value)}
                placeholder="Ex: Recrutamento e Seleção de profissionais"
                className="w-full border border-slate-200 dark:border-slate-800 dark:bg-slate-950 rounded-xl px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500 leading-relaxed min-h-24 font-sans"
              />
            </div>

            <button
              type="submit" disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold py-2.5 rounded-xl transition cursor-pointer shadow-sm text-sm"
            >
              {loading ? 'Salvando...' : editingSectorId ? 'Atualizar Setor' : 'Adicionar Setor'}
            </button>
          </form>
        </div>

        {/* List of existing sectors */}
        <div className="lg:col-span-2 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sectors.length === 0 ? (
              <div className="bg-slate-50 dark:bg-slate-900/40 p-8 rounded-2xl border border-slate-100 dark:border-slate-800 col-span-2 text-center text-slate-400 text-xs">
                Nenhum setor cadastrado até o momento.
              </div>
            ) : (
              sectors.map(sec => {
                const isConfirmingDelete = confirmDeleteId === sec.id;
                return (
                  <div key={sec.id} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 shadow-sm hover:border-slate-200 transition flex justify-between items-start gap-3">
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center space-x-2">
                        <div className="p-2 bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 rounded-lg">
                          <Briefcase className="w-4 h-4" />
                        </div>
                        <span className="font-bold text-slate-800 dark:text-slate-100 text-sm block leading-tight">{sec.name}</span>
                      </div>
                      <p className="text-xs text-slate-450 dark:text-slate-400 leading-normal line-clamp-2 pr-1">{sec.description || "Sem descrição registrada."}</p>
                      <div className="flex items-center space-x-2 pt-1 font-sans">
                        <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${
                          sec.status === 'inativo'
                            ? 'text-slate-500 bg-slate-100 dark:bg-slate-800'
                            : 'text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/40'
                        }`}>
                          {sec.status === 'inativo' ? 'Inativo' : 'Ativo (Bot)'}
                        </span>
                        
                        <button
                          type="button"
                          onClick={async () => {
                            const nextStatus = sec.status === 'inativo' ? 'ativo' : 'inativo';
                            await onUpdateSector(sec.id, sec.name, sec.description, nextStatus);
                          }}
                          title={sec.status === 'inativo' ? "Habilitar setor no chatbot" : "Desabilitar setor no chatbot"}
                          className={`w-8 h-4 rounded-full p-0.5 transition-colors duration-200 focus:outline-none cursor-pointer inline-flex items-center ${
                            sec.status === 'inativo' ? 'bg-slate-200 dark:bg-slate-700' : 'bg-emerald-600'
                          }`}
                        >
                          <div className={`bg-white w-3 h-3 rounded-full shadow-md transform duration-200 ${
                            sec.status === 'inativo' ? 'translate-x-0' : 'translate-x-4'
                          }`} />
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1.5 min-w-20">
                      <div className="flex items-center space-x-1">
                        <button
                          onClick={() => handleEditClick(sec)}
                          title="Editar Setor"
                          className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-400 hover:text-indigo-600 transition cursor-pointer"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        
                        <button
                          onClick={async () => {
                            if (isConfirmingDelete) {
                              await onDeleteSector(sec.id);
                              setConfirmDeleteId(null);
                            } else {
                              setConfirmDeleteId(sec.id);
                              setTimeout(() => setConfirmDeleteId(null), 4000);
                            }
                          }}
                          className={`p-1.5 rounded-xl transition cursor-pointer ${
                            isConfirmingDelete 
                              ? 'bg-rose-50 text-rose-600 animate-pulse' 
                              : 'hover:bg-rose-50 dark:hover:bg-rose-950/35 text-slate-400 hover:text-rose-500'
                          }`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      {isConfirmingDelete && (
                        <span className="text-[9px] font-bold text-rose-500 text-right animate-pulse max-w-24 leading-tight">
                          Clique de novo para confirmar
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
