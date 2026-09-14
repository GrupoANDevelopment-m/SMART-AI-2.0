const WebSocket = require('ws');
const ws = new WebSocket('wss://ws.binaryws.com/websockets/v3?app_id=36300');

ws.on('open', () => {
  ws.send(JSON.stringify({ authorize: 'WWgiBkswk5weu1u' })); // Demo token from deriv.ts
});

ws.on('message', (data) => {
  const response = JSON.parse(data);
  if (response.authorize) {
    ws.send(JSON.stringify({ active_symbols: 'brief' }));
  } else if (response.active_symbols) {
    const symbols = response.active_symbols.map(s => ({ symbol: s.symbol, display_name: s.display_name, market: s.market }));
    const fs = require('fs');
    fs.writeFileSync('symbols_auth.json', JSON.stringify(symbols, null, 2));
    console.log('Symbols saved to symbols_auth.json');
    ws.close();
  } else if (response.error) {
    console.error(response.error);
    ws.close();
  }
});
