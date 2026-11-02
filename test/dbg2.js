const { chromium } = require('playwright');
const http = require('http'), fs = require('fs');
const html = fs.readFileSync('../dist/index.html');
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); }).listen(8126);
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext();
  await ctx.route(/fonts\./, r => r.fulfill({ status: 200, body: '' }));
  ctx.on('page', p => p.on('pageerror', e => console.log('ERR', e.message)));
  const host = await ctx.newPage(); await host.goto('http://localhost:8126/#host'); await sleep(800);
  const code = await host.evaluate(() => Host.e.s.code);
  const S = [];
  for (let i = 0; i < 8; i++) { const p = await ctx.newPage(); await p.goto('http://localhost:8126/#join-' + code); await sleep(300); await p.fill('#jn', 'ط' + i); await p.click('#jgo'); S.push(p); }
  await sleep(2000);
  console.log(await host.evaluate(() => Object.values(Host.e.s.students).map(s => s.name + ':' + s.sid)));
  for (const p of S) console.log(await p.evaluate(() => Student.cfg.sid + ' ' + Student.cfg.nm + ' joined=' + Student.joined));
  await b.close(); srv.close();
})();
