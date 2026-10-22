// Deterministic mission simulation. No DOM, no THREE: runs in the browser and in Node
// (tools/sim-check.mjs). Fixed step 1/60 s. Visual systems only READ sim state and listen to bus
// events; player input goes through sim.cmd().
import { makeRng } from '../core/rng.js';
import { PACING, firstImpactT, clockMinutes } from './pacing.js';
import { createThreats } from './threats.js';
import { createDefense, BAT } from './defense.js';
import { createCivilians } from './civilians.js';
import { createMission } from './mission.js';

export const SIM_DT = 1 / 60;

export function createSim({ seed = 1, layout, bus, pacing = PACING }) {
  const sim = {
    seed, layout, bus, pacing,
    rng: makeRng(seed, 'sim'),
    t: 0, started: false, phase: 'intro',
    budget: 300, doctrine: 'protect', nevatim: 100, townHits: 0, patrolCd: 0,
    alertActive: false, exposedAtImpact: null, holdUntil: 0, debriefAt: 0, result: null,
    salvos: {}, messages: [], objectives: [],
    stats: {
      launched: { drone: 0, cruise: 0, ballistic: 0 }, killed: { drone: 0, cruise: 0, ballistic: 0 },
      impacts: { nevatim: 0, town: 0, open: 0 }, by: {}, shots: {}, spent: 0, missed: 0, coalition: 0, sm3: 0,
    },
    firstImpact: firstImpactT(pacing),
    BAT,
  };
  sim.msg = (text, kind = 'info') => {
    const m = { t: sim.t, text, kind };
    sim.messages.push(m);
    bus.emit('msg', m);
  };
  sim.setPhase = (p) => {
    if (sim.phase === p) return;
    const from = sim.phase; sim.phase = p;
    bus.emit('phase', { t: sim.t, from, to: p });
  };
  sim.countdownLeft = () => (sim.phase === 'alert' ? Math.max(0, sim.firstImpact - sim.t) : null);
  sim.clockMinutes = () => clockMinutes(sim.t, pacing);

  const threats = createThreats(sim);
  sim.threats = threats.list;
  sim.spawn = threats.spawn;
  sim.timeToImpact = threats.timeToImpact;
  const defense = createDefense(sim);
  sim.batteries = defense.batteries;
  sim.interceptors = defense.interceptors;
  sim.jets = defense.jets;
  const civ = createCivilians(sim);
  sim.civ = civ;
  sim.shelters = civ.shelters;
  sim.groups = civ.groups;
  sim.groupInfo = civ.groupInfo;
  const mission = createMission(sim);
  sim.onImpact = mission.onImpact;
  sim.onKill = mission.onKill;
  sim.onPass = mission.onPass;

  const queue = [];
  sim.start = () => {
    if (sim.started) return;
    sim.started = true;
    sim.setPhase('prep');
    bus.emit('mission:start', { t: 0 });
  };
  sim.step = (dt = SIM_DT) => {
    if (!sim.started || sim.phase === 'debrief' && sim.t > sim.debriefAt + 120) return;
    sim.t += dt;
    while (queue.length) apply(queue.shift());
    mission.step();
    threats.step(dt);
    defense.step(dt);
    civ.step(dt);
    if (sim.patrolCd > 0) sim.patrolCd = Math.max(0, sim.patrolCd - dt);
  };

  // ---------------------------------------------------------------- commands (player / autopilot)
  // Every command is logged with sim time so runs can be replayed exactly.
  sim.commandLog = [];
  sim.cmd = (name, args = {}) => {
    const c = { name, args, t: sim.t };
    sim.commandLog.push(c);
    return apply(c);
  };
  function apply(c) {
    const { name, args } = c;
    let r;
    switch (name) {
      case 'build': r = defense.build(args.pad, args.type); if (r.ok) sim.msg(`${BAT[args.type].name} deployed at ${sim.layout.pads.find((p) => p.id === args.pad).name}.`, 'good'); break;
      case 'doctrine': sim.doctrine = args.mode === 'all' ? 'all' : 'protect'; r = { ok: true }; bus.emit('doctrine', { t: sim.t, mode: sim.doctrine }); break;
      case 'route': r = civ.route(args.group, args.shelter, args.by || 'player'); break;
      case 'unlock': r = civ.unlock(args.shelter); break;
      case 'airPatrol': r = defense.airPatrol(args.x ?? 9000, args.z ?? -1500); break;
      case 'hold': { const b = sim.batteries.find((q) => q.id === args.battery); if (b) { b.hold = !!args.on; r = { ok: true }; } else r = { ok: false, why: 'No battery' }; break; }
      default: r = { ok: false, why: `Unknown command ${name}` };
    }
    if (r && !r.ok && r.why) bus.emit('cmd:rejected', { t: sim.t, name, why: r.why });
    bus.emit('cmd', { t: sim.t, name, args, ok: !!(r && r.ok) });
    return r;
  }

  return sim;
}
