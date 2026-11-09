// لقطات شاشة العرض في لحظاتها المهمة عبر التشغيل التجريبي: node display.shots.js [مجلد]
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const out = process.argv[2] || path.join(__dirname, 'shots'); fs.mkdirSync(out, { recursive: true });
const page0 = 'file://' + path.join(__dirname, '..', 'demo.html');
(async () => {
  const b = await chromium.launch(), errs = [];
  const open = async (q) => { const p = await b.newPage({ viewport: { width: 1920, height: 1080 } }); p.on('pageerror', x => errs.push(x.message)); p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_|net::|Fetch API cannot load file/.test(m.text())) errs.push(m.text()); }); await p.goto(page0 + q); return p; };
  const until = (p, fn, ms = 120000) => p.waitForFunction(fn, null, { timeout: ms, polling: 100 });
  const shot = async (p, name, wait = 0) => { if (wait) await p.waitForTimeout(wait); await p.screenshot({ path: path.join(out, name + '.png') }); console.log('📸', name); };

  let p = await open('?speed=3');
  await shot(p, '01-lobby', 600);
  await until(p, () => E.s.phase === 1 && document.querySelector('.rd-card.on')); await shot(p, '02-phase-card', 900);
  await until(p, () => E.s.step === 'question' && E.s.q && Object.keys(E.s.q.ans).length > 8); await shot(p, '03-question');
  await until(p, () => E.s.step === 'orders'); await shot(p, '04-orders', 600);
  await until(p, () => E.s.step === 'resolve' && E.s.turn.res.some(x => x.k === 'occupy' && !x.fb)); await p.evaluate(() => { window.go(0); }); await shot(p, '05-march', 350);
  await until(p, () => E.s.step === 'harvest'); await shot(p, '06-harvest', 250);
  await p.close();

  p = await open('?speed=2&skip=war');
  await until(p, () => E.s.step === 'duel' && E.s.duel.sub === 'predict'); await shot(p, '07-duel-predict', 1400);
  await until(p, () => E.s.step === 'duel' && E.s.duel.sub === 'answer'); await shot(p, '08-duel-buzz', 300);
  await until(p, () => E.s.step === 'duel' && E.s.duel.sub === 'end'); await shot(p, '09-duel-end', 700);
  await p.close();

  p = await open('?speed=30&skip=final');
  await until(p, () => E.s.step === 'crown', 240000);
  await p.evaluate(() => { window.__sp = 1; }); await shot(p, '10-replay', 4000);
  await until(p, () => /ألقاب/.test(document.querySelector('.rd-card').textContent), 60000); await shot(p, '11-titles', 3500);
  await until(p, () => /البطل/.test(document.querySelector('.rd-card').textContent), 60000); await shot(p, '12-champion', 800);
  await p.close(); await b.close();
  console.log(errs.length ? 'أخطاء:\n' + [...new Set(errs)].join('\n') : 'بلا أخطاء');
})();
