import React, { useState, useEffect, useRef } from 'react';
import { 
  Phone, User as UserIcon, Send, ArrowRightLeft, Sparkles, Smile, Compass, LogIn, CheckCircle, X,
  Tag, Trash2, Clock, DollarSign, Bot, HelpCircle, MessageSquare, RefreshCw,
  Globe, Briefcase, Truck, PhoneCall, Newspaper, ShoppingBag, CreditCard, Receipt, FileText, AlertCircle, Paperclip, Kanban
} from 'lucide-react';
import { Conversation, Message, Sector, User as AppUser, Settings as GlobalSettings } from '../types/index.js';
import { formatBrazilianPhone, renderCustomerDisplayName } from '../lib/phoneFormatter';
import { generatePixCopiaCola } from '../lib/pixGenerator';
import { isWithinBusinessHours } from '../lib/schedule';

interface ActiveChatsProps {
  conversations: Conversation[];
  sectors: Sector[];
  users: AppUser[];
  settings?: GlobalSettings | null;
  activeAgent: AppUser;
  onSendMessage: (convId: string, text: string, senderType?: 'customer' | 'agent') => Promise<any>;
  onSendMedia?: (convId: string, file: File, caption?: string) => Promise<any>;
  onAssumeConversation: (convId: string, attendantId: string) => Promise<any>;
  onTransferConversation: (convId: string, sectorId: string | null, attendantId: string | null) => Promise<any>;
  onWaitConversation: (convId: string) => Promise<any>;
  onCloseConversation: (convId: string) => Promise<any>;
  onDeleteConversation: (convId: string) => Promise<any>;
  onUpdateConversationTags: (convId: string, tags: string[]) => Promise<any>;
  onSimulateConversation: (data: any) => Promise<any>;
  newMessageSignal?: Message | null;
}

