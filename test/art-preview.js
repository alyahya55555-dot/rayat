// معاينة رسم الجزيرة بمستويات بناء مختلفة
const { chromium } = require('playwright'); const http = require('http'), fs = require('fs');
const html = fs.readFileSync(__dirname + '/../dist/index.html');
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); }).listen(8151);
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1920, height: 1080 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/fonts\./, r => r.fulfill({ status: 200, body: '' }));
  await p.goto('http://localhost:8151/#display-0000'); await p.waitForTimeout(500);
  const variants = JSON.parse(process.argv[2] || '[[4,0],[4,1],[4,2],[3,1],[2,2]]');
  for (const [n, mode] of variants) {
    await p.evaluate(([n, mode]) => {
      const cols = ['#2f80ed', '#27ae60', '#f2994a', '#9b51e0'], names = ['الوفاء', 'النماء', 'الإخاء', 'العطاء'];
      const lvl = [{}, { house: 1, farm: 1, wall: 1, tower: 1 }, { house: 2, farm: 2, market: 2, wall: 2, tower: 2, well: 2 }];
      const C = plotCenters(n);
      const plots = C.map(([x, y], i) => plotSVG({ id: 't' + (i + 1), color: cols[i], theme: D.THEME_KEYS[i], name: names[i] }, i, x, y, { levels: mode === 1 ? lvl[(i % 3)] : lvl[mode], pole: { h: [176, 120, 80, 50][i], lead: i === 0 }, gold: [140, 60, 20, 0][i], shield: i === 1, off: i === 2 ? { farm: 1, house: 1 } : {} })).join('');
      document.body.innerHTML = `<svg viewBox="0 0 1920 1080" width="1920" height="1080" style="position:fixed;inset:0">${islandBase(n)}${plots}</svg>`;
    }, [n, mode]);
    await p.waitForTimeout(300); await p.screenshot({ path: __dirname + `/shots-art/isl-${n}-${mode}.png` });
  }
  await p.evaluate(() => { const cols = ['#2f80ed', '#27ae60', '#f2994a', '#9b51e0']; document.body.innerHTML = `<div style="display:grid;grid-template-columns:repeat(4,460px);gap:8px;background:#222">${D.THEME_KEYS.map((k, i) => villageSVG({ id: 't' + (i + 1), color: cols[i], theme: k, name: 'قرية ' + (i + 1) }, i % 2 ? { house: 2, farm: 1, market: 2, wall: 2, tower: 2, well: 1 } : { house: 1, wall: 1 }, { labels: true })).join('')}</div>`; document.querySelectorAll('svg').forEach(s => s.style.width = '460px'); });
  await p.waitForTimeout(200); await p.screenshot({ path: __dirname + '/shots-art/villages.png', clip: { x: 0, y: 0, width: 1880, height: 300 } });
  console.log(errs.length ? errs : 'ok'); await b.close(); srv.close();
})();
