// Headless mission run in Node (no browser, no rendering): balance and regression check.
// Usage: node tools/sim-check.mjs [--seeds 1,2,3] [--demo good|bad] [--verbose]
import { createBus } from '../src/core/bus.js';
import { buildLayout } from '../src/world/layout.js';
import { createSim, SIM_DT } from '../src/sim/sim.js';
import { createDemo } from '../src/sim/demo.js';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const seeds = opt('seeds', '1,2,3,4,5').split(',').map(Number);
const demoMode = opt('demo', 'good');
const verbose = args.includes('--verbose');

const rows = [];
for (const seed of seeds) {
  const bus = createBus();
  const layout = buildLayout(seed);
  const sim = createSim({ seed, layout, bus });
  const demo = createDemo(sim, demoMode);
  const phases = [];
  bus.on('phase', (p) => phases.push(`${p.to}@${p.t.toFixed(0)}`));
  if (verbose) bus.on('msg', (m) => console.log(`  [${m.t.toFixed(1).padStart(6)}] ${m.kind.padEnd(5)} ${m.text}`));
  sim.start();
  const t0 = performance.now();
  let steps = 0;
  while (sim.phase !== 'debrief' && sim.t < 600) { demo.step(); sim.step(SIM_DT); steps++; }
  const ms = performance.now() - t0;
  const r = sim.result || {};
  const s = sim.stats;
  rows.push({
    seed, demo: demoMode, win: r.win, t: sim.t.toFixed(0), nevatim: Math.round(sim.nevatim), townHits: sim.townHits,
    exposed: sim.exposedAtImpact, launched: `${s.launched.drone}/${s.launched.cruise}/${s.launched.ballistic}`,
    killed: `${s.killed.drone}/${s.killed.cruise}/${s.killed.ballistic}`, impacts: `${s.impacts.nevatim}/${s.impacts.town}/${s.impacts.open}`,
    by: JSON.stringify(s.by), budget: sim.budget.toFixed(1), spent: s.spent.toFixed(1), msPerSimMin: (ms / (sim.t / 60)).toFixed(1),
    objectives: sim.objectives.map((o) => `${o.id}:${o.state}`).join(' '),
  });
  if (verbose) console.log('phases', phases.join(' → '));
}
console.table(rows);
