import WebSocket from 'ws';
const ws = new WebSocket('wss://ws.derivws.com/websockets/v3?app_id=1089');
ws.on('open', () => {
  ws.send(JSON.stringify({ authorize: 'cd7vaUnaO3mt1ML' }));
});
ws.on('message', (data) => {
  const res = JSON.parse(data.toString());
  console.log("RECEIVED:", JSON.stringify(res, null, 2));
  if (res.msg_type === 'authorize') {
    ws.send(JSON.stringify({ balance: 1, account: 'VRTC12532521' }));
  }
  if (res.msg_type === 'balance') {
    process.exit(0);
  }
});
setTimeout(() => { console.log("Timeout"); process.exit(1); }, 5000);
