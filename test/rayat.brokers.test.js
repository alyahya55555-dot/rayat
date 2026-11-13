// خوادم بث متفرقة (حادثة 12 نوفمبر: الجوالات علقت على «جارٍ الاتصال بالغرفة» والمشرف متصل):
// المشرف يصل إلى الخادم B فقط، والجوالات تبدأ بالخادم A. قبل الإصلاح كان الجوال يكتفي بأول خادم فلا يصله شيء.
// وكذلك: خادم يسقط أثناء اللعب، ووداع من خادم واحد لا يُخرج الجوال، و20 جوالًا يدخلون معًا.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..'), PORT = 8700 + Math.floor(Math.random() * 50), BP = [9411 + Math.floor(Math.random() * 30), 9451 + Math.floor(Math.random() * 30), 9491 + Math.floor(Math.random() * 30)];
http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0].split('#')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(d); }); }).listen(PORT);
const URL = `http://localhost:${PORT}/dist/rayat.html`; let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; if (process.env.V) console.log('✓', m); } else { fail++; console.log('✗', m); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const broker = port => spawn('node', [path.join(ROOT, 'testenv/broker.js'), String(port)], { cwd: path.join(ROOT, 'testenv'), stdio: 'ignore' });
const until = async (fn, ms = 15000, step = 200) => { const t = Date.now(); let v; while (Date.now() - t < ms) { try { v = await fn(); } catch (e) { v = null; } if (v) return v; await sleep(step); } return v; };
const L = (p, n) => `{h:'localhost',p:${p},path:'/',ssl:false,n:'${n}'}`;
(async () => {
  let A = broker(BP[0]), B = broker(BP[1]), C = broker(BP[2]); await sleep(1500);
  const noBC = `try{Object.defineProperty(window,'BroadcastChannel',{value:undefined,configurable:true});}catch(e){}`;
  const br = await chromium.launch(); const errs = [];
  const dev = async (hash, list, tag, w = 390, h = 844) => { const ctx = await br.newContext(); await ctx.addInitScript(`window.RAYAT_BROKERS=[${list}];` + noBC); const p = await ctx.newPage(); await p.setViewportSize({ width: w, height: h }); p.on('pageerror', e => errs.push(tag + ': ' + e.message)); await p.goto(URL + '#' + hash, { timeout: 90000 }); return p; };
  // المشرف يرى الخوادم الثلاثة في قائمته، لكن A «محجوب» عنه (منفذ لا يصل) فيتصل بـ B وC فقط
  const host = await dev('host', `{h:'localhost',p:1,path:'/',ssl:false,n:'A'},${L(BP[1], 'B')},${L(BP[2], 'C')}`, 'host', 1280, 800); await host.waitForSelector('#start', { timeout: 60000 });
  ok(await until(() => host.evaluate(() => Host.net.mq && Host.net.mq.upCount() === 2)), 'المشرف متصل بخادمين من ثلاثة (A محجوب عنه)');
  const hash = (await host.evaluate(() => joinUrl(Host.g.s.code, Host.fp))).split('#')[1];
  // الجوال الأول: A أولًا في قائمته (كحال الجوالات في القاعة)، وB متاح
  const p1 = await dev(hash, `${L(BP[0], 'A')},${L(BP[1], 'B')},${L(BP[2], 'C')}`, 'p1');
  ok(await until(() => p1.evaluate(() => !!document.getElementById('nm'))), 'الجوال وصله المشرف رغم أن خادمه الأول لا يصل إليه المشرف');
  await p1.fill('#nm', 'سعد'); await p1.click('[data-tw="0"]'); await p1.click('#go');
  ok(await until(() => host.evaluate(() => Object.values(Host.g.s.players).some(p => p.name === 'سعد'))), 'المشرف يرى الجوال الأول');
  // جوال لا يصل إلا إلى C (شبكة مختلفة)
  const p2 = await dev(hash, `{h:'localhost',p:2,path:'/',ssl:false,n:'A'},{h:'localhost',p:3,path:'/',ssl:false,n:'B'},${L(BP[2], 'C')}`, 'p2');
  ok(await until(() => p2.evaluate(() => !!document.getElementById('nm'))), 'جوال لا يصل إلا إلى الخادم الثالث يدخل أيضًا');
  await p2.fill('#nm', 'فهد'); await p2.click('[data-tw="1"]'); await p2.click('#go');
  ok(await until(() => host.evaluate(() => Object.values(Host.g.s.players).some(p => p.name === 'فهد'))), 'المشرف يرى الجوال الثاني');
  // 20 جوالًا معًا
  const many = []; for (let i = 0; i < 18; i++) many.push(dev(hash, `${L(BP[0], 'A')},${L(BP[1], 'B')},${L(BP[2], 'C')}`, 'm' + i));
  const P = await Promise.all(many);
  for (let i = 0; i < P.length; i++) { const p = P[i]; await until(() => p.evaluate(() => !!document.getElementById('nm')), 30000); await p.fill('#nm', 'لاعب' + i); await p.click(`[data-tw="${i % 3}"]`); await p.click('#go'); }
  ok(await until(() => host.evaluate(() => Object.keys(Host.g.s.players).length === 20), 40000), '20 جوالًا دخلوا معًا (' + await host.evaluate(() => Object.keys(Host.g.s.players).length) + ')');
  // لا تكرار: الحالة تصل من خادمين لكنها تُعالج مرة واحدة
  const dup = await p1.evaluate(() => { const D = Phone.net.mq.dupH || []; return D.length; }); ok(dup > 0, 'الجوال يزيل الرسائل المكررة القادمة من أكثر من خادم');
  // يبدأ اللعب، ثم يسقط الخادم B: الجوال الأول يكمل عبر C
  await host.evaluate(() => { Host.cfg.n = 3; document.getElementById('start').click(); });
  ok(await until(() => host.evaluate(() => Host.g.s.stage !== 'lobby')), 'بدأت المسابقة');
  B.kill(); await sleep(2500);
  const st0 = await host.evaluate(() => Host.g.s.v); await host.evaluate(() => { Host.g.s.v++; Host.changed(); });
  ok(await until(() => p1.evaluate(v => Phone.P && Phone.P.v > v, st0)), 'سقط خادم B أثناء اللعب، والجوال يكمل عبر C');
  // الوداع من خادم واحد لا يُخرج الجوال: الجوال الأول ما زال متصلًا عند المشرف
  await sleep(6000); ok(await host.evaluate(() => { const p = Object.values(Host.g.s.players).find(x => x.name === 'سعد'); return p && p.online !== false; }), 'سقوط خادم واحد لا يُظهر الجوال منقطعًا');
  // انقطاع الشبكة عن جوال (مثل قفل الشاشة أو تبدّل الشبكة) ثم عودتها: يلحق بآخر حالة وحده بلا تحديث للصفحة
  await p1.context().setOffline(true); await sleep(4000); await host.evaluate(() => { Host.g.s.v += 3; Host.changed(); }); await sleep(26000);
  await p1.context().setOffline(false); const vNow = await host.evaluate(() => Host.g.s.v); const tBack = Date.now();
  ok(await until(() => p1.evaluate(v => Phone.P && Phone.P.v >= v, vNow), 25000), 'بعد انقطاع الشبكة 30 ثانية يلحق الجوال بآخر حالة وحده (' + Math.round((Date.now() - tBack) / 1000) + ' ث)');
  // الرجوع للصفحة بعد إخفائها يعيد الاتصال فورًا إن كان صامتًا
  const r0 = await p1.evaluate(() => Phone.net.mq.restarts || 0); await p1.evaluate(() => { Phone.net.mq.lastRestart = 0; Phone.net.mq.lastIn = performance.now() - 20000; Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  ok(await until(() => p1.evaluate(r => (Phone.net.mq.restarts || 0) > r, r0), 5000), 'العودة للصفحة بعد صمت تعيد الاتصال فورًا');
  const v2 = await host.evaluate(() => { Host.g.s.v++; Host.changed(); return Host.g.s.v; }); ok(await until(() => p1.evaluate(v => Phone.P && Phone.P.v >= v, v2), 15000), 'وبعدها تصل الحالة الجديدة');
  // المشرف أُعيد فتحه (رقم الحالة يصغر): الجوال يقبل الجلسة الجديدة ولا يعلق
  const old = await p1.evaluate(() => Phone.P.v); await host.evaluate(() => { Host.hs = 'newsession'; Host.g.s.v = 5; Host.changed(); });
  ok(await until(() => p1.evaluate(() => Phone.P && Phone.P.hs === 'newsession'), 10000), 'إعادة فتح المشرف برقم أصغر لا تعلّق الجوال (كان ' + old + ')');
  // الخروج الحقيقي يُرى: نغلق الجوال الثاني
  await p2.context().close(); ok(await until(() => host.evaluate(() => { const p = Object.values(Host.g.s.players).find(x => x.name === 'فهد'); return p && p.online === false; }), 30000), 'خروج الجوال فعلًا يُرى عند المشرف');
  ok(!errs.length, 'لا أخطاء في الصفحات ' + JSON.stringify(errs.slice(0, 3)));
  console.log(`خوادم البث المتفرقة: ${pass} نجح، ${fail} فشل`); A.kill(); C.kill(); await br.close(); process.exit(fail ? 1 : 0);
})();
