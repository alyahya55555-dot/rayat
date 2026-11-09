/* رايات — أدوات عامة والاتصال (منقول من «ميدان بناء» ومكيّف): غرفة Claude، خوادم MQTT عامة برسائل موقّعة، وBroadcastChannel محليًا */
const ARTIFACT_URL = '%%ARTIFACT_URL%%';
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
function joinUrl(code, fp) { const base = LS.get('rayat.url', '') || pageBase() || ARTIFACT_URL; if (!base || base.startsWith('%%')) return ''; return base.split('#')[0] + '#join-' + code + (fp ? '-' + fp : ''); }
function qrSvg(text) { try { const q = qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 8, margin: 2, scalable: true }); } catch (e) { return ''; } }

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
    try { this.bc = new BroadcastChannel('rayat-v1'); this.bc.onmessage = e => this.onBC(e.data); } catch (e) { this.bc = null; }
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
    const name = 'rayat-' + code;
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
    const k = 'rayat.hfp.' + this.code; let t = null; try { t = sessionStorage.getItem(k); } catch (e) { }
    if (!t) { try { sessionStorage.setItem(k, fp); } catch (e) { } return true; }
    if (t === fp) return true; this.untrusted.add(fp); return false;
  }
  resetTrust() { try { sessionStorage.removeItem('rayat.hfp.' + this.code); } catch (e) { } this.expectFp = null; this.untrusted.clear(); }
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

/* ===== الاتصال بلا خادم: بثّ عبر خوادم MQTT عامة مجانية + توقيع رقمي لكل رسالة ===== */
// يعمل حين تُفتح المنصة خارج Claude (مثل GitHub Pages). لا حسابات للطلاب ولا خادم تديره.
// حاسوب المشرف يتصل بكل الخوادم معًا ويجسر بينها، والجوال يتصل بأول خادم يستجيب.
const IN_CLAUDE = !!(window.claude && typeof window.claude.use === 'function');
const BROKERS = window.RAYAT_BROKERS || [
  { h: 'broker.emqx.io', p: 8084, path: '/mqtt', ssl: true, n: 'EMQX' },
  { h: 'broker.hivemq.com', p: 8884, path: '/mqtt', ssl: true, n: 'HiveMQ' },
  { h: 'test.mosquitto.org', p: 8081, path: '/mqtt', ssl: true, n: 'Mosquitto' }
];
const TOPIC_ROOT = 'rayat-war/v1/';

