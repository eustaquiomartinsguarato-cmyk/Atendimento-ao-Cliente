import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import * as path from 'path';
import * as fs from 'fs';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import { dbStore } from './src/repositories/dbStore.js';
import { whatsappService } from './src/services/whatsappService.js';
import { handleIncomingMessageForChatbot } from './src/services/chatbot.js';
import { generateGeminiReply } from './src/services/geminiService.js';
import { firebaseStore } from './src/repositories/firebaseStore.js';
import { reloadSupabaseConfig, isSupabaseConfigured } from './src/repositories/supabaseStore.js';
import { Conversation, Message, Settings, User } from './src/types/index.js';

const app = express();
app.use(cors());
app.use(express.json());

// Create and serve uploads directory statically
const uploadsFolder = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsFolder)) {
  fs.mkdirSync(uploadsFolder, { recursive: true });
}
app.use('/uploads', express.static(uploadsFolder));

// Request Logger
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

const PORT = Number(process.env.PORT) || 3000;

process.on('unhandledRejection', (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

// Broadcaster list for real-time SSE updates
let clients: any[] = [];

function broadcastUpdate(type: string, data: any) {
  clients.forEach(c => {
    try {
      c.res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
      // Standard Express response doesn't have flush, but if using compression or certain proxies, 
      // sometimes it is necessary to flush. We call it if it exists.
      if ((c.res as any).flush) (c.res as any).flush();
    } catch (e) {
      console.error("SSE broadcast error:", e);
    }
  });
}

async function logAction(email: string, name: string, action: string, target: string) {
  const auditLog = {
    id: "log_" + Math.random().toString(36).substring(2, 9),
    user_name: name,
    user_email: email,
    action,
    target,
    timestamp: new Date().toISOString()
  };
  await dbStore.addAuditLog(auditLog);
  broadcastUpdate('audit_log_created', auditLog);
}

// ----------------- Real-time SSE Endpoint -----------------
app.get('/api/sse', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  
  // Explicitly flush headers for SSE to start immediately
  res.write(': connected\n\n');

  const clientId = Date.now();
  const newClient = { id: clientId, res };
  clients.push(newClient);

  // Periodic heartbeat to keep connection alive through proxies/containers
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 20000);

  req.on('close', () => {
    clearInterval(heartbeat);
    clients = clients.filter(c => c.id !== clientId);
  });
});

