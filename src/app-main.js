/* ===== شاشة العرض + البوابة + التوجيه ===== */
const Display = {
  init(code) {
    this.code = code || LS.get('bena.displayCode', '') || '';
    this.root = $('#app'); this.root.innerHTML = '<div class="stage-host" id="dsp"></div>';
    this.stage = new Stage($('#dsp'), { sound: true, ambient: true });
    this.net = new Net('display'); this.lastHs = null; this.lastV = -1; this.got = 0;
    this.net.on('state', P => this.onState(P));
    this.net.on('roster', R => { if (R && R.L) this.stage.setRoster(R); });
    this.net.on('logo', () => this.stage.refreshLogo());
    this.net.on('caps', () => { if (this.code) this.join(this.code); });
    this.net.on('status', () => this.badge());
    this.net.init();
    this.net.presence({ r: 'd' });
    setInterval(() => this.net.heartbeat(), 3000);
    window.addEventListener('pagehide', () => this.net.bye());
    this.overlay();
    setTimeout(() => { if (!this.got) this.askCode(); }, 3500);
  },
  async join(code) { this.code = code; LS.set('bena.displayCode', code); this.net.code = code; await this.net.joinRoom(code); this.net.presence({ r: 'd', c: code }); this.badge(); },
  onState(P) {
    if (!P) return;
    if (this.code && P.code !== this.code) { if (this.got) return; }
    if (!this.code && P.code) { this.code = P.code; this.join(P.code); }
    if (P.hs !== this.lastHs) { this.lastHs = P.hs; this.lastV = -1; }
    if (P.v < this.lastV) return;
    this.lastV = P.v; this.got = Date.now();
    const ask = $('#askcode'); if (ask) ask.remove();
    this.stage.update(P);
  },
  overlay() {
    const o = document.createElement('div'); o.style.cssText = 'position:fixed;inset:0;z-index:50;display:grid;place-items:center;background:rgba(4,20,26,.75);cursor:pointer';
    o.innerHTML = '<div class="card" style="text-align:center;max-width:520px"><div class="h" style="font-size:24px">🖥️ شاشة العرض</div><div class="note" style="margin-top:8px">اضغط في أي مكان لتفعيل الصوت وملء الشاشة</div></div>';
    o.onclick = () => { SFX.unlock(); try { document.documentElement.requestFullscreen().catch(() => { }); } catch (e) { } o.remove(); };
    document.body.appendChild(o);
    // التحكم في الصوت: كتم + مستوى (يظهر عند تمرير الفأرة فقط، ولا يشوّش على الجمهور)
    const sb = document.createElement('div'); sb.className = 'sndbox';
    sb.innerHTML = `<button class="btn sm" id="snap" title="حفظ صورة الذكرى">📸</button><button class="btn sm" id="sndm"></button><input type="range" id="sndv" min="0" max="100" step="5" title="مستوى الصوت">`;
    document.body.appendChild(sb); const mb = $('#sndm', sb), vr = $('#sndv', sb);
    const vol0 = +LS.get('bena.vol', 80); vr.value = vol0; SFX.vol = vol0 / 100;
    const upd = () => { mb.textContent = SFX.on && SFX.vol > 0 ? '🔊' : '🔇'; };
    mb.onclick = e => { e.stopPropagation(); SFX.unlock(); SFX.on = !SFX.on; if (!SFX.on) SFX.stopAmbient(); upd(); };
    vr.oninput = e => { e.stopPropagation(); SFX.unlock(); SFX.setVol(+vr.value / 100); LS.set('bena.vol', +vr.value); upd(); };
    sb.onclick = e => e.stopPropagation(); upd();
    $('#snap', sb).onclick = e => { e.stopPropagation(); this.stage.snapshot().catch(() => toast('تعذّر حفظ الصورة')); };
    const b = document.createElement('div'); b.id = 'dbadge'; b.style.cssText = 'position:fixed;bottom:6px;left:8px;z-index:40;font-size:11px;opacity:.45'; document.body.appendChild(b); this.badge();
  },
  badge() { const b = $('#dbadge'); if (b) { const l = this.net.label(); b.innerHTML = `<span class="dot ${l.cls}"></span> ${esc(l.t)}${this.code ? ' · ' + esc(this.code) : ''}`; } },
  askCode() {
    if ($('#askcode')) return;
    const d = document.createElement('div'); d.id = 'askcode'; d.className = 'card'; d.style.cssText = 'position:fixed;top:16px;left:16px;z-index:60;width:320px';
    d.innerHTML = `<div class="col"><b>لم تصل حالة المسابقة بعد</b><div class="note">إن كانت لوحة المشرف في المتصفح نفسه فستظهر تلقائيًا. على جهاز آخر أدخل رمز الغرفة:</div><div class="row"><input class="in grow" id="dcode" maxlength="4" inputmode="numeric" value="${esc(this.code)}" style="direction:ltr;text-align:center;letter-spacing:6px"><button class="btn pri" id="dgo">ربط</button></div></div>`;
    document.body.appendChild(d);
    $('#dgo').onclick = () => { const c = $('#dcode').value.replace(/\D/g, ''); if (c.length === 4) { this.join(c); toast('جارٍ الربط بالغرفة ' + c); } };
  }
};

const Landing = {
  async init() {
    const root = $('#app');
    root.innerHTML = `<div class="landing"><div class="box"><div class="row" style="gap:28px;align-items:center;flex-wrap:wrap"><div style="height:220px;width:170px;flex:none">${Brand.logoImg()}</div><div><h1>ميدان <span>بناء</span></h1><div class="mut" style="font-size:18px;margin-top:10px">منصة المسابقات الشبابية التفاعلية لفريق بناء</div></div></div>
      <div class="roles">
        <button class="role" data-go="join"><span class="ic">📱</span><b>دخول المتسابق</b><span class="mut">من الجوال: اسمك ورمز الغرفة</span></button>
        <button class="role" data-go="display"><span class="ic">🖥️</span><b>شاشة العرض</b><span class="mut">للبروجكتور أو الشاشة الكبيرة</span></button>
        <button class="role" data-go="host" id="hostbtn"><span class="ic">🎛️</span><b>لوحة المشرف</b><span class="mut">إنشاء الغرفة وإدارة المسابقة</span></button>
      </div><div class="note" style="margin-top:18px" id="lnote"></div></div></div>`;
    $$('[data-go]', root).forEach(b => b.onclick = () => { SFX.unlock(); route(b.dataset.go); });
    try { const u = window.claude && await Promise.race([window.claude.use('user'), new Promise(r => setTimeout(() => r(null), 4000))]); if (u && !u.canEdit()) { $('#hostbtn').style.opacity = .45; $('#lnote').textContent = 'لوحة المشرف متاحة لمالك الصفحة ومحرريها فقط.'; } } catch (e) { }
  }
};

function route(to) {
  const h = (location.hash || '').replace('#', '');
  const r = to || h;
  if (to) { try { history.replaceState(null, '', '#' + (to === 'join' ? 'play' : to)); } catch (e) { } }
  if (r === 'host') return Host.init();
  if (r.startsWith('display')) return Display.init((r.split('-')[1] || '').replace(/\D/g, '').slice(0, 4));
  if (r === 'join' || r === 'play' || r.startsWith('join-')) { const parts = r.split('-'); return Student.init((parts[1] || '').replace(/\D/g, '').slice(0, 4) || null, /^[0-9a-f]{12}$/.test(parts[2] || '') ? parts[2] : null); }
  return Landing.init();
}
Brand.apply();
route();
