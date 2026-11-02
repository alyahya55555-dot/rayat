/* ===== قرية الحرب والألعاب الجديدة: القصف، الاتهام، اختراق الخزنة، المعركة، القرعة ===== */
const BKEYS = ['wall', 'tower', 'barracks', 'catapult'];
function vRow(P, tid) { const r = (P && P.V || []).find(x => x[0] === tid); return r ? { gold: r[1], b: { wall: r[2], tower: r[3], barracks: r[4], catapult: r[5] }, atk: r[6], def: r[7] } : null; }
function lvlIcons(v) { return BKEYS.map(k => `<span title="${D.BUILD[k].name}">${D.BUILD[k].icon}${v.b[k]}</span>`).join(' '); }

// رسم القرية: يتغيّر الشكل مع كل مستوى بناء
function villageSVG(color, v) {
  const b = v ? v.b : { wall: 0, tower: 0, barracks: 0, catapult: 0 };
  let g = `<ellipse cx="200" cy="228" rx="195" ry="26" fill="#1d3b2c"/><ellipse cx="200" cy="222" rx="180" ry="20" fill="#2f5a3e"/>`;
  const tower = (x, h) => `<g><rect x="${x - 15}" y="${222 - h}" width="30" height="${h}" fill="#8f969e" stroke="#4b5158" stroke-width="2"/>${[0, 1, 2].map(i => `<rect x="${x - 15 + i * 11}" y="${214 - h}" width="8" height="9" fill="#8f969e" stroke="#4b5158" stroke-width="1.5"/>`).join('')}<rect x="${x - 4}" y="${232 - h}" width="8" height="12" fill="#2b2f33"/><line x1="${x}" y1="${214 - h}" x2="${x}" y2="${188 - h}" stroke="#ddd" stroke-width="2"/><polygon points="${x},${188 - h} ${x + 18},${194 - h} ${x},${200 - h}" fill="${color}"/></g>`;
  if (b.tower >= 3) g += tower(200, 120);
  // الثكنات (خيام) يسارًا
  for (let i = 0; i < b.barracks; i++) { const x = 34 + i * 40; g += `<polygon points="${x},212 ${x + 19},170 ${x + 38},212" fill="#c9a46a" stroke="#7a5a2c" stroke-width="2"/><polygon points="${x + 13},212 ${x + 19},190 ${x + 25},212" fill="#5b3f1c"/><line x1="${x + 19}" y1="170" x2="${x + 19}" y2="154" stroke="#ddd" stroke-width="2"/><polygon points="${x + 19},154 ${x + 32},158 ${x + 19},163" fill="${color}"/>`; }
  // المنجنيق يمينًا
  for (let i = 0; i < b.catapult; i++) { const x = 300 + i * 32; g += `<g stroke="#5b3f1c" stroke-width="4" fill="none"><line x1="${x}" y1="206" x2="${x + 26}" y2="206"/><line x1="${x + 8}" y1="206" x2="${x + 14}" y2="186"/><line x1="${x + 14}" y1="186" x2="${x + 30}" y2="164"/></g><circle cx="${x + 31}" cy="162" r="5" fill="#777"/><circle cx="${x + 4}" cy="210" r="6" fill="#3a2a14"/><circle cx="${x + 22}" cy="210" r="6" fill="#3a2a14"/>`; }
  // القلعة الرئيسة
  g += `<rect x="160" y="126" width="80" height="80" fill="#e4dac0" stroke="#8a7d5c" stroke-width="2"/><polygon points="150,128 200,84 250,128" fill="${color}" stroke="rgba(0,0,0,.35)" stroke-width="2"/><rect x="190" y="174" width="20" height="32" rx="9" fill="#5b3f1c"/><rect x="172" y="140" width="14" height="14" fill="#6b8fb3"/><rect x="214" y="140" width="14" height="14" fill="#6b8fb3"/><line x1="200" y1="84" x2="200" y2="52" stroke="#eee" stroke-width="2.5"/><polygon points="200,52 226,59 200,66" fill="${color}"/>`;
  if (b.tower >= 1) g += tower(95, 92);
  if (b.tower >= 2) g += tower(305, 92);
  // السور: خشب ← حجر ← حصن
  if (b.wall === 1) { for (let x = 52; x < 350; x += 13) { if (x > 178 && x < 222) continue; g += `<rect x="${x}" y="190" width="10" height="30" rx="3" fill="#8b5a2b" stroke="#5b3a1a" stroke-width="1.5"/><polygon points="${x},190 ${x + 5},182 ${x + 10},190" fill="#8b5a2b"/>`; } }
  if (b.wall >= 2) { const h = b.wall === 3 ? 44 : 32, y = 222 - h, col = b.wall === 3 ? '#6f7780' : '#9aa1a8'; g += `<rect x="46" y="${y}" width="132" height="${h}" fill="${col}" stroke="#3e444a" stroke-width="2"/><rect x="222" y="${y}" width="132" height="${h}" fill="${col}" stroke="#3e444a" stroke-width="2"/>`; for (let x = 46; x < 354; x += 18) { if (x > 172 && x < 222) continue; g += `<rect x="${x}" y="${y - 9}" width="11" height="10" fill="${col}" stroke="#3e444a" stroke-width="1.5"/>`; } g += `<path d="M178 222 V${y + 6} Q200 ${y - 14} 222 ${y + 6} V222 Z" fill="#3b2a16" stroke="#3e444a" stroke-width="2"/>`; if (b.wall === 3) g += `<line x1="182" y1="${y + 10}" x2="182" y2="222" stroke="#222" stroke-width="2"/><line x1="190" y1="${y + 2}" x2="190" y2="222" stroke="#222" stroke-width="2"/><line x1="200" y1="${y - 2}" x2="200" y2="222" stroke="#222" stroke-width="2"/><line x1="210" y1="${y + 2}" x2="210" y2="222" stroke="#222" stroke-width="2"/><line x1="218" y1="${y + 10}" x2="218" y2="222" stroke="#222" stroke-width="2"/>`; }
  return `<svg viewBox="0 0 400 255" class="vsvg">${g}</svg>`;
}

