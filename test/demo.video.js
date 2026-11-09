// تسجيل فيديو «التشغيل التجريبي الكامل»: شاشة العرض + جوال قائد حقيقي + صوت المؤثرات الفعلي
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(__dirname + '/../dist/index.html');
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); }).listen(8141);
const OUT = path.join(__dirname, 'demo-video'); fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
// تسجيل الإطارات عبر CDP مع توقيتها الحقيقي (أدق من تسجيل الفيديو المدمج)
async function cast(page, dir, maxW) {
  fs.mkdirSync(dir, { recursive: true }); const cdp = await page.context().newCDPSession(page), list = []; let n = 0;
  cdp.on('Page.screencastFrame', async f => { const fn = String(++n).padStart(6, '0') + '.jpg'; fs.writeFileSync(path.join(dir, fn), Buffer.from(f.data, 'base64')); list.push([fn, f.metadata.timestamp]); cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => { }); });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 82, maxWidth: maxW, maxHeight: 1080, everyNthFrame: 1 });
  return { list, stop: () => cdp.send('Page.stopScreencast').catch(() => { }) };
}
const sleep = ms => new Promise(r => setTimeout(r, ms)); const errs = [];
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.route(/fonts\./, r => r.fulfill({ status: 200, body: '' }));
  ctx.on('page', p => { p.on('pageerror', e => errs.push(e.message)); });
  const host = await ctx.newPage(); await host.setViewportSize({ width: 1440, height: 900 }); await host.goto('http://localhost:8141/#host'); await sleep(900);
  const code = await host.evaluate(() => Host.e.s.code);
  const disp = await ctx.newPage(); await disp.addInitScript(() => { Element.prototype.requestFullscreen = () => Promise.reject(new Error('no')); }); await disp.goto('http://localhost:8141/#display'); await sleep(1200); await disp.mouse.click(640, 360); await sleep(600); const cd = await cast(disp, path.join(OUT, 'd'), 1280);
  const phone = await ctx.newPage(); await phone.setViewportSize({ width: 405, height: 720 });
  await phone.goto('http://localhost:8141/#join-' + code); await phone.fill('#jn', 'عبدالله'); await phone.click('[data-tw="t1"]'); await phone.click('#jgo'); await sleep(1500); const cp = await cast(phone, path.join(OUT, 'p'), 405);
  // تسجيل الصوت الفعلي من مخرج المؤثرات في شاشة العرض
  const ta = await disp.evaluate(() => new Promise(ok => {
    SFX.unlock(); const c = SFX.ctx; const go = () => { const d = c.createMediaStreamDestination(); SFX.master.connect(d); const r = new MediaRecorder(d.stream, { mimeType: 'audio/webm;codecs=opus' }); window.__ch = []; r.ondataavailable = e => window.__ch.push(e.data); r.start(1000); window.__rec = r; ok(Date.now() / 1000); };
    c.state === 'running' ? go() : c.resume().then(go);
  }));
  console.log('audio start', ta, 'ctx', await disp.evaluate(() => SFX.ctx.state));
  await host.evaluate(() => Host.demo(true));
  // الجوال الحقيقي يجيب عن أسئلة الجميع، ويستبق أحيانًا
  let n = 0; const start = Date.now();
  while (Date.now() - start < 15 * 60e3) {
    const st = await host.evaluate(() => ({ on: Host.demoOn, g: Host.e.s.seg && Host.e.s.seg.g, ph: Host.e.s.seg && Host.e.s.seg.phase, a: Host.e.item() && Host.e.item().a }));
    if (!st.on && st.g === 'crown') break;
    if (st.ph === 'open' && st.a != null) { const x = await phone.$(`[data-ans="${Math.random() < .8 ? st.a : (st.a + 1) % 4}"]`); if (x && Math.random() < .5) await x.click().catch(() => { }); }
    if (++n % 20 === 0) console.log(Math.round((Date.now() - start) / 1000) + 's', st.g, st.ph);
    await sleep(700);
  }
  await sleep(2500);
  const b64 = await disp.evaluate(() => new Promise(ok => { const r = window.__rec; r.onstop = async () => { const bl = new Blob(window.__ch, { type: 'audio/webm' }); const u = new Uint8Array(await bl.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); ok(btoa(s)); }; r.stop(); }));
  fs.writeFileSync(path.join(OUT, 'audio.webm'), Buffer.from(b64, 'base64'));
  await cd.stop(); await cp.stop(); await ctx.close(); await b.close(); srv.close();
  fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify({ audioStart: ta, d: cd.list, p: cp.list, errs }));
  console.log('errors:', errs.length ? errs.slice(0, 5) : 'none');
})();