// Disable caching for all API endpoints EXCEPT SSE to avoid conflicts
app.use('/api', (req, res, next) => {
  if (req.url === '/sse') return next();
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// ----------------- Debug & Health -----------------
app.get('/api/debug/db', async (req, res) => {
  try {
    const users = await dbStore.getUsers();
    const sectors = await dbStore.getSectors();
    const settings = await dbStore.getSettings();
    
    res.json({
      mode: 'CLOUD (Firebase Firestore)',
      status: 'CONNECTED',
      stats: {
        users: users.length,
        sectors: sectors.length,
        settings_loaded: !!settings
      },
      env: {
        projectId: process.env.FIREBASE_PROJECT_ID || 'managed',
        databaseId: 'managed'
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/ping', (req, res) => {
  let config = {};
  if (fs.existsSync('firebase-applet-config.json')) {
    config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf-8'));
  }
  res.json({ 
    pong: true, 
    time: new Date().toISOString(),
    env: {
      NODE_ENV: process.env.NODE_ENV,
      GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT,
      FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
      HAS_SUPABASE_URL: !!process.env.SUPABASE_URL,
      HAS_SUPABASE_ANON_KEY: !!process.env.SUPABASE_ANON_KEY,
      HAS_SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      HAS_GEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
      SUPABASE_URL_VALUE: process.env.SUPABASE_URL ? (process.env.SUPABASE_URL.substring(0, 15) + "...") : null,
      ALL_ENV_KEYS: Object.keys(process.env).filter(key => 
        key.startsWith("SUPABASE_") || 
        key.startsWith("FIREBASE_") || 
        key.startsWith("GEMINI_") || 
        key.startsWith("GOOGLE_")
      )
    },
    config: config
  });
});

app.get('/api/debug/firestore-test', async (req, res) => {
  try {
    const db = await firebaseStore.getUsers(); // Just triggers init
    const testDoc = { test: true, time: new Date().toISOString() };
    await dbStore.addAuditLog({
      id: "test_" + Date.now(),
      user_name: "System",
      user_email: "test@test.com",
      action: "FIRESTORE_TEST",
      target: "Self",
      timestamp: new Date().toISOString()
    });
    res.json({ status: "success", message: "Firestore write successful" });
  } catch (err: any) {
    console.error("Firestore Test Error:", err);
    res.status(500).json({ status: "error", message: err.message, stack: err.stack });
  }
});

app.post('/api/config/supabase', async (req, res) => {
  try {
    const { url, key } = req.body;
    if (!url || !key) {
      return res.status(400).json({ error: 'URL e Key são obrigatórios.' });
    }

    // Write to supabase-config.json to persist configuration across starts
    fs.writeFileSync('supabase-config.json', JSON.stringify({ url, key }, null, 2), 'utf-8');
    
    // Also backup to cloud Firebase to prevent data losses in new production builds/containers
    try {
      const settings = await firebaseStore.getSettings() || {} as any;
      (settings as any).supabase_url = url;
      (settings as any).supabase_key = key;
      await firebaseStore.updateSettings(settings);
      console.log("[Config API] Backup em nuvem das credenciais do Supabase salvo com sucesso no Firebase Firestore.");
    } catch (firebaseErr: any) {
      console.error("[Config API] Erro ao gravar backup no Firestore:", firebaseErr);
    }

    // Reload local configuration with parameters to ensure instant update
    reloadSupabaseConfig(url, key);

    res.json({ success: true, message: 'Configuração do Supabase gravada e recarregada com sucesso!' });
  } catch (err: any) {
    console.error("[Config API] Erro ao gravar Supabase config:", err);
    res.status(500).json({ error: 'Erro ao configurar Supabase: ' + err.message });
  }
});

app.get('/api/debug/db-detailed', async (req, res) => {
  let activeUrl = process.env.SUPABASE_URL || '';
  let keyExists = !!(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);
  
  try {
    if (fs.existsSync('supabase-config.json')) {
      const info = JSON.parse(fs.readFileSync('supabase-config.json', 'utf-8'));
      if (info.url) activeUrl = info.url;
      if (info.key) keyExists = true;
    }
  } catch (e) {}

  const report: any = {
    selected_engine: isSupabaseConfigured() ? "Supabase" : "Firebase",
    supabase: {
      configured: isSupabaseConfigured(),
      connected: false,
      error: null,
      url: activeUrl,
      keyExists: keyExists
    },
    firebase: {
      configured: true,
      connected: false,
      error: null
    },
    local_fallback: {
      db_json_exists: fs.existsSync('db.json'),
      records_count: {}
    }
  };

  // Test Supabase
  if (isSupabaseConfigured()) {
    try {
      const { supabaseStore } = await import('./src/repositories/supabaseStore.js');
      const start = Date.now();
      await supabaseStore.getUsers();
      report.supabase.connected = true;
      report.supabase.latency_ms = Date.now() - start;
    } catch (err: any) {
      report.supabase.error = err.message || String(err);
    }
  }

  // Test Firebase
  try {
    const start = Date.now();
    await firebaseStore.getUsers();
    report.firebase.connected = true;
    report.firebase.latency_ms = Date.now() - start;
  } catch (err: any) {
    report.firebase.error = err.message || String(err);
  }

  // Read local stats
  try {
    if (fs.existsSync('db.json')) {
      const raw = fs.readFileSync('db.json', 'utf-8');
      const parsed = JSON.parse(raw);
      report.local_fallback.records_count = {
        users: parsed.users?.length || 0,
        sectors: parsed.sectors?.length || 0,
        conversations: parsed.conversations?.length || 0,
        messages: parsed.messages?.length || 0,
        queue: parsed.queue?.length || 0,
        auditLogs: parsed.auditLogs?.length || 0,
      };
    }
  } catch (err: any) {
    report.local_fallback.error = err.message || String(err);
  }

  res.json(report);
});

// ----------------- Users -----------------
app.post('/api/login', async (req, res) => {
  console.log("LOGIN ATTEMPT:", req.body);
  const { username, password } = req.body;
  try {
    const users = await dbStore.getUsers();
    const user = users.find(u => {
      if (!u || !password) return false;
      
      const cleanInputUsername = (username || '').trim().toLowerCase();
      const cleanInputPassword = (password || '');

      // Check if password matches first
      if (u.password !== cleanInputPassword) return false;

      const dbUsername = (u.username || '').toLowerCase();
      const dbEmail = (u.email || '').toLowerCase();

      // 1. Exact or case-insensitive match on username
      if (dbUsername === cleanInputUsername) return true;

      // 2. Exact or case-insensitive match on email
      if (dbEmail === cleanInputUsername) return true;

      // 3. Fallback: If they typed 'admin' for the main admin user (usr_admin)
      if (u.id === 'usr_admin' && cleanInputUsername === 'admin') return true;

      return false;
    });
    
    if (user) {
      console.log("LOGIN SUCCESS:", user.username, "as", user.role);
      const { password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } else {
      console.log("LOGIN FAILED: User not found or wrong pass", username);
      res.status(401).json({ error: 'Usuário ou senha incorretos. Verifique suas credenciais.' });
    }
  } catch (err: any) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({ error: 'Erro interno no servidor: ' + (err.message || String(err)) });
  }
});

app.get("/api/health", async (req, res) => {
  try {
    const sectors = await dbStore.getSectors();
    res.json({ status: "ok", persistence: "firebase", data_points: sectors.length });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message || String(err) });
  }
});

app.get('/api/users', async (req, res) => {
  try {
    const users = await dbStore.getUsers();
    // Don't leak passwords in the list
    const safeUsers = users.map(u => {
      const { password, ...rest } = u;
      return rest;
    });
    res.json(safeUsers);
  } catch (err: any) {
    console.error("GET USERS ERROR:", err);
    res.status(500).json({ error: 'Erro ao buscar usuários', detail: String(err.message || err) });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const { name, username, password, email, phone, role, sector_id, status } = req.body;
    const users = await dbStore.getUsers();
    
    if (users.some(u => u.username === username)) {
      return res.status(400).json({ error: 'Nome de usuário já existe' });
    }

    const newUser: User = {
      id: "usr_" + Math.random().toString(36).substring(2, 9),
      name,
      username,
      password,
      email,
      phone,
      role,
      sector_id: sector_id || null,
      status: status || 'online',
      photo: `https://images.unsplash.com/photo-${1500000000000 + Math.floor(Math.random() * 999999)}?w=100&h=100&fit=crop&crop=faces`,
      created_at: new Date().toISOString()
    };
    
    await dbStore.saveUser(newUser);
    broadcastUpdate('user_updated', newUser);
    
    try {
      await logAction("admin@guarato.com.br", "Admin", "CRIAR_USUARIO", `Cadastrado novo atendente: ${name} (${username})`);
    } catch (e) {
      console.error("Audit log error:", e);
    }
    
    res.json(newUser);
  } catch (err: any) {
    console.error("CREATE USER ERROR:", err);
    const errorDetail = String(err.message || err.details || err || 'Erro desconhecido');
    
    try {
      await logAction("admin@guarato.com.br", "Falha de Sistema", "ERRO_CADASTRO", `Falha ao cadastrar atendente: ${errorDetail}`);
    } catch (e) {}

    res.status(500).json({ 
      error: 'Erro técnico ao cadastrar no banco de dados', 
      detail: errorDetail,
      message: 'Não foi possível completar o cadastro. Verifique os logs do servidor Supabase ou as restrições da tabela.'
    });
  }
});

app.put('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const users = await dbStore.getUsers();
    const user = users.find(u => u.id === id);
    if (!user) return res.status(404).json({ error: 'Atendente não localizado' });

    const updated: User = {
      ...user,
      ...req.body
    };
    await dbStore.saveUser(updated);
    broadcastUpdate('user_updated', updated);
    
    try {
      await logAction("admin@guarato.com.br", "Admin", "EDITAR_USUARIO", `Alterado dados do atendente: ${user.name}`);
    } catch (e) {
      console.error("Audit log error:", e);
    }
    
    res.json(updated);
  } catch (err: any) {
    console.error("UPDATE USER ERROR:", err);
    res.status(500).json({ error: 'Erro ao atualizar usuário: ' + (err.message || String(err)) });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const users = await dbStore.getUsers();
    const user = users.find(u => u.id === id);
    if (!user) return res.status(404).json({ error: 'Atendente não localizado' });

    await dbStore.deleteUser(id);
    broadcastUpdate('user_deleted', { id });
    await logAction("admin@guarato.com.br", "Admin", "EXCLUIR_USUARIO", `Excluído cadastro do atendente: ${user.name}`);
    res.json({ success: true });
  } catch (err: any) {
    console.error("DELETE USER ERROR:", err);
    res.status(500).json({ error: 'Erro ao excluir usuário: ' + (err.message || String(err)) });
  }
});

// ----------------- Sectors -----------------
app.get('/api/sectors', async (req, res) => {
  try {
    const sectors = await dbStore.getSectors();
    res.json(sectors);
  } catch (err: any) {
    console.error("GET SECTORS ERROR:", err);
    res.status(500).json({ error: 'Erro ao buscar setores', detail: String(err.message || err) });
  }
});

app.post('/api/sectors', async (req, res) => {
  console.log("[API] POST /api/sectors request received:", req.body);
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });

    const newSector = {
      id: "sec_" + Math.random().toString(36).substring(2, 5) + "_" + name.toLowerCase().replace(/[^a-z]/g, '').substring(0, 10),
      name,
      description,
      status: 'ativo' as const,
      created_at: new Date().toISOString()
    };
    
    console.log("Saving sector...", newSector.name);
    await dbStore.saveSector(newSector);
    broadcastUpdate('sector_updated', newSector);
    
    try {
      await logAction("admin@guarato.com.br", "Admin", "CRIAR_SETOR", `Criado setor de atendimento: ${name}`);
    } catch (e) {}

    res.json(newSector);
  } catch (err: any) {
    console.error("CREATE SECTOR ERROR:", err);
    res.status(500).json({ error: 'Erro ao criar setor: ' + (err.message || 'Erro no servidor') });
  }
});

