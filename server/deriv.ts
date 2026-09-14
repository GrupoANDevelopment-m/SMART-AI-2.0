import WebSocket from 'ws';
import { EventEmitter } from 'events';

interface DerivRequest {
  req_id?: number;
  [key: string]: any;
}

export class DerivService extends EventEmitter {
  private ws: WebSocket;
  private reqIdCounter = 1;
  private pendingRequests: Map<number, { resolve: (val: any) => void; reject: (err: any) => void; timeout: NodeJS.Timeout }> = new Map();
  private isConnected = false;
  private connectionPromise: Promise<void> | null = null;
  private authPromise: Promise<void> | null = null;
  private authError: Error | null = null;
  
  // User provided API Tokens
  private realApiToken = process.env.DERIV_REAL_API_TOKEN || 'cd7vaUnaO3mt1ML';
  private demoApiToken = process.env.DERIV_DEMO_API_TOKEN || process.env.DERIV_API_TOKEN || 'WWgiBkswk5weu1u';
  
  // CFD API Tokens
  private cfdRealApiToken = 'za4xIqZoeSnHD0y';
  private cfdDemoApiToken = 'd8FP8CdKmcE03ma';

  private apiToken = this.demoApiToken; // Default to demo
  private isDemo = true;
  private tradingMode: 'options' | 'cfd' = 'options';
  
  private isAuthorized = false;
  private subscribedSymbols = new Set<string>();
  public currentBalance: number = 0;
  public balances: Record<string, any> = {};
  public mt5Accounts: any[] = [];
  public currency: string = 'USD';

  constructor() {
    super();
    this.ws = this.connect();
  }

  public setTradingMode(mode: 'options' | 'cfd') {
    if (this.tradingMode === mode) return;
    this.tradingMode = mode;
    this.updateTokenAndReconnect();
  }

  public setDemoMode(isDemo: boolean) {
    if (this.isDemo === isDemo) return;
    this.isDemo = isDemo;
    this.updateTokenAndReconnect();
  }

  private updateTokenAndReconnect() {
    if (this.tradingMode === 'cfd') {
      this.apiToken = this.isDemo ? this.cfdDemoApiToken : this.cfdRealApiToken;
    } else {
      this.apiToken = this.isDemo ? this.demoApiToken : this.realApiToken;
    }
    
    this.isAuthorized = false;
    this.balances = {};
    this.mt5Accounts = [];
    this.currentBalance = 0;
    
    // Reconnect to authorize with new token
    if (this.ws) {
      this.ws.close();
    }
  }

  private pingInterval: NodeJS.Timeout | null = null;
  private lastMessageTime: number = Date.now();

