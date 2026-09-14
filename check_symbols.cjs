const WebSocket = require('ws');

const MARKET_CATEGORIES = [
  { name: 'Forex', assets: [
    'frxAUDJPY', 'frxAUDUSD', 'frxEURAUD', 'frxEURCAD', 'frxEURCHF', 
    'frxEURGBP', 'frxEURJPY', 'frxEURUSD', 'frxGBPJPY', 'frxGBPUSD', 
    'frxUSDCAD', 'frxUSDCHF', 'frxUSDJPY', 'frxGBPAUD'
  ] },
  { name: 'Crash/Boom', assets: [
    'CRASH300ND', 'BOOM900ND', 'BOOM600ND', 'CRASH900ND', 'CRASH600ND', 
    'CRASH50ND', 'BOOM50ND', 'BOOM300ND', 'CRASH500ND', 'CRASH1000ND', 
    'BOOM500ND', 'BOOM1000ND', 'BOOM150ND', 'CRASH150ND'
  ] },
  { name: 'Índices de Volatilidade', assets: [
    'R_10', 'R_25', 'R_50', 'R_75', 'R_100',
    '1HZ10V', '1HZ25V', '1HZ50V', '1HZ75V', '1HZ100V',
    '1HZ150V', '1HZ250V', '1HZ15V', '1HZ30V', '1HZ90V',
    'R_5', '1HZ5V', 'R_15', 'R_30', 'R_90',
    'HF_100', 'HF_75', 'HF_50'
  ] },
  { name: 'Criptomoedas', assets: [
    'cryZECUSD', 'cryXRPUSD', 'cryUNIUSD', 'cryTRXUSD', 'crySHBUSD', 
    'cryLTCUSD', 'cryFILUSD', 'cryETHUSD', 'cryETCUSD', 'cryDSHUSD', 
    'cryDOTUSD', 'cryDOGUSD', 'cryBTCUSD', 'cryXTZUSD', 'cryNERUSD', 
    'cryTONUSD', 'cryFETUSD', 'cryAPTUSD', 'cryIMXUSD', 'crySANUSD', 
    'cryTRUUSD', 'cryMLNUSD'
  ] },
  { name: 'Commodities Agrícolas', assets: [
    'frxCOCOA', 'frxCOTTON', 'frxSUGAR', 'frxCOFFEE', 'frxARABICA'
  ] },
  { name: 'Metais', assets: [
    'frxXAUEUR', 'frxXAGEUR', 'frxXCUUSD', 'frxXAUUSDmicro', 
    'frxXAGUSDmicro', 'frxXPDUSD', 'frxXAUUSD', 'frxXAGUSD'
  ] },
  { name: 'ETFs', assets: [
    'etfAGG.US', 'etfARKK.US', 'etfDIA.US', 'etfEEM.US', 'etfEFA.US',
    'etfERX.US', 'etfGDX.US', 'etfGLD.US', 'etfHYG.US', 'etfIEMG.US',
    'etfIJR.US', 'etfIVV.US', 'etfIVW.US', 'etfIWM.US', 'etfLQD.US'
  ] },
  { name: 'Ações (Europa)', assets: [
    'stkADS', 'stkAIR', 'stkAF', 'stkBAYN', 'stkBMW', 
    'stkCON', 'stkDBK', 'stkLHA', 'stkPAH3'
  ] },
  { name: 'Ações (NASDAQ)', assets: [
    'stkAAL.OQ', 'stkAAPL.OQ', 'stkABNB.OQ', 'stkACGL.OQ', 'stkADBE.OQ',
    'stkADI.OQ', 'stkADP.OQ', 'stkADSK.OQ', 'stkAEP.OQ', 'stkAFRM.OQ', 'stkAGNC.OQ'
  ] }
];

const ws = new WebSocket('wss://ws.binaryws.com/websockets/v3?app_id=36300');

ws.on('open', () => {
  const allAssets = MARKET_CATEGORIES.flatMap(c => c.assets);
  allAssets.forEach(symbol => {
    ws.send(JSON.stringify({ ticks: symbol }));
  });
});

const invalidSymbols = [];
let responses = 0;

ws.on('message', (data) => {
  const response = JSON.parse(data);
  if (response.error) {
    console.log('Invalid symbol:', response.echo_req.ticks);
    invalidSymbols.push(response.echo_req.ticks);
  }
  responses++;
  if (responses > 150) {
    console.log('Finished checking');
    ws.close();
  }
});
