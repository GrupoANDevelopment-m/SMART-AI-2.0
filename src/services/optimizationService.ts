import { MemoryService } from "./memoryService";
import { db, auth, handleFirestoreError, OperationType } from "../firebase";
import { collection, addDoc, query, where, getDocs, limit, orderBy } from "firebase/firestore";

export class OptimizationService {
  private memory = new MemoryService();

  async runAutoOptimization() {
    if (!auth.currentUser) return;
    
    const wisdom = await this.memory.learnFromPast();
    if (!wisdom || (wisdom.successCount + wisdom.failureCount) < 5) return;

    const currentState = await this.memory.getAgentState();
    let newMood = currentState.mood;
    let newVolThreshold = currentState.volatilityThreshold;
    let newRiskMultiplier = currentState.riskMultiplier;

    // 1. Mood Logic (Discipline vs Confidence)
    const recentSetups = await this.getRecentOutcomes(5);
    const winStreak = recentSetups.filter(s => s === 'SUCCESS').length;
    const lossStreak = recentSetups.filter(s => s === 'FAILURE').length;

    if (lossStreak >= 3) {
      newMood = 'DISCIPLINED';
      newRiskMultiplier = 0.5; // Cut risk in half
      newVolThreshold = Math.max(newVolThreshold, 0.08); // Be more selective
    } else if (winStreak >= 3) {
      newMood = 'CONFIDENT';
      newRiskMultiplier = 1.2; // Increase risk slightly
    } else {
      newMood = 'NEUTRAL';
      newRiskMultiplier = 1.0;
    }

    // 2. Volatility Optimization
    // If win rate is low, increase volatility threshold to filter noise
    if (wisdom.winRate < 45) {
      newVolThreshold = Math.min(newVolThreshold + 0.01, 0.15);
    } else if (wisdom.winRate > 65) {
      newVolThreshold = Math.max(newVolThreshold - 0.005, 0.03);
    }

    await this.memory.updateAgentState({
      mood: newMood,
      volatilityThreshold: newVolThreshold,
      riskMultiplier: newRiskMultiplier,
      lastOptimization: new Date().toISOString()
    });

    // 3. Skill Generation
    if (wisdom.winRate < 40) {
      await this.generateSkill("Consolidation Shield", "Low Volatility + Sideways", "Block all entries");
    }
  }

  private async getRecentOutcomes(count: number): Promise<string[]> {
    if (!auth.currentUser) return [];
    try {
      const q = query(
        collection(db, "setups"),
        where("uid", "==", auth.currentUser.uid),
        where("outcome", "in", ["SUCCESS", "FAILURE"]),
        orderBy("timestamp", "desc"),
        limit(count)
      );
      const snap = await getDocs(q);
      return snap.docs.map(d => d.data().outcome);
    } catch(error) {
      handleFirestoreError(error, OperationType.GET, 'setups');
      return [];
    }
  }

  private async generateSkill(name: string, condition: string, action: string) {
    if (!auth.currentUser) return;
    try {
      const skillsCol = collection(db, "skills");
      const q = query(skillsCol, where("uid", "==", auth.currentUser.uid), where("name", "==", name));
      const snap = await getDocs(q);
      
      if (snap.empty) {
        await addDoc(skillsCol, {
          name,
          condition,
          action,
          successCount: 0,
          isActive: true,
          uid: auth.currentUser.uid,
          timestamp: new Date().toISOString()
        });
      }
    } catch(error) {
      handleFirestoreError(error, OperationType.WRITE, 'skills');
    }
  }
}
