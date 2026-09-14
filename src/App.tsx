import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  Wallet, 
  Zap, 
  History, 
  Settings,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCcw,
  BrainCircuit,
  ShieldCheck,
  LayoutDashboard,
  Globe,
  Play,
  Pause,
  CheckCircle2,
  XCircle,
  Clock,
  Database,
  BookOpen,
  UserCircle,
  FlaskConical,
  Cpu,
  Layers,
  Paperclip,
  FileText,
  Image as ImageIcon,
  ShieldAlert,
  LineChart as LineChartIcon,
  Radio,
  Menu,
  Search,
  Trash2
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { cn } from './lib/utils';
import { MarketData, TradingSignal, PortfolioAsset, TradeType, PreFlightChecklist } from './types';
import ReactMarkdown from 'react-markdown';
import { Terminal } from './components/Terminal';
import { SMCAgent } from './services/smc/agent';
import { OHLCV } from './services/smc/structure';
import { OrderExecutor, ExecutionMode } from './services/smc/executor';
import { RiskManager } from './services/smc/risk';
import { MemoryService } from './services/memoryService';
import { OptimizationService } from './services/optimizationService';
import { ChatService, ChatMessage } from './services/chatService';
import { auth } from './firebase';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import { io } from 'socket.io-client';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LightweightChart } from './components/LightweightChart';
import { DerivOAuth } from './components/DerivOAuth';
import { BrokerDashboard } from './components/BrokerDashboard';

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
  tradeType?: string;
}

const memory = new MemoryService();
const optimizer = new OptimizationService();
const chatService = new ChatService();

// Mock Data Generators
const generateMockData = (basePrice: number, points: number): MarketData[] => {
  let currentPrice = basePrice;
  return Array.from({ length: points }).map((_, i) => {
    const open = currentPrice;
    currentPrice += (Math.random() - 0.5) * (basePrice * 0.02);
    const close = currentPrice;
    const high = Math.max(open, close) + Math.random() * (basePrice * 0.01);
    const low = Math.min(open, close) - Math.random() * (basePrice * 0.01);
    return {
      time: Math.floor((Date.now() - (points - i) * 3600000) / 1000),
      price: Number(currentPrice.toFixed(2)),
      volume: Math.floor(Math.random() * 1000) + 500,
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      openClose: [Number(open.toFixed(2)), Number(close.toFixed(2))]
    };
  });
};

const INITIAL_PORTFOLIO: PortfolioAsset[] = [
  { symbol: 'R_75', name: 'Volatility 75 Index', balance: 0, value: 0, change24h: 0 },
  { symbol: 'R_100', name: 'Volatility 100 Index', balance: 0, value: 0, change24h: 0 },
  { symbol: 'frxEURUSD', name: 'EUR/USD', balance: 0, value: 0, change24h: 0 },
  { symbol: 'frxGBPUSD', name: 'GBP/USD', balance: 0, value: 0, change24h: 0 },
];

const PriceDisplay: React.FC<{ price: number, isClosed?: boolean }> = ({ price, isClosed }) => {
  const [prevPrice, setPrevPrice] = useState(price);
  const [flashColor, setFlashColor] = useState<'green' | 'red' | null>(null);

  useEffect(() => {
    if (price > prevPrice) {
      setFlashColor('green');
    } else if (price < prevPrice) {
      setFlashColor('red');
    }
    setPrevPrice(price);
    
    const timer = setTimeout(() => setFlashColor(null), 500);
    return () => clearTimeout(timer);
  }, [price]);

  if (isClosed) return <span>Fechado</span>;

  return (
    <span className={cn(
      "transition-colors duration-300 px-2 py-0.5 rounded font-mono",
      flashColor === 'green' ? "text-emerald-400" : 
      flashColor === 'red' ? "text-red-400" : "text-zinc-400"
    )}>
      ${price.toFixed(4)}
    </span>
  );
};

