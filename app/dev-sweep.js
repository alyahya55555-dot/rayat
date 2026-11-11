// فحص آلي لكل المشاهد على عدة خرائط و2/4/6 فرق: تصادم الجنود بالمباني والأشجار، وأخطاء الصفحة، ومدة كل مشهد (بلا رسم)
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.mp3': 'audio/mpeg' };
const PORT = 8300 + Math.floor(Math.random() * 30);
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); }).listen(PORT);
const MAPS = JSON.parse(process.argv[2] || '[[2,3],[4,7],[6,11]]');
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }); let bad = 0;
  for (const [n, seed] of MAPS) {
    const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto(`http://localhost:${PORT}/app/dev-world.html?n=${n}&seed=${seed}`); await p.waitForFunction(() => window.DEV && DEV.ready, null, { timeout: 300000 });
    const res = await p.evaluate(async (n) => { const W = DEV.W, S = DEV.S, M = DEV.M, RR = DEV.RR, out = []; W.audit = true;
      const snap = () => W.setState(DEV.snapshot()); const own = (id, t) => { S.regions[id].owner = t; };
      for (let t = 0; t < n; t++) M.regions[M.caps[t]].nb.forEach(j => { if (S.regions[j].owner == null && M.regions[j].type !== 'castle' && !M.regions[j].land) own(j, t); }); snap();
      const run = async (name, fn) => { W.hits = []; const t0 = W.time; let done = false, err = null; try { fn().then(() => done = true).catch(e => { err = String(e); done = true; }); } catch (e) { err = String(e); done = true; } let k = 0; while (!done && k++ < 900) { W.step(1 / 30, false); await null; } const c = {}; W.hits.forEach(h => c[h[0]] = (c[h[0]] || 0) + 1); out.push({ name, dur: +(W.time - t0).toFixed(1), hits: W.hits.length, by: c, err, timeout: !done, h0: W.hits.slice(0, 3), occ: W._occDbg }); W._occDbg = null; for (let i = 0; i < 20; i++) W.step(1 / 30, false); };
      const enemyNb = (a, pred = () => true) => S.regions.find(r => r.owner != null && r.owner !== a && M.regions[r.id].type !== 'capital' && M.regions[r.id].type !== 'castle' && r.nb.some(j => S.regions[j].owner === a) && pred(r));
      const free = (a) => S.regions.find(r => r.owner == null && M.regions[r.id].type !== 'castle' && !M.regions[r.id].land && r.nb.some(j => S.regions[j].owner === a));
      { const f = free(0); if (f) { await run('occupy', () => W.occupy({ team: 0, r: f.id })); own(f.id, 0); snap(); } }
      { const e = enemyNb(0); if (e) { await run('attack-inf-taken', () => W.attack({ a: 0, d: e.owner, r: e.id, unit: 'inf', result: 'taken' })); own(e.id, 0); snap(); } }
      { const e = enemyNb(0); if (e) await run('attack-inf-hold', () => W.attack({ a: 0, d: e.owner, r: e.id, unit: 'inf', result: 'hold' })); }
      { const e = enemyNb(0); if (e) { S.regions[e.id].walls = true; snap(); await run('cat-walls-hold', () => W.attack({ a: 0, d: e.owner, r: e.id, unit: 'cat', result: 'hold', wallsBroken: true })); S.regions[e.id].walls = false; snap(); } }
      { const e = enemyNb(0); if (e) { S.regions[e.id].walls = true; snap(); await run('cat-walls-taken', () => W.attack({ a: 0, d: e.owner, r: e.id, unit: 'cat', result: 'taken', wallsBroken: true })); own(e.id, 0); S.regions[e.id].walls = false; snap(); } }
      { RR.setPhase(S, 2); const o = RR.legal(S, 0).find(x => x.k === 'attack' && x.unit === 'cav'); if (o) await run('cav', () => W.attack({ a: 0, d: S.regions[o.r].owner, r: o.r, unit: 'cav', result: 'taken' })); }
      { const e = enemyNb(0); if (e) { S.regions[e.id].garrison = 'inf'; snap(); await run('garrison-fell', () => W.attack({ a: 0, d: e.owner, r: e.id, unit: 'inf', result: 'garrisonFell' })); S.regions[e.id].garrison = null; snap(); } }
      { const c = M.caps[1]; if (!S.regions[c].nb.some(j => S.regions[j].owner === 0)) { const j = S.regions[c].nb.find(j => M.regions[j].type !== 'castle' && !M.regions[j].land); own(j, 0); snap(); } await run('capital-loot', () => W.attack({ a: 0, d: 1, r: c, unit: 'inf', result: 'loot' })); } // نهب قانوني: من أرض ملاصقة
      { const cs = M.regions.find(r => r.type === 'castle').id; await run('castle-siege-cat', () => W.attack({ a: 0, d: 1, r: cs, unit: 'cat', result: 'hold' })); }
      { const port = M.regions.find(r => r.type === 'port'); own(port.id, 0); snap(); const isle = S.regions.find(r => M.regions[r.id].land && r.owner == null); if (isle) { W._why = null; await run('occupy-island', () => W.occupy({ team: 0, r: isle.id })); out[out.length - 1].why = W._why; own(isle.id, 0); snap(); }
        const tgt = M.regions.find(r => S.regions[r.id].owner != null && S.regions[r.id].owner !== 0 && r.coast && r.type !== 'capital' && r.type !== 'castle'); if (tgt) await run('naval', () => W.attack({ a: 0, d: S.regions[tgt.id].owner, r: tgt.id, unit: 'inf', result: 'taken', naval: true })); }
      { const mine = S.regions.find(r => r.owner === 0 && M.regions[r.id].type !== 'capital' && M.regions[r.id].type !== 'castle'); for (const k of ['walls', 'tower', 'garInf', 'garCav']) await run('build-' + k, () => W.build({ r: mine.id, k, team: 0 })); }
      await run('harvest', () => W.harvest()); if (n > 2) { await run('ally', () => W.ally({ a: 0, b: 1 })); out[out.length - 1].why = W._dbg.landRoute(M.caps[0], M.caps[1]).map(p => p.map(v => +v.toFixed(2))); await run('betray', () => W.unally({ a: 0, b: 1, betray: true })); }
      W.faceoff({ a: 0, d: 1, r: (enemyNb(0) || {}).id, unit: 'inf' }); for (let i = 0; i < 60; i++) W.step(1 / 30, false); W.faceoffEnd(); W.idle(); for (let i = 0; i < 60; i++) W.step(1 / 30, false);
      return out; }, n);
    console.log(`== ${n} فرق، خريطة ${seed}`); res.forEach(r => { if (r.hits || r.err || r.timeout) bad++; console.log(`  ${r.name.padEnd(18)} ${String(r.dur).padStart(5)} ث  تصادم ${r.hits}${r.hits ? ' ' + JSON.stringify(r.by) + ' ' + JSON.stringify(r.h0) + (r.occ ? ' OCC ' + JSON.stringify(r.occ) : '') : ''}${r.err ? ' خطأ ' + r.err : ''}${r.timeout ? ' لم ينتهِ' : ''}${r.why ? ' سبب ' + JSON.stringify(r.why) : ''}`); });
    console.log('  أخطاء الصفحة', errs.slice(0, 5)); if (errs.length) bad++; await p.close();
  }
  console.log(bad ? `مشاكل: ${bad}` : 'كل المشاهد سليمة'); await b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
