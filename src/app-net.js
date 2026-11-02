/* ===== الاتصال بلا خادم: بثّ عبر خوادم MQTT عامة مجانية + توقيع رقمي لكل رسالة ===== */
// يعمل حين تُفتح المنصة خارج Claude (مثل GitHub Pages). لا حسابات للطلاب ولا خادم تديره.
// حاسوب المشرف يتصل بكل الخوادم معًا ويجسر بينها، والجوال يتصل بأول خادم يستجيب.
const IN_CLAUDE = !!(window.claude && typeof window.claude.use === 'function');
const BROKERS = window.BENA_BROKERS || [
  { h: 'broker.emqx.io', p: 8084, path: '/mqtt', ssl: true, n: 'EMQX' },
  { h: 'broker.hivemq.com', p: 8884, path: '/mqtt', ssl: true, n: 'HiveMQ' },
  { h: 'test.mosquitto.org', p: 8081, path: '/mqtt', ssl: true, n: 'Mosquitto' }
];
const TOPIC_ROOT = 'bena-mydan/v1/';

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
    if (!this._kp) this._kp = this.role === 'host' ? Sign.load(localStorage, 'bena.hostSign') : Sign.load(sessionStorage, 'bena.sign');
    this.key = await this._kp; return this.key;
  }
  start(code) {
    if (typeof Paho === 'undefined' || !Paho.Client) { this.failed = 'no-lib'; this.net.fire('status'); return; }
    if (this.code === code && this.links.length) return;
    this.stop(); this.code = code; this.base = TOPIC_ROOT + code + '/';
    this.ensureKey().then(() => { BROKERS.forEach((b, i) => this.open(b, i)); });
  }
  stop() { this.links.forEach(l => { l.dead = true; try { l.c.disconnect(); } catch (e) { } }); this.links = []; this.active = null; }
  open(b, i) {
    const l = { b, i, up: false, dead: false, tries: 0 };
    this.links[i] = l;
    const connect = () => {
      if (l.dead) return;
      let c; try { c = new Paho.Client(b.h, b.p, b.path || '/mqtt', this.cid + '-' + i + '-' + (l.tries++)); } catch (e) { return retry(); }
      l.c = c;
      c.onConnectionLost = () => { l.up = false; if (this.active === l) this.active = null; this.net.fire('status'); retry(); };
      c.onMessageArrived = m => this.onMsg(m.destinationName, m.payloadString, l);
      const will = new Paho.Message(JSON.stringify({ bye: 1 })); will.destinationName = this.base + 'p/' + this.cid; will.qos = 0;
      const opts = { useSSL: !!b.ssl, timeout: 6, keepAliveInterval: 20, cleanSession: true, mqttVersion: 4,
        onSuccess: () => {
          if (l.dead) { try { c.disconnect(); } catch (e) { } return; }
          l.up = true; l.tries = 0;
          if (this.multi) c.subscribe(this.base + 'p/+', { qos: 1 });
          c.subscribe(this.base + 'h/+', { qos: 1 });
          if (!this.multi) {
            if (!this.active || !this.active.up) { this.active = l; this.links.forEach(o => { if (o !== l && o.up) { o.dead = true; try { o.c.disconnect(); } catch (e) { } } }); }
            else { l.dead = true; try { c.disconnect(); } catch (e) { } return; }
          }
          this.net.fire('status'); this.net.fire('mqup');
        },
        onFailure: () => { l.up = false; retry(); } };
      if (this.role !== 'host') opts.willMessage = will;
      try { c.connect(opts); } catch (e) { retry(); }
    };
    const retry = () => {
      if (l.dead) return;
      if (!this.multi && this.active && this.active !== l && this.active.up) { l.dead = true; return; }
      if (!this.multi && !this.active) { this.links.forEach(o => { if (o.dead && o !== l) { o.dead = false; o.tries = 0; setTimeout(() => this.reopen(o), 300); } }); }
      clearTimeout(l.t); l.t = setTimeout(connect, Math.min(10000, 800 * Math.pow(1.7, Math.min(l.tries, 6))));
    };
    l.reconnect = connect;
    connect();
  }
  reopen(l) { if (!l.dead && (!l.c || !l.up)) l.reconnect(); }
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
