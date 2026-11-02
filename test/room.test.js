// مسار غرفة Claude (محاكاة لواجهة room — لاختبار منطق التطبيق فقط)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs');
const html = fs.readFileSync(__dirname + '/../dist/index.html');
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); }).listen(8126);
const N = +process.argv[2] || 16;
let ok = 0, bad = 0; const check = (c, m) => { c ? ok++ : bad++; console.log(c ? '✓' : '✗', m); };
const sleep = ms => new Promise(r => setTimeout(r, ms)); const errs = [];
(async () => {
  const b = await chromium.launch({ args: ['--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
  const ctx = await b.newContext({ viewport: { width: 400, height: 700 } });
  await ctx.addInitScript({ path: __dirname + '/mockroom.js' });
  await ctx.route(/fonts\./, r => r.fulfill({ status: 200, body: '' }));
  ctx.on('page', p => { p.on('pageerror', e => errs.push(e.message)); });
  const host = await ctx.newPage(); await host.setViewportSize({ width: 1400, height: 900 }); await host.goto('http://localhost:8126/#host'); await sleep(1000);
  const code = await host.evaluate(() => Host.e.s.code);
  const lbl = await host.evaluate(() => Host.net.label().t); check(/غرفة Claude/.test(lbl), 'المشرف متصل عبر مسار الغرفة (المحاكاة): ' + lbl);
  const S = [];
  for (let i = 0; i < N; i++) { const p = await ctx.newPage(); await p.goto('http://localhost:8126/#join-' + code); S.push(p); }
  await Promise.all(S.map(async (p, i) => { await p.waitForSelector('#jn'); await p.fill('#jn', 'طالب' + (i + 1)); await p.click('[data-tw=""]'); await p.click('#jgo'); }));
  await sleep(3000);
  const st = await host.evaluate(() => { const L = Object.values(Host.e.s.students); const by = {}; L.forEach(s => by[s.team] = (by[s.team] || 0) + 1); return { n: L.length, on: L.filter(s => s.online).length, by }; });
  check(st.n === N && st.on === N, `انضم ${st.n} طالبًا ومتصلون ${st.on}، التوزيع: ${JSON.stringify(st.by)}`);
  const seen = await Promise.all(S.map(p => p.evaluate(() => !!Student.me())));
  check(seen.every(Boolean), 'كل جوال استلم قائمة الحضور ويعرف فريقه');
  // سؤال للجميع
  await host.evaluate(() => { Host.e.s.plan = [{ g: 'kickoff', min: 5 }, { g: 'final', min: 5 }, { g: 'crown', min: 2 }]; Host.e.goSegment(0); Host.e.nextItem(); Host.e.openItem(); });
  await sleep(1200);
  await sleep(800); const t0 = Date.now();
  await Promise.all(S.map((p, i) => p.click(`[data-ans="${i % 4}"]`).catch(() => null)));
  let got = 0; for (let k = 0; k < 40; k++) { got = await host.evaluate(() => Object.keys(Host.e.item().answers).length); if (got === N) break; await sleep(100); }
  check(got === N, `وصلت ${got}/${N} إجابة خلال ${Date.now() - t0} مللي ثانية (تشمل زمن النقر الآلي)`);
  await sleep(800);
  const conf = await Promise.all(S.map(p => p.evaluate(() => document.querySelector('.pl-body').textContent.includes('وصلت إجابتك'))));
  check(conf.filter(Boolean).length === N, `ظهر تأكيد الوصول على ${conf.filter(Boolean).length}/${N} جوال`);
  await host.evaluate(() => Host.e.lockAll()); await sleep(1500);
  const fb = await Promise.all(S.map(p => p.evaluate(() => /صحيحة|خاطئة/.test(document.querySelector('.pl-body').textContent))));
  check(fb.every(Boolean), 'كل جوال أظهر نتيجة إجابته بعد الكشف');
  // ضغط الاستباق المتزامن من الجميع
  await host.evaluate(() => { Host.e.goSegment(1); Host.e.nextItem(); Host.e.openItem(); });
  await sleep(1200);
  const hasBtn = await Promise.all(S.map(p => p.$('[data-buzz]').then(x => !!x)));
  check(hasBtn.every(Boolean), 'زر الاستباق ظاهر في ' + hasBtn.filter(Boolean).length + ' جوال');
  await Promise.all(S.map(p => p.dispatchEvent('[data-buzz]', 'pointerdown')));
  await sleep(1500);
  const r = await host.evaluate(() => { const it = Host.e.item(); return { ph: Host.e.s.seg.phase, w: it.buzz && it.buzz.name, late: it.late.length, bz: Object.values(Host.e.s.students).reduce((a, s) => a + s.st.bz, 0) }; });
  check(r.ph === 'answering' && r.w && r.bz === 1, `${N} ضغطة متزامنة ← اعتُمد فائز واحد فقط (${r.w})، وعدد الضغطات المعتمدة ${r.bz}`);
  const win = await Promise.all(S.map(p => p.evaluate(() => document.querySelector('.pl-body').textContent.includes('أنت أولًا'))));
  check(win.filter(Boolean).length === 1, 'جوال واحد فقط يعرض «أنت أولًا»');
  // التلاعب: طالب يحاول إرسال حالة المشرف
  const forged = await S[0].evaluate(async () => { try { await Student.net.named.emit('state', { code: Student.cfg.code, v: 99999, hs: 'x', T: [] }); return 'sent'; } catch (e) { return e.code; } });
  check(forged === 'not_permitted', 'رسالة تحكم مزيفة من جوال طالب رُفضت: ' + forged);
  // انتحال: طالب يضع sid طالب آخر
  const victim = await S[1].evaluate(() => Student.cfg.sid);
  await S[2].evaluate(v => Student.net.presence({ sid: v, nm: 'منتحل' }), victim); await sleep(800);
  const vName = await host.evaluate(v => Host.e.s.students[v].name, victim);
  check(vName === 'طالب2' || !vName.includes('منتحل'), 'انتحال هوية طالب آخر لم يغيّر بياناته (by مختلف)');
  // انقطاع وعودة
  await S[3].close(); await sleep(1200);
  const off = await host.evaluate(() => Object.values(Host.e.s.students).filter(s => !s.online).length);
  check(off === 1, 'إغلاق جوال يظهر غير متصل لدى المشرف');
  console.log('أخطاء:', errs.length ? errs.slice(0, 5) : 'لا يوجد'); check(!errs.length, 'لا أخطاء JavaScript');
  console.log(`\n${ok} ناجح، ${bad} فاشل`); await b.close(); srv.close(); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
