import { derivService } from './server/deriv';

async function testExecutionMock() {
  console.log("1. Aguardando conexão Deriv...");
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  if (derivService.balances.USD) {
    console.log(`✅ Saldo conectado: $${derivService.balances.USD}`);
  } else {
    console.log("❌ Falha na conexão de saldo inicial.");
  }

  const symbol = 'R_100'; // Volatility 100 Index
  
  console.log("\n2. Simulando aprovação da IA (Metodologia Pura)...");
  // O que a IA hipoteticamente cuspiu (e nós vamos empurrar pela rota do app.tsx simulada):
  const loteExigidoPelaIA = 50.5; // Digamos que a IA fez a conta de RR e pediu $50.5
  
  console.log(`IA ordenou COMPRA. Lote exigido: $${loteExigidoPelaIA}.`);
  console.log("O que o código atual faz (App.tsx linha 662)? -> let stakeAmount = activeBalance * 0.01;");
  
  const balance = derivService.balances.USD || 10000;
  const stakeIgnorado = balance * 0.01;
  console.log(`Lote que vai ser executado de fato pelo sistema engessado: $${stakeIgnorado}`);
  
  console.log("\n3. Fazendo a execução da ordem usando a rota falsa Oculta de CFD (deriv.ts linha 332)...");
  try {
     const cfdModeSimulacao = await derivService.executeMT5Order(symbol, 'buy', loteExigidoPelaIA, 'demo', 1000, 2000, 'cfd');
     console.log("Resposta do Modo CFD Fake:");
     console.log(cfdModeSimulacao);
     console.log("O SALDO FOI DESCONTADO? -> Não. Nenhuma API Call verdadeira foi feita. O código diz Return Fake ID.");
  } catch(e: any) {
     console.log("CFD Erro:", e.message);
  }

  console.log("\n4. E se usarmos o modo Options Real (que bate na Deriv)?");
  try {
     console.log(`Disparando Call real para Deriv (Options): Aposta bloqueada do código antigo: $${stakeIgnorado} (Invés dos $${loteExigidoPelaIA} da IA)`);
     const optionsReal = await derivService.executeMT5Order(symbol, 'buy', stakeIgnorado, 'demo', 0, 0, 'options');
     console.log("Resposta REAL da Deriv:");
     console.log(optionsReal.buy?.contract_id ? `✅ SUCESSO: Contrato #${optionsReal.buy.contract_id} Aberto. Saldo será descontado no painel!` : optionsReal);
  } catch(e: any) {
     console.log("❌ ERRO DA DERIV (Options Real):", e.message);
  }
  
  process.exit(0);
}

testExecutionMock();
