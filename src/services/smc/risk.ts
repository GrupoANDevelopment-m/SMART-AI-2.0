export interface RiskParams {
  maxRiskPerTrade: number; // percentage, e.g., 0.01 for 1%
  accountBalance: number;
  minRR: number; // Risk/Reward ratio
  useAdaptiveLotSize?: boolean;
  dailyTargetPct?: number; // e.g., 0.20 for 20%
  maxDailyLossPct?: number; // e.g., 0.10 for 10%
}

export interface Position {
  size: number;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  riskAmount: number;
  rewardAmount: number;
}

export class RiskManager {
  calculatePosition(params: RiskParams, entry: number, stopLoss: number, takeProfit: number): Position | null {
    const riskPerUnit = Math.abs(entry - stopLoss);
    
    if (riskPerUnit === 0) return null;

    const rewardPerUnit = Math.abs(takeProfit - entry);
    const rr = rewardPerUnit / riskPerUnit;

    if (rr < params.minRR) return null;

    let riskAmount = params.accountBalance * params.maxRiskPerTrade;

    if (params.useAdaptiveLotSize && params.dailyTargetPct && params.maxDailyLossPct) {
      // Calculate required risk to hit daily target in this trade based on RR
      const targetProfitAmount = params.accountBalance * params.dailyTargetPct;
      const requiredRiskAmount = targetProfitAmount / rr;
      
      // Cap the risk at the maximum allowed daily loss
      const maxAllowedRisk = params.accountBalance * params.maxDailyLossPct;
      riskAmount = Math.min(requiredRiskAmount, maxAllowedRisk);
    }

    const size = riskAmount / riskPerUnit;
    const rewardAmount = size * rewardPerUnit;

    return {
      size,
      entry,
      stopLoss,
      takeProfit,
      riskAmount,
      rewardAmount
    };
  }
}
