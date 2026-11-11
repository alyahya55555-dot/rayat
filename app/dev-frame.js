// صور الجزيرة كاملة بعدة مقاسات وإطارات (للاختيار بالعين). node app/dev-frame.js '<json list>'
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), OUT = path.join(__dirname, 'out', 'sizes'); fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.mp3': 'audio/mpeg' };
const PORT = 8230 + Math.floor(Math.random() * 20);
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); }).listen(PORT);
const LIST = JSON.parse(process.argv[2]);
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const [name, sz] of LIST) {
    const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
    await p.addInitScript(s => { window.RAYAT_SIZES = s; }, sz);
    await p.goto(`http://localhost:${PORT}/app/dev-world.html`); await p.waitForFunction(() => window.DEV && DEV.ready, null, { timeout: 180000 }); await p.evaluate(() => DEV.ready);
    await p.evaluate(() => { const S = DEV.S, M = DEV.M; [0, 1, 2, 3].forEach(t => M.regions[M.caps[t]].nb.forEach(j => { if (S.regions[j].owner == null && M.regions[j].type !== 'castle') S.regions[j].owner = t; })); DEV.W.setState(DEV.snapshot()); DEV.W.step(0); });
    await p.screenshot({ path: path.join(OUT, `frame-${name}.png`), timeout: 240000 }); console.log('shot', name); await p.close();
  }
  await b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
