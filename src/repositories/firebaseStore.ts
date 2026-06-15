import { getApps, initializeApp, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';
import { User, Sector, Conversation, Message, QueueItem, Settings, AuditLog } from '../types/index.js';

// Lazy Config Loader
let _config: any = null;
function getConfig() {
  if (!_config) {
    const configPath = path.resolve('firebase-applet-config.json');
    if (!fs.existsSync(configPath)) {
      console.warn("[Firebase] Config file not found at " + configPath + ". Using placeholder.");
      return { projectId: process.env.FIREBASE_PROJECT_ID || 'managed', firestoreDatabaseId: 'managed' };
    }
    _config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  }
  return _config;
}

// Initialize Firebase Admin lazily
let _app: App | null = null;
function ensureFirebaseInit(): App {
  const apps = getApps();
  if (apps.length === 0) {
    const config = getConfig();
    const projectId = config.projectId || process.env.GOOGLE_CLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID;
    
    // Force environment variables to match the config project
    if (projectId) {
      process.env.GOOGLE_CLOUD_PROJECT = projectId;
      process.env.FIREBASE_PROJECT_ID = projectId;
    }
    
    console.log(`[Firebase] Initializing Admin SDK. Project: ${projectId}`);
    try {
      // In AI Studio Build, the service account is pre-configured.
      // Basic initialization often works best.
      _app = initializeApp({
        projectId: projectId
      });
      console.log("[Firebase] Admin SDK initialized successfully.");
    } catch (err: any) {
      console.error("[Firebase] Error during initializeApp:", err.message);
      // Fallback try with applicationDefault
      try {
        console.log("[Firebase] Retrying with applicationDefault credential...");
        _app = initializeApp({
          credential: (admin as any).credential.applicationDefault(),
          projectId: projectId
        });
        console.log("[Firebase] Admin SDK initialized with applicationDefault.");
      } catch (err2: any) {
        // Final fallback: check if it was initialized synchronously by another call
        const checkApps = getApps();
        if (checkApps.length > 0) {
          _app = checkApps[0];
        } else {
          throw new Error(`Falha crítica na inicialização do Firebase: ${err2.message}`);
        }
      }
    }
  } else {
    _app = apps[0];
  }
  return _app!;
}

// Lazy Firestore instance getter
let _db: Firestore | null = null;
function getDb(): Firestore {
  const app = ensureFirebaseInit();
  if (!_db) {
    const config = getConfig();
    // Some environments use a named database ID
    const dbId = config.firestoreDatabaseId === 'managed' || !config.firestoreDatabaseId ? undefined : config.firestoreDatabaseId;
    
    console.log(`[Firebase] Resolving Firestore instance (DB ID: ${dbId || '(default)'})...`);
    try {
      _db = getFirestore(app, dbId);
      console.log(`[Firebase] Firestore instance resolved for DB: ${dbId || '(default)'}`);
    } catch (err: any) {
      console.error(`[Firebase] Error resolving Firestore (${dbId}):`, err.message);
      console.log("[Firebase] Falling back to default database instance.");
      _db = getFirestore(app);
    }
  }
  return _db!;
}

export class FirebaseStore {
  async getUsers(): Promise<User[]> {
    const snapshot = await getDb().collection('users').get();
    return snapshot.docs.map((doc: any) => doc.data() as User);
  }

  async saveUser(user: User): Promise<void> {
    await getDb().collection('users').doc(user.id).set(user, { merge: true });
  }

  async deleteUser(id: string): Promise<void> {
    await getDb().collection('users').doc(id).delete();
  }

  async getSectors(): Promise<Sector[]> {
    const snapshot = await getDb().collection('sectors').get();
    return snapshot.docs.map((doc: any) => doc.data() as Sector);
  }

  async saveSector(sec: Sector): Promise<void> {
    await getDb().collection('sectors').doc(sec.id).set(sec, { merge: true });
  }

  async deleteSector(id: string): Promise<void> {
    await getDb().collection('sectors').doc(id).delete();
  }

  async getConversations(): Promise<Conversation[]> {
    const snapshot = await getDb().collection('conversations').get();
    return snapshot.docs.map((doc: any) => doc.data() as Conversation);
  }

  async getConversationById(id: string): Promise<Conversation | undefined> {
    const doc = await getDb().collection('conversations').doc(id).get();
    return doc.exists ? (doc.data() as Conversation) : undefined;
  }

  async saveConversation(conv: Conversation): Promise<void> {
    await getDb().collection('conversations').doc(conv.id).set(conv, { merge: true });
  }

  async deleteConversation(id: string): Promise<void> {
    const db = getDb();
    const batch = db.batch();
    
    // Delete conversation
    batch.delete(db.collection('conversations').doc(id));
    
    // Also delete related messages and queue items
    const messages = await db.collection('messages').where('conversation_id', '==', id).get();
    messages.forEach((m: any) => batch.delete(m.ref));
    
    const queue = await db.collection('queue').where('conversation_id', '==', id).get();
    queue.forEach((q: any) => batch.delete(q.ref));
    
    await batch.commit();
  }

  async clearAllConversations(): Promise<void> {
    const db = getDb();
    // This is expensive in Firestore, but okay for dev/small datasets
    const collections = ['conversations', 'messages', 'queue'];
    for (const colName of collections) {
      const snapshot = await db.collection(colName).get();
      const batch = db.batch();
      snapshot.docs.forEach((doc: any) => batch.delete(doc.ref));
      await batch.commit();
    }
  }

  async getMessagesForConversation(convId: string): Promise<Message[]> {
    const snapshot = await getDb().collection('messages')
      .where('conversation_id', '==', convId)
      .get();
    const msgs = snapshot.docs.map((doc: any) => doc.data() as Message);
    return msgs.sort((a: Message, b: Message) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }

  async saveMessage(msg: Message): Promise<void> {
    await getDb().collection('messages').doc(msg.id).set(msg);
  }

  async getQueue(): Promise<QueueItem[]> {
    const snapshot = await getDb().collection('queue').get();
    const items = snapshot.docs.map((doc: any) => doc.data() as QueueItem);
    return items.sort((a: QueueItem, b: QueueItem) => (a.position || 0) - (b.position || 0));
  }

  async addToQueue(convId: string, sectorId: string | null): Promise<void> {
    const db = getDb();
    const snapshot = await db.collection('queue').where('conversation_id', '==', convId).get();
    if (snapshot.empty) {
      const allQueue = await db.collection('queue').get();
      const position = allQueue.size + 1;
      const id = "q_" + Math.random().toString(36).substring(2, 9);
      await db.collection('queue').doc(id).set({
        id,
        conversation_id: convId,
        sector_id: sectorId,
        position,
        created_at: new Date().toISOString()
      });
    }
  }

  async removeFromQueue(convId: string): Promise<void> {
    const db = getDb();
    const snapshot = await db.collection('queue').where('conversation_id', '==', convId).get();
    if (!snapshot.empty) {
      const batch = db.batch();
      snapshot.docs.forEach((doc: any) => batch.delete(doc.ref));
      await batch.commit();
      
      // Recalculate positions
      const remaining = await db.collection('queue').orderBy('position', 'asc').get();
      const posBatch = db.batch();
      remaining.docs.forEach((doc: any, idx: number) => {
        posBatch.update(doc.ref, { position: idx + 1 });
      });
      await posBatch.commit();
    }
  }

  async getSettings(): Promise<Settings | null> {
    const doc = await getDb().collection('settings').doc('global').get();
    return doc.exists ? (doc.data() as Settings) : null;
  }

  async updateSettings(settings: Settings): Promise<void> {
    await getDb().collection('settings').doc('global').set(settings, { merge: true });
  }

  async getAuditLogs(): Promise<AuditLog[]> {
    const snapshot = await getDb().collection('audit_logs')
      .limit(500)
      .get();
    const logs = snapshot.docs.map((doc: any) => doc.data() as AuditLog);
    return logs.sort((a: AuditLog, b: AuditLog) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  async addAuditLog(log: AuditLog): Promise<void> {
    await getDb().collection('audit_logs').doc(log.id).set(log);
  }
}

export const firebaseStore = new FirebaseStore();

