// اختبار الحركة والكاميرا بقياس فعلي داخل المشهد ثلاثي الأبعاد (زمن حتمي):
// سرعة السفينة والجيش ثابتة بلا قفزات، الكاميرا تُبقي السفينة في الإطار، رحلة قصيرة وطويلة، الإيقاف والاستئناف،
// تحديث الحالة أثناء الحركة لا يسرّع، الإنهاء الفوري عند العودة من تبويب مخفي، ووضع الاستكشاف اليدوي لا يتصارع مع المتابعة.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), PORT = 8950 + Math.floor(Math.random() * 40);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); }).listen(PORT);
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('✗', m); } };
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 640, height: 360 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://localhost:${PORT}/app/dev-world.html`); await p.waitForFunction(() => window.DEV && DEV.ready, null, { timeout: 120000 }); await p.evaluate(() => DEV.ready);
  // أدوات داخل الصفحة: تشغيل مشهد وقياس كل خطوة (1/30 ث) بلا رسم
  await p.evaluate(() => { const W = DEV.W, S = DEV.S, M = DEV.M; window.own = (id, t) => { S.regions[id].owner = t; W.setState(DEV.snapshot()); };
    window.ndc = v => { const q = v.clone().project(W.camera); return [q.x, q.y]; };
    window.runScene = async (start, hooks = {}) => { const out = { ship: [], lead: [], ndc: [], cam: [], t: [] }; let done = false, err = null; start().then(() => { done = true; }).catch(e => { err = String(e && e.stack || e); done = true; });
      let i = 0; while (!done && i < 1500) { if (hooks.at && hooks.at[i]) hooks.at[i](); W.step(1 / 30, false); const tr = W.track || {}; out.t.push(W.time); if (tr.ship) { out.ship.push([tr.ship.position.x, tr.ship.position.z]); out.ndc.push(ndc(tr.ship.position)); } else { out.ship.push(null); out.ndc.push(null); }
        const u = tr.units && tr.units[0]; out.lead.push(u && u.visible !== false ? [u.position.x, u.position.z] : null); out.cam.push([W.camera.position.x, W.camera.position.y, W.camera.position.z]); i++; await null; }
      out.err = err; out.frames = i; out.T = tr0(); return out; }; window.tr0 = () => { const t = W.track || {}; return { T: t.T || null, nav: t.nav ? { t0: t.nav.t0, t1: t.nav.t1, len: t.nav.len } : null }; }; });
  const speeds = pts => { const v = []; for (let i = 1; i < pts.length; i++) v.push(pts[i] && pts[i - 1] ? Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) * 30 : null); return v; };
  const moving = v => v.filter(x => x != null && x > 1e-4);
  const med = a => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)] || 0;
  const info = await p.evaluate(() => ({ routes: DEV.M.routes, castle: DEV.M.regions.find(r => r.type === 'castle').id, caps: DEV.M.caps }));

  // ---------- 1) رحلة بحرية قصيرة ----------
  const A = await p.evaluate(async () => { const rt = DEV.M.routes[1]; own(rt.from, 0); own(rt.to, 1); return runScene(() => DEV.W.attack({ a: 0, d: 1, r: rt.to, unit: 'inf', result: 'taken', naval: true })); });
  ok(!A.err, 'الرحلة القصيرة بلا أخطاء: ' + A.err); const vA = speeds(A.ship), mA = moving(vA), cruiseA = med(mA);
  const midA = mA.slice(Math.floor(mA.length * .2), Math.floor(mA.length * .8));
  ok(mA.length > 20, 'السفينة تحركت (' + mA.length + ' خطوة)'); ok(Math.max(...midA) / Math.min(...midA) < 1.12, 'سرعة السفينة ثابتة في وسط الرحلة (أقصى/أدنى = ' + (Math.max(...midA) / Math.min(...midA)).toFixed(3) + ')');
  ok(mA[0] < cruiseA * .5 && mA[mA.length - 1] < cruiseA * .5, 'بداية ونهاية ناعمتان (أول ' + mA[0].toFixed(2) + '، آخر ' + mA[mA.length - 1].toFixed(2) + '، الثابتة ' + cruiseA.toFixed(2) + ')');
  let jumpA = 0; for (let i = 1; i < mA.length; i++) jumpA = Math.max(jumpA, Math.abs(mA[i] - mA[i - 1])); ok(jumpA < cruiseA * .3, 'لا قفزة سرعة بين خطوتين (أكبر تغيّر ' + jumpA.toFixed(3) + ' من ' + cruiseA.toFixed(2) + ')');
  const inFrame = (ndc, from, to) => ndc.slice(from, to).filter(Boolean).every(([x, y]) => Math.abs(x) < .92 && Math.abs(y) < .92);
  const firstMove = vA.findIndex(x => x > 1e-4), lastMove = vA.length - 1 - vA.slice().reverse().findIndex(x => x > 1e-4);
  ok(inFrame(A.ndc, firstMove, lastMove + 1), 'السفينة داخل الإطار طوال الإبحار'); const centerA = A.ndc.slice(firstMove + 30, lastMove - 5).filter(Boolean).map(([x, y]) => Math.hypot(x, y)); ok(Math.max(...centerA) < .6, 'الكاميرا تواكب السفينة ولا تتأخر عنها (أبعد انحراف عن مركز الشاشة ' + Math.max(...centerA).toFixed(2) + ')');
  // الكاميرا نفسها بلا قفزات
  const camSteps = c => { const d = []; for (let i = 1; i < c.length; i++) d.push(Math.hypot(c[i][0] - c[i - 1][0], c[i][1] - c[i - 1][1], c[i][2] - c[i - 1][2])); return d; }, jerk = d => { let m = 0; for (let i = 1; i < d.length; i++) m = Math.max(m, Math.abs(d[i] - d[i - 1])); return m; };
  const cs = camSteps(A.cam); ok(Math.max(...cs) < .6 && jerk(cs) < .12, 'حركة الكاميرا متصلة وناعمة: أكبر خطوة في الإطار ' + Math.max(...cs).toFixed(3) + '، وأكبر تغيّر مفاجئ ' + jerk(cs).toFixed(3));
  // الجنود ينزلون بعد الرسو ويمشون بسرعة ثابتة
  { const T = A.T.T, i0 = A.t.findIndex(t => t - A.t[0] >= T.march[0]), i1 = A.t.findIndex(t => t - A.t[0] >= T.march[1]), vL = moving(speeds(A.lead).slice(i0, i1 > 0 ? i1 : undefined)); ok(vL.length > 15 && Math.max(...vL) < .9, 'الجنود نزلوا بعد الرسو ومشوا بسرعة طبيعية (أقصى ' + (vL.length ? Math.max(...vL).toFixed(2) : '—') + '، خطوات ' + vL.length + ')'); }

  // ---------- 2) رحلة بحرية طويلة: المدة من طول المسار ----------
  const Bn = await p.evaluate(async () => { const M = DEV.M, S = DEV.S; S.regions.forEach(r => { if (r.owner === 0 && r.id !== M.caps[0]) r.owner = null; }); const rt = M.routes[0], far = M.routes[M.routes.length - 1]; const src = M.regions[M.caps[0]].nb.find(j => M.regions[j].type !== 'castle'); own(src, 0); const tgt = M.regions.filter(r => r.land && r.land !== 0).sort((a, b) => Math.hypot(b.x - M.regions[src].x, b.y - M.regions[src].y) - Math.hypot(a.x - M.regions[src].x, a.y - M.regions[src].y))[0]; own(tgt.id, 2);
    return runScene(() => DEV.W.attack({ a: 0, d: 2, r: tgt.id, unit: 'inf', result: 'hold', naval: true })); });
  ok(!Bn.err, 'الرحلة الطويلة بلا أخطاء: ' + Bn.err); const mB = moving(speeds(Bn.ship)), cruiseB = med(mB), midB = mB.slice(Math.floor(mB.length * .2), Math.floor(mB.length * .8));
  if (Bn.T.nav && A.T.nav) { console.log(`  قصيرة: طول ${A.T.nav.len.toFixed(1)} في ${(A.T.nav.t1 - A.T.nav.t0).toFixed(1)} ث (سرعة ${cruiseA.toFixed(2)}) | طويلة: طول ${Bn.T.nav.len.toFixed(1)} في ${(Bn.T.nav.t1 - Bn.T.nav.t0).toFixed(1)} ث (سرعة ${cruiseB.toFixed(2)})`);
    ok(Bn.T.nav.len > A.T.nav.len ? (Bn.T.nav.t1 - Bn.T.nav.t0) >= (A.T.nav.t1 - A.T.nav.t0) : true, 'الرحلة الأطول تأخذ وقتًا أطول'); ok(A.T.nav.len < 1 || (cruiseB / cruiseA < 2.2 && cruiseB / cruiseA > .6), 'سرعة الرحلتين متقاربة (النسبة ' + (cruiseB / cruiseA).toFixed(2) + ')'); ok(cruiseB > .7 && cruiseB < 2, 'سرعة الرحلة الطويلة طبيعية (' + cruiseB.toFixed(2) + ' وحدة/ث)'); }
  ok(midB.length > 10 && Math.max(...midB) / Math.min(...midB) < 1.12, 'سرعة ثابتة في الرحلة الطويلة أيضًا (' + (Math.max(...midB) / Math.min(...midB)).toFixed(3) + ')');
  const fmB = speeds(Bn.ship).findIndex(x => x > 1e-4); { const bad = Bn.ndc.slice(fmB, fmB + mB.length).map((v, i) => [i, v]).filter(([i, v]) => v && (Math.abs(v[0]) >= .92 || Math.abs(v[1]) >= .92)); ok(!bad.length, 'السفينة داخل الإطار في الرحلة الطويلة' + (bad.length ? ' (خارج الإطار في ' + bad.length + ' من ' + mB.length + ' إطارًا، أولها ' + JSON.stringify(bad[0]) + ' كاميرا ' + JSON.stringify(Bn.cam[fmB]) + ' سفينة ' + JSON.stringify(Bn.ship[fmB]) + ')' : '')); }

  // ---------- 3) زحف بري: مشاة وفرسان ومنجنيق، سرعة ثابتة تناسب النوع ----------
  const land = {}; for (const unit of ['inf', 'cav', 'cat']) { land[unit] = await p.evaluate(async unit => { const M = DEV.M, S = DEV.S, cap = M.caps[1], tgt = M.regions[cap].nb.find(j => M.regions[j].type !== 'castle' && !M.regions[j].land); S.regions[tgt].owner = 3; S.regions[tgt].walls = unit === 'cat'; DEV.W.setState(DEV.snapshot()); return runScene(() => DEV.W.attack({ a: 1, d: 3, r: tgt, unit, result: 'hold', from: cap })); }, unit);
    const v = moving(speeds(land[unit].lead)), T = land[unit].T.T, n = Math.round((T.march[1] - T.march[0]) * 30), mv = v.slice(0, n), mid = mv.slice(Math.floor(mv.length * .25), Math.floor(mv.length * .75)); land[unit].cruise = med(mid);
    ok(!land[unit].err && mid.length > 8 && Math.max(...mid) / Math.min(...mid) < 1.25, `${unit}: سرعة الزحف ثابتة (${(Math.max(...mid) / Math.min(...mid)).toFixed(2)})، السرعة ${land[unit].cruise.toFixed(2)}، مدة الزحف ${(T.march[1] - T.march[0]).toFixed(1)} ث`); }
  ok(land.cav.cruise > land.inf.cruise * 1.1, 'الفرسان أسرع من المشاة (' + land.cav.cruise.toFixed(2) + ' > ' + land.inf.cruise.toFixed(2) + ')'); ok(land.cat.cruise <= land.inf.cruise * 1.05, 'المنجنيق لا يسبق المشاة (' + land.cat.cruise.toFixed(3) + ' مقابل ' + land.inf.cruise.toFixed(3) + ')');

  // ---------- 4) الإيقاف والاستئناف وتحديث الحالة أثناء الحركة ----------
  const P4 = await p.evaluate(async () => { const M = DEV.M, S = DEV.S, W = DEV.W, cap = M.caps[2], tgt = M.regions[cap].nb.find(j => M.regions[j].type !== 'castle' && !M.regions[j].land); S.regions[tgt].owner = 1; W.setState(DEV.snapshot()); const log = {};
    const r = await runScene(() => W.attack({ a: 2, d: 1, r: tgt, unit: 'inf', result: 'taken', from: cap }), { at: { 60: () => { W.paused = true; log.p0 = W.track.units[0].position.clone(); log.t0 = W.time; }, 90: () => { log.p1 = W.track.units[0].position.clone(); log.t1 = W.time; W.paused = false; }, 100: () => { W.setState(DEV.snapshot()); log.skipAfterState = !!W.skipping; log.speed = W.speedNow; } } });
    return { err: r.err, still: log.p0.distanceTo(log.p1), dt: log.t1 - log.t0, skip: log.skipAfterState, speed: log.speed, lead: r.lead, owner: W.owner[tgt] }; });
  ok(!P4.err && P4.still < 1e-6 && Math.abs(P4.dt) < 1e-6, 'الإيقاف يجمّد الوحدات وزمن المشهد تمامًا'); ok(!P4.skip && Math.abs(P4.speed - 1) < .01, 'تحديث الحالة أثناء الحركة لا يفعّل التخطي ولا يغيّر السرعة');
  const v4 = speeds(P4.lead); let j4 = 0; for (let i = 92; i < 110; i++) if (v4[i] != null && v4[i - 1] != null) j4 = Math.max(j4, Math.abs(v4[i] - v4[i - 1])); ok(j4 < .12, 'الاستئناف بلا قفزة (أكبر تغيّر سرعة ' + j4.toFixed(3) + ')'); ok(P4.owner === 2, 'المشهد اكتمل والأرض انتقلت للفاتح');

  // ---------- 5) العودة من تبويب مخفي: إنهاء فوري بلا تسارع مرئي ----------
  const S5 = await p.evaluate(async () => { const M = DEV.M, S = DEV.S, W = DEV.W, cap = M.caps[3], tgt = M.regions[cap].nb.find(j => M.regions[j].type !== 'castle' && !M.regions[j].land && S.regions[j].owner !== 3); S.regions[tgt].owner = 0; W.setState(DEV.snapshot()); let frames = -1;
    const r = await runScene(() => W.attack({ a: 3, d: 0, r: tgt, unit: 'inf', result: 'taken', from: cap }), { at: { 40: () => { W.snap(); } } }); return { frames: r.frames, owner: W.owner[tgt], skipping: W.skipping, busy: W.busy }; });
  ok(S5.frames <= 44 && S5.owner === 3 && !S5.skipping && !S5.busy, 'الإنهاء الفوري أنهى المشهد في إطار واحد والحالة صحيحة (' + S5.frames + ' إطارًا)');

  // ---------- 6) وضع الاستكشاف اليدوي ----------
  const M6 = await p.evaluate(async () => { const W = DEV.W, M = DEV.M, out = {}; W.step(.5, false); out.mode0 = W.camMode(); W.zoomBy(.2); for (let i = 0; i < 60; i++) W.step(1 / 30, false); out.mode1 = W.camMode(); out.near = W.camera.position.y;
    W.zoomBy(.0001); W.orbitBy(0, -3); for (let i = 0; i < 90; i++) W.step(1 / 30, false); out.minY = W.camera.position.y; W.zoomBy(1e6); W.panBy(1e7, 1e7); for (let i = 0; i < 120; i++) W.step(1 / 30, false); out.far = W.camera.position.length();
    // مشهد يبدأ أثناء الاستكشاف: لا يخطف الكاميرا
    const cap = M.caps[0], tgt = M.regions[cap].nb.find(j => M.regions[j].type !== 'castle' && !M.regions[j].land); DEV.S.regions[tgt].owner = null; W.setState(DEV.snapshot()); W.viewAll(); for (let i = 0; i < 60; i++) W.step(1 / 30, false); const c0 = W.camera.position.clone();
    const pr = W.occupy({ team: 0, r: tgt }); for (let i = 0; i < 45; i++) W.step(1 / 30, false); out.heldDuringScene = W.camera.position.distanceTo(c0); out.mode2 = W.camMode();
    // متابعة الحدث: انتقال سلس بلا قفزة
    W.followEvent(); let mx = 0, jk = 0, pd = 0, prev = W.camera.position.clone(); for (let i = 0; i < 80; i++) { W.step(1 / 30, false); const d = W.camera.position.distanceTo(prev); mx = Math.max(mx, d); if (i) jk = Math.max(jk, Math.abs(d - pd)); pd = d; prev = W.camera.position.clone(); } out.backJump = mx; out.backJerk = jk; out.mode3 = W.camMode(); out.movedToScene = W.camera.position.distanceTo(c0);
    let k = 0; let fin = false; pr.then(() => { fin = true; }); while (!fin && k++ < 600) { W.step(1 / 30, false); await null; }
    // التركيز على أرض بالنقر
    const c = M.caps[1]; W.focus(c); for (let i = 0; i < 90; i++) W.step(1 / 30, false); const q = W.R[c]; const v = new THREE.Vector3(q.x, 0, q.z).project(W.camera); out.focusNdc = Math.hypot(v.x, v.y); out.pickCenter = W.pick(innerWidth / 2, innerHeight / 2); out.cap = c;
    out.pickSea = W.pick(2, 2); W.viewAll(); for (let i = 0; i < 90; i++) W.step(1 / 30, false); out.pickSea2 = W.pick(3, innerHeight - 3); return out; });
  ok(M6.mode0 === 'follow' && M6.mode1 === 'manual', 'التقريب اليدوي يدخل وضع الاستكشاف'); ok(M6.minY > .3, 'الكاميرا لا تنزل تحت الأرض ولا داخل المباني عند أقصى تقريب وميل (ارتفاعها ' + M6.minY.toFixed(2) + ')'); ok(M6.far < 40, 'الإبعاد والسحب محدودان (' + M6.far.toFixed(1) + ')');
  ok(M6.mode2 === 'manual' && M6.heldDuringScene < .01, 'مشهد يبدأ أثناء الاستكشاف لا يخطف الكاميرا (تحركت ' + M6.heldDuringScene.toFixed(3) + ')'); ok(M6.mode3 === 'follow' && M6.movedToScene > .5 && M6.backJump < .6 && M6.backJerk < .08, '«متابعة الحدث» تنقل الكاميرا للحدث بسلاسة (أكبر خطوة ' + M6.backJump.toFixed(2) + '، أكبر تغيّر مفاجئ ' + M6.backJerk.toFixed(3) + ')');
  ok(M6.focusNdc < .15 && M6.pickCenter === M6.cap, 'التركيز على أرض يضعها في مركز الشاشة، والنقر يلتقطها'); ok(M6.pickSea2 == null, 'النقر في البحر لا يلتقط أرضًا');
  console.log(`الحركة والكاميرا: ${pass} نجح، ${fail} فشل`, 'أخطاء الصفحة', errs.length, errs.slice(0, 3)); await b.close(); process.exit(fail || errs.length ? 1 : 0);
})();
