/* خطوط «رايات»: خط ثمانية بعائلاته الثلاث.
   مصدره الرسمي الوحيد font.thmanyah.com، ويُمنع إعادة توزيعه، فلا يُدمج في الملف المنشور:
   المشرف يختار الملف المضغوط الرسمي (أو ملفات الخط نفسها) فيُحفظ في هذا المتصفح وحده (IndexedDB)،
   وتقرؤه شاشة العرض المفتوحة على الحاسوب نفسه. وحتى يُحمَّل تعمل الخطوط البديلة في styles.
   العائلات: Thmanyah Display للعناوين الكبيرة، Thmanyah Text للأسئلة والنصوص، Thmanyah Sans للواجهة والأرقام والأسماء. */
(function (root) {
  const DB = 'rayat-fonts', ST = 'files';
  const FAMILY = [[/serif\s*display/i, 'Thmanyah Display'], [/serif\s*text/i, 'Thmanyah Text'], [/sans/i, 'Thmanyah Sans']];
  const WEIGHT = [[/black|heavy/i, 900], [/extra\s*bold/i, 800], [/semi\s*bold/i, 600], [/bold/i, 700], [/medium/i, 500], [/light/i, 300], [/regular|book|normal/i, 400]];
  const isFont = n => /\.(otf|ttf|woff2?)$/i.test(n) && !/(^|\/)__MACOSX\//.test(n) && !/(^|\/)\./.test(n.split('/').pop());

  // من اسم الملف: thmanyahserifdisplay-Bold.otf ← Thmanyah Display 700
  function classify(name) {
    const base = name.split('/').pop().replace(/[-_]+/g, ' ');
    const fam = FAMILY.find(([re]) => re.test(base.replace(/thmanyah/i, '').replace(/(serif)(display|text)/i, '$1 $2')));
    if (!fam) return null;
    const w = WEIGHT.find(([re]) => re.test(base));
    return { family: fam[1], weight: w ? w[1] : 400 };
  }

  // قارئ zip صغير: الملفات المخزّنة أو المضغوطة بـ deflate، عبر DecompressionStream في المتصفح
  async function unzip(buf) {
    const dv = new DataView(buf), u8 = new Uint8Array(buf), out = [];
    let eocd = -1; for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('ليس ملفًا مضغوطًا صالحًا');
    let p = dv.getUint32(eocd + 16, true); const n = dv.getUint16(eocd + 10, true), td = new TextDecoder();
    for (let k = 0; k < n; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
      const name = td.decode(u8.subarray(p + 46, p + 46 + nl)); p += 46 + nl + xl + cl;
      if (!isFont(name) || !classify(name)) continue;
      const lnl = dv.getUint16(off + 26, true), lxl = dv.getUint16(off + 28, true), data = u8.slice(off + 30 + lnl + lxl, off + 30 + lnl + lxl + csize);
      let bytes;
      if (method === 0) bytes = data;
      else if (method === 8) bytes = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
      else continue;
      out.push({ name: name.split('/').pop(), bytes });
    }
    return out;
  }

  const idb = () => new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(ST); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  async function tx(mode, fn) { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction(ST, mode), st = t.objectStore(ST), r = fn(st); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); }); }

  const loaded = new Set();
  async function register(list) {
    let n = 0;
    for (const f of list) {
      const c = classify(f.name); if (!c) continue;
      const key = c.family + ':' + c.weight; if (loaded.has(key)) continue;
      try { const ff = new FontFace(c.family, f.bytes, { weight: String(c.weight), display: 'swap' }); await ff.load(); document.fonts.add(ff); loaded.add(key); n++; } catch (e) { }
    }
    if (n) document.documentElement.classList.add('thmanyah');
    return n;
  }

  const Fonts = {
    // ملفات من <input type=file multiple>: zip رسمي أو otf/ttf/woff
    async add(files) {
      const list = [];
      for (const file of files) {
        const buf = await file.arrayBuffer();
        if (/\.zip$/i.test(file.name)) list.push(...await unzip(buf));
        else if (isFont(file.name)) list.push({ name: file.name, bytes: new Uint8Array(buf) });
      }
      const ok = list.filter(f => classify(f.name));
      if (!ok.length) return { ok: false, why: 'لم أجد ملفات خط ثمانية في ما اخترت' };
      await tx('readwrite', st => { ok.forEach(f => st.put(f.bytes, f.name)); });
      const n = await register(ok);
      return { ok: true, files: ok.length, faces: n, families: [...new Set(ok.map(f => classify(f.name).family))] };
    },
    // عند فتح أي شاشة على هذا الحاسوب
    async load() {
      try { const db = await idb(); const names = await new Promise(res => { const r = db.transaction(ST).objectStore(ST).getAllKeys(); r.onsuccess = () => res(r.result); r.onerror = () => res([]); });
        const list = []; for (const name of names) { const bytes = await new Promise(res => { const r = db.transaction(ST).objectStore(ST).get(name); r.onsuccess = () => res(r.result); r.onerror = () => res(null); }); if (bytes) list.push({ name, bytes }); }
        return register(list);
      } catch (e) { return 0; }
    },
    async clear() { await tx('readwrite', st => st.clear()); },
    status() { return [...loaded]; },
    classify, unzip
  };
  root.RayatFonts = Fonts;
})(typeof window !== 'undefined' ? window : globalThis);