app.delete('/api/sectors/:id', async (req, res) => {
  const { id } = req.params;
  const sectors = await dbStore.getSectors();
  const sector = sectors.find(s => s.id === id);
  if (!sector) return res.status(404).json({ error: 'Setor não localizado' });

  await dbStore.deleteSector(id);
  broadcastUpdate('sector_deleted', { id });
  await logAction("admin@guarato.com.br", "Admin", "EXCLUIR_SETOR", `Setor excluído: ${sector.name}`);
  res.json({ success: true });
});

app.put('/api/sectors/:id', async (req, res) => {
  const { id } = req.params;
  const { name, description, status } = req.body;
  const sectors = await dbStore.getSectors();
  const sector = sectors.find(s => s.id === id);
  if (!sector) return res.status(404).json({ error: 'Setor não localizado' });

  const updated = {
    ...sector,
    name: name !== undefined ? name : sector.name,
    description: description !== undefined ? description : sector.description,
    status: status !== undefined ? status : sector.status
  };
  await dbStore.saveSector(updated);
  broadcastUpdate('sector_updated', updated);
  await logAction("admin@guarato.com.br", "Admin", "EDITAR_SETOR", `Setor atualizado: ${updated.name} (Status: ${updated.status})`);
  res.json(updated);
});

// ----------------- Settings -----------------
app.get('/api/settings', async (req, res) => {
  try {
    res.json(await dbStore.getSettings());
  } catch (err: any) {
    console.error("GET SETTINGS ERROR:", err);
    res.status(500).json({ error: 'Erro ao buscar configurações' });
  }
});

app.put('/api/settings', async (req, res) => {
  const { 
    company_name, welcome_message, queue_message, out_of_hours_message, inactivity_closure_message, closure_message, store_link, career_link, offers_link,
    phones, estimated_wait, logo_url, schedules, 
    pix_key, pix_receiver, pix_bank, pix_enabled,
    bot_options,
    quick_messages,
    user_email, user_name 
  } = req.body;

  const current = await dbStore.getSettings();
  const updated: Settings = {
    ...current,
    company_name: company_name || current.company_name,
    welcome_message: welcome_message || current.welcome_message,
    queue_message: queue_message || current.queue_message,
    out_of_hours_message: out_of_hours_message !== undefined ? out_of_hours_message : current.out_of_hours_message,
    inactivity_closure_message: inactivity_closure_message !== undefined ? inactivity_closure_message : current.inactivity_closure_message,
    closure_message: closure_message !== undefined ? closure_message : current.closure_message,
    store_link: store_link || current.store_link,
    career_link: career_link || current.career_link,
    offers_link: offers_link !== undefined ? offers_link : current.offers_link,
    phones: phones || current.phones,
    estimated_wait: estimated_wait !== undefined ? Number(estimated_wait) : current.estimated_wait,
    logo_url: logo_url || current.logo_url,
    schedules: schedules || current.schedules,
    pix_key: pix_key !== undefined ? pix_key : current.pix_key,
    pix_receiver: pix_receiver !== undefined ? pix_receiver : current.pix_receiver,
    pix_bank: pix_bank !== undefined ? pix_bank : current.pix_bank,
    pix_enabled: pix_enabled !== undefined ? Boolean(pix_enabled) : current.pix_enabled,
    bot_options: bot_options !== undefined ? bot_options : current.bot_options,
    quick_messages: quick_messages !== undefined ? quick_messages : current.quick_messages
  };

  await dbStore.updateSettings(updated);
  broadcastUpdate('settings_updated', updated);
  await logAction(user_email || "admin@guarato.com.br", user_name || "Admin", "ATUALIZAR_CONFIGURACOES", "Configurações gerais do sistema salvas.");
  res.json(updated);
});

// ----------------- Conversations -----------------
app.get('/api/conversations', async (req, res) => {
  res.json(await dbStore.getConversations());
});

