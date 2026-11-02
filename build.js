const fs=require('fs');const r=p=>fs.readFileSync(__dirname+'/'+p,'utf8');
const url=process.argv[2]||'%%ARTIFACT_URL%%';
const logo='data:image/png;base64,'+fs.readFileSync(__dirname+'/assets/logo-src.png').toString('base64');
let h=r('src/index.tpl.html');
const sfx={};fs.readdirSync(__dirname+'/assets/sfx').filter(f=>f.endsWith('.mp3')).forEach(f=>{sfx[f.replace('.mp3','')]=fs.readFileSync(__dirname+'/assets/sfx/'+f).toString('base64');});
const app=['app-core.js','app-net.js','app-student.js','app-host.js','app-war.js','app-main.js'].map(f=>r('src/'+f)).join('\n').replace("'%%ARTIFACT_URL%%'",JSON.stringify(url)).replace("'%%LOGO%%'",JSON.stringify(logo)).replace("'%%SFX%%'",JSON.stringify(sfx));
const parts={'/*CSS*/':r('src/styles.css'),'/*QR*/':r('vendor/package/qrcode.js')+'\n'+r('vendor/paho/package/paho-mqtt-min.js'),'/*DATA*/':r('src/data.js'),'/*ENGINE*/':r('src/engine.js'),'/*APP*/':app};
for(const k in parts){const i=h.indexOf(k);h=h.slice(0,i)+parts[k].replace(/<\/script/gi,'<\\/script')+h.slice(i+k.length);}
fs.mkdirSync(__dirname+'/dist',{recursive:true});fs.writeFileSync(__dirname+'/dist/index.html',h);console.log('built',h.length);
