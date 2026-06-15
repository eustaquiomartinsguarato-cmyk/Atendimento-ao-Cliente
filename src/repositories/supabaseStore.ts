import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { User, Sector, Conversation, Message, QueueItem, Settings, AuditLog } from '../types/index.js';

let activeUrl = process.env.SUPABASE_URL || '';
let activeKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 
                process.env.SUPABASE_SERVICE_ROLE || 
                process.env.SUPABASE_SERVICE_KEY || 
                process.env.SUPABASE_SERVICE || 
                process.env.SUPABASE_SERVICE_ || 
                process.env.SUPABASE_ANON_KEY || 
                process.env.SUPABASE_ANON_KE || 
                '';
let activeClient: any = null;

export const reloadSupabaseConfig = (optUrl?: string, optKey?: string) => {
  activeUrl = optUrl || process.env.SUPABASE_URL || '';
  activeKey = optKey || 
              process.env.SUPABASE_SERVICE_ROLE_KEY || 
              process.env.SUPABASE_SERVICE_ROLE || 
              process.env.SUPABASE_SERVICE_KEY || 
              process.env.SUPABASE_SERVICE || 
              process.env.SUPABASE_SERVICE_ || 
              process.env.SUPABASE_ANON_KEY || 
              process.env.SUPABASE_ANON_KE || 
              '';
  
  try {
    const localConfigPath = path.resolve('supabase-config.json');
    if (fs.existsSync(localConfigPath)) {
      const localConfig = JSON.parse(fs.readFileSync(localConfigPath, 'utf-8'));
      if (localConfig.url) activeUrl = localConfig.url;
      if (localConfig.key) activeKey = localConfig.key;
    }
  } catch (e) {
    console.error("[Supabase] Error reading supabase-config.json:", e);
  }

  if (activeUrl) {
    activeUrl = activeUrl.trim().replace(/\/rest\/v1\/?$/, '');
  }

  if (activeUrl && activeKey) {
    console.log(`[Supabase] Building client with URL: ${activeUrl.substring(0, 20)}...`);
    activeClient = createClient(activeUrl, activeKey, {
      auth: {
        persistSession: false
      }
    });
  } else {
    activeClient = null;
  }
};

// Initial load
reloadSupabaseConfig();

export const isSupabaseConfigured = () => {
  return !!(activeUrl && activeKey);
};

export { activeClient as supabaseClient };

function getClient() {
  if (!activeClient) {
    // Attempt one quick refresh in case the file was written
    reloadSupabaseConfig();
    if (!activeClient) {
      throw new Error("Supabase is not configured. Please define SUPABASE_URL and SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY or use the setup page.");
    }
  }
  return activeClient;
}

export class SupabaseStore {
  // --- Users ---
  async getUsers(): Promise<User[]> {
    const { data, error } = await getClient()
      .from('users')
      .select('*')
      .order('created_at', { ascending: true });
    
    if (error) {
      console.error("[Supabase] Error in getUsers:", error.message);
      throw error;
    }
    return (data || []) as User[];
  }

  async saveUser(user: User): Promise<void> {
    const cleanUser = {
      id: user.id,
      name: user.name,
      username: user.username,
      password: user.password,
      email: user.email,
      phone: user.phone,
      role: user.role,
      sector_id: user.sector_id,
      status: user.status,
      photo: user.photo,
      created_at: user.created_at
    };
    
    const { error } = await getClient()
      .from('users')
      .upsert(cleanUser);
      
    if (error) {
      console.error("[Supabase] Error in saveUser:", error.message);
      throw error;
    }
  }

  async deleteUser(id: string): Promise<void> {
    const { error } = await getClient()
      .from('users')
      .delete()
      .eq('id', id);
      
    if (error) {
      console.error("[Supabase] Error in deleteUser:", error.message);
      throw error;
    }
  }

  // --- Sectors ---
  async getSectors(): Promise<Sector[]> {
    const { data, error } = await getClient()
      .from('sectors')
      .select('*')
      .order('created_at', { ascending: true });
      
    if (error) {
      console.error("[Supabase] Error in getSectors:", error.message);
      throw error;
    }
    return (data || []) as Sector[];
  }

