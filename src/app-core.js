/* ===== ميدان بناء — الأساس: أدوات، أصوات، اتصال، المسرح ===== */
const D = window.BENA_DATA, { Engine } = window.BENA_ENGINE;
const ARTIFACT_URL = '%%ARTIFACT_URL%%';
const LOGO_DEFAULT = '%%LOGO%%';
const SFX_DATA = '%%SFX%%'; // تسجيلات طبيعية CC0 (Kenney): اصطدامات، عملات، خطوات — بلا موسيقى ولا أصوات بشرية
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LET = ['أ', 'ب', 'ج', 'د', 'هـ', 'و'];
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { } }
};
function uid(n = 8) { const a = 'abcdefghjkmnpqrstuvwxyz23456789'; let s = ''; let r; try { r = crypto.getRandomValues(new Uint8Array(n)); } catch (e) { r = Array.from({ length: n }, () => Math.floor(Math.random() * 256)); } r.forEach(x => { s += a[x % a.length]; }); return s; }
function toast(msg, ms = 2600) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), ms); }
function modal(html, mount) {
  const bg = document.createElement('div'); bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal">${html}</div>`;
  bg.addEventListener('click', e => { if (e.target === bg) bg.remove(); });
  document.body.appendChild(bg);
  const close = () => bg.remove();
  $$('[data-close]', bg).forEach(b => b.onclick = close);
  if (mount) mount(bg.firstChild, close);
  return close;
}
function confirmBox(msg, yes) { modal(`<div class="col"><div class="h" style="font-size:18px">${esc(msg)}</div><div class="row"><button class="btn bad" data-yes>نعم</button><button class="btn" data-close>إلغاء</button></div></div>`, (m, close) => { $('[data-yes]', m).onclick = () => { close(); yes(); }; }); }
function fmtTime(ms) { const s = Math.ceil(ms / 1000); return s >= 60 ? Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') : String(s); }
function pageBase() { if (!(window.claude && window.claude.use) && /^https?:$/.test(location.protocol)) return location.origin + location.pathname; return ''; }
function joinUrl(code, fp) { const base = LS.get('bena.url', '') || pageBase() || ARTIFACT_URL; if (!base || base.startsWith('%%')) return ''; return base.split('#')[0] + '#join-' + code + (fp ? '-' + fp : ''); }
function qrSvg(text) { try { const q = qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 8, margin: 2, scalable: true }); } catch (e) { return ''; } }

// ---------- الهوية ----------
const Brand = {
  logo() { return LS.get('bena.logo', null) || LOGO_DEFAULT; },
  logoImg(cls = 'logo-img') { const l = this.logo(); return l && !l.startsWith('%%') ? `<img class="${cls}" src="${l}" alt="فريق بناء">` : '<div class="wordmark" style="font-size:28px">فريق <b>بناء</b></div>'; },
  apply() {
    const c = LS.get('bena.colors', null);
    if (c) { document.documentElement.style.setProperty('--brand', c[0]); document.documentElement.style.setProperty('--brand2', c[1]); }
    const f = LS.get('bena.font', null);
    if (f && window.FontFace) { try { const ff = new FontFace('BenaCustom', 'url(' + f + ')'); ff.load().then(x => { document.fonts.add(x); document.documentElement.style.setProperty('--fh', "'BenaCustom','Readex Pro',sans-serif"); }).catch(() => { }); } catch (e) { } }
  }
};

// ---------- المؤثرات الصوتية (مُركّبة، غير موسيقية) ----------
const SFX = {
  ctx: null, on: true, buf: {},
  unlock() { try { if (!this.ctx) { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); this.load(); } if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => { }); } catch (e) { } },
  load() {
    if (typeof SFX_DATA !== 'object' || !SFX_DATA) return;
    Object.entries(SFX_DATA).forEach(([k, b64]) => { try { const bin = atob(b64); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); this.ctx.decodeAudioData(a.buffer).then(b => { this.buf[k] = b; }).catch(() => { }); } catch (e) { } });
  },
  rec(k, v = .9, at = 0, rate = 1) { const b = this.buf[k]; if (!b) return false; const c = this.ctx, s = c.createBufferSource(), g = c.createGain(); s.buffer = b; s.playbackRate.value = rate; g.gain.value = v; s.connect(g).connect(c.destination); s.start(c.currentTime + at); return true; },
  tone(f, d, type = 'sine', v = .18, at = 0, f2) {
    const c = this.ctx, t = c.currentTime + at, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + d);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + d + .05);
  },
  noise(d, v = .2, at = 0, freq = 1200, q = .8) {
    const c = this.ctx, t = c.currentTime + at, len = Math.floor(c.sampleRate * d), b = c.createBuffer(1, len, c.sampleRate), x = b.getChannelData(0);
    for (let i = 0; i < len; i++) x[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = c.createBufferSource(); s.buffer = b; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q; const g = c.createGain(); g.gain.value = v;
    s.connect(f).connect(g).connect(c.destination); s.start(t);
  },
  play(k) {
    if (!this.on || !this.ctx || this.ctx.state !== 'running') return;
    try {
      switch (k) {
        case 'buzz': if (!this.rec('hit', 1)) this.noise(.25, .3, 0, 600); this.rec('land', .7, .02); break;
        case 'correct': if (!this.rec('coin', .9)) this.noise(.3, .1, 0, 5000, 2); break;
        case 'wrong': if (!this.rec('hurt', 1)) this.noise(.3, .2, 0, 300); break;
        case 'bomb': this.rec('impact', 1); if (!this.rec('big_kill', 1, .12)) this.noise(.8, .35, .1, 200, .5); break;
        case 'shield': this.rec('land', 1); this.rec('hit', .7, .08); break;
        case 'build': this.rec('step', .8); this.rec('land', .8, .25); this.rec('land', .6, .5, 1.1); this.rec('coin', .4, .7); break;
        case 'march': for (let i = 0; i < 6; i++) this.rec('step', .7, i * .35, .9 + (i % 2) * .15); break;
        case 'battle': if (!this.rec('boss', 1)) this.noise(.9, .3, 0, 150, .5); this.rec('impact', .9, .3); this.rec('hit', .8, .5); this.rec('impact', .7, .7, .9); break;
        case 'crack': this.rec('impact', .9); this.rec('coin', .9, .15); break;
        case 'deny': if (!this.rec('kill', 1)) this.noise(.15, .2, 0, 400); break;
        case 'draw': for (let i = 0; i < 5; i++) this.rec('coin', .35, i * .18, .8 + i * .08); break;
        case 'open': this.noise(.35, .18, 0, 2500, .6); break;
        case 'reveal': this.noise(.5, .16, 0, 900, .5); break;
        case 'lead': this.rec('coin', 1); this.rec('impact', .5, .1); break;
        case 'tick': this.tone(1500, .03, 'square', .05); break;
        case 'timeup': if (!this.rec('boss', .9)) this.noise(.7, .25, 0, 180, .6); break;
        case 'join': this.rec('step', .3); break;
        case 'spin': for (let i = 0; i < 26; i++) this.tone(1300, .02, 'square', .05, i * i * .0075); break;
        case 'box': this.rec('land', .9); this.rec('coin', .5, .15); break;
        case 'card': this.rec('coin', .6); break;
        case 'seg': if (!this.rec('boss', .7)) this.noise(.6, .14, 0, 1800, .4); break;
        case 'crown': for (let i = 0; i < 12; i++) this.noise(.25, .12, i * .12 + Math.random() * .05, 2500 + Math.random() * 1500, 1.5); break;
      }
    } catch (e) { }
  }
};
const FX_SOUND = { bomb: 'bomb', shield: 'shield', build: 'build', march: 'march', battle: 'battle', crack: 'crack', deny: 'deny', draw: 'draw', buzz: 'buzz', correct: 'correct', wrong: 'wrong', open: 'open', reveal: 'reveal', lead: 'lead', timeup: 'timeup', join: 'join', spin: 'spin', box: 'box', card: 'card', seg: 'seg', crown: 'crown', 'tick-ok': 'correct', skip: 'tick', clue: 'reveal', show: 'open', item: 'tick', rank: 'reveal' };