// ---------- المسرح ----------
(function () {
  const S = Stage.prototype;
  const base = { mainHTML: S.mainHTML, mainKey: S.mainKey, openingHTML: S.openingHTML, crownHTML: S.crownHTML, statusHTML: S.statusHTML };
  S.mainKey = function (P) { const I = P.I || {}; return base.mainKey.call(this, P) + JSON.stringify([P.V, P.bomb, P.bs, P.dn, I.sh && [I.sh[0], I.sh[2]], I.shl && I.shl.length, I.vt && [I.vt.cr, Object.keys(I.vt.lk || {}), I.vt.tr], P.tr, I.res2 ? 1 : 0, P.dn ? (this.R.L || []).map(x => x[2]).join() : 0]); };
  S.villageCard = function (P, t, extra = '') { const v = vRow(P, t.id); return `<div class="vcard" style="--tc:${t.color}"><div class="vh"><b>${esc(t.name)}</b><span>💰 ${v ? v.gold : 0}</span></div>${villageSVG(t.color, v)}<div class="vf">${v ? lvlIcons(v) : ''}<span class="pw">⚔️ ${v ? v.atk : 5} · 🛡️ ${v ? v.def : 5}</span></div>${extra}</div>`; };
  S.mainHTML = function (P) {
    const I = P.I || {};
    if (P.g === 'battle' && P.ph !== 'intro' && P.ph !== 'done') return this.battleHTML(P);
    if (P.g === 'council' && P.I && P.ph !== 'done') return this.councilHTML(P);
    if (I.k === 'roles') return `<div class="intro"><div class="ico">🎭</div><div class="nm" style="font-size:96px">في كل فريق مخرّب سري</div><div class="ds">افتحوا جوالاتكم بعيدًا عن أعين زملائكم: جوالك يخبرك هل أنت المخرّب أم من الأوفياء.<br>إجابة الفريق = رأي أغلبيته. المخرّب يحاول تضليلكم دون أن ينكشف.</div>${P.tr < this.teams().length ? '<div class="ds" style="font-size:28px">(الفرق التي يقل أعضاؤها عن 3 تلعب دون مخرّب)</div>' : ''}</div>`;
    if (I.k === 'accuse') return this.accuseHTML(P);
    if (I.k === 'vault') return this.vaultHTML(P);
    if (P.bomb && (P.ph === 'aim' || (P.ph === 'reveal' && I.shl && I.shl.length))) return this.bombHTML(P);
    return base.mainHTML.call(this, P);
  };
  S.councilHTML = function (P) {
    const I = P.I, T = this.teams(), R = I.res2 || {};
    const head = P.ph === 'reveal' ? 'قرارات مجالس القرى' : P.ph === 'open' ? 'صوّتوا من جوالاتكم: ماذا نبني بذهبنا؟' : 'مجلس القرية';
    return `<div class="big-q sm" style="margin-bottom:20px">🏗️ ${head}</div><div class="vgrid" style="--n:${T.length}">${T.map(t => { const r = R[t.id]; const built = r && r.built ? (r.built.length ? 'بنى: ' + r.built.map(k => D.BUILD[k].icon + ' ' + D.BUILD[k].name).join('، ') : 'ادّخر ذهبه') : ''; return this.villageCard(P, t, built ? `<div class="vb">${esc(built)}</div>` : ''); }).join('')}</div><div data-dyn="status"></div>`;
  };
  S.battleHTML = function (P) {
    const T = this.teams(), bt = P.bt || [], k = P.bs || 0;
    if (!k) return `<div class="big-q sm" style="margin-bottom:20px">🏰 الجيوش تتجهز للمعركة الكبرى</div><div class="vgrid" style="--n:${T.length}">${T.map(t => this.villageCard(P, t)).join('')}</div><div class="status-line">كل فريق يهاجم البقية: إن غلبت قوةُ هجومه دفاعَ الخصم ربح <b>+10</b>، وإلا ربح المدافع <b>+5</b></div>`;
    const r = bt[k - 1], A = this.tm(r[0]);
    return `<div class="battle"><div class="att">${this.villageCard(P, { id: r[0], name: A.name, color: A.color })}<div class="mini-bz" style="--tc:${A.color};margin-top:16px">⚔️ يهاجم بقوة ${r[1]}</div></div><div class="vs-list">${r[3].map(([b, win, pts], i) => { const B = this.tm(b); return `<div class="vrow ${win ? 'win' : 'hold'}" style="--tc:${B.color};animation-delay:${.4 + i * .5}s"><b>${esc(B.name)}</b><span>🛡️ ${(bt.find(x => x[0] === b) || [])[2]}</span><span class="res">${win ? '💥 اخترق السور  +10 ' + esc(A.name) : '🛡️ صمد  +5 ' + esc(B.name)}</span></div>`; }).join('')}</div></div><div class="status-line">الهجوم ${k} من ${bt.length}</div>`;
  };
  S.bombHTML = function (P) {
    const I = P.I, T = this.teams(), sh = I.sh || [], last = I.shl && I.shl[I.shl.length - 1];
    const shooter = this.tm(sh[0]);
    let line = '';
    if (P.ph === 'aim') line = `<span class="mini-bz" style="--tc:${shooter.color}">🎯 ${esc(shooter.name)}${sh[1] ? ' — ' + esc(sh[1]) : ''} يختار هدفه${sh[2] > 1 ? ' (قذيفتان)' : ''}</span>`;
    if (last) { const tg = this.tm(last.t); line += `<div style="margin-top:14px;font-size:38px">${last.sh ? `🛡️ صدّ سورُ ${esc(tg.name)} القذيفة!` : last.v ? `💥 أصاب قلعة ${esc(tg.name)}: <b style="color:var(--ok)">+${last.g}</b> لـ${esc(shooter.name)} و<b style="color:var(--bad)">${last.l || 0}</b> لـ${esc(tg.name)}` : `💨 خانة فارغة في قلعة ${esc(tg.name)}`}</div>`; }
    return `<div class="big-q sm" style="margin-bottom:24px">💣 القصف</div><div class="bgrids" style="--n:${T.length}">${T.map(t => { const cells = (P.bomb || {})[t.id] || []; return `<div class="bgrid ${t.id === sh[0] ? 'own' : ''}" style="--tc:${t.color}"><b>${esc(t.name)}</b><div class="cells">${cells.map((c, i) => { const boom = last && last.t === t.id && last.c === i; return `<div class="cell ${c === null ? '' : c === 's' ? 'sh' : 'hit'} ${boom ? 'boom' : ''}">${c === null ? '🏰' : c === 's' ? '🛡️' : c ? '💥' + c : '💨'}</div>`; }).join('')}</div></div>`; }).join('')}</div><div class="status-line">${line}</div>`;
  };
  S.accuseHTML = function (P) {
    const I = P.I, T = this.teams();
    if (!I.rv) return `<div class="intro"><div class="ico">🕵️</div><div class="nm" style="font-size:100px">من المخرّب؟</div><div class="ds">كل عضو يصوّت من جواله على زميل يشك أنه المخرّب. إن كشفته أغلبية الفريق: <b style="color:var(--brand2)">+25</b></div></div><div data-dyn="status"></div>`;
    const R = I.res2 || {};
    return `<div class="big-q sm" style="margin-bottom:26px">🎭 كشف المخرّبين</div><div class="team-res">${T.filter(t => R[t.id]).map(t => { const r = R[t.id]; return `<div class="r" style="--tc:${t.color};min-width:380px"><b>${esc(t.name)}</b><div class="s">اتهموا: ${esc(r.accused || 'لم يتفقوا')}</div><div style="font-size:34px;margin:8px 0">${r.sab ? 'المخرّب: <b>' + esc(r.sab) + '</b>' : 'بلا مخرّب'}</div><div class="p" style="color:${r.caught ? 'var(--ok)' : 'var(--brand2)'}">${r.sab ? (r.caught ? '✅ كُشف +25' : '🎭 نجا') : '—'}</div></div>`; }).join('')}</div>`;
  };
  S.vaultHTML = function (P) {
    const I = P.I, T = this.teams(), V = I.vt || { cr: {}, lk: {}, tr: {} };
    const lines = [`> جارٍ الاتصال بخزنة «بناء» المركزية…`, `> طبقات الحماية: رمز من ${V.n || 4} أرقام`, P.ph === 'ready' ? '> بانتظار أمر الاختراق…' : `> وُزّعت التلميحات على جوالات أعضاء كل فريق`, I.rv ? `> الرمز الصحيح: ${I.a}` : '> الرمز: ████'];
    return `<div class="term"><div class="tl">${lines.map((l, i) => `<div style="animation-delay:${i * .25}s">${esc(l)}</div>`).join('')}</div><div class="tteams">${T.map(t => { const c = V.cr[t.id], lk = V.lk[t.id], tr = (V.tr || {})[t.id] || 0; return `<div class="tt ${c ? 'ok' : lk ? 'lk' : ''}" style="--tc:${t.color}"><b>${esc(t.name)}</b><span>${c ? `✅ اخترق — المركز ${c[0]} — ${esc(c[1])} (${Math.round(c[2] / 1000)}ث)` : lk ? '⛔ رمز خاطئ — مقفلة مؤقتًا' : P.ph === 'open' ? '⌛ يحاول الاختراق…' : '🔒'}</span><small>محاولات: ${tr}</small></div>`; }).join('')}</div></div>`;
  };
  S.openingHTML = function (P) {
    if (P.ph !== 'draw') return base.openingHTML.call(this, P);
    const T = this.teams(), L = this.R.L || [];
    if (!P.dn) return `<div class="intro"><div class="ico">🎲</div><div class="nm">قرعة الفرق</div><div class="ds">بعد لحظات يوزَّع الجميع على الفرق عشوائيًا وبالتساوي</div></div>`;
    return `<div class="big-q sm" style="margin-bottom:26px">🎲 نتيجة القرعة</div><div class="draw" style="--n:${T.length}">${T.map((t, ci) => `<div class="dc" style="--tc:${t.color}"><b>${esc(t.name)}</b>${L.filter(x => x[2] === t.id).map((x, i) => `<span style="animation-delay:${(i * T.length + ci) * .12}s">${esc(x[1])}</span>`).join('')}</div>`).join('')}</div>`;
  };
  S.crownHTML = function (P) {
    let h = base.crownHTML.call(this, P);
    if (P.ph === 'awards' && P.mvp && P.mvp.sab && P.mvp.sab.length) h += `<div class="status-line" style="margin-top:14px">🎭 أمكر مخرّب (نجا من الاتهام): <b>${P.mvp.sab.map(esc).join('، ')}</b></div>`;
    if ((P.ph === 'winner' || P.ph === 'awards') && P.V && !P.tie) h += '';
    return h;
  };
})();

