// انقطاع النت والعودة (طلب المستخدم 11 نوفمبر 20:38): المشرف والمتسابقون وشاشة العرض، عبر مسار البث الخارجي الحقيقي (خادما بث محليان)،
// وكل جهاز في سياق متصفح مستقل. يغطي: القائد ينقطع أثناء الأوامر فيخلفه عضو متصل، والقائد يعود فيستعيد مكانه، ومتسابق جديد ينضم وسط المسابقة،
// وفريق كامل ينقطع فلا ينتظره الباقون، وشاشة العرض تُعاد فتعود لما كانت عليه، والمشرف ينقطع نته فتتوقف المسابقة ثم تستأنف وحدها.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..'), PORT = 8850 + Math.floor(Math.random() * 40), BP = [9411 + Math.floor(Math.random() * 40), 9461 + Math.floor(Math.random() * 40)];
http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0].split('#')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(d); }); }).listen(PORT);
const URL = `http://localhost:${PORT}/dist/rayat.html`; let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('✗', m); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const broker = port => spawn('node', [path.join(ROOT, 'testenv/broker.js'), String(port)], { cwd: path.join(ROOT, 'testenv'), stdio: 'ignore' });
const until = async (fn, ms = 15000, step = 200) => { const t = Date.now(); let v; while (Date.now() - t < ms) { try { v = await fn(); } catch (e) { v = null; } if (v) return v; await sleep(step); } return v; };
(async () => {
  let A = broker(BP[0]), B = broker(BP[1]); await sleep(1500);
  const init = `window.RAYAT_BROKERS=[{h:'localhost',p:${BP[0]},path:'/',ssl:false,n:'A'},{h:'localhost',p:${BP[1]},path:'/',ssl:false,n:'B'}];try{Object.defineProperty(window,'BroadcastChannel',{value:undefined,configurable:true});}catch(e){}`;
  const noGL = `(()=>{const o=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(t,...a){if(/webgl/.test(t))return null;return o.call(this,t,...a);};})();`;
  const br = await chromium.launch(); const errs = [];
  const ctxOf = async tag => { const ctx = await br.newContext(); await ctx.addInitScript(init); if (tag === 'display') await ctx.addInitScript(noGL); return ctx; };
  const open = async (ctx, hash, w, h, tag) => { const p = await ctx.newPage(); await p.setViewportSize({ width: w, height: h }); p.on('pageerror', e => errs.push(tag + ': ' + e.message)); await p.goto(URL + '#' + hash, { timeout: 120000 }); return p; };
  const hctx = await ctxOf('host'), host = await open(hctx, 'host', 1280, 800, 'host'); await host.waitForSelector('#start', { timeout: 60000 });
  ok(await until(() => host.evaluate(() => Host.net.label().cls === 'on')), 'المشرف متصل بالبث');
  const link = await host.evaluate(() => joinUrl(Host.g.s.code, Host.fp)), hash = link.split('#')[1], code = await host.evaluate(() => Host.g.s.code);
  const join = async (nm, t) => { const ctx = await ctxOf(nm), p = await open(ctx, hash, 390, 844, nm); await p.waitForSelector('#nm', { timeout: 30000 }); await p.fill('#nm', nm); await p.click(`[data-tw="${t}"]`); await p.click('#go'); return { ctx, p }; };
  const cap0 = await join('سعد', 0), mem0 = await join('فهد', 0), t1 = await join('خالد', 1);
  ok(await until(() => host.evaluate(() => Object.keys(Host.g.s.players).length === 3)), 'انضم ثلاثة');
  const dctx = await ctxOf('display'); let disp = await open(dctx, 'display-' + code, 800, 450, 'display'); ok(await until(() => host.evaluate(() => Host.hasDisplay())), 'شاشة العرض متصلة');
  await host.evaluate(() => { Host.cfg.n = 2; }); await host.evaluate(() => document.getElementById('start').click());
  const stage = () => host.evaluate(() => Host.g.s.stage);
  const fast = () => host.evaluate(() => { const g = Host.g, s = g.s; if (['phase', 'scene', 'harvest', 'reveal', 'predict', 'point'].includes(s.stage) && s.deadline) s.deadline = Math.min(s.deadline, g.t() + 200); g.tick(); });
  const to = async (st, ms = 40000) => until(async () => { const s = await stage(); if (s === st) return true; await fast(); return false; }, ms, 150);
  ok(await to('question'), 'بدأ السؤال');
  // ---- شاشة العرض تُعاد أثناء السؤال
  await disp.reload(); ok(await until(() => disp.evaluate(() => { const q = document.querySelector('#qcard'); return q && !q.classList.contains('hide') && q.textContent.length > 10; }), 30000), 'بعد إعادة فتح شاشة العرض: السؤال ظاهر من جديد');
  // ---- متسابق جديد ينضم وسط المسابقة فيصل إليه السؤال الحالي
  const late = await join('زيد', 1); ok(await until(() => host.evaluate(() => Object.keys(Host.g.s.players).length === 4)), 'متسابق جديد انضم وسط المسابقة');
  ok(await until(() => late.p.evaluate(() => document.querySelectorAll('[data-ans]').length === 4), 20000), 'المنضم الجديد يرى السؤال الحالي ويجيب');
  // الجميع يجيب صحيحًا ← الأوامر
  const qa = await host.evaluate(() => Host.g.s.q.a); for (const x of [cap0, mem0, t1, late]) await x.p.click(`[data-ans="${qa}"]`).catch(() => { });
  ok(await to('orders'), 'وصلنا الأوامر'); const capPid = await host.evaluate(() => Host.g.captain(0)), capMine = await cap0.p.evaluate(() => Phone.pid);
  ok(capPid === capMine, 'سعد قائد فريقه');
  await host.evaluate(() => { Host.g.s.deadline = Host.g.t() + 600000; });
  // ---- القائد ينقطع (يُغلق جواله) ← عضو متصل يخلفه ويقدر يقرر
  await cap0.p.close(); ok(await until(() => host.evaluate(p => Host.g.s.players[p].online === false, capPid), 30000), 'المشرف عرف أن القائد انقطع');
  const memPid = await mem0.p.evaluate(() => Phone.pid); ok(await host.evaluate(m => Host.g.captain(0) === m, memPid), 'القرار انتقل تلقائيًا لعضو متصل من الفريق');
  ok(await until(() => mem0.p.evaluate(() => !!document.querySelector('[data-tab]')), 20000), 'العضو صار يرى أدوات القائد في جواله');
  // ---- القائد يعود من الجهاز نفسه ← يستعيد مكانه
  cap0.p = await open(cap0.ctx, hash, 390, 844, 'سعد-عاد'); ok(await until(() => host.evaluate(p => Host.g.s.players[p].online !== false, capPid), 30000), 'عاد القائد بالجلسة نفسها بلا تسجيل جديد');
  ok(await host.evaluate(p => Object.keys(Host.g.s.players).length === 4 && Host.g.captain(0) === p, capPid), 'القائد استعاد مكانه، ولم يتكرر اسمه');
  ok(await until(() => cap0.p.evaluate(() => !!document.querySelector('[data-tab]')), 20000), 'القائد العائد يرى الأوامر ويكمل');
  // ---- فريق كامل ينقطع ← لا ينتظره الباقون
  await t1.p.close(); await late.p.close(); ok(await until(() => host.evaluate(() => Host.g.online(1).length === 0), 30000), 'الفريق الثاني انقطع كله');
  await cap0.p.evaluate(() => { const b = document.querySelector('[data-ready]'); if (b) b.click(); }); await host.evaluate(p => Host.g.setReady(p), capPid);
  ok(await until(async () => (await stage()) !== 'orders', 15000), 'لم ينتظر الفريق المنقطع: نُفّذت الأوامر');
  // عودة الفريق
  t1.p = await open(t1.ctx, hash, 390, 844, 'خالد-عاد'); ok(await until(() => host.evaluate(() => Host.g.online(1).length === 1), 30000), 'عاد عضو الفريق الثاني');
  // ---- انقطاع نت المشرف ← توقف تلقائي ثم استئناف
  ok(await to('question', 60000), 'سؤال جديد');
  A.kill(); B.kill(); ok(await until(() => host.evaluate(() => !!Host.g.s.paused && Host.autoPaused), 30000), 'انقطع نت المشرف: توقفت المسابقة تلقائيًا');
  const left0 = await host.evaluate(() => Host.g.left()); await sleep(3000); ok(await host.evaluate(l => Math.abs(Host.g.left() - l) < 400, left0), 'الوقت لا ينقص أثناء الانقطاع');
  A = broker(BP[0]); B = broker(BP[1]); ok(await until(() => host.evaluate(() => !Host.g.s.paused && !Host.autoPaused), 60000), 'عاد النت: استؤنفت المسابقة وحدها');
  ok(await until(() => mem0.p.evaluate(() => !document.querySelector('.pausebar')), 30000), 'الجوالات خرجت من التوقف');
  console.log(`الانقطاع والعودة: ${pass} نجح، ${fail} فشل`, 'أخطاء الصفحات', errs.length, errs.slice(0, 4)); A.kill(); B.kill(); await br.close(); process.exit(fail || errs.length ? 1 : 0);
})().catch(e => { console.log('خطأ', e.message); process.exit(1); });
