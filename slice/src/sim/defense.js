// Layered air defence: Iron Dome (drones, cruise), David's Sling (cruise, ballistic low in the
// atmosphere), Arrow 3 (ballistic, exo-atmospheric, off-map battery), coalition jets (player power).
// Ranges and speeds are compressed for the slice. Costs in $M.
import { GEO, groundAt } from '../world/geo.js';
import { clamp } from '../core/util.js';

export const BAT = {
  dome: { name: 'Iron Dome', cost: 40, shot: 0.1, range: 6500, minAlt: -500, maxAlt: 9000, hits: ['drone', 'cruise'], stock: 20, reload: 16, rof: 0.75, speed: 820, boost: 0.9, turn: 3.2, pk: { drone: 0.93, cruise: 0.86 }, kr: 28, life: 16 },
  sling: { name: "David's Sling", cost: 90, shot: 1, range: 16000, minAlt: 0, maxAlt: 16500, hits: ['cruise', 'ballistic'], stock: 12, reload: 22, rof: 0.85, speed: 1700, boost: 1.1, turn: 2.6, pk: { cruise: 0.9, ballistic: 0.84 }, kr: 70, life: 18 },
  arrow: { name: 'Arrow 3', cost: 150, shot: 3, range: 1e9, minAlt: 11000, maxAlt: 1e9, hits: ['ballistic'], stock: 16, reload: 20, rof: 0.65, speed: 4600, boost: 2.2, turn: 1.9, pk: { ballistic: 0.9 }, kr: 140, life: 30 },
  aam: { name: 'Coalition fighter', cost: 0, shot: 0, range: 6500, minAlt: -500, maxAlt: 9000, hits: ['drone', 'cruise'], stock: 4, reload: 0, rof: 1.4, speed: 950, boost: 0.3, turn: 4.2, pk: { drone: 0.92, cruise: 0.8 }, kr: 30, life: 12 },
};

