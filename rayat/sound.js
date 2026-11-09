/* أصوات «رايات»: مؤثرات حقيقية مرخّصة فقط من assets/sfx (مصادرها في SOURCE.txt). بلا موسيقى ولا طبول.
   opts.base: مجلد الملفات، أو opts.data: {اسم: base64} في الملف المبني. */
(function (root) {
  // كل حدث على الشاشة ← مجموعة مؤثرات: [الملف، المستوى، التأخير بالثواني، السرعة]
  const RECIPES = {
    question: [['swish', .7]], tick: [['hammer-d', .35, 0, 1.6]],
    march: [0, .22, .44, .66, .88, 1.1].map((t, i) => ['gallop', .85, t, i % 2 ? 1.06 : .96]),
    plant: [['land', .9], ['wood-hit', .6, .05]], fort: [['stone', .9], ['hammer-a', .8, .25], ['hammer-b', .8, .45]],
    duel: [['bow', .8], ['swish', .8, .15]], buzz: [['hit', 1], ['land', .8, .03]],
    point: [['coin', .8], ['impact', .4, .05]], miss: [['kill', .9], ['debris', .5, .05]],
    hold: [['door-close', 1], ['wood-hit', .9, .05], ['wood-hit', .7, .25, 1.05]], conquer: [['impact', .9], ['land', .8, .1]],
    loot: [['coins', 1], ['coins2', .9, .25], ['coins', .7, .5, 1.1]], harvest: [['coins', .55], ['coin', .4, .25, 1.1]],
    phase: [['door-open', 1], ['step', .35, .5]], ally: [['creak', .8], ['coin', .5, .3]], betray: [['break', 1], ['fire', .7, .1]],
    crown: [0, .15, .3, .45, .6].map((t, i) => ['coin', .5 + i * .08, t, .9 + i * .06])
  };
  const NAMES = [...new Set(Object.values(RECIPES).flat().map(r => r[0]))];
  const Sound = {
    ctx: null, buf: {}, vol: .8, on: true,
    init(opts = {}) {
      this.opts = opts;
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
      this.gain = this.ctx.createGain(); this.gain.gain.value = this.vol; this.gain.connect(this.ctx.destination);
      NAMES.forEach(async n => {
        try {
          let ab;
          if (opts.data && opts.data[n]) ab = Uint8Array.from(atob(opts.data[n]), c => c.charCodeAt(0)).buffer;
          else if (opts.base) ab = await (await fetch(opts.base + n + '.mp3')).arrayBuffer();
          if (ab) this.buf[n] = await this.ctx.decodeAudioData(ab);
        } catch (e) { }
      });
    },
    unlock() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume(); },
    setVol(v) { this.vol = v; if (this.gain) this.gain.gain.value = v; },
    play(name) {
      if (!this.on || !this.ctx || this.ctx.state !== 'running') return;
      (RECIPES[name] || []).forEach(([n, v = 1, t = 0, rate = 1]) => {
        const b = this.buf[n]; if (!b) return;
        const s = this.ctx.createBufferSource(), g = this.ctx.createGain(); s.buffer = b; s.playbackRate.value = rate; g.gain.value = v;
        s.connect(g); g.connect(this.gain); s.start(this.ctx.currentTime + t);
      });
    },
    RECIPES, NAMES
  };
  root.RayatSound = Sound;
})(typeof window !== 'undefined' ? window : globalThis);
