import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  getDocs, 
  getDoc, 
  setDoc, 
  deleteDoc, 
  doc, 
  query, 
  where, 
  writeBatch,
  updateDoc
} from 'firebase/firestore';
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

// Initialize JS SDK Client
let _app: any = null;
function ensureFirebaseInit() {
  const apps = getApps();
  if (apps.length === 0) {
    const config = getConfig();
    const firebaseConfig = {
      apiKey: config.apiKey,
      authDomain: config.authDomain,
      projectId: config.projectId,
      storageBucket: config.storageBucket,
      messagingSenderId: config.messagingSenderId,
      appId: config.appId,
    };
    console.log(`[Firebase] Initializing universal JS Client SDK. Project: ${config.projectId}`);
    _app = initializeApp(firebaseConfig);
  } else {
    _app = apps[0];
  }
  return _app;
}

// Lazy Firestore instance getter
let _db: any = null;
function getDb() {
  const app = ensureFirebaseInit();
  if (!_db) {
    const config = getConfig();
    const dbId = config.firestoreDatabaseId === 'managed' || !config.firestoreDatabaseId ? undefined : config.firestoreDatabaseId;
    console.log(`[Firebase] Resolving Firestore instance via JS Client SDK (DB ID: ${dbId || '(default)'})...`);
    _db = getFirestore(app, dbId);
  }
  return _db;
}

export class FirebaseStore {
  async getUsers(): Promise<User[]> {
    const db = getDb();
    const snapshot = await getDocs(collection(db, 'users'));
    return snapshot.docs.map((doc: any) => doc.data() as User);
  }

  async saveUser(user: User): Promise<void> {
    const db = getDb();
    await setDoc(doc(db, 'users', user.id), user, { merge: true });
  }

  async deleteUser(id: string): Promise<void> {
    const db = getDb();
    await deleteDoc(doc(db, 'users', id));
  }

  async getSectors(): Promise<Sector[]> {
    const db = getDb();
    const snapshot = await getDocs(collection(db, 'sectors'));
    return snapshot.docs.map((doc: any) => doc.data() as Sector);
  }

  async saveSector(sec: Sector): Promise<void> {
    const db = getDb();
    await setDoc(doc(db, 'sectors', sec.id), sec, { merge: true });
  }

  async deleteSector(id: string): Promise<void> {
    const db = getDb();
    await deleteDoc(doc(db, 'sectors', id));
  }

  async getConversations(): Promise<Conversation[]> {
    const db = getDb();
    const snapshot = await getDocs(collection(db, 'conversations'));
    return snapshot.docs.map((doc: any) => doc.data() as Conversation);
  }

  async getConversationById(id: string): Promise<Conversation | undefined> {
    const db = getDb();
    const docSnap = await getDoc(doc(db, 'conversations', id));
    return docSnap.exists() ? (docSnap.data() as Conversation) : undefined;
  }

  async saveConversation(conv: Conversation): Promise<void> {
    const db = getDb();
    await setDoc(doc(db, 'conversations', conv.id), conv, { merge: true });
  }

  async deleteConversation(id: string): Promise<void> {
    const db = getDb();
    const batch = writeBatch(db);
    
    // Delete conversation
    batch.delete(doc(db, 'conversations', id));
    
    // Also delete related messages and queue items
    const messagesQuery = query(collection(db, 'messages'), where('conversation_id', '==', id));
    const messages = await getDocs(messagesQuery);
    messages.forEach((m) => batch.delete(m.ref));
    
    const queueQuery = query(collection(db, 'queue'), where('conversation_id', '==', id));
    const queue = await getDocs(queueQuery);
    queue.forEach((q) => batch.delete(q.ref));
    
    await batch.commit();
  }

  async clearAllConversations(): Promise<void> {
    const db = getDb();
    const collections = ['conversations', 'messages', 'queue'];
    for (const colName of collections) {
      const snapshot = await getDocs(collection(db, colName));
      const batch = writeBatch(db);
      snapshot.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }
  }

  async getMessagesForConversation(convId: string): Promise<Message[]> {
    const db = getDb();
    const q = query(collection(db, 'messages'), where('conversation_id', '==', convId));
    const snapshot = await getDocs(q);
    const msgs = snapshot.docs.map((doc: any) => doc.data() as Message);
    return msgs.sort((a: Message, b: Message) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }

  async saveMessage(msg: Message): Promise<void> {
    const db = getDb();
    await setDoc(doc(db, 'messages', msg.id), msg);
  }

  async getQueue(): Promise<QueueItem[]> {
    const db = getDb();
    const snapshot = await getDocs(collection(db, 'queue'));
    const items = snapshot.docs.map((doc: any) => doc.data() as QueueItem);
    return items.sort((a: QueueItem, b: QueueItem) => (a.position || 0) - (b.position || 0));
  }

  async addToQueue(convId: string, sectorId: string | null): Promise<void> {
    const db = getDb();
    const q = query(collection(db, 'queue'), where('conversation_id', '==', convId));
    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      const allQueue = await getDocs(collection(db, 'queue'));
      const position = allQueue.size + 1;
      const id = "q_" + Math.random().toString(36).substring(2, 9);
      await setDoc(doc(db, 'queue', id), {
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
    const q = query(collection(db, 'queue'), where('conversation_id', '==', convId));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      const batch = writeBatch(db);
      snapshot.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
      
      // Recalculate positions
      const remainingSnap = await getDocs(collection(db, 'queue'));
      const remaining = remainingSnap.docs.map(doc => doc.data() as QueueItem);
      remaining.sort((a, b) => (a.position || 0) - (b.position || 0));
      
      const posBatch = writeBatch(db);
      remaining.forEach((item, idx) => {
        posBatch.update(doc(db, 'queue', item.id), { position: idx + 1 });
      });
      await posBatch.commit();
    }
  }

  async getSettings(): Promise<Settings | null> {
    const db = getDb();
    const docSnap = await getDoc(doc(db, 'settings', 'global'));
    return docSnap.exists() ? (docSnap.data() as Settings) : null;
  }

  async updateSettings(settings: Settings): Promise<void> {
    const db = getDb();
    await setDoc(doc(db, 'settings', 'global'), settings, { merge: true });
  }

  async getAuditLogs(): Promise<AuditLog[]> {
    const db = getDb();
    const snapshot = await getDocs(collection(db, 'audit_logs'));
    const logs = snapshot.docs.map((doc: any) => doc.data() as AuditLog);
    return logs.sort((a: AuditLog, b: AuditLog) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 500);
  }

  async addAuditLog(log: AuditLog): Promise<void> {
    const db = getDb();
    await setDoc(doc(db, 'audit_logs', log.id), log);
  }
}

export const firebaseStore = new FirebaseStore();
