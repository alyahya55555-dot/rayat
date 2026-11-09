// تشغيل حقيقي في متصفح: لوحة المشرف + شاشة العرض + جوالان، عبر القناة المحلية، مع متسابقين تجريبيين.
// يلتقط صورًا لكل مرحلة ويتحقق من غياب الأخطاء. الاستعمال: node test/rayat.e2e.js [دقائق-افتراضية]
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), OUT = path.join(__dirname, 'e2e'); fs.mkdirSync(OUT, { recursive: true });
const PORT = 8240 + Math.floor(Math.random() * 30);
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0].split('#')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); r.end(d); }); }).listen(PORT);
const URL = `http://localhost:${PORT}/dist/rayat.html`;
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext(); const errs = [];
  const page = async (hash, w, h, tag) => { const p = await ctx.newPage(); await p.setViewportSize({ width: w, height: h }); p.on('pageerror', e => errs.push(tag + ': ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(tag + ' console: ' + m.text().slice(0, 200)); }); await p.goto(URL + '#' + hash, { timeout: 120000 }); return p; };
  const host = await page('host', 1400, 900, 'host');
  await host.waitForSelector('#start', { timeout: 60000 });
  const code = await host.evaluate(() => Host.g.s.code);
  const disp = await page('display-' + code, 1600, 900, 'display');
  const ph1 = await page('join-' + code, 390, 844, 'phone1'), ph2 = await page('join-' + code, 390, 844, 'phone2');
  // الجوالان ينضمان
  for (const [p, nm, t] of [[ph1, 'سعد', 0], [ph2, 'خالد', 1]]) { await p.waitForSelector('#nm', { timeout: 30000 }); await p.fill('#nm', nm); await p.click(`[data-tw="${t}"]`); await p.click('#go'); }
  await host.waitForTimeout(1500); await host.click('#bots');
  await host.waitForTimeout(1000);
  const shot = async (p, name) => { try { await p.screenshot({ path: path.join(OUT, name + '.png'), timeout: 120000 }); } catch (e) { errs.push('shot ' + name + ': ' + e.message.slice(0, 80)); } };
  await shot(host, '00-host-setup'); await disp.mouse.click(800, 450); await disp.waitForTimeout(2500); await shot(disp, '01-display-lobby'); await shot(ph1, '02-phone-lobby');
  await host.click('#start');
  // تسريع الساعة: نجعل المشرف يقفز بالوقت بدل الانتظار الحقيقي، ونلتقط مراحل مختلفة
  const seen = {}; const want = ['phase', 'question', 'reveal', 'orders', 'scene', 'predict', 'buzz', 'judge', 'harvest', 'crown']; let k = 0, iter = 0;
  const maxIter = +process.argv[2] || 1400;
  while (iter++ < maxIter) {
    const st = await host.evaluate(() => { const g = Host.g; return { stage: g.s.stage, ev: g.s.ev && g.s.ev.k, left: g.left() }; });
    // القائد على الجوال 1 يختار أمرًا حقيقيًا من الواجهة
    if (st.stage === 'orders' && !seen['orders-phone']) { await ph1.waitForTimeout(800); const opt = await ph1.$('[data-opt]'); if (opt) { await opt.click().catch(() => { }); await ph1.waitForTimeout(400); await shot(ph1, '05-phone-orders'); const rd = await ph1.$('[data-ready]'); if (rd) await rd.click().catch(() => { }); seen['orders-phone'] = 1; } }
    if (st.stage === 'question' && !seen['q-phone']) { await ph1.waitForTimeout(600); await shot(ph1, '03-phone-question'); const a = await ph1.$('[data-ans]'); if (a) await a.click().catch(() => { }); const a2 = await ph2.$('[data-ans="1"]'); if (a2) await a2.click().catch(() => { }); seen['q-phone'] = 1; }
    if (st.stage === 'judge') await host.evaluate(() => Host.g.judge(Math.random() < .6));
    if (st.stage === 'buzz' && !seen['buzz-phone']) { await shot(ph1, '07-phone-buzz'); seen['buzz-phone'] = 1; }
    const tag = st.stage + (st.ev ? '-' + st.ev : '');
    if (!seen[tag] && (want.includes(st.stage))) { seen[tag] = 1; await disp.waitForTimeout(st.stage === 'scene' ? 3200 : 1200); await shot(disp, String(10 + k++).padStart(2, '0') + '-display-' + tag); if (['question', 'orders', 'predict', 'crown'].includes(st.stage)) await shot(host, String(10 + k).padStart(2, '0') + '-host-' + tag); }
    if (st.stage === 'crown') break;
    // تقديم الوقت: نختصر انتظار المؤقتات
    await host.evaluate(() => { const g = Host.g; if (g.s.deadline && !['judge'].includes(g.s.stage)) g.s.deadline = Math.min(g.s.deadline, Date.now() + 300); if (g.s.phaseStart) g.s.phaseStart -= 20000; g.tick(); });
    await host.waitForTimeout(350);
  }
  await disp.waitForTimeout(2500); await shot(disp, '99-display-final'); await shot(ph1, '98-phone-final');
  const summary = await host.evaluate(() => ({ stage: Host.g.s.stage, cycle: Host.g.s.cycle, winner: Host.g.s.winner, players: Object.keys(Host.g.s.players).length, log: Host.g.s.log.slice(-6).map(x => x.text) }));
  console.log(JSON.stringify(summary)); console.log('stages seen', Object.keys(seen).join(' ')); const real = errs.filter(e => !/WebSocket connection/.test(e)); console.log('errors', real.length, real.slice(0, 10));
  await b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
