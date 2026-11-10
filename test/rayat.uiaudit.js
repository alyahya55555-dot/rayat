// فحص الزحمة في الجوال ولوحة المشرف على مقاسات كثيرة وفي كل مرحلة: لا تمرير أفقي، لا نص يفيض، لا نص فوق نص
// الاستعمال: node test/rayat.uiaudit.js
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), OUT = path.join(__dirname, 'uiaudit'); fs.mkdirSync(OUT, { recursive: true });
const PORT = 8520 + Math.floor(Math.random() * 40);
http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0].split('#')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(d); }); }).listen(PORT);
const URL = `http://localhost:${PORT}/dist/rayat.html`;
const PHONE = [[320, 568], [360, 740], [390, 844], [430, 932], [844, 390], [768, 1024]], HOST = [[390, 844], [768, 1024], [1024, 768], [1280, 720], [1920, 1080]];
const AUDIT = () => { const out = [], vw = innerWidth;
  const vis = el => { const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < .2) return false; const b = el.getBoundingClientRect(); return b.width > 1 && b.height > 1; };
  if (document.documentElement.scrollWidth > vw + 1) out.push(`تمرير أفقي (${document.documentElement.scrollWidth} > ${vw})`);
  document.querySelectorAll('#app *, .modal *').forEach(el => { if (!vis(el) || ['INPUT', 'TEXTAREA', 'SELECT', 'svg', 'path', 'rect', 'g', 'I', 'CANVAS'].includes(el.tagName) || el.closest('svg')) return; const cs = getComputedStyle(el);
    if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0 && !['auto', 'scroll'].includes(cs.overflowX)) out.push(`يفيض عرضًا: ${el.className || el.tagName} «${(el.textContent || '').trim().slice(0, 22)}»`);
    const b = el.getBoundingClientRect(); if (b.right > vw + 1 || b.left < -1) { const sc = el.closest('.tabs,.list'); if (!sc) out.push(`خارج الشاشة: ${el.className || el.tagName} «${(el.textContent || '').trim().slice(0, 22)}»`); } });
  const texts = []; const w = document.createTreeWalker(document.getElementById('app'), NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { if (!n.textContent.trim() || !vis(n.parentElement)) continue; const r = document.createRange(); r.selectNodeContents(n); [...r.getClientRects()].forEach(b => b.width > 1 && texts.push({ b, p: n.parentElement, t: n.textContent.trim().slice(0, 14) })); }
  const ov = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left) - 2) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) - 2);
  for (let i = 0; i < texts.length && i < 400; i++) for (let j = i + 1; j < texts.length && j < 400; j++) if (texts[i].p !== texts[j].p && ov(texts[i].b, texts[j].b) > 6) out.push(`نص فوق نص: «${texts[i].t}» × «${texts[j].t}»`);
  return [...new Set(out)]; };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext(); const errs = [];
  const page = async (hash, w, h, tag) => { const p = await ctx.newPage(); await p.setViewportSize({ width: w, height: h }); p.on('pageerror', e => errs.push(tag + ': ' + e.message)); await p.goto(URL + '#' + hash, { timeout: 120000 }); return p; };
  const host = await page('host', 1280, 800, 'host'); await host.waitForSelector('#start', { timeout: 60000 });
  await host.evaluate(() => { Host.cfg.n = 6; Host.cfg.teams[5].name = 'الأفق الواسع'; Host.newGame(); Host.lastHtml = ''; Host.render(); Host.net.joinRoom(Host.g.s.code); Host.broadcast(); });
  const code = await host.evaluate(() => Host.g.s.code);
  const ph = await page('join-' + code, 390, 844, 'phone'); await ph.waitForSelector('#nm', { timeout: 30000 });
  const report = {}; let total = 0;
  const cap = async (p, tag, sizes, shot) => { for (const [w, h] of sizes) { await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(350); const iss = await p.evaluate(AUDIT); if (iss.length) { (report[tag] = report[tag] || {})[w + 'x' + h] = iss; total += iss.length; } if (shot && w === shot[0] && h === shot[1]) await p.screenshot({ path: path.join(OUT, tag + '.png'), fullPage: true }); } console.log('✓', tag, report[tag] ? Object.values(report[tag]).flat().length : 'سليم'); };
  await cap(ph, 'phone-join', PHONE, [390, 844]);
  await ph.fill('#nm', 'عبدالرحمن بن محمد'); await ph.click('[data-tw="0"]'); await ph.click('#go'); await ph.waitForTimeout(800);
  await host.evaluate(() => document.getElementById('bots').click()); await host.waitForTimeout(800);
  await cap(ph, 'phone-lobby', PHONE, [390, 844]); await cap(host, 'host-setup', HOST, [1280, 720]);
  await host.evaluate(() => document.getElementById('archive').click()); await host.waitForTimeout(300); await cap(host, 'host-archive', [[390, 844], [1280, 720]]); await host.evaluate(() => document.querySelectorAll('.modal-bg').forEach(m => m.remove()));
  await host.evaluate(() => document.getElementById('start').click()); await host.waitForTimeout(800);
  const want = ['question', 'reveal', 'orders', 'predict', 'buzz', 'judge', 'harvest', 'scene'], seen = {}; let it = 0;
  while (it++ < 2500 && want.some(k => !seen[k])) { const st = await host.evaluate(() => Host.g.s.stage);
    if (want.includes(st) && !seen[st]) { seen[st] = 1; await host.evaluate(() => Host.g.pause(true)); await ph.waitForTimeout(600);
      if (st === 'orders') { const o = await ph.$('[data-opt]'); if (o) { await o.click().catch(() => { }); await ph.waitForTimeout(300); } }
      await cap(ph, 'phone-' + st, PHONE, [390, 844]); await cap(host, 'host-' + st, HOST, [1280, 720]); await host.evaluate(() => Host.g.pause(false)); }
    if (st === 'judge' && seen.judge) await host.evaluate(() => Host.g.judge(Math.random() < .5));
    await host.evaluate(() => { const g = Host.g; if (g.s.deadline && g.s.stage !== 'judge') g.s.deadline = Math.min(g.s.deadline, Date.now() + 200); if (g.s.phaseStart) g.s.phaseStart -= 15000; g.tick(); }); await host.waitForTimeout(150); }
  // البيني والتتويج
  await host.evaluate(() => { const g = Host.g; g.s.stage = 'harvest'; g.biniStart(0, 5); }); await host.waitForTimeout(500); await cap(host, 'host-bini', HOST, [1280, 720]); await cap(ph, 'phone-bini', PHONE, [390, 844]); await host.evaluate(() => Host.g.biniWinner(0));
  await host.evaluate(() => { const g = Host.g; g.s.queue = []; g.crown(); g.changed(); }); await host.waitForTimeout(800);
  if (await host.evaluate(() => Host.g.s.stage) === 'tie') { await host.evaluate(() => { const g = Host.g; g.tieQuestion(); g.changed(); }); await host.waitForTimeout(500); await cap(ph, 'phone-tie', PHONE); await cap(host, 'host-tie', HOST); await host.evaluate(() => { const g = Host.g; g.s.stage = 'crown'; g.s.winner = g.s.tie.teams[0]; g.changed(); }); await host.waitForTimeout(500); }
  await cap(ph, 'phone-crown', PHONE, [390, 844]); await cap(host, 'host-crown', HOST, [1280, 720]);
  await host.evaluate(() => { Host.g.s.stage = 'lobby'; Host.lastHtml = ''; Host.render(); document.getElementById('archive').click(); }); await host.waitForTimeout(300);
  const arc = await host.$('[data-ar="0"]'); if (arc) { await arc.click(); await host.waitForTimeout(400); await cap(host, 'host-memorial', [[390, 844], [1280, 720]], [1280, 720]); }
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
  console.log('مجموع الملاحظات', total, 'أخطاء الصفحات', errs.length, errs.slice(0, 5)); await b.close(); process.exit(0);
})();