  async saveSector(sec: Sector): Promise<void> {
    const cleanSector = {
      id: sec.id,
      name: sec.name,
      description: sec.description,
      status: sec.status,
      created_at: sec.created_at
    };
    
    const { error } = await getClient()
      .from('sectors')
      .upsert(cleanSector);
      
    if (error) {
      console.error("[Supabase] Error in saveSector:", error.message);
      throw error;
    }
  }

  async deleteSector(id: string): Promise<void> {
    const { error } = await getClient()
      .from('sectors')
      .delete()
      .eq('id', id);
      
    if (error) {
      console.error("[Supabase] Error in deleteSector:", error.message);
      throw error;
    }
  }

  // --- Conversations ---
  async getConversations(): Promise<Conversation[]> {
    const { data, error } = await getClient()
      .from('conversations')
      .select('*')
      .order('created_at', { ascending: false });
      
    if (error) {
      console.error("[Supabase] Error in getConversations:", error.message);
      throw error;
    }
    return (data || []) as Conversation[];
  }

  async getConversationById(id: string): Promise<Conversation | undefined> {
    const { data, error } = await getClient()
      .from('conversations')
      .select('*')
      .eq('id', id)
      .maybeSingle();
      
    if (error) {
      console.error("[Supabase] Error in getConversationById:", error.message);
      throw error;
    }
    return data ? (data as Conversation) : undefined;
  }

  async saveConversation(conv: Conversation): Promise<void> {
    const cleanConv = {
      id: conv.id,
      customer_name: conv.customer_name,
      customer_phone: conv.customer_phone,
      sector_id: conv.sector_id,
      attendant_id: conv.attendant_id,
      status: conv.status,
      started_at: conv.started_at,
      last_message: conv.last_message || "",
      character: conv.character,
      tags: conv.tags || [],
      created_at: conv.created_at
    };
    
    const { error } = await getClient()
      .from('conversations')
      .upsert(cleanConv);
      
    if (error) {
      console.error("[Supabase] Error in saveConversation:", error.message);
      throw error;
    }
  }

  async deleteConversation(id: string): Promise<void> {
    const client = getClient();
    
    // Deleting related records first in case foreign key restrictions are enabled
    const { error: msgErr } = await client
      .from('messages')
      .delete()
      .eq('conversation_id', id);
    if (msgErr) console.warn("[Supabase] Warning: delete conversation messages error:", msgErr.message);

    const { error: qErr } = await client
      .from('queue')
      .delete()
      .eq('conversation_id', id);
    if (qErr) console.warn("[Supabase] Warning: delete conversation queue error:", qErr.message);

    const { error } = await client
      .from('conversations')
      .delete()
      .eq('id', id);
      
    if (error) {
      console.error("[Supabase] Error in deleteConversation:", error.message);
      throw error;
    }
  }

  async clearAllConversations(): Promise<void> {
    const client = getClient();
    
    // Clear in cascades
    await client.from('queue').delete().neq('id', 'placeholder_force_delete');
    await client.from('messages').delete().neq('id', 'placeholder_force_delete');
    const { error } = await client.from('conversations').delete().neq('id', 'placeholder_force_delete');
    
    if (error) {
      console.error("[Supabase] Error clearing all conversations:", error.message);
      throw error;
    }
  }