app.post('/api/conversations', async (req, res) => {
  console.log("!!!DEBUG!!! /api/conversations endpoint reached");
  console.log("[API][NewChat] Body recebido:", JSON.stringify(req.body));
  const { name, phone, sectorId, attendant_id, initialMessage } = req.body;
  if (!phone) return res.status(400).json({ error: 'Telefone é obrigatório' });

  const existing = await dbStore.getConversations();
  const found = existing.find(c => c.customer_phone.replace(/\D/g, '') === phone.replace(/\D/g, '') && c.status !== 'closed');
  
  if (found) {
    if (attendant_id) {
        found.attendant_id = attendant_id;
        found.status = 'active';
        await dbStore.saveConversation(found);
        broadcastUpdate('conversation_updated', found);
    }
    return res.json(found);
  }

  const newConv: Conversation = {
    id: "chat_" + Math.random().toString(36).substring(2, 9),
    customer_name: name || 'Novo Contato',
    customer_phone: phone,
    sector_id: sectorId || null,
    attendant_id: attendant_id || null, 
    status: attendant_id ? 'active' : 'waiting', 
    started_at: new Date().toISOString(),
    last_message: initialMessage || 'Conversa iniciada',
    tags: [],
    created_at: new Date().toISOString()
  };
  console.log("[API][NewChat] Conversa criada:", JSON.stringify(newConv));

  await dbStore.saveConversation(newConv);
  broadcastUpdate('conversation_updated', newConv);

  if (initialMessage) {
    const newMsg: Message = {
      id: "msg_" + Math.random().toString(36).substring(2, 9),
      conversation_id: newConv.id,
      sender_type: 'agent',
      message: initialMessage,
      created_at: new Date().toISOString()
    };
    await dbStore.saveMessage(newMsg);
    broadcastUpdate('message_created', newMsg);
    await whatsappService.sendWhatsAppMessage(newConv.customer_phone, initialMessage);
  }

  res.json(newConv);
});

app.post('/api/conversations/simulate', async (req, res) => {
  const { name, phone, sectorId, character } = req.body;
  const newId = "chat_" + Math.random().toString(36).substring(2, 9);
  
  const newConv: Conversation = {
    id: newId,
    customer_name: name,
    customer_phone: phone.includes("(Simulação)") ? phone : `${phone} (Simulação)`,
    sector_id: sectorId || null,
    attendant_id: null,
    status: 'chatbot',
    started_at: new Date().toISOString(),
    last_message: "Olá",
    character: character || "Cliente de teste buscando orçar tijolo e cimento.",
    tags: [],
    created_at: new Date().toISOString()
  };

  await dbStore.saveConversation(newConv);
  
  // First client simulated greeting
  const clientMsg: Message = {
    id: "msg_" + Math.random().toString(36).substring(2, 9),
    conversation_id: newId,
    sender_type: 'customer',
    message: "Oi",
    created_at: new Date().toISOString()
  };
  await dbStore.saveMessage(clientMsg);
  broadcastUpdate('conversation_updated', newConv);
  broadcastUpdate('message_created', clientMsg);

  // Trigger immediate chatbot greeting reply
  setTimeout(async () => {
    try {
      const reply = await handleIncomingMessageForChatbot(newConv, "Oi");
      if (reply) {
        await dbStore.saveMessage(reply);
        broadcastUpdate('message_created', reply);
      }
    } catch (err) {
      console.error("Error in chatbot greeting setTimeout:", err);
    }
  }, 1000);

  res.json(newConv);
});

// Assume conversation
app.post('/api/conversations/:id/assume', async (req, res) => {
  const { id } = req.params;
  const { attendant_id, user_email, user_name } = req.body;

  const conv = await dbStore.getConversationById(id);
  if (!conv) return res.status(404).json({ error: 'Conversa não localizada' });

  const updated: Conversation = {
    ...conv,
    status: 'active',
    attendant_id,
    updated_at: new Date().toISOString()
  };

  await dbStore.saveConversation(updated);
  await dbStore.removeFromQueue(id);

  const sysMsg: Message = {
    id: "msg_" + Math.random().toString(36).substring(2, 9),
    conversation_id: id,
    sender_type: 'system',
    message: `⚡ Chat assumido por ${user_name}.`,
    created_at: new Date().toISOString()
  };
  await dbStore.saveMessage(sysMsg);
  
  await logAction(user_email || "admin@guarato.com.br", user_name || "Admin", "ASSUMIR_CHAT", `Assumiu o atendimento de ${conv.customer_name}.`);
  
  broadcastUpdate('conversation_updated', updated);
  broadcastUpdate('message_created', sysMsg);
  res.json(updated);
});

// Transfer conversation
app.post('/api/conversations/:id/transfer', async (req, res) => {
  const { id } = req.params;
  const { sector_id, attendant_id, user_email, user_name } = req.body;

  const conv = await dbStore.getConversationById(id);
  if (!conv) return res.status(404).json({ error: 'Conversa não localizada' });

  const sectors = await dbStore.getSectors();
  const users = await dbStore.getUsers();
  const targetSectorName = sectors.find(s => s.id === sector_id)?.name || "Sem setor";
  const targetAgentName = users.find(u => u.id === attendant_id)?.name || "";

  const updated: Conversation = {
    ...conv,
    sector_id: sector_id || null,
    attendant_id: attendant_id || null,
    status: attendant_id ? 'active' : 'waiting',
    updated_at: new Date().toISOString()
  };

  await dbStore.saveConversation(updated);

  if (attendant_id) {
    await dbStore.removeFromQueue(id);
  } else {
    await dbStore.addToQueue(id, sector_id);
  }

  const transferMsg = targetAgentName 
    ? `🔄 Transferido para atendente ${targetAgentName} - Setor ${targetSectorName}.`
    : `🔄 Transferido para Fila do setor: ${targetSectorName}.`;

  const sysMsg: Message = {
    id: "msg_" + Math.random().toString(36).substring(2, 9),
    conversation_id: id,
    sender_type: 'system',
    message: transferMsg,
    created_at: new Date().toISOString()
  };
  await dbStore.saveMessage(sysMsg);

  await logAction(user_email || "admin@guarato.com.br", user_name || "Admin", "TRANSFERIR_CHAT", `Transferiu ${conv.customer_name} para ${targetSectorName} / ${targetAgentName || 'Fila'}.`);

  broadcastUpdate('conversation_updated', updated);
  broadcastUpdate('message_created', sysMsg);
  res.json(updated);
});

