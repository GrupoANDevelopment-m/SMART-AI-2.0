import { dataManager } from './dataManager.js';
import { adminDb } from './firebaseAdmin.js';
import { Server } from 'socket.io';
import { derivService } from './deriv.js';
import { battlePlanStore, BattlePlan } from './battlePlans.js';
import { stepfunService } from './stepfunService.js';

class AutoPilotEngine {
  private isRunning = false;
  private io: Server | null = null;
  private plannerInterval: NodeJS.Timeout | null = null;
  private watcherInterval: NodeJS.Timeout | null = null;
  private reviewerInterval: NodeJS.Timeout | null = null;
  private latestPrices: Record<string, number> = {};

  constructor() {
    // Escuta os carrapatos ao vivo da Deriv e armazena o preço mais recente
    derivService.on('tick', (tick: any) => {
      if (tick && tick.symbol && tick.quote) {
        this.latestPrices[tick.symbol] = tick.quote;
      }
    });
  }

  public setSocket(io: Server) {
    this.io = io;
  }

  public start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('AutoPilot Engine Started (Backend)');
    
    // Assinar os carrapatos dos ativos nos planos ativos
    const activePlans = battlePlanStore.getPlans().filter(p => p.status === 'ACTIVE');
    for (const plan of activePlans) {
      derivService.subscribeTick(plan.asset);
    }

