import { OHLCV } from "../smc/structure";

export interface QuantumVolatilityResult {
  values: number[];
  signal: number[];
  colors: ('up' | 'down' | 'neutral')[];
}

export class QuantumVolatility {
  private atrPeriod: number;
  private volumeSmoothing: number;
  private timeDistortionFactor: number;
  private signalPeriod: number;

  constructor(
    atrPeriod = 14,
    volumeSmoothing = 5,
    timeDistortionFactor = 1.5,
    signalPeriod = 7
  ) {
    this.atrPeriod = atrPeriod;
    this.volumeSmoothing = volumeSmoothing;
    this.timeDistortionFactor = timeDistortionFactor;
    this.signalPeriod = signalPeriod;
  }

  private calculateATR(data: OHLCV[], period: number): number[] {
    const atr: number[] = new Array(data.length).fill(0);
    const tr: number[] = new Array(data.length).fill(0);

    for (let i = 1; i < data.length; i++) {
      const h_l = data[i].high - data[i].low;
      const h_pc = Math.abs(data[i].high - data[i - 1].close);
      const l_pc = Math.abs(data[i].low - data[i - 1].close);
      tr[i] = Math.max(h_l, h_pc, l_pc);
    }

    let sumTR = 0;
    for (let i = 1; i <= period; i++) {
      sumTR += tr[i];
    }
    atr[period] = sumTR / period;

    for (let i = period + 1; i < data.length; i++) {
      atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period;
    }

    return atr;
  }

  analyze(data: OHLCV[]): QuantumVolatilityResult {
    const atrValues = this.calculateATR(data, this.atrPeriod);
    const quantumValues: number[] = new Array(data.length).fill(0);
    const colors: ('up' | 'down' | 'neutral')[] = new Array(data.length).fill('neutral');

    for (let i = 0; i < data.length; i++) {
      // Smoothed Volume
      let smoothedVolume = 0;
      let count = 0;
      for (let j = 0; j < this.volumeSmoothing; j++) {
        const pos = i - j;
        if (pos >= 0) {
          smoothedVolume += data[pos].volume;
          count++;
        }
      }
      smoothedVolume /= Math.max(count, 1);

      const logVolume = Math.log(Math.max(smoothedVolume, 0.1) + 1.0);
      quantumValues[i] = atrValues[i] * logVolume * this.timeDistortionFactor;

      if (i > 0) {
        if (quantumValues[i] > quantumValues[i - 1]) colors[i] = 'up';
        else if (quantumValues[i] < quantumValues[i - 1]) colors[i] = 'down';
        else colors[i] = 'neutral';
      }
    }

    // Signal Line (SMA of Quantum Values)
    const signalValues: number[] = new Array(data.length).fill(0);
    for (let i = 0; i < data.length; i++) {
      let sum = 0;
      let count = 0;
      for (let j = 0; j < this.signalPeriod; j++) {
        const pos = i - j;
        if (pos >= 0) {
          sum += quantumValues[pos];
          count++;
        }
      }
      signalValues[i] = count > 0 ? sum / count : 0;
    }

    return {
      values: quantumValues,
      signal: signalValues,
      colors
    };
  }
}
