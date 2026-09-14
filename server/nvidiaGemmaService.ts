import OpenAI from 'openai';

export class NvidiaGemmaService {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      baseURL: "https://integrate.api.nvidia.com/v1",
      apiKey: process.env.NVIDIA_API_KEY || "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"
    });
  }

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
          model: "google/gemma-4-31b-it",
          messages: messages,
          temperature: 1.0,
          top_p: 0.95,
          max_tokens: 16384,
        };

        // Gemma 4 supports thinking mode
        options.extra_body = {
          chat_template_kwargs: { enable_thinking: true }
        };

        if (forceJson) {
          options.response_format = { type: "json_object" };
        }

        const completion = await this.client.chat.completions.create(options);

        const msg = completion.choices[0]?.message;
        const responseText = msg?.content || "";
        
        if (forceJson) {
          const jsonMatch = responseText.match(/\`\`\`json\n([\s\S]*?)\n\`\`\`/) || responseText.match(/\`\`\`\n([\s\S]*?)\n\`\`\`/);
          return jsonMatch ? jsonMatch[1].trim() : responseText.trim();
        }
        
        return responseText.trim();
      } catch (error: any) {
        if ((error?.status === 429 || error?.statusCode === 429) && retries > 0) {
          const delay = (4 - retries) * 2000;
          console.log(`NVIDIA Gemma Rate Limit Hit (429). Retrying in ${delay}ms... (${retries} retries left)`);
          await new Promise(resolve => setTimeout(resolve, delay));
          retries--;
        } else {
          console.error("NVIDIA Gemma API Error:", error);
          throw error;
        }
      }
    }
    throw new Error("NVIDIA Gemma API failed after retries.");
  }

  public async extractTradingKnowledge(text: string, sourceName: string): Promise<any[]> {
    const prompt = `
Você é um Especialista em Extração de Conhecimento Financeiro e Trading Institucional.
Leia o texto abaixo, que pode conter estratégias de trading, regras de Smart Money Concepts (SMC), Price Action, psicologia de mercado, padrões de candles ou gerenciamento de risco.

Sua tarefa é extrair as regras e conceitos mais importantes e formatá-los ESTRITAMENTE como um array JSON.

Texto Fonte (${sourceName}):
"""
${text}
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
          model: "google/gemma-2-9b-it", // fallback if 31b doesn't work, wait, I'll keep the model that was there
          messages: [{ role: "user", content: prompt }],
          temperature: 0.3,
          top_p: 0.95,
          max_tokens: 4096, // API may not support 16k
          response_format: { type: "json_object" },
          extra_body: {
            chat_template_kwargs: { enable_thinking: true }
          }
        } as any);

        const msg = completion.choices[0]?.message;
        const responseText = msg?.content || "[]";
        const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/) || responseText.match(/```\n([\s\S]*?)\n```/);
        const jsonString = jsonMatch ? jsonMatch[1] : responseText;
        
        return JSON.parse(jsonString);
      } catch (error: any) {
        if ((error?.status === 429 || error?.statusCode === 429) && retries > 0) {
          const delay = (4 - retries) * 2000;
          console.log(`NVIDIA Gemma Rate Limit Hit (429) in extractTradingKnowledge. Retrying in ${delay}ms... (${retries} retries left)`);
          await new Promise(resolve => setTimeout(resolve, delay));
          retries--;
        } else {
          console.error("NVIDIA Gemma Knowledge Extraction Error:", error);
          throw error;
        }
      }
    }
    throw new Error("NVIDIA Gemma API failed after retries.");
  }
}

export const nvidiaGemmaService = new NvidiaGemmaService();