// ---------- تشفير الرسائل الخاصة (ECDH P-256 + AES-GCM) ----------
// كل جوال يولّد مفتاحًا، ولا يستطيع أحد غيره وغير حاسوب المشرف قراءة رسالته الخاصة.
const Crypt = {
  ok: !!(window.crypto && crypto.subtle),
  b64(buf) { let s = ''; const a = new Uint8Array(buf); for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s); },
  unb64(str) { const s = atob(str); const a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; },
  async keypair() { const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey']); return { priv: kp.privateKey, pub: this.b64(await crypto.subtle.exportKey('raw', kp.publicKey)) }; },
  async derive(priv, pubB64) { const pub = await crypto.subtle.importKey('raw', this.unb64(pubB64), { name: 'ECDH', namedCurve: 'P-256' }, false, []); return crypto.subtle.deriveKey({ name: 'ECDH', public: pub }, priv, { name: 'AES-GCM', length: 128 }, false, ['encrypt', 'decrypt']); },
  async enc(key, obj) { const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj))); const out = new Uint8Array(12 + ct.byteLength); out.set(iv); out.set(new Uint8Array(ct), 12); return this.b64(out); },
  async dec(key, b64) { const a = this.unb64(b64); const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: a.slice(0, 12) }, key, a.slice(12)); return JSON.parse(new TextDecoder().decode(pt)); }
};

