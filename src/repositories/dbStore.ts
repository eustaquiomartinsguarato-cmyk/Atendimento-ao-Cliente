import * as fs from 'fs';
import * as path from 'path';
import { User, Sector, Conversation, Message, QueueItem, Settings, AuditLog } from '../types/index.js';
import { firebaseStore } from './firebaseStore.js';
import { supabaseStore, isSupabaseConfigured } from './supabaseStore.js';

const DB_PATH = path.resolve('db.json');

interface Schema {
  users: User[];
  sectors: Sector[];
  conversations: Conversation[];
  messages: Message[];
  queue: QueueItem[];
  settings: Settings;
  auditLogs: AuditLog[];
}

export class DbStore {
  private data: Schema;

  constructor() {
    this.data = this.loadLocal();
    if (isSupabaseConfigured()) {
      console.log("Database: Cloud (Supabase) is the primary storage engine.");
    } else {
      console.log("Database: Cloud (Firebase) is the primary storage engine.");
    }
  }

  private getStore() {
    return isSupabaseConfigured() ? supabaseStore : firebaseStore;
  }

  private getEngineName(): string {
    return isSupabaseConfigured() ? "Supabase" : "Firebase";
  }

  public async seedIfEmpty() {
    try {
      // Small delay to ensure server is starting
      await new Promise(resolve => setTimeout(resolve, 1000));
      console.log(`Database: Running Cloud integrity check on ${this.getEngineName()}...`);
      const store = this.getStore();
      const users = await store.getUsers();
      if (users.length === 0) {
        console.log(`Database: No users found in ${this.getEngineName()}. Seeding admin user...`);
        if (this.data.users && this.data.users.length > 0) {
          for (const u of this.data.users) {
            await store.saveUser(u);
          }
        }
      }

      const sectors = await store.getSectors();
      if (sectors.length === 0) {
        console.log(`Database: No sectors found in ${this.getEngineName()}. Seeding default sectors...`);
        if (this.data.sectors && this.data.sectors.length > 0) {
          for (const s of this.data.sectors) {
            await store.saveSector(s);
          }
        }
      }

      const settings = await store.getSettings();
      if (!settings) {
        console.log(`Database: No settings found in ${this.getEngineName()}. Seeding default settings...`);
        await store.updateSettings(this.data.settings);
      }
      
      console.log(`Database: ${this.getEngineName()} integrity check completed.`);
    } catch (err) {
      console.error(`Database: Error during ${this.getEngineName()} seeding check:`, err);
    }
  }

