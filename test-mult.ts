import { derivService } from './server/deriv';

async function runTest() {
  console.log("1. Aguardando conexão e autorização com a Deriv...");
  await new Promise(resolve => setTimeout(resolve, 4000));

  const symbol = 'R_100'; // Volatility 100
  const stake = 1;
  const action = 'buy';
  
  console.log(`2. Solicitando Proposal para Multiplicator em ${symbol}...`);
  
  try {
    const proposalReq: any = {
      proposal: 1,
      amount: stake,
      basis: "stake",
      currency: "USD",
      symbol: symbol,
      contract_type: "MULTUP",
      multiplier: 100
    };
    
    // First get a proposal
    const reqId = (derivService as any).reqIdCounter++;
    const promise = new Promise((resolve, reject) => {
      (derivService as any).pendingRequests.set(reqId, { resolve, reject });
    });
    
    (derivService as any).ws.send(JSON.stringify({
      ...proposalReq,
      req_id: reqId
    }));
    
    const proposalRes: any = await promise;
    if (proposalRes.error) {
      console.error("Erro na proposal:", proposalRes.error.message);
      process.exit(1);
    }
    
    console.log("Proposal OK. ID:", proposalRes.proposal.id);
    
    // Now buy with SL and TP
    const buyReqId = (derivService as any).reqIdCounter++;
    const buyPromise = new Promise((resolve, reject) => {
      (derivService as any).pendingRequests.set(buyReqId, { resolve, reject });
    });
    
    (derivService as any).ws.send(JSON.stringify({
      buy: proposalRes.proposal.id,
      price: stake,
      parameters: {
        stop_loss: 0.5, // USD amount, not price. For multipliers it's amount? Let's check API. Or price? 
        take_profit: 0.5
      },
      req_id: buyReqId
    }));
    
    const buyRes: any = await buyPromise;
    if (buyRes.error) {
      console.log(`❌ Erro no buy: ${buyRes.error.message}`);
    } else {
      console.log(`✅ COMPRA OK! Contract ID: ${buyRes.buy.contract_id}`);
    }

  } catch (e) {
    console.error("Erro no teste:", e);
  }
  
  process.exit(0);
}

runTest();