// ---------- جوال الطالب ----------
(function () {
  const base = { bodyHTML: Student.bodyHTML, bind: Student.bind };
  Student.bodyHTML = function (P, me, t) {
    if (!P || !me || !P.g) return base.bodyHTML.call(this, P, me, t);
    const I = P.I || {}, pr = this.priv || {}, mine = this.local[I.qid];
    const role = P.g === 'traitor' && pr.r ? (pr.r === 's' ? `<div class="pl-state lose" style="font-size:15px">🎭 دورك السري: <b>المخرّب</b> — ضلّل فريقك بهدوء ولا تنكشف</div>` : `<div class="pl-state" style="font-size:15px">🛡️ دورك السري: <b>من الأوفياء</b> — راقب زملاءك</div>`) : '';
    if (I.k === 'roles') return pr.r === 's' ? `<div class="pl-state big lose">🎭 أنت المخرّب!</div><div class="pl-state">هدفك أن يختار فريقك إجابات خاطئة <b>دون أن يكتشفوك</b>. شارك بثقة، واقترح بلطف، ولا تُظهر جوالك لأحد.<br><span class="mut">إن نجوت من الاتهام نلت لقب «أمكر مخرّب» في التتويج.</span></div>` : pr.r === 'i' ? `<div class="pl-state big win">🛡️ أنت من الأوفياء</div><div class="pl-state">في فريقك مخرّب واحد يحاول تضليلكم. أجيبوا بحذر، وراقبوا من يدفعكم نحو الخطأ.</div>` : `<div class="pl-state">⏳ جارٍ استلام دورك السري…</div>`;
    if (P.g === 'council' && I.k === 'council') return this.councilPhone(P, me);
    if (P.g === 'battle') { const v = vRow(P, me.team); return `<div class="pl-state big">🏰 المعركة الكبرى</div>${v ? `<div class="pl-vil">${villageSVG(t.color, v)}</div><div class="pl-state">⚔️ هجوم ${v.atk} · 🛡️ دفاع ${v.def}</div>` : ''}<div class="pl-state">تابع الشاشة الكبيرة!</div>`; }
    if (I.k === 'accuse') {
      if (I.rv) { const r = (I.res2 || {})[me.team]; return role + `<div class="pl-state big ${r && r.caught ? 'win' : ''}">${r ? (r.sab ? (r.caught ? '✅ كشفتم المخرّب: ' + esc(r.sab) : '🎭 نجا المخرّب: ' + esc(r.sab)) : 'لم يكن في فريقك مخرّب') : ''}</div>`; }
      if (P.ph !== 'open') return role + `<div class="pl-state">استعدوا للتصويت…</div>`;
      const mates = (this.R.L || []).filter(x => x[2] === me.team && x[0] !== me.sid);
      return role + `<div class="pl-q">🕵️ من المخرّب في فريقك؟</div><div class="pl-choices">${mates.map(x => `<button data-acc="${esc(x[0])}" class="${mine === x[0] ? 'sel' : ''}" ${mine != null ? 'disabled' : ''}>${esc(x[1])}</button>`).join('')}</div>${mine != null ? `<div class="pl-state">${(I.ad || []).includes(me.sid) ? '✅ وصل صوتك' : '⏳ جارٍ الإرسال…'}</div>` : ''}<div class="pl-timer" data-tm></div>`;
    }
    if (I.k === 'vault') return this.vaultPhone(P, me);
    if (P.bomb && P.ph === 'aim') return this.aimPhone(P, me);
    let h = base.bodyHTML.call(this, P, me, t);
    if (P.g === 'traitor' && P.mode === 'all' && P.ph === 'open') h = '<div class="mut" style="text-align:center;font-size:13px">إجابة فريقك = رأي الأغلبية</div>' + h;
    if (P.bomb && P.ph === 'reveal' && I.shl && I.shl.length) { const l = I.shl[I.shl.length - 1], tg = this.team(l.t); h += `<div class="pl-state">${l.sh ? '🛡️ صدّ السور القذيفة' : '💥 أصابت القذيفة قلعة ' + esc(tg ? tg.name : '') + ' (' + l.v + ')'}</div>`; }
    return role + h;
  };
  Student.councilPhone = function (P, me) {
    const I = P.I, v = vRow(P, me.team), mine = this.local[I.qid], t = this.team(me.team);
    if (!v) return `<div class="pl-state">القرية غير مفعّلة</div>`;
    if (I.rv) { const r = (I.res2 || {})[me.team]; return `<div class="pl-vil">${villageSVG(t.color, v)}</div><div class="pl-state big">${r && r.built && r.built.length ? 'بنيتم: ' + r.built.map(k => D.BUILD[k].icon + ' ' + D.BUILD[k].name).join('، ') : 'ادّخرتم الذهب'}</div><div class="pl-state">💰 المتبقي ${v.gold}</div>`; }
    const opts = BKEYS.map((k, i) => { const lv = v.b[k], cost = lv >= 3 ? null : D.BUILD_COST[lv]; const can = cost != null && cost <= v.gold; return `<button data-ans="${i}" class="${mine === i ? 'sel' : ''}" ${P.ph !== 'open' || mine != null ? 'disabled' : ''}><span class="L">${D.BUILD[k].icon}</span><span style="flex:1">${D.BUILD[k].name} <small class="mut">مستوى ${lv}/3 — ${esc(D.BUILD[k].desc)}</small></span><span class="mut" style="font-size:14px">${cost == null ? 'مكتمل' : cost + ' 💰' + (can ? '' : ' ✖')}</span></button>`; }).join('');
    return `<div class="pl-vil">${villageSVG(t.color, v)}</div><div class="pl-state">💰 ذهب فريقك: <b>${v.gold}</b> — ⚔️ ${v.atk} · 🛡️ ${v.def}</div>${P.ph === 'open' ? '<div class="pl-q">صوّت: ماذا نبني؟</div>' : '<div class="pl-state">سيُفتح التصويت بعد لحظات</div>'}<div class="pl-choices">${opts}<button data-ans="4" class="${mine === 4 ? 'sel' : ''}" ${P.ph !== 'open' || mine != null ? 'disabled' : ''}><span class="L">💰</span>ادّخار الذهب لما بعد</button></div>${mine != null ? `<div class="pl-state">${(I.ad || []).includes(me.sid) ? '✅ وصل صوتك' : '⏳ جارٍ الإرسال…'}</div>` : ''}<div class="pl-timer" data-tm></div>`;
  };
  Student.vaultPhone = function (P, me) {
    const I = P.I, V = I.vt || { cr: {}, lk: {}, tr: {} }, pr = this.priv || {}, mt = me.team;
    if (I.rv) return `<div class="pl-term"><div>&gt; الرمز الصحيح: ${esc(I.a)}</div></div><div class="pl-state big ${V.cr[mt] ? 'win' : ''}">${V.cr[mt] ? '✅ اخترق فريقك الخزنة — المركز ' + V.cr[mt][0] : 'لم يخترق فريقك الخزنة'}</div>`;
    if (P.ph !== 'open') return `<div class="pl-term"><div>&gt; جارٍ تجهيز الاختراق…</div></div><div class="pl-state">ستصلك تلميحاتك السرية بعد لحظات</div>`;
    if (V.cr[mt]) return `<div class="pl-state big win">✅ اخترقتم الخزنة! المركز ${V.cr[mt][0]}</div><div class="pl-state">${esc(V.cr[mt][1])} أدخل الرمز الصحيح</div>`;
    const clues = pr.k || [];
    const locked = V.lk[mt];
    return `<div class="pl-term">${clues.length ? clues.map(c => `<div>&gt; ${esc(c)}</div>`).join('') : '<div>&gt; لا تلميح لك هذه المرة: اجمع تلميحات زملائك</div>'}</div><div class="mut" style="text-align:center;font-size:13px">شارك تلميحك مع فريقك بصوت منخفض، فالفرق الأخرى تسمع!</div>${locked ? '<div class="pl-state lose">⛔ رمز خاطئ — الخزنة مقفلة ثوانٍ</div>' : ''}<input class="in" id="vcode" inputmode="numeric" maxlength="4" placeholder="••••" value="${esc(this.local['vc' + I.qid] || '')}" style="font-size:34px;text-align:center;letter-spacing:12px;direction:ltr" ${locked ? 'disabled' : ''}><button class="btn pri big" data-vsend ${locked ? 'disabled' : ''}>💻 إدخال الرمز</button><div class="mut" style="text-align:center">محاولات فريقك: ${(V.tr || {})[mt] || 0}</div><div class="pl-timer" data-tm></div>`;
  };
  Student.aimPhone = function (P, me) {
    const I = P.I, sh = I.sh || [];
    if (sh[3] !== me.sid) { const st = this.team(sh[0]); return `<div class="pl-state big">💣 ${esc(st ? st.name : '')} يختار هدفه</div><div class="pl-state">${sh[1] ? esc(sh[1]) + ' يصوّب الآن…' : 'المشرف يختار الهدف'}</div>`; }
    const T = P.T.filter(x => x[0] !== sh[0]);
    return `<div class="pl-state big win">🎯 أنت من يقصف! ${sh[2] > 1 ? '(قذيفتان)' : ''}</div><div class="mut" style="text-align:center">اختر خانة في قلعة خصم. النقاط مخفية، والسور يحمي بعض الخانات.</div>${T.map(x => { const cells = (P.bomb || {})[x[0]] || []; return `<div class="pl-bgrid" style="--tc:${x[2]}"><b>${esc(x[1])}</b><div>${cells.map((c, i) => c === null ? `<button data-shoot="${x[0]}|${i}">🏰</button>` : `<button disabled>${c === 's' ? '🛡️' : c ? c : '💨'}</button>`).join('')}</div></div>`; }).join('')}<div class="pl-timer" data-tm></div>`;
  };
  Student.bind = function () {
    base.bind.call(this);
    const P = this.P, I = (P && P.I) || {};
    $$('[data-acc]', this.root).forEach(x => x.onclick = () => { if (this.local[I.qid] != null) return; const v = x.dataset.acc; this.local[I.qid] = v; this.net.presence({ an: { q: I.qid, v } }); this._k = null; this.render(); });
    $$('[data-shoot]', this.root).forEach(x => x.onclick = () => { const [t, c] = x.dataset.shoot.split('|'); this.shotN = (this.shotN || 0) + 1; this.net.presence({ sh: { q: I.qid, t, c: +c, n: this.shotN } }); this.vibe([30, 30, 80]); $$('[data-shoot]', this.root).forEach(b => b.disabled = true); });
    const vi = $('#vcode', this.root); if (vi) vi.oninput = () => { this.local['vc' + I.qid] = vi.value.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\D/g, '').slice(0, 4); if (vi.value !== this.local['vc' + I.qid]) vi.value = this.local['vc' + I.qid]; };
    const vs = $('[data-vsend]', this.root); if (vs) vs.onclick = () => { const c = this.local['vc' + I.qid] || ''; if (c.length !== 4) return toast('الرمز 4 أرقام'); this.vcN = (this.vcN || 0) + 1; this.net.presence({ vc: { q: I.qid, c, n: this.vcN } }); this.local['vc' + I.qid] = ''; this.vibe(30); toast('أُرسل الرمز'); this._k = null; this.render(); };
  };
})();

