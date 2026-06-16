import React, { useState, useEffect } from 'react';
import { Settings, User, QuickMessage } from '../types/index.js';
import { Save, HelpCircle, AlertCircle, Sparkles, DollarSign, Smartphone, Trash2, Pencil, Plus, X, Smile, Database, RefreshCw, CheckCircle, MessageSquare } from 'lucide-react';
import QrCodeWhatsApp from './QrCodeWhatsApp.js';

interface SettingsProps {
  settings: Settings | null;
  activeAgent: User;
  onSaveSettings: (data: Partial<Settings>) => Promise<any>;
  whatsAppStatus: { status: string; number: string; qrCodeUrl: string | null };
  onWhatsSync: () => Promise<any>;
  onWhatsDisconnect: () => Promise<any>;
}

const PRESET_EMOJIS = ['👋', '😊', '👍', '⚠️', '🕒', '🤖', '💼', '🛒', '💸', '🔗', '📞', '🏢', '🌟', '💡', '🔥', '✅'];

export default function SettingsPage({
  settings,
  activeAgent,
  onSaveSettings,
  whatsAppStatus,
  onWhatsSync,
  onWhatsDisconnect
}: SettingsProps) {
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  // Database wipe / cleanup states
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearInput, setClearInput] = useState('');
  const [clearing, setClearing] = useState(false);
  const [clearStatus, setClearStatus] = useState<string | null>(null);

  // Database Configuration & Diagnostic states
  const [dbReport, setDbReport] = useState<any>(null);
  const [testingDb, setTestingDb] = useState(false);
  const [supaUrl, setSupaUrl] = useState('');
  const [supaKey, setSupaKey] = useState('');
  const [savingSupaConfig, setSavingSupaConfig] = useState(false);
  const [supaConfigError, setSupaConfigError] = useState<string | null>(null);
  const [supaConfigSuccess, setSupaConfigSuccess] = useState<string | null>(null);

  const runDbDiagnostics = async () => {
    setTestingDb(true);
    try {
      const res = await fetch('/api/debug/db-detailed');
      if (res.ok) {
        const report = await res.json();
        setDbReport(report);
        if (report.supabase?.url && !supaUrl) {
          setSupaUrl(report.supabase.url);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setTestingDb(false);
    }
  };

  const handleSaveSupaConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supaUrl.trim() || !supaKey.trim()) {
      setSupaConfigError('Por favor preencha todos os campos.');
      return;
    }
    setSavingSupaConfig(true);
    setSupaConfigError(null);
    setSupaConfigSuccess(null);
    try {
      const res = await fetch('/api/config/supabase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: supaUrl, key: supaKey })
      });
      if (res.ok) {
        setSupaConfigSuccess('Configuração do Supabase salva com sucesso! O sistema foi alternado para Supabase e re-inicializado.');
        setSupaKey('');
        await runDbDiagnostics();
      } else {
        const data = await res.json();
        setSupaConfigError(data.error || 'Erro ao salvar configuração.');
      }
    } catch (err: any) {
      setSupaConfigError(err.message || 'Erro de conexão com o servidor.');
    } finally {
      setSavingSupaConfig(false);
    }
  };

  useEffect(() => {
    runDbDiagnostics();
  }, []);

  // Prevention of polling resetting user inputs: only initialize once when settings loaded or after saving
  const [hasInitialized, setHasInitialized] = useState(false);

  // Form states
  const [companyName, setCompanyName] = useState('');
  const [welcomeMessage, setWelcomeMessage] = useState('');
  const [queueMessage, setQueueMessage] = useState('');
  const [outOfHoursMessage, setOutOfHoursMessage] = useState('');
  const [inactivityClosureMessage, setInactivityClosureMessage] = useState('');
  const [closureMessage, setClosureMessage] = useState('');
  const [storeLink, setStoreLink] = useState('');
  const [careerLink, setCareerLink] = useState('');
  const [offersLink, setOffersLink] = useState('');
  const [estimatedWait, setEstimatedWait] = useState(5);
  const [startSchedule, setStartSchedule] = useState('08:00');
  const [endSchedule, setEndSchedule] = useState('18:00');
  const [scheduleDays, setScheduleDays] = useState<string[]>(['seg', 'ter', 'qua', 'qui', 'sex']);

  // PIX states
  const [pixEnabled, setPixEnabled] = useState(false);
  const [pixKey, setPixKey] = useState('');
  const [pixReceiver, setPixReceiver] = useState('');
  const [pixBank, setPixBank] = useState('');

  // Custom Bot Auto-Replies configuration states
  const [botOptions, setBotOptions] = useState<{ id: string; trigger_key: string; title: string; response_text: string }[]>([]);
  
  // Quick Messages (Canned responses) states
  const [quickMessages, setQuickMessages] = useState<QuickMessage[]>([]);
  
  // Local quick message entry forms
  const [qmId, setQmId] = useState<string | null>(null);
  const [qmTitle, setQmTitle] = useState('');
  const [qmText, setQmText] = useState('');
  const [qmIcon, setQmIcon] = useState<QuickMessage['icon']>('MessageSquare');
  const [qmSuccessMsg, setQmSuccessMsg] = useState('');

  // Local option entry forms
  const [optId, setOptId] = useState<string | null>(null);
  const [optKey, setOptKey] = useState('');
  const [optTitle, setOptTitle] = useState('');
  const [optResponse, setOptResponse] = useState('');
  const [optSuccessMsg, setOptSuccessMsg] = useState('');
  const [optConfirmDeleteId, setOptConfirmDeleteId] = useState<string | null>(null);

  // Initialize fields only when settings starts or after saving completes
  useEffect(() => {
    if (settings && !hasInitialized) {
      setCompanyName(settings.company_name || '');
      setWelcomeMessage(settings.welcome_message || '');
      setQueueMessage(settings.queue_message || '');
      setOutOfHoursMessage(settings.out_of_hours_message || '');
      setInactivityClosureMessage(settings.inactivity_closure_message || '');
      setClosureMessage(settings.closure_message || '');
      setStoreLink(settings.store_link || '');
      setCareerLink(settings.career_link || '');
      setOffersLink(settings.offers_link || '');
      setEstimatedWait(settings.estimated_wait || 5);
      setStartSchedule(settings.schedules?.start || '08:05');
      setEndSchedule(settings.schedules?.end || '18:00');
      setScheduleDays(settings.schedules?.days || ['seg', 'ter', 'qua', 'qui', 'sex']);

      setPixEnabled(!!settings.pix_enabled);
      setPixKey(settings.pix_key || '');
      setPixReceiver(settings.pix_receiver || '');
      setPixBank(settings.pix_bank || '');

      // Load bot menu options (backfilled if absent)
      setBotOptions(settings.bot_options || []);
      setQuickMessages(settings.quick_messages || []);
      setHasInitialized(true);
    }
  }, [settings, hasInitialized]);

  const promptSaveSettings = async (updatedOptions: { id: string; trigger_key: string; title: string; response_text: string }[]) => {
    try {
      await onSaveSettings({
        company_name: companyName,
        welcome_message: welcomeMessage,
        queue_message: queueMessage,
        out_of_hours_message: outOfHoursMessage,
        inactivity_closure_message: inactivityClosureMessage,
        closure_message: closureMessage,
        store_link: storeLink,
        career_link: careerLink,
        offers_link: offersLink,
        estimated_wait: Number(estimatedWait),
        schedules: {
          start: startSchedule,
          end: endSchedule,
          days: scheduleDays
        },
        pix_enabled: pixEnabled,
        pix_key: pixKey,
        pix_receiver: pixReceiver,
        pix_bank: pixBank,
        bot_options: updatedOptions,
        quick_messages: quickMessages
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleClearAllData = async () => {
    if (clearInput !== 'APAGAR') return;
    setClearing(true);
    setClearStatus(null);
    try {
      const res = await fetch('/api/conversations/clear-all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': activeAgent.email,
          'x-user-name': activeAgent.name
        }
      });
      if (res.ok) {
        setClearStatus('success');
        setClearInput('');
        setShowClearConfirm(false);
        // Page reload to fetch clean records & states for active view
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        setClearStatus('error');
      }
    } catch (e) {
      console.error(e);
      setClearStatus('error');
    } finally {
      setClearing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await onSaveSettings({
        company_name: companyName,
        welcome_message: welcomeMessage,
        queue_message: queueMessage,
        out_of_hours_message: outOfHoursMessage,
        inactivity_closure_message: inactivityClosureMessage,
        closure_message: closureMessage,
        store_link: storeLink,
        career_link: careerLink,
        offers_link: offersLink,
        estimated_wait: Number(estimatedWait),
        schedules: {
          start: startSchedule,
          end: endSchedule,
          days: scheduleDays
        },
        pix_enabled: pixEnabled,
        pix_key: pixKey,
        pix_receiver: pixReceiver,
        pix_bank: pixBank,
        bot_options: botOptions,
        quick_messages: quickMessages
      });

      setSuccess(true);
      // We don't call setHasInitialized(false) to prevent state clobbering due to race conditions
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Chatbot Option CRUD functions (saved instantly to DB for reliability)
  const handleSaveOption = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!optKey.trim() || !optTitle.trim() || !optResponse.trim()) return;

    let updatedOptions = [...botOptions];

    if (optId) {
      // Edit existing
      updatedOptions = botOptions.map(o => o.id === optId ? { ...o, trigger_key: optKey, title: optTitle, response_text: optResponse } : o);
      setBotOptions(updatedOptions);
      setOptSuccessMsg('Opção atualizada com sucesso!');
    } else {
      // Add new
      const newOpt = {
        id: "opt_" + Math.random().toString(36).substring(2, 9),
        trigger_key: optKey,
        title: optTitle,
        response_text: optResponse
      };
      updatedOptions = [...botOptions, newOpt];
      setBotOptions(updatedOptions);
      setOptSuccessMsg('Nova opção adicionada com sucesso!');
    }

    // Reset inline inputs
    setOptId(null);
    setOptKey('');
    setOptTitle('');
    setOptResponse('');

    await promptSaveSettings(updatedOptions);
    setTimeout(() => setOptSuccessMsg(''), 3000);
  };

  const handleEditOptionClick = (opt: any) => {
    setOptId(opt.id);
    setOptKey(opt.trigger_key);
    setOptTitle(opt.title);
    setOptResponse(opt.response_text);
    setOptConfirmDeleteId(null);
  };

  const handleDeleteOptionClick = async (id: string) => {
    const updatedOptions = botOptions.filter(o => o.id !== id);
    setBotOptions(updatedOptions);
    if (optId === id) {
      setOptId(null);
      setOptKey('');
      setOptTitle('');
      setOptResponse('');
    }
    await promptSaveSettings(updatedOptions);
  };

  const insertEmoji = (field: 'welcome' | 'queue' | 'outOfHours' | 'inactivity' | 'closure' | 'optResponse' | 'qmText', emoji: string) => {
    if (field === 'welcome') {
      setWelcomeMessage(prev => prev + emoji);
    } else if (field === 'queue') {
      setQueueMessage(prev => prev + emoji);
    } else if (field === 'outOfHours') {
      setOutOfHoursMessage(prev => prev + emoji);
    } else if (field === 'inactivity') {
      setInactivityClosureMessage(prev => prev + emoji);
    } else if (field === 'closure') {
      setClosureMessage(prev => prev + emoji);
    } else if (field === 'optResponse') {
      setOptResponse(prev => prev + emoji);
    } else if (field === 'qmText') {
      setQmText(prev => prev + emoji);
    }
  };

  if (!settings) {
    return (
      <div className="flex justify-center items-center h-64 text-xs font-semibold text-slate-400">
        Carregando parâmetros...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="border-b border-slate-100 dark:border-slate-800 pb-4">
        <h2 className="font-extrabold text-slate-800 dark:text-slate-100 text-lg">Parâmetros Operacionais (Configurar Robô)</h2>
        <p className="text-xs text-slate-400 mt-1 leading-relaxed">Customize os fluxos de mensagens automáticas, integração com o WhatsApp via Baileys, prazos de envio e o faturamento por PIX.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {success && (
              <div className="bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 p-4 rounded-xl flex items-center space-x-2.5 border border-emerald-150/40 text-xs font-semibold select-text">
                <Sparkles className="w-4 h-4 flex-shrink-0 text-emerald-500 animate-bounce" />
                <span>Configurações gerais atualizadas e salvas com sucesso no banco de dados!</span>
              </div>
            )}

            {/* General configurations */}
            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-5">
              <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm border-b border-slate-50 dark:border-slate-800 pb-3 flex items-center space-x-1.5">
                <span>Geral & Integração</span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="space-y-1">
                  <label className="font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider block">Nome da Corporação</label>
                  <input 
                    type="text" required value={companyName} onChange={e => setCompanyName(e.target.value)}
                    className="w-full border border-slate-200 dark:border-slate-800 dark:bg-slate-950 px-4 py-2.5 rounded-xl text-sm text-slate-800 dark:text-slate-200 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="font-bold text-slate-450 dark:text-slate-400 uppercase tracking-wider block">Horário Entrada</label>
                    <input 
                      type="text" required value={startSchedule} onChange={e => setStartSchedule(e.target.value)}
                      className="w-full border border-slate-200 dark:border-slate-800 dark:bg-slate-950 px-4 py-2.5 rounded-xl text-sm focus:outline-none text-center"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-bold text-slate-450 dark:text-slate-400 uppercase tracking-wider block">Horário Saída</label>
                    <input 
                      type="text" required value={endSchedule} onChange={e => setEndSchedule(e.target.value)}
                      className="w-full border border-slate-200 dark:border-slate-800 dark:bg-slate-950 px-4 py-2.5 rounded-xl text-sm focus:outline-none text-center"
                    />
                  </div>
                </div>

                <div className="space-y-2 col-span-1 md:col-span-2">
                  <label className="font-bold text-slate-450 dark:text-slate-400 uppercase tracking-wider block">Dias de Atendimento</label>
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {[
                      { key: 'seg', label: 'Segunda' },
                      { key: 'ter', label: 'Terça' },
                      { key: 'qua', label: 'Quarta' },
                      { key: 'qui', label: 'Quinta' },
                      { key: 'sex', label: 'Sexta' },
                      { key: 'sab', label: 'Sábado' },
                      { key: 'dom', label: 'Domingo' },
                    ].map(day => {
                      const isSelected = scheduleDays.includes(day.key);
                      return (
                        <button
                          key={day.key}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              setScheduleDays(prev => prev.filter(d => d !== day.key));
                            } else {
                              setScheduleDays(prev => [...prev, day.key]);
                            }
                          }}
                          className={`px-3 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-tighter select-none cursor-pointer transition-all duration-300 flex-1 min-w-[80px] text-center border-2 ${
                            isSelected 
                              ? 'bg-brand-sidebar text-white border-brand-sidebar shadow-[0_4px_12px_rgba(30,64,175,0.2)] scale-[1.02]' 
                              : 'bg-slate-50 dark:bg-slate-900 border-slate-100 dark:border-slate-800 text-slate-400 opacity-60'
                          }`}
                        >
                          {day.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-450 dark:text-slate-400 uppercase tracking-wider block">Site / Loja Virtual (URL)</label>
                  <input 
                    type="text" value={storeLink} onChange={e => setStoreLink(e.target.value)}
                    className="w-full border border-slate-200 dark:border-slate-800 dark:bg-slate-950 px-4 py-2.5 rounded-xl text-sm focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-450 dark:text-slate-400 uppercase tracking-wider block">Vagas de RH (URL)</label>
                  <input 
                    type="text" value={careerLink} onChange={e => setCareerLink(e.target.value)}
                    className="w-full border border-slate-200 dark:border-slate-800 dark:bg-slate-950 px-4 py-2.5 rounded-xl text-sm focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-450 dark:text-slate-400 uppercase tracking-wider block">Jornal de Ofertas do Mês (URL)</label>
                  <input 
                    type="text" value={offersLink} onChange={e => setOffersLink(e.target.value)}
                    className="w-full border border-slate-200 dark:border-slate-800 dark:bg-slate-950 px-4 py-2.5 rounded-xl text-sm focus:outline-none"
                    placeholder="Ex: https://guarato.com.br/encarte-ofertas"
                  />
                </div>
              </div>
            </div>

            {/* Chatbot Message Fields with Preset Emoji helper */}
            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-5">
              <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm border-b border-slate-50 dark:border-slate-800 pb-3">Mensagens Globais do Robô</h3>
              
              <div className="space-y-5 text-xs">
                {/* INFORMATIVE BOX ABOUT DYNAMIC MENU */}
                <div className="bg-amber-50/50 dark:bg-amber-950/10 border border-amber-100 dark:border-amber-900/30 p-4 rounded-xl space-y-2">
                  <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-bold uppercase text-[10px] tracking-wider">
                    <HelpCircle className="w-3.5 h-3.5" />
                    Como funciona o Menu do WhatsApp?
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                    O robô monta o menu inicial automaticamente assim:
                    <br />
                    1. Ele envia sua <b>Saudação</b> personalizada.
                    <br />
                    2. Ele lista os <b>Setores</b> ativos (ex: <i>1 para Televendas</i>).
                    <br />
                    3. Ele adiciona a opção de falar com atendente humano.
                    <br />
                    <span className="font-bold text-slate-700 dark:text-slate-200">Para mudar os nomes (Televendas, RH, etc), altere diretamente na página de "Setores" no menu lateral.</span>
                  </p>
                </div>

                {/* Welcome Message input */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="font-bold text-slate-450 dark:text-slate-400 uppercase tracking-wider block">Mensagem de Boas-Vindas & Saudação</label>
                    <div className="flex items-center space-x-1 py-1">
                      <span className="text-[10px] text-slate-400 select-none mr-2 font-semibold">Inserir Emoji:</span>
                      {PRESET_EMOJIS.slice(0, 8).map(em => (
                        <button 
                          key={em} type="button" onClick={() => insertEmoji('welcome', em)}
                          className="hover:scale-125 transition text-base px-1 py-0.5"
                        >
                          {em}
                        </button>
                      ))}
                    </div>
                  </div>
                  <textarea 
                    rows={4} required value={welcomeMessage} onChange={e => setWelcomeMessage(e.target.value)}
                    className="w-full border border-slate-200 dark:border-slate-805 dark:bg-slate-950 px-4 py-3 rounded-xl text-sm leading-relaxed focus:outline-none font-sans"
                  />
                  <div className="text-[10px] text-slate-400 block font-normal leading-relaxed">Este texto será disparado no primeiro contato do cliente apresentando o menu de opções.</div>
                </div>

                {/* Queue Message input */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="font-bold text-slate-450 dark:text-slate-400 uppercase tracking-wider block">Mensagem de Direcionamento para Fila</label>
                    <div className="flex items-center space-x-1 py-1">
                      <span className="text-[10px] text-slate-400 select-none mr-2 font-semibold">Inserir Emoji:</span>
                      {PRESET_EMOJIS.slice(0, 8).map(em => (
                        <button 
                          key={em} type="button" onClick={() => insertEmoji('queue', em)}
                          className="hover:scale-125 transition text-base px-1 py-0.5"
                        >
                          {em}
                        </button>
                      ))}
                    </div>
                  </div>
                  <textarea 
                    rows={4} required value={queueMessage} onChange={e => setQueueMessage(e.target.value)}
                    className="w-full border border-slate-200 dark:border-slate-805 dark:bg-slate-950 px-4 py-3 rounded-xl text-sm leading-relaxed focus:outline-none font-sans"
                  />
                  <div className="text-[10px] text-slate-400 block font-normal leading-relaxed">Disparada ao mudar do robô para atendimento humano quando a fila estiver congestionada.</div>
                </div>

                {/* Out of Hours Message input */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="font-bold text-slate-450 dark:text-slate-400 uppercase tracking-wider block">Mensagem Fora do Horário de Atendimento</label>
                    <div className="flex items-center space-x-1 py-1">
                      <span className="text-[10px] text-slate-400 select-none mr-2 font-semibold">Inserir Emoji:</span>
                      {PRESET_EMOJIS.slice(0, 8).map(em => (
                        <button 
                          key={em} type="button" onClick={() => insertEmoji('outOfHours', em)}
                          className="hover:scale-125 transition text-base px-1 py-0.5"
                        >
                          {em}
                        </button>
                      ))}
                    </div>
                  </div>
                  <textarea 
                    rows={4} required value={outOfHoursMessage} onChange={e => setOutOfHoursMessage(e.target.value)}
                    className="w-full border border-slate-200 dark:border-slate-805 dark:bg-slate-950 px-4 py-3 rounded-xl text-sm leading-relaxed focus:outline-none font-sans"
                    placeholder="Escreva a mensagem que o robô enviará fora do expediente..."
                  />
                  <div className="text-[10px] text-slate-400 block font-normal leading-relaxed">Disparada de forma inteligente e sem repetições excessivas quando o cliente enviar mensagens fora do expediente configurado.</div>
                </div>

                {/* Inactivity Closure Message input */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="font-bold text-slate-450 dark:text-slate-400 uppercase tracking-wider block">Mensagem de Encerramento por Inatividade</label>
                    <div className="flex items-center space-x-1 py-1">
                      <span className="text-[10px] text-slate-400 select-none mr-2 font-semibold">Inserir Emoji:</span>
                      {PRESET_EMOJIS.slice(0, 8).map(em => (
                        <button 
                          key={em} type="button" onClick={() => insertEmoji('inactivity', em)}
                          className="hover:scale-125 transition text-base px-1 py-0.5"
                        >
                          {em}
                        </button>
                      ))}
                    </div>
                  </div>
                  <textarea 
                    rows={4} required value={inactivityClosureMessage} onChange={e => setInactivityClosureMessage(e.target.value)}
                    className="w-full border border-slate-200 dark:border-slate-800 dark:bg-slate-950 px-4 py-3 rounded-xl text-sm leading-relaxed focus:outline-none font-sans"
                    placeholder="Escreva a mensagem enviada quando o chat for encerrado por falta de resposta do cliente..."
                  />
                  <div className="text-[10px] text-slate-400 block font-normal leading-relaxed">Disparada automaticamente após 25 minutos de silêncio do cliente durante um atendimento aguardando ou ativo.</div>
                </div>

                {/* Manual Closure Message input (Added) */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="font-bold text-slate-450 dark:text-slate-400 uppercase tracking-wider block">Mensagem de Encerramento Manual (Pesquisa)</label>
                    <div className="flex items-center space-x-1 py-1">
                      <span className="text-[10px] text-slate-400 select-none mr-2 font-semibold">Inserir Emoji:</span>
                      {PRESET_EMOJIS.slice(0, 8).map(em => (
                        <button 
                          key={em} type="button" onClick={() => insertEmoji('closure', em)}
                          className="hover:scale-125 transition text-base px-1 py-0.5"
                        >
                          {em}
                        </button>
                      ))}
                    </div>
                  </div>
                  <textarea 
                    rows={4} required value={closureMessage} onChange={e => setClosureMessage(e.target.value)}
                    className="w-full border border-slate-200 dark:border-slate-800 dark:bg-slate-950 px-4 py-3 rounded-xl text-sm leading-relaxed focus:outline-none font-sans"
                    placeholder="Escreva a mensagem que será enviada via WhatsApp assim que o atendente encerrar a conversa..."
                  />
                  <div className="text-[10px] text-slate-400 block font-normal leading-relaxed">Esta mensagem é enviada ao cliente no momento exato em que o atendente clica em "Encerrar Atendimento".</div>
                </div>
              </div>
            </div>

            {/* DYNAMIC MENU OPTIONS BUILDER (Cadastro de novas opções: loja virtual, vagas, etc.) */}
            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-5">
              <div className="border-b border-blank dark:border-slate-800 pb-3 flex justify-between items-center">
                <div>
                  <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">Opções de Resposta do Robô (Autoatendimento)</h3>
                  <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">Cadastre novas respostas e direcionamentos como links de loja virtual, vagas de trabalho, informativos, etc.</p>
                </div>
              </div>

              {/* Bot options dynamic table list */}
              <div className="space-y-4">
                <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-100 dark:border-slate-800 space-y-2.5">
                  <h4 className="text-xs font-bold text-slate-700 dark:text-slate-350 tracking-wider uppercase block">Respostas Cadastradas</h4>
                  
                  {botOptions.length === 0 ? (
                    <div className="text-center p-4 text-[11px] text-slate-400 font-semibold">Nenhuma resposta automática customizada registrada.</div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {botOptions.map(opt => {
                        const isConfirmingOptDel = optConfirmDeleteId === opt.id;
                        return (
                          <div key={opt.id} className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800 rounded-xl p-3 shadow-inner flex flex-col justify-between space-y-2">
                            <div>
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-slate-800 dark:text-slate-200 text-xs">Tecla/Trigger: "{opt.trigger_key}"</span>
                                <div className="flex items-center space-x-1">
                                  <button 
                                    type="button" 
                                    onClick={() => handleEditOptionClick(opt)}
                                    className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-400 hover:text-indigo-500"
                                    title="Editar esta opção"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button 
                                    type="button" 
                                    onClick={() => {
                                      if (isConfirmingOptDel) {
                                        handleDeleteOptionClick(opt.id);
                                        setOptConfirmDeleteId(null);
                                      } else {
                                        setOptConfirmDeleteId(opt.id);
                                        setTimeout(() => setOptConfirmDeleteId(null), 4000);
                                      }
                                    }}
                                    className={`p-1 rounded transition-colors ${
                                      isConfirmingOptDel 
                                        ? 'bg-rose-50 text-rose-600 animate-pulse'
                                        : 'text-slate-405 hover:bg-rose-50 hover:text-rose-500'
                                    }`}
                                    title="Excluir com confirmação"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                              <div className="text-[11px] font-bold text-slate-705 dark:text-slate-100 mt-1">{opt.title}</div>
                              <p className="text-[10px] text-slate-450 dark:text-slate-400 block mt-1 line-clamp-3 font-mono leading-relaxed bg-slate-50 dark:bg-slate-950 p-1.5 rounded">{opt.response_text}</p>
                            </div>
                            {isConfirmingOptDel && (
                              <span className="text-[8px] font-bold text-rose-500 animate-pulse leading-none text-right block">Clique de novo para confirmar</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Sub-form to register or edit Bot Options */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl space-y-3.5">
                  <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-2">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center space-x-1.5">
                      <Plus className="w-3.5 h-3.5 text-brand-primary" />
                      <span>{optId ? 'Editar Opção de Menu' : 'Cadastrar Nova Opção de Autoatendimento'}</span>
                    </span>
                    {optId && (
                      <button 
                        type="button" 
                        onClick={() => {
                          setOptId(null);
                          setOptKey('');
                          setOptTitle('');
                          setOptResponse('');
                        }}
                        className="text-slate-400 hover:text-rose-500 transition text-[10px] font-bold flex items-center space-x-1"
                      >
                        <X className="w-3 h-3" />
                        <span>Limpar Edição</span>
                      </button>
                    )}
                  </div>

                  {optSuccessMsg && (
                    <div className="bg-emerald-50 text-emerald-700 text-[10px] font-semibold p-2 rounded-lg border border-emerald-100 animate-pulse">
                      {optSuccessMsg}
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                    <div className="space-y-1">
                      <label className="font-bold text-slate-450 dark:text-slate-400 block">Tecla Atalho / Palavra-Chave</label>
                      <input 
                        type="text" required value={optKey} onChange={e => setOptKey(e.target.value)}
                        placeholder="Ex: 4 ou loja ou ajuda"
                        className="w-full border border-slate-200 dark:border-slate-800 dark:bg-slate-950 px-3 py-2 rounded-xl text-xs focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1 md:col-span-3">
                      <label className="font-bold text-slate-450 dark:text-slate-400 block">Título do Item do Menu</label>
                      <input 
                        type="text" required value={optTitle} onChange={e => setOptTitle(e.target.value)}
                        placeholder="Ex: Visitar catálogo da Loja Virtual, Vagas abertas do RH..."
                        className="w-full border border-slate-200 dark:border-slate-800 dark:bg-slate-950 px-3 py-2 rounded-xl text-xs focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between items-center">
                      <label className="font-bold text-slate-450 dark:text-slate-400 block">Mensagem de Resposta do Robô ao ser digitado</label>
                      <div className="flex items-center space-x-1">
                        {PRESET_EMOJIS.slice(0, 10).map(em => (
                          <button 
                            key={em} type="button" onClick={() => insertEmoji('optResponse', em)}
                            className="hover:scale-125 transition text-base px-0.5"
                          >
                            {em}
                          </button>
                        ))}
                      </div>
                    </div>
                    <textarea 
                      rows={3} required value={optResponse} onChange={e => setOptResponse(e.target.value)}
                      placeholder="Ex: Aqui está o link da nossa loja virtual: https://guarato.com.br/loja. Use o cupom BEMVINDO para 5% de desconto! 🌟🛒"
                      className="w-full border border-slate-200 dark:border-slate-800 dark:bg-slate-950 px-3 py-2 rounded-xl text-xs focus:outline-none leading-relaxed font-sans"
                    />
                  </div>

                  <button 
                    type="button" 
                    onClick={handleSaveOption}
                    disabled={!optKey.trim() || !optTitle.trim() || !optResponse.trim()}
                    className="bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-primary font-bold px-4 py-2 rounded-xl text-xs transition border border-brand-primary/20 disabled:opacity-40"
                  >
                    {optId ? 'Salvar Alteração de Opção' : 'Adicionar esta Opção ao Menu'}
                  </button>
                </div>
              </div>
            </div>

            {/* MENSAGENS RÁPIDAS (RESPOSTAS RÁPIDAS NO CHAT) */}
            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-5">
              <div className="border-b border-blank dark:border-slate-800 pb-3 flex justify-between items-center bg-indigo-50/30 dark:bg-indigo-950/20 -m-6 mb-5 p-6 rounded-t-2xl">
                <div>
                  <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-indigo-500" />
                    Mensagens Rápidas (Atalhos no Chat)
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">Customize os botões de atalho coloridos que aparecem abaixo da caixa de mensagem na central de chats.</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="bg-slate-50 dark:bg-slate-950 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-4">
                  <div className="flex justify-between items-center px-1">
                    <h4 className="text-xs font-bold text-slate-700 dark:text-slate-350 tracking-wider uppercase block">Botões Ativos na Central de Chat</h4>
                    <button
                      type="button"
                      onClick={async () => {
                        if (confirm('Deseja restaurar as mensagens rápidas padrão da LS Guarato? Isso substituirá as atuais.')) {
                          const defaults = [
                            { id: 'qm_saudacao', title: 'SAUDAÇÃO', text: 'Olá! Tudo bem? Como posso ajudar você hoje na LS Guarato?', icon: 'MessageSquare' },
                            { id: 'qm_vendas', title: 'VENDAS', text: '📞 *VENDAS & TELEVENDAS LS GUARATO*\n\nNossos vendedores estão prontos para te atender! Caso precise cotar materiais específicos (cimento, gesso, areia, ferragens, tintas), envie seus itens que calcularemos o melhor valor.', icon: 'ShoppingBag' },
                            { id: 'qm_ecommerce', title: 'LOJA ONLINE', text: `🌐 *LOJA VIRTUAL / E-COMMERCE LS GUARATO*\n\nAcesse nosso site oficial para conferir nosso catálogo completo e comprar online com praticidade:\n🔗 ${storeLink || 'https://applsguarato.com.br'}`, icon: 'ShoppingBag' },
                            { id: 'qm_boleto', title: 'AVISO DE BOLETO', text: 'Olá! Segue o seu boleto para pagamento.', icon: 'CreditCard' },
                            { id: 'qm_nf', title: 'AVISO NF', text: 'Olá! Segue sua Nota Fiscal.', icon: 'FileText' },
                            { id: 'qm_comprovante', title: 'PEDIR COMPROVANTE', text: 'Por favor, poderia nos enviar o comprovante de pagamento?', icon: 'MessageSquare' }
                          ];
                          setQuickMessages(defaults as any);
                          await onSaveSettings({ quick_messages: defaults as any });
                          setQmSuccessMsg('Modelos da LS Guarato carregados com sucesso!');
                          setTimeout(() => setQmSuccessMsg(''), 3000);
                        }
                      }}
                      className="text-[10px] text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 font-bold uppercase hover:underline flex items-center gap-1.5 px-3 py-1 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg transition"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Restaurar Padrões da Empresa
                    </button>
                  </div>
                  
                  {quickMessages.length === 0 ? (
                    <div className="text-center py-10 px-6 bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 space-y-3">
                      <div className="flex justify-center">
                        <div className="w-12 h-12 rounded-full bg-slate-50 dark:bg-slate-800 flex items-center justify-center">
                          <MessageSquare className="w-6 h-6 text-slate-300" />
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Nenhum botão configurado</p>
                        <p className="text-[11px] text-slate-400 mt-1">Os atendentes ainda não possuem atalhos de mensagens rápidas no chat.</p>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          const defaults = [
                            { id: 'qm_saudacao', title: 'SAUDAÇÃO', text: 'Olá! Tudo bem? Como posso ajudar você hoje na LS Guarato?', icon: 'MessageSquare' },
                            { id: 'qm_vendas', title: 'VENDAS', text: '📞 *VENDAS & TELEVENDAS LS GUARATO*\n\nNossos vendedores estão prontos para te atender! Caso precise cotar materiais específicos (cimento, gesso, areia, ferragens, tintas), envie seus itens que calcularemos o melhor valor.', icon: 'ShoppingBag' },
                            { id: 'qm_ecommerce', title: 'LOJA ONLINE', text: `🌐 *LOJA VIRTUAL / E-COMMERCE LS GUARATO*\n\nAcesse nosso site oficial para conferir nosso catálogo completo e comprar online com praticidade:\n🔗 ${storeLink || 'https://applsguarato.com.br'}`, icon: 'ShoppingBag' },
                            { id: 'qm_boleto', title: 'AVISO DE BOLETO', text: 'Olá! Segue o seu boleto para pagamento.', icon: 'CreditCard' },
                            { id: 'qm_nf', title: 'AVISO NF', text: 'Olá! Segue sua Nota Fiscal.', icon: 'FileText' },
                            { id: 'qm_comprovante', title: 'PEDIR COMPROVANTE', text: 'Por favor, poderia nos enviar o comprovante de pagamento?', icon: 'MessageSquare' }
                          ];
                          setQuickMessages(defaults as any);
                          await onSaveSettings({ quick_messages: defaults as any });
                          setQmSuccessMsg('Modelos da LS Guarato configurados!');
                          setTimeout(() => setQmSuccessMsg(''), 3000);
                        }}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-2.5 rounded-xl text-xs transition shadow-md hover:shadow-lg active:scale-95"
                      >
                        Carregar Modelos da LS Guarato
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {quickMessages.map(qm => (
                        <div key={qm.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all group border-l-4 border-l-indigo-500">
                          <div className="flex items-center justify-between mb-2.5">
                            <h5 className="font-extrabold text-slate-800 dark:text-slate-100 text-[10px] uppercase tracking-widest">{qm.title}</h5>
                            <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button 
                                type="button" 
                                onClick={() => {
                                  setQmId(qm.id);
                                  setQmTitle(qm.title);
                                  setQmText(qm.text);
                                  setQmIcon(qm.icon || 'MessageSquare');
                                  window.scrollTo({ top: 1200, behavior: 'smooth' });
                                }}
                                className="p-1.5 hover:bg-indigo-50 dark:hover:bg-indigo-900/40 rounded-lg text-indigo-600 dark:text-indigo-400 transition"
                                title="Editar"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button 
                                type="button" 
                                onClick={async () => {
                                  if (confirm(`Excluir o botão "${qm.title}"?`)) {
                                    const updated = quickMessages.filter(m => m.id !== qm.id);
                                    setQuickMessages(updated);
                                    await onSaveSettings({ quick_messages: updated });
                                  }
                                }}
                                className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-900/40 rounded-lg text-rose-500 transition"
                                title="Excluir"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                          <div className="bg-slate-50 dark:bg-slate-950 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 group-hover:border-indigo-100 dark:group-hover:border-indigo-900/30 transition">
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-3 leading-relaxed font-sans">{qm.text}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl space-y-3.5">
                  <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-2">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center space-x-1.5">
                      <Plus className="w-3.5 h-3.5 text-brand-primary" />
                      <span>{qmId ? 'Editar Mensagem Rápida' : 'Cadastrar Nova Mensagem Rápida'}</span>
                    </span>
                  </div>

                  {qmSuccessMsg && (
                    <div className="bg-emerald-50 text-emerald-700 text-[10px] font-semibold p-2 rounded-lg border border-emerald-100">
                      {qmSuccessMsg}
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-sans">
                    <div className="space-y-1">
                      <label className="font-bold text-slate-450 dark:text-slate-400 block uppercase tracking-wider">Título do Botão</label>
                      <input 
                        type="text" required value={qmTitle} onChange={e => setQmTitle(e.target.value)}
                        placeholder="Ex: CATÁLOGO, VAGAS DE EMPREGO..."
                        className="w-full border border-slate-200 dark:border-slate-800 dark:bg-slate-950 px-3 py-2 rounded-xl text-xs focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-slate-450 dark:text-slate-400 block uppercase tracking-wider">Ícone (Nome Lucide)</label>
                      <select 
                        value={qmIcon} onChange={e => setQmIcon(e.target.value as QuickMessage['icon'])}
                        className="w-full border border-slate-200 dark:border-slate-800 dark:bg-slate-950 px-3 py-2 rounded-xl text-xs focus:outline-none"
                      >
                        <option value="MessageSquare">Balão de Chat</option>
                        <option value="Briefcase">Maleta (Vagas)</option>
                        <option value="ShoppingBag">Sacola (Catálogo)</option>
                        <option value="Newspaper">Jornal (Ofertas)</option>
                        <option value="CreditCard">Cartão (Cobrança)</option>
                        <option value="AlertCircle">Aviso (Urgente)</option>
                        <option value="FileText">Documento</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between items-center">
                      <label className="font-bold text-slate-450 dark:text-slate-400 block uppercase tracking-wider">Texto Completo da Mensagem</label>
                      <div className="flex items-center space-x-1">
                        {PRESET_EMOJIS.slice(0, 10).map(em => (
                          <button key={em} type="button" onClick={() => insertEmoji('qmText', em)} className="hover:scale-125 transition">
                            {em}
                          </button>
                        ))}
                      </div>
                    </div>
                    <textarea 
                      rows={4} required value={qmText} onChange={e => setQmText(e.target.value)}
                      placeholder="Combine texto e links que serão enviados ao clicar no botão..."
                      className="w-full border border-slate-200 dark:border-slate-800 dark:bg-slate-950 px-3 py-2 rounded-xl text-xs focus:outline-none leading-relaxed font-sans"
                    />
                  </div>

                  <button 
                    type="button" 
                    disabled={!qmTitle || !qmText}
                    onClick={async () => {
                      let updated;
                      if (qmId) {
                        updated = quickMessages.map(m => m.id === qmId ? { ...m, title: qmTitle, text: qmText, icon: qmIcon } : m);
                      } else {
                        updated = [...quickMessages, { id: 'qm_' + Date.now(), title: qmTitle, text: qmText, icon: qmIcon }];
                      }
                      setQuickMessages(updated as any);
                      setQmId(null); setQmTitle(''); setQmText(''); setQmSuccessMsg('Salvo com sucesso!');
                      await onSaveSettings({ quick_messages: updated as any });
                      setTimeout(() => setQmSuccessMsg(''), 3000);
                    }}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2 rounded-xl text-xs transition disabled:opacity-40"
                  >
                    {qmId ? 'Atualizar Mensagem' : 'Cadastrar Mensagem Rápida'}
                  </button>
                </div>
              </div>
            </div>

            {/* PIX Settings Section */}
            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-5 flex flex-col justify-between">
              <div>
                <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm border-b border-slate-50 dark:border-slate-800 pb-3 flex items-center space-x-1.5">
                  <DollarSign className="w-4 h-4 text-emerald-500" />
                  <span>Configuração de Fatura PIX QuickBilling</span>
                </h3>
                <p className="text-[11px] text-slate-450 dark:text-slate-400 leading-relaxed mt-1.5">Configure os dados de recebimento PIX para permitir aos atendentes emitirem e gerarem de forma ágil boletas para os clientes realizarem depósitos diretamente pelo chat.</p>
              </div>

              <div className="pt-4 space-y-4 text-xs font-sans">
                <div className="flex items-center space-x-3 bg-slate-50 dark:bg-slate-950 p-3.5 rounded-xl border border-slate-100 dark:border-slate-800">
                  <input 
                    type="checkbox" 
                    id="chk_pix"
                    checked={pixEnabled}
                    onChange={e => setPixEnabled(e.target.checked)}
                    className="rounded text-indigo-600 focus:ring-0 focus:outline-none w-4.5 h-4.5 cursor-pointer"
                  />
                  <label htmlFor="chk_pix" className="font-bold text-slate-700 dark:text-slate-350 select-none cursor-pointer">Habilitar Link/Dados de Pagamento PIX e Faturamento Rápidos</label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-1 md:col-span-2">
                    <label className="font-bold text-slate-450 dark:text-slate-400 uppercase tracking-wider block">Chave PIX Oficial (CNPJ / Celular / E-mail / Copiar)</label>
                    <input 
                      type="text" value={pixKey} onChange={e => setPixKey(e.target.value)}
                      placeholder="Ex: 00.999.888/0001-22 ou pix@guarato.com"
                      disabled={!pixEnabled}
                      className="w-full border border-slate-200 dark:border-slate-805 dark:bg-slate-950 px-4 py-2.5 rounded-xl disabled:opacity-50 text-sm focus:outline-none font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-bold text-slate-450 dark:text-slate-400 uppercase tracking-wider block">Instituição Bancária</label>
                    <input 
                      type="text" value={pixBank} onChange={e => setPixBank(e.target.value)}
                      placeholder="Ex: Itaú Unibanco"
                      disabled={!pixEnabled}
                      className="w-full border border-slate-200 dark:border-slate-805 dark:bg-slate-950 px-4 py-2.5 rounded-xl disabled:opacity-50 text-sm focus:outline-none"
                    />
                  </div>
                </div>

                  <div className="space-y-1 block">
                    <label className="font-bold text-slate-450 dark:text-slate-400 uppercase tracking-wider block">Nome do Beneficiário / Favorecido Completo</label>
                    <input 
                      type="text" value={pixReceiver} onChange={e => setPixReceiver(e.target.value)}
                      placeholder="Ex: LS GUARATO MATERIAIS DE CONSTRUCAO LTDA"
                      disabled={!pixEnabled}
                      className="w-full border border-slate-200 dark:border-slate-805 dark:bg-slate-950 px-4 py-2.5 rounded-xl disabled:opacity-50 text-xs focus:outline-none uppercase font-semibold text-slate-700 dark:text-slate-300"
                    />
                  </div>
                </div>
              </div>

            {/* Database Status & Config Panel */}
            {activeAgent.role === 'admin' && (
              <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
                <div>
                  <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm border-b border-slate-50 dark:border-slate-800 pb-3 flex items-center space-x-2">
                    <Database className="w-4 h-4 text-blue-500 animate-pulse" />
                    <span>Conexão & Integridade do Banco de Dados</span>
                  </h3>
                  <p className="text-[11px] text-slate-500 leading-relaxed mt-1.5 font-sans">
                    O robô de inteligência artificial e o painel de atendimento operam com sincronização em nuvem resiliente. Caso ocorra qualquer falha de rede ou de permissões, os dados são salvos localmente de forma transparente, eliminando quedas ou erros de cadastro.
                  </p>
                </div>

                {/* DB Test Result Logs */}
                <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-100 dark:border-slate-800/80 space-y-3">
                  <div className="flex items-center justify-between text-xs pb-1 border-b border-slate-200/50 dark:border-slate-800/50">
                    <span className="font-bold text-slate-600 dark:text-slate-350">Status das Conexões</span>
                    <button
                      type="button"
                      onClick={runDbDiagnostics}
                      disabled={testingDb}
                      className="text-brand-sidebar hover:text-blue-700 disabled:opacity-50 font-bold flex items-center space-x-1 py-0.5 px-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${testingDb ? 'animate-spin' : ''}`} />
                      <span>{testingDb ? 'Testando...' : 'Re-testar Conexões'}</span>
                    </button>
                  </div>

                  {dbReport ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-sans">
                      {/* Supabase Status */}
                      <div className="p-3 bg-white dark:bg-slate-900 rounded-lg space-y-2 border border-slate-100 dark:border-slate-800">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-700 dark:text-slate-300">Supabase</span>
                          {dbReport.supabase?.configured ? (
                            dbReport.supabase?.connected ? (
                              <span className="px-1.5 py-0.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 font-extrabold text-[10px] rounded border border-emerald-100 uppercase">Conectado</span>
                            ) : (
                              <span className="px-1.5 py-0.5 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 font-extrabold text-[10px] rounded border border-red-100 uppercase">Falha</span>
                            )
                          ) : (
                            <span className="px-1.5 py-0.5 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 font-extrabold text-[10px] rounded border border-amber-100 uppercase">Não Configurado</span>
                          )}
                        </div>
                        {dbReport.supabase?.configured && (
                          <div className="space-y-1 text-[11px] font-mono text-slate-500">
                            <p className="truncate">URL: {dbReport.supabase.url}</p>
                            {dbReport.supabase.latency_ms && <p>Latência: {dbReport.supabase.latency_ms}ms</p>}
                            {dbReport.supabase.error && (
                              <p className="text-red-650 dark:text-red-400 font-sans break-all bg-red-50/50 dark:bg-red-950/30 p-1.5 rounded text-[10px] leading-snug">
                                Erro: {dbReport.supabase.error}
                              </p>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Firebase Status */}
                      <div className="p-3 bg-white dark:bg-slate-900 rounded-lg space-y-2 border border-slate-100 dark:border-slate-800">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-700 dark:text-slate-300">Firebase Firestore</span>
                          {dbReport.firebase?.connected ? (
                            <span className="px-1.5 py-0.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 font-extrabold text-[10px] rounded border border-emerald-100 uppercase">Conectado</span>
                          ) : (
                            <span className="px-1.5 py-0.5 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 font-extrabold text-[10px] rounded border border-red-100 uppercase">Erro de Permissão</span>
                          )}
                        </div>
                        <div className="space-y-1 text-[11px] font-mono text-slate-500 font-sans">
                          <p>Modo: Nativo / ID Padrão</p>
                          {dbReport.firebase?.latency_ms && <p>Latência: {dbReport.firebase.latency_ms}ms</p>}
                          {dbReport.firebase?.error && (
                            <p className="text-red-650 dark:text-red-400 font-sans break-all bg-red-50/50 dark:bg-red-950/30 p-1.5 rounded text-[10px] leading-snug">
                              Erro: {dbReport.firebase.error}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Local Fallback Stats */}
                      <div className="col-span-1 md:col-span-2 p-3 bg-blue-50/20 dark:bg-blue-950/10 rounded-lg space-y-1.5 border border-blue-100/30">
                        <div className="font-bold text-slate-700 dark:text-slate-300 flex items-center space-x-1.5">
                          <CheckCircle className="w-3.5 h-3.5 text-blue-500" />
                          <span>Banco de Dados Local de Contingência (db.json)</span>
                        </div>
                        <p className="text-[10px] text-slate-500 leading-normal">
                          Como especialista em infraestrutura de dados chatbot, todas as transações são gravadas em disco local de contingência. Veja o volume ativo de registros:
                        </p>
                        <div className="grid grid-cols-3 max-w-sm gap-2 pt-1 font-mono text-[10px] text-slate-500 font-sans">
                          <div>Setores: {dbReport.local_fallback?.records_count?.sectors ?? 0}</div>
                          <div>Usuários: {dbReport.local_fallback?.records_count?.users ?? 0}</div>
                          <div>Conversas: {dbReport.local_fallback?.records_count?.conversations ?? 0}</div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-4 text-xs text-slate-400 font-semibold flex items-center justify-center space-x-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-brand-sidebar" />
                      <span>Carregando dados estruturais do banco de dados especialista...</span>
                    </div>
                  )}
                </div>

                {/* Form to edit Supabase connection */}
                <div className="border-t border-slate-50 dark:border-slate-805 pt-5 space-y-4">
                  <h4 className="font-bold text-slate-700 dark:text-slate-200 text-xs flex items-center space-x-1.5">
                    <span>Configurar Conexão do Supabase Pro</span>
                  </h4>

                  {supaConfigError && (
                    <div className="bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 p-3 rounded-lg text-xs font-semibold select-text">
                      Erro: {supaConfigError}
                    </div>
                  )}

                  {supaConfigSuccess && (
                    <div className="bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 p-3 rounded-lg text-xs font-extrabold select-text border border-emerald-100 dark:border-emerald-900">
                      ✓ {supaConfigSuccess}
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-sans">
                    <div className="space-y-1">
                      <label className="font-bold text-slate-450 dark:text-slate-400 uppercase tracking-wider block">Supabase Project URL</label>
                      <input 
                        type="text" 
                        value={supaUrl} 
                        onChange={e => setSupaUrl(e.target.value)}
                        placeholder="Ex: https://xyz.supabase.co"
                        className="w-full border border-slate-200 dark:border-slate-805 dark:bg-slate-950 px-4 py-2.5 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="font-bold text-slate-450 dark:text-slate-400 uppercase tracking-wider block">Supabase Anon Key / Service Role Key</label>
                      <input 
                        type="password" 
                        value={supaKey} 
                        onChange={e => setSupaKey(e.target.value)}
                        placeholder="Digitar chave secreta para atualizar..."
                        className="w-full border border-slate-200 dark:border-slate-805 dark:bg-slate-950 px-4 py-2.5 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex justify-start">
                    <button
                      type="button"
                      disabled={savingSupaConfig}
                      onClick={handleSaveSupaConfig}
                      className="bg-brand-sidebar hover:bg-blue-800 text-white font-black text-[10px] uppercase tracking-wider px-4 py-2.5 rounded-xl shadow transition duration-300 disabled:opacity-40 cursor-pointer"
                    >
                      {savingSupaConfig ? 'Salvando Configuração...' : 'Salvar e Alternar Banco'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Database Maintenance Section */}
            {activeAgent.role === 'admin' && (
              <div className="bg-red-50/50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/60 rounded-2xl p-6 shadow-xs space-y-5">
                <div>
                  <h3 className="font-bold text-red-800 dark:text-red-400 text-sm border-b border-red-100/35 dark:border-red-900/40 pb-3 flex items-center space-x-1.5">
                    <Trash2 className="w-4 h-4 text-red-500" />
                    <span>Manutenção de Dados (Começar Testes Reais)</span>
                  </h3>
                  <p className="text-[11px] text-red-700 dark:text-slate-400 leading-relaxed mt-1.5">
                    Esta ferramenta apaga permanentemente **todas as conversas, mensagens e itens em fila**. Use esta ação com cuidado para limpar o histórico fictício do sistema e iniciar os seus testes reais com clientes de verdade. Os usuários, setores e configurações serão preservados.
                  </p>
                </div>

                <div className="pt-2 space-y-3 text-xs font-sans">
                  {clearStatus === 'success' && (
                    <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900 p-3 rounded-xl text-emerald-700 dark:text-emerald-400 font-bold mb-3">
                      ✓ Histórico de conversas limpo com sucesso! Recarregando aplicação...
                    </div>
                  )}

                  {clearStatus === 'error' && (
                    <div className="bg-red-100 dark:bg-red-900/40 border border-red-200 dark:border-red-850 p-3 rounded-xl text-red-700 dark:text-red-400 font-bold mb-3">
                      X Erro ao realizar a limpeza do banco de dados. Tente novamente.
                    </div>
                  )}

                  {!showClearConfirm ? (
                    <button
                      type="button"
                      onClick={() => setShowClearConfirm(true)}
                      className="bg-red-650 hover:bg-red-700 text-white font-extrabold px-4 py-2.5 rounded-xl text-xs transition inline-flex items-center space-x-2"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Limpar Histórico de Mensagens</span>
                    </button>
                  ) : (
                    <div className="bg-white dark:bg-slate-950 border border-red-200 dark:border-red-900/50 p-4 rounded-xl space-y-3 max-w-md">
                      <p className="font-bold text-slate-800 dark:text-slate-200 text-xs">Atenção! Esta ação é irreversível.</p>
                      <p className="text-[11px] text-slate-500 leading-normal">
                        Para confirmar a exclusão definitiva de todo o histórico de conversas e mensagens de teste, digite <strong className="text-red-600 font-extrabold font-mono text-sm uppercase">APAGAR</strong> no campo abaixo:
                      </p>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="text"
                          value={clearInput}
                          onChange={e => setClearInput(e.target.value)}
                          placeholder="Digite APAGAR para prosseguir"
                          className="flex-1 border border-slate-200 dark:border-slate-800 dark:bg-slate-900 px-3 py-1.5 rounded-lg text-xs font-mono uppercase tracking-widest focus:outline-none"
                        />
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            disabled={clearInput !== 'APAGAR' || clearing}
                            onClick={handleClearAllData}
                            className="bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white font-extrabold px-3 py-1.5 rounded-lg text-xs transition flex-1 sm:flex-none cursor-pointer"
                          >
                            {clearing ? 'Apagando...' : 'Confirmar Limpeza'}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setShowClearConfirm(false); setClearInput(''); }}
                            className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 font-bold px-3 py-1.5 rounded-lg text-xs text-slate-700 dark:text-slate-350 cursor-pointer"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            <button
              type="submit" disabled={loading}
              className="w-full bg-brand-primary hover:bg-brand-primary-dark text-brand-agent-text font-extrabold py-3 rounded-2xl transition cursor-pointer flex items-center justify-center space-x-2 shadow-md hover:shadow-lg hover:scale-[1.002]"
            >
              <Save className="w-4 h-4" />
              <span>{loading ? 'Salvando...' : 'Salvar Alterações e Atualizar Robô'}</span>
            </button>
          </form>
        </div>

        {/* Sync WhatsApp Sidebar component */}
        <div className="space-y-6">
          <QrCodeWhatsApp 
            status={whatsAppStatus} 
            onSync={onWhatsSync} 
            onDisconnect={onWhatsDisconnect} 
          />
          <div className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider text-center pt-2 select-none">
            Desenvolvido via Plataforma BAILEYS
          </div>
        </div>
      </div>
    </div>
  );
}
