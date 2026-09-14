import { OHLCV } from "./structure";

export enum ZoneType {
  OB_BULLISH = "OB_BULLISH",
  OB_BEARISH = "OB_BEARISH",
  FVG_BULLISH = "FVG_BULLISH",
  FVG_BEARISH = "FVG_BEARISH"
}

export interface Zone {
  type: ZoneType;
  top: number;
  bottom: number;
  strength: number;
}

export class ZoneDetector {
  analyze(data: OHLCV[]) {
    const zones: Zone[] = [];
    
    // FVG Detection
    for (let i = 2; i < data.length; i++) {
      const prev = data[i - 2];
      const next = data[i];

      // Bullish FVG
      if (next.low > prev.high) {
        zones.push({
          type: ZoneType.FVG_BULLISH,
          top: next.low,
          bottom: prev.high,
          strength: (next.low - prev.high) / prev.close
        });
      }

      // Bearish FVG
      if (next.high < prev.low) {
        zones.push({
          type: ZoneType.FVG_BEARISH,
          top: prev.low,
          bottom: next.high,
          strength: (prev.low - next.high) / prev.close
        });
      }
    }

    // Order Block Detection (Simplified)
    for (let i = 1; i < data.length; i++) {
        const curr = data[i];
        const prev = data[i-1];
        const body = Math.abs(curr.close - curr.open);
        
        if (body > (Math.abs(prev.close - prev.open) * 2)) {
            if (curr.close > curr.open) {
                zones.push({ type: ZoneType.OB_BULLISH, top: curr.close, bottom: curr.open, strength: 0.7 });
            } else {
                zones.push({ type: ZoneType.OB_BEARISH, top: curr.open, bottom: curr.close, strength: 0.7 });
            }
        }
    }

    return { zones };
  }
}