// Mover para Fila de Espera (ESPERA, exclusive to Admin/Operators)
app.post('/api/conversations/:id/wait', async (req, res) => {
  const { id } = req.params;
  const { user_email, user_name } = req.body;

  const conv = await dbStore.getConversationById(id);
  if (!conv) return res.status(404).json({ error: 'Conversa não localizada' });

  const updated: Conversation = {
    ...conv,
    status: 'waiting',
    attendant_id: null,
    updated_at: new Date().toISOString()
  };

  await dbStore.saveConversation(updated);
  await dbStore.addToQueue(id, conv.sector_id);

  const sysMsg: Message = {
    id: "msg_" + Math.random().toString(36).substring(2, 9),
    conversation_id: id,
    sender_type: 'system',
    message: `⏳ Atendimento movido para a Fila de Espera por ${user_name || 'atendente'}.`,
    created_at: new Date().toISOString()
  };

  await dbStore.saveMessage(sysMsg);
  await logAction(user_email || "admin@guarato.com.br", user_name || "Admin", "MOVER_ESPERA", `Visualização de atendimento de ${conv.customer_name} enviada de volta para a fila.`);

  broadcastUpdate('conversation_updated', updated);
  broadcastUpdate('message_created', sysMsg);
  res.json(updated);
});

// Voltar para Robô / Chatbot (Bot Central)
app.post('/api/conversations/:id/bot', async (req, res) => {
  const { id } = req.params;
  const { user_email, user_name } = req.body;

  const conv = await dbStore.getConversationById(id);
  if (!conv) return res.status(404).json({ error: 'Conversa não localizada' });

  const updated: Conversation = {
    ...conv,
    status: 'chatbot',
    attendant_id: null,
    updated_at: new Date().toISOString()
  };

  await dbStore.saveConversation(updated);
  await dbStore.addToQueue(id, conv.sector_id);

  const sysMsg: Message = {
    id: "msg_" + Math.random().toString(36).substring(2, 9),
    conversation_id: id,
    sender_type: 'system',
    message: `🤖 Atendimento direcionado para o Robô Autoatendimento por ${user_name || 'atendente'}.`,
    created_at: new Date().toISOString()
  };

  await dbStore.saveMessage(sysMsg);
  await logAction(user_email || "admin@guarato.com.br", user_name || "Admin", "MOVER_ROBO", `Retornou atendimento de ${conv.customer_name} para o robô.`);

  broadcastUpdate('conversation_updated', updated);
  broadcastUpdate('message_created', sysMsg);
  res.json(updated);
});

// Encerrar Conversa (CLOSE)
app.post('/api/conversations/:id/close', async (req, res) => {
  const { id } = req.params;
  const { user_email, user_name } = req.body;

  const conv = await dbStore.getConversationById(id);
  if (!conv) return res.status(404).json({ error: 'Conversa não localizada' });

  const updated: Conversation = {
    ...conv,
    status: 'closed',
    attendant_id: null,
    updated_at: new Date().toISOString()
  };

  await dbStore.saveConversation(updated);
  await dbStore.removeFromQueue(id);

  const sysMsg: Message = {
    id: "msg_" + Math.random().toString(36).substring(2, 9),
    conversation_id: id,
    sender_type: 'system',
    message: `🏁 Atendimento encerrado por ${user_name || 'operador'}.`,
    created_at: new Date().toISOString()
  };

  const settings = await dbStore.getSettings();
  
  // Ensure closure message is a valid string, not a number or boolean
  let closureText = "";
  if (settings.closure_message && typeof settings.closure_message === 'string' && settings.closure_message.trim().length > 0) {
    closureText = settings.closure_message;
  } else {
    closureText = `⭐ Atendimento encerrado.\nComo você avalia nossos serviços de 1 a 5?\n\nObrigado por falar com a ${settings.company_name || 'LS GUARATO'}!`;
  }

  const surveyMsg: Message = {
    id: "msg_" + Math.random().toString(36).substring(2, 9),
    conversation_id: id,
    sender_type: 'system',
    message: closureText,
    created_at: new Date().toISOString()
  };

  await dbStore.saveMessage(sysMsg);
  await dbStore.saveMessage(surveyMsg);

  // Send via WhatsApp if it's a real conversation
  if (!conv.customer_phone.includes("(Simulação)")) {
    await whatsappService.sendWhatsAppMessage(conv.customer_phone, closureText);
  }

  await logAction(user_email || "admin@guarato.com.br", user_name || "Admin", "ENCERRAR_CHAT", `Finalizou atendimento de ${conv.customer_name}.`);

  broadcastUpdate('conversation_updated', updated);
  broadcastUpdate('message_created', sysMsg);
  broadcastUpdate('message_created', surveyMsg);
  res.json(updated);
});

// Excluir conversa (EXCLUIR, permanent deletion)
app.delete('/api/conversations/:id', async (req, res) => {
  const { id } = req.params;
  const user_email = req.headers['x-user-email'] as string || "admin@guarato.com.br";
  const user_name = req.headers['x-user-name'] as string || "Admin";

  const conv = await dbStore.getConversationById(id);
  if (!conv) return res.status(404).json({ error: 'Conversa não localizada' });

  await dbStore.deleteConversation(id);
  await logAction(user_email, user_name, "EXCLUIR_CONVERSA", `Conversa com ${conv.customer_name} (${conv.customer_phone}) foi excluída permanentemente.`);

  broadcastUpdate('conversation_updated', { id, deleted: true });
  res.json({ success: true });
});

// Excluir TODAS as conversas (permanent deletion of all chats/messages for real testing)
app.post('/api/conversations/clear-all', async (req, res) => {
  const user_email = req.headers['x-user-email'] as string || "admin@guarato.com.br";
  const user_name = req.headers['x-user-name'] as string || "Admin";

  await dbStore.clearAllConversations();
  await logAction(user_email, user_name, "LIMPAR_HISTORICO_TOTAL", "Todas as conversas e históricos de mensagens foram apagados para início dos testes reais.");

  broadcastUpdate('conversations_cleared', { success: true });
  res.json({ success: true, message: 'Todos os chats e históricos foram removidos com sucesso!' });
});

