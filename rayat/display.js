/* شاشة عرض «رايات»: تقرأ الحالة العامة من المحرك (pub) وتحكي القصة على الخريطة.
   كل تغيّر في الملكية أو الحصون أو التحالفات يأتي من سجل s.hist بالترتيب، فيُعرض مشهدًا بعد مشهد
   (زحف الجيش، سقوط الراية وغرس الأخرى، تموّج اللون)، والمحرك يعطي هذه المشاهد وقتها (خطوة resolve ونهاية المواجهة). */
(function (root) {
  const EMB = { falcon: '🦅', sword: '⚔️', palm: '🌴', crescent: '🌙', star: '⭐', horse: '🐎', arrow: '🏹', shield: '🛡️' };
  const L4 = ['أ', 'ب', 'ج', 'د'], RICON = { food: '🌾', gold: '💰', stone: '🪨' }, RNAME = { food: 'طعام', gold: 'ذهب', stone: 'حجر' };
  const HINT = { expand: 'احتلال وتحصين فقط', friction: 'الهجوم والتحالف مفتوحان', war: 'الحصاد مضاعف', siege: 'القلعة الكبرى مفتوحة', final: 'الهجوم بنصف التكلفة', trial: 'بلا أثر على المسابقة' };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const NS = 'http://www.w3.org/2000/svg';
  const svgEl = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
  const ordWord = n => n === 2 ? 'أمران' : n === 1 ? 'أمر واحد' : 'لا أمر';

  class RayatDisplay {
    /* host: عنصر الصفحة. opts.now: ساعة المحرك (للتشغيل التجريبي بساعة مسرّعة)، opts.sound(name): الأصوات */
    constructor(host, opts = {}) {
      this.opts = opts; this.sound = opts.sound || (() => {}); this.queue = []; this.running = false; this.key = null;
      host.innerHTML = `<div class="rd-fit"><div class="rd"><div class="rd-cam"></div><div class="rd-hud"><div class="rd-logo"><i></i>رايات</div><div class="rd-bar"></div><div class="rd-phase"><b></b><span></span></div><div class="rd-timer"></div></div><div class="rd-side"></div><div class="rd-duel"></div><div class="rd-pred"></div><div class="rd-orders"></div><div class="rd-toasts"></div><div class="rd-banner"></div><div class="rd-replay"></div><div class="rd-card"></div></div></div>`;
      const $ = s => host.querySelector(s);
      this.el = { rd: $('.rd'), cam: $('.rd-cam'), bar: $('.rd-bar'), phase: $('.rd-phase'), timer: $('.rd-timer'), side: $('.rd-side'), duel: $('.rd-duel'), pred: $('.rd-pred'), orders: $('.rd-orders'), toasts: $('.rd-toasts'), banner: $('.rd-banner'), replay: $('.rd-replay'), card: $('.rd-card') };
      this.fit = () => { const s = Math.min(innerWidth / 1920, innerHeight / 1080); this.el.rd.style.transform = `scale(${s})`; };
      addEventListener('resize', this.fit); this.fit();
      setInterval(() => this.clockTick(), 250);
    }
    now() { return this.opts.now ? this.opts.now() : Date.now() - (this.skew || 0); }
    tix(tid) { return this.P ? this.P.teams.findIndex(t => t.id === tid) : -1; }
    team(tid) { const t = this.P.teams.find(x => x.id === tid); return t ? { name: t.name, color: t.color, emb: EMB[t.emb] || '🏳️' } : { name: '', color: '#888', emb: '' }; }
    tag(tid) { const t = this.team(tid); return `<span style="color:${t.color};filter:brightness(1.35);font-weight:800">${t.emb} ${esc(t.name)}</span>`; }
    rname(rid) { return this.M.regions[rid].type === 'capital' ? 'عاصمة ' + this.team(this.P.owner[rid]).name : this.M.regions[rid].name; }

    // ---------- المزامنة ----------
    update(P) {
      if (!P || !P.teams) return;
      this.skew = Date.now() - P.now;
      const key = [P.code, P.settings.seed, P.teams.length, P.createdAt].join(':');
      const prev = this.key === key ? this.P : null;
      this.P = P;
      if (!prev) this.boot(key);
      else if (P.hist.length < this.histN || (prev.isTrial && !P.isTrial)) this.resync();
      else {
        if (P.phase !== prev.phase && P.phase > 0 && RayatEngine.PHASES[P.phase].play) this.enqueue(() => this.phaseCard());
        for (let i = this.histN; i < P.hist.length; i++) { const h = P.hist[i]; this.enqueue(() => this.playHist(h)); }
        this.histN = P.hist.length;
      }
      this.news(); this.hud(); this.side(); this.duelUI(prev); this.harvestFx(); this.cards();
    }
    boot(key) {
      const P = this.P; this.key = key;
      this.M = RayatMap.build(P.teams.length, P.settings.seed);
      if (this.M.regions.length !== P.regions.length || this.M.regions.some((r, i) => r.type !== P.regions[i].type)) console.warn('الخريطة لا تطابق المحرك');
      this.castle = P.castle; this.queue = [];
      this.viewFromP();
      this.el.cam.innerHTML = RayatMap.scene(this.M, this.mapState());
      this.svg = this.el.cam.querySelector('svg'); this.fx = this.svg.querySelector('#m-fx'); this.fxLand = this.svg.querySelector('#m-fx-land');
      this.newsN = P.news.length; this.hKey = P.step === 'harvest' ? P.cycle : null; this.crownKey = null; this.duelKey = null;
    }
    viewFromP() { const P = this.P; this.view = { owner: P.owner.map(t => this.tix(t)), fort: P.fort.slice(), ally: P.teams.filter(t => t.ally && t.id < t.ally).map(t => [this.tix(t.id), this.tix(t.ally)]) }; this.histN = P.hist.length; }
    resync() { this.queue = []; this.viewFromP(); this.paint(); }
    mapState() { const v = this.view; return { owner: v.owner, forts: new Set(v.fort.map((f, i) => f ? i : -1).filter(i => i >= 0)), ally: v.ally, teams: this.P.teams.map(t => ({ name: t.name, color: t.color, emb: EMB[t.emb] || '🏳️' })) }; }
    paint() { RayatMap.paint(this.svg, this.M, this.mapState()); this.hud(); }
    enqueue(fn) { this.queue.push(fn); if (!this.running) this.run(); }
    async run() { this.running = true; while (this.queue.length) { const fn = this.queue.shift(); this.fast = this.queue.length > 1; try { await fn(); } catch (e) { console.error(e); } } this.running = false; }

    // ---------- مشاهد السجل ----------
    async playHist(h) {
      if (typeof h[1] === 'number') return this.conquer(h[1], h[2]);
      const [, k, a, b] = h;
      if (k === 'fort') { this.view.fort[a] = true; this.paint(); const f = this.svg.querySelector(`.fort[data-id="${a}"]`); if (f) f.classList.add('drop'); this.sound('fort'); return sleep(this.fast ? 300 : 800); }
      const A = this.tix(a), B = this.tix(b), has = () => this.view.ally.findIndex(([x, y]) => (x === A && y === B) || (x === B && y === A));
      if (k === 'ally') { if (has() < 0) this.view.ally.push([A, B]); this.paint(); this.sound('ally'); this.banner(`🤝 حلف بين ${esc(this.team(a).name)} و${esc(this.team(b).name)}`, '#f4c430'); return sleep(1200); }
      if (k === 'end' || k === 'betray') {
        const i = has(); if (i < 0) return;
        if (k === 'betray') {
          const g = this.svg.querySelector(`.ally[data-k="${this.view.ally[i].join('-')}"]`); if (g) { g.classList.add('cut'); g.querySelectorAll('path').forEach(p => p.setAttribute('stroke-dasharray', '400')); }
          this.sound('betray'); this.banner(`${esc(this.team(a).name)} ينقضون الحلف ويضربون ${esc(this.team(b).name)}!`, this.team(a).color, 'ضربة تتجاوز التحصين، ولهم الثأر ثلاث دورات'); await sleep(1500);
        }
        this.view.ally.splice(has(), 1); this.paint();
      }
    }
    async conquer(rid, tid) {
      const ti = this.tix(tid), r = this.M.regions[rid];
      if (ti < 0) { this.view.owner[rid] = -1; this.view.fort[rid] = false; return this.paint(); }
      const from = r.nb.map(j => this.M.regions[j]).filter(x => this.view.owner[x.id] === ti).sort((a, b) => Math.hypot(a.at[0] - r.at[0], a.at[1] - r.at[1]) - Math.hypot(b.at[0] - r.at[0], b.at[1] - r.at[1]))[0];
      const col = this.P.teams[ti].color;
      if (from) await this.march(from, r, ti, this.fast ? 700 : 1500);
      const old = this.svg.querySelector(`.flag[data-id="${rid}"]`);
      if (old) { const c = old.cloneNode(true); c.classList.add('fall'); this.fx.appendChild(c); setTimeout(() => c.remove(), 700); }
      const cp = svgEl('clipPath', { id: 'cp' + rid + '_' + Date.now() }); cp.appendChild(svgEl('path', { d: RayatMap.regionD(r) }));
      const g = svgEl('g', {}); g.appendChild(cp); g.appendChild(svgEl('circle', { class: 'ripple', cx: r.at[0], cy: r.at[1], r: 420, fill: col, 'clip-path': `url(#${cp.id})` })); this.fxLand.appendChild(g);
      this.view.owner[rid] = ti; this.view.fort[rid] = false;
      setTimeout(() => { this.paint(); const nf = this.svg.querySelector(`.flag[data-id="${rid}"]`); if (nf) nf.classList.add('rise'); g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 500, fill: 'forwards' }); setTimeout(() => g.remove(), 520); }, 450);
      this.sound('plant');
      return sleep(this.fast ? 600 : 1300);
    }
    // جيش يزحف على طريق من إقليم المهاجم إلى الهدف، يثير الغبار
    march(a, b, ti, dur) {
      const [x1, y1] = a.at, [x2, y2] = b.at, mx = (x1 + x2) / 2, my = (y1 + y2) / 2 - 60, col = this.P.teams[ti].color;
      const path = svgEl('path', { d: `M${x1},${y1} Q${mx},${my} ${x2},${y2}`, fill: 'none', stroke: col, 'stroke-width': 7, 'stroke-dasharray': '2 14', 'stroke-linecap': 'round', opacity: .9 });
      const army = svgEl('g', {}), flip = x2 > x1 ? -1 : 1;
      army.innerHTML = `<g transform="scale(${flip},1)"><text x="0" y="0" font-size="50" text-anchor="middle">🐎</text><text x="${-26 * flip}" y="14" font-size="38" text-anchor="middle">🐎</text></g><g transform="translate(${8 * flip},-40)"><rect x="-1.5" y="-30" width="3" height="40" fill="#4a3b2a"/><path d="M1.5,-30 h26 v16 h-26z" fill="${col}" stroke="#0006"/></g>`;
      this.fx.appendChild(path); this.fx.appendChild(army); this.sound('march');
      const len = path.getTotalLength(), t0 = performance.now(); let lastDust = 0;
      return new Promise(res => {
        const step = t => {
          const k = Math.min(1, (t - t0) / dur), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2, p = path.getPointAtLength(len * e);
          army.setAttribute('transform', `translate(${p.x},${p.y})`);
          if (t - lastDust > 90) { lastDust = t; const d = svgEl('circle', { class: 'dust', cx: p.x + (Math.random() - .5) * 30, cy: p.y + 12, r: 16, fill: '#d8c9a0' }); this.fx.insertBefore(d, army); setTimeout(() => d.remove(), 950); }
          if (k < 1) requestAnimationFrame(step); else { path.animate([{ opacity: .9 }, { opacity: 0 }], { duration: 600, fill: 'forwards' }); setTimeout(() => path.remove(), 650); army.remove(); res(); }
        };
        requestAnimationFrame(step);
      });
    }
    async phaseCard() {
      const P = this.P, ph = RayatEngine.PHASES[P.phase], R = P.rules, plays = RayatEngine.PHASES.filter(p => p.play), n = plays.indexOf(ph) + 1;
      const DESC = {
        expand: ['احتلّوا الأرض المحايدة وحصّنوا حدودكم', [`🌾 احتلال: ${R.cost.occupy} طعام`, `🪨 تحصين: ${R.cost.fortify} حجر`, `📦 تموين: +${R.supply}`]],
        friction: ['تلاصقت الحدود: الهجوم والتحالف مفتوحان', [`💰 هجوم: ${R.cost.attack} ذهب`, '🤝 حليف واحد لكل فريق', '⚔️ هجوم واحد في الدورة']],
        war: ['الحصاد مضاعف والأسئلة أصعب', ['×2 حصاد كل الأقاليم']],
        siege: ['القلعة الكبرى فُتحت، وتُحسب بخمسة أقاليم', ['🏰 القلعة المحايدة: سؤال الحامية الصعب', '⚔️ القلعة المملوكة: أفضل من ثلاثة']],
        final: ['سقطت التحالفات كلها، والفائز واحد', [`💰 الهجوم بـ${Math.ceil(R.cost.attack * (ph.atk || 1))} ذهب فقط`]]
      }[ph.k] || ['', []];
      this.card(`<div class="in"><div class="k">المرحلة ${n} من ${plays.length}</div><h1>${esc(ph.name)}</h1><p>${esc(DESC[0])}</p><div class="chips">${DESC[1].map(c => `<span>${esc(c)}</span>`).join('')}</div></div>`, 'phase');
      this.sound('phase'); await sleep(this.fast ? 1800 : 3600); if (this.cardFor === 'phase') this.card(null);
    }

    // ---------- الشريط العلوي والوقت ----------
    scores() { const sc = this.P.teams.map(() => 0); this.view.owner.forEach((o, i) => { if (o >= 0) sc[o] += i === this.castle ? this.P.rules.castleWorth : 1; }); return sc; }
    hud() {
      const P = this.P, sc = this.scores(), tot = this.M.regions.length + P.rules.castleWorth - 1, rest = tot - sc.reduce((a, b) => a + b, 0);
      this.el.bar.innerHTML = P.teams.map((t, i) => `<div style="background:${t.color};flex:${sc[i]}">${EMB[t.emb] || ''} ${esc(t.name)} ${Math.round(sc[i] / tot * 100)}%</div>`).join('') + (rest > 0 ? `<div style="background:#5d6b70;flex:${rest}">محايد</div>` : '');
      const ph = P.isTrial ? { k: 'trial', name: 'دورة تجريبية' } : RayatEngine.PHASES[P.phase] || { k: 'lobby', name: 'الانتظار' };
      this.el.phase.querySelector('b').textContent = ph.k === 'opening' ? 'الافتتاح' : ph.k === 'lobby' ? 'رايات' : ph.name;
      this.el.phase.querySelector('span').textContent = ph.k === 'crown' ? 'التتويج' : P.cycle && ph.k !== 'opening' ? `الدورة ${P.cycle} · ${HINT[ph.k] || ''}` : (HINT[ph.k] || 'استعدوا');
    }
    clockTick() {
      const P = this.P; if (!P) return; const now = this.now(), T = this.el.timer;
      if (P.deadline) {
        if (this.dl !== P.deadline) { this.dl = P.deadline; this.dlTotal = Math.max(1000, P.deadline - now); }
        const left = Math.max(0, P.deadline - now), s = Math.ceil(left / 1000);
        T.dataset.t = s; T.style.setProperty('--p', Math.round(left / this.dlTotal * 100)); T.classList.toggle('hot', s <= 5); T.classList.remove('small');
        if (s <= 3 && s > 0 && this.lastTick !== s && ['question', 'orders'].includes(P.step)) { this.lastTick = s; this.sound('tick'); }
      } else {
        const ph = RayatEngine.PHASES[P.phase];
        if (ph && ph.play && P.phaseAt) { const left = Math.max(0, P.phaseAt + P.settings.min[ph.k] * 60000 - now), m = Math.floor(left / 60000), s = Math.floor(left / 1000) % 60; T.dataset.t = `${m}:${String(s).padStart(2, '0')}`; T.style.setProperty('--p', Math.round(left / (P.settings.min[ph.k] * 600))); }
        else { T.dataset.t = '—'; T.style.setProperty('--p', 0); }
        T.classList.add('small'); T.classList.remove('hot');
      }
    }

    // ---------- اللوحة الجانبية ----------
    qBlock(q, showA) { return `<div class="q">${esc(q.q)}</div>${q.c.map((c, i) => `<div class="o ${showA && q.a != null ? (i === q.a ? 'ok' : 'no') : ''}"><b>${L4[i]}</b>${esc(c)}</div>`).join('')}`; }
    side() {
      const P = this.P, S = this.el.side, d = P.duel; let h = '';
      if (P.step === 'question' && P.q) {
        h = `<div class="kicker">❓ سؤال للجميع · أجيبوا من جوالاتكم</div>${this.qBlock(P.q)}<div class="meter">${P.teams.map(t => { const [a, n] = P.q.cnt[t.id] || [0, 0]; return `<div class="tm"><span class="nm" style="color:${t.color};filter:brightness(1.4)">${EMB[t.emb] || ''} ${esc(t.name)}</span><span class="track"><i style="width:${n ? a / n * 100 : 0}%;background:${t.color}"></i></span><span class="v">أجاب ${a} من ${n}</span></div>`; }).join('')}</div>`;
      } else if (P.step === 'orders' && P.q && P.turn) {
        h = `<div class="kicker">✔️ الإجابة الصحيحة · القادة يختارون الأوامر</div>${this.qBlock(P.q, true)}<div class="meter">${P.turn.order.map(tid => { const t = P.teams.find(x => x.id === tid), r = P.turn.ratio[tid], n = P.turn.n[tid], sent = P.turn.orders[tid]; return `<div class="tm"><span class="nm" style="color:${t.color};filter:brightness(1.4)">${EMB[t.emb] || ''} ${esc(t.name)}</span><span class="track"><i style="width:${r * 100}%;background:${t.color}"></i></span><span class="v">${Math.round(r * 100)}% · ${ordWord(n)} ${n ? (sent ? '✉️' : '…') : ''}</span></div>`; }).join('')}</div>`;
      }
      if (P.step === 'resolve' && P.turn) {
        this.el.orders.innerHTML = `<b>📜 أوامر الدورة</b>${P.turn.res.filter(x => x.k !== 'refund').map((x, i) => { const t = this.team(x.tid); let line;
          if (x.k === 'occupy') line = `يحتلون ${esc(this.M.regions[x.r].name)}`; else if (x.k === 'fortify') line = `يحصّنون ${esc(this.M.regions[x.r].name)}`;
          else if (x.k === 'attack') line = (x.betray ? 'ينقضون الحلف ويهاجمون ' : 'يهاجمون ') + esc(this.rname(x.r));
          else line = `تموين +${P.rules.supply} ${RICON[x.res]} ${RNAME[x.res]}` + (x.fb ? ' <small>(بدل أمر تعذّر)</small>' : x.auto ? ' <small>(تلقائي)</small>' : '');
          return `<div style="--c:${t.color};animation-delay:${i * .12}s">${t.emb} <b>${esc(t.name)}</b> ${line}</div>`; }).join('')}`;
        this.el.orders.classList.add('on');
      } else this.el.orders.classList.remove('on');
      if (d && (P.step === 'duel' || P.step === 'tiebreak')) {
        if (d.sub === 'predict') h = `<div class="kicker">🔮 توقّعوا الفائز من جوالاتكم</div><div class="q">${d.kind === 'garrison' ? `هل يفتح ${this.tag(d.att)} القلعة؟` : `${this.tag(d.att)} أم ${this.tag(d.def)}؟`}</div><div class="wait">كل توقّع صحيح = ذهبة لفريقك</div>`;
        else if (d.sub === 'inter') h = `<div class="kicker">🤸 بيني حركي بدل السؤال</div><div class="q">${esc(d.card || 'التحدي الحركي')}</div><div class="wait">الفائز يكسب نقطة في المواجهة</div>`;
        else if (d.q) {
          const showA = ['round', 'end'].includes(d.sub);
          let foot = '';
          if (d.sub === 'buzz') foot = `<div class="wait">⚡ اضغطوا زر الاستباق!</div>`;
          else if (d.sub === 'answer') { const t = this.team(d.buzz); foot = `<div class="buzz" style="--c:${t.color}">${d.kind === 'garrison' ? '🏰 ' + esc(t.name) + ': أجيبوا سؤال الحامية' : d.second ? '↩️ الفرصة لـ' + esc(t.name) : '⚡ ' + esc(t.name) + ' أولًا — أجيبوا!'}</div>`; }
          else if (d.sub === 'round') { const w = d.log[d.log.length - 1]; foot = `<div class="wait">${w ? 'النقطة لـ' + this.tag(w) : 'لم يُجب أحد'}</div>`; }
          h = `<div class="kicker">${d.kind === 'garrison' ? '🏰 سؤال الحامية (صعب)' : `⚔️ سؤال المواجهة ${d.round > 1 ? '· الجولة ' + d.round : ''}`}</div>${this.qBlock(d.q, showA)}${foot}`;
        }
      }
      if (h) { S.innerHTML = h; S.classList.add('on'); if (this.cardFor === 'phase') this.card(null); } else S.classList.remove('on');
    }

    // ---------- المواجهة: الكاميرا واللوحات ----------
    duelUI() {
      const P = this.P, d = P.duel, on = d && (P.step === 'duel' || P.step === 'tiebreak'), D = this.el.duel;
      const key = on ? [P.cycle, d.kind, d.r, d.att].join(':') : null;
      if (key !== this.duelKey) {
        this.fx.querySelectorAll('.spot,.atk').forEach(e => e.remove());
        if (on && d.r != null) {
          const r = this.M.regions[d.r], s = 1.5, W = 1920, H = 1080, tx = Math.min(0, Math.max(W - W * s, 1230 - r.at[0] * s)), ty = Math.min(0, Math.max(H - H * s, 640 - r.at[1] * s));
          this.el.cam.style.transform = `translate(${tx}px,${ty}px) scale(${s})`;
          const spot = svgEl('g', { class: 'spot' }); spot.innerHTML = `<mask id="spotm"><rect x="-500" y="-500" width="2920" height="2080" fill="#fff"/><path d="${RayatMap.regionD(r)}" fill="#000" clip-path="url(#land)"/></mask><rect x="-500" y="-500" width="2920" height="2080" fill="rgba(5,12,18,.6)" mask="url(#spotm)"/><path d="${RayatMap.regionD(r)}" fill="none" stroke="#ffd34d" stroke-width="7" clip-path="url(#land)" class="glow"/>`;
          this.fx.insertBefore(spot, this.fx.firstChild);
          const from = r.nb.find(j => this.view.owner[j] === this.tix(d.att));
          if (from != null) { const a = svgEl('g', { class: 'atk' }); a.innerHTML = RayatMap.attackArrow(this.M, from, d.r, this.team(d.att).color); this.fx.appendChild(a); }
          this.sound('duel');
        } else this.el.cam.style.transform = '';
        this.duelKey = key; this.lastLog = 0; this.lastBuzz = null;
      }
      if (!on) { D.classList.remove('on'); this.el.pred.classList.remove('on'); return; }
      const plate = tid => { const t = this.team(tid), win = d.winner === tid; return `<div><div class="side ${win ? 'win' : ''}" style="--c:${t.color}"><span class="em">${t.emb}</span>${esc(t.name)}</div><div class="pips">${Array.from({ length: d.need[tid] }, (_, i) => `<i class="${i < d.wins[tid] ? 'on' : ''}"></i>`).join('')}</div></div>`; };
      const sides = d.kind === 'tie' ? d.sides : d.def ? [d.att, d.def] : [d.att];
      const garrison = `<div><div class="side" style="--c:#6b6355"><span class="em">🏰</span>الحامية</div><div class="pips"><i class="${d.winner === 'hold' ? 'on' : ''}"></i></div></div>`;
      const vs = sides.map(plate).join('<div class="vs">⚔️</div>') + (d.kind === 'garrison' ? '<div class="vs">⚔️</div>' + garrison : '');
      let sub = '';
      if (d.kind === 'tie') sub = '👑 حسم الصدارة · أفضل من ثلاثة';
      else { const rn = `<b>${esc(this.rname(d.r))}</b>`, A = esc(this.team(d.att).name), Dn = d.def ? esc(this.team(d.def).name) : '';
        sub = { normal: `⚔️ هجوم على ${rn} · فوز واحد يحسمها`, fort: d.bypass ? `⚔️ هجوم على ${rn} · ضربة تتجاوز التحصين: فوز واحد يكفي` : `⚔️ هجوم على ${rn} · أرض محصّنة: ${A} يحتاجون فوزين، و${Dn} يكفيهم فوز`,
          capital: `⚔️ هجوم على ${rn} · ${d.bypass ? 'فوز واحد' : 'فوزان'} ينهبان نصف مخزونها، ولا تسقط`, castle: `🏰 ${rn} · أفضل من ثلاثة`, garrison: `🏰 ${rn} · إجابة صحيحة عن سؤال الحامية تفتحها` }[d.kind] || ''; }
      D.innerHTML = `<div class="vsrow">${vs}</div><div class="sub">${sub}</div>`; D.classList.add('on');
      // التوقعات
      const picks = Object.values(d.preds || {}), opts = d.def ? [d.att, d.def] : [d.att, 'hold'];
      if (picks.length && d.kind !== 'tie') { const c = opts.map(o => picks.filter(p => p === o).length), tot = c[0] + c[1] || 1, col = o => o === 'hold' ? '#6b6355' : this.team(o).color, nm = o => o === 'hold' ? 'الحامية' : esc(this.team(o).name);
        this.el.pred.innerHTML = `توقعات الفرق المتفرجة (${picks.length}): <b>${nm(opts[0])} ${Math.round(c[0] / tot * 100)}%</b> · ${nm(opts[1])} ${Math.round(c[1] / tot * 100)}%<div class="pb">${opts.map((o, i) => `<div style="flex:${c[i]};background:${col(o)}"></div>`).join('')}</div>`; this.el.pred.classList.add('on'); }
      else this.el.pred.classList.remove('on');
      // الأصوات واللافتات
      if (d.sub === 'answer' && d.buzz !== this.lastBuzz) { this.lastBuzz = d.buzz; if (d.kind !== 'garrison') this.sound('buzz'); }
      if (d.log.length > this.lastLog) { this.lastLog = d.log.length; const w = d.log[d.log.length - 1]; this.sound(w ? 'point' : 'miss'); }
      if (d.sub === 'end' && this.endKey !== key) {
        this.endKey = key; const w = d.winner;
        if (d.kind === 'tie') { this.banner(`${esc(this.team(w).name)} يحسمون الصدارة!`, this.team(w).color); }
        else if (w === d.att && d.kind === 'capital') { const L = d.loot || {}; this.sound('loot'); this.banner(`${esc(this.team(d.att).name)} ينهبون ${esc(this.rname(d.r))}`, this.team(d.att).color, Object.keys(RICON).map(k => `${RICON[k]} ${L[k] || 0}`).join(' · ')); }
        else if (w === d.att) { this.sound('conquer'); this.banner(`${esc(this.team(d.att).name)} يفتحون ${esc(this.M.regions[d.r].name)}!`, this.team(d.att).color); }
        else { this.sound('hold'); this.banner(`صمد ${esc(this.rname(d.r))}!`, d.def ? this.team(d.def).color : '#c9b27a'); }
        const g = d.predGold || {}; Object.keys(g).forEach(tid => this.toast(`🔮 ${esc(this.team(tid).name)}: +${g[tid]} 💰 من التوقعات`, this.team(tid).color));
      }
    }

    // ---------- الحصاد ----------
    harvestFx() {
      const P = this.P; if (P.step !== 'harvest' || !P.turn || !P.turn.harvest || this.hKey === P.cycle) return; this.hKey = P.cycle;
      const m = (RayatEngine.PHASES[P.phase] || {}).harvest || 1; let i = 0;
      P.owner.forEach((o, rid) => { if (!o) return; const p = RayatEngine.PROD[P.regions[rid].type] || {}, txt = Object.keys(p).map(k => `+${p[k] * m}${RICON[k]}`).join(' '); if (!txt) return;
        const r = this.M.regions[rid], t = svgEl('text', { x: r.at[0], y: r.at[1] - 70, 'text-anchor': 'middle', 'font-size': 26, 'font-weight': 900, fill: '#fff', stroke: '#000a', 'stroke-width': 5, 'paint-order': 'stroke', class: 'float', direction: 'ltr' });
        t.style.animationDelay = (i++ * 25) + 'ms'; t.textContent = txt; this.fx.appendChild(t); setTimeout(() => t.remove(), 2600 + i * 25); });
      this.sound('harvest');
    }

    // ---------- الأخبار واللافتات والبطاقات ----------
    news() { const P = this.P; while (this.newsN < P.news.length) { const x = P.news[this.newsN++].x; if (/حلف|نقض|يفتحون|صمد|ينهبون/.test(x)) continue; this.toast(esc(x)); } }
    toast(html, c) { const d = document.createElement('div'); d.innerHTML = html; if (c) d.style.setProperty('--c', c); this.el.toasts.prepend(d); while (this.el.toasts.children.length > 3) this.el.toasts.lastChild.remove(); setTimeout(() => d.remove(), 6100); }
    banner(html, c, small) { const b = this.el.banner; b.innerHTML = `<div style="--c:${c || '#f4c430'}">${html}${small ? `<small>${small}</small>` : ''}</div>`; clearTimeout(this.bt); this.bt = setTimeout(() => { b.innerHTML = ''; }, 2700); }
    card(html, tag) { const C = this.el.card; if (html == null) { C.classList.remove('on'); this.cardFor = null; return; } C.innerHTML = html; C.classList.add('on'); this.cardFor = tag || 'x'; }
    cards() {
      const P = this.P;
      if ((P.step === 'lobby' || P.step === 'setup') && !P.isTrial) {
        const cnt = tid => Object.values(P.students).filter(s => s.team === tid).length;
        this.card(`<div class="in rd-lobby"><h1>رايات</h1><p>حرب السيطرة على الجزيرة · ادخلوا من جوالاتكم بالرمز</p><div class="code">${esc(P.code)}</div><div class="teams">${P.teams.map(t => `<div style="--c:${t.color};background:${t.color}">${EMB[t.emb] || ''} ${esc(t.name)}<small>${cnt(t.id)} مشاركين</small></div>`).join('')}</div></div>`, 'lobby');
      } else if (this.cardFor === 'lobby') this.card(null);
      if (P.step === 'tiebreak' && !P.duel && this.cardFor !== 'tie') { this.card(`<div class="in"><div class="k">تعادل في الصدارة</div><h1>مواجهة الحسم</h1><p>${P.tie.teams.map(t => this.tag(t)).join(' ⚔️ ')} · أفضل من ثلاثة</p></div>`, 'tie'); }
      else if (this.cardFor === 'tie' && P.duel) this.card(null);
      if (P.step === 'crown' && P.result && this.crownKey !== this.key) { this.crownKey = this.key; this.enqueue(() => this.crown()); }
    }
    // التتويج: شريط الحرب ثم الألقاب ثم كشف الترتيب من الأخير
    async crown() {
      const P = this.P, R = P.result, hist = P.hist;
      this.card(null); this.el.cam.style.transform = '';
      this.el.replay.innerHTML = '<div>شريط الحرب</div>'; this.sound('phase');
      this.view = { owner: P.owner0.map(t => this.tix(t)), fort: P.fort.map(() => false), ally: [] }; this.paint();
      const step = Math.max(60, Math.min(300, 30000 / Math.max(1, hist.length)));
      for (const h of hist) {
        if (typeof h[1] === 'number') this.view.owner[h[1]] = this.tix(h[2]);
        else if (h[1] === 'fort') this.view.fort[h[2]] = true;
        else if (h[1] === 'ally') this.view.ally.push([this.tix(h[2]), this.tix(h[3])]);
        else this.view.ally = this.view.ally.filter(([x, y]) => !([x, y].includes(this.tix(h[2])) && [x, y].includes(this.tix(h[3]))));
        this.paint(); await sleep(step);
      }
      this.viewFromP(); this.paint(); this.el.replay.innerHTML = ''; await sleep(1500);
      const who = x => x.sid && P.students[x.sid] ? `${esc(P.students[x.sid].name)} <small style="opacity:.75">(${esc(this.team(x.team).name)})</small>` : this.tag(x.team);
      const unit = { wall: 'مواجهة صمدوا فيها', cunning: 'هجمات ناجحة', keeper: 'دورة على القلعة', seer: '% توقعات صحيحة', star: '% إجابات صحيحة' };
      this.card(`<div class="in"><div class="k">ألقاب المسابقة</div><div class="rd-titles">${R.titles.map((t, i) => `<div style="animation-delay:${i * .8}s"><b>${esc(t.name)}</b><span>${who(t)}</span><br><span style="opacity:.75">${t.v} ${unit[t.k] || ''}</span></div>`).join('')}</div></div>`);
      this.sound('ally'); await sleep(2500 + R.titles.length * 900);
      const tot = this.M.regions.length + P.rules.castleWorth - 1, rows = [];
      for (let i = R.rank.length - 1; i >= 0; i--) {
        const r = R.rank[i], t = this.team(r.id);
        rows.unshift(`<div class="${i === 0 ? 'champ' : ''}" style="--c:${t.color}"><span class="n">${i + 1}</span>${t.emb} ${esc(t.name)}<span class="s">${r.score} · ${Math.round(r.score / tot * 100)}%</span></div>`);
        this.card(`<div class="in"><div class="k">الترتيب النهائي</div><div class="rd-rank">${rows.join('')}</div></div>`); this.sound(i ? 'point' : 'crown'); await sleep(i ? 1600 : 1200);
      }
      const w = R.rank[0], t = this.team(w.id);
      this.card(`<div class="in"><div class="k">👑 البطل</div><h1 style="color:${t.color};filter:brightness(1.3)">راية ${esc(t.name)} تحكم الجزيرة</h1><p>${Math.round(w.score / tot * 100)}% من الجزيرة · ${w.score} إقليمًا محسوبًا</p></div>`);
    }
  }
  root.RayatDisplay = RayatDisplay;
})(typeof window !== 'undefined' ? window : globalThis);
