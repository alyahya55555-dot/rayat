// التزامن بين أجهزة مستقلة عبر مسار البث الخارجي الحقيقي (MQTT) — القناة المحلية معطّلة تمامًا، وكل جهاز في سياق متصفح مستقل.
// خادما بث محليان (aedes) يقومان مقام الخوادم العامة. يغطي: الانضمام، السؤال والإجابة، الكشف، الأوامر، الاستباق المتزامن، الإيقاف، انقطاع الخادم وعودته، إعادة تحميل المتسابق والمشرف، إشارة شاشة العرض.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..'), PORT = 8800 + Math.floor(Math.random() * 50), BP = [9311 + Math.floor(Math.random() * 40), 9361 + Math.floor(Math.random() * 40)];
http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0].split('#')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(d); }); }).listen(PORT);
const URL = `http://localhost:${PORT}/dist/rayat.html`; let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('✗', m); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const broker = port => spawn('node', [path.join(ROOT, 'testenv/broker.js'), String(port)], { cwd: path.join(ROOT, 'testenv'), stdio: 'ignore' });
const until = async (fn, ms = 12000, step = 150) => { const t = Date.now(); let v; while (Date.now() - t < ms) { try { v = await fn(); } catch (e) { v = null; } if (v) return v; await sleep(step); } return v; };
(async () => {
  let A = broker(BP[0]), B = broker(BP[1]); await sleep(1500);
  const init = `window.RAYAT_BROKERS=[{h:'localhost',p:${BP[0]},path:'/',ssl:false,n:'A'},{h:'localhost',p:${BP[1]},path:'/',ssl:false,n:'B'}];try{Object.defineProperty(window,'BroadcastChannel',{value:undefined,configurable:true});}catch(e){}`;
  const br = await chromium.launch(); const errs = [];
  const noGL = `(()=>{const o=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(t,...a){if(/webgl/.test(t))return null;return o.call(this,t,...a);};})();`;
  const dev = async (hash, w, h, tag) => { const ctx = await br.newContext(); await ctx.addInitScript(init); if (tag === 'display') await ctx.addInitScript(noGL); const p = await ctx.newPage(); await p.setViewportSize({ width: w, height: h }); p.on('pageerror', e => errs.push(tag + ': ' + e.message)); await p.goto(URL + '#' + hash, { timeout: 120000 }); return p; };
  const host = await dev('host', 1280, 800, 'host'); await host.waitForSelector('#start', { timeout: 60000 });
  ok(await until(() => host.evaluate(() => Host.net.label().cls === 'on')), 'المشرف: متصل بخوادم البث (' + await host.evaluate(() => Host.net.label().t) + ')');
  ok(await host.evaluate(() => !Host.net.bc), 'القناة المحلية معطّلة فعلًا في هذا الاختبار');
  const link = await host.evaluate(() => joinUrl(Host.g.s.code, Host.fp)), hash = link.split('#')[1]; const code = await host.evaluate(() => Host.g.s.code);
  const names = [['سعد', 0], ['فهد', 0], ['ناصر', 0], ['خالد', 1], ['عمر', 1], ['زيد', 2]], ph = [];
  for (const [nm, t] of names) { const p = await dev(hash, 390, 844, nm); await p.waitForSelector('#nm', { timeout: 30000 }); await p.fill('#nm', nm); await p.click(`[data-tw="${t}"]`); await p.click('#go'); ph.push(p); }
  ok(await until(() => host.evaluate(() => Object.keys(Host.g.s.players).length === 6)), 'انضم ستة متسابقين من ستة أجهزة مستقلة عبر البث');
  const disp = await dev('display-' + code, 800, 450, 'display'); ok(await until(() => host.evaluate(() => Host.hasDisplay())), 'المشرف يرى شاشة العرض المستقلة');
  await host.evaluate(() => { Host.cfg.n = 3; }); await host.evaluate(() => document.getElementById('start').click());
  const stage = () => host.evaluate(() => Host.g.s.stage);
  const fast = () => host.evaluate(() => { const g = Host.g, s = g.s; if (['phase', 'scene', 'harvest', 'reveal', 'predict', 'point'].includes(s.stage) && s.deadline) s.deadline = Math.min(s.deadline, g.t() + 200); g.tick(); });
  const to = async (st, ms = 40000) => until(async () => { const s = await stage(); if (s === st) return true; await fast(); return false; }, ms, 120);
  // إشارة شاشة العرض عبر البث: مشهد المرحلة ينتهي بإشارة الشاشة قبل السقف
  const t0 = Date.now(); ok(await until(async () => (await stage()) === 'question', 30000), 'مشهد المرحلة انتهى'); ok(await host.evaluate(() => Host.g.s.dur) > 0, 'بدأ السؤال'); console.log('  مشهد المرحلة عبر شاشة مستقلة:', ((Date.now() - t0) / 1000).toFixed(1), 'ث'); ok(Date.now() - t0 < 8000, 'إشارة «انتهى المشهد» من شاشة مستقلة تصل عبر البث وتنقل المشرف قبل السقف الزمني (12.3 ث)');
  // ---- السؤال يصل والإجابات تصل
  ok(await until(() => ph[5].evaluate(() => document.querySelectorAll('[data-ans]').length === 4)), 'السؤال وصل إلى جوال مستقل');
  const qa = await host.evaluate(() => Host.g.s.q.a);
  await host.evaluate(() => Host.g.pause(true)); ok(await until(() => ph[0].evaluate(() => !!document.querySelector('.pausebar'))), 'الإيقاف ظهر على جوال مستقل'); ok(await until(() => disp.evaluate(() => !!document.querySelector('.pausetag'))), 'الإيقاف ظهر على شاشة العرض');
  await ph[0].evaluate(() => { const b = document.querySelector('[data-ans]'); b && b.click(); }); await sleep(800); ok(await host.evaluate(() => Object.keys(Host.g.s.answers).length === 0), 'الإيقاف: لا إجابة تُحتسب من جهاز مستقل'); await host.evaluate(() => Host.g.pause(false)); await sleep(500);
  for (let i = 0; i < 5; i++) await ph[i].click(`[data-ans="${i === 1 ? (qa + 1) % 4 : qa}"]`);
  ok(await until(() => host.evaluate(() => Object.keys(Host.g.s.answers).length === 5)), 'خمس إجابات وصلت للمشرف'); ok(await until(() => ph[0].evaluate(() => document.querySelector('.ph').textContent.includes('وصلت إجابتك'))), 'تأكيد الوصول ظهر عند المتسابق');
  // إعادة تحميل متسابق بعد الإجابة: يستعيد جلسته ولا تُحتسب إجابته مرتين
  await ph[2].reload(); ok(await until(() => ph[2].evaluate(() => document.querySelector('.ph') && document.querySelector('.ph').textContent.includes('وصلت إجابتك'))), 'بعد إعادة تحميل الجوال: الجلسة مستعادة والإجابة مؤكدة'); ok(await host.evaluate(() => Object.keys(Host.g.s.players).length === 6 && Object.keys(Host.g.s.answers).length === 5), 'لا لاعب مكرر ولا إجابة مكررة');
  await host.evaluate(() => { const g = Host.g; g.s.deadline = g.t() + 100; g.tick(); }); ok(await to('reveal') || (await stage()) === 'orders', 'الكشف');
  ok(await until(() => ph[1].evaluate(() => /لم تُصب/.test(document.querySelector('.ph').textContent))) , 'الكشف عند المخطئ: «لم تُصب»'); ok(await ph[5].evaluate(() => /لم تجب/.test(document.querySelector('.ph').textContent)), 'الكشف عند من لم يجب: «لم تجب»'); ok(await ph[0].evaluate(() => /أصبت/.test(document.querySelector('.ph').textContent)), 'الكشف عند المصيب: «أصبت»');
  // ---- الأوامر: نجهّز هجومًا لفريق 0 على أرض لفريق 1 ثم يؤكد القادة من جوالاتهم
  await to('orders'); await host.evaluate(() => { const g = Host.g, S = g.S, RR = RayatRules; RR.setPhase(S, 1); g.s.phase = 1; const cap = g.M.caps[0], nb = S.regions[cap].nb.find(j => S.regions[j].owner == null && S.regions[j].type !== 'castle'); S.regions[nb].owner = 1; S.teams[0].res.gold = 20; S.turn.left[0] = Math.max(1, S.turn.left[0]); g.s.vis = g.snapshot(); if (!g.s.orderTeams.includes(0)) g.s.orderTeams.push(0); g.changed(); });
  const capPid = await host.evaluate(() => Host.g.captain(0)), capIdx = (await Promise.all(ph.map(p => p.evaluate(() => Phone.pid)))).indexOf(capPid), cap = ph[capIdx];
  ok(await until(() => cap.evaluate(() => !!document.querySelector('[data-tab="attack"]'))), 'القائد يرى تبويب الهجوم على جواله'); await cap.click('[data-tab="attack"]'); await cap.click('[data-opt="0"]'); await sleep(300);
  await host.evaluate(() => Host.g.pause(true)); await sleep(400); await cap.evaluate(() => { const b = document.querySelector('[data-ready]'); b && b.click(); }); await sleep(700); ok(await host.evaluate(() => !Host.g.s.ready[0] && Host.g.s.stage === 'orders'), 'الإيقاف: تأكيد القائد من جهاز مستقل مرفوض'); await host.evaluate(() => Host.g.pause(false)); await sleep(500);
  await cap.click('[data-ready]'); ok(await until(() => host.evaluate(() => Host.g.s.ready[0] === true || Host.g.s.stage !== 'orders')), 'تأكيد القائد وصل بعد الاستئناف');
  await host.evaluate(() => { const g = Host.g; if (g.s.stage === 'orders') { g.s.deadline = g.t() + 100; g.tick(); } });
  ok(await to('buzz', 60000), 'وصلنا إلى الاستباق (' + await stage() + ')');
  // ---- الاستباق: ثلاثة من فريق المهاجم واثنان من المدافع يضغطون معًا من أجهزة مستقلة
  ok(await until(async () => (await Promise.all(ph.slice(0, 5).map(p => p.evaluate(() => !!document.querySelector('[data-buzz]'))))).every(Boolean)), 'زر الاستباق ظاهر لكل أعضاء الفريقين (لا للقادة فقط)'); ok(await ph[5].evaluate(() => !document.querySelector('[data-buzz]')), 'الفريق غير المشارك لا يرى الزر');
  await Promise.all(ph.slice(0, 5).map(p => p.evaluate(() => { const b = document.querySelector('[data-buzz]'); b && b.click(); })));
  ok(await until(() => host.evaluate(() => Host.g.s.stage === 'judge' && !!Host.g.s.duel.buzz)), 'اعتُمد ضاغط واحد وانتقلنا للتحكيم'); const bz = await host.evaluate(() => Host.g.s.duel.buzz); await sleep(900);
  ok(await host.evaluate(n => Host.g.s.duel.buzz.name === n, bz.name), 'الأول ثابت بعد وصول بقية الضغطات (' + bz.name + ')');
  ok((await Promise.all(ph.map(p => p.evaluate(n => document.querySelector('.ph').textContent.includes(n), bz.name)))).every(Boolean), 'اسم أول ضاغط وفريقه ظاهر على كل الأجهزة'); ok(await ph[0].evaluate(() => !document.querySelector('[data-buzz]')), 'الاستباق مقفل حتى يحكم المشرف');
  // ---- إعادة تحميل المشرف أثناء التحكيم: يستعيد المسابقة
  await host.evaluate(() => Host.save()); await host.reload(); await host.waitForSelector('.modal', { timeout: 20000 }).catch(() => { }); const resumeBtn = await host.$('[data-resume], #resume'); if (resumeBtn) await resumeBtn.click(); else await host.evaluate(() => { const b = [...document.querySelectorAll('.modal button')].find(x => /استئناف|أكمل|متابعة/.test(x.textContent)); b && b.click(); });
  ok(await until(() => host.evaluate(() => Host.g.s.stage === 'judge' && Object.keys(Host.g.s.players).length === 6)), 'بعد إعادة تحميل المشرف: المسابقة مستعادة في مرحلة التحكيم بكل لاعبيها');
  await host.evaluate(() => Host.g.judge(true)); ok(await until(async () => ['point', 'scene', 'buzz', 'predict'].includes(await stage())), 'التحكيم بعد الاستعادة يعمل'); ok(await until(() => ph[3].evaluate(() => !/يجيب الآن/.test(document.querySelector('.ph').textContent))), 'الجوالات تتابع بعد استعادة المشرف');
  // ---- انقطاع خوادم البث ثم عودتها
  A.kill(); B.kill(); ok(await until(() => host.evaluate(() => Host.net.label().cls !== 'on'), 15000), 'انقطاع الخوادم: الحالة لم تعد «متصل» (' + await host.evaluate(() => Host.net.label().t) + ')');
  A = broker(BP[0]); B = broker(BP[1]); ok(await until(() => host.evaluate(() => Host.net.label().cls === 'on'), 40000), 'عودة الخوادم: أُعيد الاتصال تلقائيًا');
  const v0 = await ph[4].evaluate(() => Phone.P.v); await host.evaluate(() => { Host.g.say('اختبار'); Host.g.changed(); }); ok(await until(() => ph[4].evaluate(v => Phone.P.v > v, v0), 30000), 'بعد العودة: الحالة تصل الجوالات من جديد');
  console.log(`التزامن بين الأجهزة: ${pass} نجح، ${fail} فشل`, 'أخطاء الصفحات', errs.length, errs.slice(0, 4)); A.kill(); B.kill(); await br.close(); process.exit(fail || errs.length ? 1 : 0);
})();
