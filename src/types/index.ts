export type UserRole = 'admin' | 'access_total' | 'atendimento';
export type UserStatus = 'online' | 'offline';

export interface User {
  id: string;
  name: string;
  username: string;
  password?: string;
  email: string;
  phone: string;
  role: UserRole;
  sector_id: string | null;
  status: UserStatus;
  photo?: string;
  created_at: string;
}

export interface Sector {
  id: string;
  name: string;
  description: string;
  status: 'ativo' | 'inativo';
  created_at: string;
}

export type ConversationStatus = 'chatbot' | 'waiting' | 'active' | 'closed';

export interface Conversation {
  id: string;
  customer_name: string;
  customer_phone: string;
  sector_id: string | null;
  attendant_id: string | null;
  status: ConversationStatus;
  started_at: string;
  last_message: string;
  typing?: boolean;
  character?: string;
  tags?: string[];
  created_at: string;
  updated_at?: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_type: 'customer' | 'agent' | 'system';
  message: string;
  created_at: string;
}

export interface QueueItem {
  id: string;
  conversation_id: string;
  sector_id: string | null;
  position: number;
  created_at: string;
}

export interface QuickMessage {
  id: string;
  title: string;
  text: string;
  icon?: 'Briefcase' | 'Newspaper' | 'ShoppingBag' | 'CreditCard' | 'FileText' | 'MessageSquare' | 'AlertCircle';
}

export interface Settings {
  id: string;
  company_name: string;
  welcome_message: string;
  queue_message: string;
  out_of_hours_message?: string;
  inactivity_closure_message?: string;
  closure_message?: string;
  store_link: string;
  career_link: string;
  offers_link?: string;
  phones: string[];
  estimated_wait: number;
  logo_url: string;
  schedules: {
    start: string;
    end: string;
    days?: string[];
  };
  pix_key?: string;
  pix_receiver?: string;
  pix_bank?: string;
  pix_enabled?: boolean;
  bot_options?: {
    id: string;
    trigger_key: string;
    title: string;
    response_text: string;
  }[];
  quick_messages?: QuickMessage[];
  whatsapp_session_creds?: string;
  whatsapp_session_creds_dev?: string;
}

export interface AuditLog {
  id: string;
  user_name: string;
  user_email: string;
  action: string;
  target: string;
  timestamp: string;
}
