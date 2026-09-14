import WebSocket from 'ws';

const ws = new WebSocket('wss://ws.derivws.com/websockets/v3?app_id=1089');

ws.on('open', () => {
  console.log('Connected');
  ws.send(JSON.stringify({ authorize: 'WWgiBkswk5weu1u', req_id: 1 }));
});

ws.on('message', (data) => {
  const response = JSON.parse(data.toString());
  console.log('Received:', response.msg_type, response.req_id, response.error ? response.error.message : '');

  if (response.msg_type === 'authorize' && !response.error) {
    console.log('Authorized. Sending portfolio request...');
    ws.send(JSON.stringify({ portfolio: 1, req_id: 2 }));
    ws.send(JSON.stringify({ statement: 1, description: 1, limit: 10, req_id: 3 }));
    ws.send(JSON.stringify({ profit_table: 1, description: 1, limit: 10, req_id: 4 }));
  }

  if (response.msg_type === 'portfolio') {
    console.log('Portfolio received');
  }
  if (response.msg_type === 'statement') {
    console.log('Statement received');
  }
  if (response.msg_type === 'profit_table') {
    console.log('Profit table received');
    setTimeout(() => process.exit(0), 1000);
  }
});

ws.on('error', (err) => {
  console.error('Error:', err);
});
