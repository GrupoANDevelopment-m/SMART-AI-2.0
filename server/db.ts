import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { adminDb } from './firebaseAdmin.js';
import { collection, doc, setDoc, getDocs, deleteDoc, writeBatch } from 'firebase/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbDir = path.join(process.cwd(), '.data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'database.json');

interface Database {
  settings: Record<string, string>;
  battle_plans: any[];
  positions: any[];
  knowledge: any[];
}

let db: Database = {
  settings: {},
  battle_plans: [],
  positions: [],
  knowledge: []
};

export const initDb = async () => {
  if (fs.existsSync(dbPath)) {
    try {
      const data = fs.readFileSync(dbPath, 'utf-8');
      db = JSON.parse(data);
      
      // Ensure all tables exist
      if (!db.settings) db.settings = {};
      if (!db.battle_plans) db.battle_plans = [];
      if (!db.positions) db.positions = [];
      if (!db.knowledge) db.knowledge = [];
    } catch (error) {
      console.error("Error reading database.json:", error);
    }
  } else {
    saveDb();
  }

  // Restaurar memórias silenciosamente do Firebase caso a máquina tenha sido reiniciada
  if (adminDb && db.knowledge.length === 0) {
    try {
      const colRef = collection(adminDb, 'app_data/main_db/collective_memory');
      const snapshot = await getDocs(colRef);
      if (!snapshot.empty) {
        db.knowledge = snapshot.docs.map(doc => doc.data() as any);
        saveDb();
        console.log(`Restaurou silenciosamente ${db.knowledge.length} memórias da nuvem (Firebase).`);
      }
    } catch(err) {
      console.error("Falha ao restaurar memórias do Firebase:", err);
    }
  }
};

const saveDb = () => {
  try {
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
  } catch (error) {
    console.error("Error saving database.json:", error);
  }
};

export const dbService = {
  // Settings
  getSetting: async (key: string): Promise<string | null> => {
    return db.settings[key] || null;
  },
  setSetting: async (key: string, value: string): Promise<void> => {
    db.settings[key] = value;
    saveDb();
  },

  // Battle Plans
  saveBattlePlan: async (plan: any): Promise<void> => {
    const index = db.battle_plans.findIndex(p => p.id === plan.id);
    if (index >= 0) {
      db.battle_plans[index] = plan;
    } else {
      db.battle_plans.push(plan);
    }
    saveDb();
  },
  getBattlePlans: async (): Promise<any[]> => {
    return db.battle_plans.filter(p => p.status === "ACTIVE" || p.status === "TRIGGERED");
  },
  updateBattlePlanStatus: async (id: string, status: string): Promise<void> => {
    const plan = db.battle_plans.find(p => p.id === id);
    if (plan) {
      plan.status = status;
      saveDb();
    }
  },

  // Positions
  savePosition: async (pos: any): Promise<void> => {
    const index = db.positions.findIndex(p => p.id === pos.id);
    if (index >= 0) {
      db.positions[index] = { ...pos, pnl: pos.pnl || 0 };
    } else {
      db.positions.push({ ...pos, pnl: pos.pnl || 0 });
    }
    saveDb();
  },
  getActivePositions: async (): Promise<any[]> => {
    return db.positions.filter(p => p.status === "OPEN");
  },
  updatePosition: async (id: string, updates: any): Promise<void> => {
    const index = db.positions.findIndex(p => p.id === id);
    if (index >= 0) {
      db.positions[index] = { ...db.positions[index], ...updates };
      saveDb();
    }
  },

  // Knowledge Base
  saveKnowledge: async (item: any): Promise<void> => {
    const index = db.knowledge.findIndex(k => k.id === item.id);
    if (index >= 0) {
      db.knowledge[index] = item;
    } else {
      db.knowledge.push(item);
    }
    saveDb();

    // Sincronizar com Firebase
    if (adminDb) {
      try {
        const docRef = doc(adminDb, `app_data/main_db/collective_memory/${item.id}`);
        await setDoc(docRef, item);
      } catch (error) {
        console.error("Failed to sync knowledge to Firebase:", error);
      }
    }
  },
  getAllKnowledge: async (): Promise<any[]> => {
    return [...db.knowledge].sort((a, b) => b.timestamp - a.timestamp);
  },
  deleteKnowledge: async (id: string): Promise<void> => {
    db.knowledge = db.knowledge.filter(k => k.id !== id);
    saveDb();

    if (adminDb) {
      try {
        const docRef = doc(adminDb, `app_data/main_db/collective_memory/${id}`);
        await deleteDoc(docRef);
      } catch (err) {
        console.error("Failed to delete knowledge from Firebase:", err);
      }
    }
  },
  clearKnowledge: async (): Promise<void> => {
    db.knowledge = [];
    saveDb();

    if (adminDb) {
      try {
        const colRef = collection(adminDb, 'app_data/main_db/collective_memory');
        const snapshot = await getDocs(colRef);
        
        let batch = writeBatch(adminDb);
        let count = 0;
        
        for (const document of snapshot.docs) {
          batch.delete(document.ref);
          count++;
          
          if (count === 500) {
            await batch.commit();
            batch = writeBatch(adminDb);
            count = 0;
          }
        }
        
        if (count > 0) {
          await batch.commit();
        }
      } catch (err) {
        console.error("Failed to clear Firebase collective_memory:", err);
      }
    }
  }
};

