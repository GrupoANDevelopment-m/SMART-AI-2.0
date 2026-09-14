const WebSocket = require('ws');
const ws = new WebSocket('wss://ws.binaryws.com/websockets/v3?app_id=36300');

ws.on('open', () => {
  ws.send(JSON.stringify({ active_symbols: 'brief', product_type: 'basic' }));
});

ws.on('message', (data) => {
  const response = JSON.parse(data);
  if (response.active_symbols) {
    const symbols = response.active_symbols.map(s => ({ symbol: s.symbol, display_name: s.display_name, market: s.market }));
    const fs = require('fs');
    fs.writeFileSync('symbols.json', JSON.stringify(symbols, null, 2));
    console.log('Symbols saved to symbols.json');
  } else if (response.error) {
    console.error(response.error);
  }
  ws.close();
});