// ---------- طبقة الاتصال ----------
// قناتان: (1) غرفة Claude اللحظية بين أجهزة مختلفة، (2) قناة محلية بين نوافذ المتصفح نفسه.
class Net {
  constructor(role) { this.role = role; this.tab = uid(10); this.room = null; this.named = null; this.user = null; this.db = null; this.bc = null; this.mq = null; this.connected = false; this.caps = false; this.H = {}; this.myPres = {}; this.err = null; this.code = null; this.expectFp = null; this.untrusted = new Set(); this.pn = 0; }
  on(t, f) { (this.H[t] = this.H[t] || []).push(f); }
  fire(t, ...a) { (this.H[t] || []).forEach(f => { try { f(...a); } catch (e) { console.error(e); } }); }
  async init() {
    try { this.bc = new BroadcastChannel('bena-v1'); this.bc.onmessage = e => this.onBC(e.data); } catch (e) { this.bc = null; }
    const C = window.claude;
    if (C && typeof C.use === 'function') {
      const safe = n => Promise.race([C.use(n).catch(() => null), new Promise(r => setTimeout(() => r(null), 12000))]);
      const [room, user, db] = await Promise.all([safe('room'), safe('user'), safe('db')]);
      this.room = room; this.user = user; this.db = db;
    } else if (typeof Mq !== 'undefined' && typeof Paho !== 'undefined') {
      this.mq = new Mq(this);
      this.on('mqup', () => { if (this.role !== 'host') this.mqPres(); });
      if (this.code) this.mq.start(this.code);
    }
    this.caps = true; this.fire('status'); this.fire('caps');
  }
  async joinRoom(code) {
    this.code = code;
    if (this.mq) { this.mq.start(code); this.fire('status'); return true; }
    if (!this.room) { this.fire('status'); return false; }
    const name = 'bena-' + code;
    if (this.named && this.named.name === name) return true;
    if (this.named) { try { await this.named.leave(); } catch (e) { } this.named = null; }
    try { this.named = await this.room.join(name); } catch (e) { this.err = (e && e.code) || 'join_failed'; this.fire('status'); return false; }
    const R = this.named, onErr = e => { this.err = e && e.code; this.connected = false; this.fire('status'); };
    R.on('state', m => this.fire('state', m.data, m), onErr);
    R.on('roster', m => this.fire('roster', m.data, m), onErr);
    R.on('priv', m => this.fire('priv', m.data, m), onErr);
    R.onPeers(ch => this.fire('peers', ch), onErr);
    R.onConnection(c => { this.connected = c; this.fire('status'); }, onErr);
    if (Object.keys(this.myPres).length) R.presence(this.myPres).catch(() => { });
    this.fire('status');
    return true;
  }
  emit(topic, data) {
    if (this.named) this.named.emit(topic, data).catch(e => { this.err = (e && e.code) || 'emit'; this.fire('status'); });
    if (this.bc) { try { this.bc.postMessage({ t: topic, d: data, from: this.tab, code: this.code }); } catch (e) { } }
    if (this.mq) { const sub = { state: 'h/s', roster: 'h/r', priv: 'h/v' }[topic]; if (sub) this.mq.pub(sub, data); }
  }
  // يحدد هل نثق بمفتاح المشرف: البصمة من رابط QR، وإلا أول مشرف موثَّق لهذه الغرفة
  trustHost(fp) {
    if (this.expectFp) { if (fp === this.expectFp) return true; this.untrusted.add(fp); return false; }
    const k = 'bena.hfp.' + this.code; let t = null; try { t = sessionStorage.getItem(k); } catch (e) { }
    if (!t) { try { sessionStorage.setItem(k, fp); } catch (e) { } return true; }
    if (t === fp) return true; this.untrusted.add(fp); return false;
  }
  resetTrust() { try { sessionStorage.removeItem('bena.hfp.' + this.code); } catch (e) { } this.expectFp = null; this.untrusted.clear(); }
  heartbeat() { this.bcPres(); this.mqPres(); }
  mqPres() { if (this.mq && this.mq.code) { this.pn = Math.max(Date.now(), this.pn + 1); this.mq.pub('p/' + this.mq.cid, Object.assign({}, this.myPres, { _n: this.pn })); } }
  presence(patch) {
    Object.entries(patch).forEach(([k, v]) => { if (v === null) delete this.myPres[k]; else this.myPres[k] = v; });
    if (this.named) this.named.presence(patch).catch(() => { });
    this.bcPres(); this.mqPres();
  }
  bcPres() { if (this.bc) { try { this.bc.postMessage({ t: 'pres', d: this.myPres, from: this.tab, code: this.code }); } catch (e) { } } }
  bye() { if (this.bc) { try { this.bc.postMessage({ t: 'bye', from: this.tab }); } catch (e) { } } }
  onBC(m) {
    if (!m || m.from === this.tab) return;
    if (m.t === 'state' || m.t === 'roster' || m.t === 'priv') { if (this.code && m.code && m.code !== this.code && this.role !== 'display') return; this.fire(m.t, m.d, { peer: 'bc:' + m.from, viaBC: true }); }
    else if (m.t === 'pres') this.fire('bcpres', 'bc:' + m.from, m.d || {}, m.code);
    else if (m.t === 'bye') this.fire('bcbye', 'bc:' + m.from);
    else if (m.t === 'logo' && this.role !== 'host') { LS.set('bena.logo', m.d); this.fire('logo'); }
  }
  label() {
    if (this.mq) { const l = this.mq.label(); if (l.cls !== 'on' && this.bc) l.t += ' — القناة المحلية تعمل'; return l; }
    if (this.named && this.connected) return { cls: 'on', t: 'متصل لحظيًا عبر غرفة Claude' };
    if (this.named && !this.connected) return { cls: 'warn', t: 'جارٍ الاتصال بغرفة Claude…' };
    if (this.room && this.err) return { cls: 'off', t: 'تعذّر الاتصال بالغرفة (' + this.err + ')' + (this.bc ? ' — القناة المحلية تعمل' : '') };
    if (!this.caps) return { cls: 'warn', t: 'جارٍ التحقق من الاتصال…' };
    if (this.bc) return { cls: 'warn', t: 'قناة محلية فقط (نوافذ هذا المتصفح)' };
    return { cls: 'off', t: 'دون اتصال — وضع الطوارئ' };
  }
}

// ---------- مؤقت محلي من حالة المشرف ----------
const Clock = { end: null, paused: null, dur: 1, label: '', set(tm) { if (!tm) { this.end = null; this.paused = null; return; } this.dur = tm.d || 1; this.label = tm.l || ''; if (tm.p) { this.paused = tm.r; this.end = null; } else { this.paused = null; this.end = Date.now() + tm.r; } }, rem() { if (this.paused != null) return this.paused; if (this.end == null) return null; return Math.max(0, this.end - Date.now()); } };

