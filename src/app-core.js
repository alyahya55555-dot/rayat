/* ===== ميدان بناء — الأساس: أدوات، أصوات، اتصال، المسرح ===== */
const D = window.BENA_DATA, { Engine } = window.BENA_ENGINE;
const ARTIFACT_URL = '%%ARTIFACT_URL%%';
const LOGO_DEFAULT = '%%LOGO%%';
const SFX_DATA = '%%SFX%%'; // تسجيلات حقيقية من Kenney (CC0 و MIT): مطارق، عملات، اصطدامات، طبيعة — بلا موسيقى ولا أصوات بشرية
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

// ---------- المؤثرات الصوتية: تسجيلات حقيقية مرخّصة، بلا موسيقى ولا أصوات بشرية ----------
const SFX = {
  ctx: null, on: true, buf: {}, ambientOn: true, vol: 1,
  setVol(v) { this.vol = Math.max(0, Math.min(1, v)); if (this.master) this.master.gain.value = this.vol; },
  unlock() { try { if (!this.ctx) { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); this.master = this.ctx.createGain(); this.master.gain.value = this.vol; this.master.connect(this.ctx.destination); this.load(); } if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => { }); } catch (e) { } },
  load() {
    if (typeof SFX_DATA !== 'object' || !SFX_DATA) return;
    Object.entries(SFX_DATA).forEach(([k, b64]) => { try { const bin = atob(b64); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); this.ctx.decodeAudioData(a.buffer).then(b => { this.buf[k] = b; }).catch(() => { }); } catch (e) { } });
  },
  rec(k, v = .9, at = 0, rate = 1) { const b = this.buf[k]; if (!b || !this.ctx) return false; const c = this.ctx, s = c.createBufferSource(), g = c.createGain(); s.buffer = b; s.playbackRate.value = rate; g.gain.value = v; s.connect(g).connect(this.master); s.start(c.currentTime + at); return s; },
  noise(d, v = .2, at = 0, freq = 1200, q = .8) { const c = this.ctx, t = c.currentTime + at, len = Math.floor(c.sampleRate * d), b = c.createBuffer(1, len, c.sampleRate), x = b.getChannelData(0); for (let i = 0; i < len; i++) x[i] = (Math.random() * 2 - 1) * (1 - i / len); const s = c.createBufferSource(); s.buffer = b; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q; const g = c.createGain(); g.gain.value = v; s.connect(f).connect(g).connect(this.master); s.start(t); },
  // صوت الطبيعة (طيور وريح) بصوت خافت على شاشة العرض
  ambient() { if (!this.on || !this.ctx || this.ctx.state !== 'running' || this.ambSrc || !this.buf.nature) return; const s = this.rec('nature', .22); if (s) { s.loop = true; this.ambSrc = s; } },
  stopAmbient() { try { this.ambSrc && this.ambSrc.stop(); } catch (e) { } this.ambSrc = null; },
  play(k) {
    if (!this.on || !this.ctx || this.ctx.state !== 'running') return;
    const H = ['hammer-a', 'hammer-b', 'hammer-c', 'hammer-d'];
    try {
      switch (k) {
        case 'build': [0, .22, .44, .7].forEach((t, i) => this.rec(H[i % 4], 1, t, .95 + i * .04)); this.rec('debris', .5, .95); this.rec('coin', .5, 1.2); break;
        case 'coinsoft': this.rec('coin', .35); break;
        case 'buzz': this.rec('hit', 1); this.rec('land', .8, .03); break;
        case 'correct': this.rec('coin', .9); this.rec('impact', .4, .05); break;
        case 'wrong': this.rec('kill', 1); this.rec('debris', .5, .05); break;
        case 'open': this.noise(.35, .14, 0, 2500, .6); break;
        case 'reveal': this.noise(.45, .12, 0, 900, .5); break;
        case 'lead': this.rec('boss', .6); this.rec('coin', .8, .2); break;
        case 'tick': this.rec('hammer-d', .35, 0, 1.6); break;
        case 'timeup': this.rec('boss', .8); break;
        case 'join': this.rec('step', .3); break;
        case 'seg': this.rec('boss', .55); break;
        case 'treasure-in': this.rec('big_kill', .5); this.noise(1.2, .08, .1, 400, .3); break;
        case 'treasure': for (let i = 0; i < 6; i++) this.rec('coin', .5 + i * .05, i * .12, .9 + i * .05); break;
        case 'crack': this.rec('break', .9); this.rec('coin', .8, .2); break;
        case 'deny': this.rec('kill', .9); break;
        case 'theme': this.rec('step', .6); this.rec('land', .5, .15); break;
        case 'draw': for (let i = 0; i < 4; i++) this.rec('coin', .3, i * .15, .9 + i * .1); break;
        // المعارك: أصوات حقيقية مرخّصة لكل هجوم ودفاع وإصابة
        case 'launch-raid': for (let k = 0; k < 7; k++) this.rec('gallop', .9, k * .24, k % 2 ? 1.06 : .96); this.rec('step', .3, .1); break;
        case 'launch-catapult': this.rec('creak', 1, 0, .8); this.rec('wood-hit', .7, .35, .8); this.rec('swish', 1, .45, .55); break;
        case 'launch-fire': this.rec('bow', 1, 0); this.rec('bow', .8, .12, 1.08); this.rec('swish', .9, .3, 1.2); this.rec('swish', .7, .45, 1.35); break;
        case 'block-raid': this.rec('door-close', 1, 0); this.rec('wood-hit', .9, .05, .9); this.rec('wood-hit', .7, .25, 1.05); break;
        case 'block-catapult': this.rec('bow', 1, 0, 1.1); this.rec('bow', .8, .1, .95); this.rec('stone2', .8, .3); break;
        case 'block-fire': this.rec('splash', 1, 0); break;
        case 'hit-raid': this.rec('coins', 1, 0); this.rec('coins2', .9, .25); this.rec('coins', .7, .5, 1.1); break;
        case 'hit-catapult': this.rec('stone', 1, 0); this.rec('impact', .8, .02); this.rec('debris', .6, .2); break;
        case 'hit-fire': this.rec('fire', 1, 0); this.rec('wood-hit', .5, .1, 1.2); break;
        case 'held': this.rec('door-close', .9, 0, .9); this.rec('coin', .5, .3); break;
        case 'council': this.rec('door-open', 1, 0); this.rec('step', .3, .5); break;
        case 'order': this.rec('coins2', .5, 0); break;
        case 'name': this.rec('step', .4, 0); break;
        case 'vs': this.rec('impact', .8); this.rec('hit', .9, .38); break;
      case 'rank': this.rec('impact', .7); break;
        case 'crown': this.rec('big_kill', .7); [.4, .8, 1.2, 1.6].forEach(t => this.rec('impact', .6, t, 1.2)); for (let i = 0; i < 8; i++) this.rec('coin', .4, 1.8 + i * .1, .9 + i * .03); break;
      }
    } catch (e) { }
  }
};
const FX_SOUND = { build: 'build', buzz: 'buzz', correct: 'correct', wrong: 'wrong', open: 'open', reveal: 'reveal', lead: 'lead', timeup: 'timeup', join: 'join', seg: 'seg', 'treasure-in': 'treasure-in', treasure: 'treasure', crack: 'crack', deny: 'deny', theme: 'theme', draw: 'draw', rank: 'rank', crown: 'crown', show: 'open', council: 'council', order: 'order', name: 'name' };

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

