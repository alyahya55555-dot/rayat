// محاكاة لواجهة room في صفحات Claude (للاختبار فقط — ليست المنصة الحقيقية)
(() => {
  const BC = window.BroadcastChannel; window.BroadcastChannel = function (name) { if (name === 'bena-v1') throw new Error('disabled in mock'); return new BC(name); }; // نعطّل القناة المحلية للتطبيق لإجبار مسار الغرفة
  const peer = Math.random().toString(36).slice(2, 10);
  const role = location.hash.startsWith('#host') ? 'admin' : 'view';
  function makeRoom(name) {
    const ch = new BC('mock-' + name), peers = new Map(), topicH = {}, peerH = [];
    let myPres = {}, pending = { joined: [], updated: [], left: [] }, scheduled = false;
    const flush = () => { scheduled = false; const c = { peers: [...peers.values()], ...pending }; pending = { joined: [], updated: [], left: [] }; peerH.forEach(f => f(c)); };
    const sched = () => { if (!scheduled) { scheduled = true; setTimeout(flush, 16); } };
    peers.set(peer, { peer, by: 'u-' + peer, isMe: true, sameTab: true, kind: 'viewer', guest: false, presence: {}, updatedAt: Date.now() });
    ch.onmessage = e => { const m = e.data;
      if (m.t === 'pres') { const ex = peers.get(m.peer); const p = Object.freeze({ peer: m.peer, by: 'u-' + m.peer, isMe: false, sameTab: false, kind: 'viewer', guest: false, presence: Object.freeze(m.p), updatedAt: Date.now() }); peers.set(m.peer, p); (ex ? pending.updated : pending.joined).push(p); sched(); if (m.hello) ch.postMessage({ t: 'pres', peer, p: myPres }); }
      if (m.t === 'bye') { const ex = peers.get(m.peer); if (ex) { peers.delete(m.peer); pending.left.push(ex); sched(); } }
      if (m.t === 'emit') (topicH[m.topic] || []).forEach(f => f({ peer: m.peer, by: 'u-' + m.peer, isMe: false, sameTab: false, kind: 'viewer', guest: false, topic: m.topic, data: m.data }));
    };
    window.addEventListener('pagehide', () => ch.postMessage({ t: 'bye', peer }));
    ch.postMessage({ t: 'pres', peer, p: {}, hello: true });
    return { name,
      emit(topic, data) { if (role !== 'admin') return Promise.reject({ code: 'not_permitted' }); if (JSON.stringify(data).length > 4096) return Promise.reject({ code: 'invalid_argument', message: '>4KiB' }); ch.postMessage({ t: 'emit', peer, topic, data }); return Promise.resolve(); },
      on(t, f) { (topicH[t] = topicH[t] || []).push(f); return () => { }; },
      presence(patch) { Object.entries(patch).forEach(([k, v]) => { if (v === null) delete myPres[k]; else myPres[k] = v; }); if (JSON.stringify(myPres).length > 4096) return Promise.reject({ code: 'invalid_argument' }); peers.set(peer, { ...peers.get(peer), presence: { ...myPres } }); ch.postMessage({ t: 'pres', peer, p: myPres }); return Promise.resolve(); },
      peers() { return [...peers.values()]; },
      onPeers(f) { peerH.push(f); setTimeout(() => f({ peers: [...peers.values()], joined: [...peers.values()], left: [], updated: [] }), 0); return () => { }; },
      connected() { return true; }, onConnection(f) { setTimeout(() => f(true), 0); return () => { }; },
      leave() { ch.postMessage({ t: 'bye', peer }); ch.close(); return Promise.resolve(); } };
  }
  window.claude = { use: async n => { await new Promise(r => setTimeout(r, 30)); if (n === 'room') return { join: async name => makeRoom(name) }; if (n === 'user') return { id: async () => 'u-' + peer, canEdit: () => role === 'admin', isOwner: () => role === 'admin' }; return null; } };
})();
