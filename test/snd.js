const { chromium } = require('playwright'); const http = require('http'), fs = require('fs');
const html = fs.readFileSync('../dist/index.html'); const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); }).listen(8128);
(async () => { const b = await chromium.launch(); const p = await b.newPage(); await p.route(/fonts\./, r => r.fulfill({ status: 200, body: '' }));
  await p.goto('http://localhost:8128/#display'); await p.mouse.click(300, 300); await new Promise(r => setTimeout(r, 1500));
  console.log('decoded recordings:', await p.evaluate(() => Object.keys(SFX.buf).join(', ')));
  console.log('ctx:', await p.evaluate(() => SFX.ctx && SFX.ctx.state));
  await b.close(); srv.close(); })();
