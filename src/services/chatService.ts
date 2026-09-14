import { Type } from "@google/genai";
import { db, auth, handleFirestoreError, OperationType } from "../firebase";
import { collection, addDoc, query, where, getDocs, orderBy, limit, Timestamp } from "firebase/firestore";
import { MemoryService } from "./memoryService";

const memory = new MemoryService();

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface ChatAttachment {
  data: string;
  mimeType: string;
  name: string;
}

export class ChatService {
  private chatsCol = collection(db, "chats");

  async saveMessage(role: 'user' | 'assistant', content: string) {
    if (!auth.currentUser) return;
    try {
      await addDoc(this.chatsCol, {
        role,
        content,
        uid: auth.currentUser.uid,
        timestamp: new Date().toISOString()
      });
    } catch(error) {
      handleFirestoreError(error, OperationType.CREATE, 'chats');
    }
  }

  async getHistory(count: number = 20): Promise<ChatMessage[]> {
    if (!auth.currentUser) return [];
    try {
      const q = query(
        this.chatsCol,
        where("uid", "==", auth.currentUser.uid),
        orderBy("timestamp", "asc"),
        limit(count)
      );
      const snap = await getDocs(q);
      return snap.docs.map(d => ({
        role: d.data().role,
        content: d.data().content,
        timestamp: d.data().timestamp
      }));
    } catch(error) {
      handleFirestoreError(error, OperationType.GET, 'chats');
      return [];
    }
  }

  async sendMessage(message: string, currentMarketData: any, attachment?: ChatAttachment, saveToHistory: boolean = true): Promise<string> {
    const history = saveToHistory ? await this.getHistory(10) : [];
    const knowledge = await memory.getKnowledge();
    const state = await memory.getAgentState();
    const skills = await memory.getSkills();

    const systemInstruction = `
      MINDSET DE AGENTE AUTÔNOMO (IA TRADER):
      Você é um agente de IA de Elite e não um bot algorítmico restrito, possuindo vasto conhecimento em todas as disciplinas de trading e vasto conhecimento no teu data base.
      Você é o Trading Agent S.M.A.R.T. AI. Você é profissional, analítico, e altamente adaptável.

      ANÁLISE DE FORÇA E REGIME:
      - Força da Tendência e Intenção: Avalie a força do movimento combinando as leituras de **Volume Tick** com a anatomia avançada de cada candle (tamanho do corpo, pavios, rejeições, impulsões) integrando perfeitamente a leitura SMC + Price Action.
      - Regimes de Mercado (Time Sessions): Considere estritamente os horários institucionais. O mercado é ditado pelos regimes das grandes Sessões (Londres, Ásia, Nova York). Pondere se o movimento atual e o volume fazem sentido de acordo com a sessão ativa.
      - Leitura Avançada SMC: Utilize sua formidável capacidade cognitiva algorítmica para determinar em quais zonas clássicas institucionais o preço está interagindo. Você detém o conhecimento natural para identificar facilmente áreas como Bullish/Bearish Order Blocks, Propulsion Blocks, Rejection/Reclaimed Blocks, FVG, BPR, Liquidity Voids, Breaker Blocks... Analise o mercado de maneira inteligente.
      
      CONTEXT:
      - Current Market Data: ${JSON.stringify(currentMarketData)}
      - Agent Mood: ${state.mood}
      - Agent Skills: ${skills.map((s: any) => s.name).join(", ")}
      - User Knowledge Base: ${knowledge || "Empty"}
      
      CAPABILITIES:
      - You can analyze any trading strategy, including Price Action, SMC, Elliott Wave, Indicators, and Custom Rules.
      - You can discuss strategies, answer questions, and provide market outlooks for multiple assets.
      - You can analyze images of charts, PDFs, and documents to extract trading rules.
      - You act as a collaborative partner to the user, helping them refine their trading edge.
      
      CORE METHODOLOGY:
      1. Smart Money Concepts (SMC): Order Blocks, Liquidity (BSL/SSL), BOS/CHoCH, FVG/Imbalance.
      2. Elliott Wave Theory: Impulsive (1-5) and Corrective (A-B-C) waves, Fibonacci confluence.
      3. Advanced Price Action: Supply/Demand, Wick/Volume analysis, Multi-Timeframe (Matrioska).
      4. Risk Management: Confluence (OB + FVG + Elliott), Premium/Discount (Buy < 50%, Sell > 50%), Stop Hunts.
      5. Operational Management: 20% daily profit target calculation based on Risk/Reward.
      
      INSTRUCTIONS:
      - Answer the user's questions based on the provided context and your trading logic.
      - If asked about market prices, use the "Current Market Data" provided.
      - Be concise but thorough.
      - Respond in the user's language (Portuguese).
      - CHART DRAWINGS: ONLY if the user EXPLICITLY asks you to draw on the chart (e.g., "desenhe o suporte", "trace a fibonacci"), you MUST include a JSON block at the very end of your response formatted EXACTLY like this:
      \`\`\`json
      {
        "drawings": [
          { "type": "horizontal_line", "points": [{"time": 1711618200, "price": 1.0850}], "options": {"color": "#3b82f6", "title": "Support"} },
          { "type": "trend_line", "points": [{"time": 1711616400, "price": 1.0800}, {"time": 1711618200, "price": 1.0850}], "options": {"color": "#eab308"} },
          { "type": "marker", "points": [{"time": 1711618200, "price": 1.0850}], "options": {"color": "#f43f5e", "position": "aboveBar", "shape": "arrowDown", "text": "Sell Here"} }
        ]
      }
      \`\`\`
      - To draw Fibonacci: output multiple "horizontal_line" objects for each level.
      - To draw a Channel: output two "trend_line" objects.
      - To draw a Rectangle: output four "trend_line" objects connecting the corners.
      - To draw a Triangle: output three "trend_line" objects connecting the corners.
      - To draw a Moving Average: output one "trend_line" object with a point for every candle in the recent data.
      - IMPORTANT: The "time" value MUST be the exact numeric timestamp (in seconds) from the "Current Market Data". Do not format it as a string.
      - CRITICAL: DO NOT output the JSON block if the user is just asking a question or chatting. ONLY output it when EXPLICITLY requested to draw.
    `;

    if (attachment) {
      const isTraining = message.toLowerCase().includes('treinar') || message.toLowerCase().includes('aprender') || message.toLowerCase().includes('regra') || message.toLowerCase().includes('estratégia');
      
      let promptText = `User says: ${message}\n\nRecent History: ${JSON.stringify(history)}`;
      if (isTraining) {
         promptText += `\n\nINSTRUÇÃO ESPECIAL: O usuário enviou um arquivo para treinamento. Analise a imagem/documento e extraia as regras operacionais ou conceitos de trading. Formate a saída de forma clara, listando as regras aprendidas (use a palavra 'Regra:' antes de cada uma).`;
      }

      const parts: any[] = [
        { text: promptText },
        {
          inlineData: {
            data: attachment.data,
            mimeType: attachment.mimeType
          }
        }
      ];

      const response = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: { parts },
          model: "gemini-3.1-pro-preview",
          config: { systemInstruction }
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      let reply = data.text || "Desculpe, não consegui processar o arquivo.";
      
      // Attempt to parse if the model returned JSON by mistake
      if (reply.trim().startsWith('{') && reply.trim().endsWith('}')) {
        try {
          const parsed = JSON.parse(reply);
          reply = parsed.greeting || parsed.response || parsed.text || parsed.message || reply;
        } catch (e) {
          // ignore
        }
      }
      
      if (isTraining) {
         await memory.trainTheoretical(reply);
      }

      if (saveToHistory) {
        await this.saveMessage('user', `[Arquivo: ${attachment.name}] ${message}`);
        await this.saveMessage('assistant', reply);
      }
      return reply;
    } else {
      const response = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: `User says: ${message}\n\nRecent History: ${JSON.stringify(history)}\n\nCRITICAL: DO NOT output JSON. Respond in plain text natural language.`,
          model: "gemini-3-flash-preview",
          config: { systemInstruction }
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      let reply = data.text || "Desculpe, não consegui processar sua mensagem.";
      
      // Attempt to parse if the model returned JSON by mistake
      if (reply.trim().startsWith('{') && reply.trim().endsWith('}')) {
        try {
          const parsed = JSON.parse(reply);
          reply = parsed.greeting || parsed.response || parsed.text || parsed.message || reply;
        } catch (e) {
          // ignore
        }
      }
      
      if (saveToHistory) {
        await this.saveMessage('user', message);
        await this.saveMessage('assistant', reply);
      }

      return reply;
    }
  }

