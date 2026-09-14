const fs = require('fs');
const FormData = require('form-data');
const fetch = require('node-fetch');

async function testUpload() {
  const formData = new FormData();
  formData.append('text', 'Test knowledge text.');
  formData.append('file', fs.createReadStream('package.json'));

  console.log('Sending request to /api/train-agent...');
  const res = await fetch('http://127.0.0.1:3000/api/train-agent', {
    method: 'POST',
    body: formData
  });

  const data = await res.json();
  console.log('Status code:', res.status);
  console.log('Response body:', JSON.stringify(data, null, 2));
}

testUpload().catch(console.error);
