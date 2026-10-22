// Gameplay regression (Node, no browser): the mission must stay winnable with sensible play and
// losable without it, and the town plan must stay valid. Run after touching sim/, world/ or pacing.
// Usage: node tools/regress.mjs
import { createBus } from '../src/core/bus.js';
import { buildLayout, findPath } from '../src/world/layout.js';
import { createSim, SIM_DT } from '../src/sim/sim.js';
import { createDemo } from '../src/sim/demo.js';

let fail = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fail++; };

// layout validity
const L = buildLayout(1);
check(L.buildings.length > 200, `town has ${L.buildings.length} buildings`);
for (const g of L.groups) for (const s of L.shelters) {
  const p = findPath(L, g.node, s.node);
  if (!p) check(false, `no street path ${g.id} -> ${s.id}`);
}
check(true, 'every group can reach every shelter by street');
for (const s of L.shelters) {
  const hit = L.buildings.find((b) => Math.abs(b.x - s.x) < b.w / 2 + 4 && Math.abs(b.z - s.z) < b.d / 2 + 4);
  check(!hit, `shelter ${s.id} is clear of buildings`);
}

function run(seed, mode) {
  const bus = createBus(); bus.logEnabled = false;
  const sim = createSim({ seed, layout: buildLayout(seed), bus });
  const demo = createDemo(sim, mode);
  sim.start();
  while (sim.phase !== 'debrief' && sim.t < 600) { demo.step(); sim.step(SIM_DT); }
  return sim;
}
const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
const good = seeds.map((s) => run(s, 'good'));
const bad = seeds.map((s) => run(s, 'bad'));
const gw = good.filter((s) => s.result && s.result.win).length, bw = bad.filter((s) => s.result && s.result.win).length;
check(good.every((s) => s.phase === 'debrief'), 'every run reaches the debrief');
check(gw >= 7, `good play wins ${gw}/8 (need >= 7)`);
check(bw === 0, `doing nothing loses ${8 - bw}/8 (need 8)`);
check(good.every((s) => s.exposedAtImpact === 0), 'good play shelters everyone before impact in every seed');
check(bad.every((s) => s.exposedAtImpact > 0), 'without routing, people are caught outdoors');
const d = good[0];
check(Math.abs(d.firstImpact - 235) < 1e-6, `first impact window at t=${d.firstImpact} (shots assume 235)`);
console.log(fail ? `\n${fail} check(s) failed` : '\nall checks passed');
process.exit(fail ? 1 : 0);
