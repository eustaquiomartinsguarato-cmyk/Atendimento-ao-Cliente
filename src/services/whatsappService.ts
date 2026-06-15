import makeWASocketPkg, { 
  DisconnectReason, 
  useMultiFileAuthState, 
  fetchLatestBaileysVersion,
  WASocket,
  downloadContentFromMessage
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import pino from 'pino';
import * as path from 'path';
import * as fs from 'fs';
import { dbStore } from '../repositories/dbStore.js';
import { handleIncomingMessageForChatbot } from './chatbot.js';
import { Conversation, Message } from '../types/index.js';

// Robust compatibility wrapper to support both ESM default import and esbuild CommonJS bundle issues
const makeWASocket = (typeof makeWASocketPkg === 'function' ? makeWASocketPkg : (makeWASocketPkg as any).default || (makeWASocketPkg as any).makeWASocket || makeWASocketPkg) as typeof makeWASocketPkg;

export class WhatsappService {
  private socket: WASocket | null = null;
  private status = 'DISCONNECTED';
  private number = '';
  private qrCodeUrl: string | null = null;
  private listeners: ((event: string, data: any) => void)[] = [];
  private authPath = path.resolve(
    process.env.NODE_ENV === 'production' ? 'baileys_auth' : 'baileys_auth_dev'
  );

  private isInitializing = false;
  private reconnectTimeout: any = null;
  private attemptCount = 0;

  constructor() {}

  private async clearAuthPath() {
    console.log('[WhatsApp] Cleaning authPath and removing active elements...');
    
    // 1. Ensure any active reconnect timers are aborted immediately
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    // 2. Clear socket listeners and terminate connection to release open files
    if (this.socket) {
      try {
        console.log('[WhatsApp] Removing event listeners and ending active socket...');
        this.socket.ev.removeAllListeners('connection.update');
        this.socket.ev.removeAllListeners('creds.update');
        this.socket.ev.removeAllListeners('messages.upsert');
        this.socket.end(undefined);
      } catch (e) {
        console.error('[WhatsApp] Error ending socket in clearAuthPath:', e);
      }
      this.socket = null;
    }

    this.isInitializing = false;

    // 3. Purge files with alternative fallback if directories are locked
    if (fs.existsSync(this.authPath)) {
      try {
        fs.rmSync(this.authPath, { recursive: true, force: true });
        console.log('[WhatsApp] Successfully purged auth directories.');
      } catch (e: any) {
        console.error('[WhatsApp] Error calling rmSync on authPath. Attempting individual file deletions...', e);
        try {
          const files = fs.readdirSync(this.authPath);
          for (const file of files) {
            try {
              fs.unlinkSync(path.join(this.authPath, file));
            } catch (err) {}
          }
          fs.rmdirSync(this.authPath);
          console.log('[WhatsApp] Alternative file cleanup completed successfully.');
        } catch (e2) {
          console.error('[WhatsApp] Alternative cleanup also failed. Locking issue is likely present.', e2);
        }
      }
    }
  }

  async init(forceSync = false) {
    if (this.isInitializing) {
      console.log('[WhatsApp] Initialization already in progress, skipping...');
      return;
    }

    // Se NÃO for forceSync, vamos verificar se temos credenciais para restaurar.
    // Se não tivermos nenhuma credencial no banco E não houver arquivo creds.json localmente, não devemos inicializar!
    if (!forceSync) {
      let hasCreds = false;
      try {
        const settings = await dbStore.getSettings();
        const credsField = process.env.NODE_ENV === 'production' ? 'whatsapp_session_creds' : 'whatsapp_session_creds_dev';
        if (settings && settings[credsField]) {
          hasCreds = true;
        }
      } catch (dbErr) {
        console.error('[WhatsApp] Guard Check - Error reading settings:', dbErr);
      }

      const credsPath = path.join(this.authPath, 'creds.json');
      if (fs.existsSync(credsPath)) {
        hasCreds = true;
      }

      if (!hasCreds) {
        console.log('[WhatsApp] No session credentials found. Skipping auto-initialization to remain DISCONNECTED.');
        this.status = 'DISCONNECTED';
        this.isConnected = false;
        this.qrCodeUrl = null;
        this.isInitializing = false;
        this.notify('status_change', this.getStatus());
        return;
      }
    }

    this.isInitializing = true;

    // Clear any pending reconnect timers
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.socket) {
      console.log('[WhatsApp] Socket already exists, closing before re-init');
      try {
        this.socket.ev.removeAllListeners('connection.update');
        this.socket.ev.removeAllListeners('creds.update');
        this.socket.ev.removeAllListeners('messages.upsert');
        this.socket.end(undefined);
      } catch (e) {
        console.error('[WhatsApp] Error ending existing socket:', e);
      }
      this.socket = null;
    }

    console.log('[WhatsApp] Initializing Baileys...');
    this.status = 'INITIALIZING';
    this.notify('status_change', this.getStatus());

    try {
      // Ensure auth path is a directory and not a stale file
      if (fs.existsSync(this.authPath)) {
        const stats = fs.lstatSync(this.authPath);
        if (!stats.isDirectory()) {
           console.warn('[WhatsApp] Auth path is a file, deleting to recreate as directory');
           fs.unlinkSync(this.authPath);
        }
      } else {
        // If directory doesn't exist, check database to restore saved credentials
        try {
          const settings = await dbStore.getSettings();
          const credsField = process.env.NODE_ENV === 'production' ? 'whatsapp_session_creds' : 'whatsapp_session_creds_dev';
          const savedCreds = settings ? settings[credsField] : undefined;
          if (savedCreds) {
            console.log(`[WhatsApp] Restored session credentials found in database (${credsField}). Setting up local files.`);
            fs.mkdirSync(this.authPath, { recursive: true });
            const credsPath = path.join(this.authPath, 'creds.json');
            fs.writeFileSync(credsPath, savedCreds, 'utf-8');
            console.log('[WhatsApp] session credentials restored successfully!');
          }
        } catch (dbErr: any) {
          console.error('[WhatsApp] Failed to restore credentials from database fallback:', dbErr?.message || dbErr);
        }
      }

      console.log('[WhatsApp] Loading auth state from:', this.authPath);
      const { state, saveCreds } = await useMultiFileAuthState(this.authPath);
      
      console.log('[WhatsApp] Fetching latest Baileys version with 5s timeout...');
      let version: [number, number, number] | undefined = undefined; 
      try {
        const versionPromise = fetchLatestBaileysVersion();
        const timeoutPromise = new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Timeout de consulta de versão do Baileys')), 5000)
        );
        const latest = await Promise.race([versionPromise, timeoutPromise]);
        version = latest.version;
        console.log(`[WhatsApp] Using Baileys v${version.join('.')}, isLatest: ${latest.isLatest}`);
      } catch (e: any) {
        console.warn(`[WhatsApp] Failed to fetch latest Baileys version: ${e.message || e}. Letting Baileys auto-select stable internal default version.`);
        try {
          await dbStore.addAuditLog({
            id: "wa_sys_info_" + Date.now(),
            user_name: "Status do Celular",
            user_email: "whatsapp-engine@guarato.com.br",
            action: "WHATSAPP_CONFIG_INFO",
            target: `Consulta de versão via NPM falhou. Usando versão interna do Baileys. Detalhes: ${e.message || e}`,
            timestamp: new Date().toISOString()
          });
        } catch (logErr) {}
      }

      console.log('[WhatsApp] Creating socket...');
      const socketOptions: any = {
        ...(version ? { version } : {}),
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }) as any,
        connectTimeoutMs: 120000, // Increased timeout
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
        browser: ['LS GUARATO', 'Chrome', '10.0.0']
      };

      this.socket = makeWASocket(socketOptions);

      this.socket.ev.on('creds.update', async () => {
        try {
          // 1. Let Baileys update details on the disk
          await saveCreds();

          // 2. Perform background backup to the Database (Supabase / local DB settings)
          try {
            const credsPath = path.join(this.authPath, 'creds.json');
            if (fs.existsSync(credsPath)) {
              const raw = fs.readFileSync(credsPath, 'utf-8');
              const settings = await dbStore.getSettings();
              const credsField = process.env.NODE_ENV === 'production' ? 'whatsapp_session_creds' : 'whatsapp_session_creds_dev';
              if (settings[credsField] !== raw) {
                console.log(`[WhatsApp] Session credentials modified. Synced backup to database field ${credsField}...`);
                settings[credsField] = raw;
                await dbStore.updateSettings(settings);
              }
            }
          } catch (backupErr: any) {
            console.error('[WhatsApp] Background cloud database session sync failed:', backupErr?.message || backupErr);
          }
        } catch (credsErr: any) {
          console.error('[WhatsApp] Error in creds.update:', credsErr);
        }
      });

      this.socket.ev.on('connection.update', async (update) => {
        try {
          const { connection, lastDisconnect, qr } = update;

          if (qr) {
            console.log('[WhatsApp] QR Code received');
            this.status = 'SCANNING_QR';
            try {
              this.qrCodeUrl = await QRCode.toDataURL(qr);
              this.notify('status_change', this.getStatus());

              try {
                await dbStore.addAuditLog({
                  id: "wa_sys_qr_" + Date.now(),
                  user_name: "Status do Celular",
                  user_email: "whatsapp-engine@guarato.com.br",
                  action: "WHATSAPP_CONFIG_INFO",
                  target: "Novo QR Code gerado. Pronto para escaneamento no painel.",
                  timestamp: new Date().toISOString()
                });
              } catch (logErr) {}
            } catch (qrErr) {
              console.error('[WhatsApp] Error converting QR to DataURL:', qrErr);
            }
          }

          if (connection === 'close') {
            const error = lastDisconnect?.error as any;
            const statusCode = error?.output?.statusCode;
            const errorMessage = error?.message || "";
            
            // Force reset if session is corrupted or "Bad MAC" detected
            const isBadSession = 
              statusCode === DisconnectReason.badSession || 
              statusCode === 401 ||
              errorMessage.includes('Bad MAC') ||
              errorMessage.includes('decryption');

            // If the QR code attempts ended or timed out
            const isQrTimeout = 
              errorMessage.includes('QR refs attempts ended') || 
              (statusCode === 408 && !this.isConnected);

            const shouldReconnect = 
              statusCode !== DisconnectReason.loggedOut && 
              !isBadSession && 
              !isQrTimeout;
            
            console.log(`[WhatsApp] Connection closed. Status: ${statusCode}. Reconnecting: ${shouldReconnect}. Error: ${errorMessage}`);
            
            this.status = 'DISCONNECTED';
            this.isConnected = false;
            this.qrCodeUrl = null;
            this.notify('status_change', this.getStatus());

            try {
              await dbStore.addAuditLog({
                id: "wa_sys_conn_" + Date.now(),
                user_name: "Status do Celular",
                user_email: "whatsapp-engine@guarato.com.br",
                action: "WHATSAPP_CONEXAO_MUDANCA",
                target: `Conexão fechada. Código: ${statusCode || 'N/A'}. Motivo: ${errorMessage || 'N/A'}. Reatando conexão: ${shouldReconnect}`,
                timestamp: new Date().toISOString()
              });
            } catch (logErr) {}

            if (isBadSession) {
               console.warn('[WhatsApp] Corrupted session detected (Bad MAC/Decryption failure). Cleaning auth path.');
               await this.clearAuthPath();
               
               this.attemptCount++;
               const delay = Math.min(2000 * Math.pow(1.5, this.attemptCount), 60000);
               this.reconnectTimeout = setTimeout(() => this.init(false), delay);
               return;
            }

            if (isQrTimeout) {
               console.log('[WhatsApp] QR refs attempts ended or timed out. Clearing auth directory and stopping automatic QR generation.');
               await this.clearAuthPath();
               this.status = 'DISCONNECTED';
               this.isConnected = false;
               this.qrCodeUrl = null;
               this.isInitializing = false;
               this.notify('status_change', this.getStatus());
               return;
            }

            if (shouldReconnect) {
              console.log('[WhatsApp] Reconnection scheduled in 4s');
              this.isInitializing = false;
              this.reconnectTimeout = setTimeout(() => this.init(false), 4000);
            } else {
              this.isInitializing = false;
              if (statusCode === DisconnectReason.loggedOut) {
                await this.clearAuthPath();
                
                // Clear session credentials from database
                try {
                  const settings = await dbStore.getSettings();
                  const credsField = process.env.NODE_ENV === 'production' ? 'whatsapp_session_creds' : 'whatsapp_session_creds_dev';
                  if (settings && settings[credsField]) {
                    delete settings[credsField];
                    await dbStore.updateSettings(settings);
                    console.log(`[WhatsApp] Session logged out. Successfully cleared cloud credentials backup (${credsField}).`);
                  }
                } catch (clearDbErr: any) {
                  console.error('[WhatsApp] Failed to clear cloud backup on logout:', clearDbErr?.message || clearDbErr);
                }
              }
            }
          } else if (connection === 'open') {
            console.log('[WhatsApp] Connection opened successfully!');
            this.status = 'CONNECTED';
            this.attemptCount = 0;
            this.isConnected = true;
            this.qrCodeUrl = null;
            this.number = this.socket?.user?.id.split(':')[0] || '';
            this.isInitializing = false;
            this.notify('status_change', this.getStatus());

            await dbStore.addAuditLog({
              id: "log_" + Math.random().toString(36).substring(2, 9),
              user_name: "Sistema",
              user_email: "admin@guarato.com.br",
              action: "WHATSAPP_CONEXAO",
              target: `Canal de WhatsApp conectado com sucesso. Número ativo: ${this.number}`,
              timestamp: new Date().toISOString()
            });
          }
        } catch (connectionErr) {
          console.error('[WhatsApp] Error in connection.update event listener:', connectionErr);
        }
      });

      this.socket.ev.on('messages.upsert', async (m) => {
        try {
          console.log(`[WhatsApp] messages.upsert received. Type: ${m.type}, count: ${m.messages?.length || 0}`);
          
          // Log event reception to the audit log so the admin can trace execution in the audit panel
          try {
            const sample = m.messages?.[0];
            await dbStore.addAuditLog({
              id: "wa_sys_" + Date.now() + "_" + Math.floor(Math.random() * 105),
              user_name: "Detecção Automática",
              user_email: "whatsapp-engine@guarato.com.br",
              action: "WHATSAPP_EVENTO",
              target: `Mensagem recebida do WhatsApp. Tipo Evento: ${m.type}. Quantidade: ${m.messages?.length || 0}. Nome: ${sample?.pushName || 'N/A'}`,
              timestamp: new Date().toISOString()
            });
          } catch (e) {
            console.error('[WhatsApp] Debug logging error:', e);
          }

          // Process all received messages
          for (const msg of (m.messages || [])) {
            if (!msg.key) continue;

            const remoteJid = msg.key.remoteJid || '';
            const isIndividualChat = remoteJid.endsWith('@s.whatsapp.net') || remoteJid.endsWith('@lid');

            if (isIndividualChat) {
              console.log('[WhatsApp] Processing message context for:', remoteJid, 'fromMe:', !!msg.key.fromMe);
              try {
                await this.handleIncomingMessage(msg);
              } catch (msgErr) {
                console.error(`[WhatsApp] Error handling index individual message from ${remoteJid}:`, msgErr);
              }
            } else {
              console.log('[WhatsApp] Skipping message for non-individual JID (groups/newsletters/status):', remoteJid);
            }
          }
        } catch (upsertErr) {
          console.error('[WhatsApp] Error in messages.upsert event listener:', upsertErr);
        }
      });
    } catch (err: any) {
      console.error("[WhatsApp] Error initializing Baileys:", err);
      try {
        await dbStore.addAuditLog({
          id: "wa_sys_err_" + Date.now(),
          user_name: "Sistema (Falha)",
          user_email: "whatsapp-engine@guarato.com.br",
          action: "WHATSAPP_CONEXAO_FALHA",
          target: `Erro fatal de inicialização: ${err.message || err}`,
          timestamp: new Date().toISOString()
        });
      } catch (logErr) {}
      
      await this.clearAuthPath();
      this.status = 'DISCONNECTED';
      this.isInitializing = false;
      this.notify('status_change', this.getStatus());
    }
  }

  private isConnected = false;

  getStatus() {
    return {
      status: this.status,
      number: this.number,
      qrCodeUrl: this.qrCodeUrl
    };
  }

  async requestSync(email: string, name: string) {
    if (this.status === 'CONNECTED') return this.getStatus();
    
    console.log(`[WhatsApp] Sync requested by ${name} (${email}). Clearing previous files and cloud backup credentials.`);

    // 1. Force release any sockets/locks and delete directories cleanly first!
    await this.clearAuthPath();

    // 2. Clear credentials backup from database to prevent restoration of stale session and guarantee a fresh QR!
    try {
      const settings = await dbStore.getSettings();
      const credsField = process.env.NODE_ENV === 'production' ? 'whatsapp_session_creds' : 'whatsapp_session_creds_dev';
      if (settings && settings[credsField]) {
         delete settings[credsField];
         await dbStore.updateSettings(settings);
         console.log(`[WhatsApp] Removed cloud session credentials backup (${credsField}) on fresh sync request to guarantee a clean new QR.`);
      }
    } catch (clearDbErr: any) {
      console.error('[WhatsApp] Failed to clear cloud backup on sync request:', clearDbErr?.message || clearDbErr);
    }

    this.status = 'DISCONNECTED';

    // 3. Begin a brand new clean initialization
    await this.init(true);

    try {
      await dbStore.addAuditLog({
        id: "log_" + Math.random().toString(36).substring(2, 9),
        user_name: name || "Admin",
        user_email: email || "admin@guarato.com.br",
        action: "WHATSAPP_CONEXAO_SOLICITADA",
        target: "Sincronização de canal WhatsApp (QR Code) solicitada.",
        timestamp: new Date().toISOString()
      });
    } catch (e) {}

    return this.getStatus();
  }

  async disconnect(email: string, name: string) {
    console.log(`[WhatsApp] Disconnection requested by ${name} (${email}). Clearing session files.`);

    // 1. Clear session files and stop sockets cleanly
    await this.clearAuthPath();

    this.status = 'DISCONNECTED';
    this.isConnected = false;
    this.qrCodeUrl = null;
    this.number = '';

    // 2. Clear session credentials from database backup
    try {
      const settings = await dbStore.getSettings();
      const credsField = process.env.NODE_ENV === 'production' ? 'whatsapp_session_creds' : 'whatsapp_session_creds_dev';
      if (settings && settings[credsField]) {
         delete settings[credsField];
         await dbStore.updateSettings(settings);
         console.log(`[WhatsApp] Removed cloud session credentials backup (${credsField}).`);
      }
    } catch (clearDbErr: any) {
      console.error('[WhatsApp] Failed to clear cloud credentials backup:', clearDbErr?.message || clearDbErr);
    }

    try {
      await dbStore.addAuditLog({
        id: "log_" + Math.random().toString(36).substring(2, 9),
        user_name: name || "Admin",
        user_email: email || "admin@guarato.com.br",
        action: "WHATSAPP_DESCONEXAO",
        target: "Atendimento desconectado sob demanda do operador.",
        timestamp: new Date().toISOString()
      });
    } catch (e) {}

    this.notify('status_change', this.getStatus());
    
    // Removido timer incondicional para impedir loop de auto-conexão imediata sem pareamento!
    console.log('[WhatsApp] Disconnect completed. Staying in DISCONNECTED state.');

    return this.getStatus();
  }

  onUpdate(callback: (event: string, data: any) => void) {
    this.listeners.push(callback);
  }

  private notify(event: string, data: any) {
    this.listeners.forEach(cb => {
      try { cb(event, data); } catch(e) {}
    });
  }

  private pendingCreations = new Set<string>();

  private async handleIncomingMessage(upsert: any) {
    const remoteJid = upsert.key?.remoteJid;
    if (!remoteJid || (!remoteJid.endsWith('@s.whatsapp.net') && !remoteJid.endsWith('@lid'))) return;

    // Usar JID completo para garantir entrega (@lid ou @s.whatsapp.net)
    const phone = remoteJid;
    const cleanPhone = phone.split('@')[0].replace(/\D/g, '');
    const fromMe = !!upsert.key?.fromMe;
    const senderType = fromMe ? 'agent' : 'customer';
    
    // Bloqueio simples para evitar criação duplicada em mensagens simultâneas
    if (!fromMe && this.pendingCreations.has(cleanPhone)) {
      console.log(`[WhatsApp] Ignorando detecção redundante para criação pendente de ${cleanPhone}`);
      return;
    }

    // Função para extrair texto de diversos formatos de mensagem
    const getMessageText = (msg: any): string => {
      if (!msg) return "";
      if (typeof msg === 'string') return msg;

      const message = msg.message || msg;

      // Filtra mensagens técnicas de protocolo/sincronização
      if (message.protocolMessage || 
          message.senderKeyDistributionMessage || 
          message.peerDataOperationRequestMessage || 
          message.appStateSyncKeyShare ||
          message.allPackageMessage ||
          message.reactionMessage) {
        return "__EVENTO_TECNICO__";
      }
      
      const content = message.ephemeralMessage?.message || 
                      message.viewOnceMessage?.message || 
                      message.viewOnceMessageV2?.message || 
                      message;

      if (typeof content === 'string') return content;
      if (!content) return "";

      const text = content.conversation || 
                   content.extendedTextMessage?.text || 
                   content.imageMessage?.caption || 
                   content.videoMessage?.caption || 
                   content.buttonsResponseMessage?.selectedButtonId ||
                   content.listResponseMessage?.singleSelectReply?.selectedRowId ||
                   content.templateButtonReplyMessage?.selectedId ||
                   content.interactiveResponseMessage?.body?.text ||
                   content.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson ||
                   content.documentWithCaptionMessage?.message?.documentMessage?.caption ||
                   content.text ||
                   "";

      if (!text && content.body?.text) return content.body.text;
      
      return text;
    };

    const text = getMessageText(upsert);

    if (text === "__EVENTO_TECNICO__") {
      console.log('[WhatsApp] Ignorando evento técnico (protocolo/sinc) de', cleanPhone);
      return;
    }

    const isMedia = !!(upsert.message?.imageMessage || upsert.message?.videoMessage || upsert.message?.audioMessage || upsert.message?.documentMessage || upsert.message?.stickerMessage);

    if (!text && !isMedia) {
      console.log('[WhatsApp] Mensagem recebida de', cleanPhone, 'porém sem conteúdo legível.');
      try {
        await dbStore.addAuditLog({
          id: "wa_sys_" + Date.now() + "_" + Math.floor(Math.random() * 100),
          user_name: "Sistema de Detecção",
          user_email: "whatsapp-engine@guarato.com.br",
          action: "MENSAGEM_VAZIA",
          target: `Mensagem de ${cleanPhone} sem texto. Chaves: ${JSON.stringify(Object.keys(upsert.message || {}))}`,
          timestamp: new Date().toISOString()
        });
      } catch (e) {}
      return;
    }

    const finalMessageText = text || (upsert.message?.imageMessage ? "📷 Foto" : upsert.message?.videoMessage ? "🎥 Vídeo" : upsert.message?.audioMessage ? "🎙️ Áudio" : upsert.message?.documentMessage ? "📄 Documento" : upsert.message?.stickerMessage ? "🖼️ Figurinha" : "📎 Mídia");

    let file_url: string | undefined = undefined;
    let file_name: string | undefined = undefined;
    let file_mimetype: string | undefined = undefined;

    if (isMedia) {
      try {
        const msgObj = upsert.message?.imageMessage || 
                       upsert.message?.videoMessage || 
                       upsert.message?.audioMessage || 
                       upsert.message?.documentMessage || 
                       upsert.message?.stickerMessage;
        
        if (msgObj) {
          const mType = upsert.message?.imageMessage ? 'image' : 
                        upsert.message?.videoMessage ? 'video' : 
                        upsert.message?.audioMessage ? 'audio' : 
                        upsert.message?.documentMessage ? 'document' : 'sticker';

          file_mimetype = msgObj.mimetype;
          file_name = (msgObj as any).fileName || (msgObj as any).filename || '';
          
          if (!file_name) {
            const ext = file_mimetype ? file_mimetype.split('/')[1]?.split(';')[0] || '' : '';
            file_name = `whatsapp_media_${Date.now()}.${ext || 'bin'}`;
          }

          console.log(`[WhatsApp] Baixando arquivo do WhatsApp do tipo: ${mType}, mimetype: ${file_mimetype}`);
          const stream = await downloadContentFromMessage(msgObj, mType as any);
          let buffer = Buffer.from([]);
          for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
          }

          const fileId = "file_wa_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
          const safeName = `${fileId}_${file_name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
          const uploadDir = path.resolve('uploads');
          if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
          }
          fs.writeFileSync(path.join(uploadDir, safeName), buffer);
          file_url = `/uploads/${safeName}`;
          console.log(`[WhatsApp] Arquivo baixado com sucesso e salvo em ${file_url}`);
        }
      } catch (err) {
        console.error("[WhatsApp] Erro ao baixar arquivo da mensagem recebida:", err);
      }
    }

    console.log(`[WhatsApp] Processando mensagem. Remetente: ${senderType}, Telefone: ${cleanPhone}: "${finalMessageText.substring(0, 50)}..."`);

    try {
      await dbStore.addAuditLog({
        id: "wa_sys_" + Date.now() + "_" + Math.floor(Math.random() * 100),
        user_name: fromMe ? "Operador (Celular)" : "Cliente",
        user_email: "whatsapp-engine@guarato.com.br",
        action: fromMe ? "MENSAGEM_ENVIADA_WA" : "MENSAGEM_RECEBIDA_WA",
        target: fromMe 
          ? `Enviado do celular para ${upsert.pushName || cleanPhone}: "${finalMessageText.substring(0, 60)}"`
          : `Recebido de ${upsert.pushName || cleanPhone}: "${finalMessageText.substring(0, 60)}"`,
        timestamp: new Date().toISOString()
      });
    } catch (e) {}

    const conversations = await dbStore.getConversations();
    const sorted = [...conversations].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // Busca conversa por dígitos finais
    let conv = sorted.find(c => {
      const dbDigits = (c.customer_phone || "").split('@')[0].replace(/\D/g, '');
      if (!dbDigits || !cleanPhone) return false;
      if (dbDigits.length >= 8 && cleanPhone.length >= 8) {
        return dbDigits.slice(-8) === cleanPhone.slice(-8);
      }
      return dbDigits === cleanPhone;
    });

    if (!conv) {
      if (!fromMe) this.pendingCreations.add(cleanPhone);
      try {
        console.log(`[WhatsApp] Criando nova conversa para ${phone}`);
        const pushName = upsert.pushName || 'Novo Cliente';

        conv = {
          id: "chat_wa_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
          customer_name: pushName,
          customer_phone: phone,
          sector_id: null,
          attendant_id: null,
          status: 'chatbot' as const,
          started_at: new Date().toISOString(),
          last_message: finalMessageText,
          tags: [],
          created_at: new Date().toISOString()
        };
        await dbStore.saveConversation(conv);
        this.notify('conversation_updated', conv);
      } finally {
        if (!fromMe) this.pendingCreations.delete(cleanPhone);
      }
    } else {
      console.log(`[WhatsApp] Mensagem vinculada ao chat existente: ${conv.id}`);
      if (conv.status === 'closed' && senderType === 'customer') {
        conv.status = 'chatbot';
        conv.sector_id = null;
      }
      
      const pushName = upsert.pushName;
      if (pushName && conv.customer_name !== pushName) {
         conv.customer_name = pushName;
      }

      if (conv.customer_phone !== phone) {
        conv.customer_phone = phone;
      }
      conv.last_message = finalMessageText;
      await dbStore.saveConversation(conv);
      this.notify('conversation_updated', conv);
    }

    if (conv) {
      // Evita duplicatas de mensagens enviadas simultaneamente via Web UI
      if (fromMe) {
        const messages = await dbStore.getMessagesForConversation(conv.id);
        const lastFewSeconds = Date.now() - 3000;
        const isDuplicate = messages.some(m => 
          m.message === finalMessageText && 
          new Date(m.created_at).getTime() > lastFewSeconds &&
          m.sender_type !== 'customer'
        );

        if (isDuplicate) {
          console.log('[WhatsApp] Ignorando duplicata de mensagem enviada via Painel Web');
          return;
        }
      }

      const newMsg: Message = {
        id: "msg_wa_" + Date.now() + "_" + Math.floor(Math.random() * 100),
        conversation_id: conv.id,
        sender_type: senderType,
        message: finalMessageText,
        created_at: new Date().toISOString(),
        file_url,
        file_name,
        mimetype: file_mimetype
      };

      await dbStore.saveMessage(newMsg);
      this.notify('message_created', newMsg);
      console.log(`[WhatsApp] Mensagem de ${senderType} salva no histórico do chat ${conv.id}`);

      if (senderType === 'customer' && conv.status === 'chatbot') {
        try {
          const botReply = await handleIncomingMessageForChatbot(conv, finalMessageText);
          if (botReply) {
            // SALVAR IMEDIATAMENTE no banco para evitar condições de corrida em mensagens rápidas subsequentes
            await dbStore.saveMessage(botReply);
            this.notify('message_created', botReply);

            if (this.socket) {
              try { await this.socket.sendPresenceUpdate('composing', phone); } catch (e) {}
            }

            // Aguarda o tempo de "digitação" antes de enviar para o WhatsApp real
            await new Promise(resolve => setTimeout(resolve, 3000));

            if (this.socket) {
              try { await this.socket.sendPresenceUpdate('paused', phone); } catch (e) {}
            }

            await this.sendWhatsAppMessage(phone, botReply.message);
            
            const freshConv = await dbStore.getConversationById(conv.id);
            if (freshConv) this.notify('conversation_updated', freshConv);
          }
        } catch (botErr) {
          console.error(`[WhatsApp] Erro no chatbot para ${conv.id}:`, botErr);
        }
      }
    }

  }

  async sendWhatsAppMessage(phone: string, text: string): Promise<boolean> {
    if (!this.socket || this.status !== 'CONNECTED') {
      console.error(`[WhatsApp] Cannot send WA message: Status=${this.status}, Socket=${!!this.socket}`);
      return false;
    }

    try {
      // Ensure we have a valid JID format for private chat
      let jid = phone;
      if (!jid.includes('@')) {
        const cleanPhone = phone.replace(/\D/g, '');
        jid = `${cleanPhone}@s.whatsapp.net`;
      }
      
      console.log(`[WhatsApp] Sending message to ${jid}: "${text.substring(0, 30)}..."`);
      
      const result = await this.socket.sendMessage(jid, { text });
      console.log(`[WhatsApp] Message dispatched successfully to WA server. ID: ${result?.key?.id}`);

      // Se for uma cobrança PIX, envia a chave ou o código EMV Copia e Cola em uma mensagem separada para facilitar a cópia (Tap to Copy) no smartphone
      if (text.includes('💸 LS GUARATO - COBRANÇA PIX 💸')) {
        // Tenta encontrar primeiro o código EMV completo (Pix Copia e Cola com valor já embutido)
        // Usamos uma regex robusta que inclui letras de A-Z/a-z, dígitos, pontos, hífens, asteriscos e espaços
        const emvMatch = text.match(/(000201[A-Za-z0-9\.\-* ]+6304[A-Fa-f0-9]{4})/);
        let contentToCopy = '';

        if (emvMatch && emvMatch[1]) {
          contentToCopy = emvMatch[1].trim();
          console.log(`[WhatsApp] PIX com valor detectado (EMV). Enviando código Copia e Cola: ${contentToCopy}`);
        } else {
          const pixKeyMatch = text.match(/(?:Chave PIX:|🔑 Chave PIX:)\s*([^\n]+)/i);
          if (pixKeyMatch && pixKeyMatch[1]) {
            contentToCopy = pixKeyMatch[1].trim();
            console.log(`[WhatsApp] PIX sem EMV detectado. Enviando chave isolada: ${contentToCopy}`);
          }
        }

        if (contentToCopy) {
          await new Promise(resolve => setTimeout(resolve, 1500)); // Pequeno delay
          
          // Envia o conteúdo isolado (código Copia e Cola ou chave PIX) para que o cliente possa tocar e copiar direto no WhatsApp mobile
          // Nenhuma outra mensagem é enviada depois dele para que fique 100% isolado de tudo e limpo para cópia imediata!
          await this.socket.sendMessage(jid, { text: contentToCopy });
        }
      }

      return true;
    } catch (err) {
      console.error("[WhatsApp] Error in sendWhatsAppMessage:", err);
      return false;
    }
  }

  async sendWhatsAppMedia(phone: string, mediaBuffer: Buffer, type: 'image' | 'video' | 'document' | 'audio', caption?: string, fileName?: string): Promise<boolean> {
    if (!this.socket || this.status !== 'CONNECTED') return false;
    try {
      let jid = phone;
      if (!jid.includes('@')) {
        const cleanPhone = phone.replace(/\D/g, '');
        jid = `${cleanPhone}@s.whatsapp.net`;
      }

      console.log(`[WhatsApp] Sending ${type} to ${jid}...`);
      
      const payload: any = {};
      if (type === 'image') payload.image = mediaBuffer;
      else if (type === 'video') payload.video = mediaBuffer;
      else if (type === 'audio') payload.audio = mediaBuffer;
      else if (type === 'document') {
        payload.document = mediaBuffer;
        payload.mimetype = 'application/pdf'; // Default to PDF for billing
        payload.fileName = fileName || 'documento.pdf';
      }

      if (caption) payload.caption = caption;

      const result = await this.socket.sendMessage(jid, payload);
      console.log(`[WhatsApp] Media dispatched successfully to WA server. ID: ${result?.key?.id}`);
      return true;
    } catch (err) {
      console.error("[WhatsApp] Error in sendWhatsAppMedia:", err);
      return false;
    }
  }

  async sendPresenceUpdate(phone: string, presence: 'composing' | 'paused' | 'recording') {
    if (!this.socket || this.status !== 'CONNECTED') return;
    try {
      let jid = phone;
      if (!jid.includes('@')) {
        const cleanPhone = phone.replace(/\D/g, '');
        jid = `${cleanPhone}@s.whatsapp.net`;
      }
      await this.socket.sendPresenceUpdate(presence, jid);
    } catch (err) {
      console.error("[WhatsApp] Error in sendPresenceUpdate:", err);
    }
  }
}

export const whatsappService = new WhatsappService();
