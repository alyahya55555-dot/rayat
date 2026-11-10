// اختبار محرك الصوت في متصفح فعلي (فحص برمجي للتشغيل، لا مراجعة سمعية):
// التحميل المسبق، أول حدث بعد التفعيل، الكتم الشامل، عدم تكرار الخلفية، الإيقاف المؤقت، التخطي، وعدم تشغيل الصوت العام من الجوالات
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), PORT = 8900 + Math.floor(Math.random() * 50);
http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0].split('#')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(d); }); }).listen(PORT);
const URL = `http://localhost:${PORT}/dist/rayat.html`; let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('✗', m); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 10000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch (e) { } await sleep(120); } return false; };
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }); const ctx = await b.newContext(); const errs = [];
  const host = await ctx.newPage(); await host.setViewportSize({ width: 1100, height: 650 }); host.on('pageerror', e => errs.push(e.message));
  await host.goto(URL + '#host'); await host.waitForSelector('#start', { timeout: 60000 });
  // ---- قبل التفعيل: لا سياق صوت، وطلب الصوت لا يرمي خطأ
  ok(await host.evaluate(() => { SFX.play('buzz'); return SFX.ctx === null && SFX.status().state === 'none'; }), 'قبل التفعيل: الطلب آمن ولا سياق صوت');
  // ---- التفعيل ثم أول حدث فورًا (قبل اكتمال فك الترميز): يُجدول ويُشغَّل عند الجاهزية
  await host.evaluate(() => { SFX.hist = []; SFX.unlock(); SFX.play('buzz'); });
  ok(await until(() => host.evaluate(() => SFX.hist.some(h => h.k === 'hit'))), 'أول حدث بعد التفعيل مباشرة شُغِّل (بعد اكتمال فك ترميزه)');
  ok(await until(() => host.evaluate(() => { const s = SFX.status(); return s.total > 30 && s.loaded === s.total; })), 'كل العينات حُمّلت وفُك ترميزها (' + JSON.stringify(await host.evaluate(() => { const s = SFX.status(); return [s.loaded, s.total]; })) + ')');
  ok(await host.evaluate(() => SFX.status().failed.length === 0), 'لا عينة فشل تحميلها: ' + JSON.stringify(await host.evaluate(() => SFX.status().failed)));
  // ---- كل مفتاح معرّف يعمل ولا يطلب عينة غير موجودة
  const keys = (fs.readFileSync(path.join(ROOT, 'app/sfx.js'), 'utf8').match(/case '([\w-]+)':/g) || []).map(x => x.slice(6, -2));
  const res = await host.evaluate(ks => { const out = {}; ks.forEach(k => { const n0 = SFX.hist.length; SFX.play(k, 0, 2.5); out[k] = SFX.hist.length - n0; SFX.stopAll(); }); return { out, failed: SFX.status().failed }; }, keys);
  ok(keys.length >= 20 && keys.every(k => res.out[k] > 0), 'كل مفاتيح الأحداث (' + keys.length + ') تشغّل عينة واحدة على الأقل: ' + keys.filter(k => !res.out[k]).join(' ')); ok(res.failed.length === 0, 'لا عينة مفقودة عند تشغيل كل المفاتيح: ' + res.failed.join(' '));
  // ---- التخطي: يوقف الجاري والمجدول
  await host.evaluate(() => { SFX.play('march', 0, 6); SFX.play('clash', 2, 3); }); ok(await host.evaluate(() => SFX.live.size > 5), 'أصوات جارية ومجدولة موجودة');
  await host.evaluate(() => SFX.stopAll()); ok(await host.evaluate(() => SFX.live.size === 0), 'التخطي أوقف الجاري والمجدول كله');
  // ---- الخلفية: واحدة فقط مهما تكرر التفعيل والكتم
  await host.evaluate(() => { SFX.ambient(); SFX.ambient(); }); ok(await until(() => host.evaluate(() => !!SFX.amb)), 'الخلفية بدأت');
  const amb1 = await host.evaluate(() => { window.__amb = SFX.amb; let n = 0; const o = SFX.rec.bind(SFX); SFX.rec = (k, ...a) => { if (k === 'nature') n++; return o(k, ...a); }; for (let i = 0; i < 6; i++) { SFX.setOn(false); SFX.setOn(true); SFX.unlock(); SFX.ambient(); } SFX.rec = o; return { same: SFX.amb === window.__amb, n, loop: SFX.amb.loop }; });
  ok(amb1.same && amb1.n === 0 && amb1.loop, 'ست مرات كتم وإعادة: الخلفية نفسها ولا حلقة ثانية');
  // ---- الكتم على المخرج الرئيس: يشمل الخلفية والجاري والمجدول
  const m = await host.evaluate(() => { SFX.play('march', 0, 5); SFX.play('clash', 3, 2); SFX.setOn(false); const g0 = SFX.master.gain.value; const viaMaster = !!SFX.amb; SFX.play('buzz'); const g1 = SFX.master.gain.value; SFX.setOn(true); const g2 = SFX.master.gain.value; SFX.setVol(.3); const g3 = SFX.master.gain.value; SFX.setVol(.85); SFX.stopAll(); return { g0, g1, g2, g3, viaMaster }; });
  ok(m.g0 === 0 && m.g1 === 0, 'الكتم يصفّر المخرج الرئيس (الخلفية والجاري والمجدول والجديد)'); ok(Math.abs(m.g2 - .85) < .01 && Math.abs(m.g3 - .3) < .01, 'رفع الكتم يعيد المستوى، وشريط المستوى يعمل');
  // ---- الكتم الخارجي: خريطة المشرف المخفية لا تُصدر صوتًا (كي لا يتكرر الصوت من جهازين)
  ok(await host.evaluate(() => { SFX.setExt(true); const a = SFX.master.gain.value; SFX.setExt(false); return a === 0 && SFX.master.gain.value > 0; }), 'الكتم الخارجي يعمل ويُرفع');
  // ---- الإيقاف المؤقت: زمن الصوت يتجمد مع المشهد، ولا يُعاد تشغيل أحداث قديمة عند الاستئناف
  await host.evaluate(() => document.getElementById('bots').click()); await sleep(500); await host.evaluate(() => { document.getElementById('start').click(); }); await sleep(300); await host.evaluate(() => { document.getElementById('maphere').click(); const o = document.getElementById('tapov'); if (o) o.remove(); SFX.unlock(); });
  ok(await until(() => host.evaluate(() => Host.g.s.stage === 'question'), 40000), 'بدأت المسابقة ووصلنا السؤال (' + await host.evaluate(() => JSON.stringify([Host.g.s.stage, Host.g.s.paused, Object.keys(Host.g.s.players).length, !!Host.mapLayer])) + ')');
  await until(() => host.evaluate(() => Display.lastStage === 'question')); await sleep(300);
  await host.evaluate(() => { SFX.hist = []; Host.g.pause(true); Host.changed(); }); ok(await until(() => host.evaluate(() => SFX.ctx.state === 'suspended')), 'الإيقاف المؤقت جمّد الصوت'); const tA = await host.evaluate(() => SFX.ctx.currentTime); await sleep(900);
  ok(await host.evaluate(t => Math.abs(SFX.ctx.currentTime - t) < .05, tA), 'زمن الصوت لا يتقدم أثناء الإيقاف');
  await host.evaluate(() => { Host.g.pause(false); Host.changed(); }); ok(await until(() => host.evaluate(() => SFX.ctx.state === 'running')), 'الاستئناف أعاد الصوت'); await sleep(600);
  ok(await host.evaluate(() => SFX.hist.filter(h => h.k === 'impact' || h.k === 'step').length === 0), 'الاستئناف لا يعيد أصوات أحداث قديمة (المرحلة أو السؤال): ' + JSON.stringify(await host.evaluate(() => SFX.hist.map(h => h.k))));
  // ---- الجوال لا يشغّل الصوت العام
  const code = await host.evaluate(() => Host.g.s.code), fp = await host.evaluate(() => Host.fp || ''); const ph = await ctx.newPage(); await ph.setViewportSize({ width: 390, height: 844 }); ph.on('pageerror', e => errs.push('phone: ' + e.message));
  await ph.goto(URL + '#join-' + code + (fp ? '-' + fp : '')); await ph.waitForSelector('#nm', { timeout: 30000 }); await ph.fill('#nm', 'تجربة'); await ph.click('#go'); await sleep(1500);
  ok(await ph.evaluate(() => SFX.ctx === null), 'الجوال لا ينشئ سياق صوت: الصوت العام من شاشة العرض فقط');
  console.log(`محرك الصوت: ${pass} نجح، ${fail} فشل`, 'أخطاء الصفحات', errs.length, errs.slice(0, 4)); await b.close(); process.exit(fail || errs.length ? 1 : 0);
})();