// توقيع ECDSA: يمنع أي جهاز من انتحال صوت المشرف أو هوية طالب آخر
const Sign = {
  ok: !!(window.crypto && crypto.subtle),
  async load(store, key) {
    try { const j = JSON.parse(store.getItem(key)); if (j && j.priv && j.pub) { const priv = await crypto.subtle.importKey('jwk', j.priv, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']); return { priv, pub: j.pub, fp: j.fp }; } } catch (e) { }
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const pub = Crypt.b64(await crypto.subtle.exportKey('raw', kp.publicKey)), fp = await this.fp(pub), jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
    try { store.setItem(key, JSON.stringify({ priv: jwk, pub, fp })); } catch (e) { }
    return { priv: kp.privateKey, pub, fp };
  },
  fpc: new Map(),
  async fp(pub) { if (this.fpc.has(pub)) return this.fpc.get(pub); const h = await crypto.subtle.digest('SHA-256', Crypt.unb64(pub)); const f = Array.from(new Uint8Array(h)).slice(0, 6).map(b => b.toString(16).padStart(2, '0')).join(''); this.fpc.set(pub, f); return f; },
  async sign(priv, str) { return Crypt.b64(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, priv, new TextEncoder().encode(str))); },
  vk: new Map(),
  async verify(pub, sig, str) {
    try { let k = this.vk.get(pub); if (!k) { k = await crypto.subtle.importKey('raw', Crypt.unb64(pub), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']); this.vk.set(pub, k); } return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, k, Crypt.unb64(sig), new TextEncoder().encode(str)); } catch (e) { return false; }
  }
};

class Mq {
  constructor(net) { this.net = net; this.role = net.role; this.links = []; this.cid = this.role[0] + uid(11); this.code = null; this.active = null; this.key = null; this.stats = { in: 0, out: 0, bad: 0 }; }
  get multi() { return this.role === 'host'; }
  async ensureKey() {
    if (this.key || !Sign.ok) return this.key;
    if (!this._kp) this._kp = this.role === 'host' ? Sign.load(localStorage, 'rayat.hostSign') : Sign.load(sessionStorage, 'rayat.sign');
    this.key = await this._kp; return this.key;
  }
  start(code) {
    if (typeof Paho === 'undefined' || !Paho.Client) { this.failed = 'no-lib'; this.net.fire('status'); return; }
    if (this.code === code && this.links.length) return;
    this.stop(); this.code = code; this.base = TOPIC_ROOT + code + '/'; this.gen = (this.gen || 0) + 1;
    const gen = this.gen;
    this.ensureKey().then(() => { if (gen !== this.gen) return; if (this.multi) BROKERS.forEach((b, i) => this.openHost(b, i)); else this.attempt(0, gen); });
  }
  stop() { this.gen = (this.gen || 0) + 1; this.links.forEach(l => { if (!l) return; l.dead = true; clearTimeout(l.t); try { l.c && l.c.disconnect(); } catch (e) { } }); this.links = []; this.active = null; }
  client(b, i, l) {
    const c = new Paho.Client(b.h, b.p, b.path || '/mqtt', this.cid + '-' + i + '-' + (l.tries++));
    c.onMessageArrived = m => this.onMsg(m.destinationName, m.payloadString, l);
    return c;
  }
  connOpts(b, onSuccess, onFailure) {
    const o = { useSSL: !!b.ssl, timeout: 6, keepAliveInterval: 20, cleanSession: true, mqttVersion: 4, onSuccess, onFailure };
    if (this.role !== 'host') { const w = new Paho.Message(JSON.stringify({ bye: 1 })); w.destinationName = this.base + 'p/' + this.cid; w.qos = 0; o.willMessage = w; }
    return o;
  }
  // المشرف: يتصل بكل الخوادم ويجسر بينها، ويعيد المحاولة مع كل خادم وحده
  openHost(b, i) {
    const l = { b, i, up: false, dead: false, tries: 0 }; this.links[i] = l;
    const connect = () => {
      if (l.dead) return;
      let c; try { c = this.client(b, i, l); } catch (e) { return retry(); }
      l.c = c; c.onConnectionLost = () => { l.up = false; this.net.fire('status'); retry(); };
      try { c.connect(this.connOpts(b, () => { if (l.dead) { try { c.disconnect(); } catch (e) { } return; } l.up = true; l.tries = 0; c.subscribe(this.base + 'p/+', { qos: 1 }); c.subscribe(this.base + 'h/+', { qos: 1 }); this.net.fire('status'); this.net.fire('mqup'); }, () => { l.up = false; retry(); })); } catch (e) { retry(); }
    };
    const retry = () => { if (l.dead) return; clearTimeout(l.t); l.t = setTimeout(connect, Math.min(10000, 800 * Math.pow(1.7, Math.min(l.tries, 6)))); };
    connect();
  }
  // الجوال وشاشة العرض: خادم واحد بالأولوية (الأول دائمًا إن كان متاحًا) حتى يصل الجميع عبر الخادم نفسه
  attempt(idx, gen) {
    if (gen !== this.gen) return;
    const b = BROKERS[idx % BROKERS.length], i = idx % BROKERS.length;
    const l = { b, i, up: false, dead: false, tries: 0 }; this.links = [l];
    let c; try { c = this.client(b, i, l); } catch (e) { setTimeout(() => this.attempt(idx + 1, gen), 400); return; }
    l.c = c;
    c.onConnectionLost = () => { l.up = false; this.active = null; this.net.fire('status'); if (gen === this.gen && !l.dead) setTimeout(() => this.attempt(0, gen), 1000); };
    try {
      c.connect(this.connOpts(b, () => {
        if (gen !== this.gen || l.dead) { try { c.disconnect(); } catch (e) { } return; }
        l.up = true; this.active = l; c.subscribe(this.base + 'h/+', { qos: 1 }); this.net.fire('status'); this.net.fire('mqup');
        // إن لم يكن هذا الخادم الأول، نحاول العودة إليه لاحقًا
        if (i !== 0) { clearTimeout(this.backT); this.backT = setTimeout(() => this.tryPrimary(gen), 30000); }
      }, () => { if (gen === this.gen && !l.dead) setTimeout(() => this.attempt(idx + 1, gen), 300); }));
    } catch (e) { setTimeout(() => this.attempt(idx + 1, gen), 400); }
  }
  tryPrimary(gen) {
    if (gen !== this.gen || !this.active || this.active.i === 0) return;
    const b = BROKERS[0], l = { b, i: 0, up: false, dead: false, tries: 0 };
    let c; try { c = this.client(b, 0, l); } catch (e) { return; } l.c = c;
    c.connect(this.connOpts(b, () => {
      if (gen !== this.gen) { try { c.disconnect(); } catch (e) { } return; }
      const old = this.active; l.up = true; this.links = [l]; this.active = l; c.subscribe(this.base + 'h/+', { qos: 1 });
      c.onConnectionLost = () => { l.up = false; this.active = null; this.net.fire('status'); if (gen === this.gen) setTimeout(() => this.attempt(0, gen), 1000); };
      if (old) { old.dead = true; try { old.c.disconnect(); } catch (e) { } }
      this.net.fire('status'); this.net.fire('mqup');
    }, () => { clearTimeout(this.backT); this.backT = setTimeout(() => this.tryPrimary(gen), 30000); }));
  }
  upCount() { return this.links.filter(l => l && l.up).length; }
  // نشر رسالة موقّعة
  async pub(sub, data, qos = 1) {
    const k = await this.ensureKey(); const d = JSON.stringify(data);
    const env = k ? JSON.stringify({ k: k.pub, s: await Sign.sign(k.priv, sub + '|' + d), d }) : JSON.stringify({ d });
    const targets = this.multi ? this.links.filter(l => l && l.up) : (this.active && this.active.up ? [this.active] : []);
    targets.forEach(l => { try { const m = new Paho.Message(env); m.destinationName = this.base + sub; m.qos = qos; l.c.send(m); this.stats.out++; } catch (e) { } });
    return targets.length;
  }
  async onMsg(topic, payload, link) {
    this.stats.in++;
    if (!topic.startsWith(this.base)) return;
    const sub = topic.slice(this.base.length);
    let env; try { env = JSON.parse(payload); } catch (e) { return; }
    if (sub.startsWith('p/')) {
      if (!this.multi) return;
      const cid = sub.slice(2), peer = 'mq:' + cid;
      if (env.bye) { this.net.fire('bcbye', peer); return; }
      if (!env.k || !env.s || typeof env.d !== 'string') { this.stats.bad++; return; }
      if (!(await Sign.verify(env.k, env.s, sub + '|' + env.d))) { this.stats.bad++; return; }
      let pr; try { pr = JSON.parse(env.d); } catch (e) { return; }
      const fp = await Sign.fp(env.k);
      // منع إعادة الإرسال القديم: كل رسالة تحمل عدّادًا متزايدًا
      const last = this.seen || (this.seen = new Map()); const prev = last.get(cid);
      if (prev && prev.k === env.k && typeof pr._n === 'number' && pr._n <= prev.n) return;
      last.set(cid, { k: env.k, n: pr._n || 0 });
      this.net.fire('bcpres', peer, pr, pr.c, fp);
      return;
    }
    if (sub.startsWith('h/')) {
      const t = { 'h/s': 'state', 'h/r': 'roster', 'h/v': 'priv' }[sub]; if (!t) return;
      if (!env.k || !env.s || typeof env.d !== 'string') { this.stats.bad++; return; }
      const fp = await Sign.fp(env.k);
      if (this.role === 'host') { if (this.key && env.k !== this.key.pub && t === 'state') this.net.fire('foreignhost', fp); return; }
      if (!this.net.trustHost(fp)) { this.stats.bad++; return; }
      if (!(await Sign.verify(env.k, env.s, sub + '|' + env.d))) { this.stats.bad++; return; }
      let d; try { d = JSON.parse(env.d); } catch (e) { return; }
      this.net.fire(t, d, { peer: 'mq-host', viaMQ: true });
    }
  }
  label() {
    const up = this.upCount();
    if (this.failed === 'no-lib') return { cls: 'off', t: 'مكتبة البث لم تُحمَّل' };
    if (this.multi) return up ? { cls: 'on', t: `متصل بالإنترنت عبر ${up} من ${BROKERS.length} خوادم بث` } : { cls: 'warn', t: 'جارٍ الاتصال بخوادم البث…' };
    return up ? { cls: 'on', t: 'متصل عبر ' + (this.active ? this.active.b.n : 'الإنترنت') } : { cls: 'warn', t: 'جارٍ الاتصال…' };
  }
}