  async generateSilentAnalysis(promptText: string, contextData?: any, forceJson: boolean = false): Promise<string> {
    const knowledge = await memory.getKnowledge();
    const systemInstruction = `
      MINDSET DE AGENTE AUTÔNOMO (IA TRADER):
      Você é um agente de IA de Elite e não um bot algorítmico restrito, possuindo vasto conhecimento em todas as disciplinas de trading e vasto conhecimento no teu data base.
      Você é o Trading Agent S.M.A.R.T. AI.

      ANÁLISE DE FORÇA E REGIME:
      - Força da Tendência e Intenção: Avalie a força do movimento combinando as leituras de **Volume Tick** com a anatomia avançada de cada candle (tamanho do corpo, pavios, rejeições, impulsões) integrando perfeitamente a leitura SMC + Price Action.
      - Regimes de Mercado (Time Sessions): Considere estritamente os horários institucionais. O mercado é ditado pelos regimes das grandes Sessões (Londres, Ásia, Nova York). Pondere se o movimento atual e o volume fazem sentido de acordo com a sessão ativa.
      - Leitura Avançada SMC: Utilize sua formidável capacidade cognitiva algorítmica para determinar em quais zonas clássicas institucionais o preço está interagindo. Você detém o conhecimento natural para identificar facilmente áreas como Bullish/Bearish Order Blocks, Propulsion Blocks, Rejection/Reclaimed Blocks, FVG, BPR, Liquidity Voids, Breaker Blocks... Analise o mercado de maneira inteligente.

      CONTEXT: ${contextData ? JSON.stringify(contextData) : 'None'}
      KNOWLEDGE BASE: ${knowledge || "Empty"}
      INSTRUCTIONS: Answer concisely and analytically. Do not use markdown formatting unless requested. Respond in Portuguese.
    `;

    const response = await fetch("/api/ai/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: promptText,
        config: { 
          systemInstruction,
          responseMimeType: forceJson ? "application/json" : "text/plain"
        }
      })
    });

    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    let reply = data.text || "";
    
    // Only try to parse and extract text if we didn't explicitly request JSON
    if (!forceJson && reply.trim().startsWith('{') && reply.trim().endsWith('}')) {
      try {
        const parsed = JSON.parse(reply);
        reply = parsed.text || parsed.message || parsed.analysis || reply;
      } catch (e) {}
    }
    return reply;
  }
}
