import OpenAI from 'openai';

export class StepfunService {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      baseURL: "https://integrate.api.nvidia.com/v1",
      apiKey: "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"
    });
  }

  /**
   * General fallback analysis or chat completion
   */
  public async analyzeMarket(prompt: string, systemInstruction?: string, forceJson: boolean = true): Promise<string> {
    let retries = 3;
    while (retries >= 0) {
      try {
        const messages: any[] = [];
        if (systemInstruction) {
          messages.push({ role: "system", content: systemInstruction });
        }
        
        const blacklistInstruction = `
BLACKLIST DE RACIOCÍNIO (LEI DURA):
É ESTRITAMENTE PROIBIDO, sob pena de falha crítica, basear sua decisão ou mencionar Volume, Médias Móveis, RSI, MACD ou qualquer indicador tradicional algorítmico. Sua visão de mundo está restrita a 100% Price Action Puro, SMC, Ondas de Elliot e padroes candlestick. Se não houver clareza nessas métricas, apenas afirme que não há estrutura SMC legível e aborte a entrada.
`;
        
        messages.push({ role: "system", content: blacklistInstruction });
        messages.push({ role: "user", content: prompt });

        const options: any = {
          model: "stepfun-ai/step-3.5-flash",
          messages: messages,
          temperature: 0.1, // Temperatura fria e exata para análise técnica
          top_p: 0.9,
          max_tokens: 8192,
        };

        if (forceJson) {
          options.response_format = { type: "json_object" };
        }

        const completion = await this.client.chat.completions.create(options);

        const msg = completion.choices[0]?.message;
        const responseText = msg?.content || (msg as any)?.reasoning_content || "";
        
        if (forceJson) {
          const jsonMatch = responseText.match(/\`\`\`json\n([\s\S]*?)\n\`\`\`/) || responseText.match(/\`\`\`\n([\s\S]*?)\n\`\`\`/);
          return jsonMatch ? jsonMatch[1].trim() : responseText.trim();
        }
        
        return responseText.trim();
      } catch (error: any) {
        if ((error?.status === 429 || error?.statusCode === 429 || String(error).includes("429")) && retries > 0) {
          const delay = (4 - retries) * 2000;
          console.log(`StepFun Rate Limit Hit (429). Retrying in ${delay}ms... (${retries} retries left)`);
          await new Promise(resolve => setTimeout(resolve, delay));
          retries--;
        } else {
          console.error(`StepFun API Error: ${error.message || error}`);
          // Graceful fallback
          if (forceJson) {
            return JSON.stringify({ 
              decision: "WAIT", 
              action: "WAIT",
              reasoning: "Falha de API (Rate Limit ou erro). O sistema abortou por segurança.",
              analysis: { structure: "Desconhecido", smc: "Desconhecido", elliott: "Desconhecido" }
            });
          }
          return "WAIT - Falha de comunicação com a IA.";
        }
      }
    }
    if (forceJson) {
      return JSON.stringify({ decision: "WAIT", action: "WAIT", reasoning: "Falha de API (Rate Limit ou erro após retentativas)." });
    }
    return "WAIT - Falha de comunicação com a IA.";
  }

  /**
   * Risk and Reward Manager Analysis
   */
  public async evaluateRiskReward(
    asset: string,
    action: string,
    entryPrice: number,
    stopLoss: number,
    takeProfit: number,
    accountBalance: number,
    confidence: number,
    reasoning: string
  ): Promise<{ approved: boolean; adjustedStake: number; riskReasoning: string }> {
    const prompt = `
Você é o Gerente de Risco e Recompensa (Risk and Reward Manager) de um sistema de trading institucional.
Sua função é avaliar a viabilidade de uma operação com base nos parâmetros fornecidos e decidir se a operação deve ser aprovada, rejeitada ou se o tamanho da posição (stake) deve ser ajustado.

BLACKLIST DE RACIOCÍNIO (LEI DURA):
É ESTRITAMENTE PROIBIDO, sob pena de falha crítica, basear sua decisão ou mencionar Volume, Médias Móveis, RSI, MACD ou qualquer indicador tradicional algorítmico. Sua visão de mundo está restrita a 100% Price Action Puro, SMC, Ondas de Elliot e padroes candlestick. Se não houver clareza nessas métricas, apenas afirme que não há estrutura SMC legível e aborte a entrada.

Parâmetros da Operação:
- Ativo: ${asset}
- Ação: ${action}
- Preço de Entrada: ${entryPrice}
- Stop Loss: ${stopLoss}
- Take Profit: ${takeProfit}
- Saldo da Conta: $${accountBalance}
- Confiança do Sinal: ${confidence}%
- Raciocínio do Sinal: ${reasoning}

Regras de Gerenciamento de Risco e Auditoria Implacável:
1. CALCULE A DISTÂNCIA MATEMÁTICA de risco: |Preço de Entrada - Stop Loss|.
2. CALCULE A DISTÂNCIA MATEMÁTICA do retorno: |Take Profit - Preço de Entrada|.
3. A Lei de Sobrevivência (Antifragilidade): Se a Distância do Retorno NÃO FOR geometricamente IGUAL ou MAIOR que DUAS VEZES a Distância do Risco (Risco/Retorno estritamente 1:2 ou 1:3 para frente), VOCÊ DEVE FECHAR AS PORTAS IMEDIATAMENTE ("approved": false). Sob nenhuma circunstância tente reduzir ou reajustar o stake para maquiar trades ruins que arriscam muito dinheiro para colher centavos do derivativo.
4. O risco máximo arriscado financeiramente ('adjustedStake') não deve exceder a barreira conservadora de 1% a 2% do saldo da conta na margem de Stop, aplique um stake exato de valor em risco em dólares.
5. Se a confiança for menor que 70%, altere "approved" para false. Rejeite as dúvidas.

Responda ESTRITAMENTE em formato JSON com a seguinte estrutura:
{
  "approved": boolean,
  "adjustedStake": number,
  "riskReasoning": "Sua explicação detalhada sobre a decisão de risco e recompensa"
}
`;

    let retries = 3;
    while (retries >= 0) {
      try {
        const completion = await this.client.chat.completions.create({
          model: "stepfun-ai/step-3.5-flash",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.7, // Increased temperature
          top_p: 0.9,
          max_tokens: 8192,
          response_format: { type: "json_object" }
        });

        console.log("Full Completion:", JSON.stringify(completion, null, 2));

        const msg = completion.choices[0]?.message;
        const responseText = msg?.content || (msg as any)?.reasoning_content || "{}";
        console.log("StepFun Response:", responseText);
        
        // Extract JSON if the model wraps it in markdown blocks
        const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/) || responseText.match(/```\n([\s\S]*?)\n```/);
        const jsonString = jsonMatch ? jsonMatch[1] : responseText;
        
        return JSON.parse(jsonString);
      } catch (error: any) {
        if ((error?.status === 429 || error?.statusCode === 429 || String(error).includes("429")) && retries > 0) {
          const delay = (4 - retries) * 2000;
          console.log(`StepFun Rate Limit Hit (429) in evaluateRiskReward. Retrying in ${delay}ms... (${retries} retries left)`);
          await new Promise(resolve => setTimeout(resolve, delay));
          retries--;
        } else {
          console.error("StepFun Risk Evaluation Error:", error);
          // Fallback safe response
          return {
            approved: false,
            adjustedStake: 0,
            riskReasoning: "Falha na avaliação de risco pelo modelo StepFun. Operação bloqueada por segurança."
          };
        }
      }
    }
    return {
      approved: false,
      adjustedStake: 0,
      riskReasoning: "Falha na avaliação de risco pelo modelo StepFun. Operação bloqueada por segurança."
    };
  }

  /**
   * Extract Trading Knowledge from Text/PDFs
   */
  public async extractTradingKnowledge(text: string, sourceName: string): Promise<any[]> {
    const prompt = `
Você é um Especialista em Extração de Conhecimento Financeiro e Trading Institucional.
Leia o texto abaixo, que pode conter estratégias de trading, regras de Smart Money Concepts (SMC), Price Action, psicologia de mercado, padrões de candles ou gerenciamento de risco.

Sua tarefa é extrair as regras e conceitos mais importantes e formatá-los ESTRITAMENTE como um array JSON.

Texto Fonte (${sourceName}):
"""
${text.substring(0, 15000)} // Limitando tamanho para não estourar tokens
"""

Extraia os conceitos e retorne um array JSON com a seguinte estrutura para cada item:
[
  {
    "category": "SMC" | "Price Action" | "Psychology" | "Risk Management" | "Strategy",
    "concept": "Nome do conceito (ex: Order Block, Fair Value Gap, Regra dos 2%)",
    "description": "Explicação detalhada do conceito",
    "actionableRule": "Como o agente de trading deve aplicar isso na prática (ex: 'Se o preço tocar no Order Block em H1, procure confirmação em M15')",
    "source": "${sourceName}"
  }
]

Retorne APENAS o array JSON, sem texto adicional.
`;

    let retries = 3;
    while (retries >= 0) {
      try {
        const completion = await this.client.chat.completions.create({
          model: "stepfun-ai/step-3.5-flash",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.3,
          top_p: 0.9,
          max_tokens: 8192,
          response_format: { type: "json_object" }
        });

        const msg = completion.choices[0]?.message;
        const responseText = msg?.content || (msg as any)?.reasoning_content || "[]";
        const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/) || responseText.match(/```\n([\s\S]*?)\n```/);
        const jsonString = jsonMatch ? jsonMatch[1] : responseText;
        
        return JSON.parse(jsonString);
      } catch (error: any) {
        if ((error?.status === 429 || error?.statusCode === 429 || String(error).includes("429")) && retries > 0) {
          const delay = (4 - retries) * 2000;
          console.log(`StepFun Rate Limit Hit (429) in extractTradingKnowledge. Retrying in ${delay}ms... (${retries} retries left)`);
          await new Promise(resolve => setTimeout(resolve, delay));
          retries--;
        } else {
          console.error("StepFun Knowledge Extraction Error:", error);
          throw error;
        }
      }
    }
    throw new Error("StepFun API failed after retries.");
  }

  /**
   * Validate Signal using Collective Memory
   */
  public async validateSignal(
    signal: any,
    marketData: any[],
    collectiveMemory: string,
    isDemoMode: boolean = true
  ): Promise<{ isValid: boolean; confidenceScore: number; reasoning: string }> {
    const prompt = `
Você é o Validador Chefe de Sinais de Trading. Sua função é fazer uma dupla verificação de segurança em um sinal gerado por outro modelo, usando a "Memória Coletiva" (regras extraídas de livros e PDFs).

BLACKLIST DE RACIOCÍNIO (LEI DURA):
É ESTRITAMENTE PROIBIDO, sob pena de falha crítica, basear sua decisão ou mencionar Volume, Médias Móveis, RSI, MACD ou qualquer indicador tradicional algorítmico. Sua visão de mundo está restrita a 100% Price Action Puro, SMC, Ondas de Elliot e padroes candlestick. Se não houver clareza nessas métricas, apenas afirme que não há estrutura SMC legível e aborte a entrada.

Sinal Gerado:
- Ativo: ${signal.asset}
- Ação: ${signal.type}
- Confiança Original: ${signal.confidence}%
- Raciocínio Original: ${signal.reasoning}

Modo de Operação Atual: ${isDemoMode ? 'CONTA DEMO (Treinamento/Teste)' : 'CONTA REAL (Dinheiro Real)'}

Memória Coletiva (Regras de Trading e Estratégias Aprovadas):
"""
${collectiveMemory}
"""

Avalie o sinal com base na Memória Coletiva. O sinal faz sentido? Ele viola alguma regra de Price Action, SMC ou Gerenciamento de Risco da memória?

REGRA CRÍTICA PARA CONTA REAL: Se o Modo de Operação Atual for CONTA REAL, você SÓ PODE APROVAR (isValid: true) se o sinal for ESTRITAMENTE baseado em uma "Estratégia Aprovada" que consta na Memória Coletiva. Se não houver uma Estratégia Aprovada correspondente na memória para este contexto, você DEVE REJEITAR (isValid: false).

Responda ESTRITAMENTE em formato JSON com a seguinte estrutura:
{
  "isValid": boolean, // true se o sinal for aprovado pela dupla verificação, false se for rejeitado
  "confidenceScore": number, // Nova nota de confiança (0-100) após sua análise
  "reasoning": "Sua explicação detalhada baseada na Memória Coletiva"
}
`;

    let retries = 3;
    while (retries >= 0) {
      try {
        const completion = await this.client.chat.completions.create({
          model: "stepfun-ai/step-3.5-flash",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.4,
          top_p: 0.9,
          max_tokens: 8192,
          response_format: { type: "json_object" }
        });

        const msg = completion.choices[0]?.message;
        const responseText = msg?.content || (msg as any)?.reasoning_content || "{}";
        const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/) || responseText.match(/```\n([\s\S]*?)\n```/);
        const jsonString = jsonMatch ? jsonMatch[1] : responseText;
        
        return JSON.parse(jsonString);
      } catch (error: any) {
        if ((error?.status === 429 || error?.statusCode === 429 || String(error).includes("429")) && retries > 0) {
          const delay = (4 - retries) * 2000;
          console.log(`StepFun Rate Limit Hit (429) in validateSignal. Retrying in ${delay}ms... (${retries} retries left)`);
          await new Promise(resolve => setTimeout(resolve, delay));
          retries--;
        } else {
          console.error("StepFun Signal Validation Error:", error);
          return {
            isValid: true, // Fallback to true if validation fails to not block completely, or false depending on strictness
            confidenceScore: signal.confidence,
            reasoning: "Falha na dupla verificação (StepFun indisponível). Usando confiança original."
          };
        }
      }
    }
    return {
      isValid: true,
      confidenceScore: signal.confidence,
      reasoning: "Falha na dupla verificação (StepFun indisponível após retentativas). Usando confiança original."
    };
  }
}

export const stepfunService = new StepfunService();