// Update tags (ETIQUETAS)
app.put('/api/conversations/:id/tags', async (req, res) => {
  const { id } = req.params;
  const { tags, user_email, user_name } = req.body;

  const conv = await dbStore.getConversationById(id);
  if (!conv) return res.status(404).json({ error: 'Conversa não localizada' });

  const updated: Conversation = {
    ...conv,
    tags: tags || [],
    updated_at: new Date().toISOString()
  };

  await dbStore.saveConversation(updated);
  await logAction(user_email || "admin@guarato.com.br", user_name || "Admin", "ATUALIZAR_ETIQUETAS", `Etiquetas da conversa de ${conv.customer_name} atualizadas para: ${(tags || []).join(', ')}.`);

  broadcastUpdate('conversation_updated', updated);
  res.json(updated);
});

app.post('/api/conversations/:id/typing', async (req, res) => {
  const { id } = req.params;
  const { typing } = req.body;
  const conv = await dbStore.getConversationById(id);
  if (!conv) return res.status(404).json({ error: 'Conversa não localizada' });

  if (!conv.customer_phone.includes("(Simulação)")) {
    await whatsappService.sendPresenceUpdate(conv.customer_phone, typing ? 'composing' : 'paused');
  } else {
    // If simulation, we update the DB so frontend sees it
    conv.typing = typing;
    await dbStore.saveConversation(conv);
    broadcastUpdate('conversation_updated', conv);
  }
  res.json({ success: true });
});

// ----------------- Get Messages -----------------
app.get('/api/messages/:convId', async (req, res) => {
  res.json(await dbStore.getMessagesForConversation(req.params.convId));
});

// Send message (and potential simulated response)
app.post('/api/messages', async (req, res) => {
  const { conversation_id, message, sender_type } = req.body;
  const conv = await dbStore.getConversationById(conversation_id);
  if (!conv) return res.status(404).json({ error: 'Conversa não localizada' });

  // Reset session if it was closed
  if (conv.status === 'closed' && sender_type === 'customer') {
    conv.status = 'chatbot';
    conv.sector_id = null;
    await dbStore.saveConversation(conv);
  }

  const newMsg: Message = {
    id: "msg_" + Math.random().toString(36).substring(2, 9),
    conversation_id,
    sender_type,
    message,
    created_at: new Date().toISOString()
  };

  await dbStore.saveMessage(newMsg);
  
  // Refresh last text
  conv.last_message = message;
  conv.updated_at = new Date().toISOString();
  await dbStore.saveConversation(conv);

  broadcastUpdate('message_created', newMsg);
  broadcastUpdate('conversation_updated', conv);

  // Send real WhatsApp if agent or system replies to a real WA conversation
  if (sender_type !== 'customer') {
    if (conv.status === 'chatbot') {
        conv.status = 'active';
        conv.sector_id = null; // Reset sector if needed, or handle based on business rules
        await dbStore.saveConversation(conv);
        broadcastUpdate('conversation_updated', conv);
    }
    
    if (!conv.customer_phone.includes("(Simulação)")) {
       console.log(`[WhatsApp] Tentando enviar mensagem real pelo socket: Phone=${conv.customer_phone}, Msg=${message}`);
       const sent = await whatsappService.sendWhatsAppMessage(conv.customer_phone, message);
       console.log(`[WhatsApp] Resultado do envio: ${sent ? 'SUCESSO' : 'FALHA'}`);
    }
  }

  // If chatbot handles this message because no agent has assumed it yet
  if (sender_type === 'customer' && conv.status === 'chatbot') {
    try {
      const botReply = await handleIncomingMessageForChatbot(conv, message);
      if (botReply) {
        await dbStore.saveMessage(botReply);
        broadcastUpdate('message_created', botReply);
        
        const freshConv = await dbStore.getConversationById(conversation_id);
        if (freshConv) {
          broadcastUpdate('conversation_updated', freshConv);
        }
      }
    } catch (err) {
      console.error("Error in chatbot response processing:", err);
    }
  }

  // Trigger Gemini client simulator if active agent replies to a simulated client
  if (sender_type === 'agent' && conv.character) {
    // wait 1 second, then trigger typing
    setTimeout(async () => {
      try {
        conv.typing = true;
        broadcastUpdate('conversation_updated', conv);

        // get messages history for context
        const records = await dbStore.getMessagesForConversation(conversation_id);
        const history = records.map(r => ({
          sender: r.sender_type === 'customer' ? 'Cliente' : 'Atendente',
          text: r.message
        }));

        // call gemini
        const clientResponseText = await generateGeminiReply(conv.character || "", history, message);
        conv.typing = false;
          
        const responseMsg: Message = {
          id: "msg_" + Math.random().toString(36).substring(2, 9),
          conversation_id,
          sender_type: 'customer',
          message: clientResponseText,
          created_at: new Date().toISOString()
        };

        await dbStore.saveMessage(responseMsg);
        conv.last_message = clientResponseText;
        await dbStore.saveConversation(conv);

        broadcastUpdate('message_created', responseMsg);
        broadcastUpdate('conversation_updated', conv);
      } catch (err) {
        console.error("Error in Gemini simulator setTimeout:", err);
        // Ensure typing is hidden even on error
        conv.typing = false;
        broadcastUpdate('conversation_updated', conv);
      }
    }, 1500);
  }

  res.json(newMsg);
});

