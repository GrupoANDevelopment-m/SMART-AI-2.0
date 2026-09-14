async function test() {
  try {
    const res = await fetch('http://localhost:3000/api/price-history?symbol=frxEURUSD&timeframe=1d&limit=100');
    console.log(res.status, res.statusText);
    const text = await res.text();
    console.log(text.substring(0, 200));
  } catch (e) {
    console.error(e);
  }
}
test();
