import { MarketStructure, Trend, OHLCV } from "./structure";
import { LiquidityDetector } from "./liquidity";
import { ZoneDetector, ZoneType } from "./zones";
import { QuantumVolatility } from "../indicators/quantumVolatility";
import { CandlestickDetector } from "./candlestick";
import { FibonacciCalculator } from "./fibonacci";
import { ElliottWaveDetector, WaveType } from "./elliott";
import { MemoryService } from "../memoryService";
import { TradeType, Timeframe, PreFlightChecklist, MarketState, AgentMemory, TradingSignal, BattlePlan, AlertZone } from "../../types";
import { EMA, BollingerBands, RSI, MACD, ATR, Stochastic } from "technicalindicators";

export class SMCAgent {
  private memory = new MemoryService();

  async validateSignalAlignment(plan: any, freshData: Record<string, OHLCV[]>): Promise<{isAligned: boolean, reasoning: string}> {
    const prompt = `
    Você é um Sniper Institucional validando um gatilho de entrada.
    
    PLANO DE BATALHA ORIGINAL:
    Ativo: ${plan.asset}
    Tipo de Trade: ${plan.tradeType}
    Ação Planejada: ${plan.action}
    Gráfico Âncora: ${plan.anchorTimeframe}
    Gráfico de Gatilho: ${plan.triggerTimeframe}
    
    DADOS ATUAIS (Âncora e Gatilho):
    ${JSON.stringify({
      anchor: freshData[plan.anchorTimeframe]?.slice(-3),
      trigger: freshData[plan.triggerTimeframe]?.slice(-5)
    })}
    
    REGRA DE VALIDAÇÃO ESTRITA (SINCRONIZAÇÃO DINÂMICA DE ELLIOTT E ESTADO DO ÂNCORA):
    Você aprovará a operação APENAS E EXCLUSIVAMENTE se confirmar UMA destas dinâmicas universais de estado ao ler as velas do Gráfico Âncora:
    1. ESTADO DE IMPULSÃO DOMINANTE (Trend Following): Se o Gráfico Âncora apresentar uma progressiva Onda Impulsiva nas OHLCV (sem sinais visíveis de pullback oposto), a operação no Gatilho DEVE ser rigorosamente a favor dessa expansão (Buy para subida, Sell para descida). 
    2. ESTADO DE FASE CORRETIVA / LIQUIDEZ (Sniper): Se o Gráfico Âncora estiver numa retração caindo sobre um Order Block/FVG validado, a operação no Gatilho só será APROVADA se o preço estiver invertendo exatamente dessa barreira técnica de SMC a favor da retomada impulsiva.
    REJEIÇÃO ABSOLUTA:
    - Se a operação de Gatilho for entrar cegamente CONTRA uma tendência mestre em forte sangramento direcional se não houver um escudo SMC de alvo longo.
    - Se a última vela vigente do Âncora for um "candle de pullback forte" (ex: Âncora em queda, mas fazendo candle de engolfo forte de alta local) que destrói a inércia da operação de gatilho, ou em zona não definida (Choppy).
    
    SAÍDA OBRIGATÓRIA (APENAS JSON VÁLIDO):
    {
      "isAligned": true | false,
      "reasoning": "Explicação curta do alinhamento"
    }
    `;
    
    try {
      const response = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          model: "gemini-3.1-pro-preview",
          config: { responseMimeType: "application/json" }
        })
      });
      
      if (!response.ok) throw new Error("Falha na validação da IA");
      
      const data = await response.json();
      const cleaned = data.response.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(cleaned);
    } catch (e) {
      console.error("Erro na validação:", e);
      return { isAligned: false, reasoning: "Erro na validação" };
    }
  }

  private log(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') {
    window.dispatchEvent(new CustomEvent('agent-log', { detail: { message, type } }));
  }

  async executeAIAgentAnalysisWithShiftDown(
    asset: string, 
    mtfData: Record<string, OHLCV[]>, 
    balance: number, 
    activeIndicators: string[] = [],
    isDemoMode: boolean = true,
    systemConfigs?: any,
    previousWAITReasoning?: string,
    onProgress?: (msg: string) => void,
    isCancelledCallback?: () => boolean,
    onPlanGenerated?: (planResult: any) => void
  ): Promise<any> {
    const analysisLevels = [
      { name: 'Swing Trade', anchor: '1d', trigger: '4h' },
      { name: 'Nível 1 (Day-Trade)', anchor: '4h', trigger: '1h' },
      { name: 'Nível 2 (Day-Trade)', anchor: '4h', trigger: '30m' },
      { name: 'Nível 3 (Day-Trade)', anchor: '4h', trigger: '15m' },
      { name: 'Scalp Nível 1', anchor: '15m', trigger: '1m' },
      { name: 'Scalp Nível 2', anchor: '5m', trigger: '1m' }
    ];

    let lastResult = null;

    for (const level of analysisLevels) {
      if (isCancelledCallback && isCancelledCallback()) {
        if (onProgress) onProgress(`Análise abortada pelo usuário.`);
        return null;
      }
      
      if (onProgress) {
        onProgress(`Analisando ${asset}: ${level.name} (Âncora: ${level.anchor} | Gatilho: ${level.trigger})`);
      }
      
      const result = await this.executeAIAgentAnalysis(
        asset,
        mtfData,
        balance,
        activeIndicators,
        isDemoMode,
        level.trigger, // fallback for targetTimeframe
        systemConfigs,
        previousWAITReasoning,
        level
      );

      lastResult = result;

      // Se a IA achar uma operação válida, não desistimos e quebramos o loop.
      const actionRaw = result?.decision?.action ? String(result.decision.action).toUpperCase().trim() : 'WAIT';
      
      if (result && result.decision && (actionRaw === 'BUY' || actionRaw === 'SELL')) {
        if (onProgress) {
          onProgress(`Oportunidade Encontrada em ${asset} no ${level.name}!`);
        }
        return result; 
      } else {
        if (onProgress) {
          onProgress(`${asset} em ${level.name} retornou WAIT. Guardando armadilhas e descendo de nível...`);
        }
        if (onPlanGenerated && result) {
          onPlanGenerated(result);
        }
      }
    }

    // Se chegar aqui, todas deram WAIT.
    return lastResult;
  }

  async executeAIAgentAnalysis(
    asset: string, 
    mtfData: Record<string, OHLCV[]>, 
    balance: number, 
    activeIndicators: string[] = [],
    isDemoMode: boolean = true,
    targetTimeframe?: string,
    systemConfigs?: {
      riskEntryType: string;
      capitalRiskPct: number;
      useMartingale: boolean;
      maxConcurrentTrades: number;
    },
    previousWAITReasoning?: string,
    levelInfo?: { name: string, anchor: string, trigger: string }
  ): Promise<any> {
    this.log(`Iniciando Análise Cognitiva Híbrida para ${asset}${levelInfo ? ` - ${levelInfo.name}` : ''}...`, 'info');
    
    const knowledge = await this.memory.getKnowledge();
    const memory = await this.memory.getFullMemory();

    // Prepare a summary of the MTF data to avoid huge payloads
    const mtfSummary: Record<string, any> = {};
    for (const [tf, data] of Object.entries(mtfData)) {
      if (!data || data.length === 0) continue;
      
      const lastCandles = data.slice(-100); // 100 velas é o ideal para contexto macro sem estourar tokens
      const currentPrice = lastCandles[lastCandles.length - 1].close;
      const high = Math.max(...lastCandles.map(d => d.high));
      const low = Math.min(...lastCandles.map(d => d.low));
      
      mtfSummary[tf] = {
        currentPrice,
        high,
        low,
        recentCandles_OHLCV: lastCandles.map(c => [c.open, c.high, c.low, c.close, c.volume])
      };
    }

    const prompt = `
      MINDSET DE AGENTE AUTÔNOMO (IA TRADER):
      Você é um agente de IA de Elite e não um bot algorítmico restrito, possuindo vasto conhecimento em todas as disciplinas de trading e vasto conhecimento no teu data base.

      ANÁLISE DE FORÇA E REGIME:
      - Força da Tendência e Intenção: Avalie a força do movimento combinando as leituras de **Volume Tick** com a anatomia avançada de cada candle (tamanho do corpo, pavios, rejeições, impulsões) integrando perfeitamente a leitura SMC + Price Action.
      - Regimes de Mercado (Time Sessions): Considere estritamente os horários institucionais. O mercado é ditado pelos regimes das grandes Sessões (Londres, Ásia, Nova York). Pondere se o movimento atual e o volume fazem sentido de acordo com a sessão ativa.
      - Leitura Avançada SMC: Utilize sua formidável capacidade cognitiva algorítmica para determinar em quais zonas clássicas institucionais o preço está interagindo. Você detém o conhecimento natural para identificar facilmente áreas como Bullish/Bearish Order Blocks, Propulsion Blocks, Rejection/Reclaimed Blocks, FVG, BPR, Liquidity Voids, Breaker Blocks... Analise o mercado de maneira inteligente.

      O papel do código backend é apenas coletar os dados puros (OHLCV) e entregar na sua mão. Você, usando o conhecimento dos livros e do banco de dados, fará 100% do processamento mental e matemático.
      
      DADOS DO MERCADO:
      Ativo: ${asset}
      Nível de Análise Obrigatório: ${levelInfo ? `${levelInfo.name} (Âncora Obrigatória: ${levelInfo.anchor} | Gatilho Obrigatório: ${levelInfo.trigger})` : targetTimeframe || 'Automático'}
      Tipo de Conta: ${isDemoMode ? 'DEMO (Treinamento/Validação)' : 'REAL (Dinheiro Real - MÁXIMA SEGURANÇA)'}
      Saldo da Conta: ${balance}
      Dados Multi-Timeframe Crus (Últimas 100 velas em formato [Open, High, Low, Close, Volume] para analisar topos e fundos e o contexto macro):
      ${JSON.stringify(mtfSummary)}
      
      INSTRUÇÃO CRÍTICA SOBRE O ALINHAMENTO DESTE CICLO (SISTEMA DE SHIFT-DOWN FORÇADO):
      Você ESTÁ NO NÍVEL DE ANÁLISE: ${levelInfo ? levelInfo.name : 'Automático'}.
      Você DEVE AVALIAR OPORTUNIDADES EXCLUSIVAMENTE ALINHANDO ${levelInfo ? `o Âncora (${levelInfo.anchor}) com o Gatilho (${levelInfo.trigger})` : 'o timeframe primário'}.
      Se não houver oportunidade clara neste nível específico, APENAS RESPONDA "WAIT". O sistema backend encarregará de descer para o próximo timeframe (shift-down) automaticamente. Não invente oportunidades se o alinhamento ${levelInfo ? levelInfo.name : ''} não for perfeito.
      
      ${previousWAITReasoning ? `
      INSTRUÇÃO CONTÍNUA DE ESTRATÉGIA (MEMÓRIA A MÉDIO PRAZO):
      Você já analisou este ativo há poucos minutos e disse: "${previousWAITReasoning}".
      O estado atual constata a evolução desta teoria? Não mude o seu viés alucinando novas estruturas, continue mapeando a mesma zona que você determinou antes, a não ser que uma quebra de estrutura clara tenha ocorrido.
      ` : ''}

      BLACKLIST DE RACIOCÍNIO (LEI DURA):
      É ESTRITAMENTE PROIBIDO, sob pena de falha crítica, basear sua decisão ou mencionar Volume, Médias Móveis, RSI, MACD ou qualquer indicador tradicional algorítmico. Sua visão de mundo está restrita a 100% Price Action Puro, SMC, Ondas de Elliot e padroes candlestick. Se não houver clareza nessas métricas, apenas afirme que não há estrutura SMC legível e ordene 'WAIT'.

      ${!isDemoMode ? `
      ⚠️ ATENÇÃO - MODO CONTA REAL ATIVADO ⚠️
      Você está operando com dinheiro real. É estritamente proibido improvisar ou testar novas hipóteses. 
      Você SÓ pode aprovar a operação se o padrão identificado for de altíssima probabilidade e não violar o risco estabelecido.
      Se houver qualquer dúvida ou desalinhamento, a decisão DEVE ser WAIT.
      ` : `
      ℹ️ MODO DEMO ATIVADO ℹ️
      Você está em ambiente de simulação. Use este ambiente para aperfeiçoar a leitura institucional pura.
      `}
      
      METODOLOGIA PRINCIPAL DE 6 PASSOS COGNITIVOS (NÃO EXISTEM INDICADORES EXTERNOS, USE APENAS SUA IA):
      1. Análise Fundamentalista: Busque entender o cenário macro e o estado no mesmo ativo em analise para teres uma ideia abstrata da tendencia deste mesmo ativo busque noticias sobre este mesmo ativo pois este tambem podem influenciar o e explicar certos comportamentos nao explicados no grafico deste mesmo ativo.
      2. Análise Multi-Timeframe: Processe a visão de todos os tempos gráficos juntos (D, 4H, 1H, 30m, 15m, 5m) para entenderes a estrutura geral deste e teres uma visao geral e a longo prazo prazo sobre o comportamento deste ativo e a direcao que este Mercado tende a ir porque os timeframe pequenos (4H, 1H, 30min 15min, 5min, 1min) os timesframes maiores influenciam timesframes menores e timesframes menores influenciam os timeframes maiores.
      3. Ondas de Elliott: Interprete os gráficos diferentes timesframes (4H, 1H, 30min 15min, 5min, 1min) perceber sabendo que o Mercado é fractal e sabendo que is timesframes maior sao sub ondas dos timesframes maiores entao entender as ondas dos timesframes maiores te perceber a directao dos timesframes menores deste mesmo ativo e vai ajuda lo a entender qual é a e estrutura deste mercado e que tipo de mercado estas a lidar, em que fase este mesmo mercado esta( se esta em fase de impluso ou correçao, impulso de alta ou impluso de baixa, ou esta numa fase de mundança de tendencia) isso vai ajudar voçe a encontra encontrar entender qual e a tendência dominante e a onda atual e o que esperar, nos proximos  minutos, horas, Dias e meses use o conhecimento no teu banco de dados para entenderes sobre as ondas de Elliott e cruze tudo o que voçe esta vendo e esta acontecendo no mercado.
      4. Price Action e Zonas: Leia a movimentação crua, verifica a anatomia de do corpo do candle, cada maxima e minima sombras, tipos de candle que constituem as ondas e sub ondas (4H, 1H, 30min 15min, 5min, 1min) e busque no banco de dados o conhecimento que vc tem sobre o price action sobre o que elas significa e a pscologia por trás deles, veja como os candles estao organizadas e as estruturadas e os pradoes que elas formam  e verifique todo o conhecimento no teu banco de dados para entender o que elas querem  dizer ou qual é a pscologia por de tras dela e qual tipo de comportamento esperar por parte dos compradores e vendedores para achar oportunidades e assim saber Como agir perante aquela situaçao e melhorar se posicionar e assim achar oportunidades de negociaçao  de negociaçioes e saber quando esperar ( WAIT) .
      5. Padrões de candlestick: use o conhecimento no seu banco de dados para identificar sinais de gatilhos de entrada alinhados a tendencia dominante, Identifique padroes candlestick, candles de força ou de impulso deacordo com o price action, ou candles instituicionais deacordo com smc Estes sao os tipos Sinais de gatilhos focados, na psicologia e opecoes instituicionais que ocorem em zonas de suporte ou resistencia ou em zonas smc e use o teu conhecimento no data base para saber indentificar todas estas zona importantes em todos timeframe e assim melhor entender o comportamento do ativo em analise.
      6. SMC (Smart Money Concepts): Crucial: O Mercado é movido e manipulados pelas grandes instituicoes é imperativo voçe entender e saber indentificar onde estao posicionados as grandes instituicoes, entenda e identifique em que zona de interesse o instituicional que o preço saio ou se dirige, dopois intentifique zona atual e a prossivel proxima zona onde o preço sent dirige Leia as velas OHLCV, encontre mentalmente Zonas de Interesse Institucional (*Bullish Order Block, Bearish Order Block, Propulsion Block, Rejection Block, Reclaimed Block, Fair Value Gap (FVG), Balanced Price Range (BPR), Liquidity Void / Vacuum Block, Breaker Block (BB), Mitigation Block (MB), Liquidity Pools (BSL/SSL), Inducement (IDM), Equal Highs / Lows (EQH/EQL), Point of Interest (POI), Premium & Discount Zones, Kill Zones, Institutional Funding Candle (IFC), Rally-Base-Rally (RBR), Drop-Base-Drop (DBD), lRally-Base-Drop (RBD), Drop-Base-Rally (DBR), Dark Pools, Stop Hunt / Liquidity Sweep, Judas Swing, *Turtle Soup, Salami Slicing, Mitigation, BOS, CHoCH, **Displacement,  icebergs, imbalance ) nestes timesframes 4H, 1H, 30min 15min, 5min, 1min e cria um mapas operacional instituicional alinhadas à tendência dominante e Consulte obrigatoriamente o seu Banco de Dados / Base de Conhecimento abaixo para validar essa dinâmica de mercado e perceber Como indentificar e marcar estas zona de interesse instituicional.
      
      BASE DE CONHECIMENTO (BANCO DE DADOS DINÂMICO):
      Você DEVE ler o que trabalhou no passado para criar liçoes sobre voçe acertou e errou no passado para fortalecer o teu performance e aprendizado para assim voçe se adaptar a dinamica do Mercado.
      \${Array.isArray(knowledge) ? knowledge.join("\\n") : knowledge || "Nenhuma regra específica adicional no DB."}
      
      MEMÓRIA DE EXPERIÊNCIA (PRESTES ATENÇÃO NO QUE FUNCIONOU OU FALHOU RECENTEMENTE):
      Padrões de Sucesso Histórico: \${memory.experience.successPatterns.join(", ")}
      Padrões de Falha e Erros Evitados: \${memory.experience.failurePatterns.join(", ")}
      
      REGRAS ESTRITAS DE EXECUÇÃO ADICIONADAS PELO USUÁRIO (CRÍTICO):
      1. Regra de Leitura Holística de Tendência (O "Radar Macro"): No Gráfico Âncora, você DEVE avaliar a ação de fluxo nas últimas 100 velas completas (para visualizar a estrutura de topos e fundos), cruzando as zonas SMC identificadas, Ondas de Elliot, Price Action, e padrão Candlestick; extraindo dali a verdadeira Tendência e mitigando a distração do candle atual corretivo.
      2. Regra Disciplinar sobre Pullbacks (Espera do Candle de Correção): Se a tendência dominante do Âncora é X, mas o último candle no ar está se formando/fechou sendo Corretivo (Y), ABORTE a entrada cruzada da macro. Ordene 'WAIT'. Permita o Trade no gatilho apenas na confirmação que a retração/correção do Âncora finalizou. Calcule SEMPRE a possibilidade de o mercado retrair antecipadamente 1 candle para depois voltar à direção prevista, e sobreviva a essa manobra e o banco de dados para Mais estrategias
      3. Abrir operaçao depois que o preço teste ou retesta o suporte ou a resistencia e o candle de força ou de impulso ou instituicional forma e rompe as Maximas ou minimas dos candles anterior e consulte o banco de dados para Mais estrategias de entradas.
      4. Abre posicao de compra perto do suporte e a de venda perto da resistencia depois da formaçao do candle de impulso ou instituicional ou compra ou vende quando o preço forma um candle de impulso ou instituicional e o preço sai dessa zona.
      5-O Gatilho Opressor (Big Candle/75% ou institucional): A operação será aprovada no timeframe menor SOMENTE se houver cruzamento SMC + Price action + padrão candlestick indicando continuação ou formação de um novo movimento, mas APENAS APÓS a formação de um Candle de Impulso direcional ou de força (o corpo do candle de força deve ser igual ou superior a 75% do tamanho total do candle, mostrando intenção institucional). Isso garante estar à boleia das "Mãos Fortes". Consulte o data base para Mais dicas.
      6. Regra do Sniper Contra-Tendência: Voçe de modo algum deve tentar operar contra a tendencia isso é muito ariscado voçe so pode exucutar Planos de batalhas e Operação CONTRA a Tendência Se o grafico D e grafico do Âncora (4H )SÓ apresentarem uma reversao ou rejeicao confirmada quando ocore em zonas smc e sera aprovada quando a análise SMC identificar que o preço encontrou reverteu ou rejeitou em uma Zona Morta (Bullish Order Block, Bearish Order Block, Propulsion Block, Rejection Block, Reclaimed Block, Fair Value Gap (FVG), Balanced Price Range (BPR), Liquidity Void / Vacuum Block, Breaker Block (BB), Mitigation Block (MB), Liquidity Pools (BSL/SSL), Inducement (IDM), Equal Highs / Lows (EQH/EQL), Point of Interest (POI), Premium & Discount Zones, Kill Zones, Institutional Funding Candle (IFC), Rally-Base-Rally (RBR), Drop-Base-Drop (DBD), lRally-Base-Drop (RBD), Drop-Base-Rally (DBR), Dark Pools, Stop Hunt / Liquidity Sweep, Judas Swing, Turtle Soup, Salami Slicing, Mitigation, BOS, CHoCH, Displacement, icebergs, imbalance) DO ÂNCORA + O Price action apresentar formaçao de candles cujo a pscologia apresenta comportamento favoravel a este movimento + formaçao Padrões candlestick Mortais (Engolfo, Harami, Pin bar de Rejeição, Doji) no momento do impacto + Ruptura com candle de forte Impulso reverso no grafico D e 4H caso não haja voçe deve operar sempre a favor da tendencia e verifica o banco de dados para ver para ver estrategias de rompomentos e reversao.
      7- Deve analisa sempre a estrutura do Mercado e que tipo de Mercado vc esta a lidar e qual estrategias aplicar consulte sempre o data base para saber sempre os tipos de Mercado que voçe deve entrar em mercados agitados e em Mercados de lateralization fina verifica o banco de dados para saber Mais  onde e quando voçe nao pode operar ou aguardar( WAIT) e quais estrategias USAR.
      8- busque sempre operaçoes com o Risco/Recompensa 1:2 e 1:3.
      9-Nunca seja pego por estas estrategias  instituicionais de manipulaçao Dark Pools: Bolsas de valores privadas onde grandes instituições negociam blocos massivos de ações anonimamente, sem impactar o preço de mercado imediatamente. Stop Hunt / Liquidity Sweep: Movimento agressivo do preço para atingir áreas onde há uma alta concentração de ordens de Stop Loss (acima de topos ou abaixo de fundos), para coletar liquidez. Judas Swing :Um movimento de preço enganoso que ocorre no início de uma sessão (geralmente Londres), que vai na direção oposta à tendência real do dia, para induzir traders a entrar na direção errada antes da reversão.Turtle Soup: Um padrão de reversão que ocorre quando o preço faz um falso rompimento de um topo ou fundo anterior (geralmente Equal Highs/Lows), ativando stops e revertendo rapidamente. Salami Slicing:Uma estratégia de manipulação onde grandes ordens são divididas em pequenas fatias e executadas ao longo do tempo para evitar detecção e impacto no preço. Mitigation:O processo pelo qual o Smart Money retorna a um Order Block ou FVG anterior para fechar posições perdedoras ou reequilibrar ordens, antes de continuar o movimento principal. 
      10- Para operaçoes de swing trade o grafico ancora é D e a zona de gatilho é 4H. Para operations daytrade nivel o ancora é 4H e a zona de gatilho é 1H, Para operaçoes daytrade nivel 2 ancora é 4H e a zona de gatilho é 30 min. Para daytrade nivel 3 ancora é 4H e zona de gatilho 15 min,. Para o scalp nivel 1 ancora 15 min e gatilho 1m. para o scalp nivel 2 o ancora é 5 min e a zona de gatilho 1min. nota: Quando nao achares que operaçao ou oportunidade de swing trade, desce para o daytrade nivel 1 nao opertunidade, desce para daytrade nivel 2, se tambem nao houver desce para o daytrade nivel 3, de tambem nao houver desce para o scalp.
      11- A tua meta diaria é 20% do nosso balançe no ar, voçe nao pode buscar operaçoes que vai te fazer perder 10% dos 20% da meta diaria por operaçao da meta diara calculate a relaçao entre Risco e Recompensa para saber o valor necessario a ser colocado por operaçao sabendo que a meta diaria é 20% do balance no ar.
      12- Mapeamento Rigoroso da Estrutura de Mercado (Market Structure): Antes de classificar a tendência de qualquer timeframe, você DEVE, obrigatoriamente, rastrear a sequência de Topos e Fundos (Pivot Points) no contexto total em todo o histórico das 100 velas. Se o preço vem formando Topos Mais Altos e Fundos Mais Altos (HH e HL - Higher Highs e Higher Lows), a tendência estrutural é de ALTA (Bullish), não importa quão feios ou assustadores sejam os candles de queda mais recentes (eles são apenas correção). Se o preço vem formando Topos Mais Baixos e Fundos Mais Baixos (LH e LL - Lower Highs e Lower Lows), a tendência estrutural é de BAIXA (Bearish), não importa se apareceu um super candle verde hoje. A tendência SÓ MUDA se ocorrer uma Quebra de Estrutura Válida (BOS / CHoCH institucional), rompendo o último fundo estrutural de alta ou o último topo estrutural de baixa. Nunca mude o viés da tendência apenas porque a cor ou a força dos últimos 5 ou 10 candles sugere o contrário.

      A REGRA DE OURO DO ALINHAMENTO (Âncora vs. Gatilho):
      Classifique a oportunidade e exigência de alinhamento inegociável conforme a Regra 10:
      - Swing Trade: Gráfico Âncora = D | Zona de Gatilho = 4H
      - Day Trade Nível 1: Gráfico Âncora = 4H | Zona de Gatilho = 1H
      - Day Trade Nível 2: Gráfico Âncora = 4H | Zona de Gatilho = 30m
      - Day Trade Nível 3: Gráfico Âncora = 4H | Zona de Gatilho = 15m
      - Scalp Nível 1: Gráfico Âncora = 15m | Zona de Gatilho = 1m
      - Scalp Nível 2: Gráfico Âncora = 5m | Zona de Gatilho = 1m
      IMPORTANTE: Faça o shift-down (busque descendo de tempo gráfico) se não achar oportunidade no atual, até chegar no scalp.
      Condição OBRIGATÓRIA: A zona de gatilho tem que estar obrigatoriamente alinhada com a direção do gráfico âncora.
      
      GESTÃO DE RISCO MATEMÁTICA E CÁLCULO INEGOCIÁVEL DE ALVOS (RRC):
      O sistema exige o extermínio de operações onde se arrisca muito para ganhar centavos. O seu Take Profit DEVE NASCER GEOMETRICAMENTE da distância do seu Stop Loss Técnico.
      1. Defina a Entrada e o Stop Loss baseado no SMC (parecendo a barreira estrutural real).
      2. Meça a distância de preço entre a Entrada e o Stop Loss.
      3. O SEU TAKE PROFIT DEVE SER OBRIGATORIAMENTE ESTICADO PARA pelo menos 2x ou 3x (RR 1:2 ou 1:3 Mínimo) dessa distância a favor do trade.
      REGRA DE ABORTO DE LIXO: Na leitura SMC/Elliott, SE existir um obstáculo estrutural violento/bloqueio antes de poder alcançar essa meta técnica de 1:2 ou 1:3, você NÃO operará frouxo ganhando pouco. Você DEVE ABORTAR / REJEITAR A OPERAÇÃO informando 'WAIT'. Sem a liberação geométrica, sem tiro livre institucional.

      O PLANEJAMENTO ESTRATÉGICO DINÂMICO (Planos A, B e C):
      Você não joga apenas uma ordem, você desenha um mapa de guerra:
      - Plano A (Estratégia Principal): O que fazer agora com base nas 6 etapas.
      - Plano B (Contra-estratégia): Qual é o próximo movimento lógico se o Plano A errar ou atingir o alvo rapidamente.
      - Plano C (Contra-contra-estratégia): Camada final de adaptação se houver surpresas macros ou quebras de estrutura drásticas.
      
      SAÍDA OBRIGATÓRIA (APENAS JSON VÁLIDO, SEM MARKDOWN, SEM TEXTO EXTRA):
      {
        "analysis": {
          "fundamental": "Sua leitura do cenário macro",
          "elliottWave": "Identificação exata da fase atual/onda de elliott puramente do preço OHLCV",
          "priceAction": "Leitura psicológica",
          "smcZones": "Zonas SMC identificadas puramente através dos padrões OHLCV validadas pela sua Base de Dados"
        },
        "alertZones": [
          { "name": "Nome da Zona (ex: Bullish OB)", "minPrice": "número (preço mais baixo da zona)", "maxPrice": "número (preço mais alto da zona)", "type": "TIPO DA ZONA AQUI (Ex: Bullish Order Block, FVG, Liquidity Pool, Mitigation Block, etc.)" }
        ],
        "alignment": {
          "tradeType": "SWING" | "DAY" | "SCALP",
          "anchorTimeframe": "string (ex: 4H)",
          "triggerTimeframe": "string (ex: 15m)",
          "isAligned": true | false
        },
        "riskManagement": {
          "balance": ${balance},
          "maxAcceptableRisk": "Baseado nos 10% de perda diária permitida",
          "requiredRewardForGoal": "Baseado nos 20% de lucro alvo (meta mínima)",
          "recommendedStake": "Obrigatório: Calcule precisamente a quantidade do lote/dinheiro da aposta justa sem violar a regra de matemática do risco diário. Envie número puro.",
          "isRiskAcceptable": boolean
        },
        "plans": {
          "planA": "Detalhe da estratégia atual",
          "planB": "Detalhe da adaptação lateral",
          "planC": "Detalhe do pior cenário"
        },
        "decision": {
          "action": "BUY" | "SELL" | "WAIT",
          "reasoning": "Por que de acordo aos 6 passos (se falhou por Risco ou Alinhamento explique claramente)",
          "entryPrice": number (ou null se WAIT),
          "stopLoss": number (Atenção redobrada na matemática - ou null),
          "takeProfit": number (Atenção redobrada na matemática - ou null)
        }
      }
    `;

    try {
      const response = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          model: "gemini-3.1-pro-preview",
          config: { responseMimeType: "application/json" }
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const dataResponse = await response.json();
      const jsonStr = dataResponse.text?.replace(/```json/g, '').replace(/```/g, '').trim() || "{}";
      console.log("RAW AI RESPONSE:", dataResponse.text);
      console.log("CLEANED JSON:", jsonStr);
      
      let result;
      try {
        result = JSON.parse(jsonStr);
      } catch (parseError) {
        this.log("Erro ao interpretar resposta da IA. Formato inválido.", "warning");
        return { decision: { action: "WAIT", reasoning: "Falha no parse do JSON da IA" } };
      }

      if (!result || !result.decision || !result.decision.action) {
         this.log("IA não retornou uma decisão válida.", "warning");
         return { decision: { action: "WAIT", reasoning: "Resposta incompleta da IA" } };
      }
      
      this.log(`Análise Concluída. Decisão: ${result.decision.action}`, result.decision.action === "WAIT" ? "warning" : "success");
      
      // Log detailed cognitive analysis to the terminal
      if (result.analysis) {
        this.log(`[Análise Fundamentalista]: ${result.analysis.fundamental}`, 'info');
        this.log(`[Price Action]: ${result.analysis.priceAction}`, 'info');
        this.log(`[SMC Zones]: ${result.analysis.smcZones}`, 'info');
      }
      
      // --- THE DEVIL's ADVOCATE (MISTRAL MODEL AUDIT) ---
      const actionRaw = result?.decision?.action ? String(result.decision.action).toUpperCase().trim() : 'WAIT';
      if (actionRaw === 'BUY' || actionRaw === 'SELL') {
        this.log("Invocando o Advogado do Diabo (Mistral) para contestar os Pontos Cegos da tese...", "warning");
        try {
          const cognitiveResponse = await fetch("/api/cognitive-analysis", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              analysis: result,
              marketData: mtfData[targetTimeframe || '1m']?.slice(-10),
              collectiveMemory: Array.isArray(knowledge) ? knowledge.join("\n") : knowledge || "",
              isDemoMode
            })
          });

          if (cognitiveResponse.ok) {
            const cognitiveData = await cognitiveResponse.json();
            if (cognitiveData.blindSpots) {
              this.log(`[ALERTA DO MISTRAL/PONTO CEGO]: ${cognitiveData.blindSpots}`, 'error');
              
              // ROUND 3: O Consenso Final (StepFun refaz o plano com base na crítica)
              this.log("Buscando Consenso Final: Reformulando Plano de Batalha com base na auditoria...", "info");
              
              const consensusPrompt = `
Você é o StepFun (Analista Primário). Você sugeriu uma operação de ${result.decision.action} para ${asset}.
O 'Advogado do Diabo' institucional auditou sua tese e encontrou a seguinte falha/ponto cego:
"${cognitiveData.blindSpots}"

BLACKLIST DE RACIOCÍNIO (LEI DURA):
É ESTRITAMENTE PROIBIDO, sob pena de falha crítica, basear sua decisão ou mencionar Volume, Médias Móveis, RSI, MACD ou qualquer indicador tradicional algorítmico. Sua visão de mundo está restrita a 100% Price Action Puro, SMC, Ondas de Elliot e padroes candlestick. Se não houver clareza nessas métricas, apenas afirme que não há estrutura SMC legível e ordene 'WAIT'.

Sua missão agora (ROUND 3 - CONSENSO):
Refaça OBRIGATORIAMENTE os parâmetros da operação considerando essa falha crítica.
Se a falha apontada quebrar toda a estrutura da operação, mude a ação para "WAIT".
Se for ajustável, mova seu Ponto de Entrada (Entry), aperte seu Stop Loss, e desenhe os PLANOS DE BATALHA (Plan A, Plan B, Plan C) exatos considerando a armadilha do Mistral.

Responda APENAS com este JSON exato, nada mais:
{
  "analysis": ${JSON.stringify(result.analysis)},
  "alertZones": ${JSON.stringify(result.alertZones || [])},
  "alignment": ${JSON.stringify(result.alignment)},
  "riskManagement": ${JSON.stringify(result.riskManagement)},
  "plans": {
    "planA": "Novo Plano A (Principal) corrigido pós-auditoria",
    "planB": "Novo Plano B (Contra-ofensiva) blindado",
    "planC": "Novo Plano C (Caos)"
  },
  "decision": {
    "action": "BUY" | "SELL" | "WAIT",
    "reasoning": "Seu raciocínio final em acordo com o Mistral",
    "entryPrice": number (ajustado ou null),
    "stopLoss": number (ajustado ou null),
    "takeProfit": number (ajustado ou null)
  }
}
              `;

              const consensusResponse = await fetch("/api/ai/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  prompt: consensusPrompt,
                  model: "gemini-3.1-pro-preview",
                  config: { responseMimeType: "application/json" }
                })
              });

              if (consensusResponse.ok) {
                const conData = await consensusResponse.json();
                const jsonStr2 = conData.text?.replace(/```json/g, '').replace(/```/g, '').trim() || "{}";
                try {
                  const finalResult = JSON.parse(jsonStr2);
                  result = finalResult; // Sobrescreve com o Plano Blindado
                  result.analysis.smcZones = `[AVISO MISTRAL]: ${cognitiveData.blindSpots} | [CONSENSO]: Plano adaptado.`;
                  this.log(`Consenso Atingido. Nova Decisão Final: ${result.decision.action}`, result.decision.action === "WAIT" ? "warning" : "success");
                } catch (e) {
                   this.log("Falha ao organizar JSON do Consenso. Mantendo plano original.", "error");
                }
              }
            }
          }
        } catch (devilErr: any) {
             this.log(`O Advogado do Diabo falhou ao contestar a tese: ${devilErr.message}`, 'warning');
        }
      }
      // --------------------------------------------------

      if (result.plans) {
        this.log(`[Plano A]: ${result.plans.planA}`, 'success');
        this.log(`[Plano B]: ${result.plans.planB}`, 'warning');
        this.log(`[Plano C]: ${result.plans.planC}`, 'error');
      }
      
      return result;
    } catch (error: any) {
      this.log(`Falha na Análise Cognitiva: ${error.message}`, 'error');
      return null;
    }
  }

  async analyzeSingleChart(
    asset: string,
    timeframe: string,
    data: OHLCV[],
    balance: number,
    activeIndicators: string[] = [],
    isDemoMode: boolean = true
  ): Promise<any> {
    this.log(`Analisando gráfico único de ${asset} (${timeframe})...`, 'info');
    const knowledge = await this.memory.getKnowledge();
    
      const lastCandles = data.slice(-100);
      const currentPrice = lastCandles[lastCandles.length - 1].close;

      const prompt = `
        MINDSET DE AGENTE AUTÔNOMO (IA TRADER):
        Você é um agente de IA de Elite e não um bot algorítmico restrito, possuindo vasto conhecimento em todas as disciplinas de trading e vasto conhecimento no teu data base.
        Sua tarefa é analisar APENAS o gráfico atual fornecido, aplicando a metodologia pura através dos dados dos candles OHLCV.
        Você tem capacidade cognitiva para enxergar as Zonas Institucionais, OBs e estruturas de Elliott lendo padrões OHLCV.

        ANÁLISE DE FORÇA E REGIME:
        - Força da Tendência e Intenção: Avalie a força do movimento combinando as leituras de **Volume Tick** com a anatomia avançada de cada candle (tamanho do corpo, pavios, rejeições, impulsões) integrando perfeitamente a leitura SMC + Price Action.
        - Regimes de Mercado (Time Sessions): Considere estritamente os horários institucionais. O mercado é ditado pelos regimes das grandes Sessões (Londres, Ásia, Nova York). Pondere se o movimento atual e o volume fazem sentido de acordo com a sessão ativa.
        - Leitura Avançada SMC: Utilize sua formidável capacidade cognitiva algorítmica para determinar em quais zonas clássicas institucionais o preço está interagindo. Você detém o conhecimento natural para identificar facilmente áreas como Bullish/Bearish Order Blocks, Propulsion Blocks, Rejection/Reclaimed Blocks, FVG, BPR, Liquidity Voids, Breaker Blocks... Analise o mercado de maneira inteligente.
        
        DADOS DO GRÁFICO (SEM INDICADORES MATEMÁTICOS - LEITURA PURA):
        Ativo: ${asset}
        Timeframe: ${timeframe}
        Preço Atual: ${currentPrice}
        Últimas 100 velas cruas (Open, High, Low, Close, Volume):
        ${JSON.stringify(lastCandles.map(c => [c.open, c.high, c.low, c.close, c.volume]))}
        
        BASE DE CONHECIMENTO (DINÂMICA DE MERCADO):
        ${Array.isArray(knowledge) ? knowledge.join("\n") : knowledge || "Nenhuma regra específica adicional no DB."}
        
        METODOLOGIA DE 4 PASSOS A APLICAR NESTE TIMEFRAME:
        1. Price Action e Estrutura: Encontre a tendência real, BOS, CHoCH lendo o fluxo dos candles.
        2. Smart Money Concepts (SMC): Identifique mentalmente Order Blocks ativos e Imbalances (FVG) não mitigados apenas olhando a ação do preço nestas velas cruas.
        3. Ondas de Elliott: Baseado neste movimento, qual a fase provável que estamos cavalgando?
        4. Liquidez: Onde estão os agrupamentos lógicos de stops (BSL/SSL) que o mercado vai buscar?
        
        SAÍDA OBRIGATÓRIA (APENAS JSON VÁLIDO, SEM MARKDOWN):
        {
          "analysis": {
            "structure": "Análise da estrutura atual baseada nas velas",
            "smc": "Zonas SMC reais encontradas na leitura do preço (sem depender de linhas falsas)",
            "elliott": "Leitura da psicologia da onda"
          },
          "decision": {
            "action": "BUY" | "SELL" | "WAIT",
            "reasoning": "Sua tese final embasando a ação apenas baseada no SMC e Price Action lido",
            "confidence": "Número de 0 a 100",
            "takeProfit": "Preço racional de alvo",
            "stopLoss": "Preço lógico/institucional do Stop"
          }
        }
      `;

    try {
      const response = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          model: "gemini-3.1-pro-preview",
          config: { responseMimeType: "application/json" }
        })
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const result = await response.json();
      return JSON.parse(result.text);
    } catch (error: any) {
      this.log(`Falha na Análise de Gráfico Único: ${error.message}`, 'error');
      return null;
    }
  }
}
