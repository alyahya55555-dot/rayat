/* رايات — شاشة العرض (البروجكتور): الجزيرة ثلاثية الأبعاد + طبقة نظيفة فوقها، عنصر رئيس واحد في كل لحظة */

const Display = {
  init(code, opt = {}) {
    this.local = !!opt.local; this.root = opt.root || $('#app');
    this.code = code || LS.get('rayat.displayCode', '') || ''; this.P = null; this.W = null; this.lastEv = 0; this.visKey = ''; this.skipSeq = 0; this.endAt = 0; this.dur = 1; this.lastStage = ''; this.lastPhase = -1; this.playing = 0;
    this.root.innerHTML = `<canvas id="world"></canvas><div class="dsp" id="dsp"><div class="top"><div class="brand k">رايـــات<small>حرب السيطرة على الجزيرة</small></div><div class="phase" id="phase"></div></div><div class="dom" id="dom"></div><div class="card qcard hide" id="qcard"></div><div class="card banner hide" id="banner"></div><div class="card mid hide" id="mid"></div><div class="card lobby mid hide" id="lobby"></div><div class="sidelog" id="slog"></div></div><div class="statusbar" id="sbar"></div>`;
    if (this.local) this.net = { label: () => ({ cls: 'on', t: 'العرض في نفس النافذة' }), heartbeat() { }, presence() { }, joinRoom() { } };
    else {
      this.net = new Net('display');
      this.net.on('state', P => this.onState(P));
      this.net.on('caps', () => { if (this.code) this.join(this.code); });
      this.net.on('status', () => this.badge());
      this.net.init(); this.net.presence({ r: 'd' });
      setInterval(() => this.net.heartbeat(), 3000);
    }
    this.overlay(); setInterval(() => this.tickUI(), 200);
    document.addEventListener('visibilitychange', () => this.onVisible());
    window.addEventListener('resize', () => { if (this.W) this.W.resize(innerWidth, innerHeight); this.fit(); });
    if (!this.local) setTimeout(() => { if (!this.P) this.askCode(); }, 4000);
  },
  async join(code) { this.code = code; LS.set('rayat.displayCode', code); await this.net.joinRoom(code); this.net.presence({ r: 'd', c: code }); this.badge(); },
  overlay() { const o = document.createElement('div'); o.id = 'tapov'; o.style.cssText = 'position:fixed;inset:0;z-index:50;display:grid;place-items:center;background:rgba(4,14,20,.94);cursor:pointer';
    o.innerHTML = '<div style="text-align:center"><div class="brand k" style="font-size:90px">رايـــات</div><div class="mut" style="margin-top:14px;font-size:20px">اضغط في أي مكان لتفعيل الصوت وملء الشاشة</div></div>';
    o.onclick = () => { SFX.unlock(); setTimeout(() => SFX.ambient(), 800); try { document.documentElement.requestFullscreen().catch(() => { }); } catch (e) { } o.remove(); }; this.root.appendChild(o);
    const sb = document.createElement('div'); sb.className = 'sndbox'; sb.innerHTML = `<button class="btn sm" id="sm">🔊</button><input type="range" id="sv" min="0" max="100" value="${Math.round(SFX.vol * 100)}">`; this.root.appendChild(sb);
    $('#sm', this.root).onclick = () => { SFX.unlock(); SFX.setOn(!SFX.on); $('#sm', this.root).textContent = SFX.on ? '🔊' : '🔇'; }; $('#sv', this.root).oninput = e => { SFX.unlock(); SFX.setVol(+e.target.value / 100); }; },
  badge() { const b = $('#sbar'); if (b) { const l = this.net.label(); b.innerHTML = `<span class="dot ${l.cls}"></span> ${esc(l.t)}${this.code ? ' · ' + esc(this.code) : ''}`; } },
  askCode() { if ($('#askcode') || this.P) return; const d = document.createElement('div'); d.id = 'askcode'; d.className = 'modal-bg'; d.innerHTML = `<div class="modal col"><b>لم تصل حالة المسابقة بعد</b><div class="mut">إن كانت لوحة المشرف مفتوحة في المتصفح نفسه فستظهر تلقائيًا. على جهاز آخر أدخل رمز الغرفة:</div><div class="row"><input class="in" id="dcode" maxlength="4" inputmode="numeric" style="direction:ltr;text-align:center;letter-spacing:8px;font-size:24px"><button class="btn pri" id="dgo">ربط</button></div></div>`; document.body.appendChild(d); $('#dgo').onclick = () => { const c = $('#dcode').value.replace(/\D/g, ''); if (c.length === 4) { this.join(c); d.remove(); } }; },
  ensureWorld(P) {
    const key = P.teams.length + ':' + P.mapSeed + ':' + P.teams.map(t => t.color + t.name).join();
    if (this.W && this.worldKey === key) return;
    if (this.W) { try { this.W.renderer.dispose(); } catch (e) { } const c = $('#world'), n = c.cloneNode(); c.replaceWith(n); }
    this.worldKey = key; const M = RayatMap.build(P.teams.length, P.mapSeed);
    const TT = P.teams.map(t => ({ name: t.name, color: t.color, mark: t.mark || t.name[0] })), gl = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } })();
    try { if (!gl) throw new Error('no webgl'); this.W = RayatWorld($('#world'), M, TT, { seed: 91, lite: Math.min(innerWidth, innerHeight) < 600 || (navigator.hardwareConcurrency || 8) <= 4 }); }
    catch (e) { console.warn('العرض ثنائي الأبعاد', e && e.message); this.W = this.flatWorld(M, TT); }
    // تحكم بالخريطة: تقريب وسحب وتدوير، وزر الجزيرة كاملة، وزر متابعة الحدث (وضعان منفصلان لا يتصارعان)
    if (this.W.attachControls) { this.W.attachControls($('#world', this.root), { onPick: r => { if (r != null) this.W.focus(r); } });
      const cc = document.createElement('div'); cc.className = 'camctl'; cc.innerHTML = `<button data-c="in" title="تقريب">＋</button><button data-c="out" title="إبعاد">－</button><button data-c="l" title="تدوير">⟲</button><button data-c="r" title="تدوير">⟳</button><button data-c="all" class="w">🏝 الجزيرة كاملة</button><button data-c="ev" class="w ev">🎥 متابعة الحدث</button>`; this.root.appendChild(cc);
      const W = this.W, act = { in: () => W.zoomBy(.78), out: () => W.zoomBy(1.28), l: () => W.orbitBy(.35), r: () => W.orbitBy(-.35), all: () => W.viewAll(), ev: () => W.followEvent() };
      cc.onclick = e => { const b = e.target.closest('[data-c]'); if (b) act[b.dataset.c](); }; W.on('cam', m => cc.classList.toggle('man', m === 'manual')); }
    this.W.on('sfx', e => SFX.play(e.k, e.at || 0, e.dur || 0, e));
    this.W.fontsReady(); this.W.resize(innerWidth, innerHeight); this.W.start(); this.visKey = '';
  },
  // بديل بلا WebGL: خريطة ثنائية الأبعاد بالألوان نفسها، والأحداث تظهر بتلوّن الأقاليم
  flatWorld(M, teams) { const c = $('#world'); if (c) c.style.display = 'none'; const host = document.createElement('div'); host.className = 'flat2d'; this.root.prepend(host);
    const W = { M, reserved: [], owner: [], forts: [], busy: false, labelRects: () => [], on() { }, fontsReady() { }, resize() { }, start() { }, step() { }, skip() { }, overview() { }, setSky() { }, renderer: { dispose() { } } };
    const draw = () => { host.innerHTML = RayatMap.svg(M, { teams: teams.map(t => ({ ...t, emb: t.mark })), owner: W.owner, forts: new Set(W.forts) }); };
    const later = ms => new Promise(res => setTimeout(res, ms));
    W.setState = vis => { W.owner = vis.regions.map(r => r.owner); W.forts = vis.regions.filter(r => r.walls).map(r => r.id); draw(); };
    W.attack = async e => { await later(1800); if (e.result === 'taken') W.owner[e.r] = e.a; draw(); await later(1500); };
    W.occupy = async e => { await later(800); W.owner[e.r] = e.team; draw(); await later(1200); };
    W.build = W.capital = W.ally = W.unally = W.harvest = async () => later(1500); W.phase = async () => later(4200); W.batch = async list => { list.forEach(e => { if (e.k === 'occupy') W.owner[e.r] = e.team; }); draw(); await later(2000); };
    draw(); return W; },
  onState(P) {
    if (!P || !P.teams) return; if (this.code && P.code !== this.code && this.P) return; if (!this.code && P.code) this.join(P.code);
    if (this.P && P.v < this.P.v && P.code === this.P.code) return;
    const ask = $('#askcode'); if (ask) ask.remove();
    this.P = P; this.ensureWorld(P);
    if (P.tm) { this.endAt = performance.now() + P.tm.r; this.dur = P.tm.d || 1; } else this.endAt = 0;
    if (P.skipSeq !== this.skipSeq) { this.skipSeq = P.skipSeq; if (this.playing) this.skipScene(); }
    // الأحداث: مشهد جديد يُشغَّل مرة واحدة
    if (P.ev && P.ev.id !== this.lastEv) { this.lastEv = P.ev.id; this.enqueue(Object.assign({ _ack: P.ack }, P.ev)); }
    else if (!P.ev && !this.playing && P.vis) this.syncVis(P.vis);
    // نتيجة التحكيم: صوت الصواب أو الخطأ عند خروجنا من مرحلة التحكيم
    if (this.lastStage === 'judge' && P.stage !== 'judge') { const b = this.judgeBuzz, D = P.duel || P.lastDuel, pts = D && D.pts ? D.pts : null; if (b && pts && this.judgePts) SFX.play(pts[b.side] > this.judgePts[b.side] ? 'right' : 'wrong'); }
    if (P.stage === 'judge' && P.duel && P.duel.buzz) { this.judgeBuzz = P.duel.buzz; this.judgePts = { ...P.duel.pts }; }
    if (P.stage !== this.lastStage) { this.onStage(P.stage, this.lastStage); this.lastStage = P.stage; }
    if (P.phase !== this.lastPhase && P.phaseKey) { if (this.lastPhase < 0) this.W.setSky(P.phaseKey, 0); this.lastPhase = P.phase; }
    this.render();
  },
  skipScene() { if (this.W) this.W.skip(); SFX.stopAll(); },
  syncVis(vis) { const k = JSON.stringify(vis); if (k === this.visKey) return; this.visKey = k; this.W.setState(vis); },
  // المشاهد تُعرض واحدًا بعد الآخر؛ إن تراكمت يُسرَّع الجاري ليلحق
  // المشاهد تُعرض واحدًا بعد الآخر بسرعتها الطبيعية، والمشرف ينتظر إشارة انتهائها؛ لا تسريع إلا بطلب المشرف (تخطٍّ) أو لحاقًا هادئًا إن تأخرت الشاشة
  enqueue(ev) { (this.evq = this.evq || []).push(ev); if (!this.pumping) this.pump(); },
  async pump() { this.pumping = true; try { while (this.evq && this.evq.length) { const ev = this.evq.shift(); if (this.W) this.W.speed = this.evq.length ? 1.25 : 1; await this.playEvent(ev); this.ack(ev._ack); } } finally { this.pumping = false; if (this.W) this.W.speed = 1; } },
  ack(key) { if (!key) return; if (this.local) { try { Host.g.sceneAck(key); } catch (e) { } return; } this.ackSeq = (this.ackSeq || 0) + 1; this.net.presence({ sd: { n: Date.now() * 10 + (this.ackSeq % 10), k: key } }); },
  // العودة من تبويب مخفي: يُهمل المتراكم وتُعرض الحالة الحالية مباشرة بلا تسارع مرئي
  onVisible() { if (document.hidden || !this.W) return; if (this.evq && this.evq.length) this.evq.length = 0; if (this.playing) { if (this.W.snap) this.W.snap(); else this.W.skip(); SFX.stopAll(); } },
  async playEvent(ev) { const W = this.W, tn = this.P.teams; this.playing++; this.curEv = ev;
    try {
      if (ev.k === 'phase') { SFX.play('phase'); await W.phase({ key: ev.key, hold: ev.hold }); }
      else if (ev.k === 'attack') await W.attack(ev);
      else if (ev.k === 'occupy') await W.occupy(ev.one || ev);
      else if (['walls', 'tower', 'garInf', 'garCav'].includes(ev.k)) { const e = ev.one || ev; await W.build({ r: e.r, k: e.k, team: e.team }); }
      else if (ev.k === 'capital') await W.capital(ev.one || ev);
      else if (ev.k === 'batch') await W.batch(ev.list.filter(e => e.k !== 'supply'));
      else if (ev.k === 'ally') await W.ally(ev);
      else if (ev.k === 'unally') await W.unally(ev);
      else if (ev.k === 'supply') SFX.play('harvest');
    } catch (e) { console.error(e); }
    this.playing--; this.curEv = null; if (!this.playing && this.P && this.P.vis && !this.P.ev) this.syncVis(this.P.vis); this.render(); },
  onStage(st, prev) { if (this.W && !this.playing) { const D = this.P && this.P.duel; // البث: ترقب عند المواجهة، وانسياب فوق الجبهة وقت السؤال، والجزيرة كاملة وقت الأوامر
      if (['predict', 'buzz', 'judge', 'point', 'gq'].includes(st) && D && this.W.faceoff) this.W.faceoff({ a: D.a, d: D.d, r: D.r, unit: D.unit, ally: D.ally, from: D.from });
      else if ((st === 'question' || st === 'reveal') && this.W.idle) this.W.idle();
      else if (['orders', 'harvest', 'bini', 'tie'].includes(st)) this.W.overview(1.6); } if (st === 'question') SFX.play('question'); if (st === 'reveal') SFX.play('reveal'); if (st === 'harvest') { SFX.play('harvest'); if (this.W && !this.playing && this.W.harvest) { this.playing++; const hk = this.P && this.P.ack; this.W.harvest().finally(() => { this.playing--; this.ack(hk); }); } else { const hk = this.P && this.P.ack; setTimeout(() => this.ack(hk), 3200); } } if (st === 'judge') SFX.play('buzz'); if (st === 'crown') { SFX.play('crown'); this.W && this.W.setSky('crown', 6); } },
  // مناطق الواجهة الظاهرة تُبلَّغ للخريطة فلا يظهر اسم إقليم تحتها
  reserve() { if (!this.W || !this.root) return; const R = []; const add = el => { if (!el || el.classList.contains('hide') || !el.offsetParent && getComputedStyle(el).position !== 'fixed') return; const b = el.getBoundingClientRect(); if (b.width > 2 && b.height > 2) R.push({ x0: b.left, y0: b.top, x1: b.right, y1: b.bottom }); };
    $$('.dsp .brand, #phase, #dom, #qcard, #banner, #mid, #lobby, .sidelog > div', this.root).forEach(add); const mc = document.getElementById('mapctl'); if (mc && mc.offsetParent) add(mc); const sb = $('.sndbox', this.root); if (sb) add(sb); const cc = $('.camctl', this.root); if (cc) add(cc); this.W.reserved = R; },
  // أزرار المشرف فوق الخريطة تنزل تحت شريط السيطرة إن اتسع، فلا يتراكبان
  placeCtl() { const mc = document.getElementById('mapctl'); if (!mc || !mc.offsetWidth) return; if (innerWidth <= 900 || innerHeight <= 520) { mc.style.top = ''; const r0 = mc.getBoundingClientRect(); let tp = 0; ['#phase', '#dom'].forEach(sel => { const e = $(sel, this.root), b0 = e && e.getBoundingClientRect(); if (b0 && b0.height > 2 && b0.left < r0.right && b0.right > r0.left && b0.top < r0.bottom && b0.bottom > r0.top) tp = Math.max(tp, b0.bottom + 8); }); ['#phase', '#dom'].forEach(sel => { const e = $(sel, this.root), b0 = e && e.getBoundingClientRect(); if (tp && b0 && b0.height > 2 && b0.left < r0.right && b0.right > r0.left && b0.top < tp + r0.height && b0.bottom > tp) tp = Math.max(tp, b0.bottom + 8); }); const v0 = tp ? tp + 'px' : ''; if (mc.style.top !== v0) mc.style.top = v0; return; } // الشاشات الصغيرة: الأزرار تحت اسم المرحلة لا فوقه
    const d = $('#dom', this.root), ph = $('#phase', this.root), db = d ? d.getBoundingClientRect() : null, pb = ph ? ph.getBoundingClientRect() : null; let top = 84;
    if (db && db.height > 2 && db.left < 24 + mc.offsetWidth + 10) top = Math.max(top, db.bottom + 12); if (pb && pb.height > 2) top = Math.max(top, pb.bottom + 10); const v = top + 'px'; if (mc.style.top !== v) mc.style.top = v;
    // أزرار الكاميرا لا تظهر من تحت بطاقة السؤال أو الإعلان (لا شيء فوق شيء)
    [mc, document.querySelector('.camctl')].forEach(el0 => { if (!el0) return; const r = el0.getBoundingClientRect(), hit = r.width > 2 && ['#qcard', '#banner', '#mid'].some(sel => { const el = $(sel, this.root); if (!el || el.classList.contains('hide')) return false; const c = el.getBoundingClientRect(); return c.width > 2 && c.left < r.right && c.right > r.left && c.top < r.bottom && c.bottom > r.top; });
      const op = hit ? '0' : ''; if (el0.style.opacity !== op) { el0.style.opacity = op; el0.style.pointerEvents = hit ? 'none' : ''; } }); },
  tickUI() { this.placeCtl(); { const P0 = this.P, on = !!(P0 && P0.paused); let pt = $('.pausetag', this.root); if (on && !pt) { pt = document.createElement('div'); pt.className = 'pausetag'; pt.textContent = '⏸ متوقفة مؤقتًا'; $('#dsp', this.root).appendChild(pt); } else if (!on && pt) pt.remove(); if (this.W) this.W.paused = on; if (on) { if (P0.tm) this.endAt = performance.now() + P0.tm.r; SFX.suspend && SFX.suspend(true); } else SFX.suspend && SFX.suspend(false); } if (this.P && this.P.stage === 'crown' && this.P.ribbon && (Math.floor(performance.now() / 12000) % 2 === 1) !== !!this.crownFlip) this.render(); this.reserve(); const t = $('#tbar'); if (t && this.endAt) { const left = Math.max(0, this.endAt - performance.now()); t.style.transform = `scaleX(${left / this.dur})`; const n = $('#tnum'), sec = Math.ceil(left / 1000); if (n && n.textContent !== String(sec)) { n.textContent = sec; n.parentNode.classList.toggle('low', sec <= 5); } } /* الشريط ومعه الثواني بالأرقام (طلب المستخدم) */ const pl = $('#plft'); if (pl && this.P && this.P.phaseLeft != null) pl.textContent = this.P.stage === 'lobby' || this.P.stage === 'crown' ? '' : 'باقي ' + Math.ceil(Math.max(0, this.P.phaseLeft - 0) / 60000) + ' د'; },
  show(id, html) { let changed = false; ['qcard', 'banner', 'mid', 'lobby'].forEach(k => { const el = $('#' + k); if (k === id) { if (html != null && el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; changed = true; } if (el.classList.contains('hide')) changed = true; el.classList.remove('hide'); } else el.classList.add('hide'); }); if (changed) this.fit(); },
  // كل بطاقة تُضبط لتسع الشاشة تحت الشريط العلوي: تُختصر ثم تُصغَّر بقدر الحاجة فقط، فلا تفيض ولا تغطي الأعلى
  fit() { const vw = innerWidth, vh = innerHeight; let top = 0; $$('.dsp .brand, #phase, #dom', this.root).forEach(e => { const b = e.getBoundingClientRect(); if (b.height > 2 && b.width > 2) top = Math.max(top, b.bottom); }); const mc = document.getElementById('mapctl'); if (mc && mc.offsetWidth) top = Math.max(top, mc.getBoundingClientRect().bottom);
    $$('#qcard, #banner, #mid, #lobby', this.root).forEach(el => { if (el.classList.contains('hide')) return; el.style.zoom = ''; el.style.maxHeight = 'none'; el.classList.remove('compact');
      const mid = el.id === 'mid', room = mid ? vh - 2 * (top + 8) : vh - top - 18 - (parseFloat(getComputedStyle(el).bottom) || 0);
      const ok = () => { const b = el.getBoundingClientRect(); return el.scrollWidth <= el.clientWidth + 2 && b.height <= room && b.width <= vw - 12; };
      if (ok()) return; el.classList.add('compact'); if (ok()) return; for (let z = .92; z >= .5; z -= .06) { el.style.zoom = z.toFixed(2); if (ok()) return; } }); },
  render() {
    const P = this.P; if (!P) return; const T = P.teams, tn = i => i == null ? 'محايد' : esc(T[i].name), tc = i => i == null ? '#999' : T[i].color;
    // الشريط العلوي: المرحلة والسيطرة
    $('#phase').innerHTML = P.stage === 'lobby' ? '' : `<b class="k">${esc(P.phaseName || '')}</b><span>الجولة ${P.cycle || 0} · <span id="plft"></span>${P.castleIn > 0 && P.castle ? ` · <span class="ccd">🏰 القلعة بعد ${Math.max(1, Math.ceil(P.castleIn / 60000))} د</span>` : ''}</span>`;
    if (this.W && this.W.setCastle && P.castle) this.W.setCastle({ owner: P.castle.owner, safe: P.castle.safe });
    if (P.score) { const tot = (P.nRegions || 1) - 1 + 4; $('#dom').innerHTML = `<div class="bar">${T.map((t, i) => `<i style="flex:${P.score[i]};background:${t.color}"></i>`).join('')}<i style="flex:${Math.max(0, tot - P.score.reduce((a, b) => a + b, 0))};background:rgba(255,255,255,.18)"></i></div><div class="names">${T.map((t, i) => `<span><i class="chip" style="background:${t.color}"></i>${esc(t.name)} <em>${P.score[i]}</em></span>`).join('')}</div>`; }
    else $('#dom').innerHTML = '';
    const tbar = `<div class="tline"><div class="timer"><i id="tbar"></i></div><b id="tnum"></b></div>`, st = P.stage;
    const slog = $('#slog'); slog.innerHTML = '';
    if (st === 'lobby') { const url = joinUrl(P.code, P.fp); return this.show('lobby', `<div><div class="qr">${url ? qrSvg(url) : ''}</div><div class="code">رمز الغرفة<b>${esc(P.code)}</b></div></div><div><div class="ptitle k" style="font-size:64px;text-align:start">امسح الرمز وانضم</div><div class="mut" style="font-size:20px;margin:6px 0 20px">اختر فريقك من جوالك، وأول من ينضم يكون القائد</div><div class="teams">${T.map((t, i) => { const pl = Object.entries(P.players).filter(([, p]) => p.t === i).sort(([a], [b]) => (b === t.cap) - (a === t.cap)), n = pl.length; return `<div class="team" style="--tc:${t.color}"><h3>${esc(t.name)}</h3>${pl.slice(0, 4).map(([pid, p]) => `<div class="p ${t.cap === pid ? 'cap' : ''}">${t.cap === pid ? '👑 ' : ''}${esc(p.n)}</div>`).join('')}${n > 4 ? `<div class="p">و${n - 4} آخرون</div>` : ''}${n ? '' : '<div class="p">بانتظار المتسابقين…</div>'}<div class="cnt">${n ? (n === 1 ? 'لاعب واحد' : n === 2 ? 'لاعبان' : n + (n <= 10 ? ' لاعبين' : ' لاعبًا')) : 'بانتظار المتسابقين'}</div></div>`; }).join('')}</div></div>`); }
    if (st === 'phase' && P.ev && P.ev.k === 'phase') { // ما ينفتح يظهر واحدًا بعد الآخر (كل ثانيتين) ومع كل واحد سطر يشرح فائدته
      const C = RayatRules.CFG, cg = (C.YIELD.castle.gold || 0) + (C.CASTLE_TRIBUTE.gold || 0), U = { occupy: ['🚩', 'الاحتلال', 'خذوا أرضًا فاضية ملاصقة لأرضكم'], supply: ['🧺', 'التموين', `+${C.SUPPLY} من المورد الذي تحتاجونه`], inf: ['⚔️', 'المشاة', 'هاجموا أرض جاركم'], walls: ['🧱', 'الأسوار', 'المهاجم يحتاج فوزين'], cav: ['🐎', 'الفرسان', 'تقفز فوق أرض وتضرب أبعد'], tower: ['🗼', 'برج المراقبة', 'يوقف الفرسان'], garInf: ['🛡️', 'الحامية', 'تصدّ هجومًا واحدًا'], alliance: ['🤝', 'التحالفات', 'فريقان يهاجمان معًا ويتقاسمان الكلفة'], cat: ['🪨', 'المنجنيق', 'يهدم السور حتى لو صمد المدافع'], cap2: ['🏙️', 'تطوير العاصمة', 'حصاد أكثر ونهب أقل'], castle: ['🏰', 'القلعة', `${C.CASTLE_POINTS} أراضٍ + ${cg} ذهب كل جولة`] };
      const un = (P.ev.unlock || []).filter(k => U[k]), STEP = 2.2, lines = un.length ? un.map((k, i) => `<div class="pline" style="animation-delay:${(1.2 + i * STEP).toFixed(1)}s"><b>${U[k][0]} ${U[k][1]}</b><span>${U[k][2]}</span></div>`).join('') : P.ev.key === 'final' ? '<div class="pline" style="animation-delay:1.2s"><b>⚡ سقطت التحالفات كلها</b><span>وكل فريق لنفسه</span></div>' : '';
      const caps = (P.ev.caps || []).length ? `<div class="pcaps" style="animation-delay:${(1.2 + un.length * STEP + .4).toFixed(1)}s"><i>👑 القيادة تنتقل:</i>${P.ev.caps.map(([t, n]) => `<span><b style="color:${(T[t] || {}).color || 'inherit'}">${esc((T[t] || {}).name || '')}</b> ${esc(n)}</span>`).join('')}</div>` : '';
      return this.show('mid', `<div class="kind">المرحلة</div><div class="ptitle k">${esc(P.ev.name)}</div>${lines ? `<div class="punlock">${un.length ? 'ينفتح الآن:' : ''}</div><div class="plines">${lines}</div>` : ''}${caps}`); }
    if ((st === 'question' || st === 'reveal' || st === 'gq') && P.q) { const q = P.q, rev = st === 'reveal';
      const head = st === 'gq' ? `سؤال حامية القلعة · إن أصاب نصف ${tn(P.duel.a)} أخذوا القلعة` : `سؤال الجولة ${P.cycle} · ${esc(q.topic || '')}`;
      const res = rev && P.ans ? `<div class="row" style="justify-content:center;gap:18px;margin-top:16px;flex-wrap:wrap">${T.map((t, i) => `<span style="font-weight:700"><i class="chip" style="background:${t.color}"></i> ${esc(t.name)}: ${Math.round((P.ans.ratios[i] || 0) * 100)}٪ ← ${P.ans.orders[i] || 0} ${P.ans.orders[i] === 1 ? 'أمر' : P.ans.orders[i] === 2 ? 'أمران' : 'أوامر'}</span>`).join('')}</div>` : '';
      return this.show('qcard', `<div class="qtop"><span>${head}</span><span>${rev ? '' : `أجاب ${(P.answered || []).length || q.answered || P.duel && P.duel.gqN || 0}`}</span></div><div class="qtext">${esc(q.text)}</div><div class="opts">${q.c.map((c, i) => `<div class="opt ${rev ? (i === q.a ? 'right' : 'dim') : ''}"><span class="L">${LET[i]}</span>${esc(c)}</div>`).join('')}</div>${rev && q.f ? `<div class="athar">${esc(q.f)}</div>` : ''}${res}${rev ? '' : tbar}`); }
    if (st === 'orders') { const ot = P.orderTeams || [];
      return this.show('banner', `<small>${P.ordersNew ? 'أدوات جديدة انفتحت: وقت أطول للتفكير' : 'تأملوا الخريطة وتشاوروا، ثم يختار القائد'}</small><b class="k">${ot.map(t => `<span style="color:${tc(t)}">${tn(t)}${P.ready && P.ready[t] ? ' ✓' : ''}</span>`).join(' · ')}</b>${tbar}`); }
    if (st === 'predict' || st === 'buzz' || st === 'judge' || st === 'point') { const D = P.duel; if (!D) return; const need = D.kind === 'castle' ? 'أفضل من ثلاثة' : D.need.a > 1 ? 'المهاجم يحتاج فوزين' : 'فوز واحد يحسم';
      const pips = (side, team) => `<div class="pips" style="color:${tc(team)}">${Array.from({ length: D.need[side] }, (_, k) => `<i class="${k < D.pts[side] ? 'on' : ''}"></i>`).join('')}</div>`;
      const vs = `<div class="kind">${esc(D.kindAr)} · ${esc(D.rn)} · ${need}</div><div class="vs"><div class="side" style="color:${tc(D.a)}"><b class="k">${tn(D.a)}${D.ally != null ? ' + ' + tn(D.ally) : ''}</b><span>يهاجمون ${D.betray ? '(نقض الحلف)' : D.revenge ? '(ثأر)' : ''}</span>${pips('a', D.a)}</div><div class="x">⚔</div><div class="side" style="color:${tc(D.d)}"><b class="k">${tn(D.d)}</b><span>يدافعون</span>${pips('d', D.d)}</div></div>`;
      if (st === 'predict') return this.show('mid', vs + `<div class="punlock">الفرق المتفرجة: توقّعوا الفائز من جوالاتكم (${D.preds} توقع)</div>${tbar}`);
      const dopts = `<div class="opts">${D.q ? D.q.c.map((c, i) => `<div class="opt ${(D.wrong || []).includes(i) ? 'no' : D.ans === i ? 'ok' : ''}"><span class="L">${LET[i]}</span>${esc(c)}</div>`).join('') : ''}</div>`, score = `<span><span style="color:${tc(D.a)}">${tn(D.a)} ${D.pts.a}</span> – <span style="color:${tc(D.d)}">${D.pts.d} ${tn(D.d)}</span></span>`;
      if (st === 'point') return this.show('qcard', `<div class="qtop"><span>${esc(D.kindAr)} · ${esc(D.rn)}</span>${score}</div><div class="qtext">${D.q ? esc(D.q.text) : ''}</div>${dopts}<div class="who" style="text-align:center;font-size:26px;color:${tc(D.last === 'a' ? D.a : D.d)}">نقطة لـ${D.last === 'a' ? tn(D.a) : tn(D.d)}، والمواجهة مستمرة</div>`);
      if (st === 'judge' && D.buzz) return this.show('qcard', `<div class="qtop"><span>${esc(D.kindAr)} · ${esc(D.rn)}</span>${score}</div><div class="qtext">${esc(D.q.text)}</div>${dopts}<div style="text-align:center;margin-top:10px"><span class="mut">${D.buzz.pass ? 'أخطأ الأول، والسؤال الآن عند' : 'ضغط أولًا ويختار من جواله'}</span> <span class="who" style="font-size:30px;color:${tc(D.buzz.team)}">${tn(D.buzz.team)}${D.buzz.name ? ' · ' + esc(D.buzz.name) : ''}</span></div>${tbar}`);
      if (!this.lockT) this.lockT = setInterval(() => { const el = document.getElementById('dlock'); if (!el) return; const l = +el.dataset.u - performance.now(); el.textContent = l > 0 ? 'اقرؤوا السؤال… ' + Math.ceil(l / 1000) : 'اضغطوا الجرس!'; el.classList.toggle('go', l <= 0); }, 200);
      const lk = D.lock > 0 && !P.paused;
      return this.show('qcard', `<div class="qtop"><span style="color:${tc(D.a)}">${tn(D.a)}</span><span id="dlock" class="${lk ? '' : 'go'}" data-u="${performance.now() + (lk ? D.lock : 0)}">${lk ? 'اقرؤوا السؤال… ' + Math.ceil(D.lock / 1000) : 'اضغطوا الجرس!'}</span><span style="color:${tc(D.d)}">${tn(D.d)}</span></div><div class="qtext">${esc(D.q.text)}</div>${dopts}${tbar}`); }
    if (st === 'scene' && P.ev) { const e = P.ev, cap = this.caption(e, T);
      if (!cap) return this.show(null); return this.show('banner', `<small>${cap[0]}</small><b class="k">${cap[1]}</b>${cap[2] ? `<div class="guide">${esc(cap[2])}</div>` : ''}`); }
    if (st === 'harvest' && P.harvest) return this.show('banner', `<small>الحصاد: أراضيكم تنتج كل جولة</small><div class="row" style="gap:22px;justify-content:center;margin-top:6px">${T.map((t, i) => { const h = P.harvest[i] || {}; return `<div style="text-align:center"><b style="color:${t.color};font-family:var(--fd);font-size:20px">${esc(t.name)}</b><div class="mut" style="font-size:14px">🌾${h.food || 0} · 💰${h.gold || 0} · 🪨${h.stone || 0}</div></div>`; }).join('')}</div>`);
    if (st === 'bini' && P.bini) { const b = P.bini; return this.show('mid', `<div class="kind">بيني ${b.mult > 1 ? `مضاعف ×${b.mult}` : ''}</div><div class="ptitle k" style="font-size:72px">${esc(b.name)}</div><div class="punlock" style="font-family:var(--ft);max-width:820px;margin-inline:auto">${esc(b.desc)}</div>${b.n ? `<div class="punlock">من كل فريق: ${b.n}</div>` : ''}<div class="punlock gold">الجائزة: ${b.mult} ${b.mult === 1 ? 'أمر' : b.mult === 2 ? 'أمران' : 'أوامر'}</div>${b.running ? tbar : ''}`); }
    if (st === 'tie' && P.tie) { const t = P.tie; return this.show('qcard', `<div class="qtop"><span>المواجهة الفاصلة: تعادل في الصدارة · الفائز أول من يصل نقطتين</span><span>${t.teams.map((x, i) => `<span style="color:${tc(x)}">${tn(x)} ${t.pts[i]}</span>`).join(' · ')}</span></div><div class="qtext">${t.q ? esc(t.q.text) : ''}</div>${t.q ? `<div class="opts">${t.q.c.map((c, i) => `<div class="opt ${(t.wrong || []).includes(i) ? 'no' : ''}"><span class="L">${LET[i]}</span>${esc(c)}</div>`).join('')}</div>` : ''}${t.buzz ? `<div style="text-align:center;margin-top:10px"><span class="mut">يختار من جواله</span> <span class="who" style="font-size:30px;color:${tc(t.buzz.team)}">${tn(t.buzz.team)} · ${esc(t.buzz.name)}</span></div>` : ''}${tbar}`); }
    if (st === 'crown' && P.winner == null && P.rank && P.rank[0]) P.winner = P.rank[0].team;
    if (st === 'crown') { const rib = P.ribbon && P.ribbon.length && Math.floor(performance.now() / 12000) % 2 === 1; this.crownFlip = rib;
      if (rib) return this.show('mid', `<div class="kind">شريط الحرب</div><div class="ribbon">${P.ribbon.map(r => `<div><b class="k">${esc(r.name)}</b>${r.ev.map(t => `<span>${esc(t)}</span>`).join('')}</div>`).join('')}</div>`);
      return this.show('mid', `<div class="kind">التتويج</div><div class="ptitle k" style="color:${tc(P.winner)}">${tn(P.winner)}</div><div class="punlock">أبطال الجزيرة</div><div class="rank">${(P.rank || []).map((r, k) => `<div style="--tc:${tc(r.team)}"><b>${k + 1}. ${tn(r.team)}</b><span>${r.score} أرض</span></div>`).join('')}</div>`); }
    if (st === 'scene' || st === 'phase') return this.show(null);
    this.show(null);
  },
  caption(e, T) { const tn = i => i == null ? '' : `<span style="color:${T[i].color}">${esc(T[i].name)}</span>`, rn = r => esc(this.W ? this.W.M.regions[r].name : '');
    switch (e.k) {
      case 'attack': { const u = { inf: 'المشاة', cav: 'الفرسان', cat: 'المنجنيق' }[e.unit] || ''; const res = e.result === 'taken' ? `${tn(e.a)} يفتحون ${rn(e.r)}` : e.result === 'loot' ? `${tn(e.a)} ينهبون عاصمة ${tn(e.d)}` : e.result === 'garrisonFell' ? `سقطت حامية ${rn(e.r)}، وصمدت الأرض` : e.wallsBroken ? `${tn(e.d)} يصدّون الهجوم، لكن سورهم انهدم` : `${tn(e.d)} يصدّون الهجوم`;
        return [`هجوم ${u}${e.ally != null ? ' مشترك' : ''}`, res, guideLine(e, T)]; }
      case 'occupy': return ['احتلال', `${tn(e.team)} يحتلون ${rn(e.r)}`, guideLine(e, T)];
      case 'walls': return ['تحصين', `${tn(e.team)} يبنون سورًا في ${rn(e.r)}`, guideLine(e, T)];
      case 'tower': return ['برج مراقبة', `${tn(e.team)} يرفعون برجًا في ${rn(e.r)}`, guideLine(e, T)];
      case 'garInf': case 'garCav': return ['حامية', `${tn(e.team)} ينشرون حامية في ${rn(e.r)}`, guideLine(e, T)];
      case 'capital': return ['تطوير العاصمة', `${tn(e.team)}: عاصمتهم صارت ${e.level === 2 ? 'مدينة' : 'حاضرة'}`, guideLine(e, T)];
      case 'supply': return ['تموين', `${tn(e.team)} +${e.n} ${RES_AR[e.res]}`, ''];
      case 'batch': { const by = {}; e.list.forEach(x => { const a = x.k === 'occupy' ? 'احتلال ' + rn(x.r) : x.k === 'supply' ? 'تموين ' + RES_AR[x.res] : x.k === 'capital' ? 'تطوير العاصمة' : (GUIDE[x.k] ? GUIDE[x.k].t : '') + (x.r != null ? ' ' + rn(x.r) : ''); (by[x.team] = by[x.team] || []).push(a); });
        return ['أوامر الجولة', `<span class="rows">${Object.entries(by).map(([t, a]) => `<span>${tn(+t)}: <em>${a.join('، ')}</em></span>`).join('')}</span>`, '']; }
      case 'ally': return ['تحالف', `${tn(e.a)} و${tn(e.b)} يتحالفون`, guideLine(e, T)];
      case 'unally': return [e.betray ? 'نقض الحلف' : 'نهاية حلف', e.betray ? `${tn(e.a)} ينقضون حلفهم مع ${tn(e.b)}` : `انتهى الحلف بين ${tn(e.a)} و${tn(e.b)}`, guideLine(e, T)];
    } return null; }
};
