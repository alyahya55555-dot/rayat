// أدوات مشتركة للاختبار والمحاكاة: الخريطة الحقيقية، وساعة وهمية، وبنك أسئلة صناعي
const path = require('path');
globalThis.d3 = require(path.join(__dirname, '../../vendor/d3-delaunay/d3-delaunay.min.js'));
require('../map.js');
const { Rayat } = require('../engine.js');

const seeded = seed => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
// أسئلة صناعية: الإجابة الصحيحة دائمًا في خانة ثابتة حسب الرقم
const fakeBank = (n = 600) => Array.from({ length: n }, (_, i) => ({ id: 'q' + i, d: 1 + (i % 3), q: 'سؤال ' + i, c: ['أ', 'ب', 'ج', 'د'], a: i % 4 }));
const maps = {};
const mapFor = (n, seed = 7) => maps[n + ':' + seed] || (maps[n + ':' + seed] = RayatMap.fair(n, seed));

function mk(nTeams = 4, opts = {}) {
  let clock = 1e9;
  const e = new Rayat(Object.assign({ map: mapFor(nTeams, opts.seed), bank: fakeBank(), rng: seeded(opts.rngSeed || 42), now: () => clock }, opts));
  e.adv = s => { clock += s * 1000; };
  e.clock = () => clock;
  return e;
}
function join(e, perTeam = 4) { const n = e.s.teams.length; for (let i = 0; i < n * perTeam; i++) e.upsertStudent({ sid: 's' + i, name: 'طالب ' + i, want: 't' + ((i % n) + 1) }); }
// يدخل مرحلة لعب مباشرة (بالمفتاح)
function goPhase(e, k) { const { PHASES } = require('../engine.js'); if (e.s.step === 'lobby') e.start(); while (require('../engine.js').PHASES[e.s.phase].k !== k) { e.s.step = 'phaseEnd'; e.nextPhase(); } }
module.exports = { seeded, fakeBank, mapFor, mk, join, goPhase, Rayat };
