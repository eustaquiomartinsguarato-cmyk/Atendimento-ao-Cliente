import React, { useState } from 'react';
import { User, Sector } from '../types/index.js';
import { UserPlus, Trash2, Shield, User as UserIcon, CheckCircle, Plus, Pencil, X } from 'lucide-react';

interface UsersProps {
  users: User[];
  sectors: Sector[];
  onCreateUser: (data: any) => Promise<any>;
  onDeleteUser: (id: string) => Promise<any>;
  onUpdateUser: (id: string, data: any) => Promise<any>;
}

const ILLUSTRATION_EMOJIS = [
  '👩‍💻', '👨‍💻', '👩‍💼', '👨‍💼', '🧑‍💻', '🙋‍♀️', '🙋‍♂️', '🧑‍💼', 
  '😊', '⚡', '🚀', '🛠️', '💼', '客服', '👩‍🔧', '👨‍🔧'
];

export default function UsersPage({ 
  users, 
  sectors, 
  onCreateUser, 
  onDeleteUser,
  onUpdateUser
}: UsersProps) {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'admin' | 'access_total' | 'atendimento'>('atendimento');
  const [sectorId, setSectorId] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState('👩‍💻');
  
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // Editing and dynamic confirmation state for iframe safety
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !username.trim()) return;

    setLoading(true);
    try {
      const payload = {
        name,
        username,
        password,
        email,
        phone,
        role,
        sector_id: sectorId || null,
        photo: selectedEmoji
      };

      if (editingUserId) {
        await onUpdateUser(editingUserId, payload);
        setEditingUserId(null);
      } else {
        const res = await onCreateUser(payload);
        if (res?.error) {
          alert(`ERRO: ${res.error}\n\nDETALHES: ${res.detail || 'Nenhum detalhe disponível.'}`);
          return;
        }
      }

      setName('');
      setUsername('');
      setPassword('');
      setEmail('');
      setPhone('');
      setSectorId('');
      setSelectedEmoji('👩‍💻');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e: any) {
      console.error(e);
      alert("Erro ao salvar cadastro.");
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = (u: User) => {
    setEditingUserId(u.id);
    setName(u.name);
    setUsername(u.username || '');
    setPassword(u.password || '');
    setEmail(u.email);
    setPhone(u.phone || '');
    setRole(u.role);
    setSectorId(u.sector_id || '');
    setSelectedEmoji(!u.photo || u.photo.startsWith('http') ? '👩‍💻' : u.photo);
    setConfirmDeleteId(null);
  };

  const handleCancelEdit = () => {
    setEditingUserId(null);
    setName('');
    setUsername('');
    setPassword('');
    setEmail('');
    setPhone('');
    setSectorId('');
    setSelectedEmoji('👩‍💻');
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="border-b border-slate-100 dark:border-slate-800 pb-4">
        <h2 className="font-extrabold text-slate-800 dark:text-slate-100 text-lg">Central de Atendentes & Operadores</h2>
        <p className="text-xs text-slate-400 mt-1 leading-relaxed">Gerencie as contas de quem operará o painel e vincule cada atendente aos seus respectivos setores de atendimento.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form to insert/edit operator */}
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4 h-fit">
          <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center justify-between border-b border-slate-50 dark:border-slate-800 pb-3">
            <span className="flex items-center space-x-2">
              <Plus className="w-4 h-4 text-indigo-500" />
              <span>{editingUserId ? 'Editar Operador' : 'Cadastrar Operador Humano'}</span>
            </span>
            {editingUserId && (
              <button 
                onClick={handleCancelEdit}
                className="text-slate-450 hover:text-rose-500 transition text-[11px] font-bold flex items-center space-x-1 border border-slate-205 px-2.5 py-1 rounded-xl"
              >
                <X className="w-3.5 h-3.5" />
                <span>Cancelar</span>
              </button>
            )}
          </h3>

          <form onSubmit={handleSubmit} className="space-y-4 text-xs font-sans">
            {success && (
              <div className="bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 p-3 rounded-xl flex items-center space-x-2 border border-emerald-100 dark:border-emerald-900/30">
                <CheckCircle className="w-4 h-4 flex-shrink-0" />
                <span>Cadastro salvo com sucesso!</span>
              </div>
            )}

            <div className="space-y-1">
              <label className="font-bold text-slate-450 dark:text-slate-400 uppercase tracking-wider block">Nome do Operador</label>
              <input 
                type="text" required value={name} onChange={e => setName(e.target.value)}
                placeholder="Ex: João da Silva"
                className="w-full border border-slate-200 dark:border-slate-800 dark:bg-slate-950 rounded-xl px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="font-bold text-slate-450 dark:text-slate-400 uppercase tracking-wider block">Usuário de Acesso</label>
                <input 
                  type="text" required value={username} onChange={e => setUsername(e.target.value)}
                  placeholder="joao.silva"
                  className="w-full border border-slate-200 dark:border-slate-800 dark:bg-slate-950 rounded-xl px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="space-y-1">
                <label className="font-bold text-slate-450 dark:text-slate-400 uppercase tracking-wider block">Senha</label>
                <input 
                  type="password" required value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="****"
                  className="w-full border border-slate-200 dark:border-slate-800 dark:bg-slate-950 rounded-xl px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-bold text-slate-450 dark:text-slate-400 uppercase tracking-wider block">E-mail Profissional</label>
              <input 
                type="email" required value={email} onChange={e => setEmail(e.target.value)}
                placeholder="Ex: joao.silva@guarato.com.br"
                className="w-full border border-slate-200 dark:border-slate-800 dark:bg-slate-950 rounded-xl px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="space-y-1">
              <label className="font-bold text-slate-450 dark:text-slate-400 uppercase tracking-wider block">Telefone / Ramal</label>
              <input 
                type="text" value={phone} onChange={e => setPhone(e.target.value)}
                placeholder="Ex: (34) 99999-3333"
                className="w-full border border-slate-200 dark:border-slate-800 dark:bg-slate-950 rounded-xl px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="space-y-1">
              <label className="font-bold text-slate-450 dark:text-slate-400 uppercase tracking-wider block">Nível de Acesso (Cargo)</label>
              <select 
                value={role} onChange={e => setRole(e.target.value as any)}
                className="w-full border border-slate-200 dark:border-slate-800 dark:bg-slate-950 rounded-xl px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none"
              >
                <option value="atendimento">Operador Comum (Apenas seu setor)</option>
                <option value="access_total">Operador Total (Acessa outros setores)</option>
                <option value="admin">Administrador Geral</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="font-bold text-slate-450 dark:text-slate-400 uppercase tracking-wider block">Setor Principal / Departamento</label>
              <select 
                value={sectorId} onChange={e => setSectorId(e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-800 dark:bg-slate-950 rounded-xl px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none"
              >
                <option value="">-- Sem Setor Vinculado --</option>
                {sectors.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              {sectors.length === 0 && (
                <p className="text-[10px] text-amber-500 font-bold mt-1">⚠️ Nenhum setor cadastrado. Vá em "Configurar Setores" primeiro.</p>
              )}
            </div>

            {/* ILLUSTRATIVE EMOJI SELECTOR */}
            <div className="space-y-2 pt-2 border-t border-slate-50 dark:border-slate-800">
              <label className="font-bold text-slate-450 dark:text-slate-400 uppercase tracking-wider block">Selecione o Emoji Ilustrativo (Avatar)</label>
              <div className="grid grid-cols-6 gap-1.5 p-2 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-100 dark:border-slate-800">
                {ILLUSTRATION_EMOJIS.map(emoji => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setSelectedEmoji(emoji)}
                    className={`w-8 h-8 rounded-lg text-lg flex items-center justify-center transition ${
                      selectedEmoji === emoji 
                        ? 'bg-indigo-600 font-bold scale-110 shadow-sm border border-indigo-500' 
                        : 'hover:bg-slate-200 dark:hover:bg-slate-800 bg-transparent'
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit" disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold py-2.5 rounded-xl transition cursor-pointer shadow-sm text-sm"
            >
              {loading ? 'Salvando...' : editingUserId ? 'Atualizar Operador' : 'Cadastrar Operador'}
            </button>
          </form>
        </div>

        {/* List of existing operators */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="divide-y divide-slate-50 dark:divide-slate-800">
              {users.map(u => {
                const sector = sectors.find(s => s.id === u.sector_id);
                const isEmojiPhoto = u.photo && !u.photo.startsWith('http');
                const isConfirmingDelete = confirmDeleteId === u.id;
                
                return (
                  <div key={u.id} className="p-5 flex items-center justify-between gap-4 flex-wrap sm:flex-nowrap hover:bg-slate-50/40 dark:hover:bg-slate-800/40 transition">
                    <div className="flex items-center space-x-3.5">
                      {isEmojiPhoto ? (
                        <div className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-slate-950 text-2xl flex items-center justify-center ring-2 ring-slate-200/50">
                          {u.photo}
                        </div>
                      ) : (
                        <img 
                           src={u.photo || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=faces"} 
                          alt={u.name} 
                          className="w-11 h-11 rounded-xl object-cover ring-2 ring-slate-100"
                        />
                      )}
                      
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-slate-800 dark:text-slate-100 text-sm leading-tight block">{u.name}</span>
                          <span className={`text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${
                            u.role === 'admin' ? 'bg-indigo-50/50 text-indigo-600 border border-indigo-150/50 dark:bg-indigo-950 dark:text-indigo-400' : 'bg-slate-100 text-slate-500'
                          }`}>
                            {u.role === 'admin' ? 'Administrador' : u.role === 'access_total' ? 'Acesso Total' : 'Operador'}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-semibold leading-none">@{u.username} • {u.email}</div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-4">
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 uppercase font-extrabold tracking-wider block">Setor de Operação</span>
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                          {u.role === 'admin' ? 'Todos (Administrador)' : (sector?.name || 'Geral / Chatbot')}
                        </span>
                      </div>

                      <div className="flex flex-col items-end gap-1">
                        <div className="flex items-center space-x-1">
                          <button
                            onClick={() => handleEditClick(u)}
                            title="Editar Operador"
                            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-400 hover:text-indigo-600 transition cursor-pointer"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>

                          {u.id !== 'usr_admin' && (
                            <button
                              onClick={async () => {
                                if (isConfirmingDelete) {
                                  await onDeleteUser(u.id);
                                  setConfirmDeleteId(null);
                                } else {
                                  setConfirmDeleteId(u.id);
                                  setTimeout(() => setConfirmDeleteId(null), 4000);
                                }
                              }}
                              className={`p-1.5 rounded-xl transition cursor-pointer ${
                                isConfirmingDelete 
                                  ? 'bg-rose-50 text-rose-550 animate-pulse' 
                                  : 'hover:bg-rose-50 dark:hover:bg-rose-950/35 text-slate-450 hover:text-rose-500'
                              }`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                        {isConfirmingDelete && (
                          <span className="text-[8px] font-bold text-rose-550 animate-pulse text-right">Confirmar?</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
