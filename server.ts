import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import cors from "cors";
import { derivService } from "./server/deriv.js";
import { stepfunService } from "./server/stepfunService.js";
import { nvidiaGemmaService } from "./server/nvidiaGemmaService.js";
import { authRouter } from "./server/authRoutes.js";
import { memoryHub } from "./server/memoryHub.js";
import { initDb } from "./server/db.js";
import { autopilotEngine } from "./server/autopilot.js";
import http from "http";
import { Server } from "socket.io";
import { TelegramService } from "./server/telegram.js";
import { battlePlanStore } from "./server/battlePlans.js";
import multer from "multer";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

async function startServer() {
  await initDb();
  await memoryHub.init();
  
  const app = express();
  const PORT = 3000;
  
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: "*" } });

  autopilotEngine.setSocket(io);
  autopilotEngine.start();

  const telegramService = new TelegramService(io, derivService);

  app.use(cors());
  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ limit: '100mb', extended: true }));
  app.use('/api/auth', authRouter);

  const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      const dir = '/tmp/uploads';
      if (!fs.existsSync(dir)){
          fs.mkdirSync(dir, { recursive: true });
      }
      cb(null, dir);
    },
    filename: function (req, file, cb) {
      cb(null, Date.now() + '-' + file.originalname);
    }
  });

  const upload = multer({ 
    storage: storage,
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB
  });

  // --- AI Endpoint ---
  app.post("/api/ai/generate", async (req, res) => {
    try {
      const { prompt, config } = req.body;
      
      let finalPrompt = "";
      
      if (typeof prompt === 'string') {
        finalPrompt = prompt;
      } else if (prompt && prompt.parts && Array.isArray(prompt.parts)) {
        // Handle Multimodal (Chat File Uploads) by turning them into text
        for (const part of prompt.parts) {
          if (part.text) finalPrompt += part.text + "\n";
          if (part.inlineData) {
             const mimeType = part.inlineData.mimeType;
             const base64Data = part.inlineData.data.replace(/^data:.*?;base64,/, '');
             const buffer = Buffer.from(base64Data, 'base64');
             
             if (mimeType === 'application/pdf') {
                try {
                   const textResult = await pdfParse(buffer);
                   finalPrompt += `\n[Conteúdo Extraído do PDF ${part.inlineData.name || ''}]:\n${textResult.text}\n`;
                } catch(e) {
                   console.error("Failed to parse PDF in chat:", e);
                   finalPrompt += `\n[Erro: Falha ao ler o arquivo PDF anexado.]\n`;
                }
             } else if (mimeType.startsWith('text/')) {
                finalPrompt += `\n[Conteúdo do Arquivo de Texto]:\n${buffer.toString('utf-8')}\n`;
             } else {
                finalPrompt += `\n[Aviso: O usuário anexou um arquivo (${mimeType}), mas este modo não possui leitura de imagem ativa. Instrua o usuário a descrever o anexo.]\n`;
             }
          }
        }
      } else {
        return res.status(400).json({ error: "Invalid prompt format" });
      }

      // Try Stepfun
      try {
        console.log("Attempting primary model (Stepfun) with refined prompt length:", finalPrompt.length);
        const systemInstruction = config?.systemInstruction;
        const forceJson = config?.responseMimeType === "application/json";
        const stepfunResponse = await stepfunService.analyzeMarket(finalPrompt, systemInstruction, forceJson);
        
        // If it returned the fallback WAIT due to silent failure in stepfunService
        if (typeof stepfunResponse === 'string' && stepfunResponse.includes("Falha de API")) {
           throw new Error("Stepfun Rate Limit or Silent Error");
        }
        
        return res.json({ text: stepfunResponse, candidates: [] });
      } catch (stepfunError: any) {
        console.warn("Primary model (Stepfun) failed, falling back to Gemma:", stepfunError.message || stepfunError);
        try {
          const systemInstruction = config?.systemInstruction;
          const forceJson = config?.responseMimeType === "application/json";
          const gemmaResponse = await nvidiaGemmaService.analyzeMarket(finalPrompt, systemInstruction, forceJson);
          return res.json({ text: gemmaResponse, candidates: [] });
        } catch (gemmaError: any) {
          console.error("Fallback model (Gemma) also failed:", gemmaError);
          return res.status(500).json({ error: gemmaError.message || "Both AI models failed" });
        }
      }
    } catch (error: any) {
      console.error("API Error:", error);
      res.status(500).json({ error: error.message || "Failed to generate content" });
    }
  });

  // --- AI Internet Search Endpoint ---
  app.post("/api/ai/search-internet", async (req, res) => {
    try {
      const { query } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "GEMINI_API_KEY not configured" });
      }

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "Pesquise na internet e traga informações sobre: " + query }] }],
          tools: [{ googleSearch: {} }],
        })
      });

      if (!response.ok) {
        throw new Error(`Google Search API Error: ${response.statusText}`);
      }

      const data = await response.json();
      const textResult = data.candidates?.[0]?.content?.parts?.[0]?.text || "Sem resultados.";
      res.json({ result: textResult });
    } catch (error: any) {
      console.error("Internet Search Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // --- Phase 3: Train Agent ---
  app.post("/api/train-agent", upload.single('file'), async (req, res) => {
    try {
      const manualText = req.body.text;
      const sourceName = req.body.sourceName;
      let contentToProcess = manualText || "";

      if (req.file) {
        try {
          if (req.file.mimetype === 'application/pdf') {
            const dataBuffer = fs.readFileSync(req.file.path);
            const textResult = await pdfParse(dataBuffer);
            contentToProcess += "\n" + textResult.text;
          } else if (req.file.originalname.endsWith('.docx') || req.file.mimetype.includes('wordprocessingml')) {
            const mammoth = await import('mammoth');
            const dataBuffer = fs.readFileSync(req.file.path);
            const result = await mammoth.extractRawText({ buffer: dataBuffer });
            contentToProcess += "\n" + result.value;
          } else if (req.file.mimetype.startsWith('image/')) {
            const base64Img = fs.readFileSync(req.file.path, 'base64');
            contentToProcess += `\n[Imagem codificada em base64 da fonte]: data:${req.file.mimetype};base64,${base64Img}`;
          } else {
            contentToProcess += "\n" + fs.readFileSync(req.file.path, 'utf-8');
          }
        } catch(e) {
          console.error("Arquivo Parsing Error:", e);
          return res.status(500).json({ error: "Falha ao ler o arquivo anexado." });
        } finally {
          // Clean up the temp file
          if (fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
          }
        }
      }

      if (!contentToProcess || contentToProcess.trim().length === 0) {
        return res.status(400).json({ error: "Nenhum conteúdo válido providenciado para treinamento." });
      }

      console.log("Armazenando o documento completo no banco de dados...");
      const savedKnowledge = await memoryHub.addKnowledge([{
        category: "Documento Literal",
        concept: sourceName || req.file?.originalname || "Manual Input",
        description: "Conteúdo completo do arquivo para consulta do agente",
        actionableRule: contentToProcess,
        source: sourceName || req.file?.originalname || "Sistema de Arquivos"
      }]);

      res.json({ success: true, addedItems: savedKnowledge.length, items: savedKnowledge });
    } catch (error: any) {
      console.error("Error in /api/train-agent:", error);
      res.status(500).json({ error: error.message || "Failed to train agent" });
    }
  });

  app.get("/api/memory", (req, res) => {
    res.json(memoryHub.getAllKnowledge());
  });

  app.delete("/api/memory", async (req, res) => {
    await memoryHub.clearMemory();
    res.json({ success: true });
  });

  app.delete("/api/memory/:id", async (req, res) => {
    await memoryHub.deleteKnowledge(req.params.id);
    res.json({ success: true });
  });

  app.get("/api/battle-plans", (req, res) => {
    res.json(battlePlanStore.getPlans());
  });

  app.post("/api/battle-plans", (req, res) => {
    const plans = req.body.plans;
    if (Array.isArray(plans)) {
      battlePlanStore.savePlans(plans);
      res.json({ success: true });
    } else {
      res.status(400).json({ error: "Invalid format" });
    }
  });

  // --- Phase 4: Validate Signal ---
  app.post("/api/validate-signal", async (req, res) => {
    try {
      const { signal, marketData, isDemoMode } = req.body;
      const collectiveMemory = memoryHub.getCollectiveMemoryString();
      
      const validationResult = await stepfunService.validateSignal(signal, marketData, collectiveMemory, isDemoMode);
      
      res.json(validationResult);
    } catch (error: any) {
      console.error("Error in /api/validate-signal:", error);
      res.status(500).json({ error: error.message || "Failed to validate signal" });
    }
  });

  // Socket.io for Real-Time Quotes
  io.on("connection", (socket) => {
    console.log("Client connected to real-time quotes. Current balances:", derivService.balances);
    
    // Send current balances immediately upon connection
    Object.values(derivService.balances).forEach(balance => {
      socket.emit('balance', balance);
    });
    if (derivService.mt5Accounts && derivService.mt5Accounts.length > 0) {
      socket.emit('mt5_accounts', derivService.mt5Accounts);
    }

    // Subscribe to default symbols
    const defaultSymbols = ['R_10', 'R_25', 'R_50', 'R_75', 'R_100', 'frxEURUSD'];
    defaultSymbols.forEach(sym => derivService.subscribeTick(sym));
    
    socket.on('subscribe', (symbol) => {
      console.log(`Client subscribed to ${symbol}`);
      derivService.subscribeTick(symbol);
    });

    socket.on('telegram_response', (data) => {
      telegramService.sendMessage(data.text, data.options);
    });

    socket.on('telegram_notify', (data) => {
      telegramService.sendMessage(data.text, data.options);
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected from quotes");
    });
  });

  // Listen to Deriv ticks and broadcast
  derivService.on('tick', (tick) => {
    if (!tick) return;
    io.emit('quote', {
      symbol: tick.symbol,
      price: tick.quote,
      epoch: tick.epoch
    });
  });

  derivService.on('market_closed', (symbol) => {
    io.emit('market_closed', symbol);
  });

  derivService.on('balance', (balance) => {
    io.emit('balance', balance);
  });

  derivService.on('open_contract', (contract) => {
    io.emit('open_contract', contract);
  });

  derivService.on('mt5_accounts', (accounts) => {
    io.emit('mt5_accounts', accounts);
  });

  // API Routes
  app.post("/api/set-trading-mode", (req, res) => {
    try {
      const { mode } = req.body;
      if (mode !== 'options' && mode !== 'cfd') {
        return res.status(400).json({ error: "mode must be 'options' or 'cfd'" });
      }
      derivService.setTradingMode(mode);
      res.json({ success: true, mode });
    } catch (e: any) {
      console.error("Failed to set trading mode:", e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.post("/api/set-demo-mode", (req, res) => {
    try {
      const { isDemo } = req.body;
      if (typeof isDemo !== 'boolean') {
        return res.status(400).json({ error: "isDemo must be a boolean" });
      }
      derivService.setDemoMode(isDemo);
      res.json({ success: true, isDemo });
    } catch (e: any) {
      console.error("Failed to set demo mode:", e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.post("/api/debug/trade", async (req, res) => {
    try {
      // Test opening a CALL option on R_100 with 1 USD stake
      const result = await derivService.executeMT5Order('R_100', 'buy', 1, 'test');
      res.json({ success: true, result });
    } catch (e: any) {
      console.error("Debug trade failed:", e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.get("/api/debug/balances", (req, res) => {
    try {
      res.json({
        balances: derivService.balances,
        mt5Accounts: derivService.mt5Accounts
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get(["/api/price-history", "/api/market-data"], async (req, res) => {
    const { symbol = 'R_75', timeframe = '1h', limit = '100' } = req.query;
    try {
      const data = await derivService.getOHLCV(symbol as string, timeframe as string, parseInt(limit as string));
      res.json(data);
    } catch (error) {
      console.error("Error fetching price history from Deriv:", error);
      res.status(500).json({ error: "Failed to fetch price history" });
    }
  });

  app.get(["/api/symbols-overview", "/api/market-overview"], async (req, res) => {
    try {
      const symbols = await derivService.getActiveSymbols();
      // Filter to synthetics and forex for now
      const filtered = symbols.filter((s: any) => s.market === 'synthetic_index' || s.market === 'forex');
      res.json(filtered);
    } catch (error) {
      console.error("Error fetching symbols overview:", error);
      res.status(500).json({ error: "Failed to fetch symbols overview" });
    }
  });

  app.post("/api/execute-trade", async (req, res) => {
    try {
      const { symbol, action, volume, login, sl, tp, tradingMode } = req.body;
      
      if (!symbol || !action || !volume || !login) {
        return res.status(400).json({ error: "Missing required parameters: symbol, action, volume, login" });
      }

      const response = await derivService.executeMT5Order(symbol, action, volume, login, sl, tp, tradingMode);
      res.json(response);
    } catch (error: any) {
      console.error("Error executing MT5 trade:", error);
      res.status(500).json({ error: error.message || "Failed to execute trade" });
    }
  });

  app.get("/api/portfolio", async (req, res) => {
    try {
      const response = await derivService.getPortfolio();
      res.json(response);
    } catch (error: any) {
      console.error("Error fetching portfolio:", error);
      res.status(500).json({ error: error.message || "Failed to fetch portfolio" });
    }
  });

  app.post("/api/close-trade", async (req, res) => {
    try {
      const { contractId } = req.body;
      if (!contractId) {
        return res.status(400).json({ error: "Missing contractId" });
      }
      const response = await derivService.sellContract(contractId);
      res.json(response);
    } catch (error: any) {
      if (error.message && (error.message.includes('Resale of this contract is not offered') || error.message.includes('Contract cannot be sold at this time'))) {
        // Expected scenario for certain contracts or times; do not log as a server error.
        return res.status(400).json({ error: error.message });
      }
      console.error("Error closing trade:", error);
      res.status(500).json({ error: error.message || "Failed to close trade" });
    }
  });

  app.get("/api/profit-table", async (req, res) => {
    try {
      const response = await derivService.getProfitTable();
      res.json(response);
    } catch (error: any) {
      console.error("Error fetching profit table:", error);
      res.status(500).json({ error: error.message || "Failed to fetch profit table" });
    }
  });

  app.get("/api/statement", async (req, res) => {
    try {
      const response = await derivService.getStatement();
      res.json(response);
    } catch (error: any) {
      console.error("Error fetching statement:", error);
      res.status(500).json({ error: error.message || "Failed to fetch statement" });
    }
  });

  // --- WebSockets Subscription Management ---
  app.post("/api/deriv/forget", async (req, res) => {
    try {
      const { subscription_id } = req.body;
      if (!subscription_id) return res.status(400).json({ error: "Missing subscription_id" });
      const response = await derivService.forget(subscription_id);
      res.json(response);
    } catch (error: any) {
      console.error("Error forgetting subscription:", error);
      res.status(500).json({ error: error.message || "Failed to forget subscription" });
    }
  });

  app.post("/api/deriv/forget-all", async (req, res) => {
    try {
      const { types } = req.body;
      if (!types) return res.status(400).json({ error: "Missing types array or string" });
      const response = await derivService.forgetAll(types);
      res.json(response);
    } catch (error: any) {
      console.error("Error forgetting all subscriptions:", error);
      res.status(500).json({ error: error.message || "Failed to forget all subscriptions" });
    }
  });

  // --- Payment Agents REST Proxy ---
  const DERIV_APP_ID = process.env.DERIV_CLIENT_ID || '36300';
  const DERIV_REST_API = 'https://api.derivws.com';

  app.get("/api/payment-agents/agents", async (req, res) => {
    try {
      const currency = req.query.currency || 'USD';
      const token = req.headers.authorization;
      if (!token) return res.status(401).json({ error: "Missing authorization token" });

      const response = await fetch(`${DERIV_REST_API}/payment-agents/v1/agents?currency=${currency}`, {
        method: 'GET',
        headers: { 'Deriv-App-ID': DERIV_APP_ID, 'Authorization': token }
      });
      res.status(response.status).json(await response.json());
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/payment-agents/agent-statistics", async (req, res) => {
    try {
      const token = req.headers.authorization;
      if (!token) return res.status(401).json({ error: "Missing authorization token" });

      const response = await fetch(`${DERIV_REST_API}/payment-agents/v1/agent-statistics`, {
        method: 'GET',
        headers: { 'Deriv-App-ID': DERIV_APP_ID, 'Authorization': token }
      });
      res.status(response.status).json(await response.json());
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/payment-agents/agents/:id", async (req, res) => {
    try {
      const token = req.headers.authorization;
      if (!token) return res.status(401).json({ error: "Missing authorization token" });

      const response = await fetch(`${DERIV_REST_API}/payment-agents/v1/agents/${req.params.id}`, {
        method: 'GET',
        headers: { 'Deriv-App-ID': DERIV_APP_ID, 'Authorization': token }
      });
      res.status(response.status).json(await response.json());
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/payment-agents/transfer", async (req, res) => {
    try {
      const token = req.headers.authorization;
      if (!token) return res.status(401).json({ error: "Missing authorization token" });

      const response = await fetch(`${DERIV_REST_API}/payment-agents/v1/transfer`, {
        method: 'POST',
        headers: { 'Deriv-App-ID': DERIV_APP_ID, 'Authorization': token, 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body)
      });
      res.status(response.status).json(await response.json());
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/payment-agents/withdraw/verification_code", async (req, res) => {
    try {
      const token = req.headers.authorization;
      if (!token) return res.status(401).json({ error: "Missing authorization token" });

      const response = await fetch(`${DERIV_REST_API}/payment-agents/v1/withdraw/verification_code`, {
        method: 'POST',
        headers: { 'Deriv-App-ID': DERIV_APP_ID, 'Authorization': token, 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body)
      });
      res.status(response.status).json(await response.json());
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/payment-agents/withdraw", async (req, res) => {
    try {
      const token = req.headers.authorization;
      if (!token) return res.status(401).json({ error: "Missing authorization token" });

      const response = await fetch(`${DERIV_REST_API}/payment-agents/v1/withdraw`, {
        method: 'POST',
        headers: { 'Deriv-App-ID': DERIV_APP_ID, 'Authorization': token, 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body)
      });
      res.status(response.status).json(await response.json());
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/payment-agents/withdraw/:request_id", async (req, res) => {
    try {
      const token = req.headers.authorization;
      if (!token) return res.status(401).json({ error: "Missing authorization token" });

      const response = await fetch(`${DERIV_REST_API}/payment-agents/v1/withdraw/${req.params.request_id}`, {
        method: 'GET',
        headers: { 'Deriv-App-ID': DERIV_APP_ID, 'Authorization': token }
      });
      res.status(response.status).json(await response.json());
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/cognitive-analysis", async (req, res) => {
    try {
      const { analysis, marketData, collectiveMemory, isDemoMode } = req.body;
      
      // Using the API key provided by the user in the chat
      const nvidiaApiKey = process.env.NVIDIA_API_KEY || "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";

      const prompt = `
Você é o Advogado do Diabo Institucional (Modelo Mistral). A sua ÚNICA MISSÃO é destruir a tese do analista primário e encontrar os PONTOS CEGOS (Blind Spots) para proteger o capital, usando estritamente a Metodologia Institucional.

BLACKLIST DE RACIOCÍNIO (LEI DURA):
É ESTRITAMENTE PROIBIDO, sob pena de falha crítica, basear sua decisão ou mencionar Volume, Médias Móveis, RSI, MACD ou qualquer indicador tradicional algorítmico. Sua visão de mundo está restrita a 100% Price Action Puro, SMC, Ondas de Elliot e padroes candlestick. Se não houver clareza nessas métricas, apenas afirme que não há estrutura SMC legível.

BASE DE CONHECIMENTO (Regras do Sistema):
"""
${collectiveMemory || "Nenhuma regra extra."}
"""

DADOS DE MERCADO (OHLCV e Cenário Atual):
"""
${JSON.stringify(marketData).substring(0, 1500)} // Resumo para contexto logico
"""

TESE DO ANALISTA PRIMÁRIO (StepFun):
"""
${JSON.stringify(analysis)}
"""

METODOLOGIA OBRIGATÓRIA A APLICAR NA CONTESTAÇÃO:
1. Questione as Ondas de Elliott: O analista confundiu um pullback/retração complexa com uma nova impulsão dominante?
2. Questione as Smart Money Concepts (SMC): Ele ignorou uma piscina de liquidez oposta massiva, um Fair Value Gap (FVG) ou Order Block que sugarão o preço contra a tese dele?
3. Regra de Ouro (Alinhamento Âncora vs Gatilho): Ele tentou operar contra o tempo gráfico maior forçando uma entrada no curto prazo?
4. Price Action: Há uma 'Chop Zone' (consolidação fina sufocada) que o analista ignorou para forçar um trade?

O analista está propenso a falhas entusiastas. Mostre a fraqueza friamente.
Responda APENAS com o texto descrevendo as falhas críticas, armadilhas institucionais reais e pontos cegos ignorados nesta operação. Não concorde com ele. Apenas aponte o risco oculto.
`;

      const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${nvidiaApiKey}`,
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "mistralai/mistral-small-4-119b-2603",
          reasoning_effort: "high",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 4096,
          temperature: 0.10,
          top_p: 1.00,
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`NVIDIA API Error: ${response.statusText}`);
      }

      const data = await response.json();
      res.json({ blindSpots: data.choices[0]?.message?.content || "Nenhum ponto cego crítico encontrado (análise falhou em gerar)." });
    } catch (error) {
      console.error("Error in cognitive analysis (Mistral), falling back to Gemma:", error);
      try {
        const { analysis } = req.body;
        const fallbackContent = await nvidiaGemmaService.analyzeMarket("Atue como Advogado do Diabo brutal e aponte APENAS por que esta tese de trade vai falhar, usando SMC e Elliott: " + JSON.stringify(analysis), undefined, false);
        res.json({ blindSpots: fallbackContent });
      } catch (fallbackError) {
        console.error("Fallback Gemma also failed:", fallbackError);
        res.status(500).json({ error: "Failed to perform cognitive analysis on both primary and fallback models." });
      }
    }
  });

  app.post("/api/evaluate-risk", async (req, res) => {
    try {
      const { asset, action, entryPrice, stopLoss, takeProfit, accountBalance, confidence, reasoning } = req.body;
      const riskEvaluation = await stepfunService.evaluateRiskReward(
        asset, action, entryPrice, stopLoss, takeProfit, accountBalance, confidence, reasoning
      );
      
      // Checking for Stepfun failure
      if (!riskEvaluation.approved && riskEvaluation.riskReasoning.includes("Falha")) {
         throw new Error("Stepfun evaluateRiskReward failed silently");
      }
      res.json(riskEvaluation);
    } catch (error) {
      console.warn("Error evaluating risk with Stepfun, falling back:", error);
      res.json({
        approved: false, 
        riskReasoning: "Falha na análise de risco pela IA.",
        suggestedPositionSize: 0 
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    let vite;
    try {
      vite = await createViteServer({
        server: { middlewareMode: true, hmr: { port: 24678 + Math.floor(Math.random() * 1000) } },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } catch (e) {
      console.error("Failed to start Vite middleware:", e);
    }
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  const shutdown = async () => {
    console.log("Shutting down server...");
    if (telegramService) {
        await telegramService.shutdown();
    }
    server.close(() => {
      console.log("Server closed.");
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000).unref();
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

startServer();