// ---------- لوحة المشرف ----------
(function () {
  const base = { renderDeck: Host.renderDeck, itemDeck: Host.itemDeck, renderTeams: Host.renderTeams, act: Host.act, side_settings: Host.side_settings, side_plan: Host.side_plan };
  Host.renderDeck = function () {
    const E = this.e, seg = E.s.seg, el = $('#deck');
    if (seg && seg.g === 'battle' && seg.phase !== 'done') {
      const bt = seg.battle || E.computeBattle(); const nx = seg.phase === 'intro' ? '🏰 عرض الجيوش' : seg.step < bt.length ? '⚔️ هجوم ' + E.team(bt[seg.step].a).name : 'إنهاء المعركة';
      el.innerHTML = `<div class="h" style="font-size:22px">🏰 المعركة الكبرى</div><table class="tbl"><tr><th>الفريق</th><th>⚔️ هجوم</th><th>🛡️ دفاع</th><th>المباني</th></tr>${E.s.teams.map(t => { const p = E.power(t.id), v = E.vil(t.id); return `<tr><td style="color:${t.color}">${esc(t.name)}</td><td>${p.atk}</td><td>${p.def}</td><td>${lvlIcons(v)}</td></tr>`; }).join('')}</table><div class="note">النتائج حتمية: هجوم أكبر من دفاع الخصم = +10 للمهاجم، وإلا +5 للمدافع.</div><div class="ctl"><button class="btn pri big" data-act="next">${esc(nx)} ←</button></div>`;
      return;
    }
    if (seg && seg.g === 'opening' && seg.phase === 'draw') {
      el.innerHTML = `<div class="h" style="font-size:22px">🎲 القرعة</div><div class="note">توزّع القرعة جميع المتصلين عشوائيًا وبالتساوي، وتظهر النتيجة على الشاشة. يمكنك إعادتها أو تخطيها للإبقاء على التوزيع الحالي.</div><div class="ctl"><button class="btn gold big" data-act="drawteams">🎲 ${seg.drawN ? 'إعادة القرعة' : 'إجراء القرعة'}</button><button class="btn pri big" data-act="next">إدخال الفرق ←</button></div>`;
      return;
    }
    base.renderDeck.call(this);
  };
  Host.itemDeck = function (seg, it, timer) {
    const E = this.e, s = E.s, T = s.teams, tn = id => (E.team(id) || {}).name || '';
    if (it.kind === 'roles') return `<div class="h" style="font-size:20px">🎭 توزيع الأدوار السرية</div><div class="note">وصل لكل طالب دوره مشفّرًا في جواله. المخرّبون (تراهم أنت فقط):</div><div class="col">${T.map(t => `<div><b style="color:${t.color}">${esc(t.name)}:</b> ${seg.sab[t.id] ? esc((s.students[seg.sab[t.id]] || {}).name || '') : '<span class="mut">بلا مخرّب (أقل من 3 أعضاء)</span>'}</div>`).join('')}</div><div class="ctl"><button class="btn" data-act="resab">إعادة التوزيع</button><button class="btn pri big" data-act="next">السؤال الأول ←</button></div>`;
    if (it.kind === 'vault') {
      const V = it; let c = `<div class="row wrap"><span class="pill">${esc(E.segName(seg.g))} — ${seg.idx + 1}/${seg.items.length}</span></div><div class="ans-secret">🔒 الرمز: <span style="direction:ltr;letter-spacing:4px">${esc(it.a)}</span><small>${it.clues.map(esc).join(' · ')}</small></div>`;
      if (seg.phase === 'ready') c += `<div class="ctl"><button class="btn pri big" data-act="open">💻 بدء الاختراق (${(E.gameDef('vault') || {}).time || 150}ث)</button><button class="btn" data-act="next">تخطي</button></div>`;
      if (seg.phase === 'open' || seg.phase === 'reveal') c += `<div class="col">${T.map(t => { const cr = V.cracked[t.id]; const holders = Object.entries(V.cdist || {}).filter(([sid]) => s.students[sid] && s.students[sid].team === t.id).map(([sid, ix]) => esc(s.students[sid].name) + ' (' + ix.map(i => i + 1).join('،') + ')'); return `<div><b style="color:${t.color}">${esc(t.name)}</b> — ${cr ? '✅ المركز ' + cr.ord : 'محاولات ' + (V.tries[t.id] || 0)}<div class="mut" style="font-size:12px">التلميحات: ${holders.join('، ') || '—'}</div></div>`; }).join('')}</div><div class="row wrap"><span class="mut" style="font-size:12px">تسجيل اختراق يدوي (طوارئ):</span>${T.filter(t => !V.cracked[t.id]).map(t => `<button class="chipbtn" data-act="vaultman" data-arg="${t.id}">${esc(t.name)}</button>`).join('')}</div>`;
      if (seg.phase === 'open') c += `<div class="ctl"><button class="btn" data-act="reveal">إنهاء وكشف الرمز</button></div>`;
      if (seg.phase === 'reveal') c += `<div class="ctl"><button class="btn pri big" data-act="next">${seg.idx + 1 >= seg.items.length ? 'إنهاء الجولة' : 'الخزنة التالية'} ←</button></div>`;
      return c + timer;
    }
    if (seg.phase === 'aim' && it.shooter) {
      const sh = it.shooter;
      return `<div class="h" style="font-size:20px">🎯 ${esc(tn(sh.team))} يقصف${sh.sid && s.students[sh.sid] ? ' — ' + esc(s.students[sh.sid].name) + ' يختار من جواله' : ''} (قذائف: ${it.shots})</div><div class="note">القيم ظاهرة لك فقط. يمكنك القصف نيابةً عنه بالضغط على خانة.</div><div class="hbgrids">${T.filter(t => t.id !== sh.team).map(t => `<div><b style="color:${t.color}">${esc(t.name)}</b><div class="hcells">${s.bomb[t.id].map((c, i) => `<button class="${c.hit ? 'hit' : ''}" data-act="shoot" data-arg="${t.id}|${i}" ${c.hit ? 'disabled' : ''}>${c.hit ? (c.sh ? '🛡️' : '💥' + c.v) : (c.sh ? '🛡️' : '') + c.v}</button>`).join('')}</div></div>`).join('')}</div><div class="ctl"><button class="btn" data-act="randshot">🎲 قصف عشوائي</button></div>` + timer;
    }
    let h = base.itemDeck.call(this, seg, it, timer);
    if (it.kind === 'council') h = `<div class="col">${T.map(t => { const v = E.vil(t.id), p = E.power(t.id); return `<div class="row wrap"><b style="color:${t.color};min-width:70px">${esc(t.name)}</b><span>💰 ${v.gold}</span><span>${lvlIcons(v)}</span><span class="mut">⚔️${p.atk} 🛡️${p.def}</span></div>`; }).join('')}</div>` + h;
    if (it.kind === 'accuse') h = `<div class="note">المخرّبون: ${T.map(t => esc(t.name) + ': ' + (seg.sab[t.id] ? esc((s.students[seg.sab[t.id]] || {}).name || '') : '—')).join(' · ')}</div>` + h;
    return h;
  };
  Host.renderTeams = function () {
    base.renderTeams.call(this);
    const E = this.e; if (E.s.settings.village === false) return;
    const cards = $$('#teams .tcard');
    E.s.teams.forEach((t, i) => { const el = cards[i]; if (!el || $('.vline', el)) return; const v = E.vil(t.id), p = E.power(t.id); const d = document.createElement('div'); d.className = 'vline'; d.innerHTML = `<span>💰 ${v.gold}</span><span>${lvlIcons(v)}</span><span class="mut">⚔️${p.atk} 🛡️${p.def}</span><button class="chipbtn" data-act="buildm" data-arg="${t.id}">🏗️ بناء</button>`; el.appendChild(d); });
  };
  Host.side_settings = function () { const st = this.e.s.settings; return base.side_settings.call(this).replace('<hr style="border-color:var(--line)">', `<label class="row"><input type="checkbox" data-set="village" ${st.village !== false ? 'checked' : ''}> قرية الحرب (الذهب والمباني والمعركة)</label><label class="row"><input type="checkbox" data-set="drawInOpening" ${st.drawInOpening !== false ? 'checked' : ''}> قرعة الفرق على الشاشة في الافتتاح</label><hr style="border-color:var(--line)">`); };
  Host.side_plan = function () { return base.side_plan.call(this).replace('<button class="btn sm" data-act="plan60">البرنامج الافتراضي</button>', '<button class="btn sm" data-act="plan60">قصة قرية الحرب</button><button class="btn sm" data-act="planclassic">البرنامج الكلاسيكي</button>'); };
  Host.act = function (a, arg, btn) {
    const E = this.e, [x, y] = String(arg || '').split('|');
    switch (a) {
      case 'buildm': return this.buildModal(arg);
      case 'shoot': E.shoot(x, +y); return;
      case 'randshot': E.randomShot(); return;
      case 'resab': E.reassignSabs(); return;
      case 'drawteams': E.drawTeams(); return;
      case 'planclassic': E.setPlan(D.CLASSIC_PLAN); return;
      case 'vaultman': { const it = E.item(); const m = E.teamMembers(x)[0]; if (it && m) { it.lock[x] = 0; E.vaultTry(m.sid, it.qid, it.a); } return; }
    }
    return base.act.call(this, a, arg, btn);
  };
  Host.buildModal = function (tid) {
    const E = this.e, t = E.team(tid);
    const html = () => { const v = E.vil(tid); return `<div class="col"><div class="h" style="font-size:20px">🏗️ بناء قرية ${esc(t.name)} — 💰 ${v.gold}</div><div style="max-width:320px;margin:auto">${villageSVG(t.color, v)}</div>${BKEYS.map(k => { const lv = v.b[k], c = E.buildCost(tid, k); return `<div class="row"><span style="font-size:22px">${D.BUILD[k].icon}</span><div class="grow"><b>${D.BUILD[k].name}</b> <span class="mut">${lv}/3</span><div class="mut" style="font-size:12px">${esc(D.BUILD[k].desc)}</div></div><button class="btn sm ${c != null && c <= v.gold ? 'pri' : ''}" data-up="${k}" ${c == null || c > v.gold ? 'disabled' : ''}>${c == null ? 'مكتمل' : 'بناء (' + c + ')'}</button></div>`; }).join('')}<div class="note">الطريقة المفضلة أن يقرر الفريق في «مجلس القرية» من جوالاتهم. استخدم هذا للطوارئ أو حين يطلب الفريق شفهيًا.</div><button class="btn" data-close>إغلاق</button></div>`; };
    modal(html(), (m, close) => { const bindUp = () => $$('[data-up]', m).forEach(b => b.onclick = () => { E.upgrade(tid, b.dataset.up); m.innerHTML = html(); $$('[data-close]', m).forEach(c => c.onclick = close); bindUp(); }); bindUp(); });
  };
})();
