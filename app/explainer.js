// تسجيل فيديو الشرح (≈ دقيقتان) إطارًا إطارًا بزمن حتمي، ثم مزج الأصوات الحقيقية المرخّصة نفسها التي تستعملها المنصة
// الاستعمال: node app/explainer.js   → app/out/explainer.mp4   (SIZE=1920x1080 اختياريًا)
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..'), OUT = path.join(__dirname, 'out'), FR = path.join(OUT, 'xframes'), FPS = 30;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.woff2': 'font/woff2' };
const PRE = process.env.PREVIEW ? process.env.PREVIEW.split(',').map(x => Math.round(+x * 30)) : null;
const [Wd, Hd] = (process.env.SIZE || '1280x720').split('x').map(Number);
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); }).listen(8563);
(async () => {
  let log, dur;
  if (!process.env.AUDIO_ONLY) {
    fs.rmSync(FR, { recursive: true, force: true }); fs.mkdirSync(FR, { recursive: true });
    const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
    const p = await b.newPage({ viewport: { width: Wd, height: Hd } }); p.on('pageerror', e => console.log('ERR', e.message));
    await p.goto('http://localhost:8563/app/explainer.html'); await p.waitForFunction(() => window.READY, null, { timeout: 120000 }); await p.evaluate(() => READY);
    const t0 = await p.evaluate(() => { const t = W.time; SEQ(); return t; }); let i = 0;
    while (i < 160 * FPS) { const done = await p.evaluate(() => { W.step(1 / 30); tick(); return !!window.SEQ_DONE; }); await p.waitForTimeout(0);
      if (!PRE || PRE.includes(i)) await p.screenshot({ path: path.join(FR, String(i).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 92 }); i++; if (i % 150 === 0) console.log('frame', i); if (done) break; }
    log = (await p.evaluate(() => SFX_LOG)).map(e => ({ ...e, t: e.t - t0 })); dur = i / FPS; fs.writeFileSync(path.join(OUT, 'explainer.json'), JSON.stringify({ log, dur }));
    await b.close(); if (PRE) { console.log('preview done', dur); process.exit(0); }
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(FR, '%05d.jpg'), '-c:v', 'libx264', '-crf', '18', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', path.join(OUT, 'explainer.video.tmp.mp4')]);
    fs.renameSync(path.join(OUT, 'explainer.video.tmp.mp4'), path.join(OUT, 'explainer.video.mp4'));
  } else ({ log, dur } = JSON.parse(fs.readFileSync(path.join(OUT, 'explainer.json'))));
  srv.close();
  // الأصوات: نشغّل منطق sfx.js نفسه لكن بتسجيل الاستدعاءات، ثم نمزجها بدقة العينات
  const calls = []; const src = fs.readFileSync(path.join(ROOT, 'app/sfx.js'), 'utf8').replace("'%%SFX%%'", 'null');
  const SFX = new Function(src + '; return SFX;')(); SFX.ready = () => true; SFX.rec = (k, v = .9, at = 0, rate = 1) => { calls.push({ k, v, at, rate }); return {}; };
  log.forEach(e => SFX.play(e.k, e.t, e.dur)); calls.push({ k: 'nature', v: .14, at: 0, rate: 1, loop: true });
  const SR = 44100, N = Math.ceil((dur + .5) * SR), mix = new Float32Array(N), cache = {};
  const pcm = k => { if (cache[k]) return cache[k]; const f = path.join(ROOT, 'assets/sfx', k + '.mp3'); if (!fs.existsSync(f)) return (cache[k] = null); const raw = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', f, '-f', 'f32le', '-ac', '1', '-ar', String(SR), '-'], { maxBuffer: 1 << 28 }); return (cache[k] = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4)); };
  let missing = new Set(); calls.forEach(c => { const a = pcm(c.k); if (!a) { missing.add(c.k); return; } const start = Math.round(c.at * SR); if (c.loop) { for (let i = 0; i < N; i++) mix[i] += a[i % a.length] * c.v; return; }
    for (let j = 0; ; j++) { const pos = j * c.rate; if (pos >= a.length - 1) break; const i = start + j; if (i >= N) break; if (i < 0) continue; const k0 = Math.floor(pos), fr = pos - k0; mix[i] += (a[k0] * (1 - fr) + a[k0 + 1] * fr) * c.v * .55; } });
  for (let i = 0; i < N; i++) mix[i] = Math.tanh(mix[i] * 1.1) * .92;
  const buf = Buffer.alloc(44 + N * 2); buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 2, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(N * 2, 40);
  for (let i = 0; i < N; i++) buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(mix[i] * 32767))), 44 + i * 2);
  fs.writeFileSync(path.join(OUT, 'explainer.wav'), buf);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(OUT, 'explainer.video.mp4'), '-i', path.join(OUT, 'explainer.wav'), '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', path.join(OUT, 'explainer.tmp.mp4')]);
  fs.renameSync(path.join(OUT, 'explainer.tmp.mp4'), path.join(OUT, 'explainer.mp4'));
  console.log('done', dur.toFixed(1) + 's', 'sounds', calls.length, 'missing', [...missing]);
  process.exit(0);
})();
