const fs = require('fs');

const dbPath = './.data/database.json';
const db = JSON.parse(fs.readFileSync(dbPath));

const newKnowledge = [
  {
    id: "kb_tlab_1",
    category: "Price Action Consolidation (Trading Like A Boss)",
    concept: "Suporte e Resistência de Pavio (Consolidação)",
    description: "Em mercados laterais (M15 ou M30), a máxima e a mínima do candle anterior servem como suporte/resistência imediatos para operações de reversão rápida (scalp/day).",
    actionableRule: "SE O MERCADO ESTIVER CONSOLIDADO: Não opere a favor de tendência (inexistente). Marque a MÁXIMA e MÍNIMA do candle anterior (de preferência com pavios longos). Se o candle atual tocar a MÁXIMA do anterior na parte superior da consolidação, execute SELL (PUT). Se tocar a MÍNIMA do anterior na parte inferior, execute BUY (CALL). Ignore candles no meio da consolidação.",
    source: "PDF TRADING LIKE A BOSS",
    timestamp: Date.now()
  },
  {
    id: "kb_pa_1",
    category: "Price Action & Volume",
    concept: "Confirmação de Rompimento (Breakout)",
    description: "Um rompimento de suporte, resistência ou linha de tendência só tem validade sob determinadas condições de amplitude local.",
    actionableRule: "Se o preço testar um suporte/tendência, ele deve rejeitar de forma violenta. Se o romper com inércia, o suporte se quebrou. Espere confirmação visual de continuidade de topos/fundos mais baixos.",
    source: "Price Action Trading Guide",
    timestamp: Date.now()
  },
  {
    id: "kb_ew_1",
    category: "Ondas de Elliott",
    concept: "Regras Invioláveis das Ondas (1 a 5)",
    description: "Regras de Ouro de Elliott para garantir que um ciclo não está sendo contado errado.",
    actionableRule: "(1) A Onda 2 nunca pode retrair mais de 100% da Onda 1 (se cair abaixo do fundo da 1, a tese falha). (2) A Onda 3 NUNCA é a menor onda dentre as impulsivas. Geralmente alcança 161,8% da onda 1. (3) A Onda 4 NUNCA entra na zona de preço da Onda 1. Se violar qualquer dessas, a contagem está errada e deve ordenar WAIT.",
    source: "Teoria das Ondas de Elliott (BM&FBOVESPA)",
    timestamp: Date.now()
  },
  {
    id: "kb_smc_1",
    category: "Smart Money Concepts",
    concept: "Order Blocks e Fair Value Gaps",
    description: "Zonas onde grandes instituições realizaram acumulação/distribuição visíveis nos gráficos.",
    actionableRule: "Antes de executar um trade a favor da tendência em M15/M30, identifique a presença de um Order Block intocado logo abaixo de um Fair Value Gap. O preço PRECISA mitigar (testar) essa zona de Order Block. Entre com BUY apenas após a mitigação dessa zona de grande ineficiência confirmada por Change of Character (ChoCh) no tempo menor.",
    source: "SMART MONEY CONCEPT TRADING STRATEGY",
    timestamp: Date.now()
  }
];

if (!db.knowledge) db.knowledge = [];
db.knowledge.push(...newKnowledge);
fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));

console.log("Knowledge added to .data/database.json");