  private connect(): WebSocket {
    const ws = new WebSocket('wss://ws.binaryws.com/websockets/v3?app_id=36300');

    ws.on('open', () => {
      console.log('Deriv WebSocket connected.');
      this.isConnected = true;
      this.lastMessageTime = Date.now();
      this.authorize();
      
      // Keep connection alive and check heartbeat
      this.pingInterval = setInterval(() => {
        if (this.isConnected) {
          this.ws.send(JSON.stringify({ ping: 1 }));
          
          if (Date.now() - this.lastMessageTime > 45000) {
            console.error('Deriv WebSocket heartbeat timeout. Reconnecting...');
            this.ws.terminate();
          }
        }
      }, 15000);
    });

    ws.on('message', (data: WebSocket.Data) => {
      this.lastMessageTime = Date.now();
      const response = JSON.parse(data.toString());
      
      // Handle tick streams
      if (response.msg_type === 'tick') {
        if (response.error) {
          if (!response.error.message.includes('already subscribed')) {
            const symbol = response.echo_req?.ticks;
            if (response.error.message.includes('presently closed')) {
              // Only log once or just emit to avoid spam
              if (symbol) {
                this.emit('market_closed', symbol);
              }
            } else {
              console.error(`Deriv Tick Error for symbol:`, response.error.message, symbol);
            }
          }
        } else if (response.tick) {
          this.emit('tick', response.tick);
        }
      }

      // Handle balance streams
      if (response.msg_type === 'balance') {
        if (response.error) {
          if (!response.error.message.includes('already subscribed')) {
            console.error('Deriv Balance Error:', response.error.message);
          }
        } else if (response.balance) {
          this.currentBalance = response.balance.balance || 0;
          if (response.balance.loginid) {
            this.balances[response.balance.loginid] = response.balance;
          }
          this.emit('balance', response.balance);
        }
      }

      // Handle open contracts stream
      if (response.msg_type === 'proposal_open_contract') {
        if (response.error) {
          if (!response.error.message.includes('already subscribed')) {
            console.error('Deriv Open Contract Error:', response.error.message);
          }
        } else if (response.proposal_open_contract) {
          this.emit('open_contract', response.proposal_open_contract);
        }
      }

      // Handle MT5 login list
      if (response.msg_type === 'mt5_login_list') {
        this.mt5Accounts = response.mt5_login_list || [];
        this.emit('mt5_accounts', response.mt5_login_list);
      }

      if ('req_id' in response && this.pendingRequests.has(response.req_id)) {
        const { resolve, reject, timeout } = this.pendingRequests.get(response.req_id)!;
        clearTimeout(timeout);
        this.pendingRequests.delete(response.req_id);

        if (response.error) {
          reject(new Error(response.error.message));
        } else {
          resolve(response);
        }
      } else if (!['tick', 'balance', 'mt5_login_list', 'authorize', 'ping', 'proposal_open_contract'].includes(response.msg_type)) {
        console.log('Unhandled Deriv message:', response.msg_type, response.error ? response.error.message : '');
      }
    });

    ws.on('close', () => {
      console.log('Deriv WebSocket disconnected. Reconnecting...');
      this.isConnected = false;
      this.isAuthorized = false;
      if (this.pingInterval) {
        clearInterval(this.pingInterval);
        this.pingInterval = null;
      }
      setTimeout(() => {
        this.ws = this.connect();
      }, 3000);
    });

    ws.on('error', (err) => {
      console.error('Deriv WebSocket error:', err.message);
    });

    return ws;
  }

  private async authorize() {
    this.authError = null;
    this.authPromise = (async () => {
      try {
        console.log('Authorizing with Deriv API...');
        const response = await this.sendRequest({ authorize: this.apiToken }, false);
        if (response.error) {
          throw new Error(response.error.message);
        }
        console.log('Deriv Authorized Successfully for:', response.authorize.email);
        this.isAuthorized = true;
        this.currency = response.authorize.currency || 'USD';
        this.resubscribeTicks();
        
        // Subscribe to balance for each account linked to this token
        if (response.authorize.account_list && Array.isArray(response.authorize.account_list)) {
          response.authorize.account_list.forEach((acc: any) => {
            this.ws.send(JSON.stringify({ balance: 1, account: acc.loginid, subscribe: 1, req_id: this.reqIdCounter++ }));
          });
        } else {
          // Fallback to current account if list is not available
          this.ws.send(JSON.stringify({ balance: 1, subscribe: 1, req_id: this.reqIdCounter++ }));
        }
        
        // Subscribe to all open contracts
        this.ws.send(JSON.stringify({ proposal_open_contract: 1, subscribe: 1, req_id: this.reqIdCounter++ }));
        
        // Fetch MT5 accounts
        this.ws.send(JSON.stringify({ mt5_login_list: 1, req_id: this.reqIdCounter++ }));
      } catch (error: any) {
        console.error('Authorization failed:', error);
        this.isAuthorized = false;
        this.authError = error;
        throw error;
      }
    })();
  }

  private resubscribeTicks() {
    for (const symbol of this.subscribedSymbols) {
      this.ws.send(JSON.stringify({ ticks: symbol, subscribe: 1 }));
    }
  }

  public subscribeTick(symbol: string) {
    if (!this.subscribedSymbols.has(symbol)) {
      console.log(`Subscribing to new symbol: ${symbol}`);
      this.subscribedSymbols.add(symbol);
      if (this.isConnected) {
        this.ws.send(JSON.stringify({ ticks: symbol, subscribe: 1 }));
      }
    } else {
      // If already in set, maybe we need to force resubscribe if it failed previously?
      // For now, just log it.
      // console.log(`Symbol ${symbol} already in subscribed list.`);
    }
  }

