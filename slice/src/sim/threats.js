// Incoming threats: Shahed-136 drones, Paveh cruise missiles, Fateh/Emad ballistic missiles.
// Positions are metres in world space. Visual systems read `sim.threats` every frame.
import { groundAt, inTown, inNevatim, GEO } from '../world/geo.js';
import { smoothstep, clamp } from '../core/util.js';

export const THREAT = {
  drone: { name: 'Shahed-136 drone', dmg: 3 },
  cruise: { name: 'Paveh cruise missile', dmg: 6 },
  ballistic: { name: 'Ballistic missile', dmg: 7 },
};

export function createThreats(sim) {
  const list = [];
  let nextId = 1;
  const rng = sim.rng;

  function pickTarget(type, forced) {
    const nev = GEO.nevatim;
    if (forced === 'pass') {
      // overflies the sector toward Ramon Air Base further south; never lands here
      return { x: rng.range(-4000, 3000), z: rng.range(36000, 42000), kind: 'pass', name: 'Ramon (overflight)' };
    }
    if (forced === 'town') {
      // errant missile: falls on the town's outskirts unless intercepted
      const a = rng.range(-Math.PI, Math.PI);
      return { x: Math.cos(a) * rng.range(250, 520), z: Math.sin(a) * rng.range(220, 450), kind: 'town', name: 'Arad' };
    }
    const r = rng.next();
    const openP = type === 'ballistic' ? 0.16 : type === 'drone' ? 0.12 : 0.05;
    if (r < openP) {
      for (let i = 0; i < 30; i++) {
        const x = rng.range(-9000, 2500), z = rng.range(-4500, 7500);
        if (!inTown(x, z, 900) && !inNevatim(x, z) && Math.hypot(x - nev.x, z - nev.z) > nev.r + 600) return { x, z, kind: 'open', name: 'open ground' };
      }
    }
    const a = rng.range(-Math.PI, Math.PI), rr = Math.sqrt(rng.next()) * nev.r * 0.75;
    return { x: nev.x + Math.cos(a) * rr, z: nev.z + Math.sin(a) * rr * 0.7, kind: 'nevatim', name: 'Nevatim' };
  }

  function spawn(type, opts = {}) {
    const tg = pickTarget(type, opts.forced);
    tg.y = groundAt(tg.x, tg.z);
    const th = {
      id: nextId++, type, alive: true, born: sim.t, target: tg, salvo: opts.salvo || 0,
      pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, engaged: 0, heat: 0,
      phase: rng.range(0, Math.PI * 2), s: 0, dur: 0, p0: null, speed: 0, agl: 0, fate: null,
    };
    if (type === 'ballistic') {
      th.p0 = { x: rng.range(72000, 82000), y: rng.range(30000, 35000), z: tg.z + rng.range(-16000, 9000) };
      th.dur = sim.pacing.ballisticFlight + rng.range(-1.5, 1.5);
      th.pos = { ...th.p0 };
    } else {
      const P = type === 'drone' ? sim.pacing.drones : sim.pacing.cruise;
      const x = type === 'drone' ? rng.range(P.spawnX[0], P.spawnX[1]) : P.spawnX + rng.range(-1500, 1500);
      const z = type === 'drone' ? rng.range(P.spawnZ[0], P.spawnZ[1]) : rng.range(-5000, 5000);
      th.speed = P.speed * rng.range(0.92, 1.08);
      th.agl = P.agl * rng.range(0.85, 1.15);
      th.pos = { x, y: groundAt(x, z) + th.agl, z };
    }
    list.push(th);
    sim.stats.launched[type]++;
    sim.bus.emit('threat:spawn', { t: sim.t, id: th.id, type, x: th.pos.x, y: th.pos.y, z: th.pos.z, target: tg.kind, salvo: th.salvo });
    return th;
  }

  function stepOne(th, dt) {
    const px = th.pos.x, py = th.pos.y, pz = th.pos.z;
    const tg = th.target;
    if (th.type === 'ballistic') {
      th.s = Math.min(1, th.s + dt / th.dur);
      const s = th.s;
      const g = s + 0.45 * s * (1 - s);           // horizontal progress: fast early, slower late
      const f = 1 - s * s;                          // altitude: stays high, then falls steeply
      th.pos.x = th.p0.x + (tg.x - th.p0.x) * g;
      th.pos.z = th.p0.z + (tg.z - th.p0.z) * g;
      th.pos.y = tg.y + (th.p0.y - tg.y) * f;
      th.heat = smoothstep(31000, 14000, th.pos.y) * (1 - smoothstep(2500, 600, th.pos.y) * 0.4);
    } else {
      const dx = tg.x - th.pos.x, dz = tg.z - th.pos.z, d = Math.hypot(dx, dz);
      const weave = th.type === 'drone' ? 0.14 : 0.05;
      const h = Math.atan2(dz, dx) + Math.sin(sim.t * 0.33 + th.phase) * weave * clamp(d / 4000, 0, 1);
      const step = Math.min(d, th.speed * dt);
      th.pos.x += Math.cos(h) * step;
      th.pos.z += Math.sin(h) * step;
      const gy = groundAt(th.pos.x, th.pos.z);
      const diveR = th.type === 'drone' ? 2400 : 1600;
      const want = d > diveR ? Math.max(gy + th.agl, groundAt(th.pos.x + Math.cos(h) * 600, th.pos.z + Math.sin(h) * 600) + th.agl * 0.8)
        : tg.y + (d / diveR) * th.agl;
      th.pos.y += (want - th.pos.y) * Math.min(1, dt * (d > diveR ? 0.9 : 2.5));
    }
    th.vel.x = (th.pos.x - px) / dt; th.vel.y = (th.pos.y - py) / dt; th.vel.z = (th.pos.z - pz) / dt;
    if (tg.kind === 'pass' && th.pos.z > 22000) { th.alive = false; th.fate = 'pass'; th.deadAt = sim.t; sim.onPass(th); return; }
    const ground = groundAt(th.pos.x, th.pos.z);
    const arrived = th.type === 'ballistic' ? th.s >= 1 : Math.hypot(tg.x - th.pos.x, tg.z - th.pos.z) < 25;
    if (arrived || th.pos.y <= ground + 0.5) impact(th);
  }

  function impact(th) {
    th.alive = false; th.fate = 'impact';
    const x = th.pos.x, z = th.pos.z, y = groundAt(x, z);
    let kind = 'open';
    if (inNevatim(x, z)) kind = 'nevatim';
    else if (inTown(x, z, 60)) kind = 'town';
    const dmg = THREAT[th.type].dmg;
    sim.stats.impacts[kind]++;
    if (kind === 'nevatim') sim.nevatim = Math.max(0, sim.nevatim - dmg);
    let building = null;
    if (kind === 'town') {
      sim.townHits++;
      let bd = 1e9;
      for (const b of sim.layout.buildings) { const d = Math.hypot(b.x - x, b.z - z); if (d < bd) { bd = d; building = b; } }
      if (building && bd < 80) building.damaged = true; else building = null;
    }
    sim.bus.emit('impact', { t: sim.t, id: th.id, type: th.type, x, y, z, kind, dmg: kind === 'nevatim' ? dmg : 0, building: building ? building.id : null });
    sim.onImpact(th, kind);
  }

  function timeToImpact(th) {
    if (th.type === 'ballistic') return (1 - th.s) * th.dur;
    return Math.hypot(th.target.x - th.pos.x, th.target.z - th.pos.z) / th.speed;
  }

  function step(dt) {
    for (const th of list) if (th.alive) stepOne(th, dt);
    // keep dead threats around for one second so visuals can finish their tails
    for (let i = list.length - 1; i >= 0; i--) if (!list[i].alive && sim.t - (list[i].deadAt ?? (list[i].deadAt = sim.t)) > 1.5) list.splice(i, 1);
  }

  return { list, spawn, step, timeToImpact };
}
