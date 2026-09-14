import { db, auth, handleFirestoreError, OperationType } from "../firebase";
import { collection, addDoc, query, where, getDocs, updateDoc, doc, limit, orderBy } from "firebase/firestore";
import { TacticalBuffer, AgentMemory } from "../types";

export interface SetupMemory {
  asset: string;
  type: 'BUY' | 'SELL';
  confidence: number;
  smcContext: any;
  elliottWave: string;
  outcome: 'PENDING' | 'SUCCESS' | 'FAILURE';
  timestamp: string;
  uid: string;
}

export class MemoryService {
  private setupsCol = collection(db, "setups");
  private knowledgeCol = collection(db, "knowledge");
  private stateCol = collection(db, "state");
  private memoryCol = collection(db, "agent_memory");
  private skillsCol = collection(db, "skills");
  private strategiesCol = collection(db, "strategies");
  private episodicCol = collection(db, "episodic_memory");
  private semanticCol = collection(db, "semantic_memory");

  private tacticalBuffer: TacticalBuffer = {
    sessionVolatility: 0,
    recentWinRate: 0,
    currentSession: 'OFF',
    immediateBias: 'NEUTRAL'
  };

  async getFullMemory(): Promise<AgentMemory> {
    const defaultMemory: AgentMemory = {
      strategic: { macroBias: 'NEUTRAL', marketRegime: 'RANGING', lastUpdated: new Date().toISOString(), globalContext: '' },
      tactical: this.tacticalBuffer,
      experience: { successPatterns: [], failurePatterns: [], lessonsLearned: [] },
      theoretical: { concepts: [], rules: [], lastKnowledgeUpdate: new Date().toISOString() },
      alignment: { userInstructions: [], preferredStyle: 'CONSERVATIVE', riskAppetite: 'MEDIUM' },
      simulation: { backtestResults: [] }
    };

    if (!auth.currentUser) return defaultMemory;

    try {
      const q = query(this.memoryCol, where("uid", "==", auth.currentUser.uid));
      const snap = await getDocs(q);
      
      if (snap.empty) return defaultMemory;

      const data = snap.docs[0].data() as any;
      return {
        ...defaultMemory,
        strategic: data.strategic || defaultMemory.strategic,
        tactical: this.tacticalBuffer, // Tactical is always runtime/volatile
        experience: data.experience || defaultMemory.experience,
        theoretical: data.theoretical || defaultMemory.theoretical,
        alignment: data.alignment || defaultMemory.alignment,
        simulation: data.simulation || defaultMemory.simulation
      };
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'agent_memory');
      return defaultMemory;
    }
  }

  async updateMemoryLayer(layer: keyof AgentMemory, data: any) {
    if (!auth.currentUser) return;
    
    if (layer === 'tactical') {
      this.tacticalBuffer = { ...this.tacticalBuffer, ...data };
      return;
    }

    try {
      const docRef = doc(this.memoryCol, auth.currentUser.uid);
      const { setDoc } = await import("firebase/firestore");
      await setDoc(docRef, { [layer]: data, uid: auth.currentUser.uid }, { merge: true });
    } catch(error) {
      handleFirestoreError(error, OperationType.WRITE, 'agent_memory');
    }
  }

  async saveSetup(setup: any) {
    if (!auth.currentUser) return;
    try {
      await addDoc(this.setupsCol, {
        ...setup,
        uid: auth.currentUser.uid,
        timestamp: new Date().toISOString()
      });

      // Update Experience Memory automatically
      const memory = await this.getFullMemory();
      const experience = memory.experience;
      
      if (setup.outcome === 'SUCCESS') {
        experience.successPatterns.push(setup.reasoning);
      } else if (setup.outcome === 'FAILURE') {
        experience.failurePatterns.push(setup.reasoning);
      }
      
      // Keep only last 50 patterns
      experience.successPatterns = experience.successPatterns.slice(-50);
      experience.failurePatterns = experience.failurePatterns.slice(-50);

      await this.updateMemoryLayer('experience', experience);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'setups');
    }
  }

  async saveEpisodicMemory(memoryData: any) {
    if (!auth.currentUser) return;
    try {
      await addDoc(this.episodicCol, {
        ...memoryData,
        uid: auth.currentUser.uid,
        createdAt: new Date().toISOString()
      });
      console.log('Episodic memory consolidated:', memoryData);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'episodic_memory');
    }
  }

  async saveSemanticMemory(semanticData: any) {
    if (!auth.currentUser) return;
    try {
      await addDoc(this.semanticCol, {
        ...semanticData,
        uid: auth.currentUser.uid,
        createdAt: new Date().toISOString()
      });
      console.log('Semantic memory consolidated:', semanticData);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'semantic_memory');
    }
  }

  async searchInternet(queryText: string): Promise<string> {
    try {
      const response = await fetch("/api/ai/search-internet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: queryText })
      });
      if (!response.ok) throw new Error("Internet search failed");
      const data = await response.json();
      return data.result || "Nenhum resultado de internet encontrado.";
    } catch (error) {
      console.error("Erro na pesquisa de internet:", error);
      return "Sem acesso à internet no momento.";
    }
  }

  async trainTheoretical(content: string) {
    if (!auth.currentUser) return;
    const memory = await this.getFullMemory();
    const theoretical = memory.theoretical;
    
    // Simple extraction of rules and concepts (in a real app, this would use an LLM)
    const lines = content.split('\n');
    lines.forEach(line => {
      if (line.toLowerCase().includes('regra') || line.toLowerCase().includes('rule')) {
        theoretical.rules.push(line.trim());
      } else if (line.length > 20 && line.length < 200) {
        theoretical.concepts.push(line.trim());
      }
    });

    theoretical.rules = [...new Set(theoretical.rules)].slice(-100);
    theoretical.concepts = [...new Set(theoretical.concepts)].slice(-100);
    theoretical.lastKnowledgeUpdate = new Date().toISOString();

    await this.updateMemoryLayer('theoretical', theoretical);
  }

  async updateStrategicBias(bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL', regime: 'TRENDING' | 'RANGING' | 'VOLATILE', context: string) {
    await this.updateMemoryLayer('strategic', {
      macroBias: bias,
      marketRegime: regime,
      globalContext: context,
      lastUpdated: new Date().toISOString()
    });
  }

  async saveKnowledge(title: string, content: string) {
    if (!auth.currentUser) return;
    try {
      await addDoc(this.knowledgeCol, {
        title,
        content,
        uid: auth.currentUser.uid,
        timestamp: new Date().toISOString()
      });
    } catch(error) {
      handleFirestoreError(error, OperationType.CREATE, 'knowledge');
    }
  }

  async getKnowledge() {
    if (!auth.currentUser) return [];
    try {
      const q = query(this.knowledgeCol, where("uid", "==", auth.currentUser.uid));
      const snap = await getDocs(q);
      return snap.docs.map(d => d.data().content).join("\n\n");
    } catch(error) {
      handleFirestoreError(error, OperationType.GET, 'knowledge');
      return [];
    }
  }

  async getAgentState() {
    if (!auth.currentUser) return { mood: 'NEUTRAL', volatilityThreshold: 0.05, riskMultiplier: 1 };
    try {
      const snap = await getDocs(query(this.stateCol, where("__name__", "==", auth.currentUser.uid)));
      if (snap.empty) return { mood: 'NEUTRAL', volatilityThreshold: 0.05, riskMultiplier: 1 };
      return snap.docs[0].data();
    } catch(error) {
      handleFirestoreError(error, OperationType.GET, 'state');
      return { mood: 'NEUTRAL', volatilityThreshold: 0.05, riskMultiplier: 1 };
    }
  }

  async updateAgentState(state: any) {
    if (!auth.currentUser) return;
    try {
      const docRef = doc(this.stateCol, auth.currentUser.uid);
      // Use setDoc with merge for singleton state
      const { setDoc } = await import("firebase/firestore");
      await setDoc(docRef, { ...state, uid: auth.currentUser.uid }, { merge: true });
    } catch(error) {
      handleFirestoreError(error, OperationType.WRITE, 'state');
    }
  }

  async getSkills() {
    if (!auth.currentUser) return [];
    try {
      const q = query(this.skillsCol, where("uid", "==", auth.currentUser.uid), where("isActive", "==", true));
      const snap = await getDocs(q);
      return snap.docs.map(d => d.data());
    } catch(error) {
      handleFirestoreError(error, OperationType.GET, 'skills');
      return [];
    }
  }

  async getValidatedStrategies() {
    if (!auth.currentUser) return [];
    try {
      const q = query(
        this.strategiesCol, 
        where("uid", "==", auth.currentUser.uid),
        where("isValidated", "==", true),
        orderBy("successRate", "desc"),
        limit(5)
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as object) }));
    } catch(error) {
      handleFirestoreError(error, OperationType.GET, 'strategies');
      return [];
    }
  }

  async learnFromPast() {
    if (!auth.currentUser) return null;
    try {
      const q = query(
        this.setupsCol,
        where("uid", "==", auth.currentUser.uid),
        where("outcome", "in", ["SUCCESS", "FAILURE"]),
        orderBy("timestamp", "desc"),
        limit(20)
      );
      const snapshot = await getDocs(q);
      const history = snapshot.docs.map(doc => doc.data());
      
      // Simple learning logic: find patterns in successful trades
      const successes = history.filter(h => h.outcome === "SUCCESS");
      const failures = history.filter(h => h.outcome === "FAILURE");
      
      return {
        successCount: successes.length,
        failureCount: failures.length,
        winRate: history.length > 0 ? (successes.length / history.length) * 100 : 0,
        commonPatterns: this.extractPatterns(successes)
      };
    } catch(error) {
      handleFirestoreError(error, OperationType.GET, 'setups');
      return null;
    }
  }

  private extractPatterns(successes: any[]) {
    // Logic to extract common indicators/patterns from successful setups
    return successes.map(s => s.smcContext?.signal).filter(Boolean);
  }
}
