const { chromium } = require('playwright');
const http = require('http'), fs = require('fs');
const html = fs.readFileSync(__dirname + '/../dist/index.html');
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); }).listen(8127);
let ok = 0, bad = 0; const check = (c, m) => { c ? ok++ : bad++; console.log(c ? '✓' : '✗', m); };
const sleep = ms => new Promise(r => setTimeout(r, ms)); const errs = [];
const D = 'shots-war/'; fs.mkdirSync(D, { recursive: true });
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.route(/fonts\./, r => r.fulfill({ status: 200, body: '' }));
  ctx.on('page', p => { p.on('pageerror', e => errs.push(e.message)); });
  const host = await ctx.newPage(); await host.goto('http://localhost:8127/#host'); await sleep(900);
  const code = await host.evaluate(() => Host.e.s.code);
  const disp = await ctx.newPage(); await disp.setViewportSize({ width: 1280, height: 720 }); await disp.goto('http://localhost:8127/#display'); await sleep(800); await disp.mouse.click(500, 300);
  // متنصّت: يسجّل كل الرسائل الخاصة المارّة على القناة كما يراها أي جهاز
  const spy = await ctx.newPage(); await spy.goto('about:blank'); await spy.goto('http://localhost:8127/#none');
  await spy.evaluate(() => { window.cap = []; const c = new BroadcastChannel('bena-v1'); c.onmessage = e => { if (e.data && e.data.t === 'priv') window.cap.push(JSON.stringify(e.data)); }; });
  const S = [];
  for (let i = 0; i < 12; i++) { const p = await ctx.newPage(); await p.setViewportSize({ width: 390, height: 844 }); await p.goto('http://localhost:8127/#join-' + code); await sleep(250); await p.fill('#jn', 'لاعب' + (i + 1)); await p.click('#jgo'); S.push(p); }
  await sleep(3000);
  check(await host.evaluate(() => Object.keys(Host.e.s.students).length) === 12, 'انضم 12 لاعبًا');
  // الافتتاح والقرعة
  await host.evaluate(() => { Host.e.goSegment(0); Host.e.nextItem(); }); await sleep(300);
  check(await host.evaluate(() => Host.e.s.seg.phase) === 'draw', 'الافتتاح يمر بالقرعة');
  await host.click('[data-act="drawteams"]'); await sleep(900);
  const cnt = await host.evaluate(() => { const c = {}; Object.values(Host.e.s.students).forEach(s => c[s.team] = (c[s.team] || 0) + 1); return Object.values(c); });
  check(cnt.every(x => x === 3), 'القرعة وزعت 3 لاعبين لكل فريق: ' + cnt);
  await disp.screenshot({ path: D + '01-draw.png' });
  // إعطاء ذهب ثم مجلس القرية
  await host.evaluate(() => { Host.e.manualAdjust('t1', 70); Host.e.manualAdjust('t2', 45); Host.e.manualAdjust('t3', 25); Host.e.goSegment(Host.e.s.plan.findIndex(p => p.g === 'council')); Host.e.nextItem(); Host.e.openItem(); });
  await sleep(900);
  await S[0].screenshot({ path: D + '02-phone-council.png' });
  const teamOf = await Promise.all(S.map(p => p.evaluate(() => Student.me().team)));
  for (let i = 0; i < 12; i++) { const vote = teamOf[i] === 't1' ? 0 : teamOf[i] === 't2' ? 2 : 1; const b2 = await S[i].$(`[data-ans="${vote}"]`); if (b2) await b2.click(); }
  await sleep(1200); await host.click('[data-act="lock"]'); await sleep(800);
  const vil = await host.evaluate(() => ({ t1: Host.e.vil('t1').b, t2: Host.e.vil('t2').b, t3: Host.e.vil('t3').b, g1: Host.e.vil('t1').gold }));
  check(vil.t1.wall === 1 && vil.t2.barracks === 1 && vil.t3.tower === 1, 'الجوالات صوّتت وبُنيت المباني: ' + JSON.stringify(vil));
  await disp.screenshot({ path: D + '03-council-display.png' });
  // القصف من الجوال
  await host.evaluate(() => { Host.e.goSegment(Host.e.s.plan.findIndex(p => p.g === 'bombard')); Host.e.nextItem(); Host.e.openItem(); }); await sleep(800);
  const bi = teamOf.findIndex(t => t === 't2');
  await S[bi].dispatchEvent('[data-buzz]', 'pointerdown'); await sleep(900);
  check(await host.evaluate(() => Host.e.s.seg.phase) === 'answering', 'الاستباق في القصف');
  await host.click('[data-act="judge"][data-arg="1"]'); await sleep(900);
  check(await host.evaluate(() => Host.e.s.seg.phase) === 'aim', 'إجابة صحيحة ← مرحلة التصويب');
  await S[bi].screenshot({ path: D + '04-phone-aim.png' }); await disp.screenshot({ path: D + '05-bomb-aim.png' });
  const tgt = await S[bi].$('[data-shoot^="t3|"]'); await tgt.click(); await sleep(1200);
  const shot = await host.evaluate(() => ({ ph: Host.e.s.seg.phase, log: Host.e.item().shotLog }));
  check(shot.log.length === 1 && shot.log[0].t === 't3', 'القذيفة أُطلقت من جوال اللاعب على قلعة الإخاء: ' + JSON.stringify(shot.log[0]));
  await disp.screenshot({ path: D + '06-bomb-hit.png' });
  // الاتهام: أدوار مشفّرة
  await host.evaluate(() => { Host.e.goSegment(Host.e.s.plan.findIndex(p => p.g === 'traitor')); Host.e.nextItem(); }); await sleep(2500);
  const sabs = await host.evaluate(() => Host.e.s.seg.sab);
  const sids = await Promise.all(S.map(p => p.evaluate(() => Student.cfg.sid)));
  const roles = await Promise.all(S.map(p => p.evaluate(() => document.querySelector('.pl-body').textContent)));
  const sabIdx = sids.map((s, i) => Object.values(sabs).includes(s) ? i : -1).filter(i => i >= 0);
  check(sabIdx.length === 4 && sabIdx.every(i => roles[i].includes('أنت المخرّب')), 'كل مخرّب رأى دوره في جواله (4)');
  check(roles.filter(r => r.includes('من الأوفياء')).length === 8, 'الثمانية الآخرون رأوا «من الأوفياء»');
  await S[sabIdx[0]].screenshot({ path: D + '07-phone-saboteur.png' });
  const cap = await spy.evaluate(() => window.cap.join('\n'));
  check(cap.length > 0 && !cap.includes('"r":"s"') && !cap.includes('"r":"i"') && cap.includes('"e:'), 'الأدوار تمر على القناة مشفّرة (لا نص مقروء)');
  // متنصّت يحاول فك رسالة غيره بمفتاحه
  const steal = await S[0].evaluate(async (other) => { const last = Student._lastCt; try { const ct = window.__x; return 'n/a'; } catch (e) { return 'err'; } }, sids[1]);
  await host.evaluate(() => Host.e.nextItem()); await host.evaluate(() => Host.e.openItem()); await sleep(800);
  const ans = await host.evaluate(() => Host.e.item().a);
  for (let i = 0; i < 12; i++) { const b2 = await S[i].$(`[data-ans="${sabIdx.includes(i) ? (ans + 1) % 4 : ans}"]`); if (b2) await b2.click(); }
  await sleep(1000); await host.click('[data-act="lock"]'); await sleep(500);
  const tr = await host.evaluate(() => Host.e.item().result);
  check(Object.values(tr).every(r => r.ok === true), 'الأغلبية غلبت المخرّب في كل الفرق');
  // الاتهام
  await host.evaluate(() => { const seg = Host.e.s.seg; while (Host.e.item() && Host.e.item().kind !== 'accuse') { Host.e.nextItem(); if (Host.e.item() && Host.e.item().kind === 'mcq') { Host.e.openItem(); Host.e.lockAll(); } } Host.e.openItem(); }); await sleep(900);
  for (let i = 0; i < 12; i++) { const myT = teamOf[i]; const sabSid = sabs[await S[i].evaluate(() => Student.me().team)]; const target = sids[i] === sabSid ? null : sabSid; let btn = target ? await S[i].$(`[data-acc="${target}"]`) : await S[i].$('[data-acc]'); if (btn) await btn.click(); }
  await sleep(1000); await host.click('[data-act="lock"]'); await sleep(800);
  const acc = await host.evaluate(() => Host.e.item().result);
  check(Object.values(acc).every(r => r.caught), 'كُشف المخرّبون بأصوات الجوالات (+25 لكل فريق)');
  await disp.screenshot({ path: D + '08-accuse.png' });
  // الخزنة
  await host.evaluate(() => { Host.e.goSegment(Host.e.s.plan.findIndex(p => p.g === 'vault')); Host.e.nextItem(); Host.e.openItem(); }); await sleep(2500);
  const clues = await Promise.all(S.map(p => p.evaluate(() => (Student.priv.k || []).length)));
  const byTeam = {}; teamOf.forEach((t, i) => { byTeam[t] = (byTeam[t] || 0) + clues[i]; });
  check(Object.values(byTeam).every(n => n === 4), 'كل فريق استلم تلميحاته الأربعة موزعة على جوالات أعضائه: ' + JSON.stringify(byTeam));
  await S[0].screenshot({ path: D + '09-phone-vault.png' });
  const vcode = await host.evaluate(() => Host.e.item().a);
  const w = teamOf.indexOf('t4'); await S[w].fill('#vcode', '1234'); await S[w].click('[data-vsend]'); await sleep(900);
  const lk = await host.evaluate(() => Object.keys(Host.e.item().lock));
  check(lk.includes('t4'), 'رمز خاطئ يقفل الفريق مؤقتًا');
  const w2 = teamOf.indexOf('t1'); await S[w2].fill('#vcode', vcode); await S[w2].click('[data-vsend]'); await sleep(1000);
  check(await host.evaluate(() => !!Host.e.item().cracked.t1), 'الرمز الصحيح من الجوال اخترق الخزنة');
  await disp.screenshot({ path: D + '10-vault.png' });
  // المعركة
  await host.evaluate(() => { Host.e.goSegment(Host.e.s.plan.findIndex(p => p.g === 'battle')); Host.e.nextItem(); }); await sleep(700);
  await disp.screenshot({ path: D + '11-armies.png' });
  await host.evaluate(() => Host.e.nextItem()); await sleep(2200); await disp.screenshot({ path: D + '12-battle.png' });
  for (let i = 0; i < 4; i++) await host.evaluate(() => Host.e.nextItem());
  check(await host.evaluate(() => Host.e.s.seg.phase) === 'done', 'انتهت المعركة الكبرى');
  await host.screenshot({ path: D + '13-host.png', fullPage: true });
  console.log('أخطاء:', errs.length ? errs.slice(0, 6) : 'لا يوجد'); check(!errs.length, 'لا أخطاء JavaScript');
  console.log(`\n${ok} ناجح، ${bad} فاشل`); await b.close(); srv.close(); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
