/* رايات — الأصوات: تسجيلات حقيقية مرخّصة فقط (المصادر في assets/sfx/SOURCE.txt)، بلا موسيقى ولا طبول ولا أصوات بشرية. المؤثرات قصيرة ومنخفضة كي يبقى صوت المشرف مسموعًا.
   الحصر الكامل للعينات واستعمالها: node test/rayat.sfx.audit.js */
const SFX_DATA = '%%SFX%%';
const SFX = {
  ctx: null, on: true, buf: {}, dec: {}, fail: [], live: new Set(), vol: .85, susp: false,
  // الكتم على المخرج الرئيس: يشمل الخلفية المستمرة والأصوات الجارية والمجدولة معًا، ورفعه لا ينشئ خلفية ثانية
  gainNow() { return this.on && !this.ext ? this.vol : 0; },
  // كتم خارجي: خريطة المشرف المضمّنة تسكت إذا كانت مخفية أو وُجدت شاشة عرض مستقلة، فلا يتكرر الصوت العام من جهازين
  setExt(v) { if (this.ext === !!v) return; this.ext = !!v; if (this.master) this.master.gain.value = this.gainNow(); },
  setVol(v) { this.vol = Math.max(0, Math.min(1, v)); if (this.master) this.master.gain.value = this.gainNow(); },
  setOn(v) { this.on = !!v; if (this.master) this.master.gain.value = this.gainNow(); },
  unlock() { try { if (!this.ctx) { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); this.master = this.ctx.createGain(); this.master.gain.value = this.gainNow(); this.master.connect(this.ctx.destination); this.load(); } if (this.ctx.state === 'suspended' && !this.susp) this.ctx.resume().catch(() => { }); } catch (e) { this.fail.push('ctx: ' + (e && e.message)); } },
  // فك ترميز كل العينات فور تفعيل الصوت؛ الفشل يُسجَّل في SFX.fail ويظهر في SFX.status()
  load() { if (typeof SFX_DATA !== 'object' || !SFX_DATA) { this.fail.push('لا عينات مضمّنة'); return; }
    Object.entries(SFX_DATA).forEach(([k, b64]) => { try { const bin = atob(b64), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
      this.dec[k] = this.ctx.decodeAudioData(a.buffer).then(b => { this.buf[k] = b; return b; }).catch(e => { this.fail.push(k); console.warn('رايات: تعذّر تحميل الصوت', k, e && e.message); return null; }); } catch (e) { this.fail.push(k); console.warn('رايات: تعذّر تحميل الصوت', k); } }); },
  status() { return { total: typeof SFX_DATA === 'object' && SFX_DATA ? Object.keys(SFX_DATA).length : 0, loaded: Object.keys(this.buf).length, failed: this.fail.slice(), on: this.on, vol: this.vol, state: this.ctx ? this.ctx.state : 'none', playing: this.live.size, ambient: !!this.amb }; },
  ready() { return !!this.ctx && (this.ctx.state === 'running' || this.susp); },
  rec(k, v = .9, at = 0, rate = 1) { if (!this.ready()) return null; const c = this.ctx, b = this.buf[k]; if (this.live.size >= 40 && k !== 'nature') return null;
    if (!b) { const d = this.dec[k]; if (d) { const t0 = c.currentTime; d.then(bb => { if (!bb) return; const late = c.currentTime - t0; if (late < at + .35) this.rec(k, v, Math.max(0, at - late), rate); }); } else if (!this.fail.includes(k)) { this.fail.push(k); console.warn('رايات: عينة صوت غير موجودة', k); } return null; }
    const s = c.createBufferSource(), g = c.createGain(); s.buffer = b; s.playbackRate.value = rate; g.gain.value = v; s.connect(g).connect(this.master); s.start(c.currentTime + Math.max(0, at)); this.live.add(s); s.onended = () => this.live.delete(s); if (this.hist) this.hist.push({ k, at: +(c.currentTime + Math.max(0, at)).toFixed(2) }); return s; },
  ambient() { if (!this.ready() || this.amb) return; const start = () => { if (this.amb || !this.buf.nature) return; const s = this.rec('nature', .16); if (s) { s.loop = true; this.live.delete(s); this.amb = s; } }; if (this.buf.nature) start(); else if (this.dec.nature) this.dec.nature.then(start); },
  // إيقاف كل الأصوات الجارية والمجدولة (عند التخطي) ما عدا الخلفية
  stopAll() { this.live.forEach(s => { try { s.stop(); } catch (e) { } }); this.live.clear(); },
  // الإيقاف المؤقت: يتجمد زمن الصوت مع زمن المشهد، فتبقى الأصوات المجدولة متزامنة عند الاستئناف
  suspend(v) { if (!this.ctx || this.susp === !!v) return; this.susp = !!v; try { if (v) this.ctx.suspend(); else this.ctx.resume(); } catch (e) { } },
  // dur: مدة الصوت المتكرر (زحف أو التحام) بالثواني
  play(k, at = 0, dur = 0, o = {}) { if (!this.ready()) return; const r = (a, b) => a + Math.random() * (b - a); o = o || {};
    try { switch (k) {
      // المشاة: خطوات جماعية بلا صهيل؛ وإن كان معهم قائد راكب (الجيش المختلط) فحوافر خفيفة في الخلفية
      case 'march': for (let t = 0; t < dur; t += 1.7) this.rec(Math.round(t / 1.7) % 2 ? 'w-march2' : 'w-march1', 1.3, at + t); if (o.mixed) for (let t = .4; t < dur; t += 1.9) this.rec(Math.round(t / 1.9) % 2 ? 'w-hooves2' : 'w-hooves1', .35, at + t); break;
      // الفرسان: عدو حقيقي متكرر بإيقاع سريع من ثلاث طبقات متداخلة (كأنها سرية)، وصهيل قوي عند الانطلاق، ونفخة عند التوقف
      case 'gallop': { this.rec('w-neigh3', 1.05, at); this.rec('w-neigh1', .7, at + .35, .96);
        [[0, 1.1, 1], [.14, .8, .96], [.29, .62, 1.05]].forEach(([off, v, rt]) => { for (let t = .25 + off; t < dur; t += .41 * (1 / rt) + r(-.015, .015)) this.rec('gallop', v * r(.9, 1.05), at + t, rt * r(.97, 1.03)); });
        for (let t = .5; t < dur; t += 1.7) this.rec(Math.round(t / 1.7) % 2 ? 'w-hooves2' : 'w-hooves1', .45, at + t, 1.15);
        if (dur > 1.2) this.rec('w-snort1', .7, at + dur + .1); break; }
      case 'clash': { const S = ['w-clash1', 'w-clash2', 'w-clash3', 'w-clash4', 'w-sword1', 'w-sword2', 'w-sword3', 'w-shield1', 'w-shield2', 'w-spear1', 'w-spear2']; const L = o.cav ? ['w-spear1', 'w-spear2', 'w-shield1', 'w-shield2', 'w-clash1', 'w-clash3'] : S; for (let t = 0; t < dur; t += r(.14, .3)) this.rec(L[Math.floor(Math.random() * L.length)], r(.9, 1.4) * (o.cav ? 1.12 : 1), at + t, r(.92, 1.08));
        if (o.cav) { this.rec('w-neigh1', .95, at + .1); this.rec('w-neigh2', .8, at + dur * .55, 1.04); this.rec('w-snort1', .6, at + dur * .8); } else if (o.mixed) this.rec('w-neigh1', .45, at + dur * .5); break; }
      case 'raise': this.rec('swish', .7, at); this.rec('land', .35, at + .6); break;
      case 'settle': this.rec('w-steps-grass', .8, at); this.rec('step', .4, at + 1.4); this.rec('land', .4, at + 2.9); break;
      case 'build': ['hammer-a', 'hammer-b', 'hammer-c', 'hammer-d', 'hammer-a', 'hammer-c'].forEach((h, i) => this.rec(h, .8, at + i * .42 + r(-.07, .07), .95 + i * .03)); this.rec('stone', .5, at + 2.6); break;
      // المنجنيق خطوة خطوة: شدّ الذراع (صرير خشب متقطع)، ثم الإطلاق (ضربة الذراع في العارضة وصفير الحجر)، ثم ارتطامه بالسور وتساقط الحجارة
      case 'catwind': for (let i = 0; i < 4; i++) this.rec('creak', .75 + i * .08, at + i * .26 + r(0, .05), .7 + i * .06); break;
      case 'catfire': this.rec('wood-hit', 1.1, at, .72); this.rec('creak', .6, at + .02, 1.1); this.rec('swish', 1, at + .1, .5); break;
      case 'catimpact': this.rec('impact', 1.1, at, .8); this.rec('stone', 1.1, at + .02); this.rec('stone2', .9, at + .12, .9); this.rec('debris', 1, at + .2); this.rec('stone', .6, at + .45, 1.12); this.rec('debris', .6, at + .7, .9); break;
      case 'loot': for (let i = 0; i < 6; i++) this.rec('coin', .5, at + i * .12, .9 + i * .05); this.rec('coins', .7, at + .3); break;
      case 'ally': this.rec('door-open', .6, at); for (let i = 0; i < 3; i++) this.rec('coin', .35, at + .6 + i * .2, 1 + i * .08); break;
      case 'betray': this.rec('break', 1, at); this.rec('kill', .7, at + .1); break;
      case 'unally': this.rec('door-close', .7, at); break;
      case 'phase': this.rec('impact', .8, at); this.rec('land', .6, at + .2); this.rec('w-neigh2', .5, at + .8); break;
      case 'question': this.rec('step', .5, at); this.rec('coin', .3, at + .1, 1.2); break;
      case 'reveal': this.rec('impact', .45, at); break;
      case 'buzz': this.rec('hit', 1, at); this.rec('land', .7, at + .03); break;
      case 'right': this.rec('coin', .9, at); this.rec('impact', .4, at + .05); break;
      case 'wrong': this.rec('kill', .9, at); break;
      case 'harvest': this.rec('coins2', 1.6, at); this.rec('coin', .3, at + .25, 1.1); break;
      case 'hold': this.rec('w-shield1', .9, at); this.rec('w-shield2', .8, at + .35); break;
      case 'fall': this.rec('debris', .9, at); this.rec('stone2', .8, at + .15); break;
      case 'sail': for (let t = 0; t < dur; t += r(1.0, 1.5)) this.rec('splash', .34, at + t, r(.8, 1)); this.rec('creak', .5, at + .2, .7); break;
      case 'arrows': for (let t = 0; t < dur; t += .38) this.rec('bow', .32, at + t, .9 + (t * 7 % 3) * .06); break;
      case 'crown': this.rec('swish', .8, at); this.rec('w-neigh2', .7, at + .25); this.rec('w-shield1', .8, at + .7); this.rec('swish', .6, at + 1.05, .85); this.rec('w-shield2', .7, at + 1.55); this.rec('w-neigh3', .5, at + 1.9); for (let i = 0; i < 8; i++) this.rec('coin', .4, at + 2.3 + i * r(.08, .14), .9 + i * .03); this.rec('coins', .6, at + 2.6); break;
    } } catch (e) { } }
};