  private loadLocal(): Schema {
    // Initial defaults if everything fails
    const fallback: Schema = {
      users: [
        {
          id: "usr_admin",
          name: "Administrador LS Guarato",
          username: "admin",
          password: "123",
          email: "eustaquiomartinsguarato@gmail.com",
          phone: "(34) 99999-1111",
          role: "admin",
          sector_id: null,
          status: "online",
          photo: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=faces",
          created_at: new Date().toISOString()
        }
      ],
      sectors: [
        {
          id: "sec_rh",
          name: "RH",
          description: "Recrutamento, Seleção e Departamento Pessoal",
          status: "ativo",
          created_at: new Date().toISOString()
        },
        {
          id: "sec_televendas",
          name: "TELEVENDAS",
          description: "Vendas diretas, Orçamentos e Negociações",
          status: "ativo",
          created_at: new Date().toISOString()
        },
        {
          id: "sec_cobranca",
          name: "COBRANÇA",
          description: "Setor Financeiro, Boletos, Notas Fiscais e Pagamentos",
          status: "ativo",
          created_at: new Date().toISOString()
        }
      ],
      conversations: [],
      messages: [],
      queue: [],
      settings: {
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
      },
      auditLogs: []
    };

    try {
      if (fs.existsSync(DB_PATH)) {
        const raw = fs.readFileSync(DB_PATH, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (e) {
      console.error("Error loading db.json:", e);
    }

    return fallback;
  }

  private saveLocal() {
    try {
      fs.writeFileSync(DB_PATH, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (e) {
      console.error("Error saving db.json:", e);
    }
  }

  // --- Users ---
  async getUsers(): Promise<User[]> {
    try {
      const cloud = await this.getStore().getUsers();
      if (cloud && cloud.length > 0) {
        this.data.users = cloud;
        this.saveLocal();
      }
    } catch (err) {
      console.error(`${this.getEngineName()} getUsers error, using local fallback:`, err);
    }
    return this.data.users;
  }

  async saveUser(user: User) {
    const index = this.data.users.findIndex(u => u.id === user.id);
    if (index >= 0) {
      this.data.users[index] = user;
    } else {
      this.data.users.push(user);
    }
    this.saveLocal();

    try {
      console.log(`[Storage] Saving user on ${this.getEngineName()}: ${user.username} (${user.id})`);
      await this.getStore().saveUser(user);
    } catch (err) {
      console.error(`[Storage Fallback] ${this.getEngineName()} saveUser error, fell back to local storage:`, err);
      throw err;
    }
  }

  async deleteUser(id: string) {
    this.data.users = this.data.users.filter(u => u.id !== id);
    this.saveLocal();

    try {
      await this.getStore().deleteUser(id);
    } catch (err) {
      console.error(`[Storage Fallback] ${this.getEngineName()} deleteUser error, fell back to local storage:`, err);
      throw err;
    }
  }

  // --- Sectors ---
  async getSectors(): Promise<Sector[]> {
    try {
      const cloud = await this.getStore().getSectors();
      if (cloud && cloud.length > 0) {
        this.data.sectors = cloud;
        this.saveLocal();
      }
    } catch (err) {
      console.error(`${this.getEngineName()} getSectors error, using local fallback:`, err);
    }
    return this.data.sectors;
  }

  async saveSector(sec: Sector) {
    const index = this.data.sectors.findIndex(s => s.id === sec.id);
    if (index >= 0) {
      this.data.sectors[index] = sec;
    } else {
      this.data.sectors.push(sec);
    }
    this.saveLocal();

    try {
      console.log(`[Storage] Saving sector on ${this.getEngineName()}: ${sec.name} (${sec.id})`);
      await this.getStore().saveSector(sec);
    } catch (err) {
      console.error(`[Storage Fallback] ${this.getEngineName()} saveSector error, fell back to local storage:`, err);
      throw err;
    }
  }

  async deleteSector(id: string) {
    this.data.sectors = this.data.sectors.filter(s => s.id !== id);
    this.saveLocal();

    try {
      await this.getStore().deleteSector(id);
    } catch (err) {
      console.error(`[Storage Fallback] ${this.getEngineName()} deleteSector error, fell back to local storage:`, err);
      throw err;
    }
  }

  // --- Conversations ---
  async getConversations(): Promise<Conversation[]> {
    try {
      const cloud = await this.getStore().getConversations();
      if (cloud && cloud.length > 0) {
        this.data.conversations = cloud;
        this.saveLocal();
      }
    } catch (err) {
      console.error(`${this.getEngineName()} getConversations error, using local fallback:`, err);
    }
    return this.data.conversations;
  }

  async getConversationById(id: string): Promise<Conversation | undefined> {
    try {
      const cloud = await this.getStore().getConversationById(id);
      if (cloud) {
        const index = this.data.conversations.findIndex(c => c.id === id);
        if (index >= 0) {
          this.data.conversations[index] = cloud;
        } else {
          this.data.conversations.push(cloud);
        }
        this.saveLocal();
        return cloud;
      }
    } catch (err) {
      console.error(`${this.getEngineName()} getConversationById error, using local fallback:`, err);
    }
    return this.data.conversations.find(c => c.id === id);
  }

  async saveConversation(conv: Conversation) {
    const index = this.data.conversations.findIndex(c => c.id === conv.id);
    if (index >= 0) {
      this.data.conversations[index] = conv;
    } else {
      this.data.conversations.push(conv);
    }
    this.saveLocal();

    try {
      await this.getStore().saveConversation(conv);
    } catch (err) {
      console.error(`[Storage Fallback] ${this.getEngineName()} saveConversation error, fell back to local storage:`, err);
      throw err;
    }
  }

  async deleteConversation(id: string) {
    this.data.conversations = this.data.conversations.filter(c => c.id !== id);
    this.data.messages = this.data.messages.filter(m => m.conversation_id !== id);
    this.data.queue = this.data.queue.filter(q => q.conversation_id !== id);
    this.saveLocal();

    try {
      await this.getStore().deleteConversation(id);
    } catch (err) {
      console.error(`[Storage Fallback] ${this.getEngineName()} deleteConversation error, fell back to local storage:`, err);
      throw err;
    }
  }

  async clearAllConversations() {
    this.data.conversations = [];
    this.data.messages = [];
    this.data.queue = [];
    this.saveLocal();

    try {
      await this.getStore().clearAllConversations();
    } catch (err) {
      console.error(`[Storage Fallback] ${this.getEngineName()} clearAllConversations error, fell back to local storage:`, err);
    }
  }

  // --- Messages ---
  async getMessagesForConversation(convId: string): Promise<Message[]> {
    try {
      const cloud = await this.getStore().getMessagesForConversation(convId);
      if (cloud && cloud.length > 0) {
        // Merge cloud messages for this conversation into our local list
        this.data.messages = this.data.messages.filter(m => m.conversation_id !== convId).concat(cloud);
        this.saveLocal();
      }
    } catch (err) {
      console.error(`${this.getEngineName()} getMessagesForConversation error, using local fallback:`, err);
    }
    
    const msgs = this.data.messages.filter(m => m.conversation_id === convId);
    return msgs.sort((a: Message, b: Message) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }

  async saveMessage(msg: Message) {
    const index = this.data.messages.findIndex(m => m.id === msg.id);
    if (index >= 0) {
      this.data.messages[index] = msg;
    } else {
      this.data.messages.push(msg);
    }
    
    // Update last_message timestamp/text on the local conversation cache
    const conv = this.data.conversations.find(c => c.id === msg.conversation_id);
    if (conv) {
      conv.last_message = msg.message;
    }
    this.saveLocal();

    try {
      await this.getStore().saveMessage(msg);
    } catch (err) {
      console.error(`[Storage Fallback] ${this.getEngineName()} saveMessage error, fell back to local storage:`, err);
    }
  }

  // --- Queue ---
  async getQueue(): Promise<QueueItem[]> {
    try {
      const cloud = await this.getStore().getQueue();
      if (cloud && cloud.length > 0) {
        this.data.queue = cloud;
        this.saveLocal();
      }
    } catch (err) {
      console.error(`${this.getEngineName()} getQueue error, using local fallback:`, err);
    }
    return this.data.queue.sort((a: QueueItem, b: QueueItem) => (a.position || 0) - (b.position || 0));
  }

  async addToQueue(convId: string, sectorId: string | null) {
    const already = this.data.queue.some(q => q.conversation_id === convId);
    if (!already) {
      const position = this.data.queue.length + 1;
      const id = "q_" + Math.random().toString(36).substring(2, 9);
      this.data.queue.push({
        id,
        conversation_id: convId,
        sector_id: sectorId,
        position,
        created_at: new Date().toISOString()
      });
      this.saveLocal();
    }

    try {
      await this.getStore().addToQueue(convId, sectorId);
    } catch (err) {
      console.error(`[Storage Fallback] ${this.getEngineName()} addToQueue error, fell back to local storage:`, err);
    }
  }

  async removeFromQueue(convId: string) {
    this.data.queue = this.data.queue.filter(q => q.conversation_id !== convId);
    // Recalculate positions
    this.data.queue.sort((a,b) => (a.position || 0) - (b.position || 0)).forEach((item, idx) => {
      item.position = idx + 1;
    });
    this.saveLocal();

    try {
      await this.getStore().removeFromQueue(convId);
    } catch (err) {
      console.error(`[Storage Fallback] ${this.getEngineName()} removeFromQueue error, fell back to local storage:`, err);
    }
  }

  // --- Settings ---
  async getSettings(): Promise<Settings> {
    try {
      const settings = await this.getStore().getSettings();
      if (settings) {
        this.data.settings = settings;
        this.saveLocal();
      }
    } catch (err) {
      console.error(`${this.getEngineName()} getSettings error, using local fallback:`, err);
    }
    return this.data.settings;
  }

  async updateSettings(settings: Settings) {
    this.data.settings = settings;
    this.saveLocal();

    try {
      await this.getStore().updateSettings(settings);
    } catch (err) {
      console.error(`[Storage Fallback] ${this.getEngineName()} updateSettings error, fell back to local storage:`, err);
      throw err;
    }
  }

  // --- Audit ---
  async getAuditLogs(): Promise<AuditLog[]> {
    try {
      const cloud = await this.getStore().getAuditLogs();
      if (cloud && cloud.length > 0) {
        this.data.auditLogs = cloud;
        this.saveLocal();
      }
    } catch (err) {
      console.error(`${this.getEngineName()} getAuditLogs error, using local fallback:`, err);
    }
    return this.data.auditLogs.sort((a: AuditLog, b: AuditLog) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  async addAuditLog(log: AuditLog) {
    this.data.auditLogs.unshift(log);
    if (this.data.auditLogs.length > 500) {
      this.data.auditLogs = this.data.auditLogs.slice(0, 500);
    }
    this.saveLocal();

    try {
      await this.getStore().addAuditLog(log);
    } catch (err) {
      console.error(`[Storage Fallback] ${this.getEngineName()} addAuditLog error, fell back to local storage:`, err);
    }
  }
}

export const dbStore = new DbStore();
