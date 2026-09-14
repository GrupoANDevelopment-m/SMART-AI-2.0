const fs = require('fs');
const FormData = require('form-data');
const fetch = require('node-fetch');

async function test() {
  const formData = new FormData();
  formData.append('text', 'Se o mercado cruzar a EMA 20, entre CALL.');
  formData.append('sourceName', 'test-source');
  
  try {
    const res = await fetch('http://localhost:3000/api/train-agent', {
      method: 'POST',
      body: formData,
    });
    console.log(res.status);
    const body = await res.text();
    console.log(body);
  } catch(e) {
    console.log(e);
  }
}
test();
