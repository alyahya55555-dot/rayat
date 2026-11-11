// مقارنة المقاسات: الحالي مقابل المقترح، بنفس المشاهد واللحظات
// node app/dev-sizes.js
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), OUT = path.join(__dirname, 'out', 'sizes'); fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.mp3': 'audio/mpeg' };
const PORT = 8200 + Math.floor(Math.random() * 20);
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); }).listen(PORT);
const CFGS = { now: {}, new: { island: 1.3, unit: 1.25, ship: 1.35, house: 1.1, crew: 1.28 } };
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const [name, sz] of Object.entries(CFGS)) {
    const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.addInitScript(s => { window.RAYAT_SIZES = s; }, sz);
    await p.goto(`http://localhost:${PORT}/app/dev-world.html`); await p.waitForFunction(() => window.DEV && DEV.ready, null, { timeout: 180000 }); await p.evaluate(() => DEV.ready);
    // نفس الملكية في الحالتين: كل فريق يملك جيران عاصمته
    await p.evaluate(() => { const S = DEV.S, M = DEV.M; [0, 1, 2, 3].forEach(t => M.regions[M.caps[t]].nb.forEach(j => { if (S.regions[j].owner == null && M.regions[j].type !== 'castle') S.regions[j].owner = t; })); DEV.W.setState(DEV.snapshot()); });
    const shot = async n => { await p.evaluate(() => DEV.W.step(0)); await p.screenshot({ path: path.join(OUT, `${n}-${name}.png`), timeout: 240000 }); console.log('shot', n, name); };
    const play = async (expr, at, n) => { await p.evaluate(e => { window.__p = eval(e); }, expr); let t = 0; const dt = 1 / 30; while (t < at) { const k = Math.min(30, Math.round((at - t) / dt)); await p.evaluate(([dt, k]) => { for (let i = 0; i < k; i++) DEV.W.step(dt, false); }, [dt, k]); t += k * dt; } await shot(n);
      for (let i = 0; i < 40; i++) { const done = await p.evaluate(() => !DEV.W.busy); if (done) break; await p.evaluate(dt => { for (let i = 0; i < 30; i++) DEV.W.step(dt, false); }, dt); } };
    await shot('1-island');
    const tgt = await p.evaluate(() => { const S = DEV.S; const t = S.regions.find(r => r.owner === 1 && DEV.M.regions[r.id].type !== 'capital' && r.nb.some(j => S.regions[j].owner === 0)); return t && t.id; });
    if (tgt != null) await play(`DEV.W.attack({ a: 0, d: 1, r: ${tgt}, unit: 'inf', result: 'taken' })`, 4.2, '2-attack');
    const nav = await p.evaluate(() => { const S = DEV.S, M = DEV.M; const port = M.regions.find(r => r.type === 'port'); if (!port) return null; S.regions[port.id].owner = 0; DEV.W.setState(DEV.snapshot()); const t = M.regions.find(r => S.regions[r.id].owner === 2 && r.coast && M.regions[r.id].type !== 'capital'); return t && t.id; });
    if (nav != null) await play(`DEV.W.attack({ a: 0, d: 2, r: ${nav}, unit: 'inf', result: 'taken', naval: true })`, 3.0, '3-ships');
    console.log(name, 'errors', errs.slice(0, 3)); await p.close();
  }
  await b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