export default function ActiveChats({
  conversations,
  sectors,
  users,
  settings,
  activeAgent,
  onSendMessage,
  onSendMedia,
  onAssumeConversation,
  onTransferConversation,
  onWaitConversation,
  onCloseConversation,
  onDeleteConversation,
  onUpdateConversationTags,
  onSimulateConversation,
  newMessageSignal
}: ActiveChatsProps) {
  const [selectedConvId, setSelectedConvId] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);

  // New Chat Modal state
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newChatPhone, setNewChatPhone] = useState('');
  const [newChatName, setNewChatName] = useState('');
  const [newChatLoading, setNewChatLoading] = useState(false);

  // Confirmation states to avoid window.confirm in iframe
  const [confirmWaitId, setConfirmWaitId] = useState<string | null>(null);
  const [confirmCloseId, setConfirmCloseId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Modals & Dropdowns states
  const [transferOpen, setTransferOpen] = useState(false);
  const [targetSector, setTargetSector] = useState('');
  const [targetAgent, setTargetAgent] = useState('');
  
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false);
  const [pixBillingOpen, setPixBillingOpen] = useState(false);
  const [pixValueString, setPixValueString] = useState('');
  const [pixTargetId, setPixTargetId] = useState<string | null>(null);

  // Client simulation panel state
  const [simPanelOpen, setSimPanelOpen] = useState(false);
  const [simName, setSimName] = useState('Carlos Alvarenga');
  const [simPhone, setSimPhone] = useState('(34) 98765-4321');
  const [simSector, setSimSector] = useState('');
  const [simCharacter, setSimCharacter] = useState('Cliente urgente querendo cotar 10 mil tijolos e 50 sacos de cimento para entregar no Morumbi.');

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Kanban States
  const [viewMode, setViewMode] = useState<'chat' | 'kanban'>('chat');
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const [kanbanHoverColumn, setKanbanHoverColumn] = useState<string | null>(null);
  const [previewConvId, setPreviewConvId] = useState<string | null>(null); // For slide-over drawer in Kanban
  const [previewMessages, setPreviewMessages] = useState<Message[]>([]);
  const [previewInput, setPreviewInput] = useState('');
  const [previewSending, setPreviewSending] = useState(false);
  const [previewFileInputRef] = [useRef<HTMLInputElement>(null)];

  // active selected conversation details
  const activeConv = conversations.find(c => c.id === selectedConvId);
  const previewConv = conversations.find(c => c.id === previewConvId);

  // Check if current time is within business hours
  const isBusinessHours = settings?.schedules ? isWithinBusinessHours(settings.schedules) : true;

  // Check if the out-of-hours message has been sent in the active conversation
  const outOfHoursMsgSent = !isBusinessHours && messages.some(m => 
    m.sender_type === 'system' && 
    (settings?.out_of_hours_message 
      ? m.message === settings.out_of_hours_message 
      : (m.message.includes("horário de atendimento") || m.message.includes("horário") || m.message.includes("expediente")))
  );

  // Check if the out-of-hours message has been sent in the previewed conversation
  const previewOutOfHoursMsgSent = !isBusinessHours && previewMessages.some(m => 
    m.sender_type === 'system' && 
    (settings?.out_of_hours_message 
      ? m.message === settings.out_of_hours_message 
      : (m.message.includes("horário de atendimento") || m.message.includes("horário") || m.message.includes("expediente")))
  );

  // Kanban board Column definitions
  const KANBAN_COLUMNS = [
    { id: 'col_chatbot', title: '🤖 Central Robot', description: 'Atendimento Automático pelo Robô' },
    { id: 'col_waiting', title: '🕒 Fila de Espera', description: 'Aguardando assumir' },
    { id: 'col_active_general', title: '💬 Em Atendimento', description: 'Geral ativo' },
    { id: 'col_cobranca_pending', title: '💰 Pendente Cobrança', description: 'Separando boleto / aguardando' },
    { id: 'col_invoice_sent', title: '🧾 Boleto / NF Enviada', description: 'Enviado para o cliente' },
    { id: 'col_pix_complete', title: '✅ FINALIZADO', description: 'Atendimento finalizado com sucesso' }
  ];

  // Map conversation to a Kanban Column
  const getKanbanColumn = (c: Conversation): string => {
    if (c.status === 'chatbot') return 'col_chatbot';
    if (c.status === 'waiting') return 'col_waiting';
    
    const tags = c.tags || [];
    if (tags.includes('Acordo Feito') || tags.includes('FINALIZADO') || tags.includes('Finalizado')) return 'col_pix_complete';
    if (tags.includes('Boleto Enviado') || tags.includes('NF Emitida')) return 'col_invoice_sent';
    if (tags.includes('Pendente Cobrança')) return 'col_cobranca_pending';
    
    return 'col_active_general';
  };

  const moveConversationToColumn = async (convId: string, colId: string) => {
    const conv = conversations.find(c => c.id === convId);
    if (!conv) return;

    try {
      if (colId === 'col_chatbot') {
        // Return to robot / chatbot
        await fetch(`/api/conversations/${convId}/bot`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_email: activeAgent.email,
            user_name: activeAgent.name
          })
        });
        const otherTags = (conv.tags || []).filter(t => !['Pendente Cobrança', 'Boleto Enviado', 'NF Emitida', 'Acordo Feito', 'FINALIZADO', 'Finalizado'].includes(t));
        await onUpdateConversationTags(convId, otherTags);
      } else if (colId === 'col_waiting') {
        // Return to waiting queue
        await onWaitConversation(convId);
        const otherTags = (conv.tags || []).filter(t => !['Pendente Cobrança', 'Boleto Enviado', 'NF Emitida', 'Acordo Feito', 'FINALIZADO', 'Finalizado'].includes(t));
        await onUpdateConversationTags(convId, otherTags);
      } else if (colId === 'col_active_general') {
        // Normal active operator chat
        if (conv.status !== 'active') {
          await onAssumeConversation(convId, activeAgent.id);
        }
        const otherTags = (conv.tags || []).filter(t => !['Pendente Cobrança', 'Boleto Enviado', 'NF Emitida', 'Acordo Feito', 'FINALIZADO', 'Finalizado'].includes(t));
        await onUpdateConversationTags(convId, otherTags);
      } else if (colId === 'col_cobranca_pending') {
        // Pending billing/collection
        if (conv.status !== 'active') {
          await onAssumeConversation(convId, activeAgent.id);
        }
        if (conv.sector_id !== 'sec_cobranca') {
          await onTransferConversation(convId, 'sec_cobranca', activeAgent.id);
        }
        const otherTags = (conv.tags || []).filter(t => !['Boleto Enviado', 'NF Emitida', 'Acordo Feito', 'FINALIZADO', 'Finalizado'].includes(t));
        if (!otherTags.includes('Pendente Cobrança')) {
          otherTags.push('Pendente Cobrança');
        }
        await onUpdateConversationTags(convId, otherTags);
      } else if (colId === 'col_invoice_sent') {
        // Boleto/NF Sent
        if (conv.status !== 'active') {
          await onAssumeConversation(convId, activeAgent.id);
        }
        if (conv.sector_id !== 'sec_cobranca') {
          await onTransferConversation(convId, 'sec_cobranca', activeAgent.id);
        }
        const otherTags = (conv.tags || []).filter(t => !['Pendente Cobrança', 'Acordo Feito', 'FINALIZADO', 'Finalizado'].includes(t));
        if (!otherTags.includes('Boleto Enviado')) {
          otherTags.push('Boleto Enviado');
        }
        await onUpdateConversationTags(convId, otherTags);
      } else if (colId === 'col_pix_complete') {
        // Payment complete/FINALIZADO
        if (conv.status !== 'active') {
          await onAssumeConversation(convId, activeAgent.id);
        }
        if (conv.sector_id !== 'sec_cobranca') {
          await onTransferConversation(convId, 'sec_cobranca', activeAgent.id);
        }
        const otherTags = (conv.tags || []).filter(t => !['Pendente Cobrança', 'Boleto Enviado', 'NF Emitida'].includes(t));
        if (!otherTags.includes('FINALIZADO')) {
          otherTags.push('FINALIZADO');
        }
        await onUpdateConversationTags(convId, otherTags);
      }
    } catch (err) {
      console.error("Erro ao alterar coluna Kanban:", err);
    }
  };

  // Preview message sync for preview drawer
  useEffect(() => {
    if (previewConvId) {
      fetch(`/api/messages/${previewConvId}?t=${Date.now()}`)
        .then(res => res.json())
        .then(data => setPreviewMessages(data))
        .catch(err => console.error("Erro ao buscar mensagens de preview:", err));

      // Handle periodic check or message signaling
    } else {
      setPreviewMessages([]);
    }
  }, [previewConvId]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && selectedConvId && onSendMedia) {
      const caption = prompt("Deseja adicionar uma legenda ao arquivo?", "");
      await onSendMedia(selectedConvId, file, caption || "");
      // Clear input
      if (e.target) e.target.value = "";
    }
  };

  // Refetch when conversation list changes (to ensure last message sync in sidebars etc)
  useEffect(() => {
    if (selectedConvId) {
      fetch(`/api/messages/${selectedConvId}?t=${Date.now()}`)
        .then(res => res.json())
        .then(data => setMessages(data))
        .catch(err => console.error("Erro ao buscar mensagens:", err));
    } else {
      setMessages([]);
    }
  }, [selectedConvId]); // Removed 'conversations' from dependency to avoid excessive refetching of all messages

  // Handle instant message signal from SSE
  useEffect(() => {
    if (newMessageSignal && newMessageSignal.conversation_id === selectedConvId) {
      // Avoid duplicates if SSE signal arrives after a manual send or fetch
      setMessages(prev => {
        if (prev.some(m => m.id === newMessageSignal.id)) return prev;
        return [...prev, newMessageSignal];
      });
    }
  }, [newMessageSignal, selectedConvId]);

  // Auto scroll to latest text bubble
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeConv?.typing]);

  const handleSendSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !selectedConvId || sending) return;

    setSending(true);
    try {
      await onSendMessage(selectedConvId, inputText, 'agent');
      setInputText('');
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  };

  const sendQuickMessage = async (text: string) => {
    if (!selectedConvId || sending) return;
    setSending(true);
    
    try {
      // Start typing indicator
      await fetch(`/api/conversations/${selectedConvId}/typing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ typing: true })
      });

      // Wait 4 seconds as requested
      await new Promise(resolve => setTimeout(resolve, 4000));

      // Stop typing and send message
      await fetch(`/api/conversations/${selectedConvId}/typing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ typing: false })
      });

      await onSendMessage(selectedConvId, text, 'agent');
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  };

  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedConvId) return;

    try {
      await onTransferConversation(selectedConvId, targetSector || null, targetAgent || null);
      setTransferOpen(false);
      setSelectedConvId('');
    } catch (err) {
      console.error(err);
    }
  };

  const openPixBilling = (convId: string) => {
    setPixTargetId(convId);
    setPixValueString('');
    setPixBillingOpen(true);
  };

  const handlePixSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetId = pixTargetId || selectedConvId;
    if (!targetId || !settings) return;

    const valueStr = pixValueString.trim();
    if (!valueStr) {
      alert("Por favor, digite o valor da cobrança.");
      return;
    }

    // Converter o valor string (ex: '10,50' ou '1.500,00') para número float correto
    const cleanVal = valueStr.replace(/\./g, '').replace(',', '.');
    const amount = parseFloat(cleanVal);
    let pixCode = '';

    if (!isNaN(amount) && amount > 0) {
      try {
        pixCode = generatePixCopiaCola({
          key: settings.pix_key || '',
          receiver: settings.pix_receiver || 'LS GUARATO LTDA',
          city: settings.pix_bank || 'SAO PAULO',
          amount: amount
        });
      } catch (err) {
        console.error("Erro ao gerar o código EMV do PIX:", err);
      }
    }

    let messageContent = '';

    if (pixCode) {
      messageContent = `💸 LS GUARATO - COBRANÇA PIX 💸\n--------------------------------------\n🧾 Favorecido: ${settings.pix_receiver || 'LS GUARATO LTDA'}\n🏦 Banco: ${settings.pix_bank || 'Banco de Destino'}\n💰 Valor: R$ ${valueStr}\n🔑 Pix Copia e Cola:\n${pixCode}\n\nPor favor, efetue o pagamento e envie o comprovante por aqui.`;
    } else {
      messageContent = `💸 LS GUARATO - COBRANÇA PIX 💸\n--------------------------------------\n🧾 Favorecido: ${settings.pix_receiver || 'LS GUARATO LTDA'}\n🏦 Banco: ${settings.pix_bank || 'Banco de Destino'}\n💰 Valor: R$ ${valueStr}\n🔑 Chave PIX: ${settings.pix_key || ''}\n\nPor favor, efetue o pagamento e envie o comprovante por aqui.`;
    }

    try {
      await onSendMessage(targetId, messageContent, 'agent');
      
      // If we are in Kanban preview, refresh messages
      if (targetId === previewConvId) {
        const res = await fetch(`/api/messages/${targetId}`);
        setPreviewMessages(await res.json());
      }
    } catch (err) {
      console.error("Error sending PIX info", err);
    } finally {
      setPixBillingOpen(false);
      setPixValueString('');
      setPixTargetId(null);
    }
  };

  const handleSimulateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = {
        name: simName,
        phone: simPhone,
        sectorId: simSector || null,
        character: simCharacter
      };
      const createdConv = await onSimulateConversation(data);
      if (createdConv?.id) {
        setSelectedConvId(createdConv.id);
      }
      setSimPanelOpen(false);
    } catch (e) {
      console.error(e);
    }
  };

  const handleNewChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChatPhone.trim() || newChatLoading) return;
    
    setNewChatLoading(true);
    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newChatName || 'Novo Contato',
          phone: newChatPhone.replace(/\D/g, '')
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erro ao iniciar chat');
      }

      const conv = await res.json();
      setSelectedConvId(conv.id);
      setViewMode('chat');
      setNewChatOpen(false);
      setNewChatPhone('');
      setNewChatName('');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setNewChatLoading(false);
    }
  };

  // Agent role permission routing filter
  const isAccessibleForAgent = (c: Conversation) => {
    if (activeAgent.role === 'admin' || activeAgent.role === 'access_total') return true;
    
    // Chats assigned to me or explicitly transferred to me
    if (c.attendant_id === activeAgent.id) return true;
    
    // ENTRY pool chats (waiting in robot or queue) MUST be visible to all agents 
    // so they can see newcomers and assume/take over chats.
    if (c.status === 'chatbot' || c.status === 'waiting') return true;
    
    return false;
  };

  // Filter conversations categorized in queues
  const activeChats = conversations.filter(c => c.status === 'active' && isAccessibleForAgent(c));
  const waitingChats = conversations.filter(c => c.status === 'waiting' && isAccessibleForAgent(c));
  const robotChats = conversations.filter(c => c.status === 'chatbot' && isAccessibleForAgent(c));
  const closedChats = conversations.filter(c => c.status === 'closed' && isAccessibleForAgent(c));

  return (
    <div className="flex h-full border border-slate-100 dark:border-slate-800 rounded-3xl bg-slate-50 dark:bg-slate-950 overflow-hidden shadow-sm">
      
      {/* 1. LEFT SIDEBAR: Conversas por estado / Fila */}
      <div className="w-80 border-r border-slate-100 dark:border-slate-900 bg-white dark:bg-slate-950 flex flex-col justify-between">
        
        {/* State filters & totals */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-50 dark:border-slate-900 pb-3">
            <h3 className="font-extrabold text-brand-title dark:text-brand-title text-xs uppercase tracking-wider">Fila de Atendimento</h3>
            <div className="flex gap-2">
              <button 
                onClick={() => setSimPanelOpen(true)}
                className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold text-[10px] uppercase tracking-wider px-2 py-1.5 rounded-lg flex items-center transition cursor-pointer"
                title="Simular Mensagem de Cliente"
              >
                <Smile className="w-3.5 h-3.5" />
              </button>
              <button 
                onClick={() => setNewChatOpen(true)}
                className="bg-brand-primary text-brand-agent-text font-bold text-[10px] uppercase tracking-wider px-2.5 py-1.5 rounded-lg flex items-center space-x-1.5 transition cursor-pointer shadow-sm hover:bg-brand-primary-dark"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Novo Chat</span>
              </button>
            </div>
          </div>

          {/* Mode Switcher */}
          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 dark:bg-slate-900/40 rounded-xl select-none">
            <button
              onClick={() => setViewMode('chat')}
              className={`py-1.5 text-[10px] uppercase tracking-wider font-extrabold rounded-lg transition-all duration-200 cursor-pointer flex items-center justify-center space-x-1.5 ${
                viewMode === 'chat' 
                  ? 'bg-white dark:bg-slate-800 text-brand-sidebar shadow-xs' 
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <span>💬 Chats ({robotChats.length + waitingChats.length + activeChats.length})</span>
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`py-1.5 text-[10px] uppercase tracking-wider font-extrabold rounded-lg transition-all duration-200 cursor-pointer flex items-center justify-center space-x-1.5 ${
                viewMode === 'kanban' 
                  ? 'bg-white dark:bg-slate-800 text-brand-sidebar shadow-xs' 
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Kanban className="w-3 h-3" />
              <span>📋 Kanban ({robotChats.length + waitingChats.length + activeChats.length})</span>
            </button>
          </div>

          {/* Section: CHATBOT INTERACTING (NEW ARRIVALS) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[10px] uppercase font-bold tracking-wider text-red-600">
              <span className="flex items-center space-x-1.5"><Bot className="w-3.5 h-3.5" /> <span>Recém Chegados (Robô)</span></span>
              <span className="bg-red-600 text-white px-2 py-0.5 rounded animate-pulse">{robotChats.length}</span>
            </div>
            <div className="space-y-1">
              {robotChats.length === 0 ? (
                <div className="text-[11px] text-slate-400 p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-dashed border-slate-100 dark:border-slate-800">
                  Nenhum novo contato no robô.
                </div>
              ) : (
                robotChats.map(c => (
                  <button
                    key={c.id} onClick={() => {
                      setSelectedConvId(c.id);
                      setViewMode('chat');
                    }}
                    className={`w-full text-left p-3 rounded-xl border transition flex flex-col gap-1.5 select-none hover:bg-slate-50 dark:hover:bg-slate-900 ${
                      c.id === selectedConvId ? 'bg-brand-primary/10 border-brand-primary/30 dark:bg-brand-primary/20 dark:border-brand-primary/50 font-bold' : 'bg-transparent border-transparent'
                    }`}
                  >
                    <div className="flex justify-between items-start w-full">
                      <span className="text-xs text-slate-700 dark:text-slate-350 truncate pr-2 flex-1 animate-fade-in font-semibold">
                        {renderCustomerDisplayName(c.customer_name, c.customer_phone)}
                      </span>
                      <span className="text-[9px] uppercase font-black text-white bg-red-600 px-2 py-1 rounded shadow-[0_0_10px_rgba(220,38,38,0.4)] animate-pulse shrink-0">Novo</span>
                    </div>
                    <div className="text-[10px] text-slate-450 dark:text-slate-500 truncate font-normal leading-tight">{c.last_message}</div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Section: WAITING IN QUEUE */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[10px] uppercase font-bold tracking-wider text-amber-600">
              <span className="flex items-center space-x-1.5"><span>●</span> <span>Esperando Atendente</span></span>
              <span className="bg-amber-600 text-white px-2 py-0.5 rounded animate-pulse">{waitingChats.length}</span>
            </div>
            <div className="space-y-1">
              {waitingChats.length === 0 ? (
                <div className="text-[11px] text-slate-400 p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-dashed border-slate-100 dark:border-slate-800">
                  Fila vazia no momento.
                </div>
              ) : (
                waitingChats.map(c => (
                  <button
                    key={c.id} onClick={() => {
                      setSelectedConvId(c.id);
                      setViewMode('chat');
                    }}
                    className={`w-full text-left p-3 rounded-xl border transition flex flex-col gap-1.5 select-none hover:bg-slate-50 dark:hover:bg-slate-900 ${
                      c.id === selectedConvId ? 'bg-amber-50 border-amber-200 dark:bg-amber-950 dark:border-amber-900 font-bold' : 'bg-transparent border-transparent'
                    }`}
                  >
                    <div className="flex justify-between items-start w-full">
                      <span className="text-xs text-slate-800 dark:text-slate-200 truncate pr-2 flex-1 font-semibold">
                        {renderCustomerDisplayName(c.customer_name, c.customer_phone)}
                      </span>
                      <span className="text-[9px] uppercase font-black text-white bg-amber-500 px-2 py-1 rounded shadow-sm shrink-0 border border-amber-600">Fila</span>
                    </div>
                    <div className="text-[10px] text-slate-400 truncate font-normal leading-tight">{c.last_message || 'Contato iniciado'}</div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Section: ACTIVE WITH AGENTS */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[10px] uppercase font-bold tracking-wider text-emerald-500">
              <span className="flex items-center space-x-1.5"><span>●</span> <span>Em Atendimento</span></span>
              <span>{activeChats.length}</span>
            </div>
            <div className="space-y-1">
              {activeChats.length === 0 ? (
                <div className="text-[11px] text-slate-400 p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-dashed border-slate-100 dark:border-slate-800">
                  Nenhum contato em andamento.
                </div>
              ) : (
                activeChats.map(c => {
                  const isAssignedToMe = c.attendant_id === activeAgent.id;
                  return (
                    <button
                      key={c.id} onClick={() => {
                        setSelectedConvId(c.id);
                        setViewMode('chat');
                      }}
                      className={`w-full text-left p-3 rounded-xl border transition flex flex-col gap-1.5 select-none hover:bg-slate-50 dark:hover:bg-slate-900 ${
                        c.id === selectedConvId ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950 dark:border-emerald-900 font-bold' : 'bg-transparent border-transparent'
                      }`}
                    >
                      <div className="flex justify-between items-start w-full gap-2">
                        <span className="text-xs text-slate-800 dark:text-slate-200 truncate flex-1 font-semibold">
                          {renderCustomerDisplayName(c.customer_name, c.customer_phone)}
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className={`text-[9px] uppercase font-black px-2 py-1 rounded shadow-sm ${isAssignedToMe ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                            {isAssignedToMe ? 'Meu Chat' : 'Outro'}
                          </span>
                          {c.sector_id === 'sec_cobranca' && (
                            <span className="text-[9px] bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 px-1 py-0.5 rounded flex items-center gap-0.5 shadow-xs">
                              <DollarSign className="w-2 h-2" />
                              FIN
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-[10px] text-slate-400 truncate font-normal leading-tight">{c.last_message}</div>
                      {c.typing && (
                        <span className="text-[9px] font-extrabold text-emerald-500 animate-pulse uppercase leading-none mt-1">Digitando...</span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Section: CLOSED CHATS */}
          <div className="space-y-2 border-t border-slate-50 dark:border-slate-900 pt-3">
            <details className="group">
              <summary className="flex items-center justify-between text-[10px] uppercase font-extrabold tracking-wider text-slate-400 cursor-pointer select-none">
                <span>Histórico de Encerrados</span>
                <span className="bg-slate-50 dark:bg-slate-905 px-2 py-0.5 rounded">{closedChats.length}</span>
              </summary>
              <div className="space-y-1 mt-2">
                {closedChats.length === 0 ? (
                  <div className="text-[10px] text-slate-400 p-2 text-center">vazio</div>
                ) : (
                  closedChats.map(c => (
                    <button
                      key={c.id} onClick={() => {
                        setSelectedConvId(c.id);
                        setViewMode('chat');
                      }}
                      className="w-full text-left p-2.5 rounded-lg text-[11px] hover:bg-slate-50 dark:hover:bg-slate-900 flex justify-between gap-2 select-none"
                    >
                      <span className="truncate flex-1 text-slate-500 dark:text-slate-400 font-medium">
                        {renderCustomerDisplayName(c.customer_name, c.customer_phone)}
                      </span>
                      <span className="text-[8px] uppercase font-bold text-slate-400 shrink-0">Fim</span>
                    </button>
                  ))
                )}
              </div>
            </details>
          </div>

        </div>

        {/* Current logged active operator profile footer info */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-905 bg-slate-50/50 dark:bg-slate-950/40 flex items-center space-x-3.5">
          {activeAgent.photo && activeAgent.photo.length < 10 && !activeAgent.photo.includes('/') && !activeAgent.photo.includes('.') ? (
            <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-xl ring-2 ring-slate-300">
              {activeAgent.photo}
            </div>
          ) : (
            <img 
              src={activeAgent.photo || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=faces"} 
              alt={activeAgent.name} 
              className="w-10 h-10 rounded-xl object-cover ring-2 ring-slate-205"
            />
          )}
          <div className="space-y-0.5 text-xs select-none">
            <div className="font-bold text-slate-800 dark:text-slate-100 flex items-center space-x-1">
              <span>{activeAgent.name.split(' ')[0]}</span>
              <span className="text-[10px] bg-brand-primary/10 text-brand-sidebar dark:bg-brand-primary/20 px-1.5 py-0.2 rounded font-extrabold uppercase">{activeAgent.role}</span>
            </div>
            <div className="text-[10px] text-slate-450 font-bold leading-none uppercase">Setor: {sectors.find(s => s.id === activeAgent.sector_id)?.name || "Todos / Geral"}</div>
          </div>
        </div>

      </div>

      {/* 2. MAIN ACTIVE PANEL: Conversa ativa + Histórico */}
      <div className="flex-1 bg-white dark:bg-slate-950 flex flex-col justify-between overflow-hidden">
        
        {viewMode === 'kanban' ? (
          <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950 overflow-hidden relative">
            {/* Kanban Header */}
            <div className="flex-shrink-0 border-b border-slate-100 dark:border-slate-900 bg-white dark:bg-slate-950 p-4 flex justify-between items-center z-10 shadow-xs">
              <div>
                <h2 className="font-extrabold text-sm text-slate-850 dark:text-slate-100 flex items-center space-x-2">
                  <Kanban className="w-4 h-4 text-brand-sidebar animate-pulse" />
                  <span>Painel Operacional Kanban - LS GUARATO</span>
                </h2>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mt-0.5">
                  Arraste os tickets para atualizar de forma rápida as etapas de cobrança e atendimento
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-200/40 dark:border-slate-800">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase">Setor: {sectors.find(s => s.id === activeAgent.sector_id)?.name || "Todos / Geral"}</span>
                </div>
                <button
                  onClick={() => setSimPanelOpen(true)}
                  className="bg-brand-primary/10 hover:bg-brand-primary/25 text-brand-sidebar font-bold text-[10px] uppercase tracking-wider px-3 py-1.5 rounded-lg flex items-center space-x-1.5 transition cursor-pointer"
                >
                  <Smile className="w-3.5 h-3.5" />
                  <span>Simular</span>
                </button>
              </div>
            </div>

            {/* Kanban columns scroll area */}
            <div className="flex-1 overflow-x-auto p-4 flex gap-4 items-stretch select-none">
              {KANBAN_COLUMNS.map(col => {
                const colConvs = conversations.filter(c => getKanbanColumn(c) === col.id && isAccessibleForAgent(c));
                
                return (
                  <div
                    key={col.id}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setKanbanHoverColumn(col.id);
                    }}
                    onDragLeave={() => setKanbanHoverColumn(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setKanbanHoverColumn(null);
                      if (draggingCardId) {
                        moveConversationToColumn(draggingCardId, col.id);
                      }
                    }}
                    className={`flex flex-col w-72 rounded-2xl border p-3 shrink-0 transition-all duration-200 ${
                      kanbanHoverColumn === col.id
                        ? 'border-brand-primary bg-brand-primary/5 dark:border-brand-primary dark:bg-brand-primary/10 shadow-md scale-[1.005]'
                        : 'border-slate-200 dark:border-slate-800 bg-white/40 dark:bg-slate-900/40'
                    }`}
                  >
                    {/* Header Col details */}
                    <div className="flex items-center justify-between font-bold pb-2 border-b border-slate-100 dark:border-slate-850 mb-3">
                      <div className="truncate">
                        <span className="text-xs text-slate-800 dark:text-slate-200 font-extrabold tracking-wide uppercase">{col.title}</span>
                        <p className="text-[8px] text-slate-400 font-semibold leading-none mt-0.5">{col.description}</p>
                      </div>
                      <span className="text-[10px] bg-brand-primary/10 text-brand-sidebar dark:bg-brand-primary/25 px-2 py-0.5 rounded-full font-black">
                        {colConvs.length}
                      </span>
                    </div>

                    {/* Cards Column lists space */}
                    <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 max-h-[calc(100vh-230px)] custom-scrollbar">
                      {colConvs.length === 0 ? (
                        <div className="text-[10px] text-slate-400 text-center py-10 bg-slate-150/10 dark:bg-slate-900/10 border border-dashed border-slate-200 dark:border-slate-800/80 rounded-xl leading-relaxed select-none">
                          Nenhum ticket aqui.
                        </div>
                      ) : (
                        colConvs.map(c => {
                          const isAssignedToMe = c.attendant_id === activeAgent.id;
                          return (
                            <div
                              key={c.id}
                              draggable="true"
                              onDragStart={() => setDraggingCardId(c.id)}
                              onDragEnd={() => setDraggingCardId(null)}
                              className={`p-3 rounded-xl border bg-white dark:bg-slate-900 transition-all duration-205 hover:shadow-md cursor-grab active:cursor-grabbing border-slate-200 dark:border-slate-800 hover:border-brand-primary/40 ${
                                isAssignedToMe ? 'ring-1 ring-emerald-500/30 border-emerald-500/30 shadow-xs' : ''
                              }`}
                            >
                              {/* Header info */}
                              <div className="flex justify-between items-start gap-1 w-full mb-1">
                                <span className="text-xs font-extrabold text-slate-850 dark:text-slate-200 truncate flex-1 leading-snug">
                                   {renderCustomerDisplayName(c.customer_name, c.customer_phone)}
                                </span>
                                {c.typing && (
                                   <span className="text-[8px] bg-emerald-500/10 text-emerald-600 px-1.5 py-0.5 rounded font-extrabold animate-pulse">DIGITANDO...</span>
                                )}
                              </div>
                              <div className="text-[9px] font-bold font-mono text-slate-400 mb-2 leading-none">
                                 {formatBrazilianPhone(c.customer_phone)}
                              </div>

                              {/* Body content message short snippet */}
                              <div className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed mb-3">
                                 {c.last_message || 'Iniciado por WhatsApp'}
                              </div>

                              {/* Badge Tags of Conversation */}
                              {c.tags && c.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1 mb-3">
                                  {c.tags.map(tag => (
                                    <span key={tag} className="bg-brand-primary/10 text-brand-sidebar text-[8px] font-black px-1.5 py-0.5 rounded uppercase border border-brand-primary/20">
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              )}

                              {/* Footer details + Operators */}
                              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800/85">
                                <div className="text-[9px] text-slate-400 font-extrabold uppercase truncate max-w-[120px]">
                                  {c.attendant_id ? (users.find(u => u.id === c.attendant_id)?.name.split(' ')[0] || 'Outro') : 'Central / Robô'}
                                </div>
                                
                                <div className="flex items-center gap-1 shrink-0">
                                  <button 
                                    onClick={() => setPreviewConvId(c.id)}
                                    className="p-1.5 text-slate-500 hover:text-brand-sidebar bg-slate-50 hover:bg-brand-primary/10 dark:bg-slate-850 dark:hover:bg-brand-primary/25 rounded-lg transition cursor-pointer"
                                    title="Visualização Rápida no Board"
                                  >
                                    <Sparkles className="w-3.5 h-3.5" />
                                  </button>
                                  <button 
                                    onClick={() => {
                                      setSelectedConvId(c.id);
                                      setViewMode('chat');
                                    }}
                                    className="p-1.5 text-emerald-600 hover:text-white hover:bg-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 rounded-lg transition cursor-pointer"
                                    title="Abrir Chat Principal"
                                  >
                                    <Send className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Side preview log drawer inside Kanban */}
            {previewConvId && (
              <div className="absolute top-0 right-0 h-full w-80 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col z-20 animate-slide-in">
                {/* Drawer Header */}
                <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between">
                  <div className="truncate">
                    <h3 className="font-extrabold text-xs text-slate-800 dark:text-slate-100 truncate">
                      {(() => {
                        const pm = conversations.find(c => c.id === previewConvId);
                        return pm ? renderCustomerDisplayName(pm.customer_name, pm.customer_phone) : '';
                      })()}
                    </h3>
                    <p className="text-[9px] text-slate-400 font-mono">
                      {formatBrazilianPhone(conversations.find(c => c.id === previewConvId)?.customer_phone || '')}
                    </p>
                  </div>
                  <button 
                    onClick={() => setPreviewConvId(null)}
                    className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-850 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Messages Panel Scroll Area */}
                <div className="flex-1 overflow-y-auto p-3 space-y-2.5 bg-slate-50/50 dark:bg-slate-955/20 custom-scrollbar">
                  {previewMessages.length === 0 ? (
                    <div className="text-center py-10 text-[10px] text-slate-400 font-semibold uppercase">Nenhuma mensagem registrada.</div>
                  ) : (
                    previewMessages.map(msg => {
                      const isAgent = msg.sender_type === 'agent' || msg.sender_type === 'system';
                      return (
                        <div key={msg.id} className={`flex ${isAgent ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[210px] rounded-xl px-2.5 py-1.5 text-[10px] shadow-xs leading-normal ${
                            isAgent 
                              ? 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-br-none font-medium' 
                              : 'bg-white dark:bg-slate-850 text-slate-800 dark:text-slate-150 rounded-bl-none border border-slate-200 dark:border-slate-800'
                          }`}>
                            <p className="whitespace-pre-wrap">{msg.message}</p>
                            <div className="text-[8px] text-right mt-0.5 opacity-60">
                              {new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Quick actions triggers inside drawer */}
                <div className="p-2 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 grid grid-cols-2 gap-1.5">
                  <button
                    onClick={async () => {
                      const link = settings?.store_link || 'https://applsguarato.com.br';
                      try {
                        await onSendMessage(previewConvId, `🛒 *CATÁLOGO DE PRODUTOS*\nConfira nossos produtos online pelo link:\n👉 ${link}`, 'agent');
                        const res = await fetch(`/api/messages/${previewConvId}`);
                        setPreviewMessages(await res.json());
                      } catch(e){}
                    }}
                    disabled={previewSending}
                    className="px-2 py-1.5 bg-slate-50 hover:bg-emerald-50 dark:bg-slate-850/65 dark:hover:bg-emerald-950/20 text-slate-655 dark:text-slate-300 border border-slate-150 dark:border-slate-800 rounded text-[9px] font-bold uppercase tracking-wider text-center cursor-pointer transition leading-none truncate disabled:opacity-50"
                  >
                    🛍️ Catálogo
                  </button>
                  <button
                    onClick={() => openPixBilling(previewConvId)}
                    disabled={previewSending}
                    className="px-2 py-1.5 bg-slate-50 hover:bg-amber-50 dark:bg-slate-855/65 dark:hover:bg-amber-955/20 text-slate-655 dark:text-slate-300 border border-slate-150 dark:border-slate-800 rounded text-[9px] font-bold uppercase tracking-wider text-center cursor-pointer transition leading-none truncate disabled:opacity-50"
                  >
                    💸 Chave PIX
                  </button>
                </div>

                {/* Send messaging chat inside drawer */}
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!previewInput.trim() || previewSending) return;
                    setPreviewSending(true);
                    try {
                      await onSendMessage(previewConvId, previewInput, 'agent');
                      setPreviewInput('');
                      const res = await fetch(`/api/messages/${previewConvId}`);
                      setPreviewMessages(await res.json());
                    } catch (e) {
                      console.error(e);
                    } finally {
                      setPreviewSending(false);
                    }
                  }}
                  className="p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-955 flex gap-2"
                >
                  <input
                    type="text"
                    value={previewInput}
                    onChange={e => setPreviewInput(e.target.value)}
                    placeholder="Escreva resposta rápida..."
                    disabled={previewSending}
                    className="flex-1 border rounded-lg px-2.5 py-1.5 text-[11px] focus:outline-none bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 dark:text-white"
                  />
                  <button
                    type="submit"
                    disabled={!previewInput.trim() || previewSending}
                    className="bg-brand-primary text-brand-agent-text px-2.5 py-1 rounded-lg hover:bg-brand-primary-dark transition disabled:opacity-50 cursor-pointer shadow-xs font-bold text-xs"
                  >
                    Enviar
                  </button>
                </form>
              </div>
            )}
          </div>
        ) : activeConv ? (
          <div className="flex flex-col h-full justify-between items-stretch overflow-hidden">
            
            {/* -------------------- FIXED SCROLL-RESISTANT HEADER -------------------- */}
            <div className="flex-shrink-0 border-b border-slate-100 dark:border-slate-900 bg-white dark:bg-slate-950 select-text z-10 shadow-sm">
              
              {/* Customer description */}
              <div className="px-6 py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2.5 w-full">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100 pb-0.5">
                      {renderCustomerDisplayName(activeConv.customer_name, activeConv.customer_phone)}
                    </h3>
                    
                    {activeConv.typing && (
                      <span className="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase animate-pulse">
                        Digitando...
                      </span>
                    )}
                    
                    {/* Tags List */}
                    {activeConv.tags && activeConv.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {activeConv.tags.map(tag => (
                          <span key={tag} className="bg-brand-primary/10 dark:bg-brand-primary/20 text-brand-sidebar font-bold px-2 py-0.5 rounded-full uppercase border border-brand-primary/20">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-400 font-semibold font-mono">
                    <span className="flex items-center space-x-1"><Phone className="w-3 h-3 text-slate-350" /> <span>{formatBrazilianPhone(activeConv.customer_phone)}</span></span>
                    <span>•</span>
                    <span>Setor: {sectors.find(s => s.id === activeConv.sector_id)?.name || "AUTOATENDIMENTO AUTOMÁTICO"}</span>
                  </div>
                </div>

                <div className="text-[10px] font-bold uppercase tracking-wide text-brand-sidebar bg-brand-primary/10 px-2 py-1 rounded-md">
                  Operador: {activeConv.attendant_id ? (users.find(u => u.id === activeConv.attendant_id)?.name || 'Outro') : 'Central / Robô'}
                </div>
              </div>

              {/* ----------------- FIXED ACTION MENU ROW (Resists scrolling!) ----------------- */}
              <div className="px-6 pb-4 flex flex-wrap items-center gap-2">
                
                {activeConv.status !== 'closed' && (
                  <>
                    {/* ASSUMIR button */}
                    {(!activeConv.attendant_id || activeConv.status === 'chatbot') && (
                      <button
                        onClick={() => onAssumeConversation(activeConv.id, activeAgent.id)}
                        className="bg-brand-primary hover:bg-brand-primary-dark text-brand-agent-text font-extrabold text-xs px-3.5 py-2 rounded-xl flex items-center space-x-1.5 transition cursor-pointer shadow-sm"
                      >
                        <LogIn className="w-3.5 h-3.5" />
                        <span>Assumir Chat</span>
                      </button>
                    )}

                    {/* ETIQUETAS button (accessible to everyone) */}
                    <div className="relative">
                      <button
                        onClick={() => setTagDropdownOpen(!tagDropdownOpen)}
                        className="bg-brand-primary/10 hover:bg-brand-primary/20 dark:bg-brand-primary/20 dark:hover:bg-brand-primary/30 text-brand-sidebar font-bold text-xs px-3 py-1.5 rounded-xl flex items-center space-x-1 transition cursor-pointer"
                      >
                        <Tag className="w-3.5 h-3.5" />
                        <span>Etiquetas ({activeConv.tags?.length || 0})</span>
                      </button>

                      {tagDropdownOpen && (
                        <div className="absolute left-0 mt-1.5 w-52 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-xl rounded-xl p-2.5 z-20 text-xs">
                          <div className="flex items-center justify-between border-b border-slate-50 dark:border-slate-800 pb-2 mb-1.5">
                            <span className="font-extrabold text-slate-450 uppercase text-[9px] tracking-wider">Etiquetas</span>
                            <button onClick={() => setTagDropdownOpen(false)} className="text-slate-400 hover:text-slate-600">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <div className="space-y-1">
                            {['Orçamento', 'Dúvida', 'Urgente', 'Pendente Cobrança', 'NF Emitida', 'Boleto Enviado', 'FINALIZADO', 'Pós-Venda'].map(label => {
                              const hasTag = (activeConv.tags || []).includes(label);
                              return (
                                <button
                                  key={label}
                                  onClick={async () => {
                                    const currentTags = activeConv.tags || [];
                                    const nextTags = hasTag 
                                      ? currentTags.filter(t => t !== label)
                                      : [...currentTags, label];
                                    await onUpdateConversationTags(activeConv.id, nextTags);
                                  }}
                                  className={`w-full text-left px-2 py-1.5 rounded-lg flex items-center justify-between transition cursor-pointer ${
                                    hasTag ? 'bg-brand-primary/10 dark:bg-brand-primary/20 text-brand-sidebar font-bold' : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                                  }`}
                                >
                                  <span>{label}</span>
                                  <input type="checkbox" checked={hasTag} onChange={() => {}} className="pointer-events-none rounded border-slate-350 text-brand-primary" />
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* ESPERA button (Only for Admin) */}
                    {activeAgent.role === 'admin' && (
                      <button
                        onClick={async () => {
                          if (confirmWaitId === activeConv.id) {
                            await onWaitConversation(activeConv.id);
                            setSelectedConvId('');
                            setConfirmWaitId(null);
                          } else {
                            setConfirmWaitId(activeConv.id);
                            setConfirmCloseId(null);
                            setConfirmDeleteId(null);
                            setTimeout(() => setConfirmWaitId(null), 4000);
                          }
                        }}
                        className={`font-bold text-xs px-3 py-1.5 rounded-xl flex items-center space-x-1 transition cursor-pointer select-none ${
                          confirmWaitId === activeConv.id
                            ? 'bg-amber-605 bg-amber-600 text-white animate-pulse'
                            : 'bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/60 text-amber-700 dark:text-amber-400'
                        }`}
                      >
                        <Clock className="w-3.5 h-3.5" />
                        <span>{confirmWaitId === activeConv.id ? 'Confirmar Fila?' : 'Fila de Espera'}</span>
                      </button>
                    )}

                    {/* TRANSFERIR button (for Admin and total operator) */}
                    {(activeAgent.role === 'admin' || activeAgent.role === 'access_total' || activeConv.attendant_id === activeAgent.id) && (
                      <button
                        onClick={() => {
                          setTargetSector(activeConv.sector_id || '');
                          setTargetAgent('');
                          setTransferOpen(true);
                        }}
                        className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 dark:text-slate-200 text-slate-700 font-bold text-xs px-3 py-1.5 rounded-xl flex items-center space-x-1 transition cursor-pointer"
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                        <span>Transferir Chat</span>
                      </button>
                    )}

                    {/* ENCERRADO / ENCERRAR button */}
                    {(activeAgent.role === 'admin' || activeAgent.role === 'access_total' || activeConv.attendant_id === activeAgent.id) && (
                      <button
                        onClick={async () => {
                          if (confirmCloseId === activeConv.id) {
                            await onCloseConversation(activeConv.id);
                            setConfirmCloseId(null);
                          } else {
                            setConfirmCloseId(activeConv.id);
                            setConfirmWaitId(null);
                            setConfirmDeleteId(null);
                            setTimeout(() => setConfirmCloseId(null), 4000);
                          }
                        }}
                        className={`font-bold text-xs px-3 py-1.5 rounded-xl flex items-center space-x-1 transition cursor-pointer select-none ${
                          confirmCloseId === activeConv.id
                            ? 'bg-emerald-600 text-white animate-pulse'
                            : 'bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-400'
                        }`}
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>{confirmCloseId === activeConv.id ? 'Confirmar Fim?' : activeAgent.role === 'admin' ? 'Encerrar Atendimento' : 'Encerrar'}</span>
                      </button>
                    )}

                    {/* EXCLUIR button (Only for Admin) */}
                    {activeAgent.role === 'admin' && (
                      <button
                        onClick={async () => {
                          if (confirmDeleteId === activeConv.id) {
                            await onDeleteConversation(activeConv.id);
                            setSelectedConvId('');
                            setConfirmDeleteId(null);
                          } else {
                            setConfirmDeleteId(activeConv.id);
                            setConfirmWaitId(null);
                            setConfirmCloseId(null);
                            setTimeout(() => setConfirmDeleteId(null), 4000);
                          }
                        }}
                        className={`font-bold text-xs px-3 py-1.5 rounded-xl flex items-center space-x-1 transition cursor-pointer select-none ${
                          confirmDeleteId === activeConv.id
                            ? 'bg-rose-600 text-white animate-pulse'
                            : 'bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-400'
                        }`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>{confirmDeleteId === activeConv.id ? 'Confirmar Excluir?' : 'Excluir'}</span>
                      </button>
                    )}

                    {/* Quick Response Action: PIX */}
                    {settings?.pix_enabled && (
                      <button
                        onClick={() => {
                          setPixValueString('');
                          setPixBillingOpen(true);
                        }}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3 py-1.5 rounded-xl flex items-center space-x-1 transition cursor-pointer shadow-sm"
                        title="PIX: Gerar Fatura Rápida para o cliente"
                      >
                        <DollarSign className="w-3.5 h-3.5" />
                        <span>PIX</span>
                      </button>
                    )}


                    {/* --------- OUTROS ATALHOS REMOVIDOS DO TOPO --------- */}
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      {/* PIX Quick Action (if enabled) */}
                      {settings?.pix_enabled && (
                        <button
                          onClick={() => openPixBilling(selectedConvId)}
                          className="bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-bold text-[10px] px-2.5 py-1.5 rounded-lg flex items-center space-x-1 transition cursor-pointer shadow-sm"
                          title="Gerar cobrança PIX imediata"
                        >
                          <DollarSign className="w-3 h-3" />
                          <span>COBRAR PIX</span>
                        </button>
                      )}
                    </div>
                  </>
                )}

              </div>
            </div>

            {/* -------------------- CORE CHAT MESSAGES SCROLL CONTAINER (White Background, Black Fonts) -------------------- */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100">
              
              <div className="flex justify-center select-none pb-4">
                <span className="bg-slate-100 dark:bg-slate-900 text-slate-500 dark:text-slate-450 text-[10px] uppercase font-bold tracking-wider px-3 py-1 rounded-full border border-slate-200 dark:border-slate-800 select-none">
                  Canal Integrado iniciado em {new Date(activeConv.started_at).toLocaleDateString('pt-BR')}
                </span>
              </div>

              {messages.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-slate-400 dark:text-slate-500 text-xs">
                  Aguardando envio ou recebimento de mensagens.
                </div>
              ) : (
                messages.map(msg => {
                  const isAgent = msg.sender_type === 'agent';
                  const isSystem = msg.sender_type === 'system';

                  if (isSystem) {
                    return (
                      <div key={msg.id} className="flex justify-center select-none py-1 text-[11px] leading-relaxed">
                        <span className="bg-slate-100 dark:bg-slate-900 text-slate-500 dark:text-slate-400 px-3.5 py-1 rounded-lg border border-slate-250/50 dark:border-slate-800 leading-normal max-w-sm text-center">
                          {msg.message}
                        </span>
                      </div>
                    );
                  }

                  const isPixInvoice = msg.message.includes('💸 LS GUARATO - COBRANÇA PIX 💸');
                  let pixKeyToCopy = settings?.pix_key || '';
                  let isEMV = false;

                  if (isPixInvoice) {
                    // Tenta detectar se existe o código EMV completo (começa com 000201 e termina com o CRC16)
                    const emvMatch = msg.message.match(/(000201[A-Z0-9]+6304[A-F0-9]{4})/i);
                    if (emvMatch && emvMatch[1]) {
                      pixKeyToCopy = emvMatch[1].trim();
                      isEMV = true;
                    } else {
                      const match = msg.message.match(/(?:Chave PIX:|🔑 Chave PIX:)\s*([^\n]+)/i);
                      if (match && match[1]) {
                        pixKeyToCopy = match[1].trim();
                      }
                    }
                  }

                  return (
                    <div 
                      key={msg.id}
                      className={`flex ${isAgent ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`max-w-md rounded-2xl px-4 py-2.5 text-xs shadow-sm leading-relaxed ${
                        isAgent 
                          ? 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-br-none font-medium' 
                          : 'bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-bl-none border border-slate-200/60 dark:border-slate-800/85'
                      }`}>
                        <p className="whitespace-pre-wrap">{msg.message}</p>
                        
                        {msg.file_url && (
                          <div className="mt-3">
                            <a 
                              href={msg.file_url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 bg-slate-200 dark:bg-slate-700 p-2 rounded-lg text-xs font-bold hover:bg-slate-300 dark:hover:bg-slate-600 transition"
                            >
                              <Paperclip className="w-4 h-4" />
                              <span>{msg.file_name || 'Abrir Arquivo'}</span>
                            </a>
                          </div>
                        )}
                        
                        {isPixInvoice && (
                          <div className="mt-3 pt-2.5 border-t border-slate-200/50 dark:border-slate-750">
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(pixKeyToCopy);
                                alert(isEMV ? "Código 'Pix Copia e Cola' com valor copiado!" : `Chave PIX Copiada: ${pixKeyToCopy}`);
                              }}
                              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-1.5 px-3 rounded-lg flex items-center justify-center space-x-1.5 transition shadow-sm active:scale-95 cursor-pointer text-[10px]"
                            >
                              <DollarSign className="w-3.5 h-3.5" />
                              <span>{isEMV ? 'Copiar Pix Copia e Cola' : 'Copiar Chave PIX'}</span>
                            </button>
                          </div>
                        )}

                        <div className={`text-[9px] mt-1 text-right font-semibold font-mono ${isAgent ? 'text-slate-400' : 'text-slate-400'}`}>
                          {new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}

              {activeConv.typing && (
                <div className="flex justify-start">
                  <div className="bg-slate-100 dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 text-slate-600 dark:text-slate-400 rounded-2xl px-3.5 py-2.5 rounded-bl-none text-xs flex items-center space-x-2">
                    <div className="flex space-x-1">
                      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                    </div>
                    <span className="font-semibold text-slate-400 text-[10px] uppercase">O cliente está digitando...</span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* -------------------- FOOTER CONTENT INPUT AREA -------------------- */}
            <div className="flex-shrink-0 p-4 border-t border-slate-100 dark:border-slate-900 bg-white dark:bg-slate-950">
              {activeConv.status === 'closed' ? (
                <div className="bg-slate-50 dark:bg-slate-900/60 text-slate-450 text-xs p-3.5 rounded-xl border border-slate-100 dark:border-slate-800 text-center leading-normal">
                  🔐 Este atendimento foi devidamente encerrado e arquivado. Se o cliente enviar uma nova mensagem no WhatsApp, o robô inteligente responderá automaticamente abrindo um novo atendimento.
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Quick message buttons from settings */}
                  <div className="flex flex-wrap gap-2 items-center">
                    <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider mr-1 select-none">
                      Mensagens Rápidas:
                    </span>
                    
                    {settings?.quick_messages && settings.quick_messages.length > 0 ? (
                      settings.quick_messages.map(qm => {
                        const IconMap: any = {
                          Briefcase, Newspaper, ShoppingBag, CreditCard, FileText, MessageSquare, AlertCircle
                        };
                        const Icon = IconMap[qm.icon || 'MessageSquare'] || MessageSquare;
                        
                        return (
                          <button
                            key={qm.id}
                            type="button"
                            onClick={() => sendQuickMessage(qm.text)}
                            disabled={sending}
                            className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 hover:bg-brand-primary/10 text-slate-705 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:border-brand-primary/40 rounded-lg text-[10px] font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs select-none disabled:opacity-50"
                            title={qm.title}
                          >
                            <Icon className="w-3.5 h-3.5 text-brand-sidebar" />
                            <span>{qm.title}</span>
                          </button>
                        );
                      })
                    ) : (
                      <span className="text-[10px] text-slate-400 italic font-medium">Nenhuma configurada</span>
                    )}

                    <button
                      type="button"
                      onClick={() => openPixBilling(selectedConvId)}
                      disabled={sending}
                      className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 hover:bg-amber-50 dark:hover:bg-amber-100 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:border-amber-200 dark:hover:border-amber-900/60 rounded-lg text-[11px] font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs select-none disabled:opacity-50"
                      title="Enviar faturamento PIX (com valor)"
                    >
                      <CreditCard className="w-3.5 h-3.5 text-amber-500" />
                      <span>GERAR PIX</span>
                    </button>
                    
                    {/* Add file input */}
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      className="hidden" 
                      onChange={handleFileChange}
                    />
                    
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={sending}
                      className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 rounded-lg text-[10px] font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs select-none disabled:opacity-50"
                      title="Anexar Boleto, NF ou Comprovante"
                    >
                      <Paperclip className="w-3.5 h-3.5 text-slate-500" />
                      <span>ANEXAR ARQUIVO</span>
                    </button>
                  </div>

                  {/* BOTÕES DE RESPOSTA RÁPIDA DINÂMICOS (Configuráveis em Parâmetros) */}
                  {settings?.quick_messages && settings.quick_messages.length > 0 && (
                    <div className="flex flex-wrap gap-2 items-center pt-2 border-t border-slate-100 dark:border-slate-800">
                      {settings.quick_messages.map((qm) => (
                        <button 
                          key={qm.id}
                          type="button" 
                          onClick={() => sendQuickMessage(qm.text)} 
                          className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 rounded-lg text-[10px] font-bold transition hover:bg-slate-100 cursor-pointer shadow-sm hover:shadow flex items-center space-x-1"
                        >
                          <span>{qm.title}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  <form onSubmit={handleSendSubmit} className="flex gap-2.5 items-center">
                    <input
                      type="text"
                      value={inputText}
                      onChange={e => setInputText(e.target.value)}
                      placeholder="Digite sua resposta e pressione enviar..."
                      disabled={sending}
                      className="flex-1 border rounded-xl px-4 py-3 text-sm focus:outline-none bg-slate-50 dark:bg-slate-900 border-slate-150 dark:border-slate-800 dark:text-slate-100"
                    />
                    <button
                      type="submit"
                      disabled={sending || !inputText.trim()}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white p-3 rounded-xl transition disabled:opacity-50 cursor-pointer shadow-sm"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </form>
                </div>
              )}
            </div>

          </div>
        ) : (
          <div className="flex flex-col h-full justify-center items-center p-8 text-center space-y-4 bg-slate-50 dark:bg-slate-950/40">
            <div className="p-4 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-2xl shadow-inner animate-pulse">
              <Bot className="w-7 h-7" />
            </div>
            <div className="space-y-1 block leading-normal">
              <h3 className="font-extrabold text-brand-title dark:text-brand-title text-sm">Nenhuma conversa selecionada</h3>
              <p className="text-xs text-slate-400 max-w-sm leading-relaxed">Clique em algum contato de WhatsApp listado no menu esquerdo para interagir ou gerar uma simulação.</p>
            </div>
          </div>
        )}

      </div>

      {/* NEW CHAT MODAL */}
      {newChatOpen && (
        <div className="fixed inset-0 z-[110] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-800 flex flex-col overflow-hidden animate-in fade-in zoom-in duration-300">
            <div className="p-6 border-b border-slate-50 dark:border-slate-800 bg-brand-primary/5 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-tight">Iniciar Atendimento</h3>
                <p className="text-[10px] text-brand-sidebar font-bold uppercase tracking-widest mt-0.5">WhatsApp Oficial</p>
              </div>
              <button onClick={() => setNewChatOpen(false)} className="text-slate-400 hover:text-slate-600 transition cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleNewChatSubmit} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Telefone (com DDD)</label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                  <input 
                    type="text" 
                    required 
                    value={newChatPhone} 
                    onChange={e => setNewChatPhone(e.target.value)}
                    placeholder="Ex: 34991234567" 
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none text-slate-800 dark:text-white transition"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 text-xs">Nome do Cliente (Opcional)</label>
                <div className="relative">
                  <UserIcon className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                  <input 
                    type="text" 
                    value={newChatName} 
                    onChange={e => setNewChatName(e.target.value)}
                    placeholder="Nome ou empresa" 
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none text-slate-800 dark:text-white transition"
                  />
                </div>
              </div>
              
              <div className="bg-amber-50 dark:bg-amber-950/20 p-3 rounded-xl border border-amber-100 dark:border-amber-900/40">
                <p className="text-[10px] text-amber-700 dark:text-amber-400 font-medium leading-relaxed">
                  ⚠️ Para iniciar o chat, o WhatsApp deve estar conectado. 
                </p>
              </div>

              <button 
                type="submit" 
                disabled={newChatLoading || !newChatPhone.trim()}
                className="w-full bg-brand-primary hover:bg-brand-primary-dark text-brand-agent-text font-bold py-3.5 rounded-xl transition disabled:opacity-50 shadow-lg shadow-brand-primary/20 flex items-center justify-center space-x-2 cursor-pointer"
              >
                {newChatLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>INICIAR AGORA</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Transfer */}
      {transferOpen && activeConv && (
        <div className="fixed inset-0 bg-slate-900/40 dark:bg-black/60 flex justify-center items-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-sm w-full border border-slate-100 dark:border-slate-800 shadow-xl overflow-hidden">
            <div className="bg-slate-50 dark:bg-slate-950 px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="space-y-0.5">
                <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100 flex items-center space-x-1.5">
                  <ArrowRightLeft className="w-4 h-4 text-indigo-500" />
                  <span>Transferir Atendimento</span>
                </h3>
                <p className="text-[10px] text-slate-400 font-bold ml-5.5">
                   Para: {renderCustomerDisplayName(activeConv.customer_name, activeConv.customer_phone)}
                </p>
              </div>
              <button onClick={() => setTransferOpen(false)} className="text-slate-450 hover:text-slate-600 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleTransferSubmit} className="p-6 space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-slate-400 uppercase tracking-wider block">Setor Destino</label>
                <select 
                  required
                  value={targetSector} 
                  onChange={e => {
                    setTargetSector(e.target.value);
                    setTargetAgent(''); // reset broker when sector shifts
                  }}
                  className="w-full border border-slate-200 dark:border-slate-805 dark:bg-slate-950 px-4 py-2.5 rounded-xl text-sm"
                >
                  <option value="">-- Sem Setor / Chatbot --</option>
                  {sectors.map(s => (
                    <option key={s.id} value={s.id}>{s.name.toUpperCase()}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-400 uppercase tracking-wider block">Atendente / Operador</label>
                <select 
                  value={targetAgent} 
                  onChange={e => setTargetAgent(e.target.value)}
                  className="w-full border border-slate-200 dark:border-slate-805 dark:bg-slate-950 px-4 py-2.5 rounded-xl text-sm"
                >
                  <option value="">-- Fila Geral do Setor (Sem Atendente Fixo) --</option>
                  {users
                    .filter(u => !targetSector || u.sector_id === targetSector || u.role === 'admin')
                    .map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))
                  }
                </select>
              </div>

              <div className="flex space-x-2 pt-4 border-t border-slate-50 dark:border-slate-800">
                <button 
                  type="button" onClick={() => setTransferOpen(false)}
                  className="w-1/2 border border-slate-200 dark:border-slate-800 py-2.5 rounded-xl font-bold transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="w-1/2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl transition cursor-pointer"
                >
                  Confirmar Transferência
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Faturamento Rápido PIX (Quick billing modal) */}
      {pixBillingOpen && settings && (pixTargetId || selectedConvId) && (
        <div className="fixed inset-0 bg-slate-900/40 dark:bg-black/60 flex justify-center items-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-sm w-full border border-slate-100 dark:border-slate-800 shadow-xl overflow-hidden">
            <div className="bg-slate-50 dark:bg-slate-950 px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100 flex items-center space-x-1.5">
                <DollarSign className="w-4 h-4 text-emerald-500" />
                <span>Gerar Fatura PIX</span>
              </h3>
              <button onClick={() => { setPixBillingOpen(false); setPixTargetId(null); }} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handlePixSubmit} className="p-6 space-y-4 text-xs">
              <div className="space-y-3 bg-slate-50 dark:bg-slate-950 p-3.5 rounded-xl border border-slate-100 dark:border-slate-800 block select-text leading-relaxed font-semibold">
                <div className="font-bold text-[10px] text-slate-400 uppercase tracking-widest leading-none pb-1.5">Informações de Recebimento</div>
                <div className="text-[10px] text-brand-sidebar font-black mb-1 flex items-center gap-1.5">
                  <UserIcon className="w-3 h-3" />
                  Para: {(() => {
                    const target = conversations.find(c => c.id === (pixTargetId || selectedConvId));
                    return target ? renderCustomerDisplayName(target.customer_name, target.customer_phone) : '...';
                  })()}
                </div>
                <div className="space-y-1 block leading-relaxed font-semibold text-slate-600 dark:text-slate-350 select-text">
                  <div>🏢 <span className="text-slate-400 font-medium">Favorecido:</span> {settings.pix_receiver || 'LS GUARATO LTDA'}</div>
                  <div>🏦 <span className="text-slate-400 font-medium">Banco:</span> {settings.pix_bank || 'Banco Vinculado'}</div>
                  <div>🔑 <span className="text-slate-400 font-medium">Chave PIX:</span> <span className="font-mono text-xs">{settings.pix_key || 'Chave não registrada'}</span></div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-450 dark:text-slate-400 uppercase tracking-wider block">Digitar o Valor do Documento (R$)</label>
                <input 
                  type="text" 
                  required 
                  value={pixValueString} 
                  onChange={e => setPixValueString(e.target.value)}
                  placeholder="Ex: 150,00 ou 2.450,00"
                  className="w-full border border-slate-200 dark:border-slate-800 dark:bg-slate-950 px-4 py-2.5 rounded-xl text-sm text-slate-800 dark:text-slate-200 focus:outline-none"
                />
                <span className="text-[10px] text-slate-450 dark:text-slate-400 font-normal leading-relaxed block">Este valor será enviado diretamente para a caixa postal do cliente do WhatsApp.</span>
              </div>

              <div className="flex space-x-2 pt-4 border-t border-slate-50 dark:border-slate-800">
                <button 
                  type="button" onClick={() => setPixBillingOpen(false)}
                  className="w-1/2 border border-slate-200 dark:border-slate-800 dark:text-slate-350 py-2.5 rounded-xl font-bold transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="w-1/2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl transition cursor-pointer flex items-center justify-center space-x-1"
                >
                  <span>Enviar Cobrança</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Cliente Simulator */}
      {simPanelOpen && (
        <div className="fixed inset-0 bg-slate-900/40 dark:bg-black/60 flex justify-center items-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-sm w-full border border-slate-100 dark:border-slate-800 shadow-xl overflow-hidden">
            <div className="bg-slate-50 dark:bg-slate-950 px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100 flex items-center space-x-1.5">
                <Smile className="w-4 h-4 text-indigo-500" />
                <span>Simular Entrada de Cliente</span>
              </h3>
              <button onClick={() => setSimPanelOpen(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSimulateSubmit} className="p-6 space-y-4 text-xs">
              <p className="text-slate-400 text-[11px] leading-relaxed select-none pb-2 block">
                Cria um novo cliente no banco de dados que interagirá via chatbot do WhatsApp. Você pode conversar com ele no chat, e a IA do Gemini responderá de volta interpretando o perfil desejado!
              </p>

              <div className="space-y-1">
                <label className="font-bold text-slate-400 uppercase tracking-wider block">Nome Fantasia / Cliente</label>
                <input 
                  type="text" required value={simName} onChange={e => setSimName(e.target.value)}
                  className="w-full border border-slate-200 dark:border-slate-805 dark:bg-slate-950 px-4 py-2.5 rounded-xl text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-400 uppercase tracking-wider block">Telefone Virtual</label>
                <input 
                  type="text" required value={simPhone} onChange={e => setSimPhone(e.target.value)}
                  className="w-full border border-slate-200 dark:border-slate-805 dark:bg-slate-950 px-4 py-2.5 rounded-xl text-sm font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-400 uppercase tracking-wider block">Setor de Destino Inicial</label>
                <select 
                  value={simSector} onChange={e => setSimSector(e.target.value)}
                  className="w-full border border-slate-200 dark:border-slate-805 dark:bg-slate-950 px-4 py-2.5 rounded-xl text-sm"
                >
                  <option value="">Apresentar menu principal (Opções Robô)</option>
                  {sectors.map(s => (
                    <option key={s.id} value={s.id}>{s.name.toUpperCase()}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-400 uppercase tracking-wider block">Perfil de Comportamento da IA (Personagem)</label>
                <textarea 
                  rows={3} required value={simCharacter} onChange={e => setSimCharacter(e.target.value)}
                  className="w-full border border-slate-200 dark:border-slate-800 dark:bg-slate-950 px-4 py-2.5 rounded-xl text-xs leading-normal focus:outline-none"
                />
              </div>

              <div className="flex space-x-2 pt-4 border-t border-slate-50 dark:border-slate-800">
                <button 
                  type="button" onClick={() => setSimPanelOpen(false)}
                  className="w-1/2 border border-slate-200 dark:border-slate-800 py-2.5 rounded-xl font-bold transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="w-1/2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl transition cursor-pointer flex items-center justify-center space-x-1"
                >
                  <Sparkles className="w-3.5 h-3.5 shrink-0" />
                  <span>Gerar Cliente IA</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