export function createDefense(sim) {
  const rng = sim.rng;
  const batteries = [];
  const interceptors = [];
  const jets = [];
  let nextId = 1;

  function build(padId, type, free = false) {
    const pad = sim.layout.pads.find((p) => p.id === padId);
    if (!pad) return { ok: false, why: 'No such pad' };
    if (pad.battery) return { ok: false, why: `${pad.name} already has a battery` };
    if (!pad.allow.includes(type)) return { ok: false, why: `${BAT[type].name} can't deploy at ${pad.name}` };
    const T = BAT[type];
    if (!free) {
      if (sim.budget < T.cost) return { ok: false, why: `Not enough budget for ${T.name}` };
      sim.budget -= T.cost; sim.stats.spent += T.cost;
    }
    const b = mkBattery(type, pad.x, pad.z, pad);
    pad.battery = b.id;
    sim.bus.emit('battery:built', { t: sim.t, id: b.id, type, pad: pad.id, x: b.x, y: b.y, z: b.z, free });
    return { ok: true, battery: b };
  }
  function mkBattery(type, x, z, pad = null) {
    const T = BAT[type];
    const b = { id: nextId++, type, T, pad: pad ? pad.id : null, x, z, y: groundAt(x, z), stock: T.stock, reload: 0, cd: rng.range(0, 0.5), hold: false, shots: 0, kills: 0, yaw: -Math.PI / 2, lastFire: -99, offstage: !pad };
    batteries.push(b);
    return b;
  }

  // engagement filter by doctrine: "protect" ignores tracks falling on open ground
  function wants(th) {
    if (sim.doctrine === 'all') return th.target.kind !== 'pass';
    return th.target.kind === 'nevatim' || th.target.kind === 'town';
  }

  function chooseTarget(b) {
    const T = b.T;
    let best = null, bestScore = Infinity;
    for (const th of sim.threats) {
      if (!th.alive || th.engaged > 0 || !T.hits.includes(th.type) || !wants(th)) continue;
      if (th.pos.y < T.minAlt || th.pos.y > T.maxAlt) continue;
      const d = Math.hypot(th.pos.x - b.x, th.pos.z - b.z);
      if (d > T.range) continue;
      if (b.type === 'arrow' && sim.timeToImpact(th) < 10) continue;
      // Iron Dome waits until drones have crossed the Dead Sea (no shots over Jordan)
      if (b.type === 'dome' && th.pos.x > 11500) continue;
      const tti = sim.timeToImpact(th);
      const score = tti - (th.target.kind === 'town' ? 30 : 0);
      if (score < bestScore) { bestScore = score; best = th; }
    }
    return best;
  }

  function fire(src, th, T, kind) {
    const from = src.pos ? { ...src.pos } : { x: src.x + rng.range(-12, 12), y: src.y + 4, z: src.z + rng.range(-12, 12) };
    // launch direction: mostly up, leaning toward the target
    const dx = th.pos.x - from.x, dz = th.pos.z - from.z, dh = Math.hypot(dx, dz) || 1;
    const lean = kind === 'arrow' ? 0.35 : kind === 'aam' ? 1.0 : 0.45;
    let dir = src.vel ? norm(src.vel) : norm({ x: dx / dh * lean, y: 1, z: dz / dh * lean });
    const it = {
      id: nextId++, kind, T, pos: from, vel: { x: dir.x * T.speed * 0.15, y: dir.y * T.speed * 0.15, z: dir.z * T.speed * 0.15 },
      speed: T.speed * 0.15, age: 0, alive: true, th, battery: src.id || null, fate: null, launch: { ...from },
    };
    th.engaged++;
    interceptors.push(it);
    sim.stats.shots[kind] = (sim.stats.shots[kind] || 0) + 1;
    if (T.shot) { sim.budget = Math.max(0, sim.budget - T.shot); sim.stats.spent += T.shot; }
    sim.bus.emit('launch', { t: sim.t, id: it.id, kind, battery: src.id || null, x: from.x, y: from.y, z: from.z, dx: dir.x, dy: dir.y, dz: dir.z, threat: th.id, threatType: th.type });
    return it;
  }

  function stepBattery(b, dt) {
    if (b.reload > 0) { b.reload -= dt; if (b.reload <= 0) { b.stock = b.T.stock; sim.bus.emit('battery:reloaded', { t: sim.t, id: b.id, type: b.type }); } return; }
    b.cd -= dt;
    if (b.cd > 0 || b.hold) return;
    if (b.stock <= 0) { b.reload = b.T.reload; sim.bus.emit('battery:reloading', { t: sim.t, id: b.id, type: b.type, dur: b.T.reload }); return; }
    if (b.T.shot > sim.budget) { if (!b.broke) { b.broke = true; sim.msg(`Budget exhausted: ${b.T.name} cannot fire.`, 'alert'); } return; }
    const th = chooseTarget(b);
    if (!th) return;
    b.yaw = Math.atan2(th.pos.z - b.z, th.pos.x - b.x);
    fire(b, th, b.T, b.type);
    b.stock--; b.shots++; b.cd = b.T.rof * rng.range(0.85, 1.15); b.lastFire = sim.t;
    if (b.stock <= 0) { b.reload = b.T.reload; sim.bus.emit('battery:reloading', { t: sim.t, id: b.id, type: b.type, dur: b.T.reload }); }
  }

  function stepInterceptor(it, dt) {
    it.age += dt;
    const T = it.T, th = it.th;
    if (it.age > T.life) return expire(it, 'timeout');
    if (!th.alive) { if (!it.lostAt) it.lostAt = it.age; if (it.age - it.lostAt > 0.8) return expire(it, 'selfdestruct'); }
    // speed: boost phase accelerates, then cruise at max speed
    if (it.age < T.boost) it.speed = Math.min(T.speed, T.speed * (0.15 + 0.85 * it.age / T.boost));
    else it.speed = T.speed;
    let dir = norm(it.vel);
    if (th.alive && it.age > T.boost * 0.35) {
      const rx = th.pos.x - it.pos.x, ry = th.pos.y - it.pos.y, rz = th.pos.z - it.pos.z;
      const d = Math.hypot(rx, ry, rz) || 1;
      const closing = Math.max(150, it.speed - (th.vel.x * rx + th.vel.y * ry + th.vel.z * rz) / d);
      const tgo = d / closing;
      const aim = norm({ x: rx + th.vel.x * tgo, y: ry + th.vel.y * tgo, z: rz + th.vel.z * tgo });
      dir = turnToward(dir, aim, T.turn * dt * (it.age < T.boost ? 0.6 : 1));
    }
    const ox = it.pos.x, oy = it.pos.y, oz = it.pos.z;
    it.vel.x = dir.x * it.speed; it.vel.y = dir.y * it.speed; it.vel.z = dir.z * it.speed;
    it.pos.x += it.vel.x * dt; it.pos.y += it.vel.y * dt; it.pos.z += it.vel.z * dt;
    if (th.alive) {
      // closest approach during this step (relative motion is linear within a step)
      const r0x = ox - (th.pos.x - th.vel.x * dt), r0y = oy - (th.pos.y - th.vel.y * dt), r0z = oz - (th.pos.z - th.vel.z * dt);
      const drx = (it.vel.x - th.vel.x) * dt, dry = (it.vel.y - th.vel.y) * dt, drz = (it.vel.z - th.vel.z) * dt;
      const dd = drx * drx + dry * dry + drz * drz || 1;
      const k = clamp(-(r0x * drx + r0y * dry + r0z * drz) / dd, 0, 1);
      const mx = r0x + drx * k, my = r0y + dry * k, mz = r0z + drz * k;
      if (Math.hypot(mx, my, mz) < T.kr) {
        const at = { x: ox + it.vel.x * dt * k, y: oy + it.vel.y * dt * k, z: oz + it.vel.z * dt * k };
        it.pos = at;
        return resolve(it, th, at);
      }
    }
    if (it.pos.y < groundAt(it.pos.x, it.pos.z)) return expire(it, 'ground');
  }

  function resolve(it, th, at) {
    it.alive = false;
    th.engaged = Math.max(0, th.engaged - 1);
    const pk = it.T.pk[th.type] ?? 0.8;
    const kill = rng.next() < pk;
    const tti = sim.timeToImpact(th);
    if (kill) {
      th.alive = false; th.fate = 'killed'; th.deadAt = sim.t;
      sim.stats.killed[th.type]++;
      sim.stats.by[it.kind] = (sim.stats.by[it.kind] || 0) + 1;
      const b = batteries.find((q) => q.id === it.battery); if (b) b.kills++;
      it.fate = 'kill';
      sim.onKill(th);
    } else { sim.stats.missed++; it.fate = 'miss'; }
    sim.bus.emit('intercept', {
      t: sim.t, id: it.id, kind: it.kind, threat: th.id, threatType: th.type, kill, x: at.x, y: at.y, z: at.z,
      vx: th.vel.x, vy: th.vel.y, vz: th.vel.z, target: th.target.kind, tti, big: th.type === 'ballistic',
    });
  }
  function expire(it, why) {
    it.alive = false; it.fate = why;
    if (it.th.alive) it.th.engaged = Math.max(0, it.th.engaged - 1);
    sim.bus.emit('interceptor:end', { t: sim.t, id: it.id, kind: it.kind, why, x: it.pos.x, y: it.pos.y, z: it.pos.z });
  }

  // ---------------------------------------------------------------- coalition air patrol
  function airPatrol(x, z) {
    const P = sim.pacing.airPatrol;
    if (sim.t < P.readyAt) return { ok: false, why: 'Coalition jets are not on station yet' };
    if (sim.patrolCd > 0) return { ok: false, why: `Air patrol ready in ${Math.ceil(sim.patrolCd)} s` };
    sim.patrolCd = P.cooldown;
    for (let i = 0; i < 2; i++) {
      const j = { id: nextId++, pos: { x: -14000, y: 2600 + i * 120, z: z + (i ? 700 : -700) }, vel: { x: 260, y: 0, z: 0 }, cx: x, cz: z, age: 0, ph: i * Math.PI, cd: 1 + i * 0.7, ammo: 4, alive: true, leaving: false };
      jets.push(j);
    }
    sim.bus.emit('airpatrol', { t: sim.t, x, z });
    sim.msg('Coalition air patrol inbound: two fighters for 30 seconds.', 'good');
    return { ok: true };
  }
  function stepJet(j, dt) {
    j.age += dt;
    const P = sim.pacing.airPatrol;
    const alt = 2600;
    let want;
    const d = Math.hypot(j.pos.x - j.cx, j.pos.z - j.cz);
    if (j.age > P.duration + 6) { j.leaving = true; want = { x: j.pos.x + 4000, y: alt + 1200, z: j.pos.z - 6000 }; }
    else if (d > 3200 && !j.arrived) want = { x: j.cx, y: alt, z: j.cz };
    else { j.arrived = true; const a = j.age * 0.09 + j.ph; want = { x: j.cx + Math.cos(a) * 2800, y: alt, z: j.cz + Math.sin(a) * 2800 }; }
    const dir = norm({ x: want.x - j.pos.x, y: (want.y - j.pos.y) * 0.3, z: want.z - j.pos.z });
    const cur = norm(j.vel);
    const nd = turnToward(cur, dir, 0.55 * dt);
    const sp = 260;
    j.vel = { x: nd.x * sp, y: nd.y * sp, z: nd.z * sp };
    j.pos.x += j.vel.x * dt; j.pos.y += j.vel.y * dt; j.pos.z += j.vel.z * dt;
    j.cd -= dt;
    if (j.arrived && !j.leaving && j.cd <= 0 && j.ammo > 0) {
      let best = null, bd = BAT.aam.range;
      for (const th of sim.threats) {
        if (!th.alive || th.engaged > 0 || !BAT.aam.hits.includes(th.type)) continue;
        const dd = Math.hypot(th.pos.x - j.pos.x, th.pos.y - j.pos.y, th.pos.z - j.pos.z);
        if (dd < bd) { bd = dd; best = th; }
      }
      if (best) { fire({ pos: { ...j.pos }, vel: { ...j.vel }, id: null }, best, BAT.aam, 'aam'); j.cd = BAT.aam.rof; j.ammo--; }
    }
    if (j.age > P.duration + 30) j.alive = false;
  }

  function step(dt) {
    for (const b of batteries) stepBattery(b, dt);
    for (const it of interceptors) if (it.alive) stepInterceptor(it, dt);
    for (const j of jets) if (j.alive) stepJet(j, dt);
    for (let i = interceptors.length - 1; i >= 0; i--) if (!interceptors[i].alive) interceptors.splice(i, 1);
    for (let i = jets.length - 1; i >= 0; i--) if (!jets[i].alive) jets.splice(i, 1);
  }

  // pre-deployed: pads marked `pre`, plus the off-map Arrow 3 battery
  for (const p of sim.layout.pads) if (p.pre) build(p.id, p.pre, true);
  mkBattery('arrow', GEO.arrowSite.x, GEO.arrowSite.z, null);

  return { batteries, interceptors, jets, build, airPatrol, step, fire };
}

function norm(v) { const l = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x / l, y: v.y / l, z: v.z / l }; }
function turnToward(a, b, maxAng) {
  const dot = clamp(a.x * b.x + a.y * b.y + a.z * b.z, -1, 1);
  const ang = Math.acos(dot);
  if (ang <= maxAng || ang < 1e-5) return b;
  const t = maxAng / ang;
  return norm({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
}