app.post('/api/messages/media', upload.single('file'), async (req, res) => {
  try {
    const { conversation_id, sender_type, caption } = req.body;
    const file = req.file;

    if (!file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    
    const conv = await dbStore.getConversationById(conversation_id);
    if (!conv) return res.status(404).json({ error: 'Conversa não localizada' });

    let type: 'image' | 'video' | 'document' | 'audio' = 'document';
    if (file.mimetype.startsWith('image/')) type = 'image';
    else if (file.mimetype.startsWith('video/')) type = 'video';
    else if (file.mimetype.startsWith('audio/')) type = 'audio';

    const fileName = file.originalname;
    const description = type === 'image' ? '📷 Foto' : type === 'video' ? '🎥 Vídeo' : type === 'audio' ? '🎙️ Áudio' : `📄 Arquivo: ${fileName}`;
    
    // Save file locally to be accessible via /uploads static route
    const fileId = "file_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
    const safeName = `${fileId}_${file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const fileUrl = `/uploads/${safeName}`;
    const uploadDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    fs.writeFileSync(path.join(uploadDir, safeName), file.buffer);

    const newMsg: Message = {
      id: "msg_media_" + Date.now() + "_" + Math.floor(Math.random() * 100),
      conversation_id,
      sender_type,
      message: caption ? `${description}\n\n${caption}` : description,
      created_at: new Date().toISOString(),
      file_url: fileUrl,
      file_name: file.originalname,
      mimetype: file.mimetype
    };

    await dbStore.saveMessage(newMsg);
    conv.last_message = newMsg.message;
    await dbStore.saveConversation(conv);

    broadcastUpdate('message_created', newMsg);
    broadcastUpdate('conversation_updated', conv);

    // Send real WhatsApp media if not simulation
    if (!conv.customer_phone.includes("(Simulação)")) {
       await whatsappService.sendWhatsAppMedia(
         conv.customer_phone, 
         file.buffer, 
         type, 
         caption, 
         fileName
       );
    }

    res.json(newMsg);
  } catch (err: any) {
    console.error("MEDIA UPLOAD ERROR:", err);
    res.status(500).json({ error: 'Erro ao processar mídia: ' + err.message });
  }
});

// ----------------- WhatsApp Status Sync -----------------
app.get('/api/whatsapp/status', (req, res) => {
  try {
    const status = whatsappService.getStatus();
    // Force set Content-Type to avoid any middleware getting confused
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json(status);
  } catch (err) {
    console.error("[Server] Error getting WhatsApp status:", err);
    return res.status(500).json({ status: 'ERROR', error: String(err) });
  }
});

app.post('/api/whatsapp/sync', async (req, res) => {
  const { email, name } = req.body;
  const status = await whatsappService.requestSync(email, name);
  res.json(status);
});

app.post('/api/whatsapp/disconnect', async (req, res) => {
  const { email, name } = req.body;
  const status = await whatsappService.disconnect(email, name);
  res.json(status);
});

// ----------------- Audit Logs -----------------
app.get('/api/audit', async (req, res) => {
  try {
    res.json(await dbStore.getAuditLogs());
  } catch (err: any) {
    console.error("GET AUDIT ERROR:", err);
    res.status(500).json({ error: 'Erro ao buscar logs de auditoria' });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const conversations = await dbStore.getConversations();
    const activeCount = conversations.filter(c => c.status === 'active').length;
    const waitingCount = conversations.filter(c => c.status === 'waiting').length;
    const chatbotCount = conversations.filter(c => c.status === 'chatbot').length;
    const closedCount = conversations.filter(c => c.status === 'closed').length;

    res.json({
      activeCount,
      waitingCount,
      chatbotCount,
      closedCount,
      totalCount: conversations.length
    });
  } catch (err: any) {
    console.error("GET STATS ERROR:", err);
    res.status(500).json({ error: 'Erro ao buscar estatísticas' });
  }
});

// Fallback for missing /api routes to avoid HTML responses
app.use('/api/*', (req, res) => {
  console.warn(`[Server] API 404: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ error: 'Rota de API não encontrada', path: req.originalUrl });
});

// Global Error Handler for /api routes to ensure JSON responses
app.use('/api', (err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(`[Global Error Handler] Error on ${req.method} ${req.url}:`, err);
  res.status(err.status || 500).json({
    error: 'Erro interno no servidor API',
    message: err.message || String(err),
    path: req.originalUrl
  });
});

// ----------------- Inactivity Auto-Closure -----------------
async function checkInactiveConversations() {
  const settings = await dbStore.getSettings();
  const conversations = await dbStore.getConversations();
  const now = Date.now();
  const INACTIVITY_LIMIT_MS = 25 * 60 * 1000; // 25 minutes

  const activeWaitingConvs = conversations.filter(c => c.status === 'active' || c.status === 'waiting' || c.status === 'chatbot');

  for (const conv of activeWaitingConvs) {
    const messages = await dbStore.getMessagesForConversation(conv.id);
    const lastMsg = messages[messages.length - 1];
    
    if (lastMsg) {
      const lastMsgTime = new Date(lastMsg.created_at).getTime();
      if (now - lastMsgTime > INACTIVITY_LIMIT_MS) {
        console.log(`[Auto-Closure] Closing conversation ${conv.id} for inactivity (${conv.customer_name})`);
        
        let closureText = "";
        if (settings.inactivity_closure_message && typeof settings.inactivity_closure_message === 'string' && settings.inactivity_closure_message.trim().length > 0) {
          closureText = settings.inactivity_closure_message;
        } else {
          closureText = "Seu atendimento foi encerrado por falta de interação por mais de 25 minutos. Se precisar de algo, basta nos chamar novamente! 😊";
        }
        
        const updated: Conversation = {
          ...conv,
          status: 'closed',
          attendant_id: null
        };

        await dbStore.saveConversation(updated);
        await dbStore.removeFromQueue(conv.id);

        const sysMsg: Message = {
          id: "msg_inactivity_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
          conversation_id: conv.id,
          sender_type: 'system',
          message: `🏁 Atendimento encerrado automaticamente por falta de interação há mais de 25 minutos.`,
          created_at: new Date().toISOString()
        };

        const finalMsg: Message = {
          id: "msg_inactivity_final_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
          conversation_id: conv.id,
          sender_type: 'system',
          message: closureText,
          created_at: new Date().toISOString()
        };

        await dbStore.saveMessage(sysMsg);
        await dbStore.saveMessage(finalMsg);

        // Send via WhatsApp if it's a real conversation
        if (!conv.customer_phone.includes("(Simulação)")) {
          await whatsappService.sendWhatsAppMessage(conv.customer_phone, closureText);
        }

        broadcastUpdate('conversation_updated', updated);
        broadcastUpdate('message_created', sysMsg);
        broadcastUpdate('message_created', finalMsg);
      }
    }
  }
}

// Run inactivity check every 2 minutes
setInterval(checkInactiveConversations, 2 * 60 * 1000);

