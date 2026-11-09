// تشغيل العالم في متصفح بلا واجهة، وتنفيذ أحداث حقيقية من محرك القواعد، وحفظ لقطات بأوقات محددة
// الاستعمال: node app/dev-shot.js <سيناريو>   (السيناريوهات في الأسفل)
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.mp3': 'audio/mpeg' };
const PORT = 8170 + Math.floor(Math.random() * 20);
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0].split('#')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); }).listen(PORT);
const [Wd, Hd] = (process.env.SIZE || '1600x900').split('x').map(Number);
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: Wd, height: Hd } }); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(`http://localhost:${PORT}/app/dev-world.html`); await p.waitForFunction(() => window.DEV && DEV.ready, null, { timeout: 120000 }); await p.evaluate(() => DEV.ready);
  console.log('layout', JSON.stringify(await p.evaluate(() => DEV.W.layout()))); await p.evaluate(() => { DEV.W.audit = true; });
  const shot = async name => { await p.evaluate(() => DEV.W.step(0)); await p.screenshot({ path: path.join(OUT, name + '.png'), timeout: 180000 }); };
  // يشغّل حدثًا ويلتقط لقطات عند أوقات نسبية
  const play = async (expr, times, prefix) => { await p.evaluate(e => { window.__done = false; window.__t0 = DEV.W.time; eval(e).then(() => { window.__done = true; }); }, expr);
    let t = 0; const dt = 1 / 30; for (const at of times) { while (t < at) { const n = Math.max(1, Math.round((at - t) / dt)); await p.evaluate(([dt, n]) => { for (let i = 0; i < n; i++) DEV.W.step(dt, false); }, [dt, n]); t += n * dt; } await shot(`${prefix}-${at}`); }
    let k = 0; while (!(await p.evaluate(() => window.__done)) && k++ < 60) await p.evaluate(dt => { for (let i = 0; i < 30; i++) DEV.W.step(dt, false); }, dt); };
  const scen = process.argv[2] || 'overview';
  await p.evaluate(() => { DEV.W.step(0); }); await shot('overview');
  if (scen === 'all' || scen === 'occupy') {
    const e = await p.evaluate(() => { const S = DEV.S, RR = DEV.RR; RR.startCycle(S, [1, 1, 1, 1]); const L = RR.legal(S, 0).find(o => o.k === 'occupy'); RR.act(S, 0, L); return L; });
    await play(`DEV.W.occupy({ team: 0, r: ${e.r} })`, [1, 2.4, 3.8, 5, 6.5], 'occ');
  }
  if (scen === 'all' || scen === 'attack') {
    const e = await p.evaluate(() => { const S = DEV.S, RR = DEV.RR; RR.setPhase(S, 1); const t = S.regions.find(r => r.owner === 1 && r.type !== 'capital' && r.nb.some(j => S.regions[j].owner === 0)); return t ? { r: t.id } : null; });
    if (e) await play(`DEV.W.attack({ a: 0, d: 1, r: ${e.r}, unit: 'inf', result: 'taken' })`, [1, 2.5, 4, 5.2, 6.6, 7.6, 8.6], 'atk');
  }
  if (scen === 'all' || scen === 'build') {
    const r = await p.evaluate(() => DEV.S.regions.find(r => r.owner === 0 && r.type !== 'capital').id);
    await play(`DEV.W.build({ r: ${r}, k: 'walls', team: 0 })`, [2, 3.5, 4.8], 'wal');
    await play(`DEV.W.build({ r: ${r}, k: 'tower', team: 0 })`, [3, 4.8], 'tow');
    await play(`DEV.W.build({ r: ${r}, k: 'garInf', team: 0 })`, [2, 4.5], 'gar');
  }
  console.log('hits', JSON.stringify(await p.evaluate(() => { const h = DEV.W.hits; const c = {}; h.forEach(x => c[x[0]] = (c[x[0]] || 0) + 1); return { n: h.length, by: c, worst: h.sort((a, b) => a[1] - b[1]).slice(0, 5) }; })));
  console.log('stats', JSON.stringify(await p.evaluate(() => DEV.W.stats())));
  console.log('errors', errs.slice(0, 10));
  await b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
