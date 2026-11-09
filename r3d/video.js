// تسجيل مشهد الغزو إطارًا إطارًا (زمن حتمي) ثم دمج الأصوات الحقيقية
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path'), { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..'), MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.woff2': 'font/woff2' };
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0].split('#')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); }).listen(8162);
const FPS = 30, [W, H] = (process.env.SIZE || '1920x1080').split('x').map(Number), OUT = path.join(__dirname, 'frames');
const AO = !!process.env.AUDIO_ONLY; if (!AO) { fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true }); }
(async () => { let T; if (AO) { T = JSON.parse(fs.readFileSync(path.join(__dirname, 'frames.json'))).T; srv.close(); } else {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: W, height: H } }); await p.goto('http://localhost:8162/r3d/index.html#manual'); await p.waitForFunction(() => window.R); await p.evaluate(() => R.ready);
  // اللافتة تعتمد على انتقالات CSS؛ نلغيها كي يتطابق الإطار مع الزمن، ونحرك اللافتة يدويًا
  await p.addStyleTag({ content: '.banner{transition:none!important}' });
  T = await p.evaluate(() => R.T); const N = Math.round((T.end + 1) * FPS);
  for (let i = 0; i < N; i++) { const t = i / FPS; await p.evaluate(t => { R.renderAt(t); const b = document.getElementById('banner'), on = b.classList.contains('on'); const k = Math.min(1, ((t % 100) - (t < R.T.clash[1] ? R.T.start : R.T.raise[0])) / .5); b.style.opacity = on ? Math.max(0, k) : 0; b.style.transform = `translate(-50%,${on ? (1 - Math.max(0, k)) * 24 : 24}px)`; }, t);
    await p.screenshot({ path: path.join(OUT, String(i).padStart(4, '0') + '.jpg'), type: 'jpeg', quality: 92 }); if (i % 30 === 0) console.log('frame', i, '/', N); }
  await b.close(); srv.close(); fs.writeFileSync(path.join(__dirname, 'frames.json'), JSON.stringify({ T, N, FPS }));
  }
  // الأصوات الحقيقية: محيط، زحف المشاة ووقع الحوافر، صهيل، صليل السيوف والرماح والدروع، ثم الراية
  const S = f => path.join(ROOT, 'assets/sfx', f + '.mp3'), ev = []; let sd = 7; const rr = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  const [m0, m1] = T.march, [c0, c1] = T.clash;
  for (let t = m0 - .1, i = 0; t < m1 + .2; t += 1.75, i++) ev.push(['w-march' + (i % 2 + 1), t, 2.4]);
  for (let t = m0, i = 0; t < m1 + .3; t += 1.7, i++) ev.push(['w-hooves' + (i % 2 + 1), t, 1.5]);
  ev.push(['w-neigh2', m0 + .15, .8], ['w-snort1', m0 + 2.2, .5], ['w-neigh3', c0 - .25, 1]);
  for (let t = c0, i = 0; t < c1; t += .15 + rr() * .14, i++) { const k = i % 4; ev.push([k === 0 ? 'w-clash' + (1 + i % 4) : k === 1 ? 'w-sword' + (1 + i % 3) : k === 2 ? 'w-shield' + (1 + i % 2) : 'w-spear' + (1 + i % 2), t, k === 0 ? 3.6 : 2.6]); }
  ev.push(['w-clash4', c1 - .15, 3.2], ['impact', c1, .3], ['swish', T.lower[0] + .1, .6], ['swish', T.raise[0] + .2, .7], ['land', T.raise[1] - .1, .3], ['w-neigh1', T.raise[1] + .2, .55]);
  const inputs = [`-i "${S('nature')}"`, ...ev.map(e => `-i "${S(e[0])}"`)].join(' ');
  const fil = [`[0:a]atrim=0:${T.end + 1},volume=0.2[a0]`, ...ev.map((e, i) => `[${i + 1}:a]adelay=${Math.round(e[1] * 1000)}|${Math.round(e[1] * 1000)},volume=${e[2]}[a${i + 1}]`), `${ev.map((_, i) => `[a${i + 1}]`).join('')}[a0]amix=inputs=${ev.length + 1}:normalize=0,volume=1.5,alimiter=limit=0.9[aout]`].join(';');
  execSync(`ffmpeg -y -loglevel error ${inputs} -filter_complex "${fil}" -map "[aout]" -t ${T.end + 1} ${path.join(__dirname, 'audio.m4a')}`);
  execSync(`ffmpeg -y -loglevel error -framerate ${FPS} -i ${OUT}/%04d.jpg -i ${path.join(__dirname, 'audio.m4a')} -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p -c:a aac -b:a 160k -shortest -movflags +faststart ${path.join(__dirname, 'out/invasion.mp4')}`);
  console.log('done');
})();