// ----------------- Hot Module / Frontend Builder Integration -----------------
whatsappService.onUpdate((event, data) => {
  if (event === 'status_change') {
    broadcastUpdate('whatsapp_status_changed', data);
  } else {
    broadcastUpdate(event, data);
  }
});

// Autostart WhatsApp Service is now handled inside startServer's listen callback
// whatsappService.init().catch(e => console.error("[WhatsApp] Startup init failed:", e));

async function startServer() {
  console.log("[Server] Inicia processo de inicialização...");
  console.log("[Server] Ambiente Google Cloud Project:", process.env.GOOGLE_CLOUD_PROJECT || "Não definido");
  console.log("[Server] Ambiente Firebase Project ID:", process.env.FIREBASE_PROJECT_ID || "Não definido");
  
  // Tentar carregar credenciais em nuvem para resiliência de deploys em produção
  try {
    console.log("[Server Cloud Sync] Verificando existência de credenciais do Supabase no Firestore de contingência...");
    let settings = await firebaseStore.getSettings() as any;
    
    // Auto-backup de variáveis de ambiente locais (como as configuradas pela barra lateral de Secrets)
    const envUrl = process.env.SUPABASE_URL;
    const envKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 
                   process.env.SUPABASE_SERVICE_ROLE || 
                   process.env.SUPABASE_SERVICE_KEY || 
                   process.env.SUPABASE_SERVICE || 
                   process.env.SUPABASE_SERVICE_ || 
                   process.env.SUPABASE_ANON_KEY ||
                   process.env.SUPABASE_ANON_KE;

    if (envUrl && envKey) {
      if (!settings) {
        settings = {
          id: "global",
          company_name: "LS GUARATO",
          welcome_message: "Olá 👋\n\nSeja bem-vindo ao atendimento da LS GUARATO.\n\nEscolha uma das opções abaixo para prosseguir.",
          queue_message: "Todos os nossos atendentes estão em atendimento no momento. Por favor aguarde.",
          out_of_hours_message: "Olá! No momento estamos fora do nosso horário de atendimento. Nosso expediente é de Segunda a Sexta das 08:00 às 18:00.\n\nRetornaremos sua mensagem assim que possível! 🕒",
          inactivity_closure_message: "Seu atendimento foi encerrado por falta de interação por mais de 25 minutos. Se precisar de algo, basta nos chamar novamente! 😊",
          store_link: "https://applsguarato.com.br",
          career_link: "https://guarato.com.br/servicos/vagas",
          offers_link: "https://guarato.com.br/oferecimentos/jornal",
          phones: ["(34) 3311-1234"],
          estimated_wait: 5,
          logo_url: "https://images.unsplash.com/photo-1560179707-f14e90ef3623?w=128&h=128&fit=crop",
          schedules: {
            start: "08:00",
            end: "18:00"
          },
          quick_messages: [
            { id: 'qm_vagas', title: 'VAGAS DE EMPREGOS', text: '💼 *VAGAS DE EMPREGOS*\n\nSeja bem-vindo! Candidate-se ou confira nossas oportunidades de emprego abertas no link abaixo:\n🔗 https://guarato.com.br/servicos/vagas', icon: 'Briefcase' },
            { id: 'qm_ofertas', title: 'JORNAL DE OFERTAS', text: '📰 *JORNAL DE OFERTAS*\n\nPreparamos as melhores promoções para você! Acesse os preços especiais em nosso encarte/jornal de ofertas do mês:\n🔗 https://guarato.com.br/encarte-ofertas', icon: 'Newspaper' },
            { id: 'qm_compras', title: 'COMPRAS ONLINE', text: '🛒 *COMPRAS ONLINE*\n\nConheça nossa loja virtual / catálogo de produtos online e faça suas compras sem sair de casa:\n🔗 https://applsguarato.com.br', icon: 'ShoppingBag' }
          ]
        };
      }
      
      if (settings.supabase_url !== envUrl || settings.supabase_key !== envKey) {
        console.log("[Server Cloud Sync] Sincronizando novas credenciais de ambiente/Secrets para o Firestore de contingência...");
        settings.supabase_url = envUrl;
        settings.supabase_key = envKey;
        await firebaseStore.updateSettings(settings);
      }
    }

    if (settings && settings.supabase_url && settings.supabase_key) {
      const url = settings.supabase_url;
      const key = settings.supabase_key;
      console.log(`[Server Cloud Sync] Credenciais encontradas no Firestore! Forçando conexão com Supabase: ${url.substring(0, 25)}...`);
      reloadSupabaseConfig(url, key);
    } else {
      console.log("[Server Cloud Sync] Nenhuma credencial alternativa do Supabase armazenada no Firestore.");
    }
  } catch (err: any) {
    console.warn("[Server Cloud Sync] Alerta de erro ao consultar credenciais em nuvem no Firestore:", err.message);
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log("[Server] Iniciando servidor em modo de DESENVOLVIMENTO com Vite middleware");
    try {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa'
      });
      app.use(vite.middlewares);
      console.log("[Server] Vite middleware carregado com sucesso.");
    } catch (e) {
      console.error("[Server] Erro ao carregar Vite middleware:", e);
    }
  } else {
    console.log("[Server] Iniciando servidor em modo de PRODUÇÃO com arquivos estáticos de dist/client");
    const distPath = path.resolve('dist/client');
    app.use(express.static(distPath));
    app.use('/uploads', express.static(path.resolve('uploads')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const serverInstance = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Servidor pronto e escutando na porta padrão ${PORT}`);
    console.log(`[Server] Acesse em http://localhost:${PORT}`);
    
    // Autostart WhatsApp Service to resume session if exists - AFTER listening
    whatsappService.init().catch(e => console.error("[WhatsApp] Startup init failed:", e));
    
    // Seed and check Firebase integrity in background
    dbStore.seedIfEmpty().catch(e => console.error("[Database] Integrity check failed:", e));
  });

  serverInstance.on('error', (err) => {
    console.error("[Server] Erro crítico na instância do app Express:", err);
  });
}

console.log("[Server] Executando startServer()...");
startServer().catch(err => {
  console.error("[Server] FALHA FATAL ao iniciar o servidor:", err);
});

// Forçar re-implantação/build de produção em Cloud Run para carregar as chaves do Supabase recém-cadastradas nos Secrets do AI Studio.



