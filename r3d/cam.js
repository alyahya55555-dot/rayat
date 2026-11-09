const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.woff2': 'font/woff2' };
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0].split('#')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); }).listen(8163);
(async () => { const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto('http://localhost:8163/r3d/index.html#manual'); await p.waitForFunction(() => window.R); await p.evaluate(() => R.ready);
  const t = +process.argv[2]; await p.evaluate(t => R.renderAt(t), t); const pos = await p.evaluate(() => R.armyPos()); const [x, y, z] = pos[0];
  const views = [[[x + 1.1, y + .35, z + .2], [x, y + .12, z]], [[x - .5, y + .5, z + 1.0], [x, y + .12, z]]];
  for (let i = 0; i < views.length; i++) { await p.evaluate(v => { window.__cam = v; }, views[i]); await p.evaluate(t => R.renderAt(t), t); await p.screenshot({ path: __dirname + `/out/cam${i}.png` }); }
  await b.close(); srv.close(); })();
