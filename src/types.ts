export interface MarketData {
  time: number | string;
  price: number;
  volume: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  openClose?: [number, number];
}

export interface ChartDrawing {
  id: string;
  type: 'horizontal_line' | 'trend_line' | 'fibonacci' | 'rectangle' | 'marker';
  points: { time: number | string; price: number }[];
  options?: any;
}

export interface CandlestickPattern {
  type: 'ENGULFING_BULL' | 'ENGULFING_BEAR' | 'PIN_BAR_BULL' | 'PIN_BAR_BEAR' | 'HARAMI_BULL' | 'HARAMI_BEAR' | 'DOJI';
  index: number;
  confidence: number;
}

export interface FibonacciLevels {
  high: number;
  low: number;
  levels: {
    [key: string]: number;
  };
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export type Timeframe = 'W' | 'D' | '4H' | '1H' | '30m' | '15m' | '5m' | '1m';
export type TradeType = 'SWING' | 'DAY' | 'SCALP';

export interface MarketState {
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  newsImpact: 'HIGH' | 'MEDIUM' | 'LOW';
  summary: string;
}

export interface StrategicVault {
  macroBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  marketRegime: 'TRENDING' | 'RANGING' | 'VOLATILE';
  lastUpdated: string;
  globalContext: string;
}

export interface TacticalBuffer {
  sessionVolatility: number;
  recentWinRate: number;
  currentSession: 'ASIA' | 'LONDON' | 'NY' | 'OFF';
  immediateBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
}

export interface ExperienceMemory {
  successPatterns: string[];
  failurePatterns: string[];
  lessonsLearned: string[];
}

export interface TheoreticalMemory {
  concepts: string[];
  rules: string[];
  lastKnowledgeUpdate: string;
}

export interface AlignmentMemory {
  userInstructions: string[];
  preferredStyle: string;
  riskAppetite: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface SimulationMemory {
  backtestResults: {
    strategyId: string;
    winRate: number;
    profitFactor: number;
    bestTimeframe: string;
  }[];
}

export interface AgentMemory {
  strategic: StrategicVault;
  tactical: TacticalBuffer;
  experience: ExperienceMemory;
  theoretical: TheoreticalMemory;
  alignment: AlignmentMemory;
  simulation: SimulationMemory;
}

export interface PreFlightChecklist {
  fundamental: boolean;
  smcContext: boolean;
  elliottWave: boolean;
  anchorAlignment: boolean;
  triggerPattern: boolean;
}

export type SignalStatus = 'PENDING' | 'SUCCESS' | 'FAILURE' | 'CANCELLED';

export interface CognitiveAnalysis {
  whatHappened: string;
  whatIsHappening: string;
  whatCouldHappen: string;
  blindSpots: string;
}

export interface ContingencyPlan {
  strategyA: string;
  strategyB: string;
  strategyC: string;
}

export interface AlertZone {
  name: string;
  minPrice: number;
  maxPrice: number;
  type: string;
}

export interface BattlePlan {
  id: string;
  asset: string;
  createdAt: string;
  status: 'ACTIVE' | 'TRIGGERED' | 'COMPLETED' | 'INVALIDATED';
  alertZones: AlertZone[];
  strategy: { description: string; expectedAction: 'BUY' | 'SELL'; conditions: string[] };
  counterStrategy: { description: string; expectedAction: 'BUY' | 'SELL'; conditions: string[] };
  counterCounterStrategy: { description: string; expectedAction: 'BUY' | 'SELL'; conditions: string[] };
  lastPriceChecked?: number;
  timeframe?: string;
  tradeType?: string;
  checkInterval?: number;
  lastCheckedAt?: number;
}

export interface TradingSignal {
  id: string;
  asset: string;
  type: 'BUY' | 'SELL' | 'HOLD';
  tradeType: TradeType;
  anchorTimeframe: Timeframe;
  entryTimeframe: Timeframe;
  confidence: number;
  reasoning: string;
  timestamp: string;
  patterns?: CandlestickPattern[];
  fibo?: FibonacciLevels;
  sources?: GroundingSource[];
  elliott?: { wave: string; confidence: number };
  checklist: PreFlightChecklist;
  marketState?: MarketState;
  cognitive?: CognitiveAnalysis;
  contingency?: ContingencyPlan;
  status: SignalStatus;
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  exitPrice?: number;
  positionSize?: number;
  riskRewardRatio?: number;
  closedAt?: string;
}

export interface PortfolioAsset {
  symbol: string;
  name: string;
  balance: number;
  value: number;
  change24h: number;
}
