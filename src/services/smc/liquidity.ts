import { OHLCV } from "./structure";

export interface LiquidityPool {
  level: number;
  type: "ABOVE_HIGH" | "BELOW_LOW" | "EQH" | "EQL";
  strength: number;
}

export class LiquidityDetector {
  private lookback: number;
  private tolerance: number;

  constructor(lookback: number = 20, tolerance: number = 0.005) {
    this.lookback = lookback;
    this.tolerance = tolerance;
  }

  analyze(data: OHLCV[]) {
    const pools: LiquidityPool[] = [];
    const recent = data.slice(-this.lookback);
    const currentPrice = data[data.length - 1].close;

    // Simple High/Low Liquidity
    const maxHigh = Math.max(...recent.map(d => d.high));
    const minLow = Math.min(...recent.map(d => d.low));

    pools.push({ level: maxHigh, type: "ABOVE_HIGH", strength: 0.5 });
    pools.push({ level: minLow, type: "BELOW_LOW", strength: 0.5 });

    // Equal Highs/Lows detection (simplified)
    const highs = recent.map(d => d.high);
    for (let i = 0; i < highs.length; i++) {
      for (let j = i + 1; j < highs.length; j++) {
        if (Math.abs(highs[i] - highs[j]) / highs[i] <= this.tolerance) {
          pools.push({ level: highs[i], type: "EQH", strength: 0.8 });
          break;
        }
      }
    }

    return {
      pools,
      nearestAbove: pools.filter(p => p.level > currentPrice).sort((a, b) => a.level - b.level)[0]?.level,
      nearestBelow: pools.filter(p => p.level < currentPrice).sort((a, b) => b.level - a.level)[0]?.level,
    };
  }
}
