// اختبار الاتصال الحقيقي عبر MQTT: خادما بث محليان (aedes) بدل الخوادم العامة،
// القناة المحلية BroadcastChannel معطلة تمامًا، فكل رسالة تمر عبر الخادم كما في الواقع.
// مشرف + شاشة عرض + N جوال (افتراضيًا 30).
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), { spawn } = require('child_process');
const html = fs.readFileSync(__dirname + '/../dist/index.html');
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); }).listen(8141);
const N = +process.argv[2] || 30;
let ok = 0, bad = 0; const check = (c, m) => { c ? ok++ : bad++; console.log(c ? '✓' : '✗', m); };
const sleep = ms => new Promise(r => setTimeout(r, ms)); const errs = [];
const broker = port => { const p = spawn('node', [__dirname + '/../testenv/broker.js', String(port)], { cwd: __dirname + '/../testenv', stdio: 'ignore' }); return p; };
const until = async (fn, ms = 8000, step = 150) => { const t = Date.now(); let v; while (Date.now() - t < ms) { v = await fn(); if (v) return v; await sleep(step); } return v; };
(async () => {
  let A = broker(9011), B = broker(9012); await sleep(1200);
  const init = `window.BENA_BROKERS=[{h:'localhost',p:9011,path:'/',ssl:false,n:'A'},{h:'localhost',p:9012,path:'/',ssl:false,n:'B'}];
    try{Object.defineProperty(window,'BroadcastChannel',{value:undefined,configurable:true});}catch(e){}`;
  const b = await chromium.launch({ args: ['--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
  const mk = async () => { const c = await b.newContext({ viewport: { width: 390, height: 760 } }); await c.addInitScript(init); await c.route(/fonts\./, r => r.fulfill({ status: 200, body: '' })); c.on('page', p => p.on('pageerror', e => errs.push(e.message))); return c; };
  const hc = await mk(), dc = await mk(), sc = await mk();
  const host = await hc.newPage(); await host.setViewportSize({ width: 1440, height: 900 }); await host.goto('http://localhost:8141/#host');
  const hl = await until(() => host.evaluate(() => Host.net.mq && Host.net.mq.upCount() === 2 && Host.fp && Host.net.label().t));
  check(!!hl, 'المشرف متصل بالخادمين معًا: ' + hl);
  check(await host.evaluate(() => !Host.net.bc), 'القناة المحلية معطلة (كل شيء عبر الخادم)');
  const code = await host.evaluate(() => Host.e.s.code), fp = await host.evaluate(() => Host.fp);
  const disp = await dc.newPage(); await disp.setViewportSize({ width: 1280, height: 720 }); await disp.goto(`http://localhost:8141/#display-${code}`);
  check(!!await until(() => host.evaluate(() => Host.e.s.display || (Date.now() - (Host.bcDisplay || 0) < 5000) || document.body.textContent.includes('الشاشة متصلة'))), 'شاشة العرض اتصلت عبر الخادم');
  const S = []; const t0 = Date.now();
  for (let i = 0; i < N; i++) { const p = await sc.newPage(); await p.goto(`http://localhost:8141/#join-${code}-${fp}`); S.push(p); }
  await Promise.all(S.map(async (p, i) => { await p.waitForSelector('#jn'); await p.fill('#jn', 'طالب' + (i + 1)); await p.click('[data-tw=""]'); await p.click('#jgo'); }));
  const st = await until(async () => { const r = await host.evaluate(() => { const L = Object.values(Host.e.s.students); const by = {}; L.forEach(s => by[s.team] = (by[s.team] || 0) + 1); return { n: L.length, on: L.filter(s => s.online).length, by, cap: Object.keys(Host.e.s.captain).length }; }); return r.n === N && r.on === N ? r : null; }, 20000);
  check(!!st, `انضم ${N} طالبًا عبر الخادم خلال ${((Date.now() - t0) / 1000).toFixed(1)} ث، التوزيع ${st && JSON.stringify(st.by)}، قادة ${st && st.cap}`);
  const seen = await until(async () => (await Promise.all(S.map(p => p.evaluate(() => !!(Student.me && Student.me()))))).every(Boolean), 10000);
  check(!!seen, 'كل جوال استلم الحالة الموقعة ويعرف فريقه');
  const onA = async () => (await Promise.all(S.map(p => p.evaluate(() => Student.net.mq.active && Student.net.mq.active.i)))).filter(i => i === 0).length;
  const a0 = await onA(); let a1 = a0;
  if (a0 < N) a1 = await until(async () => { const n = await onA(); return n === N ? n : 0; }, 40000, 1000) || await onA();
  check(a1 === N, `كل الجوالات على الخادم الأول: ${a0}/${N} فورًا، و${a1}/${N} بعد محاولة العودة التلقائية`);

  // سؤال للجميع
  await host.evaluate(() => { Host.e.s.plan = [{ g: 'kickoff', min: 5 }, { g: 'council', min: 2 }, { g: 'final', min: 5 }, { g: 'crown', min: 2 }]; Host.e.goSegment(0); Host.e.nextItem(); Host.e.openItem(); Host.broadcast(true); });
  await until(async () => (await Promise.all(S.map(p => p.$('[data-ans]').then(Boolean)))).every(Boolean), 8000);
  const t1 = Date.now();
  await Promise.all(S.map((p, i) => p.click(`[data-ans="${i % 4}"]`).catch(() => null)));
  const got = await until(async () => { const g = await host.evaluate(() => Object.keys(Host.e.item().answers).length); return g === N ? g : 0; }, 10000, 100);
  check(got === N, `وصلت ${got || 0}/${N} إجابة عبر الخادم خلال ${Date.now() - t1} مللي ثانية`);
  await host.evaluate(() => { Host.e.lockAll(); Host.broadcast(true); });
  const fb = await until(async () => (await Promise.all(S.map(p => p.evaluate(() => /صحيحة|خاطئة|أحسنت|صح|خطأ/.test(document.querySelector('.pl-body').textContent))))).every(Boolean), 8000);
  check(!!fb, 'كل جوال أظهر نتيجة إجابته بعد الكشف');
  const gold = await host.evaluate(() => Host.e.s.teams.map(t => [t.id, Host.e.vil(t.id).gold]));
  // شراء من جوال القائد عبر الخادم
  const capSid = await host.evaluate(() => { Host.e.manualGold('t1', 30); Host.e.goSegment(1); Host.e.nextItem(); Host.broadcast(true); return Host.e.s.captain.t1; }); // الشراء في مجلس القرية فقط
  let bought = false;
  if (capSid) {
    const cp = (await Promise.all(S.map(async p => (await p.evaluate(() => Student.cfg.sid)) === capSid ? p : null))).find(Boolean);
    await cp.evaluate(() => Student.send('buy', { k: 'house' })).catch(() => null);
    bought = await until(() => host.evaluate(() => Host.e.s.buildLog.length > 0), 6000);
    if (!bought) { // عبر الواجهة
      await cp.evaluate(() => { const x = document.querySelector('[data-act="shop"]'); if (x) x.click(); }); await sleep(400);
      await cp.evaluate(() => { const x = document.querySelector('[data-buy="house"]'); if (x) x.click(); });
      bought = await until(() => host.evaluate(() => Host.e.s.buildLog.length > 0), 6000);
    }
  }
  check(!!bought, 'القائد اشترى منزلًا من جواله عبر الخادم: ' + JSON.stringify(gold));

  // استباق متزامن
  await host.evaluate(() => { Host.e.goSegment(2); Host.e.nextItem(); Host.e.openItem(); Host.broadcast(true); });
  const hasBtn = await until(async () => (await Promise.all(S.map(p => p.$('[data-buzz]').then(Boolean)))).every(Boolean), 8000);
  check(!!hasBtn, 'زر الاستباق ظاهر في كل الجوالات');
  await Promise.all(S.map(p => p.dispatchEvent('[data-buzz]', 'pointerdown').catch(() => null)));
  await sleep(2500);
  const r = await host.evaluate(() => { const it = Host.e.item(); return { ph: Host.e.s.seg.phase, w: it.buzz && it.buzz.name, late: (it.late || []).length, bz: Object.values(Host.e.s.students).reduce((a, s) => a + s.st.bz, 0) }; });
  check(r.ph === 'answering' && r.w && r.bz === 1, `${N} ضغطة متزامنة ← فائز واحد (${r.w})، الضغطات المعتمدة ${r.bz}، وسُجّل أقرب ${r.late} متأخرين`);
  const win = await until(async () => { const w = await Promise.all(S.map(p => p.evaluate(() => document.querySelector('.pl-body').textContent.includes('أنت أولًا')))); return w.filter(Boolean).length === 1; }, 5000);
  check(!!win, 'جوال واحد فقط يعرض «أنت أولًا»');

  // تزوير: طالب ينشر حالة مشرف بمفتاحه
  const before = await S[5].evaluate(() => Student.net.mq.stats.bad);
  await S[0].evaluate(() => Student.net.mq.pub('h/s', { code: Student.cfg.code, v: 999999, g: 'crown', ph: 'winner', T: [] }));
  await sleep(1500);
  const after = await S[5].evaluate(() => ({ bad: Student.net.mq.stats.bad, g: Student.P && Student.P.g }));
  check(after.bad > before && after.g !== 'crown', `حالة مزيفة من جوال طالب رُفضت في الجوالات الأخرى (مرفوضة ${after.bad - before})`);
  // انتحال sid طالب آخر
  const victim = await S[1].evaluate(() => Student.cfg.sid), vName0 = await host.evaluate(v => Host.e.s.students[v].name, victim);
  await S[2].evaluate(v => Student.net.presence({ sid: v, nm: 'منتحل' }), victim).catch(() => null); await sleep(1500);
  const vName = await host.evaluate(v => Host.e.s.students[v].name, victim);
  check(vName === vName0, 'انتحال هوية طالب آخر لم يغيّر بياناته: ' + vName);

  // سقوط الخادم الأول أثناء اللعب
  A.kill('SIGKILL'); await sleep(500);
  const moved = await until(async () => (await Promise.all(S.map(p => p.evaluate(() => Student.net.mq.active && Student.net.mq.active.up && Student.net.mq.active.i)))).every(i => i === 1), 15000, 300);
  check(!!moved, 'بعد إيقاف الخادم الأول انتقلت كل الجوالات إلى الخادم الثاني تلقائيًا');
  await host.evaluate(() => { Host.e.judge(true); Host.e.nextItem(); Host.e.openItem(); Host.broadcast(true); });
  const hb = await until(async () => (await Promise.all(S.map(p => p.$('[data-buzz]').then(Boolean)))).filter(Boolean).length >= N - 1, 10000);
  check(!!hb, 'السؤال التالي وصل للجوالات عبر الخادم الثاني');
  await S[7].dispatchEvent('[data-buzz]', 'pointerdown').catch(() => null);
  const w2 = await until(() => host.evaluate(() => Host.e.item().buzz && Host.e.item().buzz.name), 6000);
  check(!!w2, 'الاستباق يعمل بعد سقوط الخادم الأول: ' + w2);

  // انقطاع جوال وعودته
  await S[3].close(); await sleep(500);
  const off = await until(() => host.evaluate(() => Object.values(Host.e.s.students).filter(s => !s.online).length >= 1), 15000);
  check(!!off, 'إغلاق جوال يظهر غير متصل لدى المشرف');
  check(errs.length === 0, 'لا أخطاء JavaScript' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  console.log(`\n${ok} ناجح، ${bad} فاشل`);
  await b.close(); srv.close(); try { A.kill(); } catch (e) { } B.kill(); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
