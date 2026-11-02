const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '../dist/index.html'));
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); }).listen(8123);
const errs = []; let ok = 0, bad = 0;
const check = (c, m) => { if (c) { ok++; console.log('✓', m); } else { bad++; console.log('✗', m); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  ctx.on('page', p => { p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errs.push(m.text()); }); });
  // اعتراض الخطوط الخارجية لأن البيئة بلا إنترنت
  await ctx.route(/fonts\.(googleapis|gstatic)/, r => r.fulfill({ status: 200, body: '' }));
  const host = await ctx.newPage(); await host.goto('http://localhost:8123/#host'); await sleep(800);
  const code = (await host.textContent('.code-badge')).trim();
  check(/^\d{4}$/.test(code), 'لوحة المشرف تنشئ رمز غرفة: ' + code);
  await host.screenshot({ path: 'test/shots/01-host.png' });
  const disp = await ctx.newPage(); await disp.setViewportSize({ width: 1280, height: 720 }); await disp.goto('http://localhost:8123/#display'); await sleep(1200);
  await disp.mouse.click(600, 300); await sleep(400);
  const lobby = await disp.textContent('.st-main');
  check(lobby.includes(code), 'شاشة العرض تستقبل الحالة وتعرض الرمز');
  await disp.screenshot({ path: 'test/shots/02-display-lobby.png' });
  // طلاب
  const studs = [];
  const names = ['أحمد', 'خالد', 'سعد', 'فهد', 'عمر', 'يوسف', 'ماجد', 'نايف'];
  for (let i = 0; i < 8; i++) {
    const p = await ctx.newPage(); await p.setViewportSize({ width: 390, height: 800 });
    await p.goto('http://localhost:8123/#join-' + code); await sleep(300);
    await p.fill('#jn', names[i]); await p.click(`[data-tw="t${(i % 4) + 1}"]`); await p.click('#jgo');
    studs.push(p);
  }
  await sleep(3000);
  const roster = await host.evaluate(() => Object.values(Host.e.s.students).map(s => [s.name, s.team, s.online]));
  check(roster.length === 8, 'المشرف يرى 8 طلاب: ' + roster.map(r => r[0]).join('، '));
  check(roster.every(r => r[2]), 'كل الطلاب متصلون');
  await studs[0].screenshot({ path: 'test/shots/03-student-lobby.png' });
  check((await studs[0].textContent('.pl-body')).includes('أنت في فريق'), 'الطالب يرى فريقه');
  await disp.screenshot({ path: 'test/shots/04-display-joined.png' });
  // الافتتاح
  await host.click('[data-act="start"]'); await sleep(300);
  for (let i = 0; i < 14; i++) { const b = await host.$('#deck .btn.pri.big'); const t = await b.textContent(); if (t.includes('الجولة التالية')) break; await b.click(); await sleep(250); if (i === 2) await disp.screenshot({ path: 'test/shots/05-display-teams.png' }); }
  await host.click('[data-act="nextseg"]'); await sleep(300);
  check(await host.evaluate(() => Host.e.s.seg.g) === 'kickoff', 'الانتقال إلى الانطلاقة');
  await disp.screenshot({ path: 'test/shots/06-display-intro.png' });
  await host.click('[data-act="next"]'); await sleep(200); await host.click('[data-act="open"]'); await sleep(600);
  // الإجابة من الجوالات
  const ans = await host.evaluate(() => Host.e.item().a);
  for (let i = 0; i < 8; i++) { const btn = await studs[i].$(`[data-ans="${i < 5 ? ans : (ans + 1) % 4}"]`); if (btn) await btn.click(); }
  await sleep(1200);
  const n = await host.evaluate(() => Object.keys(Host.e.item().answers).length);
  check(n === 8, 'وصلت إجابات الطلاب الثمانية إلى المشرف: ' + n);
  check((await studs[0].textContent('.pl-body')).includes('وصلت إجابتك'), 'الطالب يرى تأكيد وصول إجابته');
  await studs[0].screenshot({ path: 'test/shots/07-student-answered.png' });
  await disp.screenshot({ path: 'test/shots/08-display-question.png' });
  await host.click('[data-act="lock"]'); await sleep(600);
  const sc = await host.evaluate(() => Host.e.scores());
  check(sc.t1 > 0 && sc.t1 === sc.t2 * 1 || sc.t1 > 0, 'احتُسبت النقاط: ' + JSON.stringify(sc));
  await disp.screenshot({ path: 'test/shots/09-display-reveal.png' });
  check((await studs[0].textContent('.pl-body')).includes('صحيحة'), 'الطالب يرى أن إجابته صحيحة');
  check((await studs[6].textContent('.pl-body')).includes('خاطئة'), 'الطالب الآخر يرى أن إجابته خاطئة');
  // الاستباق في ساحة المواجهة
  await host.evaluate(() => { Host.e.s.planIdx = Host.e.s.plan.findIndex(p => p.g === 'arena') - 1; Host.e.nextSegment(); Host.e.nextItem(); });
  await sleep(300);
  const elig = await host.evaluate(() => Host.e.item().eligible);
  await host.click('[data-act="open"]'); await sleep(700);
  const canPress = [];
  for (let i = 0; i < 8; i++) if (await studs[i].$('[data-buzz]')) canPress.push(i);
  check(canPress.length === 4, 'زر الاستباق يظهر لأعضاء الفريقين المتواجهين فقط (' + canPress.length + ')');
  await studs[canPress[0]].screenshot({ path: 'test/shots/10-student-buzzer.png' });
  // ضغطات متزامنة
  await Promise.all(canPress.map(i => studs[i].dispatchEvent('[data-buzz]', 'pointerdown')));
  await sleep(1200);
  const bz = await host.evaluate(() => ({ buzz: Host.e.item().buzz, late: Host.e.item().late, ph: Host.e.s.seg.phase }));
  check(bz.ph === 'answering' && bz.buzz && bz.buzz.sid, 'اعتُمدت ضغطة واحدة فقط: ' + bz.buzz.name);
  check(bz.late.length === 3, 'سُجّلت 3 ضغطات متأخرة ولم تُعتمد');
  await disp.screenshot({ path: 'test/shots/11-display-buzz.png' });
  await sleep(300);
  const sTexts = await Promise.all(canPress.map(i => studs[i].textContent('.pl-body')));
  check(sTexts.filter(t => t.includes('أنت صاحب الأسبقية')).length === 1, 'طالب واحد فقط يرى «أنت صاحب الأسبقية»');
  await studs[canPress[0]].screenshot({ path: 'test/shots/12-student-after-buzz.png' });
  await host.click('[data-act="judge"][data-arg="0"]'); await sleep(300);
  await host.click('[data-act="reopen"]'); await sleep(700);
  const left = []; for (const i of canPress) if (await studs[i].$('[data-buzz]')) left.push(i);
  check(left.length === 2, 'بعد الخطأ أُعيد فتح الاستباق للفريق الآخر فقط (' + left.length + ')');
  await studs[left[0]].dispatchEvent('[data-buzz]', 'pointerdown'); await sleep(800);
  await host.click('[data-act="judge"][data-arg="1"]'); await sleep(500);
  await host.screenshot({ path: 'test/shots/13-host-after.png' });
  // تحديث صفحة الطالب (إعادة الاتصال)
  await studs[1].reload(); await sleep(1500);
  const rel = await host.evaluate(() => Object.values(Host.e.s.students).length);
  check(rel === 8, 'تحديث صفحة الطالب لا ينشئ مشاركًا مكررًا');
  check((await studs[1].textContent('.pl-head')).includes('خالد'), 'الطالب يعود تلقائيًا باسمه بعد التحديث');
  // تحديث صفحة المشرف: الحالة محفوظة
  const before = await host.evaluate(() => JSON.stringify(Host.e.scores()));
  await host.reload(); await sleep(800);
  const hasResume = await host.$('[data-r]'); if (hasResume) await hasResume.click(); await sleep(800);
  const after = await host.evaluate(() => JSON.stringify(Host.e.scores()));
  check(before === after, 'تحديث صفحة المشرف لا يضيّع النقاط: ' + after);
  await sleep(4000);
  const on = await host.evaluate(() => Object.values(Host.e.s.students).filter(s => s.online).length);
  check(on === 8, 'الطلاب يعودون متصلين بعد تحديث المشرف: ' + on);
  // العرض داخل النافذة + التتويج
  await host.evaluate(() => { Host.e.goSegment(Host.e.s.plan.length - 1); for (let i = 0; i < 6; i++) Host.e.nextItem(); });
  await sleep(800); await disp.screenshot({ path: 'test/shots/14-display-crown.png' });
  await host.evaluate(() => Host.e.nextItem()); await sleep(600); await disp.screenshot({ path: 'test/shots/15-display-awards.png' });
  // جولات أخرى على الشاشة
  for (const g of ['wheel', 'whoami', 'memory', 'boxes', 'duel']) {
    await host.evaluate(g => { const i = Host.e.s.plan.findIndex(p => p.g === g); if (i < 0) Host.e.s.plan.splice(1, 0, { g, min: 5 }); Host.e.goSegment(Host.e.s.plan.findIndex(p => p.g === g)); Host.e.nextItem(); if (g === 'wheel') Host.e.spin(); else if (g === 'boxes') { Host.e.openBox(2); } else Host.e.openItem(); if (g === 'whoami') { Host.e.revealClue(); Host.e.revealClue(); } }, g);
    await sleep(g === 'wheel' ? 5800 : 900); await disp.screenshot({ path: `test/shots/16-${g}.png` });
  }
  await host.screenshot({ path: 'test/shots/17-host-final.png', fullPage: true });
  const pubJSON = await host.evaluate(() => { Host.e.goSegment(Host.e.s.plan.findIndex(p => p.g === 'arena')); Host.e.nextItem(); return JSON.stringify(Host.pubState()); });
  check(!/"a":/.test(pubJSON), 'البث العام لا يحتوي الإجابة قبل الكشف');
  console.log('أخطاء الصفحات:', errs.length ? errs.slice(0, 10) : 'لا يوجد');
  check(errs.length === 0, 'لا أخطاء JavaScript');
  console.log(`\n${ok} ناجح، ${bad} فاشل`);
  await b.close(); srv.close();
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
