// يجمع «رايات» في ملف HTML واحد: dist/rayat.html  —  node build-rayat.js "<رابط الصفحة المنشورة>"
const fs = require('fs'), path = require('path'), R = p => fs.readFileSync(path.join(__dirname, p), 'utf8');
const url = process.argv[2] || '%%ARTIFACT_URL%%';
const fonts = [['TDisplay', 'thmanyahserifdisplay', [['Bold', 700], ['Black', 900]]], ['TText', 'thmanyahseriftext', [['Regular', 400], ['Bold', 700]]], ['TSans', 'thmanyahsans', [['Regular', 400], ['Medium', 500], ['Bold', 700], ['Black', 900]]]]
  .flatMap(([fam, dir, ws]) => ws.map(([w, n]) => `@font-face{font-family:'${fam}';src:url(data:font/woff2;base64,${fs.readFileSync(path.join(__dirname, 'fonts', dir, 'woff2', dir + '-' + w + '.woff2')).toString('base64')}) format('woff2');font-weight:${n};font-display:block}`)).join('\n');
// تُضمَّن العينات المستعملة فعلًا في sfx.js فقط (غير المستعملة تبقى في المستودع ولا تُحمَّل)
const sfxUsed = new Set((fs.readFileSync(path.join(__dirname, 'app/sfx.js'), 'utf8').match(/'[\w-]+'/g) || []).map(x => x.slice(1, -1)));
const sfx = {}; fs.readdirSync(path.join(__dirname, 'assets/sfx')).filter(f => f.endsWith('.mp3') && sfxUsed.has(f.replace('.mp3', ''))).forEach(f => { sfx[f.replace('.mp3', '')] = fs.readFileSync(path.join(__dirname, 'assets/sfx', f)).toString('base64'); });
const libs = [R('vendor/package/qrcode.js'), R('vendor/paho/package/paho-mqtt-min.js'), R('proto/rayat-map.js'), R('game/rules.js'), R('app/bank-more.js'), R('app/data.js'), R('app/game.js'), R('app/world.js')].join('\n;\n');
let app = ['app/net.js', 'app/sfx.js', 'app/guide.js', 'app/manual.js', 'app/ui-display.js', 'app/ui-phone.js', 'app/ui-host.js', 'app/main.js'].map(R).join('\n;\n');
app = app.replace("'%%ARTIFACT_URL%%'", JSON.stringify(url)).replace("'%%SFX%%'", JSON.stringify(sfx));
const parts = { '/*FONTS*/': fonts, '/*CSS*/': R('app/ui.css'), '/*VENDOR*/': R('app/vendor.min.js'), '/*LIBS*/': libs, '/*APP*/': app };
let h = R('app/index.tpl.html'); for (const k in parts) { const i = h.indexOf(k); h = h.slice(0, i) + parts[k].replace(/<\/script/gi, '<\\/script') + h.slice(i + k.length); }
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true }); fs.writeFileSync(path.join(__dirname, 'dist/rayat.html'), h); console.log('built dist/rayat.html', (h.length / 1e6).toFixed(2) + ' MB');
