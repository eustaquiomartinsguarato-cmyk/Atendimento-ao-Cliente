-- 1. Tabela de Usuários
DROP TABLE IF EXISTS public.users CASCADE;
CREATE TABLE IF NOT EXISTS public.users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password TEXT,
  email TEXT,
  phone TEXT,
  role TEXT,
  sector_id TEXT,
  status TEXT DEFAULT 'online',
  photo TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. Tabela de Setores
DROP TABLE IF EXISTS public.sectors CASCADE;
CREATE TABLE IF NOT EXISTS public.sectors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'ativo',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 3. Tabela de Conversas
DROP TABLE IF EXISTS public.conversations CASCADE;
CREATE TABLE IF NOT EXISTS public.conversations (
  id TEXT PRIMARY KEY,
  customer_name TEXT,
  customer_phone TEXT,
  sector_id TEXT,
  attendant_id TEXT,
  status TEXT,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  last_message TEXT,
  character TEXT,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 4. Tabela de Mensagens
DROP TABLE IF EXISTS public.messages;
CREATE TABLE IF NOT EXISTS public.messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_type TEXT,
  message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 5. Tabela de Fila de Atendimento
DROP TABLE IF EXISTS public.queue;
CREATE TABLE IF NOT EXISTS public.queue (
  id TEXT PRIMARY KEY,
  conversation_id TEXT REFERENCES public.conversations(id) ON DELETE CASCADE,
  sector_id TEXT,
  position INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 6. Tabela de Configurações
DROP TABLE IF EXISTS public.settings;
CREATE TABLE IF NOT EXISTS public.settings (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL
);

-- 7. Tabela de Logs de Auditoria
DROP TABLE IF EXISTS public.audit_logs;
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id SERIAL PRIMARY KEY,
  user_name TEXT,
  user_email TEXT,
  action TEXT,
  target TEXT,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);
