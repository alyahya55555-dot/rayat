// لقطات الدفعة 3: الترقب، الزحف (خلف الجيش)، الفرسان، المنجنيق خطوة خطوة، السفينة، الانسياب فوق الجبهة، المعالم
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), OUT = path.join(__dirname, 'out', 'b3'); fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.mp3': 'audio/mpeg' };
const PORT = 8260 + Math.floor(Math.random() * 20);
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); }).listen(PORT);
const want = (process.argv[2] || 'all').split(',');
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(`http://localhost:${PORT}/app/dev-world.html`); await p.waitForFunction(() => window.DEV && DEV.ready, null, { timeout: 180000 }); await p.evaluate(() => DEV.ready);
  await p.evaluate(() => { const S = DEV.S, M = DEV.M; [0, 1, 2, 3].forEach(t => M.regions[M.caps[t]].nb.forEach(j => { if (S.regions[j].owner == null && M.regions[j].type !== 'castle') S.regions[j].owner = t; })); DEV.W.setState(DEV.snapshot()); DEV.W.audit = true; DEV.W.hits = []; });
  const shot = async n => { await p.evaluate(() => DEV.W.step(0)); await p.screenshot({ path: path.join(OUT, n + '.png'), timeout: 240000 }); console.log('shot', n); };
  const adv = async sec => { const dt = 1 / 30; let t = 0; while (t < sec) { const k = Math.min(30, Math.round((sec - t) / dt)) || 1; await p.evaluate(([dt, k]) => { for (let i = 0; i < k; i++) DEV.W.step(dt, false); }, [dt, k]); t += k * dt; } };
  const finish = async () => { for (let i = 0; i < 60; i++) { if (await p.evaluate(() => !DEV.W.busy)) break; await adv(1); } };
  const sceneT = () => p.evaluate(() => DEV.W.track && DEV.W.track.T);
  if (want.includes('all') || want.includes('lm')) await shot('0-overview');
  if (want.includes('all') || want.includes('cat')) {
    const r = await p.evaluate(() => { const S = DEV.S; const t = S.regions.find(x => x.owner === 1 && DEV.M.regions[x.id].type !== 'capital' && x.nb.some(j => S.regions[j].owner === 0)); t.walls = true; DEV.W.setState(DEV.snapshot()); return t.id; });
    await p.evaluate(r => { DEV.W.faceoff({ a: 0, d: 1, r, unit: 'cat' }); }, r); await adv(2.5); await shot('1-faceoff');
    await p.evaluate(r => { window.__p = DEV.W.attack({ a: 0, d: 1, r, unit: 'cat', result: 'hold', wallsBroken: true }); }, r);
    await adv(.2); const T = await sceneT(); console.log('T', JSON.stringify(T));
    await adv(T.march[0] + (T.march[1] - T.march[0]) * .5 - .2); await shot('2-cat-march');
    await adv(T.fire[0] + .8 - (T.march[0] + (T.march[1] - T.march[0]) * .5)); await shot('3-cat-wind');
    await adv(.55); await shot('4-cat-flight'); await adv(.55); await shot('5-cat-impact'); await adv(.6); await shot('6-cat-breach');
    await adv(T.res[0] + 1.2 - (T.fire[0] + 2.5)); await shot('7-cat-hold'); await finish(); await shot('8-cat-after');
  }
  if (want.includes('all') || want.includes('cav')) {
    const r = await p.evaluate(() => { const S = DEV.S, RR = DEV.RR; RR.setPhase(S, 2); const o = RR.legal(S, 0).find(x => x.k === 'attack' && x.unit === 'cav' && S.regions[x.r].owner !== 0); if (o) return o.r; const t = S.regions.find(x => x.owner === 2 && DEV.M.regions[x.id].type !== 'capital'); return t.id; });
    await p.evaluate(r => { window.__p = DEV.W.attack({ a: 0, d: DEV.S.regions[r].owner, r, unit: 'cav', result: 'taken' }); }, r); await adv(.2); const T = await sceneT();
    await adv((T.march[0] + T.march[1]) / 2 - .2); await shot('9-cav-gallop'); await adv(T.res[0] + 1.6 - (T.march[0] + T.march[1]) / 2); await shot('10-cav-top'); await finish();
  }
  if (want.includes('all') || want.includes('ship')) {
    const r = await p.evaluate(() => { const S = DEV.S, M = DEV.M; const port = M.regions.find(x => x.type === 'port'); S.regions[port.id].owner = 0; DEV.W.setState(DEV.snapshot()); const t = M.regions.find(x => S.regions[x.id].owner === 2 && x.coast && x.type !== 'capital'); return t.id; });
    await p.evaluate(r => { window.__p = DEV.W.attack({ a: 0, d: 2, r, unit: 'inf', result: 'taken', naval: true }); }, r); await adv(.2); const T = await sceneT(); const nav = await p.evaluate(() => DEV.W.track.nav && [DEV.W.track.nav.t0, DEV.W.track.nav.t1]);
    if (nav) { await adv((nav[0] + nav[1]) / 2 - .2); await shot('11-ship'); } await finish();
  }
  if (want.includes('all') || want.includes('idle')) { await p.evaluate(() => DEV.W.idle()); await adv(4); await shot('12-idle'); }
  console.log('hits', JSON.stringify(await p.evaluate(() => { const c = {}; DEV.W.hits.forEach(x => c[x[0]] = (c[x[0]] || 0) + 1); return { n: DEV.W.hits.length, by: c }; })));
  console.log('errors', errs.slice(0, 8)); await b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
