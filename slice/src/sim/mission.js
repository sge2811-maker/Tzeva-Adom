// Iron Wall (13–14 April 2024), ported from mission c5 of the main game:
// drones first, then cruise missiles, then three ballistic salvos, mostly aimed at Nevatim.
// Slice additions: the Tzeva Adom beat in Arad (siren -> shelters -> all-clear).
import { firstImpactT } from './pacing.js';

const COALITION_LINES = [
  'Jordanian F-16s down drones over Jordan.',
  'US F-15Es engage the swarm over Iraq.',
  'RAF Typhoons report kills over Jordan.',
  'French Rafales intercept drones east of the border.',
  'Allied jets keep thinning the swarm before it reaches Israel.',
];

export function createMission(sim) {
  const P = sim.pacing, rng = sim.rng;
  const FIRST = firstImpactT(P);
  const timeline = [];
  const at = (t, fn) => timeline.push({ t, fn });
  const pending = []; // staggered spawns { t, fn }
  const later = (t, fn) => pending.push({ t, fn });

  sim.objectives = [
    { id: 'shelter', text: 'Get everyone outdoors in Arad into a protected space before impact', state: 'active', detail: '' },
    { id: 'nevatim', text: 'Keep Nevatim Air Base operational (above 60%)', state: 'active', detail: '' },
    { id: 'town', text: 'No missile impacts in Arad', state: 'active', detail: '' },
    { id: 'hold', text: 'Hold until the all-clear', state: 'active', detail: '' },
  ];
  const obj = (id) => sim.objectives.find((o) => o.id === id);
  const setObj = (id, state, detail) => {
    const o = obj(id); if (!o || o.state === state) return;
    o.state = state; if (detail != null) o.detail = detail;
    sim.bus.emit('objective', { t: sim.t, id, state, detail: o.detail });
  };

  // ---------------------------------------------------------------- script
  at(0, () => sim.msg('23:00 · Iran launches about 170 Shahed drones at Israel. Flight time: several hours.', 'alert'));
  at(4, () => sim.msg('Jordan closes its airspace. US, British and French jets are patrolling over Jordan and Iraq.', 'info'));
  at(9, () => sim.msg("Deploy batteries on the open pads. Iron Dome stops drones and cruise missiles; David's Sling also stops ballistic missiles low in the atmosphere.", 'hint'));
  at(P.airPatrol.readyAt, () => { sim.msg('Air patrol available: call coalition fighters to thin the drones east of Arad.', 'hint'); sim.bus.emit('airpatrol:ready', { t: sim.t }); });
  at(40, () => sim.msg(`Plan the shelters now. When the siren sounds, people outdoors have ${P.countdown} seconds.`, 'hint'));
  for (const [t, n] of P.drones.waves) at(t, () => { for (let i = 0; i < n; i++) later(sim.t + i * 1.1, () => sim.spawn('drone')); });
  // allied kills over Jordan and Iraq: distant flashes on the eastern horizon
  {
    let t = P.coalitionScreen.from, k = 0;
    while (t < P.coalitionScreen.to) {
      const kk = k++;
      at(t, () => {
        const x = rng.range(23000, 46000), z = rng.range(-14000, 12000), y = rng.range(500, 2800);
        sim.stats.coalition++;
        sim.bus.emit('intercept', { t: sim.t, id: -1, kind: 'coalition', threatType: 'drone', kill: true, x, y, z, vx: -150, vy: 0, vz: 0, target: 'nevatim', tti: 999, big: false, offmap: true });
        if (kk % 4 === 1) sim.msg(COALITION_LINES[Math.floor(kk / 4) % COALITION_LINES.length], 'good');
      });
      t += rng.range(P.coalitionScreen.every[0], P.coalitionScreen.every[1]);
    }
  }
  at(P.cruise.t - 1, () => sim.msg('Cruise missiles launched. IAF fighters stop most of them outside Israel; 5 are still inbound, low and fast.', 'alert'));
  for (let i = 0; i < P.cruise.n; i++) at(P.cruise.t + i * P.cruise.gap, () => sim.spawn('cruise'));
  at(P.ballisticLaunchMsg, () => { sim.msg('01:30 · Ballistic missile launch detected. More than 100 missiles. Impact expected within minutes.', 'alert'); sim.bus.emit('ballistic:launch', { t: sim.t }); });
  at(P.resupplyAt, () => { sim.budget += P.resupplyAmount; sim.msg(`US interceptor resupply: +$${P.resupplyAmount}M.`, 'good'); sim.bus.emit('budget', { t: sim.t, value: sim.budget, delta: P.resupplyAmount }); });
  at(P.earlyWarning, () => { sim.msg('Home Front Command early warning for the Negev: stay near a protected space.', 'alert'); sim.bus.emit('alert:early', { t: sim.t }); });
  at(P.alertAt, () => {
    sim.setPhase('alert');
    sim.civ.alert();
    sim.alertActive = true;
    sim.msg(`צבע אדום · Red alert in Arad. ${P.countdown} seconds to reach a protected space.`, 'alert');
    sim.bus.emit('alert:start', { t: sim.t, zone: 'Arad', countdown: P.countdown, impactAt: FIRST });
  });
  at(P.sm3Screen, () => {
    sim.msg('US Navy destroyers engage ballistic missiles with SM-3 interceptors.', 'good');
    for (let i = 0; i < 3; i++) later(sim.t + i * 0.7, () => {
      sim.stats.sm3++;
      sim.bus.emit('intercept', { t: sim.t, id: -1, kind: 'sm3', threatType: 'ballistic', kill: true, x: rng.range(50000, 64000), y: rng.range(38000, 47000), z: rng.range(-9000, 7000), vx: -2500, vy: -400, vz: 0, target: 'nevatim', tti: 60, big: true, offmap: true });
    });
  });
  P.salvos.forEach((S, si) => {
    at(S.enter, () => {
      const id = si + 1;
      sim.salvos[id] = { id, n: S.n, left: S.n, kill: 0, impacts: 0, nevatim: 0, town: 0, open: 0, pass: 0 };
      sim.msg(id === 1 ? `Salvo 1 of ${P.salvos.length}: ${S.n} ballistic missiles entering the sector. Arrow 3 engaging outside the atmosphere.`
        : `Salvo ${id} of ${P.salvos.length}: ${S.n} missiles${id === P.salvos.length ? '. Some are aimed at Ramon Air Base further south' : ''}.`, 'alert');
      sim.bus.emit('salvo:start', { t: sim.t, id, n: S.n });
      const passN = id === P.salvos.length ? 3 : 0;
      // errant missiles come at the tail of a salvo, when the upper layer is busiest
      const errantAt = new Set(); for (let e = 0; e < S.errant; e++) errantAt.add(S.n - 1 - passN - e);
      for (let i = 0; i < S.n; i++) {
        const forced = errantAt.has(i) ? 'town' : i >= S.n - passN ? 'pass' : null;
        later(sim.t + i * 0.38, () => { const th = sim.spawn('ballistic', { salvo: id, forced }); return th; });
      }
    });
  });
  at(FIRST, () => {
    const exposed = sim.civ.markExposed();
    sim.exposedAtImpact = exposed;
    const total = sim.civ.total;
    if (exposed === 0) { setObj('shelter', 'done', `${total} of ${total} in protected spaces`); sim.msg('Everyone outdoors in Arad reached a protected space.', 'good'); }
    else { setObj('shelter', 'failed', `${total - exposed} of ${total} sheltered in time`); sim.msg(`Impact window. ${exposed} people in Arad are still outdoors.`, 'alert'); }
    sim.setPhase('barrage');
    sim.bus.emit('alert:impactWindow', { t: sim.t, exposed, total });
  });
  timeline.sort((a, b) => a.t - b.t);

  // ---------------------------------------------------------------- per-step
  let ti = 0;
  const lastSalvoT = P.salvos[P.salvos.length - 1].enter + P.ballisticFlight + 3;
  function step() {
    const t = sim.t;
    while (ti < timeline.length && timeline[ti].t <= t) timeline[ti++].fn();
    for (let i = pending.length - 1; i >= 0; i--) if (pending[i].t <= t) { const f = pending[i].fn; pending.splice(i, 1); f(); }
    // objectives that can fail mid-mission
    if (sim.nevatim < 60) setObj('nevatim', 'failed', `${Math.round(sim.nevatim)}%`);
    else if (obj('nevatim').state === 'active') obj('nevatim').detail = `${Math.round(sim.nevatim)}%`;
    if (sim.townHits > 0) setObj('town', 'failed', `${sim.townHits} impact${sim.townHits > 1 ? 's' : ''}`);
    const sh = obj('shelter');
    if (sh.state === 'active') { const c = sim.civ.counts(); sh.detail = `${c.inside} of ${c.total} in protected spaces`; }
    // barrage -> hold -> aftermath -> debrief
    if (sim.phase === 'barrage' && t > lastSalvoT && !sim.threats.some((th) => th.alive) && !pending.length) {
      sim.setPhase('hold'); sim.holdUntil = t + P.shelterHold; sim.alertActive = false;
      sim.msg('Last salvo is down. Stay in the protected space: all-clear in 10 minutes.', 'info');
      sim.bus.emit('alert:end', { t });
    }
    if (sim.phase === 'hold' && t >= sim.holdUntil) {
      sim.setPhase('aftermath'); sim.debriefAt = t + P.aftermath;
      sim.civ.allClear();
      setObj('hold', 'done');
      sim.msg('02:05 · All clear. People in Arad can leave the protected spaces.', 'good');
      sim.bus.emit('allclear', { t });
    }
    if (sim.phase === 'aftermath' && t >= sim.debriefAt) finish();
  }
  function finish() {
    if (obj('nevatim').state === 'active') setObj('nevatim', 'done', `${Math.round(sim.nevatim)}%`);
    if (obj('town').state === 'active') setObj('town', 'done', 'No impacts');
    const win = sim.objectives.every((o) => o.state === 'done');
    sim.result = { win, t: sim.t, nevatim: sim.nevatim, townHits: sim.townHits, exposed: sim.exposedAtImpact ?? 0, total: sim.civ.total, stats: sim.stats, budget: sim.budget };
    sim.setPhase('debrief');
    sim.bus.emit('mission:end', { t: sim.t, ...sim.result });
  }

  function onImpact(th, kind) {
    if (th.salvo && sim.salvos[th.salvo]) salvoTick(th.salvo, kind === 'nevatim' ? 'nevatim' : kind === 'town' ? 'town' : 'open');
    if (kind === 'nevatim') sim.msg(`Impact at Nevatim Air Base (−${th.type === 'ballistic' ? 7 : th.type === 'cruise' ? 6 : 3}%).`, 'alert');
    else if (kind === 'town') sim.msg('Impact in Arad: a building on the edge of town is hit.', 'alert');
    else if (rng.chance(0.3)) sim.msg(`${th.type === 'drone' ? 'A drone' : th.type === 'cruise' ? 'A cruise missile' : 'A ballistic missile'} fell on open ground. No damage.`, 'info');
  }
  function onKill(th) { if (th.salvo && sim.salvos[th.salvo]) salvoTick(th.salvo, 'kill'); }
  function onPass(th) { if (th.salvo && sim.salvos[th.salvo]) salvoTick(th.salvo, 'pass'); }
  function salvoTick(id, how) {
    const S = sim.salvos[id]; if (S.done) return;
    S[how]++; if (how !== 'kill' && how !== 'pass') S.impacts++;
    S.left--;
    if (S.left <= 0) {
      S.done = true;
      sim.bus.emit('salvo:end', { t: sim.t, ...S });
      const parts = [`${S.kill} of ${S.n} intercepted`];
      if (S.nevatim) parts.push(`${S.nevatim} hit Nevatim`);
      if (S.town) parts.push(`${S.town} hit Arad`);
      if (S.open) parts.push(`${S.open} fell on open ground`);
      if (S.pass) parts.push(`${S.pass} flew on south`);
      sim.msg(`Salvo ${id}: ${parts.join(', ')}.`, S.nevatim || S.town ? 'alert' : 'good');
    }
  }

  return { step, onImpact, onKill, onPass, FIRST };
}
