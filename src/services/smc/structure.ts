export enum Trend {
  BULLISH = "BULLISH",
  BEARISH = "BEARISH",
  NEUTRAL = "NEUTRAL"
}

export enum StructureSignal {
  BOS = "BREAK_OF_STRUCTURE",
  MSS = "MARKET_STRUCTURE_SHIFT",
  CHOCH = "CHANGE_OF_CHARACTER",
  NONE = "NONE"
}

export interface OHLCV {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export class MarketStructure {
  private swingLength: number;
  public swingHighs: any[] = [];
  public swingLows: any[] = [];

  constructor(swingLength: number = 5) {
    this.swingLength = swingLength;
  }

  identifySwings(data: OHLCV[]) {
    this.swingHighs = [];
    this.swingLows = [];

    for (let i = this.swingLength; i < data.length - this.swingLength; i++) {
      const current = data[i];
      const slice = data.slice(i - this.swingLength, i + this.swingLength + 1);
      
      const isHigh = slice.every(d => d.high <= current.high);
      const isLow = slice.every(d => d.low >= current.low);

      if (isHigh) this.swingHighs.push({ price: current.high, index: i });
      if (isLow) this.swingLows.push({ price: current.low, index: i });
    }
  }

  determineTrend(): Trend {
    if (this.swingHighs.length < 2 || this.swingLows.length < 2) return Trend.NEUTRAL;
    
    const lastHigh = this.swingHighs[this.swingHighs.length - 1].price;
    const prevHigh = this.swingHighs[this.swingHighs.length - 2].price;
    const lastLow = this.swingLows[this.swingLows.length - 1].price;
    const prevLow = this.swingLows[this.swingLows.length - 2].price;

    if (lastHigh > prevHigh && lastLow > prevLow) return Trend.BULLISH;
    if (lastHigh < prevHigh && lastLow < prevLow) return Trend.BEARISH;
    return Trend.NEUTRAL;
  }

  detectSignals(data: OHLCV[], trend: Trend) {
    const currentPrice = data[data.length - 1].close;
    let bos = StructureSignal.NONE;
    let mss = StructureSignal.NONE;
    let choch = StructureSignal.NONE;

    if (this.swingHighs.length < 2 || this.swingLows.length < 2) return { bos, mss, choch };

    const lastHigh = this.swingHighs[this.swingHighs.length - 1].price;
    const lastLow = this.swingLows[this.swingLows.length - 1].price;

    // BOS
    if (trend === Trend.BULLISH && currentPrice > lastHigh) bos = StructureSignal.BOS;
    if (trend === Trend.BEARISH && currentPrice < lastLow) bos = StructureSignal.BOS;

    // MSS (Shift)
    if (trend === Trend.BULLISH && currentPrice < lastLow) mss = StructureSignal.MSS;
    if (trend === Trend.BEARISH && currentPrice > lastHigh) mss = StructureSignal.MSS;

    // ChoCh (Character Change - simplified)
    if (trend === Trend.BULLISH && this.swingHighs[this.swingHighs.length - 1].price < this.swingHighs[this.swingHighs.length - 2].price) {
        choch = StructureSignal.CHOCH;
    }

    return { bos, mss, choch };
  }

  analyze(data: OHLCV[]) {
    this.identifySwings(data);
    const trend = this.determineTrend();
    const signals = this.detectSignals(data, trend);
    return { trend, ...signals };
  }
}
