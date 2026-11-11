// حصر عينات الصوت: لكل عينة المدة والمستوى ومؤشر «نغمية» (هل فيها نغمة ثابتة طويلة قد تدل على موسيقى أو صوت بشري)، وأين تُستعمل.
// هذا فحص برمجي للإشارة لا مراجعة سمعية. الاستعمال: node test/rayat.sfx.audit.js [--json]
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..'), DIR = path.join(ROOT, 'assets/sfx'), SR = 22050;
const sfxSrc = fs.readFileSync(path.join(ROOT, 'app/sfx.js'), 'utf8');
// مفاتيح play وما تستدعيه من عينات
const plays = {}; { const re = /^\s*case '([\w-]+)':([\s\S]*?)(?=^\s*case '|^\s*default:|^\s*}\s*}\s*catch)/gm; let m; while ((m = re.exec(sfxSrc))) { const names = new Set(); (m[2].match(/'([\w-]+)'/g) || []).forEach(x => names.add(x.slice(1, -1))); plays[m[1]] = [...names]; } } // الحالة قد تمتد عدة أسطر
const ambientUsed = /rec\('nature'/.test(sfxSrc);
// أين يُطلب كل مفتاح أثناء اللعب
const appSrc = ['world.js', 'ui-display.js', 'ui-phone.js', 'ui-host.js', 'game.js'].map(f => [f, fs.readFileSync(path.join(ROOT, 'app', f), 'utf8')]);
const called = {}; appSrc.forEach(([f, s]) => { (s.match(/(?:SFX\.play\(|sfx', \{ k: )([^,)}]+)/g) || []).forEach(x => { (x.replace(/===\s*'[\w-]+'/g, '').match(/'([\w-]+)'/g) || []).forEach(q => { const k = q.slice(1, -1); (called[k] = called[k] || new Set()).add(f); }); }); });
const files = fs.readdirSync(DIR).filter(f => f.endsWith('.mp3')).map(f => f.replace('.mp3', '')).sort();
const usedBy = {}; Object.entries(plays).forEach(([k, names]) => names.forEach(n => { if (files.includes(n)) (usedBy[n] = usedBy[n] || []).push(k); })); if (ambientUsed) (usedBy.nature = usedBy.nature || []).push('الخلفية');
function analyze(name) { const raw = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', path.join(DIR, name + '.mp3'), '-f', 'f32le', '-ac', '1', '-ar', String(SR), '-'], { maxBuffer: 1 << 28 }); const a = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
  let peak = 0, sq = 0; for (let i = 0; i < a.length; i++) { const v = Math.abs(a[i]); if (v > peak) peak = v; sq += a[i] * a[i]; } const rms = Math.sqrt(sq / Math.max(1, a.length));
  // نغمية: نسبة الإطارات (46 مللي ثانية) ذات دورية قوية بين 80 و1000 هرتز، وأطول نغمة ثابتة متصلة
  const N = 1024, hop = 512, lo = Math.floor(SR / 1000), hi = Math.floor(SR / 80); let voiced = 0, frames = 0, run = 0, best = 0, lastF = 0; const pitches = [];
  for (let o = 0; o + N + hi < a.length; o += hop) { let e = 0; for (let i = 0; i < N; i++) e += a[o + i] * a[o + i]; if (e / N < 1e-5) { run = 0; continue; } frames++; let bl = 0, bv = 0; for (let l = lo; l <= hi; l++) { let c = 0, e2 = 0; for (let i = 0; i < N; i++) { c += a[o + i] * a[o + i + l]; e2 += a[o + i + l] * a[o + i + l]; } const v = c / Math.sqrt(e * e2 + 1e-12); if (v > bv) { bv = v; bl = l; } }
    const f = SR / bl; if (bv > .8) { voiced++; pitches.push(f); if (lastF && Math.abs(f - lastF) / lastF < .04) run++; else run = 1; lastF = f; if (run > best) best = run; } else { run = 0; lastF = 0; } }
  const med = pitches.sort((x, y) => x - y)[Math.floor(pitches.length / 2)] || 0;
  return { dur: a.length / SR, peakDb: 20 * Math.log10(peak + 1e-9), rmsDb: 20 * Math.log10(rms + 1e-9), tonal: frames ? voiced / frames : 0, steady: best * hop / SR, pitch: med }; }
const rows = files.map(n => ({ name: n, ...analyze(n), plays: usedBy[n] || [], live: (usedBy[n] || []).filter(k => k === 'الخلفية' || called[k]) }));
if (process.argv.includes('--json')) { console.log(JSON.stringify({ rows, plays, called: Object.fromEntries(Object.entries(called).map(([k, v]) => [k, [...v]])) })); process.exit(0); }
const f1 = x => x.toFixed(1), pad = (s, n) => String(s).padEnd(n);
console.log(pad('العينة', 15), pad('ث', 6), pad('ذروة dB', 9), pad('نغمية٪', 8), pad('نغمة ثابتة ث', 13), pad('هرتز', 6), 'تُستعمل في');
rows.forEach(r => console.log(pad(r.name, 15), pad(f1(r.dur), 6), pad(f1(r.peakDb), 9), pad(Math.round(r.tonal * 100), 8), pad(r.steady.toFixed(2), 13), pad(Math.round(r.pitch), 6), r.live.join(',') || (r.plays.length ? '(معرّفة بلا استدعاء: ' + r.plays.join(',') + ')' : '— غير مستعملة')));
const unused = rows.filter(r => !r.live.length), deadKeys = Object.keys(plays).filter(k => !called[k]), missing = [...new Set(Object.values(plays).flat())].filter(n => !files.includes(n) && !/^(\d|[a-z]$)/.test(n));
console.log('\nعينات:', rows.length, '| مستعملة فعلًا:', rows.length - unused.length, '| غير مستعملة:', unused.map(r => r.name).join(' ') || 'لا شيء');
console.log('مفاتيح معرّفة بلا استدعاء في اللعب:', deadKeys.join(' ') || 'لا شيء'); console.log('مفاتيح تُطلب بلا تعريف:', Object.keys(called).filter(k => !plays[k]).join(' ') || 'لا شيء'); console.log('عينات مطلوبة وغير موجودة:', missing.join(' ') || 'لا شيء');
const sus = rows.filter(r => r.steady > .6 || (r.tonal > .5 && r.dur > 1.2)); console.log('تحتاج استماعًا بشريًا (نغمة ثابتة طويلة):', sus.map(r => `${r.name}(${r.steady.toFixed(1)}ث@${Math.round(r.pitch)}هرتز)`).join(' ') || 'لا شيء');
