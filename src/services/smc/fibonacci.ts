import { OHLCV } from "./structure";
import { FibonacciLevels } from "../../types";

export class FibonacciCalculator {
  calculate(data: OHLCV[]): FibonacciLevels {
    const last50 = data.slice(-50);
    const high = Math.max(...last50.map(d => d.high));
    const low = Math.min(...last50.map(d => d.low));
    const diff = high - low;

    return {
      high,
      low,
      levels: {
        '0': high,
        '0.236': high - diff * 0.236,
        '0.382': high - diff * 0.382,
        '0.5': high - diff * 0.5,
        '0.618': high - diff * 0.618,
        '0.786': high - diff * 0.786,
        '1': low
      }
    };
  }
}
