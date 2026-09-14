import { OHLCV } from "./structure";
import { CandlestickPattern } from "../../types";

export class CandlestickDetector {
  analyze(data: OHLCV[]): CandlestickPattern[] {
    const patterns: CandlestickPattern[] = [];
    if (data.length < 3) return patterns;

    for (let i = 1; i < data.length; i++) {
      const current = data[i];
      const prev = data[i - 1];

      const bodySize = Math.abs(current.close - current.open);
      const prevBodySize = Math.abs(prev.close - prev.open);
      const range = current.high - current.low;
      
      // Doji
      if (bodySize <= range * 0.1) {
        patterns.push({ type: 'DOJI', index: i, confidence: 0.8 });
      }

      // Engulfing
      if (current.close > current.open && prev.close < prev.open && current.close > prev.open && current.open < prev.close) {
        patterns.push({ type: 'ENGULFING_BULL', index: i, confidence: 0.9 });
      }
      if (current.close < current.open && prev.close > prev.open && current.close < prev.open && current.open > prev.close) {
        patterns.push({ type: 'ENGULFING_BEAR', index: i, confidence: 0.9 });
      }

      // Pin Bar
      const upperWick = current.high - Math.max(current.open, current.close);
      const lowerWick = Math.min(current.open, current.close) - current.low;
      
      if (lowerWick > bodySize * 2 && upperWick < bodySize) {
        patterns.push({ type: 'PIN_BAR_BULL', index: i, confidence: 0.85 });
      }
      if (upperWick > bodySize * 2 && lowerWick < bodySize) {
        patterns.push({ type: 'PIN_BAR_BEAR', index: i, confidence: 0.85 });
      }

      // Harami
      if (prevBodySize > bodySize * 2) {
        if (current.high < prev.high && current.low > prev.low) {
          if (prev.close < prev.open && current.close > current.open) {
            patterns.push({ type: 'HARAMI_BULL', index: i, confidence: 0.75 });
          }
          if (prev.close > prev.open && current.close < current.open) {
            patterns.push({ type: 'HARAMI_BEAR', index: i, confidence: 0.75 });
          }
        }
      }
    }

    return patterns;
  }
}