const MARKET_CATEGORIES = [
  { name: 'Forex', assets: [
    'frxAUDJPY', 'frxAUDUSD', 'frxEURAUD', 'frxEURCAD', 'frxEURCHF', 
    'frxEURGBP', 'frxEURJPY', 'frxEURUSD', 'frxGBPJPY', 'frxGBPUSD', 
    'frxUSDCAD', 'frxUSDCHF', 'frxUSDJPY', 'frxGBPAUD'
  ] },
  { name: 'Crash/Boom', assets: [
    'CRASH300N', 'BOOM900', 'BOOM600', 'CRASH900', 'CRASH600', 
    'CRASH50', 'BOOM50', 'BOOM300N', 'CRASH500', 'CRASH1000', 
    'BOOM500', 'BOOM1000', 'BOOM150N', 'CRASH150N'
  ] },
  { name: 'Índices de Volatilidade', assets: [
    'R_10', 'R_25', 'R_50', 'R_75', 'R_100',
    '1HZ10V', '1HZ25V', '1HZ50V', '1HZ75V', '1HZ100V',
    '1HZ15V', '1HZ30V', '1HZ90V'
  ] },
  { name: 'Criptomoedas', assets: [
    'cryBTCUSD', 'cryETHUSD'
  ] },
  { name: 'Metais', assets: [
    'frxXAUUSD', 'frxXAGUSD', 'frxXPDUSD', 'frxXPTUSD'
  ] }
];

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthChecking(false);
    });
    return () => unsubscribe();
  }, []);

  const handleGoogleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login Error:", error);
    }
  };

  const [marketData, setMarketData] = useState<MarketData[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioAsset[]>(INITIAL_PORTFOLIO);
  const [signals, setSignals] = useState<TradingSignal[]>([]);
  const [volatilityData, setVolatilityData] = useState<any[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [knowledgeInput, setKnowledgeInput] = useState('');
  const [agentState, setAgentState] = useState<any>(null);
  const [skills, setSkills] = useState<any[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isAutoPilot, setIsAutoPilot] = useState(false);
  const [fullMemory, setFullMemory] = useState<any>(null);
  const [chatAttachment, setChatAttachment] = useState<{file: File, base64: string, type: string} | null>(null);
  const [quotes, setQuotes] = useState<Record<string, { price: number, color: string, isClosed?: boolean }>>({});
  const [demoBalance, setDemoBalance] = useState<number>(0);
  const [realBalance, setRealBalance] = useState<number>(0);
  const demoBalanceRef = useRef(demoBalance);
  const realBalanceRef = useRef(realBalance);

  useEffect(() => {
    demoBalanceRef.current = demoBalance;
    realBalanceRef.current = realBalance;
  }, [demoBalance, realBalance]);
  const [openPositions, setOpenPositions] = useState<any[]>([]);
  const [profitTable, setProfitTable] = useState<any[]>([]);
  const [aiAnalysisResult, setAiAnalysisResult] = useState<any>(null);
  const [indicatorAnalysis, setIndicatorAnalysis] = useState<Record<string, string>>({});
  const [isAnalyzingIndicators, setIsAnalyzingIndicators] = useState(false);
  const [statement, setStatement] = useState<any[]>([]);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(true);
  const [tradingMode, setTradingMode] = useState<'options' | 'cfd'>('options');
  const [cfdDailyTargetPct, setCfdDailyTargetPct] = useState<number>(20);
  const [cfdMaxDailyLossPct, setCfdMaxDailyLossPct] = useState<number>(10);
  const [cfdRiskPerTradePct, setCfdRiskPerTradePct] = useState<number>(2);
const [activeTab, setActiveTab] = useState<'grafico' | 'mercado' | 'operacao' | 'indicadores' | 'sinais' | 'configuracoes' | 'bate-papo' | 'controle-dados' | 'corretora'>('grafico');
  const [marketSearch, setMarketSearch] = useState('');
  const [activeIndicators, setActiveIndicators] = useState<string[]>([]);
  const [isMenuOpen, setIsMenuOpen] = useState(true);
  const [riskEntryType, setRiskEntryType] = useState<'conservador' | 'agressivo' | 'adaptativo'>('adaptativo');
  const [capitalRiskPct, setCapitalRiskPct] = useState<number>(10);
  const [useMartingale, setUseMartingale] = useState<boolean>(false);
  const [maxConcurrentTrades, setMaxConcurrentTrades] = useState<number>(1);
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>('1H');
  const [chartType, setChartType] = useState<'candles' | 'line'>('line');
  const [trainingText, setTrainingText] = useState('');
  const [trainingFile, setTrainingFile] = useState<File | null>(null);
  const [isTraining, setIsTraining] = useState(false);
  const [memoryItems, setMemoryItems] = useState<any[]>([]);
  const [manualStake, setManualStake] = useState<number>(10);
  const [manualSL, setManualSL] = useState<string>('');
  const [manualTP, setManualTP] = useState<string>('');
  const [pendingStrategies, setPendingStrategies] = useState<Record<number, any>>({});
  const [chartDrawings, setChartDrawings] = useState<any[]>([]);
  const [battlePlans, setBattlePlans] = useState<any[]>([]);
  const [hasLoadedPlans, setHasLoadedPlans] = useState(false);

  useEffect(() => {
    const loadBattlePlans = async () => {
      try {
        const res = await fetch('/api/battle-plans');
        if (res.ok) {
          const plans = await res.json();
          setBattlePlans(plans);
        }
      } catch (error) {
        console.error("Failed to load battle plans:", error);
      } finally {
        setHasLoadedPlans(true);
      }
    };
    loadBattlePlans();
  }, []);

  useEffect(() => {
    if (!hasLoadedPlans) return;
    const saveBattlePlans = async () => {
      try {
        await fetch('/api/battle-plans', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plans: battlePlans })
        });
      } catch (error) {
        console.error("Failed to save battle plans:", error);
      }
    };
    saveBattlePlans();
  }, [battlePlans, hasLoadedPlans]);

  useEffect(() => {
    const handleAgentLog = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { message, type } = customEvent.detail;
      
      switch (type) {
        case 'success':
          toast.success(message);
          break;
        case 'error':
          toast.error(message);
          break;
        case 'warning':
          toast.warning(message);
          break;
        case 'info':
        default:
          toast.info(message);
          break;
      }
    };

    window.addEventListener('agent-log', handleAgentLog);
    return () => window.removeEventListener('agent-log', handleAgentLog);
  }, []);

  useEffect(() => {
    if (activeTab === 'configuracoes') {
      fetch('/api/memory').then(res => res.json()).then(setMemoryItems).catch(console.error);
    }
  }, [activeTab]);

  const handleTrainAgent = async () => {
    if (!trainingText && !trainingFile) return;
    setIsTraining(true);
    
    const formData = new FormData();
    if (trainingText) formData.append('text', trainingText);
    if (trainingFile) formData.append('file', trainingFile);
    
    try {
      const res = await fetch('/api/train-agent', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        alert(`Treinamento concluído! ${data.addedItems} novas regras adicionadas ao Cérebro Digital.`);
        setTrainingText('');
        setTrainingFile(null);
        fetch('/api/memory').then(r => r.json()).then(setMemoryItems);
      } else {
        alert(`Erro no treinamento: ${data.error}`);
      }
    } catch (err) {
      console.error(err);
      alert('Falha ao conectar com o servidor de treinamento.');
    } finally {
      setIsTraining(false);
    }
  };

  const clearMemory = async () => {
    if (!confirm('Tem certeza que deseja apagar toda a memória coletiva?')) return;
    try {
      await fetch('/api/memory', { method: 'DELETE' });
      setMemoryItems([]);
    } catch (err) {
      console.error(err);
    }
  };

  const toggleTradingMode = async () => {
    const newMode = tradingMode === 'options' ? 'cfd' : 'options';
    setTradingMode(newMode);
    try {
      await fetch('/api/set-trading-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: newMode })
      });
      alert(`Switched to ${newMode === 'options' ? 'Opções Binárias' : 'CFDs'}.`);
    } catch (e) {
      console.error('Failed to switch trading mode:', e);
    }
  };

  const toggleDemoMode = async () => {
    const newMode = !isDemoMode;
    setIsDemoMode(newMode);
    try {
      await fetch('/api/set-demo-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDemo: newMode })
      });
      alert(`Switched to ${newMode ? 'Demo' : 'Real'} account. Reconnecting...`);
      // Optionally reload the page or wait for websocket events
    } catch (e) {
      console.error('Failed to switch mode:', e);
    }
  };

  const handleTestTrade = async () => {
    if (!isDemoMode) {
      alert('Test trades can only be executed in Demo Account mode.');
      return;
    }
    try {
      const res = await fetch('/api/debug/trade', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert('Trade executed successfully! Check the console or Deriv account.');
        console.log('Trade result:', data.result);
        fetchOpenPositions();
      } else {
        alert('Trade failed: ' + data.error);
      }
    } catch (e: any) {
      alert('Error: ' + e.message);
    }
  };

  const fetchOpenPositions = async () => {
    try {
      const res = await fetch('/api/portfolio');
      if (res.ok) {
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
          const data = await res.json();
          if (data.portfolio && data.portfolio.contracts) {
            setOpenPositions(data.portfolio.contracts);
          }
        }
      }
    } catch (e: any) {
      if (e.message && !e.message.includes('Failed to fetch')) {
        console.error(e);
      }
    }
  };

  useEffect(() => {
    if (profitTable.length > 0 && Object.keys(pendingStrategies).length > 0) {
      profitTable.forEach(async (transaction: any) => {
        const contractId = transaction.contract_id;
        if (pendingStrategies[contractId]) {
          const profit = transaction.sell_price - transaction.buy_price;
          if (profit > 0) {
            // WIN! Save strategy
            const strategyInfo = pendingStrategies[contractId];
            const ruleText = `Estratégia Aprovada (AutoPilot WIN): ${strategyInfo.signal.type} em ${strategyInfo.signal.asset}. Motivo: ${strategyInfo.signal.reasoning}. Preço de entrada: ${strategyInfo.signal.entry}. Contexto: ${JSON.stringify(strategyInfo.marketContext.map((c: any) => c.price))}`;
            
            window.dispatchEvent(new CustomEvent('agent-log', { 
              detail: { message: `Operação #${contractId} fechou com LUCRO ($${profit.toFixed(2)}). Salvando estratégia na Memória Coletiva...`, type: 'success' } 
            }));

            try {
              await fetch('/api/train-agent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: ruleText })
              });
              // Refresh memory
              const memRes = await fetch('/api/memory');
              const memData = await memRes.json();
              setMemoryItems(memData);
            } catch (e) {
              console.error("Failed to save strategy", e);
            }
          } else {
            window.dispatchEvent(new CustomEvent('agent-log', { 
              detail: { message: `Operação #${contractId} fechou com PERDA. Estratégia descartada.`, type: 'error' } 
            }));
          }
          
          const finalStatus = profit > 0 ? 'SUCCESS' : 'FAILURE';
          updateSignalStatus(pendingStrategies[contractId].signal.id, finalStatus, 0); // 0 since we don't know the exact exit price of the asset

          // Remove from pending
          setPendingStrategies(prev => {
            const next = { ...prev };
            delete next[contractId];
            return next;
          });
        }
      });
    }
  }, [profitTable, pendingStrategies]);

  const fetchProfitTable = async () => {
    try {
      const res = await fetch('/api/profit-table');
      if (res.ok) {
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
          const data = await res.json();
          if (data.profit_table && data.profit_table.transactions) {
            setProfitTable(data.profit_table.transactions);
          }
        }
      }
    } catch (e: any) {
      if (e.message && !e.message.includes('Failed to fetch')) {
        console.error(e);
      }
    }
  };

  const fetchStatement = async () => {
    try {
      const res = await fetch('/api/statement');
      if (res.ok) {
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
          const data = await res.json();
          if (data.statement && data.statement.transactions) {
            setStatement(data.statement.transactions);
          }
        }
      }
    } catch (e: any) {
      if (e.message && !e.message.includes('Failed to fetch')) {
        console.error(e);
      }
    }
  };

  useEffect(() => {
    fetchOpenPositions();
    fetchProfitTable();
    fetchStatement();
    const interval = setInterval(() => {
      fetchOpenPositions();
      fetchProfitTable();
      fetchStatement();
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const socket = io();
    socket.on('quote', (data) => {
      if (data.price === undefined || isNaN(Number(data.price))) return;
      setQuotes(prev => {
        const prevQuote = prev[data.symbol];
        const color = !prevQuote ? 'text-gray-400' : (data.price > prevQuote.price ? 'text-green-500' : (data.price < prevQuote.price ? 'text-red-500' : prevQuote.color));
        return { ...prev, [data.symbol]: { price: Number(data.price), color } };
      });
    });

    socket.on('market_closed', (symbol) => {
      setQuotes(prev => {
        return { ...prev, [symbol]: { price: 0, color: 'text-zinc-600', isClosed: true } };
      });
    });
    
    socket.on('balance', (data) => {
      if (data && data.accounts) {
        let demo = 0;
        let real = 0;
        Object.values(data.accounts).forEach((acc: any) => {
          if (acc.demo_account === 1) {
            demo += acc.balance;
          } else {
            real += acc.balance;
          }
        });
        setDemoBalance(demo);
        setRealBalance(real);
      } else if (data && data.balance !== undefined) {
        if (data.loginid && data.loginid.startsWith('VRTC')) {
          setDemoBalance(data.balance);
        } else if (data.loginid && data.loginid.startsWith('CR')) {
          setRealBalance(data.balance);
        } else {
          setDemoBalance(data.balance);
        }
      }
    });

    socket.on('open_contract', (contract) => {
      setOpenPositions(prev => {
        const index = prev.findIndex(p => p.contract_id === contract.contract_id);
        if (index !== -1) {
          const newPositions = [...prev];
          newPositions[index] = { 
            ...newPositions[index], 
            bid_price: contract.bid_price,
            is_valid_to_sell: contract.is_valid_to_sell
          };
          return newPositions;
        }
        // If not in list, we might want to add it, but fetchOpenPositions will handle it.
        return prev;
      });
    });

    socket.on('mt5_accounts', (accounts) => {
      if (Array.isArray(accounts)) {
        // We only log MT5 accounts, we don't overwrite the main Deriv balance
        // because trades are executed on the Deriv account.
        console.log('MT5 Accounts loaded:', accounts.length);
      }
    });

    socket.on('telegram_command', ({ command, args }) => {
      if (command === '/autopilot') {
        const state = args[0] === 'on';
        setIsAutoPilot(state);
        socket.emit('telegram_response', { text: `🤖 AutoPilot alterado para: <b>${state ? 'ON' : 'OFF'}</b>` });
      } else if (command === '/analisar') {
        const asset = args[0] || 'R_75';
        socket.emit('telegram_response', { text: `⏳ Iniciando análise para ${asset}...` });
        // We trigger a custom event so the main component can handle it with latest state
        window.dispatchEvent(new CustomEvent('telegram-analyze', { detail: { asset } }));
      } else if (command === '/comprar' || command === '/vender') {
        const asset = args[0] || 'R_75';
        const volume = Number(args[1]) || 1;
        const type = command === '/comprar' ? 'BUY' : 'SELL';
        socket.emit('telegram_response', { text: `⏳ Executando ${type} em ${asset} (Stake: $${volume})...` });
        window.dispatchEvent(new CustomEvent('telegram-trade', { detail: { type, asset, volume } }));
      } else if (command === '/toggle_indicador') {
        const ind = args[0];
        window.dispatchEvent(new CustomEvent('telegram-toggle-indicador', { detail: { ind } }));
      }
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    const loadState = async () => {
      const state = await memory.getAgentState();
      const activeSkills = await memory.getSkills();
      const history = await chatService.getHistory();
      const mem = await memory.getFullMemory();
      setAgentState(state);
      setSkills(activeSkills);
      setChatMessages(history);
      setFullMemory(mem);
    };
    loadState();
  }, []);
  const [selectedAsset, setSelectedAsset] = useState('R_75');
  const [tradeType, setTradeType] = useState<TradeType>('DAY');
  const smcAgent = useMemo(() => new SMCAgent(), []);
  const executor = useMemo(() => new OrderExecutor(ExecutionMode.SIMULATED), []);
  const riskManager = useMemo(() => new RiskManager(), []);
  const unsellableContractsRef = useRef<Set<number>>(new Set());
  const lastWaitReasoningRef = useRef<Record<string, { reasoning: string, timestamp: number }>>({});

  const handleClosePosition = async (contractId: number) => {
    try {
      const pos = openPositions.find(p => p.contract_id === contractId);
      
      const response = await fetch('/api/close-trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractId })
      });
      const contentType = response.headers.get("content-type");
      if (!contentType || contentType.indexOf("application/json") === -1) {
        throw new Error("Invalid response from server");
      }
      const data = await response.json();
      if (response.ok && !data.error) {
        window.dispatchEvent(new CustomEvent('agent-log', { 
          detail: { message: `Position ${contractId} closed successfully.`, type: 'success' } 
        }));
        
        if (pos) {
          const pnl = ((pos.bid_price || 0) - pos.buy_price).toFixed(2);
          const isWin = parseFloat(pnl) >= 0;
          const socket = io();
          socket.emit('telegram_notify', { 
            text: `🔒 <b>Posição Fechada</b>\n\n📈 <b>Ativo:</b> ${pos.symbol}\n💰 <b>PnL:</b> ${isWin ? '✅' : '❌'} $${pnl}` 
          });
          socket.disconnect();
        }
        
        fetchOpenPositions();
      } else {
        const errMsg = data.error?.message || data.error || 'Unknown error';
        if (errMsg.includes('Resale of this contract is not offered')) {
          throw new Error('A Deriv não permite a venda manual deste tipo de contrato. Aguarde a expiração.');
        } else if (errMsg.includes('Contract cannot be sold at this time')) {
          throw new Error('A Deriv bloqueou a venda temporariamente. Aguarde alguns segundos ou o preço se mover.');
        } else if (errMsg.includes("We couldn't process your trade")) {
          console.warn("Deriv API returned: We couldn't process your trade. It might already be sold or in a strange state. Refreshing open positions.");
          fetchOpenPositions();
          return;
        }
        throw new Error(errMsg);
      }
    } catch (error: any) {
      window.dispatchEvent(new CustomEvent('agent-log', { 
        detail: { message: `Falha ao fechar posição: ${error.message}`, type: 'error' } 
      }));
      toast.warning(error.message);
    }
  };

  useEffect(() => {
    openPositions.forEach(pos => {
      if (pos.is_valid_to_sell === 0) return;
      if (unsellableContractsRef.current.has(pos.contract_id)) return;

      const pnl = (pos.bid_price || 0) - pos.buy_price;
      
      // se ele perder a metade do valor apostado ele pode fechar a posicao
      if (pnl <= -(pos.buy_price / 2)) {
         console.log(`Auto-closing ${pos.contract_id} because loss reached 50% of stake: $${pnl.toFixed(2)}`);
         window.dispatchEvent(new CustomEvent('agent-log', { 
           detail: { message: `Limitação de Perda atingida ($-${(pos.buy_price/2).toFixed(2)}). Fechando ${pos.contract_id}...`, type: 'warning' } 
         }));
         handleClosePosition(pos.contract_id);
         unsellableContractsRef.current.add(pos.contract_id); // Prevent multiple close calls
         return;
      }

      // quando ele abrir posicao de scalp ele deve buscar apenas lucro de $1.77
      if (pnl >= 1.77) {
         console.log(`Auto-closing (Scalp Target) ${pos.contract_id} because profit reached $1.77+: $${pnl.toFixed(2)}`);
         window.dispatchEvent(new CustomEvent('agent-log', { 
           detail: { message: `Alvo Scalp ($1.77) atingido. Fechando ${pos.contract_id}...`, type: 'success' } 
         }));
         handleClosePosition(pos.contract_id);
         unsellableContractsRef.current.add(pos.contract_id); // Prevent multiple close calls
         return;
      }
    });
  }, [openPositions]);

  const handleManualTrade = (type: 'BUY' | 'SELL') => {
    const currentPrice = marketData[marketData.length - 1]?.price || 0;
    const sl = manualSL ? Number(manualSL) : (type === 'BUY' ? currentPrice * 0.98 : currentPrice * 1.02);
    const tp = manualTP ? Number(manualTP) : (type === 'BUY' ? currentPrice * 1.06 : currentPrice * 0.94);

    handleExecute({
      id: Date.now().toString(),
      asset: selectedAsset,
      type,
      tradeType: 'SCALP',
      anchorTimeframe: '1H',
      entryTimeframe: '1m',
      entryPrice: currentPrice,
      stopLoss: sl,
      takeProfit: tp,
      confidence: 100,
      reasoning: 'Manual Trade Execution',
      timestamp: new Date().toISOString(),
      checklist: {
        fundamental: true,
        smcContext: true,
        elliottWave: true,
        anchorAlignment: true,
        triggerPattern: true
      },
      status: 'PENDING'
    }, manualStake, true);
  };

  const handleExecute = async (signal: TradingSignal, manualStake?: number, isManual: boolean = false) => {
    window.dispatchEvent(new CustomEvent('agent-log', { 
      detail: { message: `Executing ${signal.type} order for ${signal.asset} on Deriv...`, type: 'info' } 
    }));
    
    // Use the strictly active balance based on the selected mode
    const activeBalance = isDemoMode ? demoBalance : realBalance;
    
    // Simple risk calculation (usar o original do sinal se existir)
    const currentPrice = marketData[marketData.length - 1]?.price || 0;
    const stopLoss = signal.stopLoss;
    const takeProfit = signal.takeProfit;
    
    // We explicitly trust the positionSize calculated by the SMC mathematical analysis, or fallback to manual
    let stakeAmount = manualStake || signal.positionSize || (activeBalance * 0.01);
    stakeAmount = Math.max(1, stakeAmount); // Ensure Deriv minimum of $1

    try {
      if (!isManual) {
        window.dispatchEvent(new CustomEvent('agent-log', { 
          detail: { message: `Enviando ordem diretamente para execução. Lote definido pela IA RRC: $${stakeAmount.toFixed(2)}`, type: 'info' } 
        }));
      }

      // Execute Trade
      const response = await fetch('/api/execute-trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: signal.asset,
          action: signal.type.toLowerCase(),
          volume: stakeAmount, // Pass stake amount exactly as expected
          login: '6051235',
          sl: stopLoss,
          tp: takeProfit,
          tradingMode: 'options' // FORÇADO MODO OPTIONS REAL: o backend foca na execução verdadeira do saldo na Deriv, sem modos CFDs 'fake' / 'mockados'.
        })
      });

        const contentType = response.headers.get("content-type");
        if (!contentType || contentType.indexOf("application/json") === -1) {
          throw new Error("Invalid response from server");
        }

        const data = await response.json();

        if (response.ok && !data.error) {
          const contractId = data.buy?.contract_id;
          const msg = `Deriv Order Filled: ${data.buy?.transaction_id || 'Success'} at ${currentPrice}`;
          window.dispatchEvent(new CustomEvent('agent-log', { 
            detail: { message: msg, type: 'success' } 
          }));
          
          if (isAutoPilot && isDemoMode && contractId) {
            setPendingStrategies(prev => ({
              ...prev,
              [contractId]: {
                signal,
                marketContext: marketData.slice(-20) // Save recent market context
              }
            }));
            window.dispatchEvent(new CustomEvent('agent-log', { 
              detail: { message: `Operação #${contractId} marcada como Pendente para aprendizado.`, type: 'info' } 
            }));
          }

          const socket = io();
          socket.emit('telegram_notify', { text: `✅ <b>Ordem Executada!</b>\n\n📈 <b>Ativo:</b> ${signal.asset}\n🛒 <b>Ação:</b> ${signal.type}\n💵 <b>Stake:</b> $${stakeAmount.toFixed(2)}\n🎯 <b>Preço:</b> ${currentPrice}` });
          socket.disconnect();
          
          setActiveTab('operacao');
          
          // FORÇAR ATUALIZAÇÃO IMEDIATA DA TABELA E DO SALDO
          setTimeout(() => {
            fetchOpenPositions();
            fetchProfitTable();
            fetchStatement();
          }, 1000); // 1 segundo de delay para a Deriv processar internamente
        } else {
          throw new Error(data.error?.message || data.error || 'Unknown error');
        }
      } catch (error: any) {
        window.dispatchEvent(new CustomEvent('agent-log', { 
          detail: { message: `Deriv Execution Failed: ${error.message}`, type: 'error' } 
        }));
        const socket = io();
        socket.emit('telegram_notify', { text: `❌ <b>Falha na Execução:</b>\n${error.message}` });
        socket.disconnect();
      }
  };

  useEffect(() => {
    if (activeTab === 'mercado') {
      const socket = io();
      MARKET_CATEGORIES.forEach(cat => {
        cat.assets.forEach(asset => {
          socket.emit('subscribe', asset);
        });
      });
      return () => {
        socket.disconnect();
      };
    }
  }, [activeTab]);

  useEffect(() => {
    const socket = io();
    socket.emit('subscribe', selectedAsset);
    
    const fetchChartData = async () => {
      try {
        const tf = selectedTimeframe.toLowerCase();
        const res = await fetch(`/api/price-history?symbol=${selectedAsset}&timeframe=${tf}&limit=24`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.length > 0) {
            const chartData: MarketData[] = data.map((d: any) => ({
              time: Math.floor(d.timestamp / 1000),
              price: d.close,
              volume: d.volume,
              open: d.open,
              high: d.high,
              low: d.low,
              close: d.close,
              openClose: [d.open, d.close]
            }));
            setMarketData(chartData);
          }
        }
      } catch (error) {
        console.error("Failed to fetch initial chart data:", error);
        setMarketData(generateMockData(63000, 24));
      }
    };
    fetchChartData();
  }, [selectedAsset, selectedTimeframe]);

  useEffect(() => {
    if (quotes[selectedAsset] && !quotes[selectedAsset].isClosed && marketData.length > 0) {
      const currentPrice = quotes[selectedAsset].price;
      setMarketData(prev => {
        if (prev.length === 0) return prev;
        const newData = [...prev];
        const lastCandle = { ...newData[newData.length - 1] };
        
        lastCandle.close = currentPrice;
        lastCandle.high = Math.max(lastCandle.high !== undefined && !isNaN(Number(lastCandle.high)) ? Number(lastCandle.high) : currentPrice, currentPrice);
        lastCandle.low = Math.min(lastCandle.low !== undefined && !isNaN(Number(lastCandle.low)) ? Number(lastCandle.low) : currentPrice, currentPrice);
        lastCandle.openClose = [lastCandle.open !== undefined && !isNaN(Number(lastCandle.open)) ? Number(lastCandle.open) : currentPrice, currentPrice];
        lastCandle.price = currentPrice;
        
        newData[newData.length - 1] = lastCandle;
        return newData;
      });
    }
  }, [quotes[selectedAsset]?.price, quotes[selectedAsset]?.isClosed]);

  const saveBattlePlanHelper = (planResult: any, assetToSave: string) => {
    if (!planResult || planResult.decision.action !== 'WAIT') return; // Only save wait plans as traps, action plans are executed
    const newPlan: any = {
      id: `plan-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      asset: assetToSave,
      createdAt: new Date().toISOString(),
      status: 'ACTIVE',
      alertZones: planResult.alertZones || [],
      strategy: { 
        description: planResult.plans?.planA || "Aguardar confirmação", 
        expectedAction: 'BUY', 
        conditions: [] 
      },
      counterStrategy: { 
        description: planResult.plans?.planB || "Aguardar", 
        expectedAction: 'SELL', 
        conditions: [] 
      },
      counterCounterStrategy: { 
        description: planResult.plans?.planC || "Aguardar", 
        expectedAction: 'BUY', 
        conditions: [] 
      },
      timeframe: planResult.alignment?.triggerTimeframe || '1m',
      tradeType: planResult.alignment?.tradeType || 'SCALP'
    };

    setBattlePlans(prev => {
      const updated = [newPlan, ...prev].slice(0, 50); // Keep more plans since we generate one per level
      fetch('/api/battle-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plans: updated })
      }).catch(console.error);
      return updated;
    });
  };

  const handleAnalyze = async (asset = selectedAsset, type = tradeType) => {
    if (isAnalyzing) return;
    setIsAnalyzing(true);
    try {
      // Fetch real data for all timeframes (Matrioska Concept)
      const timeframes = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'];
      const mtfData: Record<string, any[]> = {};
      
      for (const tf of timeframes) {
        const res = await fetch(`/api/price-history?symbol=${asset}&timeframe=${tf}&limit=100`);
        if (!res.ok) throw new Error(`Failed to fetch ${tf} price history`);
        
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") === -1) {
          throw new Error(`Expected JSON but received ${contentType} from ${res.url}`);
        }
        
        mtfData[tf] = await res.json();
      }
      
      const currentBalance = isDemoMode ? demoBalance : realBalance;
      
      // Run Advanced Institutional Pipeline with Multi-Timeframe Concurrency
      const prevWait = lastWaitReasoningRef.current[asset];
      /* If reasoning is older than ~5 minutes (300,000 ms), we might ignore it, but the prompt says 5 mins so let's pass it anyway */
      const previousWaitReasoning = prevWait && Date.now() - prevWait.timestamp < 1000 * 60 * 15 ? prevWait.reasoning : undefined;

      const smcResult = await smcAgent.executeAIAgentAnalysisWithShiftDown(
        asset, 
        mtfData, 
        currentBalance, 
        activeIndicators, 
        isDemoMode,
        {
          riskEntryType,
          capitalRiskPct,
          useMartingale,
          maxConcurrentTrades
        },
        previousWaitReasoning,
        (msg) => toast.info(msg),
        undefined,
        (plan) => saveBattlePlanHelper(plan, asset)
      );
      
      // Run Auto-Optimization
      await optimizer.runAutoOptimization();
      const updatedState = await memory.getAgentState();
      setAgentState(updatedState);
      const updatedSkills = await memory.getSkills();
      setSkills(updatedSkills);
      const updatedMem = await memory.getFullMemory();
      setFullMemory(updatedMem);

      // Update chart with real data (last 24 points) based on the executed timeframe
      if (asset === selectedAsset) {
        const activeData = smcResult?.alignment?.tradeType === 'SWING' ? mtfData['1d'] : smcResult?.alignment?.tradeType === 'DAY' ? mtfData['4h'] : mtfData['15m'];
        const chartData: MarketData[] = activeData.slice(-24).map((d: any) => ({
          time: Math.floor(d.timestamp / 1000),
          price: d.close,
          volume: d.volume,
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
          openClose: [d.open, d.close]
        }));
        setMarketData(chartData);
      }

      // Add the signal if it's not WAIT
      if (smcResult && smcResult.decision && smcResult.decision.action !== 'WAIT') {
        const signal = {
          id: `sig-${Date.now()}`,
          asset,
          type: smcResult.decision.action,
          tradeType: smcResult.alignment?.tradeType || 'SCALP',
          anchorTimeframe: smcResult.alignment?.anchorTimeframe || '5m',
          entryTimeframe: smcResult.alignment?.triggerTimeframe || '1m',
          confidence: 95,
          reasoning: smcResult.decision.reasoning,
          timestamp: new Date().toISOString(),
          status: 'PENDING' as const,
          entryPrice: smcResult.decision.entryPrice || mtfData['1m'][mtfData['1m'].length - 1].close,
          stopLoss: smcResult.decision.stopLoss,
          takeProfit: smcResult.decision.takeProfit,
          positionSize: Number(smcResult.riskManagement?.recommendedStake || smcResult.riskManagement?.calculatedLot || 10),
          riskRewardRatio: 3,
          checklist: {
            fundamental: true,
            smcContext: true,
            elliottWave: true,
            anchorAlignment: smcResult.alignment?.isAligned || true,
            triggerPattern: true
          },
          cognitive: {
            whatHappened: smcResult.analysis?.fundamental,
            whatIsHappening: smcResult.analysis?.priceAction,
            whatCouldHappen: smcResult.analysis?.elliottWave,
            blindSpots: smcResult.analysis?.smcZones
          },
          contingency: {
            strategyA: smcResult.plans?.planA,
            strategyB: smcResult.plans?.planB,
            strategyC: smcResult.plans?.planC
          }
        };
        
        setSignals(prev => [signal, ...prev].slice(0, 10));
        
        // Create and save Battle Plan
        const newPlan: any = {
          id: `plan-${Date.now()}`,
          asset,
          createdAt: new Date().toISOString(),
          status: 'ACTIVE',
          alertZones: smcResult.alertZones || [],
          strategy: { 
            description: smcResult.plans?.planA || "Estratégia Principal", 
            expectedAction: smcResult.decision.action as 'BUY' | 'SELL', 
            conditions: [] 
          },
          counterStrategy: { 
            description: smcResult.plans?.planB || "Contra-estratégia", 
            expectedAction: smcResult.decision.action === 'BUY' ? 'SELL' : 'BUY', 
            conditions: [] 
          },
          counterCounterStrategy: { 
            description: smcResult.plans?.planC || "Adaptação final", 
            expectedAction: smcResult.decision.action as 'BUY' | 'SELL', 
            conditions: [] 
          },
          timeframe: smcResult.alignment?.triggerTimeframe || '1m',
          tradeType: smcResult.alignment?.tradeType || 'SCALP'
        };

        setBattlePlans(prev => {
          const updated = [newPlan, ...prev].slice(0, 20);
          fetch('/api/battle-plans', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plans: updated })
          }).catch(console.error);
          return updated;
        });
        
        const socket = io();
        socket.emit('telegram_notify', { 
          text: `🔔 <b>Novo Sinal Encontrado!</b>\n\n📈 <b>Ativo:</b> ${signal.asset}\n🛒 <b>Ação:</b> ${signal.type}\n⏱️ <b>Timeframe:</b> ${signal.tradeType}\n🎯 <b>Confiança:</b> ${signal.confidence}%\n\n📝 <b>Motivo:</b> ${signal.reasoning}`,
          options: {
            reply_markup: {
              inline_keyboard: [
                [{ text: `COMPRAR ${signal.asset}`, callback_data: `buy_${signal.asset}` }, { text: `VENDER ${signal.asset}`, callback_data: `sell_${signal.asset}` }]
              ]
            }
          }
        });
        socket.disconnect();

        if (isAutoPilot) {
          handleExecute(signal);
        }
      } else if (smcResult && smcResult.decision && smcResult.decision.action === 'WAIT') {
        toast.info(`Análise Concluída: AGUARDAR. Motivo: ${smcResult.decision.reasoning}`);
        lastWaitReasoningRef.current[asset] = { reasoning: smcResult.decision.reasoning, timestamp: Date.now() };

        const socket = io();
        socket.emit('telegram_notify', { 
          text: `⏳ <b>IA em Espera (Análise Concluída)</b>\n\n📈 <b>Ativo:</b> ${asset}\n\n📝 <b>Motivo:</b> ${smcResult.decision.reasoning}\n\n🗺️ <b>Plano de Batalha:</b>\n<b>Plano A:</b> ${smcResult.plans?.planA || 'N/A'}\n<b>Plano B:</b> ${smcResult.plans?.planB || 'N/A'}\n<b>Plano C:</b> ${smcResult.plans?.planC || 'N/A'}`,
          options: {
            reply_markup: {
              inline_keyboard: [
                [{ text: `COMPRAR ${asset}`, callback_data: `buy_${asset}` }, { text: `VENDER ${asset}`, callback_data: `sell_${asset}` }]
              ]
            }
          }
        });
        socket.disconnect();
      }
    } catch (error: any) {
      if (error.message && error.message.includes('Failed to fetch')) {
        console.warn("Network error during analysis (possibly adblocker or server restarting). Retrying later.");
      } else {
        console.error("Analysis failed:", error);
      }
    }
    setIsAnalyzing(false);
  };

  const handleAnalyzeChart = async () => {
    setIsAnalyzing(true);
    setAiAnalysisResult(null);
    try {
      const tf = selectedTimeframe.toLowerCase();
      const res = await fetch(`/api/price-history?symbol=${selectedAsset}&timeframe=${tf}&limit=100`);
      if (res.ok) {
        const tfData = await res.json();
        const currentBalance = isDemoMode ? demoBalance : realBalance;
        const smcResult = await smcAgent.analyzeSingleChart(selectedAsset, selectedTimeframe, tfData, currentBalance, activeIndicators, isDemoMode);
        setAiAnalysisResult(smcResult);
      }
    } catch (error) {
      console.error("Chart analysis failed:", error);
    }
    setIsAnalyzing(false);
  };

  useEffect(() => {
    if (activeIndicators.length === 0 || marketData.length === 0) {
      setIndicatorAnalysis({});
      return;
    }

    const analyzeIndicators = async () => {
      setIsAnalyzingIndicators(true);
      try {
        const recentData = marketData.slice(-30);
        const currentPrice = recentData[recentData.length - 1]?.price;
        
        const prompt = `
          Analise os seguintes indicadores técnicos para o ativo ${selectedAsset} no timeframe ${selectedTimeframe}.
          Preço atual: ${currentPrice}
          Indicadores ativos: ${activeIndicators.join(', ')}
          
          Dados recentes (últimas 30 velas):
          ${JSON.stringify(recentData.map(d => ({ close: d.close, high: d.high, low: d.low })))}
          
          Forneça uma análise curta (máximo 2 frases) para CADA indicador ativo.
          Responda EXATAMENTE neste formato JSON:
          {
            "RSI": "análise aqui...",
            "MACD": "análise aqui..."
          }
        `;
        
        const reply = await chatService.generateSilentAnalysis(prompt, { asset: selectedAsset, price: currentPrice, recentData }, true);
        
        try {
          const jsonMatch = reply.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            setIndicatorAnalysis(parsed);
          } else {
            const parsed = JSON.parse(reply);
            setIndicatorAnalysis(parsed);
          }
        } catch (e) {
          console.error("Failed to parse indicator analysis JSON:", reply, e);
        }
      } catch (error) {
        console.error("Failed to analyze indicators:", error);
      }
      setIsAnalyzingIndicators(false);
    };

    // Debounce analysis to avoid spamming API when toggling multiple indicators quickly
    const timer = setTimeout(analyzeIndicators, 1000);
    return () => clearTimeout(timer);
  }, [activeIndicators, marketData, selectedAsset, selectedTimeframe]);

  useEffect(() => {
    const handleTelegramAnalyze = (e: any) => {
      handleAnalyze(e.detail.asset, 'DAY');
    };
    const handleTelegramTrade = (e: any) => {
      const { type, asset, volume } = e.detail;
      handleExecute({ 
        id: `manual-${Date.now()}`,
        type, 
        asset, 
        tradeType: 'DAY', 
        anchorTimeframe: 'D',
        entryTimeframe: '15m',
        confidence: 100, 
        entryPrice: 0, 
        reasoning: 'Manual via Telegram', 
        status: 'PENDING',
        timestamp: new Date().toISOString(),
        checklist: {
          fundamental: true,
          smcContext: true,
          elliottWave: true,
          anchorAlignment: true,
          triggerPattern: true
        }
      }, volume, true);
    };
    const handleTelegramToggleIndicador = (e: any) => {
      const { ind } = e.detail;
      setActiveIndicators(prev => 
        prev.includes(ind) ? prev.filter(i => i !== ind) : [...prev, ind]
      );
      const socket = io();
      socket.emit('telegram_notify', { text: `✅ Indicador ${ind} alternado com sucesso.` });
      socket.disconnect();
    };

    window.addEventListener('telegram-analyze', handleTelegramAnalyze);
    window.addEventListener('telegram-trade', handleTelegramTrade);
    window.addEventListener('telegram-toggle-indicador', handleTelegramToggleIndicador);

    return () => {
      window.removeEventListener('telegram-analyze', handleTelegramAnalyze);
      window.removeEventListener('telegram-trade', handleTelegramTrade);
      window.removeEventListener('telegram-toggle-indicador', handleTelegramToggleIndicador);
    };
  }, [handleAnalyze, handleExecute]);

  // Event-Driven Automation Loop (The New AI-Driven Architecture)
  useEffect(() => {
    let isCancelled = false;
    let sleepTimeout: NodeJS.Timeout | null = null;
    let autoPilotInterval: NodeJS.Timeout | null = null;

    if (!isAutoPilot) return;

    const runAutoPilotCycle = async () => {
      const ALL_ASSETS = [
        // 1. Índices de Volatilidade
        'R_10', 'R_25', 'R_50', 'R_75', 'R_100', '1HZ10V', '1HZ25V', '1HZ50V', '1HZ75V', '1HZ100V', '1HZ15V', '1HZ30V', '1HZ90V',
        // 2. Metais
        'frxXAUUSD', 'frxXAGUSD', 'frxXPDUSD', 'frxXPTUSD',
        // 3. Crash/Boom
        'CRASH300N', 'BOOM900', 'BOOM600', 'CRASH900', 'CRASH600', 'CRASH50', 'BOOM50', 'BOOM300N', 'CRASH500', 'CRASH1000', 'BOOM500', 'BOOM1000', 'BOOM150N', 'CRASH150N',
        // 4. Forex
        'frxAUDJPY', 'frxAUDUSD', 'frxEURAUD', 'frxEURCAD', 'frxEURCHF', 'frxEURGBP', 'frxEURJPY', 'frxEURUSD', 'frxGBPJPY', 'frxGBPUSD', 'frxUSDCAD', 'frxUSDCHF', 'frxUSDJPY', 'frxGBPAUD',
        // 5. Criptomoedas
        'cryBTCUSD', 'cryETHUSD'
      ];

      // Remove the weekend filter completely exactly as requested so we always analyze everything.
      const assetsToAnalyze = ALL_ASSETS;

      const timeframes = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'];
      
      for (const asset of assetsToAnalyze) {
        if (isCancelled) {
          console.log("AutoPilot desligado. Abortando ciclo em andamento imediatamente...");
          break;
        }

        try {
          // 1. Fetch MTF Data
          const mtfData: Record<string, any[]> = {};
          let hasData = true;
          for (const tf of timeframes) {
            if (isCancelled) break;
            const res = await fetch(`/api/price-history?symbol=${asset}&timeframe=${tf}&limit=100`);
            if (!res.ok) {
              hasData = false;
              break;
            }
            mtfData[tf] = await res.json();
          }
          
          if (isCancelled || !hasData) continue;

          // 2. Get current balance
          const currentBalance = isDemoMode ? demoBalanceRef.current : realBalanceRef.current;

          // 3. Send to AI
          const socket = io();
          socket.emit('telegram_notify', { 
            text: `🧠 <b>IA Analisando Mercado</b>\n\n📈 <b>Ativo:</b> ${asset}\n🔍 <b>Processando 6 Passos Cognitivos...</b>` 
          });

          const prevWait = lastWaitReasoningRef.current[asset];
          const previousWaitReasoning = prevWait && Date.now() - prevWait.timestamp < 1000 * 60 * 15 ? prevWait.reasoning : undefined;

          const aiResult = await smcAgent.executeAIAgentAnalysisWithShiftDown(
            asset, 
            mtfData, 
            currentBalance, 
            activeIndicators, 
            isDemoMode,
            {
              riskEntryType,
              capitalRiskPct,
              useMartingale,
              maxConcurrentTrades
            },
            previousWaitReasoning,
            (msg) => {
               socket.emit('telegram_notify', { 
                 text: `🔄 <b>Shift-Down</b>\n\n📈 <b>Ativo:</b> ${asset}\n🔍 ${msg}`
               });
            },
            () => isCancelled,
            (plan) => saveBattlePlanHelper(plan, asset)
          );
          
          if (isCancelled) {
            socket.disconnect();
            break;
          }

          const actionRaw = aiResult?.decision?.action ? String(aiResult.decision.action).toUpperCase().trim() : 'WAIT';

          if (aiResult && aiResult.decision && (actionRaw === 'BUY' || actionRaw === 'SELL')) {
            // 4. Execute if APPROVED
            const signal = {
              id: `sig-${Date.now()}`,
              asset,
              type: aiResult.decision.action,
              tradeType: aiResult.alignment?.tradeType || 'SCALP',
              anchorTimeframe: aiResult.alignment?.anchorTimeframe || '5m',
              entryTimeframe: aiResult.alignment?.triggerTimeframe || '1m',
              confidence: 95,
              reasoning: aiResult.decision.reasoning,
              timestamp: new Date().toISOString(),
              status: 'PENDING' as const,
              entryPrice: aiResult.decision.entryPrice || mtfData['1m'][mtfData['1m'].length - 1].close,
              stopLoss: aiResult.decision.stopLoss,
              takeProfit: aiResult.decision.takeProfit,
              positionSize: Number(aiResult.riskManagement?.recommendedStake || aiResult.riskManagement?.calculatedLot || 10),
              riskRewardRatio: 3,
              checklist: {
                fundamental: true,
                smcContext: true,
                elliottWave: true,
                anchorAlignment: aiResult.alignment?.isAligned || true,
                triggerPattern: true
              },
              cognitive: {
                whatHappened: aiResult.analysis?.fundamental,
                whatIsHappening: aiResult.analysis?.priceAction,
                whatCouldHappen: aiResult.analysis?.elliottWave,
                blindSpots: aiResult.analysis?.smcZones
              },
              contingency: {
                strategyA: aiResult.plans?.planA,
                strategyB: aiResult.plans?.planB,
                strategyC: aiResult.plans?.planC
              }
            };

            setSignals(prev => [signal, ...prev].slice(0, 10));
            
            // Create and save Battle Plan for AutoPilot
            const newPlan: BattlePlan = {
              id: `plan-${Date.now()}`,
              asset,
              createdAt: new Date().toISOString(),
              status: 'ACTIVE',
              alertZones: aiResult.alertZones || [],
              strategy: { 
                description: aiResult.plans?.planA || "Estratégia Principal", 
                expectedAction: aiResult.decision.action as 'BUY' | 'SELL', 
                conditions: [] 
              },
              counterStrategy: { 
                description: aiResult.plans?.planB || "Contra-estratégia", 
                expectedAction: aiResult.decision.action === 'BUY' ? 'SELL' : 'BUY', 
                conditions: [] 
              },
              counterCounterStrategy: { 
                description: aiResult.plans?.planC || "Adaptação final", 
                expectedAction: aiResult.decision.action as 'BUY' | 'SELL', 
                conditions: [] 
              },
              timeframe: aiResult.alignment?.triggerTimeframe || '1m',
              tradeType: aiResult.alignment?.tradeType || 'SCALP'
            };

            setBattlePlans(prev => {
              const updated = [newPlan, ...prev].slice(0, 20);
              fetch('/api/battle-plans', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ plans: updated })
              }).catch(console.error);
              return updated;
            });
            
            socket.emit('telegram_notify', { 
              text: `🎯 <b>Sinal Aprovado pela IA!</b>\n\n📈 <b>Ativo:</b> ${signal.asset}\n🛒 <b>Ação:</b> ${signal.type}\n⏱️ <b>Tipo:</b> ${signal.tradeType}\n💰 <b>Lote:</b> ${signal.positionSize}\n\n📝 <b>Motivo:</b> ${signal.reasoning}` 
            });

            handleExecute(signal);
          } else if (aiResult && aiResult.decision && actionRaw !== 'BUY' && actionRaw !== 'SELL') {
            lastWaitReasoningRef.current[asset] = { reasoning: aiResult.decision.reasoning, timestamp: Date.now() };

            socket.emit('telegram_notify', { 
              text: `⏳ <b>IA em Espera (AutoPilot)</b>\n\n📈 <b>Ativo:</b> ${asset}\n\n📝 <b>Motivo:</b> ${aiResult.decision.reasoning}\n\n🗺️ <b>Plano de Batalha:</b>\n<b>Plano A:</b> ${aiResult.plans?.planA || 'N/A'}\n<b>Plano B:</b> ${aiResult.plans?.planB || 'N/A'}\n<b>Plano C:</b> ${aiResult.plans?.planC || 'N/A'}` 
            });
          }
          
          socket.disconnect();
        } catch (error: any) {
          if (error.message && !error.message.includes('Failed to fetch')) {
            console.error(`AutoPilot error for ${asset}:`, error);
          }
        }
        
        // Add a 15-second delay between assets to prevent AI rate limiting (429)
        if (!isCancelled) {
          await new Promise<void>(resolve => {
            sleepTimeout = setTimeout(resolve, 15000);
          });
        }
      }
    };

    // Run every 5 minutes
    autoPilotInterval = setInterval(runAutoPilotCycle, 5 * 60 * 1000);
    
    // Run once immediately if turned on
    runAutoPilotCycle();

    return () => {
      isCancelled = true;
      if (autoPilotInterval) clearInterval(autoPilotInterval);
      if (sleepTimeout) clearTimeout(sleepTimeout);
    };
  }, [isAutoPilot, isDemoMode]);

  // BattlePlan / SMC Traps Monitor
  useEffect(() => {
    if (!isAutoPilot || battlePlans.length === 0) return;
    
    // Create map of active plans with alert zones
    const plansToMonitor = battlePlans.filter(bp => bp.status === 'ACTIVE' && bp.alertZones && bp.alertZones.length > 0);
    if (plansToMonitor.length === 0) return;

    const checkZones = (data: any) => {
      const price = Number(data.price);
      if (isNaN(price)) return;
      
      for (const bp of plansToMonitor) {
        if (bp.asset !== data.symbol) continue;
        
        // Cooldown: limit triggers for same plan to once per 5 minutes
        const now = Date.now();
        if (bp.lastTriggeredAt && now - bp.lastTriggeredAt < 1000 * 60 * 5) return; 

        for (const zone of bp.alertZones) {
          if (price >= zone.minPrice && price <= zone.maxPrice) {
            console.log(`🚨 ARMADILHA (TRAP) DO AUTOPILOT DISPARADA! ${bp.asset} a ${price} entrou na zona ${zone.name}`);
            
            // Send telegram alert
            const socket = io();
            socket.emit('telegram_notify', { 
              text: `🚨 <b>ARMADILHA ATIVADA!</b>\n\n📈 <b>Ativo:</b> ${bp.asset}\n💲 <b>Preço:</b> ${price}\n🎯 <b>Zona:</b> ${zone.name}\n\n🔍 Iniciando análise cognitiva de impacto imediata (AutoPilot)...` 
            });

            // Trigger AI analysis directly
            handleAnalyze(bp.asset, bp.timeframe || '1m').then(() => {
               socket.emit('telegram_notify', { 
                  text: `✅ <b>Análise de Armadilha Concluída</b> para ${bp.asset}. Verifique a Sala de Sinais.` 
               });
            }).catch(err => console.error("Trap AI analysis failed:", err));

            // Mark plan locally and update state to apply cooldown
            bp.lastTriggeredAt = now;
            setBattlePlans(prev => prev.map(p => p.id === bp.id ? { ...p, lastTriggeredAt: now } : p));
            break;
          }
        }
      }
    };

    const socket = io();
    socket.on('quote', checkZones);
    return () => {
      socket.off('quote', checkZones);
    };
  }, [battlePlans, isAutoPilot, handleAnalyze]);

  // Outcome Checker
  useEffect(() => {
    const checkOutcomes = async () => {
      const pendingSignals = signals.filter(s => s.status === 'PENDING');
      if (pendingSignals.length === 0) return;

      for (const signal of pendingSignals) {
        try {
          const response = await fetch(`/api/price-history?symbol=${signal.asset}&timeframe=1m&limit=1`);
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          
          const contentType = response.headers.get("content-type");
          if (contentType && contentType.indexOf("application/json") === -1) {
            throw new Error(`Expected JSON but received ${contentType}`);
          }

          const data = await response.json();
          if (!data || data.length === 0) {
             throw new Error("No data returned from price-history API");
          }
          const currentPrice = data[0].close;

          if (signal.type === 'BUY') {
            if (currentPrice >= signal.takeProfit!) {
              closeAndLog(signal, currentPrice, 'SUCCESS');
            } else if (currentPrice <= signal.stopLoss!) {
              closeAndLog(signal, currentPrice, 'FAILURE');
            }
          } else if (signal.type === 'SELL') {
            if (currentPrice <= signal.takeProfit!) {
              closeAndLog(signal, currentPrice, 'SUCCESS');
            } else if (currentPrice >= signal.stopLoss!) {
              closeAndLog(signal, currentPrice, 'FAILURE');
            }
          }
        } catch (e: any) {
          if (e.message && e.message.includes('Failed to fetch')) {
            console.warn("Network error during outcome check (possibly adblocker or server restarting). Retrying later.");
          } else {
            console.error("Outcome check failed", e);
          }
        }
      }
    };
    
    const closeAndLog = async (signal: TradingSignal, currentPrice: number, status: 'SUCCESS'|'FAILURE') => {
      // 1. Discover the contract_id corresponding to this signal from pendingStrategies
      let contractIdToClose = undefined;
      for (const [cId, strategy] of Object.entries(pendingStrategies)) {
        if ((strategy as any).signal.id === signal.id) {
          contractIdToClose = Number(cId);
          break;
        }
      }
      
      if (contractIdToClose) {
        if (unsellableContractsRef.current.has(contractIdToClose)) {
          console.log(`AutoPilot aguardando expiração nativa para ${contractIdToClose} (venda não permitida pela corretora)...`);
          return; // Wait for it to expire natively and show up in profitTable
        }
        
        try {
          // Attempt to close FIRST
          const response = await fetch('/api/close-trade', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contractId: contractIdToClose })
          });
          const data = await response.json();
          
          if (response.ok && !data.error) {
            window.dispatchEvent(new CustomEvent('agent-log', { 
                detail: { message: `Alvo atingido (${status}) para ${signal.asset}. Posição #${contractIdToClose} FECHADA AUTOMATICAMENTE (AutoPilot).`, type: 'success' } 
            }));
            fetchOpenPositions();
            // Upate state now that it is closed
            updateSignalStatus(signal.id, status, currentPrice);
          } else {
            const errMsg = data.error?.message || data.error || 'Unknown error';
            if (errMsg.includes('Resale of this contract is not offered')) {
              unsellableContractsRef.current.add(contractIdToClose);
              console.log(`Deriv bloqueou permanentemente a venda de ${contractIdToClose}. Aguardando expiração nativa.`);
            } else if (errMsg.includes('Contract cannot be sold at this time')) {
              console.log(`AutoPilot aguardando liberação da Deriv para fechar ${contractIdToClose} (${errMsg})...`);
            } else {
              // Failed for another reason, give up trying to close
              updateSignalStatus(signal.id, 'FAILURE', currentPrice);
            }
          }
        } catch (err) {
          console.error("AutoPilot failed to close trade on Deriv:", err);
        }
      } else {
         // Manual or simulated trade without tracked pending strategy, update directly
         updateSignalStatus(signal.id, status, currentPrice);
      }
    };

    const interval = setInterval(checkOutcomes, 3000); // Check faster, every 3 seconds
    return () => clearInterval(interval);
  }, [signals, pendingStrategies]);

  const updateSignalStatus = async (id: string, status: 'SUCCESS' | 'FAILURE', exitPrice: number) => {
    setSignals(prev => prev.map(s => s.id === id ? { 
      ...s, 
      status, 
      exitPrice, 
      closedAt: new Date().toISOString() 
    } : s));

    const signal = signals.find(s => s.id === id);
    if (signal) {
      // Auto-Training: Save to memory for learning
      await memory.saveSetup({
        ...signal,
        outcome: status,
        exitPrice,
        closedAt: new Date().toISOString()
      });
      
      // Metacognition: Generate a lesson learned
      try {
        const prompt = `
          O trade ${signal.id} no ativo ${signal.asset} (${signal.type}) foi finalizado com resultado: ${status}.
          Preço de entrada: ${signal.entryPrice}. Preço de saída: ${exitPrice}.
          Raciocínio original: ${signal.reasoning}.

          Você deve analisar essa operação friamente e responder através do seguinte processo de pesquisa e investigação:
          
          1- o que disse o analise fundamentalista sobre este ativo ? eu considerei ou desconsiderei ?
          2- O que diz as teorias de ondas de Elliott ? que zona eu entrei ? e o que acontece quando o preço atinge Nessa zona ou fase ? o que eu esperava quando eu entrei ? acertei ou errei ? violei a regra ou respeitei a regra?
          3- o que diz o SMC sobre isso? que zona eu entrei ? e o que acontece quando o preço atinge Nessa zona ou esta fase? o que eu esperava quando eu entrei ? acertei ou errei ? violei a regra ou respeitei a regra?
          4- de acordo com o price action que é parte da pscologia do mercado o que ele diz? o que ele faz quando zona eu entrei ? e o que acontece quando o preço atinge Nessa zona Como os comprador ou vendedores se comportam? o que eu esperava quando eu entrei ? acertei ou errei ? violei a regra ou respeitei a regra?
          5- qual foi o padrao candlestick que foi o meu gatilho? que zona eu entrei ? qual foi a pscologia por traz desse padrao candlestick? e o que acontece quando o preço atinge a zona que entrei e forma esse padrao ? o que eu esperava quando eu entrei ? acertei ou errei ? violei a regra ou respeitei a regra?
          6- houve um alinhamento especifico entre o grafico de gatilho e grafico ancora ou o grafico ancora estava em uma tendencia e formou o candle de correçao e eu operei o candle de correçao?
          
          Depois de responder essas 6 perguntas, analise por que você ganhou ou perdeu, gere os resultados dessas respostas, e tire uma lição e conclusão.
          Se errou, tire a lição: explique onde falhou. Se é para melhorar adote o comportamento aceitavel ensinando qual pesquisa semântica em banco de dados, livros ou PDFs deve ser lembrada ou o que pesquisar na internet.
          Se ganhou, extraia as coordenadas exatas da zona e do evento para memória episódica, para que o sistema possa consolidar essa memória a longo prazo e repetir a ação nesse mesmo evento.
          
          Responda a esta análise completa consolidando estas informações.
        `;
        const lesson = await chatService.generateSilentAnalysis(prompt, { asset: signal.asset, exitPrice });
        
        // Memory Consolidation & Storage
        if (status === 'SUCCESS') {
          // Episodic Long-Term Memory
          await memory.saveEpisodicMemory({
            asset: signal.asset,
            type: signal.type,
            coordinates: {
              entryPrice: signal.entryPrice,
              exitPrice,
              reasoning: signal.reasoning,
              timeframe: signal.entryTimeframe,
              triggerPattern: signal.checklist?.triggerPattern
            },
            eventContext: lesson,
            timestamp: new Date().toISOString()
          });
        } else {
          // Semantic Long-Term Memory (Lessons, Rules to remember)
          await memory.saveSemanticMemory({
            asset: signal.asset,
            concept: "Correção de Erro e Melhoria Contínua",
            lessonLearned: lesson,
            timestamp: new Date().toISOString()
          });
          
          // Trigger Semantic Web Search internally if instructed by the LLM
          if (lesson.toLowerCase().includes('pesquisar:')) {
            const searchQuery = lesson.split('pesquisar:')[1].trim().split('.')[0];
            window.dispatchEvent(new CustomEvent('agent-log', {
              detail: { message: `Pesquisa Semântica na Internet acionada: ${searchQuery}`, type: 'warning' }
            }));
            
            // Execute actual web search and store as knowledge
            const searchResult = await memory.searchInternet(searchQuery);
            window.dispatchEvent(new CustomEvent('agent-log', {
              detail: { message: `Resultados da Pesquisa: ${searchResult.substring(0, 100)}...`, type: 'info' }
            }));
            
            // Save search result to semantic memory/knowledge
            await memory.saveSemanticMemory({
              asset: signal.asset,
              concept: `Pesquisa (Correção): ${searchQuery}`,
              lessonLearned: searchResult,
              timestamp: new Date().toISOString()
            });
          }
        }
        
        // Save lesson to working experience memory
        const currentMemory = await memory.getFullMemory();
        const experience = currentMemory.experience;
        experience.lessonsLearned = experience.lessonsLearned || [];
        experience.lessonsLearned.push(`[${signal.asset}] ${lesson}`);
        experience.lessonsLearned = experience.lessonsLearned.slice(-50); // Keep last 50
        await memory.updateMemoryLayer('experience', experience);
        
        window.dispatchEvent(new CustomEvent('agent-log', { 
          detail: { 
            message: `Lição aprendida: ${lesson}`, 
            type: 'info' 
          } 
        }));
      } catch (e) {
        console.error("Failed to generate metacognitive lesson", e);
      }
      
      window.dispatchEvent(new CustomEvent('agent-log', { 
        detail: { 
          message: `Trade ${id} closed as ${status} at ${exitPrice}. Agent updated its neural weights.`, 
          type: status === 'SUCCESS' ? 'success' : 'error' 
        } 
      }));
    }
  };

  const totalValue = useMemo(() => {
    const total = demoBalance + realBalance;
    return total > 0 ? total : portfolio.reduce((acc, curr) => acc + curr.value, 0);
  }, [portfolio, demoBalance, realBalance]);

  const handleAddKnowledge = async () => {
    if (!knowledgeInput.trim()) return;
    await memory.saveKnowledge("User Rule", knowledgeInput);
    setKnowledgeInput('');
    alert("Knowledge added to agent's brain!");
  };

  const handleDeleteMemoryItem = async (id: string) => {
    try {
      const res = await fetch(`/api/memory/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setMemoryItems(prev => prev.filter(item => item.id !== id));
        toast.success("Regra removida da memória.");
      }
    } catch (e) {
      console.error(e);
      toast.error("Erro ao remover regra.");
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.name.endsWith('.docx')) {
      // Use mammoth to extract text from DOCX
      try {
        const arrayBuffer = await file.arrayBuffer();
        const mammoth = await import('mammoth');
        const result = await mammoth.extractRawText({ arrayBuffer });
        
        // Convert the extracted text to base64 to match the attachment interface
        const textBase64 = btoa(unescape(encodeURIComponent(result.value)));
        
        setChatAttachment({
          file,
          base64: textBase64,
          type: 'text/plain' // Send as plain text to Gemini
        });
      } catch (error) {
        console.error("Error parsing DOCX:", error);
        alert("Erro ao ler o arquivo DOCX. Tente um PDF ou TXT.");
      }
    } else {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64String = (event.target?.result as string).split(',')[1];
        setChatAttachment({
          file,
          base64: base64String,
          type: file.type
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSendMessage = async () => {
    if ((!chatInput.trim() && !chatAttachment) || isChatLoading) return;
    
    const userMsg = chatInput || (chatAttachment ? `Analise este arquivo: ${chatAttachment.file.name}` : '');
    setChatInput('');
    
    const attachmentData = chatAttachment ? {
      data: chatAttachment.base64,
      mimeType: chatAttachment.type,
      name: chatAttachment.file.name
    } : undefined;
    
    setChatAttachment(null);
    
    let displayMsg = userMsg;
    if (attachmentData) {
      displayMsg = `[Arquivo: ${attachmentData.name}] ${userMsg}`;
    }
    
    setChatMessages(prev => [...prev, { role: 'user', content: displayMsg, timestamp: new Date().toISOString() }]);
    setIsChatLoading(true);

    try {
      const currentPrice = marketData[marketData.length - 1]?.price;
      const recentData = marketData.slice(-30); // Send last 30 candles for context
      const reply = await chatService.sendMessage(userMsg, { asset: selectedAsset, price: currentPrice, recentData }, attachmentData);
      
      let finalReply = reply;
      
      // Check for JSON drawings block
      const jsonMatch = reply.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[1]);
          if (parsed.drawings && Array.isArray(parsed.drawings)) {
            setChartDrawings(parsed.drawings);
            // Remove the JSON block from the displayed message
            finalReply = reply.replace(/```json\s*([\s\S]*?)\s*```/, '').trim();
            
            // Switch to chart tab to show the drawings
            setActiveTab('grafico');
            window.dispatchEvent(new CustomEvent('agent-log', { 
              detail: { message: `S.M.A.R.T. AI adicionou desenhos ao gráfico.`, type: 'success' } 
            }));
          }
        } catch (e) {
          console.error("Failed to parse drawings JSON:", e);
        }
      } else {
        // Fallback: Check if AI output raw JSON without markdown
        const rawJsonMatch = reply.match(/\{\s*"drawings"\s*:\s*\[[\s\S]*?\]\s*\}/);
        if (rawJsonMatch) {
          try {
            const parsed = JSON.parse(rawJsonMatch[0]);
            if (parsed.drawings && Array.isArray(parsed.drawings)) {
              setChartDrawings(parsed.drawings);
              finalReply = reply.replace(/\{\s*"drawings"\s*:\s*\[[\s\S]*?\]\s*\}/g, '').trim();
            }
          } catch (e) {
            console.error("Failed to parse raw drawings JSON:", e);
          }
        }
      }
      
      if (!finalReply.trim()) {
        finalReply = "Análise concluída. Verifique o gráfico para ver os detalhes.";
      }

      setChatMessages(prev => [...prev, { role: 'assistant', content: finalReply, timestamp: new Date().toISOString() }]);
      
      // Refresh memory if it was a training message
      if (attachmentData) {
        const updatedMem = await memory.getFullMemory();
        setFullMemory(updatedMem);
      }
    } catch (error: any) {
      console.error("Chat error:", error);
      let errorMsg = "Erro ao processar a mensagem ou arquivo.";
      if (error.message && error.message.includes('xhr error')) {
        errorMsg = "Erro de conexão com a IA. Por favor, desative bloqueadores de anúncios (AdBlock, Brave Shields) ou permita cookies de terceiros.";
      }
      setChatMessages(prev => [...prev, { role: 'assistant', content: errorMsg, timestamp: new Date().toISOString() }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const renderContent = () => {
    const availableIndicators = ['RSI', 'IFR', 'MACD', 'Bollinger Bands', 'EMA 20/50/200', 'Fibonacci', 'Volume Profile', 'Order Blocks (SMC)', 'Fair Value Gaps (SMC)', 'ARV / ATR', 'Oscilador Estocástico'];
    switch (activeTab) {
      case 'bate-papo':
        return (
          <div className="p-8 max-w-7xl mx-auto space-y-6 flex flex-col h-[calc(100vh-4rem)]">
            <div className="flex-1 bg-zinc-900/40 border border-zinc-800/50 rounded-2xl p-6 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-zinc-800/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center">
                    <BrainCircuit className="w-6 h-6 text-emerald-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">S.M.A.R.T. AI</h2>
                    <p className="text-sm text-zinc-400">Assistente de Trading e Estratégia</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 bg-zinc-900/50 border border-zinc-800/50 px-4 py-2 rounded-xl">
                  <span className="text-sm font-bold text-zinc-300">AutoPilot</span>
                  <button 
                    onClick={() => setIsAutoPilot(!isAutoPilot)}
                    className={cn("w-12 h-6 rounded-full transition-colors relative", isAutoPilot ? "bg-emerald-500" : "bg-zinc-700")}
                  >
                    <div className={cn("absolute top-1 w-4 h-4 rounded-full bg-white transition-all", isAutoPilot ? "left-7" : "left-1")} />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2 custom-scrollbar">
                {chatMessages.length === 0 ? (
                  <div className="text-center text-zinc-500 my-10">
                    <BrainCircuit className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p>Olá! Sou o S.M.A.R.T. AI.</p>
                    <p className="text-sm">Vamos discutir estratégias, analisar o mercado ou treinar novas regras de operação.</p>
                  </div>
                ) : (
                  chatMessages.map((msg, idx) => (
                    <div key={idx} className={cn("flex", msg.role === 'user' ? "justify-end" : "justify-start")}>
                      <div className={cn(
                        "max-w-[80%] rounded-2xl p-4",
                        msg.role === 'user' ? "bg-emerald-600 text-white rounded-tr-sm" : "bg-zinc-800 text-zinc-200 rounded-tl-sm"
                      )}>
                        <div className="text-xs opacity-50 mb-1 flex items-center gap-2">
                          {msg.role === 'user' ? <UserCircle className="w-3 h-3" /> : <BrainCircuit className="w-3 h-3" />}
                          {new Date(msg.timestamp).toLocaleTimeString()}
                        </div>
                        <div className="prose prose-invert prose-sm max-w-none">
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  ))
                )}
                {isChatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-zinc-800 text-zinc-200 rounded-2xl rounded-tl-sm p-4 flex items-center gap-2">
                      <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" />
                      <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce delay-75" />
                      <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce delay-150" />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-end gap-2 bg-zinc-950 p-2 rounded-xl border border-zinc-800/50">
                <label className="cursor-pointer p-3 hover:bg-zinc-900 rounded-lg transition-colors text-zinc-400 hover:text-emerald-400">
                  <Paperclip className="w-5 h-5" />
                  <input type="file" className="hidden" accept="image/*,.pdf,.txt" onChange={handleFileSelect} />
                </label>
                
                <div className="flex-1 flex flex-col">
                  {chatAttachment && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-zinc-900 rounded-t-lg text-xs text-zinc-300 border-b border-zinc-800">
                      <FileText className="w-3 h-3 text-emerald-400" />
                      <span className="truncate max-w-[200px]">{chatAttachment.file.name}</span>
                      <button onClick={() => setChatAttachment(null)} className="ml-auto hover:text-red-400">
                        <XCircle className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                  <textarea
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    placeholder="Digite sua mensagem ou instrução para o S.M.A.R.T. AI..."
                    className={cn(
                      "w-full bg-transparent border-none focus:ring-0 resize-none text-sm p-3",
                      chatAttachment ? "rounded-b-lg" : "rounded-lg"
                    )}
                    rows={1}
                  />
                </div>
                
                <button 
                  onClick={handleSendMessage}
                  disabled={isChatLoading || (!chatInput.trim() && !chatAttachment)}
                  className="p-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:hover:bg-emerald-500 text-black rounded-lg transition-colors"
                >
                  <ArrowUpRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        );

      case 'grafico':
        return (
          <div className="p-8 max-w-7xl mx-auto space-y-6">
            {/* Market Watch Ticker */}
            <div className="flex overflow-x-auto bg-[#0A0A0B] border border-zinc-800/50 rounded-2xl px-6 py-3 space-x-8 text-xs whitespace-nowrap hide-scrollbar">
              {Object.entries(quotes).map(([sym, q]: [string, any]) => (
                <div key={sym} className="flex items-center space-x-2">
                  <span className="text-zinc-500 font-medium tracking-wider uppercase">{sym.replace('frx', '').replace('R_', 'Vol ')}</span>
                  <span className={`font-mono font-semibold ${q.color}`}>{q.price ? Number(q.price).toFixed(4) : '-'}</span>
                </div>
              ))}
              {Object.keys(quotes).length === 0 && (
                <div className="text-zinc-600 font-mono animate-pulse">Waiting for live quotes...</div>
              )}
            </div>

            {/* Trading Rápido & Ferramentas */}
            <div className="bg-zinc-900/40 border border-zinc-800/50 p-4 rounded-2xl flex flex-col gap-4">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-2">
                  <div className="flex bg-zinc-800/50 rounded-lg p-1 border border-zinc-700/50">
                    {['1m', '5m', '15m', '30m', '1H', '4H', 'D', 'W'].map(tf => (
                      <button 
                        key={tf}
                        onClick={() => setSelectedTimeframe(tf)}
                        className={cn("px-3 py-1.5 rounded-md text-xs font-bold transition-all", selectedTimeframe === tf ? "bg-emerald-500 text-black" : "text-zinc-400 hover:text-white")}
                      >
                        {tf}
                      </button>
                    ))}
                  </div>
                  <div className="flex bg-zinc-800/50 rounded-lg p-1 border border-zinc-700/50 ml-2">
                    <button onClick={() => setChartType('line')} className={cn("px-3 py-1.5 rounded-md text-xs font-bold transition-all", chartType === 'line' ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-white")}>Linha</button>
                    <button onClick={() => setChartType('candles')} className={cn("px-3 py-1.5 rounded-md text-xs font-bold transition-all", chartType === 'candles' ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-white")}>Candles</button>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <div className="flex items-center bg-zinc-800/50 rounded-lg px-3 py-1.5 border border-zinc-700/50">
                    <span className="text-zinc-400 text-sm mr-2">$</span>
                    <input 
                      type="number" 
                      value={manualStake}
                      onChange={(e) => setManualStake(Number(e.target.value))}
                      className="bg-transparent border-none text-white w-16 text-sm focus:outline-none font-mono"
                      min="1"
                      placeholder="Stake"
                    />
                  </div>
                  <div className="flex items-center bg-zinc-800/50 rounded-lg px-3 py-1.5 border border-zinc-700/50">
                    <span className="text-zinc-400 text-sm mr-2">SL:</span>
                    <input 
                      type="number" 
                      value={manualSL}
                      onChange={(e) => setManualSL(e.target.value)}
                      className="bg-transparent border-none text-white w-20 text-sm focus:outline-none font-mono"
                      placeholder="Auto"
                    />
                  </div>
                  <div className="flex items-center bg-zinc-800/50 rounded-lg px-3 py-1.5 border border-zinc-700/50">
                    <span className="text-zinc-400 text-sm mr-2">TP:</span>
                    <input 
                      type="number" 
                      value={manualTP}
                      onChange={(e) => setManualTP(e.target.value)}
                      className="bg-transparent border-none text-white w-20 text-sm focus:outline-none font-mono"
                      placeholder="Auto"
                    />
                  </div>
                  <button onClick={() => handleManualTrade('BUY')} className="px-6 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-lg text-sm transition-colors">BUY</button>
                  <button onClick={() => handleManualTrade('SELL')} className="px-6 py-2 bg-red-500 hover:bg-red-400 text-white font-bold rounded-lg text-sm transition-colors">SELL</button>
                </div>
              </div>

              {/* Indicadores */}
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-zinc-800/50">
                <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider mr-2">Indicadores:</span>
                {availableIndicators.map(ind => (
                  <button 
                    key={ind}
                    onClick={() => setActiveIndicators(prev => prev.includes(ind) ? prev.filter(i => i !== ind) : [...prev, ind])}
                    className={cn("px-3 py-1 rounded-full text-xs font-bold transition-all border", activeIndicators.includes(ind) ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400" : "bg-zinc-800/30 border-zinc-700/50 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300")}
                  >
                    {ind}
                  </button>
                ))}
              </div>
            </div>

            {activeIndicators.length > 0 && (
              <div className="bg-zinc-900/40 border border-zinc-800/50 p-4 rounded-2xl flex gap-4 overflow-x-auto hide-scrollbar">
                {isAnalyzingIndicators ? (
                  <div className="flex items-center gap-2 text-emerald-400 text-sm font-bold p-2">
                    <RefreshCcw className="w-4 h-4 animate-spin" /> IA Analisando Indicadores...
                  </div>
                ) : (
                  activeIndicators.map(ind => (
                    <div key={ind} className="min-w-[200px] p-3 bg-zinc-950 rounded-xl border border-zinc-800/50">
                      <p className="text-emerald-400 font-bold text-xs mb-1">{ind}</p>
                      <p className="text-zinc-400 text-xs">
                        {indicatorAnalysis[ind] || "Aguardando análise..."}
                      </p>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Main Chart */}
            <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-3xl p-6 relative overflow-hidden group h-[500px]">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h2 className="text-2xl font-bold tracking-tight text-white">{selectedAsset}</h2>
                    <span className="text-emerald-400 text-sm font-bold flex items-center gap-1">
                      <TrendingUp className="w-4 h-4" /> Live
                    </span>
                  </div>
                  <p className="text-sm text-zinc-500 font-mono">Timeframe: {selectedTimeframe} | Tipo: {chartType}</p>
                </div>
                <div className="flex items-center gap-4">
                  <button
                    onClick={handleAnalyzeChart}
                    disabled={isAnalyzing}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/50 rounded-xl font-bold transition-all disabled:opacity-50"
                  >
                    {isAnalyzing ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <BrainCircuit className="w-4 h-4" />}
                    Analisar com IA
                  </button>
                  <div className="text-right">
                    <p className="text-3xl font-bold text-white font-mono tracking-tight">
                      ${marketData[marketData.length - 1]?.price ? Number(marketData[marketData.length - 1].price).toFixed(4) : '0.0000'}
                    </p>
                  </div>
                </div>
              </div>
              <div className="h-[350px] w-full relative">
                <ErrorBoundary>
                  <LightweightChart 
                    data={marketData} 
                    chartType={chartType} 
                    indicators={activeIndicators} 
                    drawings={chartDrawings} 
                    alertZones={aiAnalysisResult?.alertZones || battlePlans[0]?.alertZones || []} 
                  />
                </ErrorBoundary>
                
                {aiAnalysisResult && (
                  <div className="absolute top-4 right-4 w-80 bg-zinc-950/90 backdrop-blur-md border border-emerald-500/30 rounded-2xl p-4 shadow-2xl z-10">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-emerald-400 font-bold flex items-center gap-2">
                        <BrainCircuit className="w-4 h-4" /> Análise S.M.A.R.T.
                      </h3>
                      <button onClick={() => setAiAnalysisResult(null)} className="text-zinc-500 hover:text-white">
                        <XCircle className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <p className="text-xs text-zinc-500 uppercase tracking-wider font-bold mb-1">Conclusão</p>
                        <p className="text-sm text-zinc-300">{aiAnalysisResult.decision?.reasoning || 'Análise concluída.'}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-zinc-900/50 p-2 rounded-lg">
                          <p className="text-[10px] text-zinc-500 uppercase">Ação</p>
                          <p className={cn("font-bold text-sm", 
                            aiAnalysisResult.decision?.action === 'BUY' ? 'text-emerald-400' : 
                            aiAnalysisResult.decision?.action === 'SELL' ? 'text-red-400' : 'text-amber-400'
                          )}>
                            {aiAnalysisResult.decision?.action || 'WAIT'}
                          </p>
                        </div>
                        <div className="bg-zinc-900/50 p-2 rounded-lg">
                          <p className="text-[10px] text-zinc-500 uppercase">Confiança</p>
                          <p className="font-bold text-sm text-white">{aiAnalysisResult.decision?.confidence || 0}%</p>
                        </div>
                      </div>
                      {aiAnalysisResult.decision?.action !== 'WAIT' && (
                        <div className="bg-zinc-900/50 p-2 rounded-lg">
                          <p className="text-[10px] text-zinc-500 uppercase mb-1">Zonas de Entrada</p>
                          <div className="flex justify-between text-xs font-mono">
                            <span className="text-emerald-400">TP: {aiAnalysisResult.decision?.takeProfit ? Number(aiAnalysisResult.decision.takeProfit).toFixed(4) : '-'}</span>
                            <span className="text-red-400">SL: {aiAnalysisResult.decision?.stopLoss ? Number(aiAnalysisResult.decision.stopLoss).toFixed(4) : '-'}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );

      case 'mercado':
        const filteredCategories = MARKET_CATEGORIES.map(cat => ({
          ...cat,
          assets: cat.assets.filter(asset => 
            asset.toLowerCase().includes(marketSearch.toLowerCase()) || 
            asset.replace('frx', '').replace('cry', '').toLowerCase().includes(marketSearch.toLowerCase())
          )
        })).filter(cat => cat.assets.length > 0);

        return (
          <div className="p-8 max-w-7xl mx-auto space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <h2 className="text-2xl font-bold text-white flex items-center gap-3"><Globe className="text-emerald-400" /> Mercado e Cotações</h2>
              <div className="relative w-full md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input 
                  type="text" 
                  placeholder="Buscar ativo..." 
                  value={marketSearch}
                  onChange={(e) => setMarketSearch(e.target.value)}
                  className="w-full bg-zinc-900/50 border border-zinc-800 text-white rounded-xl pl-10 pr-4 py-2 focus:outline-none focus:border-emerald-500/50 transition-colors"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredCategories.map(cat => (
                <div key={cat.name} className="bg-zinc-900/40 border border-zinc-800/50 rounded-2xl p-6">
                  <h3 className="text-lg font-bold text-zinc-300 mb-4">{cat.name}</h3>
                  <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar pr-2">
                    {cat.assets.map(asset => (
                      <div 
                        key={asset} 
                        onClick={() => { setSelectedAsset(asset); setActiveTab('grafico'); }}
                        className="flex items-center justify-between p-3 rounded-xl hover:bg-zinc-800/50 cursor-pointer transition-colors group"
                      >
                        <span className="font-bold text-white group-hover:text-emerald-400 transition-colors">{asset.replace('frx', '').replace('cry', '')}</span>
                        <span className="text-zinc-500 text-sm flex items-center gap-2">
                          {quotes[asset] ? <PriceDisplay price={quotes[asset].price} isClosed={quotes[asset].isClosed} /> : 'Carregando...'}
                          {!quotes[asset]?.isClosed && <ArrowUpRight className="w-4 h-4 opacity-0 group-hover:opacity-100 text-emerald-400 transition-opacity" />}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      case 'operacao':
        return (
          <div className="p-8 max-w-7xl mx-auto space-y-8">
            <h2 className="text-2xl font-bold text-white flex items-center gap-3"><Wallet className="text-emerald-400" /> Operação e Balanço</h2>
            
            <div className="grid grid-cols-2 gap-6">
              <div className="bg-emerald-500/10 border border-emerald-500/30 p-6 rounded-2xl">
                <p className="text-sm text-emerald-400/80 font-bold uppercase tracking-wider mb-2">Conta Real</p>
                <p className="text-4xl font-bold text-emerald-400">${realBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
              <div className="bg-blue-500/10 border border-blue-500/30 p-6 rounded-2xl">
                <p className="text-sm text-blue-400/80 font-bold uppercase tracking-wider mb-2">Conta Demo</p>
                <p className="text-4xl font-bold text-blue-400">${demoBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
            </div>

            {/* Open Positions */}
            <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-3xl overflow-hidden">
              <div className="p-6 border-b border-zinc-800/50 flex justify-between items-center">
                <h3 className="font-bold text-white">Posições Abertas</h3>
                <button onClick={fetchOpenPositions} className="text-xs text-zinc-500 hover:text-emerald-400 flex items-center gap-1 transition-colors"><RefreshCcw className="w-3 h-3" /> Refresh</button>
              </div>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold border-b border-zinc-800/50">
                    <th className="px-6 py-4">Ativo</th>
                    <th className="px-6 py-4">Tipo</th>
                    <th className="px-6 py-4">Preço Entrada</th>
                    <th className="px-6 py-4">Valor Atual</th>
                    <th className="px-6 py-4 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {openPositions.length === 0 ? (
                    <tr><td colSpan={5} className="px-6 py-8 text-center text-zinc-500">Nenhuma operação aberta.</td></tr>
                  ) : openPositions.map((pos) => {
                    const currentQuote = quotes[pos.symbol]?.price;
                    const isClosed = quotes[pos.symbol]?.isClosed;
                    const isWinning = (pos.bid_price || 0) > pos.buy_price;
                    
                    return (
                    <tr key={pos.contract_id} className="border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors">
                      <td className="px-6 py-4 font-bold text-white">{pos.symbol}</td>
                      <td className="px-6 py-4 font-mono text-zinc-300">{pos.contract_type}</td>
                      <td className="px-6 py-4 font-mono font-bold text-white">${pos.buy_price}</td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className={cn("flex items-center gap-1 font-bold text-xs transition-colors duration-300", isWinning ? "text-emerald-400" : "text-rose-400", "animate-pulse")}>
                            {isWinning ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                            ${pos.bid_price || pos.buy_price}
                          </span>
                          {isClosed ? (
                            <span className="text-[10px] font-mono mt-1 text-zinc-500">
                              Mercado Fechado
                            </span>
                          ) : currentQuote ? (
                            <span className={cn("text-[10px] font-mono mt-1 transition-colors duration-300", quotes[pos.symbol]?.color)}>
                              Mercado: {currentQuote}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button 
                          onClick={() => handleClosePosition(pos.contract_id)} 
                          disabled={pos.is_valid_to_sell === 0}
                          className={cn(
                            "px-3 py-1 rounded-lg text-xs font-bold transition-all text-white",
                            pos.is_valid_to_sell === 0 ? "bg-zinc-800/50 cursor-not-allowed text-zinc-500" : "bg-zinc-800 hover:bg-zinc-700"
                          )}
                        >
                          {pos.is_valid_to_sell === 0 ? 'Bloqueado' : 'Fechar'}
                        </button>
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>

            {/* History */}
            <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-3xl overflow-hidden">
              <div className="p-6 border-b border-zinc-800/50 flex justify-between items-center">
                <h3 className="font-bold text-white">Histórico (Últimas 50)</h3>
                <button onClick={fetchProfitTable} className="text-xs text-zinc-500 hover:text-emerald-400 flex items-center gap-1 transition-colors"><RefreshCcw className="w-3 h-3" /> Refresh</button>
              </div>
              <div className="max-h-[400px] overflow-y-auto hide-scrollbar">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold border-b border-zinc-800/50 sticky top-0 bg-[#0A0A0B]">
                      <th className="px-6 py-4">Data</th>
                      <th className="px-6 py-4">Ativo</th>
                      <th className="px-6 py-4 text-right">Lucro/Perda</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm">
                    {profitTable.length === 0 ? (
                      <tr><td colSpan={3} className="px-6 py-8 text-center text-zinc-500">Nenhum histórico encontrado.</td></tr>
                    ) : profitTable.map((tx: any) => {
                      const profit = tx.sell_price - tx.buy_price;
                      return (
                        <tr key={tx.contract_id} className="border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors">
                          <td className="px-6 py-4 text-zinc-400 text-xs">{new Date(tx.purchase_time * 1000).toLocaleString()}</td>
                          <td className="px-6 py-4 font-bold text-white">{tx.shortcode.split('_')[1] || 'Ativo'}</td>
                          <td className="px-6 py-4 text-right">
                            <span className={cn("font-bold", profit > 0 ? "text-emerald-400" : "text-rose-400")}>
                              {profit > 0 ? '+' : ''}{profit.toFixed(2)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );

      case 'indicadores':
        return (
          <div className="p-8 max-w-7xl mx-auto space-y-8">
            <h2 className="text-2xl font-bold text-white flex items-center gap-3"><Activity className="text-emerald-400" /> Indicadores & IA</h2>
            <p className="text-zinc-400">Selecione os indicadores que deseja aplicar ao gráfico. A IA interpretará os dados em tempo real.</p>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {availableIndicators.map(ind => (
                <div 
                  key={ind}
                  onClick={() => setActiveIndicators(prev => prev.includes(ind) ? prev.filter(i => i !== ind) : [...prev, ind])}
                  className={cn("p-4 rounded-xl border cursor-pointer transition-all flex items-center justify-between", activeIndicators.includes(ind) ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-400" : "bg-zinc-900/40 border-zinc-800/50 text-zinc-400 hover:border-zinc-700")}
                >
                  <span className="font-bold text-sm">{ind}</span>
                  {activeIndicators.includes(ind) && <CheckCircle2 className="w-4 h-4" />}
                </div>
              ))}
            </div>

            {activeIndicators.length > 0 && (
              <div className="bg-zinc-900/40 border border-zinc-800/50 p-6 rounded-2xl mt-8">
                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><BrainCircuit className="text-emerald-400 w-5 h-5" /> Interpretação da IA</h3>
                <div className="space-y-4">
                  {isAnalyzingIndicators ? (
                    <div className="flex items-center gap-2 text-emerald-400 text-sm font-bold p-4">
                      <RefreshCcw className="w-4 h-4 animate-spin" /> IA Analisando Indicadores...
                    </div>
                  ) : (
                    activeIndicators.map(ind => (
                      <div key={ind} className="p-4 bg-zinc-950 rounded-xl border border-zinc-800/50">
                        <p className="text-emerald-400 font-bold text-sm mb-2">{ind}</p>
                        <p className="text-zinc-400 text-sm">
                          {indicatorAnalysis[ind] || "Aguardando análise..."}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        );

      case 'sinais':
        return (
          <div className="p-8 max-w-7xl mx-auto space-y-8">
            <h2 className="text-2xl font-bold text-white flex items-center gap-3"><Radio className="text-emerald-400" /> Sala de Sinais (AutoPilot)</h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-8">
                <div>
                  <h3 className="font-bold text-zinc-300 mb-4 flex items-center gap-2"><Layers className="w-5 h-5 text-blue-400" /> Planos de Batalha Ativos</h3>
                  {battlePlans.filter(bp => bp.status === 'ACTIVE').length === 0 ? (
                    <div className="p-6 text-center text-zinc-500 bg-zinc-900/40 rounded-2xl border border-zinc-800/50 text-sm">Nenhum plano de batalha ativo no momento.</div>
                  ) : (
                    <div className="grid gap-4">
                      {battlePlans.filter(bp => bp.status === 'ACTIVE').map(bp => (
                        <div key={bp.id} className="bg-zinc-900/40 border border-blue-500/30 p-5 rounded-2xl">
                          <div className="flex justify-between items-start mb-3">
                            <h4 className="font-bold text-white text-lg">{bp.asset}</h4>
                            <span className="px-2 py-1 bg-blue-500/10 text-blue-400 rounded text-xs font-bold uppercase tracking-wider">Monitorando</span>
                          </div>
                          <div className="space-y-3">
                            <div>
                              <p className="text-xs text-zinc-500 uppercase font-bold mb-1">Zonas de Alerta ({bp.alertZones?.length || 0})</p>
                              <div className="flex flex-wrap gap-2">
                                {bp.alertZones?.map((z: any, i: number) => (
                                  <span key={i} className="text-xs font-mono bg-zinc-800 px-2 py-1 rounded text-zinc-300">
                                    {z.type}: {z.minPrice ? Number(z.minPrice).toFixed(4) : '-'} a {z.maxPrice ? Number(z.maxPrice).toFixed(4) : '-'}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800/50">
                                <p className="text-xs text-emerald-400 font-bold mb-1">Plano A (Estratégia)</p>
                                <p className="text-xs text-zinc-400">{bp.strategy?.description}</p>
                              </div>
                              <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800/50">
                                <p className="text-xs text-amber-400 font-bold mb-1">Plano B (Contra-Estratégia)</p>
                                <p className="text-xs text-zinc-400">{bp.counterStrategy?.description}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <h3 className="font-bold text-zinc-300 mb-4 flex items-center gap-2"><Zap className="w-5 h-5 text-emerald-400" /> Sinais Executados</h3>
                  {signals.length === 0 ? (
                    <div className="p-8 text-center text-zinc-500 bg-zinc-900/40 rounded-2xl border border-zinc-800/50">Nenhum sinal gerado ainda. Ative o AutoPilot.</div>
                  ) : signals.map((sig, i) => (
                    <div key={i} className="bg-zinc-900/40 border border-zinc-800/50 p-5 rounded-2xl flex items-start gap-4 mb-4">
                      <div className={cn("p-3 rounded-xl shrink-0", sig.type === 'BUY' ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400")}>
                        {sig.type === 'BUY' ? <TrendingUp className="w-6 h-6" /> : <TrendingDown className="w-6 h-6" />}
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <h4 className="font-bold text-white text-lg">{sig.asset} <span className={cn("text-sm ml-2", sig.type === 'BUY' ? "text-emerald-400" : "text-rose-400")}>{sig.type}</span></h4>
                            <p className="text-xs text-zinc-500 font-mono">{new Date(sig.timestamp).toLocaleString()}</p>
                          </div>
                          <span className="px-2 py-1 bg-zinc-800 rounded text-xs font-bold text-emerald-400">{sig.confidence}% Confiança</span>
                        </div>
                        <p className="text-sm text-zinc-400 mb-3">{sig.reasoning}</p>
                        <div className="flex flex-wrap gap-4 text-xs font-mono">
                          <span className="text-zinc-500">Entry: <span className="text-white">{sig.entryPrice ? Number(sig.entryPrice).toFixed(4) : 'N/A'}</span></span>
                          <span className="text-zinc-500">SL: <span className="text-rose-400">{sig.stopLoss ? Number(sig.stopLoss).toFixed(4) : 'N/A'}</span></span>
                          <span className="text-zinc-500">TP: <span className="text-emerald-400">{sig.takeProfit ? Number(sig.takeProfit).toFixed(4) : 'N/A'}</span></span>
                          {sig.riskRewardRatio && <span className="text-zinc-500">R/R: <span className="text-blue-400">1:{Number(sig.riskRewardRatio).toFixed(2)}</span></span>}
                          {sig.positionSize && <span className="text-zinc-500">Risco: <span className="text-amber-400">{(Number(sig.positionSize) * 100).toFixed(2)}%</span></span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="font-bold text-zinc-300 mb-4">Log do Agente</h3>
                <div className="bg-[#0A0A0B] border border-zinc-800/50 rounded-2xl p-4 h-[600px]">
                  <Terminal className="h-full" />
                </div>
              </div>
            </div>
          </div>
        );

      case 'corretora':
        return (
          <div className="p-8 max-w-7xl mx-auto space-y-6">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                  <Wallet className="text-emerald-400 w-8 h-8" />
                  Corretora e Agentes
                </h2>
                <p className="text-zinc-400 mt-2">Gerencie sua conta Deriv, depósitos e saques via Agentes de Pagamento.</p>
              </div>
            </div>
            <BrokerDashboard />
          </div>
        );

      case 'controle-dados':
        return (
          <div className="p-8 max-w-7xl mx-auto space-y-6">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                  <Database className="text-emerald-400 w-8 h-8" />
                  Controle de Dados (S.M.A.R.T. AI)
                </h2>
                <p className="text-zinc-400 mt-2">Gerencie o conhecimento, as memórias e o histórico de conversas do agente.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Memória Coletiva */}
              <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-2xl p-6 flex flex-col h-[600px]">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <BrainCircuit className="text-emerald-400" /> 
                    Base de Conhecimento
                  </h3>
                  <div className="px-3 py-1 bg-emerald-500/10 text-emerald-400 rounded-full text-xs font-bold">
                    {memoryItems.length} Regras
                  </div>
                </div>
                
                <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                  {memoryItems.length === 0 ? (
                    <div className="text-center text-zinc-500 my-10">
                      <Database className="w-12 h-12 mx-auto mb-4 opacity-20" />
                      <p>A base de conhecimento está vazia.</p>
                    </div>
                  ) : (
                    memoryItems.map((item, i) => (
                      <div key={item.id || i} className="p-4 rounded-xl bg-zinc-950 border border-zinc-800/50 hover:border-emerald-500/30 transition-colors group relative">
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-sm font-bold text-emerald-400 pr-8">{item.concept}</span>
                          <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider bg-zinc-900 px-2 py-1 rounded">{item.category}</span>
                        </div>
                        <p className="text-sm text-zinc-300 leading-relaxed">{item.actionableRule}</p>
                        {item.id && (
                          <button 
                            onClick={() => handleDeleteMemoryItem(item.id)}
                            className="absolute top-4 right-4 p-1.5 bg-zinc-900 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                            title="Excluir regra"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Histórico de Conversas */}
              <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-2xl p-6 flex flex-col h-[600px]">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <History className="text-emerald-400" /> 
                    Histórico de Conversas
                  </h3>
                  <div className="px-3 py-1 bg-emerald-500/10 text-emerald-400 rounded-full text-xs font-bold">
                    {chatMessages.length} Mensagens
                  </div>
                </div>
                
                <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                  {chatMessages.length === 0 ? (
                    <div className="text-center text-zinc-500 my-10">
                      <History className="w-12 h-12 mx-auto mb-4 opacity-20" />
                      <p>Nenhuma conversa registrada.</p>
                    </div>
                  ) : (
                    chatMessages.map((msg, idx) => (
                      <div key={idx} className="p-4 rounded-xl bg-zinc-950 border border-zinc-800/50">
                        <div className="flex items-center gap-2 mb-2">
                          {msg.role === 'user' ? (
                            <UserCircle className="w-4 h-4 text-zinc-400" />
                          ) : (
                            <BrainCircuit className="w-4 h-4 text-emerald-400" />
                          )}
                          <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                            {msg.role === 'user' ? 'Você' : 'S.M.A.R.T. AI'}
                          </span>
                          <span className="text-[10px] text-zinc-600 font-mono ml-auto">
                            {new Date(msg.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <div className="text-sm text-zinc-300 prose prose-invert prose-sm max-w-none">
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        );

      case 'configuracoes':
        return (
          <div className="p-8 max-w-7xl mx-auto space-y-8">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white flex items-center gap-3"><Settings className="text-emerald-400" /> Configurações do Sistema</h2>
            </div>

            <div className="mb-8">
              <DerivOAuth />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Risk Management */}
              <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-2xl p-6 space-y-6">
                <h3 className="text-lg font-bold text-white flex items-center gap-2"><ShieldCheck className="text-emerald-400" /> Gestão de Capital e Risco</h3>
                
                {tradingMode === 'options' ? (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-zinc-400 mb-3">Tipo de Entrada</label>
                      <div className="grid grid-cols-3 gap-2">
                        {['conservador', 'agressivo', 'adaptativo'].map(type => (
                          <button 
                            key={type}
                            onClick={() => setRiskEntryType(type as any)}
                            className={cn("py-2 rounded-lg text-xs font-bold uppercase transition-all border", riskEntryType === type ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400" : "bg-zinc-800/50 border-zinc-700/50 text-zinc-500 hover:text-zinc-300")}
                          >
                            {type}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-zinc-400 mb-3">Gestão de Capital Diário (%)</label>
                      <div className="grid grid-cols-4 gap-2">
                        {[10, 20, 30, 40].map(pct => (
                          <button 
                            key={pct}
                            onClick={() => setCapitalRiskPct(pct)}
                            className={cn("py-2 rounded-lg text-sm font-bold transition-all border", capitalRiskPct === pct ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400" : "bg-zinc-800/50 border-zinc-700/50 text-zinc-500 hover:text-zinc-300")}
                          >
                            {pct}%
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-zinc-950 rounded-xl border border-zinc-800/50">
                      <div>
                        <p className="font-bold text-white text-sm">Recuperação de Perdas (Martingale)</p>
                        <p className="text-xs text-zinc-500">Dobra o stake após um loss.</p>
                      </div>
                      <button onClick={() => setUseMartingale(!useMartingale)} className={cn("w-12 h-6 rounded-full transition-colors relative", useMartingale ? "bg-rose-500" : "bg-zinc-700")}>
                        <div className={cn("absolute top-1 w-4 h-4 rounded-full bg-white transition-all", useMartingale ? "left-7" : "left-1")} />
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-zinc-400 mb-3">Meta de Lucro Diário (%)</label>
                      <div className="flex items-center bg-zinc-950 rounded-lg px-3 py-2 border border-zinc-800/50">
                        <input 
                          type="number" 
                          value={cfdDailyTargetPct}
                          onChange={(e) => setCfdDailyTargetPct(Number(e.target.value))}
                          className="bg-transparent border-none text-white w-full text-sm focus:outline-none font-mono"
                          min="1"
                        />
                        <span className="text-zinc-500 ml-2">%</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-400 mb-3">Perda Máxima Diária (%)</label>
                      <div className="flex items-center bg-zinc-950 rounded-lg px-3 py-2 border border-zinc-800/50">
                        <input 
                          type="number" 
                          value={cfdMaxDailyLossPct}
                          onChange={(e) => setCfdMaxDailyLossPct(Number(e.target.value))}
                          className="bg-transparent border-none text-white w-full text-sm focus:outline-none font-mono"
                          min="1"
                        />
                        <span className="text-zinc-500 ml-2">%</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-400 mb-3">Risco por Operação (%)</label>
                      <div className="flex items-center bg-zinc-950 rounded-lg px-3 py-2 border border-zinc-800/50">
                        <input 
                          type="number" 
                          value={cfdRiskPerTradePct}
                          onChange={(e) => setCfdRiskPerTradePct(Number(e.target.value))}
                          className="bg-transparent border-none text-white w-full text-sm focus:outline-none font-mono"
                          min="0.1"
                          step="0.1"
                        />
                        <span className="text-zinc-500 ml-2">%</span>
                      </div>
                      <p className="text-xs text-zinc-500 mt-2">O lote será calculado automaticamente baseado neste risco e na distância do Stop Loss.</p>
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-3">Número Máximo de Operações Simultâneas</label>
                  <div className="grid grid-cols-4 gap-2">
                    {[1, 2, 3, 4].map(num => (
                      <button 
                        key={num}
                        onClick={() => setMaxConcurrentTrades(num)}
                        className={cn("py-2 rounded-lg text-sm font-bold transition-all border", maxConcurrentTrades === num ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400" : "bg-zinc-800/50 border-zinc-700/50 text-zinc-500 hover:text-zinc-300")}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Digital Brain (Training) */}
              <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-2xl p-6 space-y-6">
                <h3 className="text-lg font-bold text-white flex items-center gap-2"><BrainCircuit className="text-emerald-400" /> Cérebro Digital (Treinamento)</h3>
                <p className="text-sm text-zinc-400">Faça upload de PDFs, DOCX, imagens ou cole textos com estratégias. O conteúdo será integralmente adicionado à base de conhecimento para consulta futura pelo agente.</p>
                
                <div className="space-y-4">
                  <textarea 
                    value={trainingText}
                    onChange={(e) => setTrainingText(e.target.value)}
                    className="w-full h-24 bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-sm text-zinc-300 focus:outline-none focus:border-emerald-500/50 resize-none"
                    placeholder="Cole aqui o texto com as regras de trading..."
                  />
                  <input 
                    type="file" 
                    accept=".pdf,.txt,.docx,image/*"
                    onChange={(e) => setTrainingFile(e.target.files?.[0] || null)}
                    className="block w-full text-sm text-zinc-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-emerald-500/10 file:text-emerald-400 hover:file:bg-emerald-500/20"
                  />
                  <button 
                    onClick={handleTrainAgent}
                    disabled={isTraining || (!trainingText && !trainingFile)}
                    className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-800 disabled:text-zinc-500 text-black font-bold rounded-xl transition-all flex items-center justify-center gap-2"
                  >
                    {isTraining ? <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" /> : <BrainCircuit className="w-5 h-5" />}
                    {isTraining ? 'Processando Conhecimento...' : 'Treinar Agente'}
                  </button>
                </div>

                <div className="mt-6">
                  <h4 className="font-bold text-sm text-zinc-300 mb-3">Memória Coletiva ({memoryItems.length} regras)</h4>
                  <div className="h-48 overflow-y-auto space-y-2 pr-2 hide-scrollbar">
                    {memoryItems.map((item, i) => (
                      <div key={i} className="p-3 rounded-lg bg-zinc-950 border border-zinc-800/50">
                        <div className="flex justify-between items-start mb-1">
                          <span className="text-xs font-bold text-emerald-400">{item.concept}</span>
                          <span className="text-[10px] text-zinc-600 font-mono">{item.category}</span>
                        </div>
                        <p className="text-xs text-zinc-400 line-clamp-2">{item.actionableRule}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-[#0A0A0B] flex items-center justify-center">
        <div className="text-emerald-500 flex flex-col items-center">
          <Zap className="w-12 h-12 mb-4 animate-pulse" />
          <p className="text-zinc-400 font-medium">Carregando plataforma...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0A0A0B] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-zinc-900/40 border border-zinc-800/50 rounded-2xl p-8 text-center">
          <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Zap className="text-emerald-500 w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">S.M.A.R.T. Broker</h1>
          <p className="text-zinc-400 mb-8">Faça login para acessar sua conta de trading inteligente com IA.</p>
          <button 
            onClick={handleGoogleLogin}
            className="w-full py-3 px-4 bg-white hover:bg-zinc-100 text-black font-bold rounded-xl flex items-center justify-center gap-3 transition-colors"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continuar com Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-zinc-100 font-sans selection:bg-emerald-500/30">
      <Toaster theme="dark" position="bottom-right" />
      {/* Sidebar Navigation */}
      <nav className={cn(
        "fixed left-0 top-0 h-full w-64 border-r border-zinc-800/50 bg-[#0A0A0B] flex flex-col py-8 z-50 transition-transform duration-300",
        isMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex items-center justify-between px-6 mb-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20 shrink-0">
              <Zap className="text-black w-6 h-6 fill-current" />
            </div>
            <span className="font-bold text-lg tracking-tight text-white">S.M.A.R.T. AI</span>
          </div>
          <button onClick={() => setIsMenuOpen(false)} className="text-zinc-400 hover:text-white">
            <XCircle className="w-6 h-6" />
          </button>
        </div>
        
        <div className="flex flex-col gap-2 px-4 text-zinc-400 font-medium overflow-y-auto">
          <button 
            onClick={() => { setActiveTab('bate-papo'); setIsMenuOpen(false); }}
            className={cn("flex items-center gap-3 px-4 py-3 rounded-xl transition-all", activeTab === 'bate-papo' ? "bg-emerald-500/10 text-emerald-400" : "hover:bg-zinc-900 hover:text-zinc-200")}
          >
            <BrainCircuit className="w-5 h-5" />
            Bate-papo (S.M.A.R.T. AI)
          </button>

          <button 
            onClick={() => { setActiveTab('grafico'); setIsMenuOpen(false); }}
            className={cn("flex items-center gap-3 px-4 py-3 rounded-xl transition-all", activeTab === 'grafico' ? "bg-emerald-500/10 text-emerald-400" : "hover:bg-zinc-900 hover:text-zinc-200")}
          >
            <LineChartIcon className="w-5 h-5" />
            Gráfico dos Ativos
          </button>
          
          <button 
            onClick={() => { setActiveTab('mercado'); setIsMenuOpen(false); }}
            className={cn("flex items-center gap-3 px-4 py-3 rounded-xl transition-all", activeTab === 'mercado' ? "bg-emerald-500/10 text-emerald-400" : "hover:bg-zinc-900 hover:text-zinc-200")}
          >
            <Globe className="w-5 h-5" />
            Mercado e Cotações
          </button>

          <button 
            onClick={() => { setActiveTab('operacao'); setIsMenuOpen(false); }}
            className={cn("flex items-center gap-3 px-4 py-3 rounded-xl transition-all", activeTab === 'operacao' ? "bg-emerald-500/10 text-emerald-400" : "hover:bg-zinc-900 hover:text-zinc-200")}
          >
            <Wallet className="w-5 h-5" />
            Operação e Balanço
          </button>

          <button 
            onClick={() => { setActiveTab('indicadores'); setIsMenuOpen(false); }}
            className={cn("flex items-center gap-3 px-4 py-3 rounded-xl transition-all", activeTab === 'indicadores' ? "bg-emerald-500/10 text-emerald-400" : "hover:bg-zinc-900 hover:text-zinc-200")}
          >
            <Activity className="w-5 h-5" />
            Indicadores
          </button>

          <button 
            onClick={() => { setActiveTab('sinais'); setIsMenuOpen(false); }}
            className={cn("flex items-center gap-3 px-4 py-3 rounded-xl transition-all", activeTab === 'sinais' ? "bg-emerald-500/10 text-emerald-400" : "hover:bg-zinc-900 hover:text-zinc-200")}
          >
            <Radio className="w-5 h-5" />
            Sala de Sinais
          </button>

          <button 
            onClick={() => { setActiveTab('corretora'); setIsMenuOpen(false); }}
            className={cn("flex items-center gap-3 px-4 py-3 rounded-xl transition-all", activeTab === 'corretora' ? "bg-emerald-500/10 text-emerald-400" : "hover:bg-zinc-900 hover:text-zinc-200")}
          >
            <Wallet className="w-5 h-5" />
            Corretora e Agentes
          </button>

          <button 
            onClick={() => { setActiveTab('controle-dados'); setIsMenuOpen(false); }}
            className={cn("flex items-center gap-3 px-4 py-3 rounded-xl transition-all", activeTab === 'controle-dados' ? "bg-emerald-500/10 text-emerald-400" : "hover:bg-zinc-900 hover:text-zinc-200")}
          >
            <Database className="w-5 h-5" />
            Controle de Dados
          </button>

          <button 
            onClick={() => { setActiveTab('configuracoes'); setIsMenuOpen(false); }}
            className={cn("flex items-center gap-3 px-4 py-3 rounded-xl transition-all", activeTab === 'configuracoes' ? "bg-emerald-500/10 text-emerald-400" : "hover:bg-zinc-900 hover:text-zinc-200")}
          >
            <Settings className="w-5 h-5" />
            Configurações
          </button>
        </div>
        
        <div className="mt-auto px-6 pt-4 space-y-4">
          <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800/50 flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center font-bold">
                {user?.displayName?.charAt(0) || user?.email?.charAt(0) || 'U'}
              </div>
              <div className="flex-1 overflow-hidden">
                <p className="text-xs font-bold text-white truncate">{user?.displayName || 'Usuário'}</p>
                <p className="text-[10px] text-zinc-500 truncate">{user?.email}</p>
              </div>
            </div>
            <button 
              onClick={() => auth.signOut()}
              className="mt-2 w-full py-2 text-xs font-bold text-zinc-400 hover:text-white bg-zinc-800/50 hover:bg-zinc-700/50 rounded-lg transition-colors"
            >
              Sair (Logout)
            </button>
          </div>
          <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800/50">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-bold text-zinc-300">SISTEMA ONLINE</span>
            </div>
            <p className="text-[10px] text-zinc-500 font-mono">Latência: 12ms</p>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className={cn("min-h-screen flex flex-col transition-all duration-300", isMenuOpen ? "pl-64" : "pl-0")}>
        {/* Header */}
        <header className="h-16 border-b border-zinc-800/50 flex items-center justify-between px-8 sticky top-0 bg-[#0A0A0B]/80 backdrop-blur-md z-40">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="text-zinc-400 hover:text-white mr-2">
              <Menu className="w-6 h-6" />
            </button>
            <h1 className="text-lg font-semibold tracking-tight text-white">
              {activeTab === 'bate-papo' && 'Bate-papo (S.M.A.R.T. AI)'}
              {activeTab === 'grafico' && 'Gráfico dos Ativos'}
              {activeTab === 'mercado' && 'Mercado e Cotações'}
              {activeTab === 'operacao' && 'Operação e Balanço'}
              {activeTab === 'indicadores' && 'Indicadores'}
              {activeTab === 'sinais' && 'Sala de Sinais'}
              {activeTab === 'corretora' && 'Corretora e Agentes'}
              {activeTab === 'controle-dados' && 'Controle de Dados'}
              {activeTab === 'configuracoes' && 'Configurações do Modo AutoPilot'}
            </h1>
            <div className="px-2 py-0.5 rounded bg-zinc-800 text-[10px] font-mono text-zinc-400 uppercase tracking-wider hidden sm:block">v1.0.4 PRO</div>
          </div>
          <div className="flex items-center gap-6">
            <div className="hidden sm:flex items-center gap-2 text-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-zinc-400 font-mono">LIVE FEED</span>
            </div>
            <button 
              onClick={handleTestTrade}
              className="hidden sm:flex items-center gap-2 px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-lg transition-all text-sm"
            >
              <Zap className="w-4 h-4" />
              Test Trade
            </button>
            <button 
              onClick={toggleTradingMode}
              className={`flex items-center gap-2 px-4 py-1.5 font-semibold rounded-lg transition-all text-sm ${tradingMode === 'options' ? 'bg-purple-500 hover:bg-purple-400 text-white' : 'bg-orange-500 hover:bg-orange-400 text-white'}`}
            >
              <Activity className="w-4 h-4" />
              <span className="hidden sm:inline">{tradingMode === 'options' ? 'Opções Binárias' : 'CFDs'}</span>
            </button>
            <button 
              onClick={toggleDemoMode}
              className={`flex items-center gap-2 px-4 py-1.5 font-semibold rounded-lg transition-all text-sm ${isDemoMode ? 'bg-blue-500 hover:bg-blue-400 text-white' : 'bg-emerald-500 hover:bg-emerald-400 text-black'}`}
            >
              <Wallet className="w-4 h-4" />
              <span className="hidden sm:inline">{isDemoMode ? 'Demo Account' : 'Real Account'}</span>
            </button>
          </div>
        </header>

        {renderContent()}
      </main>
    </div>
  );
}
