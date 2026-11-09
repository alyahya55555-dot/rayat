const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png' };
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0].split('#')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); }).listen(8161);
const [W, H] = (process.env.SIZE || '1920x1080').split('x').map(Number), times = process.argv.slice(2).map(Number);
(async () => { const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: W, height: H } }); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('http://localhost:8161/r3d/index.html#manual'); await p.waitForFunction(() => window.R && R.ready, null, { timeout: 60000 }); await p.evaluate(() => R.ready);
  console.log(await p.evaluate(() => R.info())); console.log(JSON.stringify(await p.evaluate(() => R.check())));
  for (const t of times) { const t0 = Date.now(); await p.evaluate(t => R.renderAt(t), t); await p.waitForTimeout(250); await p.screenshot({ path: path.join(__dirname, `out/s-${t}.png`) }); console.log('t', t, Date.now() - t0, 'ms'); }
  console.log(await p.evaluate(() => R.stats())); console.log(errs.slice(0, 8)); await b.close(); srv.close(); })();
