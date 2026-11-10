// لقطات المشاهد الجديدة: إنزال بحري، حصار القلعة، نهب، حصاد، رسول التحالف، نقض الحلف، بناء السور بالسقالات
// الاستعمال: node app/dev-scenes.js [naval,siege,loot,harvest,ally,betray,walls,occupySea]
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), OUT = path.join(__dirname, 'out', 'scenes'); fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const PORT = 8470 + Math.floor(Math.random() * 20);
http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); }).listen(PORT);
const [Wd, Hd] = (process.env.SIZE || '1280x720').split('x').map(Number);
const want = (process.argv[2] || 'naval,siege,loot,harvest,ally,betray,walls,occupySea').split(',');
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: Wd, height: Hd } }); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(`http://localhost:${PORT}/app/dev-world.html`); await p.waitForFunction(() => window.DEV && DEV.ready, null, { timeout: 120000 }); await p.evaluate(() => DEV.ready);
  await p.evaluate(() => { DEV.W.audit = true; });
  const shot = async name => { await p.evaluate(() => DEV.W.step(0)); await p.screenshot({ path: path.join(OUT, name + '.png'), timeout: 180000 }); };
  const play = async (expr, times, prefix) => { await p.evaluate(e => { window.__done = false; eval(e).then(() => { window.__done = true; }).catch(er => { window.__err = String(er && er.stack || er); window.__done = true; }); }, expr);
    let t = 0; const dt = 1 / 30; for (const at of times) { while (t < at) { const n = Math.max(1, Math.round((at - t) / dt)); await p.evaluate(([dt, n]) => { for (let i = 0; i < n; i++) DEV.W.step(dt, false); }, [dt, n]); t += n * dt; } await shot(`${prefix}-${at}`); }
    let k = 0; while (!(await p.evaluate(() => window.__done)) && k++ < 80) await p.evaluate(dt => { for (let i = 0; i < 30; i++) DEV.W.step(dt, false); }, dt);
    const er = await p.evaluate(() => window.__err); if (er) { console.log('ERR', prefix, er); await p.evaluate(() => { window.__err = null; }); }
    console.log('✓', prefix, 'hits', await p.evaluate(() => { const h = DEV.W.hits.length, c = {}; DEV.W.hits.forEach(x => c[x[0]] = Math.min(c[x[0]] || 0, x[1])); DEV.W.hits = []; return h + ' ' + JSON.stringify(c); })); };
  // أدوات: ملكية مباشرة
  await p.evaluate(() => { const S = DEV.S; window.own = (id, t) => { S.regions[id].owner = t; DEV.W.setState(DEV.snapshot()); }; window.M = DEV.M; });
  const info = await p.evaluate(() => ({ caps: M.caps, castle: M.regions.find(r => r.type === 'castle').id, ports: M.regions.filter(r => r.type === 'port').map(r => r.id), isles: M.regions.filter(r => r.land).map(r => ({ id: r.id, land: r.land, nb: r.nb })), routes: M.routes }));
  console.log(JSON.stringify(info));
  if (want.includes('naval')) { // الفريق 0 يملك ميناء الجزيرة الأولى ويهاجم أرضًا على الجزيرة الأخرى بحرًا
    const r = await p.evaluate(() => { const rt = M.routes[1], port = rt.from; own(port, 0); own(rt.to, 1); return { port, tgt: rt.to }; });
    await play(`DEV.W.attack({ a: 0, d: 1, r: ${r.tgt}, unit: 'inf', result: 'taken', naval: true })`, [1.0, 2.2, 3.4, 4.6, 6.0, 7.8, 9.6], 'naval'); }
  if (want.includes('siege')) { const c = info.castle; await p.evaluate(c => { own(c, 2); const nb = M.regions[c].nb[0]; own(nb, 0); }, c);
    await play(`DEV.W.attack({ a: 0, d: 2, r: ${c}, unit: 'cat', result: 'hold' })`, [3.6, 4.4, 5.2, 6.0], 'siege'); }
  if (want.includes('loot')) { const cap = info.caps[1]; await p.evaluate(cap => { own(M.regions[cap].nb[0], 0); }, cap);
    await play(`DEV.W.attack({ a: 0, d: 1, r: ${cap}, unit: 'inf', result: 'loot' })`, [6.6, 7.6, 8.6, 9.4], 'loot'); }
  if (want.includes('harvest')) { await p.evaluate(() => { [0, 1, 2, 3].forEach(t => { const c = M.caps[t]; const n = M.regions[c].nb.find(j => DEV.S.regions[j].owner == null && M.regions[j].type !== 'castle'); if (n != null) own(n, t); }); });
    await play(`DEV.W.harvest()`, [1.0, 2.0, 3.0, 3.6], 'harvest'); }
  if (want.includes('ally')) await play(`DEV.W.ally({ a: 0, b: 1 })`, [1.0, 2.0, 3.0, 4.2, 5.4], 'ally');
  if (want.includes('betray')) await play(`DEV.W.unally({ a: 0, b: 1, betray: true })`, [.4, .8, 1.3, 2.0], 'betray');
  if (want.includes('walls')) { const r = await p.evaluate(() => { const id = M.regions.find(x => DEV.S.regions[x.id].owner === 0 && x.type !== 'capital' && x.type !== 'castle').id; return id; });
    await play(`DEV.W.build({ r: ${r}, k: 'walls', team: 0 })`, [1.4, 2.4, 3.6, 4.6], 'walls'); await play(`DEV.W.build({ r: ${r}, k: 'tower', team: 0 })`, [2.4, 4.6], 'tower'); }
  if (want.includes('occupySea')) { const r = await p.evaluate(() => { const isle1 = M.regions.find(x => x.land === 1 && DEV.S.regions[x.id].owner == null); return isle1 ? isle1.id : null; });
    if (r != null) await play(`DEV.W.occupy({ team: 0, r: ${r} })`, [1.4, 2.6, 3.8, 5.0, 7.0], 'occupySea'); }
  console.log('errors', errs.length, errs.slice(0, 5)); await b.close(); process.exit(0);
})();