    this.startPlanner();
    this.startWatcher();
    this.startReviewer();
  }

  public stop() {
    if (!this.isRunning) return;
    this.isRunning = false;
    console.log('AutoPilot Engine Stopped (Backend)');
    
    if (this.plannerInterval) clearInterval(this.plannerInterval);
    if (this.watcherInterval) clearInterval(this.watcherInterval);
    if (this.reviewerInterval) clearInterval(this.reviewerInterval);
  }

  public getStatus() {
    return this.isRunning;
  }

  private startPlanner() {
    // Runs every 5 minutes to map the battlefield
    this.plannerInterval = setInterval(async () => {
      if (!this.isRunning) return;
      console.log('[AutoPilot] Running Planner...');
      // TODO: Call SMC Agent to generate Battle Plans
    }, 5 * 60 * 1000);
  }

  private startWatcher() {
    // Runs every 5 seconds to check active plans against current prices
    this.watcherInterval = setInterval(async () => {
      if (!this.isRunning) return;
      
      const plans = battlePlanStore.getPlans();
      let plansUpdated = false;

      for (const plan of plans) {
        if (plan.status !== 'ACTIVE') continue;

        const currentPrice = this.latestPrices[plan.asset];
        if (!currentPrice) {
          // Garante que estamos subscritos a esse ativo
          derivService.subscribeTick(plan.asset);
          continue;
        }

        // Verifica as zonas de alerta de acordo com o SMC
        if (plan.alertZones && Array.isArray(plan.alertZones)) {
          for (const zone of plan.alertZones) {
            const minP = parseFloat(zone.minPrice);
            const maxP = parseFloat(zone.maxPrice);

            // A Armadilha de Preços
            if (!isNaN(minP) && !isNaN(maxP) && currentPrice >= minP && currentPrice <= maxP) {
              const zoneName = (zone.name || zone.type || '').toLowerCase();
              
              // Reconhecimento de Zona SMC
              const smcZones = [
                'bullish order block', 'bearish order block', 'propulsion block', 'rejection block', 
                'reclaimed block', 'fair value gap', 'fvg', 'balanced price range', 'bpr', 
                'liquidity void', 'vacuum block', 'breaker block', 'bb', 'mitigation block', 'mb', 
                'liquidity pools', 'bsl', 'ssl', 'inducement', 'idm', 'equal highs', 'equal lows', 
                'eqh', 'eql', 'point of interest', 'poi', 'premium', 'discount', 'kill zones', 
                'institutional funding candle', 'ifc', 'rally-base-rally', 'rbr', 'drop-base-drop', 
                'dbd', 'rally-base-drop', 'rbd', 'drop-base-rally', 'dbr', 'dark pools', 
                'stop hunt', 'liquidity sweep', 'judas swing', 'turtle soup', 'salami slicing', 
                'mitigation', 'bos', 'choch', 'displacement', 'icebergs', 'imbalance', 'support', 'resistance',
                'supply', 'demand'
              ];

              const isSMCZone = smcZones.some(kw => zoneName.includes(kw));

              if (isSMCZone || true) { // Dispara mesmo se for genérico conforme a intenção
                let action: 'buy' | 'sell' = 'buy'; // Plano B / Padrão: Compra (Demand/Support)
                
                // Plano A / Venda (Supply/Resistance)
                if (zoneName.includes('supply') || zoneName.includes('resistance') || zoneName.includes('bearish') || zoneName.includes('drop-base-drop') || zoneName.includes('rally-base-drop') || zoneName.includes('bsl') || zoneName.includes('premium')) {
                  action = 'sell';
                }

                console.log(`[AutoPilot Watcher] 🎯 Armadilha confirmada em ${plan.asset}! Preço ${currentPrice} atingiu a zona ${zoneName} (${minP} - ${maxP}). Solicitando verificação da IA...`);

                try {
                  // E quando ele atinge a zona de alerts ele atualiza na zona de monitoramento e chama a IA para verificar
                  if (this.io) {
                    this.io.emit('plan_touched', {
                      planId: plan.id,
                      asset: plan.asset,
                      zone: zoneName,
                      timestamp: Date.now()
                    });
                  }

                  // Obter os candles recentes do ativo para a IA validar
                  const ticks = await derivService.getOHLCV(plan.asset, '1m', 30);
                  
                  const aiValidationPrompt = `
Você é o Agente SMC Institucional.
O ativo ${plan.asset} acaba de engatilhar a zona de alerta [${zoneName}].
A ação teórica do Planejador foi: ${action.toUpperCase()}.

DADOS CRUS DAS ÚLTIMAS 30 VELAS (1m) PARA VALIDAÇÃO:
${JSON.stringify((ticks || []).slice(-30))}

REGRA DO GATILHO OPRESSOR E SNIPER CONTRA-TENDÊNCIA:
A operação SOMENTE será aprovada se o Price Action apresentar formação de candles de grande momento/impulso ou padrões mortais (Engolfo, Pin Bar) no momento do impacto nesta exata zona. 
O candle atual rejeitou a zona ou passou rasgando?

Valide o Price action e responda EXCLUSIVAMENTE com um Object JSON contendo:
{
  "decision": "APROVADO" ou "REJEITADO (WAIT)",
  "reasoning": "Sua explicação"
}
`;
                  
                  let aiDecision = 'REJEITADO (WAIT)';
                  let aiReasoning = 'Falha na validação da IA.';

                  // Implementa a chamada real da IA para validar o gatilho, caso tenhamos a chave
                  try {
                    console.log(`[AutoPilot Watcher] Solicitando validação real da IA via StepFun para o gatilho em ${plan.asset}...`);
                    const responseText = await stepfunService.analyzeMarket(aiValidationPrompt, "Você é um validador técnico.", true);
                    const responseData = JSON.parse(responseText);
                    if (responseData.decision === 'APROVADO') {
                      aiDecision = 'APROVADO';
                    }
                    aiReasoning = responseData.reasoning || '';
                  } catch (aiError: any) {
                     console.error(`[AutoPilot Watcher] IA indisponível para aprovar trade:`, aiError.message);
                  }
                  
                  if (aiDecision === 'APROVADO') {
                    console.log(`[AutoPilot Watcher] ✅ IA APROVOU a operação em ${plan.asset}. Motivo: ${aiReasoning}. Executando ordem MT5...`);
                    // A Execução Cruel
                    await derivService.executeMT5Order(plan.asset, action, 10, 'bot_auto');
                    
                    plan.status = 'TRIGGERED';
                    plansUpdated = true;

                    if (this.io) {
                      this.io.emit('plan_triggered', {
                        planId: plan.id,
                        asset: plan.asset,
                        action,
                        price: currentPrice,
                        zone: zoneName,
                        timestamp: Date.now()
                      });
                    }
                  } else {
                    console.log(`[AutoPilot Watcher] ❌ IA REJEITOU a operação em ${plan.asset} (WAIT). Motivo: ${aiReasoning}`);
                    // O plano continua ativo para tentar novamente no futuro ou expirar
                  }
                } catch (err: any) {
                  console.error(`[AutoPilot Watcher] Falha ao engatilhar a ordem para ${plan.asset}:`, err.message);
                }
                break; // Para de avaliar outras zonas deste plano se já foi engatilhado
              }
            }
          }
        }
      }

      if (plansUpdated) {
        battlePlanStore.savePlans(plans);
      }

    }, 5000);
  }

  private startReviewer() {
    // Runs every 1 minute to check for closed trades and learn from them
    this.reviewerInterval = setInterval(async () => {
      if (!this.isRunning) return;
      console.log('[AutoPilot Reviewer] Running Reviewer (A IA para Analisar o Desempenho)...');
      
      // Obter planos TRIGGERED
      const plans = battlePlanStore.getPlans();
      const triggeredPlans = plans.filter(p => p.status === 'TRIGGERED');
      
      if (triggeredPlans.length > 0) {
        console.log(`[AutoPilot Reviewer] Found ${triggeredPlans.length} triggered plans looking for closed trades...`);
      }

      for (const plan of triggeredPlans) {
        // O objetivo dele é pegar os "closed trades" (trades já finalizados que bateram nos lucros ou perdas do Plano A ou B) 
        // e engatilhar os retornos de análise na IA para ensinar o robô e retroalimentar as Memórias da Base de Dados de Falha e Sucesso no Firebase.
        
        // TODO: Check closed trades, train agent, save to Firebase
        try {
          if (adminDb) {
            // Isto é um placeholder para onde o loop de inteligência rodaria 
            // a extração do resultado exato do Profit Table da Deriv (ou MT5)
            // e alimentaria as "Memórias" no Firebase
            /* 
            const profitTable = await derivService.getProfitTable();
            // Analisa se o trade do plano foi fechado comparando com os tickets
            if (tradeClosed) {
               await adminDb.collection('memory_hub').add({ ... });
               plan.status = 'COMPLETED';
            }
            */
          }
        } catch (e) {
          console.error('[AutoPilot Reviewer] Error indexing Firebase memory:', e);
        }
      }
      
    }, 60000);
  }
}

export const autopilotEngine = new AutoPilotEngine();