  private async ensureConnection(): Promise<void> {
    if (this.isConnected) return;
    
    if (!this.connectionPromise) {
      this.connectionPromise = new Promise((resolve, reject) => {
        const check = setInterval(() => {
          if (this.isConnected) {
            clearInterval(check);
            this.connectionPromise = null;
            resolve();
          }
        }, 100);
        
        setTimeout(() => {
          clearInterval(check);
          this.connectionPromise = null;
          reject(new Error("Timeout connecting to Deriv"));
        }, 10000);
      });
    }
    return this.connectionPromise;
  }

  private async ensureAuthorized(): Promise<void> {
    await this.ensureConnection();
    if (this.isAuthorized) return;
    if (this.authError) throw this.authError;
    if (this.authPromise) {
      await this.authPromise;
      return;
    }
    throw new Error("Authorization not initiated");
  }

  public async sendRequest(request: DerivRequest, requiresAuth: boolean = false, retries: number = 2): Promise<any> {
    try {
      if (requiresAuth) {
        await this.ensureAuthorized();
      } else {
        await this.ensureConnection();
      }

      const req_id = this.reqIdCounter++;
      const payload = { ...request, req_id };

      console.log(`Sending request ${req_id}:`, Object.keys(request));

      return await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.pendingRequests.delete(req_id);
          console.error(`Timeout for request ${req_id}`);
          reject(new Error(`Deriv request timeout for ${JSON.stringify(request)}`));
        }, 15000);

