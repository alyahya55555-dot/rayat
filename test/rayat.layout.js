// فحص الزحمة والوضوح: شاشة العرض (داخل لوحة المشرف «اعرض الخريطة هنا») والجوال ولوحة المشرف، على مقاسات كثيرة ومراحل كثيرة.
// يفحص آليًا: خروج عن الشاشة، تراكب الكتل، فيض النص داخل البطاقات، تراكب أسماء الخريطة مع بعضها ومع البطاقات.
// الاستعمال: node test/rayat.layout.js [عدد الفرق=6] [shots=1]
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), OUT = path.join(__dirname, 'layout'); fs.mkdirSync(OUT, { recursive: true });
const NT = +process.argv[2] || 6, SHOTS = process.argv[3] !== '0';
const PORT = 8300 + Math.floor(Math.random() * 40);
http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0].split('#')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(d); }); }).listen(PORT);
const URL = `http://localhost:${PORT}/dist/rayat.html`;
const SIZES = [[360, 740], [390, 844], [430, 932], [740, 360], [844, 390], [768, 1024], [1024, 768], [800, 600], [1280, 720], [1366, 768], [1440, 900], [1920, 1080]];
const SHOT_SIZES = (process.env.SHOTS || '390x844,1366x768').split(',');

// يُحقن في الصفحة
const AUDIT = () => {
  const vw = innerWidth, vh = innerHeight, out = []; try { if (typeof Display !== 'undefined' && Display.W) { Display.fit(); Display.reserve(); Display.W.step(.001); } } catch (e) { }
  const vis = el => { if (!el) return false; const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < .2) return false; const b = el.getBoundingClientRect(); return b.width > 1 && b.height > 1; };
  const ov = (a, b, m = 1) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left) - m) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) - m);
  const L = document.getElementById('maplayer'); if (!L || L.style.display === 'none') return ['no map layer'];
  const blocks = [...L.querySelectorAll('.dsp .brand, #phase, #dom, .card, .sndbox, #mapctl')].filter(el => !el.classList.contains('hide') && vis(el)).map(el => ({ el, n: el.id || el.className.split(' ')[0], b: el.getBoundingClientRect() }));
  blocks.forEach(x => { const b = x.b; if (b.left < -1 || b.top < -1 || b.right > vw + 1 || b.bottom > vh + 1) out.push(`خارج الشاشة: ${x.n} [${b.left | 0},${b.top | 0},${b.right | 0},${b.bottom | 0}]`); });
  for (let i = 0; i < blocks.length; i++) for (let j = i + 1; j < blocks.length; j++) { if (blocks[i].el.contains(blocks[j].el) || blocks[j].el.contains(blocks[i].el)) continue; if (ov(blocks[i].b, blocks[j].b) > 0) out.push(`تراكب: ${blocks[i].n} × ${blocks[j].n}`); }
  // فيض داخل البطاقات والعناصر
  blocks.forEach(x => { const el = x.el; if (el.scrollHeight > el.clientHeight + 3 || el.scrollWidth > el.clientWidth + 3) out.push(`فيض داخل ${x.n} (${el.scrollWidth}x${el.scrollHeight} > ${el.clientWidth}x${el.clientHeight})`);
    el.querySelectorAll('*').forEach(c => { if (!vis(c)) return; if (c.scrollWidth > c.clientWidth + 3 && getComputedStyle(c).overflowX !== 'auto' && c.clientWidth > 0 && !['I', 'svg'].includes(c.tagName)) out.push(`نص يفيض: ${x.n} > ${c.className || c.tagName} «${(c.textContent || '').trim().slice(0, 24)}»`);
      const b = c.getBoundingClientRect(); if (b.width > 1 && (b.left < x.b.left - 2 || b.right > x.b.right + 2 || b.top < x.b.top - 2 || b.bottom > x.b.bottom + 2)) out.push(`عنصر خارج ${x.n}: ${c.className || c.tagName} «${(c.textContent || '').trim().slice(0, 24)}»`); }); });
  // تراكب النصوص (أسطر نصية من عناصر مختلفة)
  const texts = []; blocks.forEach(x => { const w = document.createTreeWalker(x.el, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { if (!n.textContent.trim() || !vis(n.parentElement)) continue; const r = document.createRange(); r.selectNodeContents(n); [...r.getClientRects()].forEach(b => b.width > 1 && texts.push({ b, p: n.parentElement, t: n.textContent.trim().slice(0, 16) })); } });
  for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) { if (texts[i].p === texts[j].p) continue; if (ov(texts[i].b, texts[j].b, 2) > 6) out.push(`نص فوق نص: «${texts[i].t}» × «${texts[j].t}»`); }
  // أسماء الخريطة
  const D = typeof Display !== 'undefined' ? Display : null, W = D && D.W; if (W && W.labelRects) { const R = W.labelRects().map(r => ({ left: r.x0, right: r.x1, top: r.y0, bottom: r.y1, id: r.id }));
    for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) if (ov(R[i], R[j]) > 0) out.push(`اسمان متراكبان على الخريطة: ${R[i].id} × ${R[j].id}`);
    R.forEach(r => blocks.forEach(x => { if (ov(r, x.b) > 0) out.push(`اسم على الخريطة تحت ${x.n}: ${r.id}`); })); }
  return [...new Set(out)];
};

