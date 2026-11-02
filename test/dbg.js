const { chromium } = require('playwright');
const http = require('http'), fs = require('fs');
const html = fs.readFileSync('../dist/index.html');
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); }).listen(8124);
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext();
  await ctx.route(/fonts\./, r => r.fulfill({ status: 200, body: '' }));
  for (const h of ['#display', '#join-1234', '#host']) {
    const p = await ctx.newPage(); p.on('pageerror', e => console.log(h, 'ERR', e.message, e.stack.split('\n')[1])); p.on('console', m => console.log(h, m.type(), m.text()));
    await p.goto('http://localhost:8124/' + h); await new Promise(r => setTimeout(r, 1500));
    console.log(h, (await p.textContent('#app')).slice(0, 200));
  }
  await b.close(); srv.close();
})();