// ---------- المسرح: شاشة الجمهور ----------
class Stage {
  constructor(host, opts = {}) {
    this.host = host; this.opts = opts; this.P = null; this.R = { L: [], M: {} }; this.key = ''; this.prevScores = {}; this.lastFx = null; this.sound = !!opts.sound; this.clock = Object.create(Clock);
    host.innerHTML = `<div class="stage"><div class="grid-bg"></div>
      <div class="st-top"><div class="st-logo">${Brand.logoImg()}</div><div class="st-title"></div><div class="st-seg"></div></div>
      <div class="ring hide"><svg width="170" height="170" viewBox="0 0 170 170"><circle cx="85" cy="85" r="76" stroke="rgba(255,255,255,.12)" stroke-width="12" fill="none"/><circle class="arc" cx="85" cy="85" r="76" stroke="var(--brand)" stroke-width="12" fill="none" stroke-linecap="round" stroke-dasharray="477.5" stroke-dashoffset="0"/></svg><div class="num"></div><div class="lbl"></div></div>
      <div class="st-main"></div><div class="st-foot"><div class="sb"></div></div><div class="flash"></div><div class="banner-layer"></div><div class="confetti"></div></div>`;
    this.el = $('.stage', host); this.main = $('.st-main', this.el); this.sb = $('.sb', this.el); this.ring = $('.ring', this.el);
    this.fit(); this.ro = new ResizeObserver(() => this.fit()); this.ro.observe(host);
    this.loop = setInterval(() => this.tickUI(), 100);
    this.renderLobbyEmpty();
  }
  fit() { const w = this.host.clientWidth, h = this.host.clientHeight; if (!w || !h) return; const s = Math.min(w / 1920, h / 1080); this.el.style.transform = `translate(${(w - 1920 * s) / 2}px,${(h - 1080 * s) / 2}px) scale(${s})`; }
  refreshLogo() { $('.st-logo', this.el).innerHTML = Brand.logoImg(); this.key = ''; if (this.P) this.update(this.P); }
  renderLobbyEmpty() { this.main.innerHTML = `<div class="welcome"><div class="lg">${Brand.logoImg()}</div><p>بانتظار لوحة المشرف…</p></div>`; }
  teams() { return (this.P ? this.P.T : []).map(t => ({ id: t[0], name: t[1], color: t[2], score: t[3], cards: t[4], dbl: t[5], frz: t[6], stk: t[7] })); }
  tm(id) { return this.teams().find(t => t.id === id) || { name: '', color: '#888' }; }
  setRoster(R) { this.R = R || this.R; if (this.P && !this.P.g) this.update(this.P, true); }
  update(P, force) {
    const prev = this.P; this.P = P; this.clock.set(P.tm);
    this.el.classList.toggle('fx-low', P.fxl === 'low' || P.fxl === 'off');
    $('.st-title', this.el).textContent = P.title || 'ميدان بناء';
    const seg = $('.st-seg', this.el);
    if (P.g && P.g !== 'opening') { seg.classList.remove('hide'); seg.innerHTML = `<span>${esc(P.gi || '🏆')}</span><span>${esc(P.gn)}</span>${P.in && P.ii >= 0 && P.ii < P.in ? `<small>${P.ii + 1} / ${P.in}</small>` : ''}${P.mult > 1 ? '<small style="color:var(--brand2)">نقاط ×' + P.mult + '</small>' : ''}`; } else seg.classList.add('hide');
    this.renderScores();
    const k = this.mainKey(P);
    if (force || k !== this.key) { this.key = k; this.main.innerHTML = this.mainHTML(P); this.afterMain(P); }
    this.updateDyn(P);
    this.banner(P);
    if (P.fx && (!this.lastFx || P.fx.n !== this.lastFx)) { const first = this.lastFx == null; this.lastFx = P.fx.n; if (!first) this.onFx(P.fx); }
  }
  mainKey(P) {
    const I = P.I || {};
    return JSON.stringify([P.g, P.ph, P.ii, P.step, P.rev, I.qid, I.rv, I.bz, I.clues && I.clues.length, I.lk, I.res, I.got, I.wi, I.places, I.win, P.boxes && P.boxes.filter(b => b[0]).length, I.reps, I.grid ? 1 : 0, P.g ? 0 : (this.R.L || []).length, P.mode, P.tie, P.alive && P.alive.length, I.vr ? 1 : 0, I.word && I.word[0]]);
  }
  renderScores() {
    const T = this.teams(); if (!T.length) return;
    const sorted = [...T].sort((a, b) => b.score - a.score); const n = T.length, gap = 22, w = (1808 - gap * (n - 1)) / n;
    const leader = sorted.length > 1 && sorted[0].score > sorted[1].score && sorted[0].score > 0 ? sorted[0].id : null;
    const seen = new Set();
    T.forEach(t => {
      seen.add(t.id);
      let el = this.sb.querySelector(`[data-t="${t.id}"]`);
      if (!el) { el = document.createElement('div'); el.className = 'tm'; el.dataset.t = t.id; el.innerHTML = '<span class="sw"></span><span class="nm"></span><span class="ic"></span><span class="pt"></span><span class="rk"></span>'; this.sb.appendChild(el); }
      const rank = sorted.findIndex(x => x.id === t.id); const rnk = sorted.filter(x => x.score > t.score).length + 1;
      el.style.width = w + 'px'; el.style.right = '0px'; el.style.setProperty('--tc', t.color);
      const tx = `translateX(${-(rank * (w + gap))}px)`; el.style.setProperty('--tx0', tx); el.style.transform = tx;
      $('.nm', el).textContent = t.name; $('.pt', el).textContent = t.score; $('.rk', el).textContent = '#' + rnk;
      $('.ic', el).innerHTML = (t.dbl ? '<span title="مضاعف">⚡</span>' : '') + (t.frz ? '<span title="مجمّد">❄️</span>' : '') + (t.stk >= 2 ? '<span title="سلسلة">🔥' + t.stk + '</span>' : '');
      el.classList.toggle('lead', t.id === leader);
      const pv = this.prevScores[t.id];
      if (pv != null && pv !== t.score) { const d = t.score - pv; const f = document.createElement('div'); f.className = 'delta' + (d < 0 ? ' neg' : ''); f.textContent = (d > 0 ? '+' : '') + d; f.style.left = '30px'; el.appendChild(f); setTimeout(() => f.remove(), 1900); el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit'); }
      this.prevScores[t.id] = t.score;
    });
    $$('.tm', this.sb).forEach(el => { if (!seen.has(el.dataset.t)) el.remove(); });
  }
  banner(P) {
    const L = $('.banner-layer', this.el), I = P.I;
    if (P.ph === 'answering' && I && I.bz) { const t = this.tm(I.bz[0]); const k = 'bz' + I.qid + I.bz[0]; if (L.dataset.k !== k) { L.dataset.k = k; L.innerHTML = `<div class="buzz-banner"><div class="bb" style="--tc:${t.color}"><div class="t">⚡ ${esc(t.name)}</div>${I.bz[1] ? `<div class="s">${esc(I.bz[1])}</div>` : ''}</div></div>`; clearTimeout(this.bto); this.bto = setTimeout(() => { L.innerHTML = ''; }, 1800); } }
    else if (L.dataset.k) { L.dataset.k = ''; L.innerHTML = ''; }
  }
  onFx(fx) {
    if (this.sound && FX_SOUND[fx.k]) SFX.play(FX_SOUND[fx.k]);
    const F = $('.flash', this.el);
    if (fx.k === 'correct' || fx.k === 'tick-ok') { F.className = 'flash'; void F.offsetWidth; F.className = 'flash ok'; }
    if (fx.k === 'wrong') { F.className = 'flash'; void F.offsetWidth; F.className = 'flash bad'; }
    if (fx.k === 'lead') this.confetti(40);
    if (fx.k === 'crown') this.confetti(160);
  }
  confetti(n) {
    if (this.P && (this.P.fxl === 'low' || this.P.fxl === 'off')) return;
    const C = $('.confetti', this.el); const cols = this.teams().map(t => t.color).concat(['#DCF5E2', '#A3D68F', '#22A391']);
    for (let i = 0; i < n; i++) { const e = document.createElement('i'); e.style.left = Math.random() * 1920 + 'px'; e.style.background = cols[i % cols.length]; e.style.animationDuration = (2.5 + Math.random() * 2.5) + 's'; e.style.animationDelay = Math.random() * .8 + 's'; C.appendChild(e); setTimeout(() => e.remove(), 6000); }
  }
  tickUI() {
    const r = this.clock.rem(); const ring = this.ring;
    if (r == null || !this.P || !this.P.tm) { ring.classList.add('hide'); return; }
    ring.classList.remove('hide');
    $('.num', ring).textContent = fmtTime(r); $('.lbl', ring).textContent = this.clock.label || '';
    $('.arc', ring).setAttribute('stroke-dashoffset', String(477.5 * (1 - Math.min(1, r / this.clock.dur))));
    ring.classList.toggle('low', r <= 5000 && r > 0);
    const s = Math.ceil(r / 1000); if (this.sound && r > 0 && s <= 5 && s !== this.lastTickS && this.clock.paused == null) { this.lastTickS = s; SFX.play('tick'); }
  }
  // ---------- محتوى المسرح ----------
  mainHTML(P) {
    const I = P.I || {}, T = this.teams();
    if (!P.g) return this.lobbyHTML(P);
    if (P.g === 'opening') return this.openingHTML(P);
    if (P.g === 'crown') return this.crownHTML(P);
    if (P.ph === 'intro') return `<div class="intro"><div class="ico">${esc(P.gi || '⚔️')}</div><div class="nm">${esc(P.gn)}</div><div class="ds">${esc(P.gd || (P.g === 'tiebreak' ? 'الفرق المتعادلة فقط. أول إجابة صحيحة تحسم.' : ''))}</div><div class="md">${({ buzz: '⚡ استباق', all: '📱 الجميع يجيب', team: '👥 إجابة الفريق', live: '🏃 تحدٍّ حضوري', special: '🎲 مفاجآت' })[P.mode] || ''}</div></div>`;
    if (P.ph === 'done') return this.summaryHTML(P);
    if (!P.I) return '';
    const vs = this.vsHTML(P);
    switch (I.k) {
      case 'wheel': return this.wheelHTML(P);
      case 'box': return this.boxesHTML(P);
      case 'taboo': return this.tabooHTML(P);
      case 'live': return this.liveHTML(P);
      case 'secret': return `<div class="intro"><div class="ico">🤫</div><div class="nm">انظروا إلى جوالاتكم</div><div class="ds">لكل فريق مهمة سرية تظهر لأعضائه فقط. أنجزوها قبل الحسم لتكسبوا <b style="color:var(--brand2)">+15</b> نقطة. لا تكشفوها للفرق الأخرى!</div></div>`;
    }
    if (I.auc && P.ph === 'bidding') return `<div class="intro"><div class="ico">🔨</div><div class="nm" style="font-size:90px">المزاد مفتوح</div><div class="ds">سؤال صعب في «${esc(D.CATS[I.cat] || '')}». كم نقطة تراهنون؟ (حتى 30)</div>${this.bidsHTML(P)}</div>`;
    if (I.wq && P.ph === 'wager') return `<div class="intro"><div class="ico">🎲</div><div class="nm" style="font-size:90px">رهان الحسم</div><div class="ds">كل فريق يحدد رهانه سرًّا (حتى 25% من نقاطه، وبحد أقصى 40). الإجابة الصحيحة تكسبه والخاطئة تخسره.</div></div>`;
    let h = vs;
    if (I.auc && I.win) h += `<div style="text-align:center;margin-bottom:20px"><span class="mini-bz" style="--tc:${this.tm(I.win).color}">🔨 ${esc(this.tm(I.win).name)} — رهان ${I.bid}</span></div>`;
    if (I.k === 'whoami') {
      h += `<div class="big-q">🕵️ من أنا؟ <span style="color:var(--brand2);font-size:40px">(${I.pts} نقطة)</span></div><div class="clues">${I.clues.map((c, i) => `<div class="clue"><span class="n">${i + 1}</span>${esc(c)}</div>`).join('')}</div>`;
    } else if (I.grid) {
      h += `<div class="big-q sm" style="margin-bottom:30px">👁️ ركّز جيدًا… ستختفي الشبكة</div><div class="grid9">${I.grid.map((e, i) => `<div style="animation-delay:${i * .05}s">${e}</div>`).join('')}</div>`;
      return h;
    } else {
      h += `<div class="big-q ${String(I.q || '').length > 90 ? 'sm' : ''}">${esc(I.q || '')}</div>`;
      if (I.k === 'open' && I.hint) h += `<div class="status-line">💡 تلميح: <b>${esc(I.hint)}</b></div>`;
      if (I.k === 'number') h += `<div class="status-line">اكتب تقديرك ${I.unit ? '(' + esc(I.unit) + ')' : ''} في جوالك</div>`;
    }
    const showChoices = I.c && (P.ph !== 'ready' || P.mode !== 'buzz') && I.k !== 'order';
    if (I.k === 'order' && P.ph !== 'ready') {
      const items = I.rv && I.a ? I.a.map(i => I.c[i]) : I.c;
      h += `<div class="order-list">${items.map((x, i) => `<div class="o ${I.rv ? 'ok' : ''}"><span class="n">${I.rv ? i + 1 : LET[i]}</span>${esc(x)}</div>`).join('')}</div>`;
    } else if (showChoices) {
      const tot = I.dist ? I.dist.reduce((a, b) => a + b, 0) : 0;
      h += `<div class="choices">${I.c.map((c, i) => { const ok = I.rv && I.a === i && I.k !== 'consensus'; const dim = I.rv && I.a !== undefined && I.a !== i && I.k !== 'consensus'; const pc = tot ? Math.round(100 * (I.dist[i] || 0) / tot) : 0; return `<div class="choice ${ok ? 'ok' : ''} ${dim ? 'dim' : ''}"><span class="L">${LET[i]}</span><span>${esc(c)}</span>${I.dist ? `<span class="cnt">${I.dist[i] || 0}</span><span class="dist"><i style="width:${pc}%"></i></span>` : ''}</div>`; }).join('')}</div>`;
    }
    if (I.rv && (I.k === 'open' || I.k === 'whoami' || I.k === 'number')) h += `<div class="reveal-box">${esc(I.k === 'number' ? (I.a + (I.unit ? ' ' + I.unit : '')) : I.a)}${I.best ? `<small>أقرب تقدير فردي: ${esc(I.best)}</small>` : ''}</div>`;
    h += `<div data-dyn="status"></div>`;
    if (I.rv) h += this.resultsHTML(P);
    return h;
  }
  vsHTML(P) {
    const I = P.I || {}; const pair = P.vs || (I.reps ? I.el : null);
    if (!pair || pair.length < 2) return '';
    const sides = pair.map(id => { const t = this.tm(id); const rep = I.reps ? (I.reps.find(r => r[2] === id) || [])[1] : ''; return `<div class="side ${I.lk && I.lk.includes(id) ? 'lk' : ''}" style="--tc:${t.color}">${esc(t.name)}${rep ? `<small>${esc(rep)}</small>` : ''}</div>`; });
    return `<div class="vs">${sides.join('<div class="x">VS</div>')}</div>`;
  }
  statusHTML(P) {
    const I = P.I || {};
    if (!P.I || I.rv) return '';
    if (P.ph === 'ready') return `<div class="status-line">استعدوا…</div>`;
    if (P.ph === 'answering' && I.bz) { const t = this.tm(I.bz[0]); return `<div class="status-line"><span class="mini-bz" style="--tc:${t.color}">⚡ ${esc(t.name)}${I.bz[1] ? ' — ' + esc(I.bz[1]) : ''}</span>${I.late ? `<div style="font-size:24px;margin-top:14px">وصل بعده: ${I.late.map(l => esc(l[0]) + ' (+' + (l[1] / 1000).toFixed(2) + 'ث)').join('، ')}</div>` : ''}</div>`; }
    if (P.ph === 'paused') return `<div class="status-line">❌ إجابة خاطئة — ${I.lk && I.lk.length ? 'خرج: ' + I.lk.map(id => esc(this.tm(id).name)).join('، ') : ''}</div>`;
    if (P.ph === 'open' && P.mode === 'buzz') return `<div class="status-line">⚡ <b>الاستباق مفتوح</b> — اضغطوا الزر في جوالاتكم${I.reps ? ' (الممثلان فقط)' : ''}</div>`;
    if (P.ph === 'open' && P.mode === 'all') { const T = this.teams(); return `<div class="ans-prog">${T.map(t => `<span class="a" style="--tc:${t.color}">${esc(t.name)}: ${(I.abt && I.abt[t.id]) || 0}</span>`).join('')}</div><div class="status-line">📱 أجيبوا من جوالاتكم — وصلت <b>${I.an || 0}</b> إجابة${P.alive ? ' — الصامدون: ' + P.alive.length : ''}</div>`; }
    if (P.ph === 'open' && P.mode === 'team') return `<div class="status-line">👥 تشاوروا… ممثل كل فريق يقدّم الإجابة</div>`;
    if (P.ph === 'open' && I.wq) return `<div class="status-line">✍️ كل فريق يكتب إجابته على ورقة</div>`;
    if (P.ph === 'open' && I.auc) return `<div class="status-line">🎤 الفريق الفائز بالمزاد يجيب</div>`;
    return '';
  }
  updateDyn(P) { const d = $('[data-dyn="status"]', this.main); if (d) { const h = this.statusHTML(P); if (d._h !== h) { d._h = h; d.innerHTML = h; } } const v = $('[data-dyn="vote"]', this.main); if (v && P.I) v.textContent = P.I.vc || 0; }
  resultsHTML(P) {
    const I = P.I, R = I.res2; if (!R) return I.rv && P.mode === 'buzz' ? '<div class="status-line">لم يُجب أحد إجابة صحيحة</div>' : '';
    if (R.team !== undefined) { if (!R.team) return '<div class="status-line">لم يُجب أحد إجابة صحيحة</div>'; const t = this.tm(R.team); return `<div class="status-line"><span class="mini-bz" style="--tc:${t.color}">${R.ok ? '✅' : '❌'} ${esc(t.name)}</span>${I.streak ? '<div style="margin-top:12px;color:var(--brand2)">🔥 سلسلة انتصارات! +5</div>' : ''}</div>`; }
    const T = this.teams();
    return `<div class="team-res">${T.filter(t => R[t.id]).map(t => { const r = R[t.id]; let sub = ''; if (r.n !== undefined && r.ok !== undefined) sub = `${r.ok} من ${r.n} صحيحة`; if (r.med != null) sub = 'الوسيط: ' + r.med; if (r.ratio != null) sub = 'توافق ' + Math.round(r.ratio * 100) + '%'; if (r.place) sub = 'المركز ' + r.place; if (r.ok === true) sub = '✅ صحيح'; if (r.ok === false) sub = '❌ خطأ'; return `<div class="r" style="--tc:${t.color}"><b>${esc(t.name)}</b><div class="p">${r.pts > 0 ? '+' : ''}${r.pts || 0}</div><div class="s">${sub}</div></div>`; }).join('')}</div>${I.fast ? `<div class="status-line">⚡ أسرع إجابة صحيحة: <b>${esc(I.fast)}</b></div>` : ''}`;
  }
  bidsHTML(P) { const I = P.I; const T = this.teams(); return `<div class="team-res">${T.map(t => `<div class="r" style="--tc:${t.color}"><b>${esc(t.name)}</b><div class="p" style="color:var(--brand2)">${I.bids && I.bids[t.id] != null ? I.bids[t.id] : '—'}</div></div>`).join('')}</div>`; }
  summaryHTML(P) {
    const T = [...this.teams()].sort((a, b) => b.score - a.score);
    let extra = '';
    if (P.surv) extra = `<div class="status-line">🛡️ الصامدون: ${T.map(t => P.surv[t.id] ? esc(t.name) + ' ' + P.surv[t.id].alive + '/' + P.surv[t.id].start : '').filter(Boolean).join(' · ')}</div>`;
    return `<div class="intro"><div class="nm" style="font-size:80px">انتهت جولة ${esc(P.gn)}</div></div><div class="order-list" style="max-width:1200px">${T.map((t, i) => `<div class="o" style="border-inline-start:10px solid ${t.color}"><span class="n">${i + 1}</span>${esc(t.name)}<span style="margin-inline-start:auto;font-weight:800;direction:ltr">${t.score}</span></div>`).join('')}</div>${extra}`;
  }
  lobbyHTML(P) {
    const url = joinUrl(P.code, P.fp); const T = this.teams(); const L = this.R.L || [];
    return `<div class="lobby"><div><h2>انضموا إلى <span>${esc(P.title || 'ميدان بناء')}</span></h2><div class="mut" style="font-size:34px;margin-top:20px">امسح الرمز أو افتح الرابط ثم أدخل رمز الغرفة</div><div class="code">${esc(P.code)}</div>${url ? `<div class="mut" style="font-size:22px;direction:ltr;text-align:right;word-break:break-all">${esc(url)}</div>` : ''}<div class="tcount">${T.map(t => `<span style="--tc:${t.color}">${esc(t.name)}: ${L.filter(x => x[2] === t.id).length}</span>`).join('')}</div><div class="names">${L.slice(-40).map(x => `<span style="--tc:${this.tm(x[2]).color}">${esc(x[1])}</span>`).join('')}</div></div><div class="qr">${url ? qrSvg(url) : '<div class="mut" style="color:#333;font-size:30px;text-align:center">أضف رابط الصفحة من الإعدادات لإظهار رمز QR</div>'}</div></div>`;
  }
  openingHTML(P) {
    const T = this.teams(); const L = this.R.L || [];
    if (P.ph === 'welcome') return `<div class="welcome"><div class="lg">${Brand.logoImg()}</div><h1>ميدان <span>بناء</span></h1><p>${esc(P.title && P.title !== 'ميدان بناء' ? P.title : 'أربعة فرق… ساحة واحدة… بطل واحد')}</p></div>`;
    if (P.ph === 'teams') return `<div class="teams-in" style="--n:${T.length}">${T.map((t, i) => `<div class="t ${i < (P.step || 0) ? '' : 'wait'}" style="--tc:${t.color}"><div class="n">${esc(t.name)}</div><div class="m">${L.filter(x => x[2] === t.id).length} لاعبين</div></div>`).join('')}</div>`;
    if (P.ph === 'rules' || P.ph === 'done') return `<div class="big-q" style="margin-bottom:40px">قواعد الميدان</div><div class="rules"><div class="r"><b>⚡ الاستباق</b>أول ضغطة تصل إلى حاسوب المشرف تفوز. سهل=10، متوسط=20، صعب=30.</div><div class="r"><b>📱 الجميع يجيب</b>نقاط الفريق حسب نسبة أعضائه المجيبين صحيحًا، فلا يتفوق الفريق الأكبر عددًا.</div><div class="r"><b>🃏 بطاقات القوة</b>لكل فريق: مضاعف ×2، ودرع يمنع الخصم، وتجميد يوقف فريقًا عن الاستباق سؤالًا واحدًا.</div><div class="r"><b>🔥 السلسلة</b>3 إجابات صحيحة متتالية في الاستباق = +5.</div><div class="r"><b>🎲 المفاجآت</b>قيمها محدودة حتى لا يطغى الحظ على الأداء.</div><div class="r"><b>🏁 الحسم</b>نقاط مضاعفة ثم رهان أخير بحد أقصى 25% من نقاطكم.</div></div>`;
    return '';
  }
  crownHTML(P) {
    const rk = (P.rk || []).map(r => ({ ...this.tm(r[0]), id: r[0], score: r[1], rank: r[2] }));
    if (P.ph === 'drum') return `<div class="intro"><div class="ico">🥁</div><div class="nm">لحظة التتويج</div><div class="ds">من سيرفع الكأس اليوم؟</div></div>`;
    if (P.ph === 'reveal') { const n = rk.length, k = P.rev || 0; const shown = rk.slice(n - k).reverse(); return `<div class="intro"><div class="nm" style="font-size:80px">الترتيب النهائي</div></div><div class="order-list" style="max-width:1300px">${shown.map(t => `<div class="o" style="border-inline-start:12px solid ${t.color};animation:rise .6s both"><span class="n">${t.rank}</span>${esc(t.name)}<span style="margin-inline-start:auto;font-weight:800;direction:ltr">${t.score}</span></div>`).join('')}${Array.from({ length: n - k }).map(() => '<div class="o" style="opacity:.25"><span class="n">؟</span>…</div>').join('')}</div>`; }
    if (P.ph === 'winner') {
      if (P.tie) return `<div class="winner"><div class="cr">⚖️</div><div class="n" style="--tc:var(--brand2)">تعادل!</div><div class="s">${P.tie.map(id => esc(this.tm(id).name)).join(' و ')} — جولة كسر التعادل</div></div>`;
      const w = rk[0]; const top3 = rk.slice(0, 3); const ord = [top3[1], top3[0], top3[2]].filter(Boolean); const H = { 1: 520, 2: 400, 3: 300 };
      return `<div class="row" style="justify-content:center;gap:80px"><div class="winner" style="flex:none"><div class="cr">👑</div><div class="n" style="--tc:${w.color}">${esc(w.name)}</div><div class="s">بطل ميدان بناء — ${w.score} نقطة</div></div><div class="podium" style="height:560px">${ord.map(t => `<div class="p" style="--tc:${t.color};height:${H[t.rank] || 260}px"><div class="k">${t.rank === 1 ? '🥇' : t.rank === 2 ? '🥈' : '🥉'}</div><div class="n">${esc(t.name)}</div><div class="s">${t.score}</div></div>`).join('')}</div></div>`;
    }
    if (P.ph === 'awards') { const M = P.mvp || {}; return `<div class="intro"><div class="nm" style="font-size:84px">🌟 لوحة الشرف</div></div><div class="rules" style="margin-top:24px;gap:20px;grid-template-columns:repeat(${this.teams().length},1fr)"><div class="r" style="grid-column:1/-1;text-align:center;padding:22px"><b>نجم الميدان (أكثر الإجابات الصحيحة)</b><span style="font-size:64px;font-family:var(--fh);font-weight:900">${esc(M.best || '—')}</span></div>${this.teams().map(t => `<div class="r" style="border-top:8px solid ${t.color};text-align:center;padding:22px"><b style="font-size:30px">الأكثر مشاركة في ${esc(t.name)}</b><span style="font-size:44px;font-family:var(--fh);font-weight:800">${esc((M.active || {})[t.id] || '—')}</span></div>`).join('')}</div>`; }
    return '';
  }
  wheelHTML(P) {
    const I = P.I, W = D.WHEEL, n = W.length, t = this.tm(I.team);
    const cols = ['#22A391', '#13706F', '#A3D68F', '#0E5560', '#7FB77E', '#1B8A82'];
    let paths = ''; const R = 300, cx = 320, cy = 320;
    for (let i = 0; i < n; i++) { const a0 = (i / n) * 2 * Math.PI - Math.PI / 2, a1 = ((i + 1) / n) * 2 * Math.PI - Math.PI / 2; const x0 = cx + R * Math.cos(a0), y0 = cy + R * Math.sin(a0), x1 = cx + R * Math.cos(a1), y1 = cy + R * Math.sin(a1); const am = (a0 + a1) / 2; const tx = cx + R * .62 * Math.cos(am), ty = cy + R * .62 * Math.sin(am); const label = W[i].s || W[i].t; let deg = am * 180 / Math.PI; deg = ((deg % 360) + 360) % 360; const rot = (deg > 90 && deg < 270) ? deg + 180 : deg; paths += `<path d="M${cx},${cy} L${x0},${y0} A${R},${R} 0 0 1 ${x1},${y1} Z" fill="${cols[i % cols.length]}" stroke="#04141A" stroke-width="4"/><text x="${tx}" y="${ty}" fill="${[0, 2, 4].includes(i % 6) ? '#04141A' : '#fff'}" font-size="30" font-weight="800" font-family="Readex Pro, IBM Plex Sans Arabic, sans-serif" text-anchor="middle" dominant-baseline="middle" transform="rotate(${rot} ${tx} ${ty})">${esc(label)}</text>`; }
    const res = I.res;
    return `<div class="wheel-wrap"><div class="wheel"><div class="ptr"></div><svg viewBox="0 0 640 640" data-wheel data-target="${res ? res.i : -1}"><circle cx="320" cy="320" r="312" fill="#0A2028"/>${paths}</svg><div class="hub">🎡</div></div><div class="wres"><div class="mini-bz" style="--tc:${t.color}">دور ${esc(t.name)}</div>${I.rep ? `<div class="mut" style="font-size:32px;margin-top:16px">يدير العجلة: ${esc(I.rep)}</div>` : ''}${res ? `<div class="t" style="margin-top:40px;animation-delay:5.2s;animation-fill-mode:both">${esc(res.t)}</div>` : '<div class="mut" style="font-size:34px;margin-top:40px">بانتظار التدوير…</div>'}</div></div>`;
  }
  afterMain(P) {
    const w = $('[data-wheel]', this.main);
    if (w) { const ti = +w.dataset.target; if (ti >= 0) { const n = D.WHEEL.length; const seg = 360 / n; const final = 360 * 6 - (ti * seg + seg / 2); const already = this._spun === P.I.qid; if (already) { w.style.transition = 'none'; w.style.transform = `rotate(${final}deg)`; } else { this._spun = P.I.qid; requestAnimationFrame(() => requestAnimationFrame(() => { w.style.transform = `rotate(${final}deg)`; })); } } }
  }
  boxesHTML(P) { const I = P.I, t = this.tm(I.team); return `<div style="text-align:center;margin-bottom:26px"><span class="mini-bz" style="--tc:${t.color}">🎁 دور ${esc(t.name)}${I.rep ? ' — ' + esc(I.rep) : ''}</span></div><div class="boxes">${(P.boxes || []).map((b, i) => b[0] ? `<div class="bx op" style="--tc:${this.tm(b[2]).color}">${esc(b[1])}</div>` : `<div class="bx">${i + 1}</div>`).join('')}</div>`; }
  tabooHTML(P) { const I = P.I, t = this.tm(I.team); return `<div class="intro"><div class="ico">🤐</div><div class="mini-bz" style="--tc:${t.color};margin-top:20px">${esc(t.name)}</div><div class="ds">${I.repName ? 'يصف الآن: <b style="color:var(--tx)">' + esc(I.repName) + '</b> (الكلمة في جواله فقط)' : 'اختيار الواصف…'}</div><div class="nm" style="font-size:180px;color:var(--brand2)">${I.got || 0}</div><div class="ds">كلمات صحيحة${I.rv && I.res2 ? ' — +' + (I.res2.pts || 0) + ' نقطة' : ''}</div></div>`; }
  liveHTML(P) { const I = P.I; const pl = (I.places || []).map((id, i) => { const t = this.tm(id); return `<div class="o" style="border-inline-start:12px solid ${t.color}"><span class="n">${i + 1}</span>${esc(t.name)}</div>`; }).join(''); return `<div class="intro"><div class="ico" style="font-size:110px">🏃</div><div class="nm" style="font-size:96px">${esc(I.q)}</div><div class="ds" style="color:var(--tx);font-size:46px">${esc(I.desc)}</div></div>${pl ? `<div class="order-list" style="max-width:900px">${pl}</div>` : ''}${P.ph === 'vote' ? `<div class="status-line">🗳️ تصويت الجمهور: صوّتوا لأفضل فريق (غير فريقكم) — الأصوات: <b data-dyn="vote">${I.vc || 0}</b></div>` : ''}${I.vr ? `<div class="status-line">🗳️ اختيار الجمهور: <b>${I.vr.winners.map(id => esc(this.tm(id).name)).join('، ') || '—'}</b> (+10)</div>` : ''}`; }
}
