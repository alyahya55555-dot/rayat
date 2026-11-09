const { chromium } = require('/opt/npm-tools/node_modules/playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1500, height: 1000 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + __dirname + '/phones.html'); await p.waitForTimeout(800); await p.screenshot({ path: __dirname + '/out-phones.png' }); console.log(errs.length ? errs : 'ok'); await b.close(); })();
