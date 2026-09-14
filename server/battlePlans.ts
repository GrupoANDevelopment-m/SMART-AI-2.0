import fs from 'fs';
import path from 'path';

export interface BattlePlan {
  id: string;
  asset: string;
  createdAt: string;
  status: 'ACTIVE' | 'TRIGGERED' | 'COMPLETED' | 'INVALIDATED';
  alertZones: any[];
  strategy: any;
  counterStrategy: any;
  counterCounterStrategy: any;
  lastPriceChecked?: number;
  timeframe?: string;
  lastCheckedAt?: number;
  checkInterval?: number;
}

class BattlePlanStore {
  private filePath = path.join(process.cwd(), '.data', 'battle_plans.json');
  private plans: BattlePlan[] = [];

  constructor() {
    this.init();
  }

  private init() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (fs.existsSync(this.filePath)) {
      try {
        const data = fs.readFileSync(this.filePath, 'utf-8');
        this.plans = JSON.parse(data);
      } catch (error) {
        console.error("Error reading battle plans:", error);
        this.plans = [];
      }
    } else {
      this.save();
    }
  }

  private save() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.plans, null, 2));
    } catch (error) {
      console.error("Error saving battle plans:", error);
    }
  }

  public getPlans(): BattlePlan[] {
    return this.plans;
  }

  public savePlans(plans: BattlePlan[]) {
    this.plans = plans;
    this.save();
  }
}

export const battlePlanStore = new BattlePlanStore();