        this.pendingRequests.set(req_id, { resolve, reject, timeout });
        try {
          this.ws.send(JSON.stringify(payload));
        } catch (err) {
          clearTimeout(timeout);
          this.pendingRequests.delete(req_id);
          reject(err);
        }
      });
    } catch (error: any) {
      const isTimeout = error.message && error.message.includes('timeout');
      const isConnectionError = error.message && (error.message.includes('not open') || error.message.includes('closed'));
      
      if (retries > 0 && (isTimeout || isConnectionError)) {
        console.log(`Retrying request ${JSON.stringify(request)}. Retries left: ${retries - 1}`);
        // If it timed out or connection is dead, force a reconnect if it's been a while.
        if (Date.now() - this.lastMessageTime > 15000 || isConnectionError) {
          console.log('Connection seems dead, forcing reconnect before retry...');
          this.ws.terminate();
          // Wait a bit for reconnection
          await new Promise(r => setTimeout(r, 3000));
        }
        return this.sendRequest(request, requiresAuth, retries - 1);
      }
      throw error;
    }
  }

  public async executeMT5Order(symbol: string, action: 'buy' | 'sell', volume: number, login: string, sl?: number, tp?: number, tradingMode: 'options' | 'cfd' = 'options') {
    if (!this.isDemo) {
      throw new Error("Trading is currently only allowed in Demo Account mode for testing strategies and performance.");
    }
    
    // As per the system rule, we do not simulate fake trades. All executions are Options (Multiplier or standard Call/Put) to ensure actual execution and balance debit.
    // The volume parameter is treated as the exact stake amount in USD.
    const stake = Math.max(1, Math.round(volume)); // Ensure minimum stake of 1 USD
    
    // Set duration to 1 hour so the position stays open and can be closed manually
    const duration = 1;
    const duration_unit = 'h';
    
    try {
      // Helper function to try proposal
      const tryProposal = async (isMultiplier: boolean, multiVal: number | null): Promise<any> => {
        const proposalReq: any = {
          proposal: 1,
          amount: stake,
          basis: "stake",
          currency: this.currency,
          symbol: symbol
        };

        if (isMultiplier) {
          proposalReq.contract_type = action === 'buy' ? 'MULTUP' : 'MULTDOWN';
          proposalReq.multiplier = multiVal;
        } else {
          proposalReq.contract_type = action === 'buy' ? 'CALL' : 'PUT';
          proposalReq.duration = duration;
          proposalReq.duration_unit = duration_unit;
        }

        try {
          const res = await this.sendRequest(proposalReq, true);
          return { res, req: proposalReq };
        } catch (err: any) {
          return { res: { error: { message: err.message || String(err) } }, req: proposalReq };
        }
      };

      // 1. Get Proposal
      // Try multipliers universally to allow realistic Margin-style PnL rather than binary options payout limits.
      let proposalRes: any = null;
      let usedReq: any = null;
      
      const multiplierTries = [100, 400, 1000]; // Try common multipliers
      let success = false;
      
      for (const m of multiplierTries) {
        const { res, req } = await tryProposal(true, m);
        if (!res.error) {
          proposalRes = res;
          usedReq = req;
          success = true;
          break;
        } else {
          // If it's a validation error specifically about multiplier values, try to parse it
          if (res.error.message && res.error.message.includes('Accepts')) {
             const match = res.error.message.match(/Accepts ([\d,]+)/);
             if (match) {
                 const firstAccepted = parseInt(match[1].split(',')[0]);
                 if (!isNaN(firstAccepted)) {
                    const { res: retryRes, req: retryReq } = await tryProposal(true, firstAccepted);
                    if (!retryRes.error) {
                       proposalRes = retryRes;
                       usedReq = retryReq;
                       success = true;
                       break;
                    }
                 }
             }
          }
        }
      }

      // Fallback to purely classical CALL/PUT if multiplier is completely blocked
      if (!success) {
         console.log(`[Deriv API] Multipliers rejected for ${symbol}, falling back to CALL/PUT binary option.`);
         const { res, req } = await tryProposal(false, null);
         proposalRes = res;
         usedReq = req;
      }

      if (proposalRes.error) {
        throw new Error(proposalRes.error.message);
      }
      
      const proposalId = proposalRes.proposal.id;
      const askPrice = proposalRes.proposal.ask_price;
      
      // 2. Execute Buy
      const buyReq: any = {
        buy: proposalId,
        price: askPrice // Exact price from proposal
      };
      
      const buyRes = await this.sendRequest(buyReq, true);
      
      if (buyRes.error) {
        throw new Error(buyRes.error.message);
      }
      
      return buyRes;
    } catch (error) {
      console.error('Trade execution failed:', error);
      throw error;
    }
  }

  private cache: { [key: string]: { data: any, timestamp: number } } = {};

  private async getCachedRequest(key: string, request: any, ttl: number = 30000) {
    const now = Date.now();
    if (this.cache[key] && now - this.cache[key].timestamp < ttl) {
      return this.cache[key].data;
    }
    const data = await this.sendRequest(request, true);
    this.cache[key] = { data, timestamp: now };
    return data;
  }

  public async forget(subscriptionId: string) {
    return this.sendRequest({ forget: subscriptionId }, false);
  }

  public async forgetAll(types: string | string[]) {
    if (types === 'ticks' || (Array.isArray(types) && types.includes('ticks'))) {
      this.subscribedSymbols.clear();
    }
    return this.sendRequest({ forget_all: types }, false);
  }

  public async getPortfolio() {
    return this.sendRequest({ portfolio: 1 }, true);
  }

  public async sellContract(contractId: number) {
    return this.sendRequest({ sell: contractId, price: 0 }, true);
  }

  public async getProfitTable() {
    return this.sendRequest({ profit_table: 1, description: 1, limit: 10 }, true);
  }

  public async getStatement() {
    return this.getCachedRequest('statement', { statement: 1, description: 1, limit: 10 }, 30000);
  }

  public async getOHLCV(symbol: string, timeframe: string, count: number = 100) {
    const granularityMap: Record<string, number> = {
      '1m': 60,
      '5m': 300,
      '15m': 900,
      '30m': 1800,
      '1h': 3600,
      '4h': 14400,
      '1d': 86400
    };

    const granularity = granularityMap[timeframe] || 3600;
    const cacheKey = `ohlcv_${symbol}_${granularity}_${count}`;
    
    const now = Date.now();
    if (this.cache[cacheKey] && now - this.cache[cacheKey].timestamp < 60000) { // 1 minute cache for OHLCV
      return this.cache[cacheKey].data;
    }

    const response = await this.sendRequest({
      ticks_history: symbol,
      count: count,
      end: 'latest',
      style: 'candles',
      granularity: granularity
    });

    if (!response.candles) return [];

    const data = response.candles.map((c: any) => ({
      timestamp: c.epoch * 1000,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: 0 // Deriv doesn't always provide volume for synthetics, or it's tick volume
    }));
    
    this.cache[cacheKey] = { data, timestamp: now };
    return data;
  }

  public async getActiveSymbols() {
    const response = await this.sendRequest({
      active_symbols: 'brief',
      product_type: 'basic'
    });
    return response.active_symbols;
  }
}

export const derivService = new DerivService();
