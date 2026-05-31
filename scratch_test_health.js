const fetch = require('node-fetch');
async function run() {
  const res = await fetch('https://foodie-backend.pxxl.click/health');
  console.log('Status:', res.status);
  console.log('Body:', await res.json());
}
run();