(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext(); const errs = [];
  const p = await ctx.newPage(); await p.setViewportSize({ width: 1366, height: 768 });
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/WebSocket/.test(m.text())) errs.push(m.text().slice(0, 200)); });
  await p.goto(URL + '#host'); await p.waitForSelector('#start', { timeout: 60000 });
  await p.evaluate(n => { Host.cfg.n = n; Host.newGame(); Host.lastHtml = ''; Host.render(); }, NT);
  await p.click('#bots'); await p.waitForTimeout(400);
  const report = {}; let total = 0;
  const capture = async tag => {
    await p.evaluate(() => Host.g.pause(true));
    for (const [w, h] of SIZES) { await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(900);
      const iss = await p.evaluate(AUDIT); const key = `${w}x${h}`; if (iss.length) { (report[tag] = report[tag] || {})[key] = iss; total += iss.length; }
      if (SHOTS && SHOT_SIZES.includes(key)) await p.screenshot({ path: path.join(OUT, `${tag}-${key}.png`), timeout: 120000 }).catch(e => errs.push('shot ' + e.message.slice(0, 60))); }
    await p.setViewportSize({ width: 1366, height: 768 }); await p.evaluate(() => Host.g.pause(false)); fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1)); console.log('✓', tag, report[tag] ? Object.values(report[tag]).flat().length + ' ملاحظة' : 'سليم');
  };
  await p.click('#maphere'); await p.waitForTimeout(1500); await p.evaluate(() => { const o = document.getElementById('tapov'); if (o) o.remove(); }); await p.waitForTimeout(3000);
  await capture('lobby');
  await p.evaluate(() => { Host.showMap(false); document.getElementById('start').click(); }); await p.waitForTimeout(800); await p.evaluate(() => Host.showMap(true));
  const want = ['phase', 'question', 'reveal', 'orders', 'scene-batch', 'scene-attack', 'scene-occupy', 'predict', 'buzz', 'judge', 'point', 'harvest', 'gq'], seen = {}; let it = 0, biniDone = false;
  while (it++ < 1500) {
    const st = await p.evaluate(() => { const g = Host.g; return { s: g.s.stage, ev: g.s.ev && g.s.ev.k, playing: Display.playing }; });
    const tag = st.s === 'scene' ? 'scene-' + st.ev : st.s;
    if (want.includes(tag) && !seen[tag]) { seen[tag] = 1; await p.waitForTimeout(st.s === 'scene' ? 2500 : 1200); await capture(tag); }
    if (st.s === 'judge') await p.evaluate(() => Host.g.judge(Math.random() < .5));
    if (st.s === 'harvest' && !biniDone && seen.harvest) { biniDone = true; await p.evaluate(() => { Host.g.biniStart(0, 3); }); await p.waitForTimeout(1200); await capture('bini'); await p.evaluate(() => { Host.g.biniWinner(0); }); }
    if (want.every(k => seen[k] || k === 'gq' || k === 'point') && biniDone) break;
    await p.evaluate(() => { const g = Host.g; if (g.s.deadline && g.s.stage !== 'judge') g.s.deadline = Math.min(g.s.deadline, Date.now() + 250); if (g.s.phaseStart) g.s.phaseStart -= 15000; g.tick(); });
    await p.waitForTimeout(300);
  }
  // التتويج
  await p.evaluate(() => { const g = Host.g; g.s.queue = []; g.crown(); g.changed(); }); await p.waitForTimeout(1500);
  const crownSt = await p.evaluate(() => Host.g.s.stage); if (crownSt === 'tie') { await p.evaluate(() => { const g = Host.g; g.tieQuestion(); g.changed(); }); await p.waitForTimeout(1000); await capture('tie'); await p.evaluate(() => { const g = Host.g; g.s.stage = 'crown'; g.s.winner = g.s.tie.teams[0]; g.changed(); }); await p.waitForTimeout(1000); }
  await capture('crown');
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
  console.log('مجموع الملاحظات', total, 'أخطاء الصفحة', errs.length, errs.slice(0, 5));
  await b.close(); process.exit(0);
})();
