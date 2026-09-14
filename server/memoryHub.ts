import { dbService } from './db.js';

export interface KnowledgeItem {
  id: string;
  category: string; // e.g., 'SMC', 'Price Action', 'Psychology', 'Risk Management'
  concept: string;
  description: string;
  actionableRule: string;
  source: string;
  timestamp: number;
}

export class MemoryHub {
  private knowledgeBase: KnowledgeItem[] = [];

  constructor() {
    this.init();
  }

  public async init() {
    try {
      this.knowledgeBase = await dbService.getAllKnowledge();
    } catch (error) {
      console.error("Error reading memory hub from DB:", error);
      this.knowledgeBase = [];
    }
  }

  public async addKnowledge(items: Omit<KnowledgeItem, 'id' | 'timestamp'>[]): Promise<KnowledgeItem[]> {
    const CHUNK_SIZE = 800000;
    const newItems: KnowledgeItem[] = [];

    for (const item of items) {
      if (item.actionableRule && item.actionableRule.length > CHUNK_SIZE) {
        // Chunking para grandes arquivos
        let part = 1;
        for (let i = 0; i < item.actionableRule.length; i += CHUNK_SIZE) {
          const chunk = item.actionableRule.substring(i, i + CHUNK_SIZE);
          newItems.push({
            ...item,
            concept: `${item.concept} (Parte ${part++})`,
            actionableRule: chunk,
            id: Math.random().toString(36).substring(2, 15),
            timestamp: Date.now()
          });
        }
      } else {
        newItems.push({
          ...item,
          id: Math.random().toString(36).substring(2, 15),
          timestamp: Date.now()
        });
      }
    }
    
    this.knowledgeBase.push(...newItems);
    
    // Save to DB
    for (const item of newItems) {
      await dbService.saveKnowledge(item);
    }
    
    return newItems;
  }

  public getAllKnowledge(): KnowledgeItem[] {
    return this.knowledgeBase;
  }

  public getCollectiveMemoryString(): string {
    if (this.knowledgeBase.length === 0) {
      return "Nenhum conhecimento prévio armazenado. Use o conhecimento geral de mercado.";
    }
    return this.knowledgeBase
      .map(k => `[${k.category}] ${k.concept}: ${k.actionableRule}`)
      .join('\n');
  }

  public async clearMemory() {
    this.knowledgeBase = [];
    await dbService.clearKnowledge();
  }

  public async deleteKnowledge(id: string) {
    this.knowledgeBase = this.knowledgeBase.filter(item => item.id !== id);
    await dbService.deleteKnowledge(id);
  }
}

export const memoryHub = new MemoryHub();
