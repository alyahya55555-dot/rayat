// تسجيل مشهد الغزو إطارًا إطارًا (زمن حتمي) ثم دمج الأصوات الحقيقية
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path'), { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..'), MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.woff2': 'font/woff2' };
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0].split('#')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); }).listen(8162);
const FPS = 30, [W, H] = (process.env.SIZE || '1920x1080').split('x').map(Number), OUT = path.join(__dirname, 'frames');
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
(async () => { const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: W, height: H } }); await p.goto('http://localhost:8162/r3d/index.html#manual'); await p.waitForFunction(() => window.R); await p.evaluate(() => R.ready);
  // اللافتة تعتمد على انتقالات CSS؛ نلغيها كي يتطابق الإطار مع الزمن، ونحرك اللافتة يدويًا
  await p.addStyleTag({ content: '.banner{transition:none!important}' });
  const T = await p.evaluate(() => R.T), N = Math.round((T.end + 1) * FPS);
  for (let i = 0; i < N; i++) { const t = i / FPS; await p.evaluate(t => { R.renderAt(t); const b = document.getElementById('banner'), on = b.classList.contains('on'); const k = Math.min(1, ((t % 100) - (t < R.T.clash[1] ? R.T.start : R.T.raise[0])) / .5); b.style.opacity = on ? Math.max(0, k) : 0; b.style.transform = `translate(-50%,${on ? (1 - Math.max(0, k)) * 24 : 24}px)`; }, t);
    await p.screenshot({ path: path.join(OUT, String(i).padStart(4, '0') + '.jpg'), type: 'jpeg', quality: 92 }); if (i % 30 === 0) console.log('frame', i, '/', N); }
  await b.close(); srv.close(); fs.writeFileSync(path.join(__dirname, 'frames.json'), JSON.stringify({ T, N, FPS }));
  // الأصوات: محيط طبيعي خافت، خطوات أثناء الزحف، التحام، رفرفة الراية، غرس الراية
  const S = f => path.join(ROOT, 'assets/sfx', f + '.mp3'), ev = [];
  for (let t = T.march[0]; t < T.march[1]; t += .36) ev.push(['step', t, .55]);
  for (let t = T.clash[0]; t < T.clash[1] - .2; t += .23) ev.push([['hit', 'wood-hit', 'impact'][Math.round(t * 10) % 3], t, .8]);
  ev.push(['break', T.clash[1] - .1, .7], ['swish', T.lower[0] + .1, .7], ['swish', T.raise[0] + .2, .8], ['land', T.raise[1] - .1, .9]);
  const inputs = [`-i "${S('nature')}"`, ...ev.map(e => `-i "${S(e[0])}"`)].join(' ');
  const fil = [`[0:a]atrim=0:${T.end + 1},volume=0.22[a0]`, ...ev.map((e, i) => `[${i + 1}:a]adelay=${Math.round(e[1] * 1000)}|${Math.round(e[1] * 1000)},volume=${e[2]}[a${i + 1}]`), `${ev.map((_, i) => `[a${i + 1}]`).join('')}[a0]amix=inputs=${ev.length + 1}:normalize=0,alimiter=limit=0.9[aout]`].join(';');
  execSync(`ffmpeg -y -loglevel error ${inputs} -filter_complex "${fil}" -map "[aout]" -t ${T.end + 1} ${path.join(__dirname, 'audio.m4a')}`);
  execSync(`ffmpeg -y -loglevel error -framerate ${FPS} -i ${OUT}/%04d.jpg -i ${path.join(__dirname, 'audio.m4a')} -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p -c:a aac -b:a 160k -shortest -movflags +faststart ${path.join(__dirname, 'out/invasion.mp4')}`);
  console.log('done');
})();
