/* رايات — الأصوات: تسجيلات حقيقية مرخّصة فقط (المصادر في assets/sfx/SOURCE.txt)، بلا موسيقى ولا طبول ولا أصوات بشرية */
const SFX_DATA = '%%SFX%%';
const SFX = {
  ctx: null, on: true, buf: {}, vol: .85,
  setVol(v) { this.vol = Math.max(0, Math.min(1, v)); if (this.master) this.master.gain.value = this.vol; },
  unlock() { try { if (!this.ctx) { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); this.master = this.ctx.createGain(); this.master.gain.value = this.vol; this.master.connect(this.ctx.destination); this.load(); } if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => { }); } catch (e) { } },
  load() { if (typeof SFX_DATA !== 'object' || !SFX_DATA) return;
    Object.entries(SFX_DATA).forEach(([k, b64]) => { try { const bin = atob(b64), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); this.ctx.decodeAudioData(a.buffer).then(b => { this.buf[k] = b; }).catch(() => { }); } catch (e) { } }); },
  ready() { return this.on && this.ctx && this.ctx.state === 'running'; },
  rec(k, v = .9, at = 0, rate = 1) { const b = this.buf[k]; if (!b || !this.ready()) return null; const c = this.ctx, s = c.createBufferSource(), g = c.createGain(); s.buffer = b; s.playbackRate.value = rate; g.gain.value = v; s.connect(g).connect(this.master); s.start(c.currentTime + Math.max(0, at)); return s; },
  ambient() { if (!this.ready() || this.amb || !this.buf.nature) return; const s = this.rec('nature', .16); if (s) { s.loop = true; this.amb = s; } },
  // dur: مدة الصوت المتكرر (زحف أو التحام) بالثواني
  play(k, at = 0, dur = 0) { if (!this.ready()) return; const r = (a, b) => a + Math.random() * (b - a);
    try { switch (k) {
      case 'march': for (let t = 0; t < dur; t += 1.7) this.rec(Math.round(t / 1.7) % 2 ? 'w-march2' : 'w-march1', 1.3, at + t); this.rec('w-neigh2', .5, at + .1); break;
      case 'gallop': for (let t = 0; t < dur; t += 1.6) this.rec(Math.round(t / 1.6) % 2 ? 'w-hooves2' : 'w-hooves1', 1.1, at + t); this.rec('w-neigh3', .6, at + .2); break;
      case 'clash': { const S = ['w-clash1', 'w-clash2', 'w-clash3', 'w-clash4', 'w-sword1', 'w-sword2', 'w-sword3', 'w-shield1', 'w-shield2', 'w-spear1', 'w-spear2']; for (let t = 0; t < dur; t += r(.14, .3)) this.rec(S[Math.floor(Math.random() * S.length)], r(.9, 1.4), at + t, r(.92, 1.08)); this.rec('w-neigh1', .5, at + dur * .5); break; }
      case 'raise': this.rec('swish', .7, at); this.rec('land', .35, at + .6); break;
      case 'settle': this.rec('w-steps-grass', .8, at); this.rec('step', .4, at + 1.4); this.rec('land', .4, at + 2.9); break;
      case 'build': ['hammer-a', 'hammer-b', 'hammer-c', 'hammer-d', 'hammer-a', 'hammer-c'].forEach((h, i) => this.rec(h, .8, at + i * .42, .95 + i * .03)); this.rec('stone', .5, at + 2.6); break;
      case 'catapult': this.rec('creak', 1, at, .8); this.rec('wood-hit', .7, at + .3, .8); this.rec('swish', 1, at + .4, .55); this.rec('stone', 1, at + .95); this.rec('debris', .7, at + 1.05); break;
      case 'loot': for (let i = 0; i < 6; i++) this.rec('coin', .5, at + i * .12, .9 + i * .05); this.rec('coins', .7, at + .3); break;
      case 'ally': this.rec('door-open', .6, at); for (let i = 0; i < 3; i++) this.rec('coin', .35, at + .6 + i * .2, 1 + i * .08); break;
      case 'betray': this.rec('break', 1, at); this.rec('kill', .7, at + .1); break;
      case 'unally': this.rec('door-close', .7, at); break;
      case 'phase': this.rec('impact', .8, at); this.rec('land', .6, at + .2); this.rec('w-neigh2', .5, at + .8); break;
      case 'question': this.rec('step', .5, at); this.rec('coin', .3, at + .1, 1.2); break;
      case 'reveal': this.rec('impact', .45, at); break;
      case 'correct': this.rec('coin', .8, at); break;
      case 'buzz': this.rec('hit', 1, at); this.rec('land', .7, at + .03); break;
      case 'right': this.rec('coin', .9, at); this.rec('impact', .4, at + .05); break;
      case 'wrong': this.rec('kill', .9, at); break;
      case 'tick': this.rec('hammer-d', .3, at, 1.6); break;
      case 'harvest': this.rec('coins2', .55, at); break;
      case 'sail': for (let t = 0; t < dur; t += 1.1) this.rec('splash', .28, at + t, .85 + (t % 2) * .1); break;
      case 'arrows': for (let t = 0; t < dur; t += .38) this.rec('bow', .32, at + t, .9 + (t * 7 % 3) * .06); break;
      case 'join': this.rec('step', .35, at); break;
      case 'crown': this.rec('big_kill', .7, at); [.4, .8, 1.2, 1.6].forEach(t => this.rec('impact', .6, at + t, 1.2)); for (let i = 0; i < 8; i++) this.rec('coin', .4, at + 1.8 + i * .1, .9 + i * .03); break;
    } } catch (e) { } }
};
