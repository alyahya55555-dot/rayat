// اختبار واجهات «جزيرة القرى»: مشرف + شاشة عرض + 8 جوالات في المتصفح نفسه
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs');
const html = fs.readFileSync(__dirname + '/../dist/index.html');
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); }).listen(8131);
let ok = 0, bad = 0; const check = (c, m) => { c ? ok++ : bad++; console.log(c ? '✓' : '✗', m); };
const sleep = ms => new Promise(r => setTimeout(r, ms)); const errs = [];
const D = __dirname + '/shots-island/'; fs.mkdirSync(D, { recursive: true });
let shotN = 0; const shot = (p, n) => p.screenshot({ path: D + String(++shotN).padStart(2, '0') + '-' + n + '.png' });
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.route(/fonts\./, r => r.fulfill({ status: 200, body: '' }));
  ctx.on('page', p => { p.on('pageerror', e => errs.push(p.url().split('#')[1] + ': ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_|Failed to load/.test(m.text())) errs.push(m.text()); }); });
  const host = await ctx.newPage(); await host.goto('http://localhost:8131/#host'); await sleep(900);
  const code = await host.evaluate(() => Host.e.s.code);
  const disp = await ctx.newPage(); await disp.setViewportSize({ width: 1280, height: 720 }); await disp.goto('http://localhost:8131/#display'); await sleep(900); await disp.mouse.click(400, 300);
  const S = [];
  for (let i = 0; i < 8; i++) { const p = await ctx.newPage(); await p.setViewportSize({ width: 390, height: 844 }); await p.goto('http://localhost:8131/#join-' + code); await p.fill('#jn', 'لاعب' + (i + 1)); await p.click(`[data-tw="t${(i % 4) + 1}"]`); await p.click('#jgo'); S.push(p); }
  await sleep(2500);
  const st = await host.evaluate(() => ({ n: Object.keys(Host.e.s.students).length, cap: Host.e.s.captain }));
  check(st.n === 8, 'انضم 8 لاعبين'); check(Object.keys(st.cap).length === 4, 'لكل فريق قائد: ' + JSON.stringify(st.cap));
  await shot(disp, 'display-join'); await shot(S[0], 'phone-lobby'); await shot(host, 'host-lobby');
  // الافتتاح
  await host.click('[data-act="start"]'); await sleep(500); await host.click('#deck .btn.pri.big'); await sleep(600); await shot(disp, 'display-explain');
  await host.click('#deck .btn.pri.big'); await sleep(900);
  check(await S[0].$('[data-theme]') !== null, 'القائد يرى اختيار الطابع'); check(await S[4].$('[data-theme]') === null, 'غير القائد لا يرى اختيار الطابع');
  await shot(S[0], 'phone-themes');
  await S[0].click('[data-theme="agri"]'); await S[1].click('[data-theme="trade"]'); await S[2].click('[data-theme="science"]'); await S[3].click('[data-theme="fort"]'); await sleep(1200);
  const th = await host.evaluate(() => Host.e.s.teams.map(t => Host.e.vil(t.id).theme));
  check(JSON.stringify(th) === '["agri","trade","science","fort"]', 'الطوابع اختيرت من الجوالات: ' + th);
  await shot(disp, 'display-themes');
  await host.click('#deck .btn.pri.big'); await sleep(400); await host.click('#deck .btn.pri.big'); await sleep(700);
  check(await host.evaluate(() => Host.e.s.seg.g) === 'kickoff', 'بدأت الانطلاقة'); await shot(disp, 'display-intro');
  // سؤال للجميع
  await host.click('#deck .btn.pri.big'); await sleep(300); await host.click('#deck .btn.pri.big'); await sleep(900);
  const a = await host.evaluate(() => Host.e.item().a);
  for (let i = 0; i < 8; i++) { const x = await S[i].$(`[data-ans="${i < 6 ? a : (a + 1) % 4}"]`); if (x) await x.click(); }
  await sleep(1000); await shot(disp, 'display-question'); await shot(S[0], 'phone-answered');
  check(await host.evaluate(() => Object.keys(Host.e.item().answers).length) === 8, 'وصلت 8 إجابات');
  await host.click('[data-act="lock"]'); await sleep(900); await shot(disp, 'display-reveal');
  const g = await host.evaluate(() => Host.e.s.teams.map(t => [Host.e.scores()[t.id], Host.e.vil(t.id).gold]));
  check(g.every(([p, gd]) => p === gd && p > 0), 'النقاط = الذهب بعد الإجابة: ' + JSON.stringify(g));
  // الشراء من جوال القائد
  await host.evaluate(() => Host.e.manualGold('t1', 60));
  await sleep(600); await S[0].click('[data-act="shop"]'); await sleep(400); await shot(S[0], 'phone-shop');
  await S[0].click('[data-buy="house"]'); await sleep(1200);
  check(await host.evaluate(() => Host.e.vil('t1').b.house) === 1, 'القائد اشترى منزلًا من جواله');
  const scoreAfter = await host.evaluate(() => Host.e.scores().t1); check(scoreAfter === g[0][0], 'الشراء لم ينقص النقاط');
  await sleep(900); await shot(disp, 'display-building');
  check(await disp.evaluate(() => !!document.querySelector('.plot[data-t="t1"] .bld[data-k="house"]')), 'المنزل ظهر في قرية الوفاء على الشاشة');
  // غير القائد لا يرى السوق
  check(await S[4].$('[data-act="shop"]') === null, 'غير القائد لا يرى سوق البناء');
  // شراء أثناء سؤال مفتوح: إشعار فقط ثم حركة بعد الكشف
  await host.click('#deck .btn.pri.big'); await sleep(300); await host.click('#deck .btn.pri.big'); await sleep(600);
  await host.evaluate(() => Host.e.buy('t1', 'farm', null)); await sleep(700);
  const during = await disp.evaluate(() => ({ note: !!document.querySelector('.note-b'), farm: !!document.querySelector('.plot[data-t="t1"] .bld[data-k="farm"]') }));
  check(during.note && !during.farm, 'أثناء السؤال: إشعار صغير فقط، والمبنى ينتظر');
  await shot(disp, 'display-note-during-question');
  await host.click('[data-act="lock"]'); await sleep(1600);
  check(await disp.evaluate(() => !!document.querySelector('.plot[data-t="t1"] .bld[data-k="farm"]')), 'بعد الكشف: ظهرت المزرعة بحركة بناء');
  // قوة الملاحظة
  await host.evaluate(() => { const E = Host.e; E.goSegment(E.s.plan.findIndex(p => p.g === 'observe')); E.nextItem(); E.openItem(); }); await sleep(800);
  await shot(disp, 'display-observe-show'); check(await disp.evaluate(() => !!document.querySelector('.scene')), 'المشهد معروض');
  await host.evaluate(() => Host.e.afterShow()); await sleep(800); await shot(disp, 'display-observe-question'); await shot(S[1], 'phone-observe');
  // ساحة المواجهة
  await host.evaluate(() => { const E = Host.e; E.goSegment(E.s.plan.findIndex(p => p.g === 'arena')); E.nextItem(); E.openItem(); }); await sleep(900);
  const pair = await host.evaluate(() => Host.e.item().eligible);
  const btns = []; for (let i = 0; i < 8; i++) if (await S[i].$('[data-buzz]')) btns.push(i);
  check(btns.length === 4, 'زر الاستباق للفريقين المتواجهين فقط (' + btns.length + ')');
  await shot(disp, 'display-arena'); await shot(S[btns[0]], 'phone-buzzer');
  await Promise.all(btns.map(i => S[i].dispatchEvent('[data-buzz]', 'pointerdown'))); await sleep(1000);
  const bz = await host.evaluate(() => ({ ph: Host.e.s.seg.phase, late: Host.e.item().late.length }));
  check(bz.ph === 'answering' && bz.late === 3, 'ضغطة واحدة معتمدة وثلاث متأخرة');
  await shot(disp, 'display-buzz'); await host.click('[data-act="judge"][data-arg="1"]'); await sleep(900); await shot(disp, 'display-arena-win');
  // سفينة الكنز
  await host.evaluate(() => { const E = Host.e; while (E.item() && !E.item().treasure) E.nextItem(); E.openItem(); }); await sleep(700); await shot(disp, 'display-treasure');
  // فك الشفرة
  await host.evaluate(() => { const E = Host.e; E.goSegment(E.s.plan.findIndex(p => p.g === 'cipher')); E.nextItem(); E.openItem(); }); await sleep(2200);
  const cl = await Promise.all(S.map(p => p.evaluate(() => (Student.priv.k || []).length)));
  check(cl.reduce((x, y) => x + y, 0) === 16, 'وصلت التلميحات المشفّرة للجوالات (16)'); await shot(S[0], 'phone-vault');
  const vc = await host.evaluate(() => Host.e.item().a); await S[2].fill('#vcode', vc); await S[2].click('[data-vsend]'); await sleep(1000);
  check(await host.evaluate(() => !!Host.e.item().cracked.t3), 'فتح فريق الإخاء الخزنة من الجوال'); await shot(disp, 'display-vault');
  // الحسم: الرهان من جوال القائد
  await host.evaluate(() => { const E = Host.e; E.goSegment(E.s.plan.findIndex(p => p.g === 'final')); E.nextItem(); while (E.item() && !E.item().wagerQ) E.nextItem(); }); await sleep(900);
  await shot(S[0], 'phone-wager'); await shot(disp, 'display-wager');
  const wb = await S[0].$$('[data-wager]'); if (wb.length) await wb[wb.length - 1].click(); await sleep(800);
  check(await host.evaluate(() => Host.e.item().wagers.t1 != null), 'القائد سجّل الرهان من جواله');
  await host.click('[data-act="lockw"]'); await sleep(800); const wa = await host.evaluate(() => Host.e.item().a);
  await S[0].click(`[data-wpick="${wa}"]`); await sleep(800); check(await host.evaluate(() => Host.e.item().picks.t1 === Host.e.item().a), 'القائد أجاب سؤال الرهان من جواله');
  await host.click('[data-act="judgew"]'); await sleep(900); await shot(disp, 'display-wager-result');
  // التتويج
  await host.evaluate(() => { const E = Host.e; ['t2', 't3', 't4'].forEach((t, i) => { E.manualGold(t, 200); E.buy(t, 'castle', null); E.buy(t, 'library', null); E.buy(t, 'market', null); }); E.goSegment(E.s.plan.length - 1); }); await sleep(2500);
  await shot(disp, 'display-crown-island');
  await host.evaluate(() => Host.e.nextItem()); await sleep(1500); await shot(disp, 'display-highlights');
  for (let i = 0; i < 4; i++) { await host.evaluate(() => Host.e.nextItem()); await sleep(700); }
  await sleep(1500); await shot(disp, 'display-winner'); await shot(S[0], 'phone-crown'); await shot(host, 'host-final');
  check(await host.evaluate(() => Host.e.s.ended), 'انتهت المسابقة بالتتويج');
  console.log('أخطاء:', errs.length ? errs.slice(0, 8) : 'لا يوجد'); check(!errs.length, 'لا أخطاء JavaScript');
  console.log(`\n${ok} ناجح، ${bad} فاشل`); await b.close(); srv.close(); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
