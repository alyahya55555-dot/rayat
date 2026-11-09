const { chromium } = require('/opt/npm-tools/node_modules/playwright/index.js');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1920, height: 1080 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  for (const m of process.argv.slice(2)) { await p.goto('file://' + __dirname + '/mock.html#' + m); await p.reload(); await p.waitForTimeout(700); await p.screenshot({ path: __dirname + '/out-' + m + '.png' }); }
  console.log(errs.length ? errs : 'ok'); await b.close(); })();
