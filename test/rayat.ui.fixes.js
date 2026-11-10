// اختبار واجهات فعلي في المتصفح لإصلاحات 10 نوفمبر: نموذج الانضمام، رسالة الإجابة، الإيقاف المؤقت، تنبيه الكلفة، إعادة التحميل
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), PORT = 8700 + Math.floor(Math.random() * 50);
http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0].split('#')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(d); }); }).listen(PORT);
const URL = `http://localhost:${PORT}/dist/rayat.html`; let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('✗', m); } };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext(); const errs = [];
  const page = async (hash, w, h, tag) => { const p = await ctx.newPage(); await p.setViewportSize({ width: w, height: h }); p.on('pageerror', e => errs.push(tag + ': ' + e.message)); await p.goto(URL + '#' + hash, { timeout: 120000 }); return p; };
  const host = await page('host', 1280, 800, 'host'); await host.waitForSelector('#start', { timeout: 60000 }); const code = await host.evaluate(() => Host.g.s.code);
  const A = await page('join-' + code, 390, 844, 'A'), B = await page('join-' + code, 390, 844, 'B'); await A.waitForSelector('#nm', { timeout: 30000 }); await B.waitForSelector('#nm', { timeout: 30000 });
  const stage = () => host.evaluate(() => Host.g.s.stage);
  const until = async (st, max = 600) => { for (let i = 0; i < max; i++) { const s = await stage(); if (s === st) return true; if (s === 'judge') await host.evaluate(() => Host.g.judge(false)); await host.evaluate(() => { const g = Host.g; if (g.s.deadline) g.s.deadline = Math.min(g.s.deadline, g.t() + 150); g.tick(); }); await host.waitForTimeout(120); } return false; };

  // ---- ٤) نموذج الانضمام يحتفظ بالاسم والفريق والتركيز أثناء تحديث القائمة
  await A.click('#nm'); await A.keyboard.type('عبدالله'); await A.click('[data-tw="0"]');
  await B.fill('#nm', 'خالد'); await B.click('[data-tw="1"]'); await B.click('#go'); await host.evaluate(() => document.getElementById('bots').click()); await A.waitForTimeout(1200);
  ok(await A.inputValue('#nm') === 'عبدالله', 'الانضمام: الاسم باقٍ بعد انضمام غيره (' + await A.inputValue('#nm') + ')');
  ok(await A.evaluate(() => document.querySelector('[data-tw="0"]').classList.contains('sel')), 'الانضمام: الفريق المختار باقٍ');
  ok((await A.textContent('[data-cnt="1"]')).includes('4'), 'الانضمام: عدد المتسابقين تحدّث في مكانه (' + await A.textContent('[data-cnt="1"]') + ')');
  await A.click('#nm'); await A.keyboard.press('End'); await A.keyboard.type(' بن'); await host.evaluate(() => { Host.g.join('late-1', 'متأخر', 2); }); await A.waitForTimeout(700); await A.keyboard.type(' محمد');
  ok(await A.inputValue('#nm') === 'عبدالله بن محمد', 'الانضمام: الكتابة مستمرة أثناء انضمام مشارك جديد (' + await A.inputValue('#nm') + ')');
  ok(await A.evaluate(() => document.activeElement && document.activeElement.id === 'nm' && document.activeElement.selectionStart === document.activeElement.value.length), 'الانضمام: التركيز وموضع الكتابة محفوظان');
  await A.click('#go'); await A.waitForTimeout(600); ok(await host.evaluate(() => Object.values(Host.g.s.players).some(p => p.name === 'عبدالله بن محمد' && p.team === 0)), 'الانضمام: دخل بالاسم والفريق الصحيحين');
  const pidA = await A.evaluate(() => Phone.pid);
  await host.evaluate(pid => { Host.bots = false; Host.g.setCaptain(0, pid); }, pidA); await host.evaluate(() => document.getElementById('start').click()); ok(await until('question'), 'بدأ السؤال');

  // ---- ٣) الإيقاف المؤقت في الواجهة
  await host.evaluate(() => Host.g.pause(true)); await A.waitForTimeout(500);
  ok(await A.evaluate(() => !!document.querySelector('.pausebar')), 'الإيقاف: شريط التوقف ظاهر عند المتسابق');
  await A.evaluate(() => { const b = document.querySelector('[data-ans]'); if (b) b.click(); }); await A.waitForTimeout(400);
  ok(await host.evaluate(() => Object.keys(Host.g.s.answers).length) === 0, 'الإيقاف: ضغط الإجابة لا يُحتسب');
  const t1 = await A.textContent('#ptm'); await A.waitForTimeout(1600); const t2 = await A.textContent('#ptm'); ok(t1 === t2 && /⏸/.test(t1), `الإيقاف: المؤقت المعروض ثابت (${t1} / ${t2})`);
  await host.evaluate(() => Host.g.pause(false)); await A.waitForTimeout(500); ok(await A.evaluate(() => !document.querySelector('.pausebar')), 'الاستئناف: اختفى شريط التوقف');

  // ---- ٢) رسالة الإجابة
  const qa = await host.evaluate(() => Host.g.s.q.a); await A.click(`[data-ans="${(qa + 1) % 4}"]`); await A.waitForTimeout(700);
  ok((await A.textContent('.ph')).includes('وصلت إجابتك'), 'الإجابة: «وصلت إجابتك» بعد تأكيد المشرف');
  await A.reload(); await A.waitForTimeout(1500); ok((await A.textContent('.ph')).includes('وصلت إجابتك') && await A.evaluate(() => [...document.querySelectorAll('[data-ans]')].every(x => x.disabled)), 'الإجابة: بعد إعادة التحميل تبقى مؤكدة ولا يمكن الإجابة مرتين');
  await B.click(`[data-ans="${qa}"]`); await until('reveal'); await A.waitForTimeout(600);
  const ta = await A.textContent('.ph'), tb = await B.textContent('.ph'); ok(ta.includes('لم تُصب') && !ta.includes('لم تجب'), 'الكشف: من أخطأ يرى «لم تُصب» لا «لم تجب»'); ok(tb.includes('أصبت'), 'الكشف: من أصاب يرى «أصبت»');
  ok(/فريقك: \d+٪/.test(ta), 'الكشف: نسبة الفريق وعدد أوامره معروضان');

  // ---- ٦) تنبيه الكلفة قبل التأكيد
  await host.evaluate(() => { const g = Host.g; g.S.turn.left[0] = 2; g.S.teams[0].res.food = 5; }); await until('orders'); await host.evaluate(() => { Host.g.S.turn.left[0] = 2; Host.g.S.teams[0].res.food = 5; Host.g.changed(); }); await A.waitForTimeout(700);
  const opts = await A.$$('[data-opt]'); if (opts.length >= 2) { await opts[0].click(); await A.waitForTimeout(250); (await A.$$('[data-opt]'))[1].click(); await A.waitForTimeout(400); }
  ok(await A.evaluate(() => !!document.querySelector('.plan.bad .w')), 'الكلفة: تنبيه ظاهر لخطة تتجاوز الرصيد'); ok((await A.textContent('.plan')).includes('الكلفة'), 'الكلفة: الإجمالي والرصيد المتوقع معروضان');
  await A.click('[data-ready]'); await A.waitForTimeout(400); ok(await host.evaluate(() => !Host.g.s.ready[0]), 'الكلفة: الضغطة الأولى على «جاهز» لا ترسل خطة ناقصة'); ok(await A.evaluate(() => !!document.querySelector('[data-fix]')), 'الكلفة: خيارا «أعدّل» و«أرسلها كما هي» ظاهران');
  await A.screenshot({ path: path.join(__dirname, 'uiaudit', 'phone-plan-warning.png') });
  await A.click('.plan [data-ready]'); await A.waitForTimeout(500); ok(await host.evaluate(() => Host.g.s.ready[0] === true || Host.g.s.stage !== 'orders'), 'الكلفة: التأكيد الثاني يرسل');

  console.log(`واجهات الإصلاحات: ${pass} نجح، ${fail} فشل`, 'أخطاء الصفحات', errs.length, errs.slice(0, 4)); await b.close(); process.exit(fail || errs.length ? 1 : 0);
})();
