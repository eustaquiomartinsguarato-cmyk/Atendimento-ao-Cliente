import React, { useState, useEffect } from 'react';
import { 
  MessageSquare, Users, Shield, Award, Sparkles, Moon, Sun, 
  HelpCircle, RefreshCw, BarChart3, ChevronDown, Laptop, Terminal, Layers,
  LogOut
} from 'lucide-react';
import { Conversation, Sector, User, Settings, Message, AuditLog } from './types/index.js';

import DashboardMain from './components/DashboardMain.js';
import ActiveChats from './components/ActiveChats.js';
import SectorsPage from './components/SectorsPage.js';
import UsersPage from './components/UsersPage.js';
import SettingsPage from './components/SettingsPage.js';
import ReportsPage from './components/ReportsPage.js';
import AuditLogs from './components/AuditLogs.js';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [dark, setDark] = useState(() => {
    return localStorage.getItem('lsguarato_theme_dark') === 'true';
  });

  // Lists & configurations state
  const [users, setUsers] = useState<User[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messagesUpdateSignal, setMessagesUpdateSignal] = useState<Message | null>(null);
  const [settings, setSettings] = useState<Settings | null>({
    id: "global",
    company_name: "LS GUARATO",
    welcome_message: "Olá 👋\n\nSeja bem-vindo ao atendimento da LS GUARATO.",
    queue_message: "Todos os nossos atendentes estão ocupados.",
    store_link: "",
    career_link: "",
    phones: [],
    estimated_wait: 5,
    logo_url: "",
    schedules: { start: "08:00", end: "18:00" }
  } as any);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [whatsAppStatus, setWhatsAppStatus] = useState({ status: 'DISCONNECTED', number: '', qrCodeUrl: null as string | null });

  // Currently logged simulation active operator
  const [currentAgent, setCurrentAgent] = useState<User | null>(() => {
    const saved = localStorage.getItem('lsguarato_current_agent');
    return saved ? JSON.parse(saved) : null;
  });

  // Persist agent selection
  useEffect(() => {
    if (currentAgent) {
      localStorage.setItem('lsguarato_current_agent', JSON.stringify(currentAgent));
    } else {
      localStorage.removeItem('lsguarato_current_agent');
    }
  }, [currentAgent]);

  // Login form state
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername, password: loginPassword })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erro ao entrar');
      }

      const userData = await res.json();
      setCurrentAgent(userData);
      setLoginUsername('');
      setLoginPassword('');
    } catch (err: any) {
      setLoginError(err.message);
    } finally {
      setLoginLoading(false);
    }
  };

  // Loading indicator
  const [initialLoading, setInitialLoading] = useState(true);
  const syncInProgress = React.useRef(false);

  // Sync state data regularly
  const syncStateData = async (force = false) => {
    if (syncInProgress.current && !force) return;
    syncInProgress.current = true;
    
    try {
      const fetchJson = async (url: string) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        try {
          const response = await fetch(url, { 
            signal: controller.signal,
            headers: { 'Accept': 'application/json' }
          });
          clearTimeout(timeoutId);
          
          if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || `Status ${response.status}`);
          }
          
          const contentType = response.headers.get('content-type');
          if (!contentType || !contentType.includes('application/json')) {
            throw new Error('Resposta do servidor não está em formato JSON');
          }
          
          return await response.json();
        } catch (err) {
          clearTimeout(timeoutId);
          throw err;
        }
      };

      const [usersData, sectorsData, conversationsData, settingsData, auditLogsData, whatsappStatusData] = await Promise.allSettled([
        fetchJson('/api/users'),
        fetchJson('/api/sectors'),
        fetchJson('/api/conversations'),
        fetchJson('/api/settings'),
        fetchJson('/api/audit'),
        fetchJson('/api/whatsapp/status?t=' + Date.now())
      ]);

      if (usersData.status === 'fulfilled') setUsers(usersData.value);
      if (sectorsData.status === 'fulfilled') setSectors(sectorsData.value);
      if (conversationsData.status === 'fulfilled') {
        const newData = conversationsData.value as Conversation[];
        setConversations(prev => {
          // Lag protection: keep chats from previous state if they are missing in the new poll 
          // but were created/updated in the last 45 seconds. This solves the "vanishes after 10s" issue.
          const now = Date.now();
          const vanished = prev.filter(p => !newData.some(n => n.id === p.id));
          const recentlyTouched = vanished.filter(v => {
            const time = new Date(v.updated_at || v.created_at).getTime();
            return (now - time) < 45000;
          });

          if (recentlyTouched.length > 0) {
            return [...newData, ...recentlyTouched];
          }
          return newData;
        });
      }
      
      if (settingsData.status === 'fulfilled' && settingsData.value) {
        setSettings(prev => JSON.stringify(prev) !== JSON.stringify(settingsData.value) ? settingsData.value : prev);
      }
      
      if (auditLogsData.status === 'fulfilled') setAuditLogs(auditLogsData.value);
      
      if (whatsappStatusData.status === 'fulfilled') {
        const newData = whatsappStatusData.value;
        setWhatsAppStatus(prev => {
          if (prev.status !== newData.status || prev.number !== newData.number || prev.qrCodeUrl !== newData.qrCodeUrl) {
            return newData;
          }
          return prev;
        });
      }
    } catch (e) {
      console.error("Sync error:", e);
    } finally {
      syncInProgress.current = false;
      setInitialLoading(false);
    }
  };

  useEffect(() => {
    syncStateData(true);

    const timer = setInterval(() => {
      syncStateData();
    }, 20000);

    const sse = new EventSource('/api/sse');
    sse.onmessage = (event) => {
      try {
        const { type, data } = JSON.parse(event.data);
        console.log(`[SSE] ${type}`);

        if (type === 'message_created') {
          setConversations(prev => prev.map(c => 
            c.id === data.conversation_id ? { ...c, last_message: data.message, updated_at: data.created_at } : c
          ));
          setMessagesUpdateSignal(data);
        } else if (type === 'conversation_updated') {
          setConversations(prev => {
            if (data.deleted) {
              return prev.filter(c => c.id !== data.id);
            }
            const exists = prev.some(c => c.id === data.id);
            if (exists) {
              return prev.map(c => c.id === data.id ? { ...c, ...data } : c);
            }
            return [...prev, data];
          });
        } else if (type === 'sector_updated') {
          setSectors(prev => {
            const exists = prev.some(s => s.id === data.id);
            if (exists) return prev.map(s => s.id === data.id ? { ...s, ...data } : s);
            return [...prev, data];
          });
        } else if (type === 'sector_deleted') {
          setSectors(prev => prev.filter(s => s.id !== data.id));
        } else if (type === 'user_updated') {
          setUsers(prev => {
            const exists = prev.some(u => u.id === data.id);
            if (exists) return prev.map(u => u.id === data.id ? { ...u, ...data } : u);
            return [...prev, data];
          });
        } else if (type === 'user_deleted') {
          setUsers(prev => prev.filter(u => u.id !== data.id));
        } else if (type === 'settings_updated') {
          setSettings(data);
        } else if (type === 'whatsapp_status_changed') {
          setWhatsAppStatus(data);
        } else if (type === 'audit_log_created') {
          setAuditLogs(prev => [data, ...prev]);
        }
      } catch (err) {
        console.error("SSE Error", err);
      }
    };

    return () => {
      clearInterval(timer);
      sse.close();
    };
  }, []);

  // Dedicated low-latency polling for WhatsApp status to bypass local/proxy SSE buffering
  useEffect(() => {
    let fastTimer: any = null;
    const shouldPollFast = 
      activeTab === 'settings' || 
      whatsAppStatus.status === 'INITIALIZING' || 
      whatsAppStatus.status === 'SCANNING_QR';

    if (shouldPollFast && whatsAppStatus.status !== 'CONNECTED') {
      console.log("[WhatsApp] Activating low-latency fast status polling (5s)...");
      fastTimer = setInterval(async () => {
        try {
          const res = await fetch('/api/whatsapp/status?t=' + Date.now(), {
            headers: { 'Accept': 'application/json' }
          });
          if (res.ok) {
            const contentType = res.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
              const text = await res.text();
              try {
                const data = JSON.parse(text);
                if (data && data.status) {
                  setWhatsAppStatus(prev => {
                    if (prev.status !== data.status || prev.number !== data.number || prev.qrCodeUrl !== data.qrCodeUrl) {
                      return data;
                    }
                    return prev;
                  });
                }
              } catch (e) {
                console.warn("[WhatsApp Polling] JSON parse error on response:", text.substring(0, 50));
              }
            } else {
              console.warn("[WhatsApp Polling] Received non-JSON response:", contentType);
            }
          }
        } catch (err) {
          console.error("[WhatsApp] Fast polling status error:", err);
        }
      }, 5000);
    }

    return () => {
      if (fastTimer) {
        clearInterval(fastTimer);
      }
    };
  }, [activeTab, whatsAppStatus.status, whatsAppStatus.number, whatsAppStatus.qrCodeUrl]);

  // Update dark class stylesheet on body
  useEffect(() => {
    localStorage.setItem('lsguarato_theme_dark', dark.toString());
    if (dark) {
      document.body.classList.add('dark');
    } else {
      document.body.classList.remove('dark');
    }
  }, [dark]);

  // Handle core operator action triggers
  const handleSendMessage = async (convId: string, text: string, senderType: 'customer' | 'agent' | 'system' = 'agent') => {
    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: convId,
          message: text,
          sender_type: senderType
        })
      });
      const newMsg = await response.json();
      syncStateData();
      return newMsg;
    } catch (err) {
      console.error(err);
    }
  };
  
  const handleSendMedia = async (convId: string, file: File, caption?: string) => {
    try {
      const formData = new FormData();
      formData.append('conversation_id', convId);
      formData.append('sender_type', 'agent');
      formData.append('file', file);
      if (caption) formData.append('caption', caption);
  
      const response = await fetch('/api/messages/media', {
        method: 'POST',
        body: formData
      });
      const newMsg = await response.json();
      syncStateData();
      return newMsg;
    } catch (err) {
      console.error("Erro ao enviar mídia:", err);
    }
  };

  const handleAssumeConversation = async (convId: string, attendantId: string) => {
    try {
      const response = await fetch(`/api/conversations/${convId}/assume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attendant_id: attendantId,
          user_email: currentAgent?.email,
          user_name: currentAgent?.name
        })
      });
      const data = await response.json();
      syncStateData();
      return data;
    } catch (err) {
      console.error(err);
    }
  };

  const handleTransferConversation = async (convId: string, sectorId: string | null, attendantId: string | null) => {
    try {
      const response = await fetch(`/api/conversations/${convId}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sector_id: sectorId,
          attendant_id: attendantId,
          user_email: currentAgent?.email,
          user_name: currentAgent?.name
        })
      });
      const data = await response.json();
      syncStateData();
      return data;
    } catch (err) {
      console.error(err);
    }
  };

  const handleWaitConversation = async (convId: string) => {
    try {
      const response = await fetch(`/api/conversations/${convId}/wait`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_email: currentAgent?.email,
          user_name: currentAgent?.name
        })
      });
      const data = await response.json();
      syncStateData();
      return data;
    } catch (err) {
      console.error(err);
    }
  };

  const handleCloseConversation = async (convId: string) => {
    try {
      const response = await fetch(`/api/conversations/${convId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_email: currentAgent?.email,
          user_name: currentAgent?.name
        })
      });
      const data = await response.json();
      syncStateData();
      return data;
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteConversation = async (convId: string) => {
    try {
      const response = await fetch(`/api/conversations/${convId}`, {
        method: 'DELETE',
        headers: {
          'x-user-email': currentAgent?.email || '',
          'x-user-name': currentAgent?.name || ''
        }
      });
      const data = await response.json();
      syncStateData();
      return data;
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateConversationTags = async (convId: string, tags: string[]) => {
    try {
      const response = await fetch(`/api/conversations/${convId}/tags`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tags,
          user_email: currentAgent?.email,
          user_name: currentAgent?.name
        })
      });
      const data = await response.json();
      syncStateData();
      return data;
    } catch (e) {
      console.error(e);
    }
  };

  const handeSaveSettings = async (data: Partial<Settings>) => {
    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          user_email: currentAgent?.email,
          user_name: currentAgent?.name
        })
      });
      if (!response.ok) {
        const err = await response.json();
        return { error: err.error || "Erro ao salvar configurações" };
      }
      const updated = await response.json();
      setSettings(updated);
      syncStateData();
      return updated;
    } catch (err: any) {
      console.error(err);
      return { error: err.message };
    }
  };

  const handleCreateSector = async (name: string, description: string) => {
    try {
      const response = await fetch('/api/sectors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description })
      });
      
      const resData = await response.json().catch(() => ({ error: "Erro de formato na resposta do servidor" }));
      
      if (!response.ok) {
        const errorMsg = resData.detail || resData.error || "Erro desconhecido no servidor (Status: " + response.status + ")";
        console.error("[API Error]", errorMsg);
        return { error: errorMsg };
      }
      
      syncStateData(true);
      return resData;
    } catch (err: any) {
      console.error(err);
      return { error: "Falha de conexão: " + err.message };
    }
  };

  const handleUpdateSector = async (id: string, name: string, description: string, status?: 'ativo' | 'inativo') => {
    try {
      const response = await fetch(`/api/sectors/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, status })
      });
      const data = await response.json();
      syncStateData();
      return data;
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteSector = async (id: string) => {
    try {
      const response = await fetch(`/api/sectors/${id}`, { method: 'DELETE' });
      const data = await response.json();
      syncStateData();
      return data;
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateUser = async (data: any) => {
    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      
      const resData = await response.json().catch(() => ({ error: "Erro de formato na resposta do servidor" }));

      if (!response.ok) {
        return { 
          error: resData.error || "Erro ao cadastrar funcionário",
          detail: resData.detail || resData.message || JSON.stringify(resData)
        };
      }
      
      syncStateData(true);
      return resData;
    } catch (err: any) {
      console.error(err);
      return { error: "Erro de rede ou conexão", detail: err.message };
    }
  };

  const handleUpdateUser = async (id: string, data: any) => {
    try {
      const response = await fetch(`/api/users/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const updated = await response.json();
      syncStateData();
      return updated;
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteUser = async (id: string) => {
    try {
      const response = await fetch(`/api/users/${id}`, { method: 'DELETE' });
      const data = await response.json();
      syncStateData();
      return data;
    } catch (e) {
      console.error(e);
    }
  };

  const handleSimulateConversation = async (data: any) => {
    try {
      const response = await fetch('/api/conversations/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const conv = await response.json();
      syncStateData();
      setActiveTab('chat');
      return conv;
    } catch (e) {
      console.error(e);
    }
  };

  const handleWhatsAppSync = async () => {
    try {
      const response = await fetch('/api/whatsapp/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: currentAgent?.email,
          name: currentAgent?.name
        })
      });
      const status = await response.json();
      setWhatsAppStatus(status);
      return status;
    } catch (e) {
      console.error(e);
    }
  };

  const handleWhatsAppDisconnect = async () => {
    try {
      const response = await fetch('/api/whatsapp/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: currentAgent?.email,
          name: currentAgent?.name
        })
      });
      const status = await response.json();
      setWhatsAppStatus(status);
      return status;
    } catch (e) {
      console.error(e);
    }
  };

  // Filter conversations for badge count based on agent routing privileges
  const getAccessibleWaitingBotCounts = () => {
    if (!currentAgent) return 0;
    const isSpecial = currentAgent.role === 'admin' || currentAgent.role === 'access_total';
    const list = conversations.filter(c => c.status === 'waiting' || c.status === 'chatbot');
    if (isSpecial) return list.length;
    // Non-admins only see chats assigned directly to them, so public waiting/bot counts should be 0 for them
    return 0;
  };

  // Check admin routing rights
  const isAdmin = currentAgent?.role === 'admin';

  return (
    <div className="flex h-screen overflow-hidden bg-brand-surface dark:bg-brand-surface font-sans text-brand-text dark:text-brand-text">
      
      {/* 1. PRIMARY APP NAVIGATION RAIL */}
      <div className="w-64 bg-brand-sidebar text-white flex flex-col justify-between select-none">
        <div className="space-y-6 p-5">
          
          {/* Logo brand */}
          <div className="flex items-center space-x-3 pb-4 border-b border-white/10 text-white">
            <div className="p-2 bg-white/10 text-white rounded-xl shadow-md border border-white/20">
              <Laptop className="w-5 h-5 rounded-lg" />
            </div>
            <div>
              <span className="font-black text-white text-sm tracking-tight leading-none block">{settings?.company_name || 'LS GUARATO'}</span>
              <span className="text-[9px] uppercase tracking-wider text-white/50 font-bold block mt-0.5">Painel de Controle</span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1 text-xs font-semibold">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`w-full text-left px-4 py-2.5 rounded-xl flex items-center space-x-2.5 transition cursor-pointer ${
                activeTab === 'dashboard' ? 'bg-white/10 text-white font-bold' : 'text-white/70 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Painel de Comando</span>
            </button>

            <button
              onClick={() => setActiveTab('chat')}
              className={`w-full text-left px-4 py-2.5 rounded-xl flex items-center space-x-2.5 transition cursor-pointer relative ${
                activeTab === 'chat' ? 'bg-white/10 text-white font-bold' : 'text-white/70 hover:bg-white/5 hover:text-white'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              <span>Central de Chats</span>
              {getAccessibleWaitingBotCounts() > 0 && (
                <span className="bg-red-600 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded-full absolute right-4 animate-pulse">
                  {getAccessibleWaitingBotCounts()}
                </span>
              )}
            </button>

            {(currentAgent?.role === 'admin') && (
              <>
                <button
                  onClick={() => setActiveTab('sectors')}
                  className={`w-full text-left px-4 py-2.5 rounded-xl flex items-center space-x-2.5 transition cursor-pointer ${
                    activeTab === 'sectors' ? 'bg-white/10 text-white font-bold' : 'text-white/70 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  <span>Configurar Setores</span>
                </button>

                <button
                  onClick={() => setActiveTab('users')}
                  className={`w-full text-left px-4 py-2.5 rounded-xl flex items-center space-x-2.5 transition cursor-pointer ${
                    activeTab === 'users' ? 'bg-white/10 text-white font-bold' : 'text-white/70 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <Shield className="w-4 h-4" />
                  <span>Cadastrar Funcionários</span>
                </button>

                <button
                  onClick={() => setActiveTab('settings')}
                  className={`w-full text-left px-4 py-2.5 rounded-xl flex items-center space-x-2.5 transition cursor-pointer ${
                    activeTab === 'settings' ? 'bg-white/10 text-white font-bold' : 'text-white/70 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <Award className="w-4 h-4" />
                  <span>Configurar Robô</span>
                </button>

                <button
                  onClick={() => setActiveTab('reports')}
                  className={`w-full text-left px-4 py-2.5 rounded-xl flex items-center space-x-2.5 transition cursor-pointer ${
                    activeTab === 'reports' ? 'bg-white/10 text-white font-bold' : 'text-white/70 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <BarChart3 className="w-4 h-4" />
                  <span>Dashboard Métricas</span>
                </button>

                <button
                  onClick={() => setActiveTab('audit')}
                  className={`w-full text-left px-4 py-2.5 rounded-xl flex items-center space-x-2.5 transition cursor-pointer ${
                    activeTab === 'audit' ? 'bg-white/10 text-white font-bold' : 'text-white/70 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <Terminal className="w-4 h-4" />
                  <span>Auditar Logs</span>
                </button>
              </>
            )}
          </nav>
        </div>

        {/* WhatsApp Status Indicator */}
        <div className="mx-5 mb-5 p-3.5 bg-white/10 rounded-2xl border border-white/10">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black text-white/50 uppercase tracking-tighter">Status Conexão</span>
            <div className={`w-2 h-2 rounded-full animate-pulse ${whatsAppStatus.status === 'CONNECTED' ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]' : 'bg-red-400'}`}></div>
          </div>
          <div className="flex items-center space-x-2.5">
            <div className={`p-1.5 rounded-lg ${whatsAppStatus.status === 'CONNECTED' ? 'bg-white/10 text-white' : 'bg-red-500/20 text-red-200'}`}>
              <Laptop className="w-3.5 h-3.5" />
            </div>
            <div>
              <div className="text-[11px] font-extrabold text-white">
                {whatsAppStatus.status === 'CONNECTED' ? 'WhatsApp Online' : 'WhatsApp Offline'}
              </div>
              <div className="text-[9px] text-white/40 font-bold">
                {whatsAppStatus.status === 'CONNECTED' ? (whatsAppStatus.number || 'Pareado com sucesso') : 'Aguardando conexão...'}
              </div>
            </div>
          </div>
          {whatsAppStatus.status !== 'CONNECTED' && (
            <button 
              onClick={() => {
                setActiveTab('settings');
                handleWhatsAppSync();
              }}
              className="w-full mt-2.5 py-1.5 bg-white text-brand-sidebar text-[10px] font-black uppercase rounded-lg transition sm:hover:bg-white/90 cursor-pointer"
            >
              Conectar Agora
            </button>
          )}
        </div>

        {/* Bottom Section: Profile & Logout */}
        <div className="p-5 border-t border-white/10">
          <div className="flex items-center space-x-3 px-2 mb-4">
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white text-[10px] font-bold border border-white/20">
              {currentAgent?.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold text-white truncate">{currentAgent?.name}</p>
              <p className="text-[9px] text-white/50 truncate uppercase tracking-tighter font-black">{currentAgent?.role === 'admin' ? 'Administrador' : 'Atendente'}</p>
            </div>
          </div>

          {/* Quick parameters simulation login switcher */}
          <div className="p-3.5 bg-white/5 rounded-2xl border border-white/10 text-xs text-white/50 space-y-3">
            <div className="space-y-1 block">
              <span className="text-[9px] uppercase font-bold tracking-widest text-white/30 block leading-none">TESTAR ACESSOS:</span>
              {currentAgent && (
                <div className="relative">
                  <select
                    value={currentAgent.id}
                    onChange={e => {
                      const found = users.find(u => u.id === e.target.value);
                      if (found) setCurrentAgent(found);
                    }}
                    className="w-full border border-white/10 bg-white/10 font-bold text-white pr-8 pl-3.5 py-1.5 rounded-xl focus:outline-none appearance-none cursor-pointer"
                  >
                    {users.map(u => (
                      <option key={u.id} value={u.id}>{u.name.split(' ')[0]} ({u.role === 'admin' ? 'Admin' : 'Operador'})</option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-2.5 pointer-events-none text-white/40" />
                </div>
              )}
              <button
                onClick={() => {
                  if(confirm("Deseja sair do sistema?")) setCurrentAgent(null);
                }}
                className="w-full flex items-center justify-center space-x-2 py-1.5 rounded-xl border border-white/10 text-white/60 hover:bg-white/5 transition mt-2 font-bold cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sair do Perfil</span>
              </button>
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                onClick={() => setDark(!dark)}
                className="p-1.5 bg-white/10 border border-white/10 rounded-lg hover:bg-white/20 transition cursor-pointer text-white"
              >
                {dark ? <Sun className="w-3.5 h-3.5 text-amber-200" /> : <Moon className="w-3.5 h-3.5 text-indigo-400" />}
              </button>
              <div className="text-[9px] text-white/20 font-semibold font-mono">
                v1.0.2 Stable
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. CHIEF CONTENT PANEL */}
      <main className="flex-1 overflow-y-auto p-8 relative">
        {activeTab === 'dashboard' && (
          <DashboardMain 
            conversations={conversations} 
            sectors={sectors} 
            users={users} 
            activeAgent={currentAgent || users[0] || { id: '0', name: 'Visitante', email: '', role: 'operador', sector_id: '', status: 'online', photo: '', created_at: '' }} 
            whatsAppStatus={whatsAppStatus}
            onSetTab={setActiveTab}
          />
        )}

        {activeTab === 'chat' && (
          <ActiveChats
            conversations={conversations}
            sectors={sectors}
            users={users}
            settings={settings}
            activeAgent={currentAgent || users[0] || { id: '0', name: 'Visitante', email: '', role: 'operador', sector_id: '', status: 'online', photo: '', created_at: '' }}
            onSendMessage={handleSendMessage}
            onSendMedia={handleSendMedia}
            onAssumeConversation={handleAssumeConversation}
            onTransferConversation={handleTransferConversation}
            onWaitConversation={handleWaitConversation}
            onCloseConversation={handleCloseConversation}
            onDeleteConversation={handleDeleteConversation}
            onUpdateConversationTags={handleUpdateConversationTags}
            onSimulateConversation={handleSimulateConversation}
            newMessageSignal={messagesUpdateSignal}
          />
        )}

        {activeTab === 'sectors' && (
          <SectorsPage
            sectors={sectors}
            onCreateSector={handleCreateSector}
            onDeleteSector={handleDeleteSector}
            onUpdateSector={handleUpdateSector}
          />
        )}

        {activeTab === 'users' && (
          <UsersPage
            users={users}
            sectors={sectors}
            onCreateUser={handleCreateUser}
            onDeleteUser={handleDeleteUser}
            onUpdateUser={handleUpdateUser}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsPage
            settings={settings}
            activeAgent={currentAgent || users[0] || { id: '0', name: 'Visitante', email: '', role: 'operador', sector_id: '', status: 'online', photo: '', created_at: '' }}
            onSaveSettings={handeSaveSettings}
            whatsAppStatus={whatsAppStatus}
            onWhatsSync={handleWhatsAppSync}
            onWhatsDisconnect={handleWhatsAppDisconnect}
          />
        )}

        {activeTab === 'reports' && (
          <ReportsPage
            conversations={conversations}
            sectors={sectors}
            messages={[]}
          />
        )}

        {activeTab === 'audit' && (
          <AuditLogs
            logs={auditLogs}
          />
        )}
       </main>

      {/* 4. LOGIN FORM OVERLAY */}
      {!currentAgent && !initialLoading && (
        <div className="fixed inset-0 z-[100] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-800 p-8 space-y-6">
            <div className="text-center space-y-2">
              <div className="w-16 h-16 bg-brand-primary rounded-2xl flex items-center justify-center mx-auto shadow-lg mb-4">
                <Laptop className="w-8 h-8 text-brand-sidebar" />
              </div>
              <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">LS GUARATO</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest text-[10px]">Painel de Controle</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              {loginError && (
                <div className="bg-red-50 dark:bg-red-950/20 text-red-500 text-xs p-3 rounded-xl border border-red-100 dark:border-red-900/30 font-bold text-center">
                  {loginError}
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Usuário</label>
                <input 
                  type="text" 
                                value={loginUsername} 
                  onChange={e => setLoginUsername(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none text-slate-800 dark:text-white transition"
                  placeholder="Nome de usuário"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Senha</label>
                <input 
                  type="password" 
                  required 
                  value={loginPassword} 
                  onChange={e => setLoginPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-955 border border-slate-100 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none text-slate-800 dark:text-white transition"
                  placeholder="Sua senha"
                />
              </div>

              <button
                type="submit"
                disabled={loginLoading}
                className="w-full py-3 bg-brand-primary hover:bg-brand-primary-dark text-brand-agent-text rounded-xl font-black text-sm shadow-lg shadow-brand-primary/20 transition disabled:opacity-50"
              >
                {loginLoading ? 'CARREGANDO...' : 'ENTRAR NO SISTEMA'}
              </button>
            </form>

            <div className="pt-4 border-t border-slate-50 dark:border-slate-800 text-center">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Acesso Restrito</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