  // --- Messages ---
  async getMessagesForConversation(convId: string): Promise<Message[]> {
    const { data, error } = await getClient()
      .from('messages')
      .select('*')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true });
      
    if (error) {
      console.error("[Supabase] Error in getMessagesForConversation:", error.message);
      throw error;
    }
    return (data || []) as Message[];
  }

  async saveMessage(msg: Message): Promise<void> {
    const cleanMsg = {
      id: msg.id,
      conversation_id: msg.conversation_id,
      sender_type: msg.sender_type,
      message: msg.message,
      created_at: msg.created_at
    };
    
    const { error } = await getClient()
      .from('messages')
      .upsert(cleanMsg);
      
    if (error) {
      console.error("[Supabase] Error in saveMessage:", error.message);
      throw error;
    }
  }

  // --- Queue ---
  async getQueue(): Promise<QueueItem[]> {
    const { data, error } = await getClient()
      .from('queue')
      .select('*')
      .order('position', { ascending: true });
      
    if (error) {
      console.error("[Supabase] Error in getQueue:", error.message);
      throw error;
    }
    return (data || []) as QueueItem[];
  }

  async addToQueue(convId: string, sectorId: string | null): Promise<void> {
    const client = getClient();
    
    // Check if conversation is already in queue
    const { data: existing, error: checkErr } = await client
      .from('queue')
      .select('id')
      .eq('conversation_id', convId)
      .maybeSingle();
      
    if (checkErr) throw checkErr;
    if (existing) return; // Already in queue
    
    // Get next position
    const { data: allQueue, error: countErr } = await client
      .from('queue')
      .select('position');
    if (countErr) throw countErr;
    
    const position = (allQueue || []).length + 1;
    const id = "q_" + Math.random().toString(36).substring(2, 9);
    
    const cleanQueueItem = {
      id,
      conversation_id: convId,
      sector_id: sectorId,
      position,
      created_at: new Date().toISOString()
    };
    
    const { error } = await client
      .from('queue')
      .upsert(cleanQueueItem);
      
    if (error) {
      console.error("[Supabase] Error adding to queue:", error.message);
      throw error;
    }
  }

  async removeFromQueue(convId: string): Promise<void> {
    const client = getClient();
    
    // Remove from queue
    const { error: delErr } = await client
      .from('queue')
      .delete()
      .eq('conversation_id', convId);
      
    if (delErr) {
      console.error("[Supabase] Error removing from queue:", delErr.message);
      throw delErr;
    }
    
    // Order the remaining and update positions
    const { data: remaining, error: selErr } = await client
      .from('queue')
      .select('*')
      .order('position', { ascending: true });
      
    if (selErr) throw selErr;
    
    if (remaining && remaining.length > 0) {
      for (let idx = 0; idx < remaining.length; idx++) {
        await client
          .from('queue')
          .update({ position: idx + 1 })
          .eq('id', remaining[idx].id);
      }
    }
  }

  // --- Settings ---
  async getSettings(): Promise<Settings | null> {
    const { data, error } = await getClient()
      .from('settings')
      .select('data')
      .eq('id', 'global')
      .maybeSingle();
      
    if (error) {
      console.error("[Supabase] Error in getSettings:", error.message);
      throw error;
    }
    return data ? (data.data as Settings) : null;
  }

  async updateSettings(settings: Settings): Promise<void> {
    const { error } = await getClient()
      .from('settings')
      .upsert({
        id: 'global',
        data: settings
      });
      
    if (error) {
      console.error("[Supabase] Error in updateSettings:", error.message);
      throw error;
    }
  }

  // --- Audit Logs ---
  async getAuditLogs(): Promise<AuditLog[]> {
    const { data, error } = await getClient()
      .from('audit_logs')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(500);
      
    if (error) {
      console.error("[Supabase] Error in getAuditLogs:", error.message);
      throw error;
    }
    
    return (data || []).map((row: any) => ({
      id: String(row.id),
      user_name: row.user_name || "",
      user_email: row.user_email || "",
      action: row.action || "",
      target: row.target || "",
      timestamp: row.timestamp || new Date().toISOString()
    })) as AuditLog[];
  }

  async addAuditLog(log: AuditLog): Promise<void> {
    // Exclude 'id' to let SERIAL handle it
    const cleanLog = {
      user_name: log.user_name,
      user_email: log.user_email,
      action: log.action,
      target: log.target,
      timestamp: log.timestamp
    };
    
    const { error } = await getClient()
      .from('audit_logs')
      .insert(cleanLog);
      
    if (error) {
      console.error("[Supabase] Error in addAuditLog:", error.message);
      throw error;
    }
  }
}

export const supabaseStore = new SupabaseStore();
