// Civilians outdoors in Arad and the public shelters they run to when the siren sounds.
// Struct-of-arrays so visuals can instance thousands cheaply. HUD reads `sim.groupInfo()`.
import { findPath } from '../world/layout.js';
import { groundAt } from '../world/geo.js';
import { clamp } from '../core/util.js';

export const CIV = { IDLE: 0, REACT: 1, MOVING: 2, WAITING: 3, QUEUE: 4, SHELTERED: 5, EMERGING: 6, AFTER: 7 };
export const KIND = { adult: 0, teen: 1, elder: 2, child: 3 };
const SPEEDS = [[1.35, 3.2], [1.45, 3.7], [1.0, 2.05], [1.15, 2.8]]; // [walk, run] per kind
const DOOR_RATE = 2.6;  // people per second through a shelter door
const OPEN_TIME = 5;    // seconds for a municipal crew to open a locked shelter

export function createCivilians(sim) {
  const L = sim.layout, rng = sim.rng;
  const groups = L.groups.map((g) => ({ ...g, members: [], shelter: g.usual, assignedBy: 'usual' }));
  const shelters = L.shelters.map((s) => ({ ...s, occ: 0, queue: [], opening: 0, doorT: 0, sinceOpen: 0 }));
  const shIdx = new Map(shelters.map((s, i) => [s.id, i]));
  const total = groups.reduce((a, g) => a + g.n, 0);
  const N = total;
  const A = {
    n: N,
    x: new Float32Array(N), y: new Float32Array(N), z: new Float32Array(N),
    heading: new Float32Array(N), speed: new Float32Array(N), walk: new Float32Array(N), run: new Float32Array(N),
    kind: new Uint8Array(N), group: new Uint8Array(N), state: new Uint8Array(N), react: new Float32Array(N),
    lane: new Float32Array(N), wait: new Float32Array(N), ax: new Float32Array(N), az: new Float32Array(N),
    shelter: new Int16Array(N), exposed: new Uint8Array(N), phase: new Float32Array(N), look: new Uint8Array(N),
    path: new Array(N), pi: new Uint16Array(N),
  };
  let k = 0;
  groups.forEach((g, gi) => {
    for (let m = 0; m < g.n; m++, k++) {
      const r = rng.next();
      let kind = 0, acc = 0;
      for (const [name, p] of Object.entries(g.mix)) { acc += p; if (r < acc) { kind = KIND[name]; break; } }
      const a = rng.range(0, Math.PI * 2), rr = Math.sqrt(rng.next()) * g.spread;
      A.x[k] = g.x + Math.cos(a) * rr; A.z[k] = g.z + Math.sin(a) * rr; A.y[k] = groundAt(A.x[k], A.z[k]);
      A.ax[k] = A.x[k]; A.az[k] = A.z[k];
      A.kind[k] = kind; A.group[k] = gi; A.state[k] = CIV.IDLE;
      A.walk[k] = SPEEDS[kind][0] * rng.range(0.9, 1.1); A.run[k] = SPEEDS[kind][1] * rng.range(0.88, 1.12);
      A.lane[k] = rng.range(-1, 1); A.wait[k] = rng.range(0, 6); A.phase[k] = rng.range(0, 100);
      A.heading[k] = g.id === 'G1' ? 0 : rng.range(-Math.PI, Math.PI); // the lookout crowd faces east, over the Dead Sea
      A.look[k] = g.id === 'G1' ? 1 : 0;
      A.shelter[k] = -1;
      g.members.push(k);
    }
  });

  // ---------------------------------------------------------------- paths
  function nearestNodeTo(x, z) {
    let best = 0, bd = Infinity;
    for (const n of L.nodes) {
      if (!n.adj.some((id) => L.edges[id].on)) continue;
      const d = (n.x - x) ** 2 + (n.z - z) ** 2;
      if (d < bd) { bd = d; best = n.id; }
    }
    return best;
  }
  const pathCache = new Map();
  function nodePath(from, to) {
    const key = from + '>' + to;
    if (!pathCache.has(key)) pathCache.set(key, findPath(L, from, to) || [from]);
    return pathCache.get(key);
  }
  // straight line through open ground if no building is in the way (people cut across parks)
  function clearLine(x0, z0, x1, z1) {
    for (const b of L.buildings) {
      const hw = b.w / 2 + 1.5, hd = b.d / 2 + 1.5;
      // slab test of segment vs AABB
      let t0 = 0, t1 = 1;
      const dx = x1 - x0, dz = z1 - z0;
      const ax = [[dx, x0, b.x - hw, b.x + hw], [dz, z0, b.z - hd, b.z + hd]];
      let hit = true;
      for (const [d, o, lo, hi] of ax) {
        if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) { hit = false; break; } continue; }
        let a = (lo - o) / d, c = (hi - o) / d; if (a > c) [a, c] = [c, a];
        t0 = Math.max(t0, a); t1 = Math.min(t1, c); if (t0 > t1) { hit = false; break; }
      }
      if (hit) return false;
    }
    return true;
  }
  function makePath(i, si) {
    const s = shelters[si];
    // deterministic per-person jitter: makePath is also called by read-only queries
    // (groupInfo ETA estimates from the HUD), so it must not consume the sim RNG
    const hj = Math.sin((i + 1) * 12.9898 + (si + 1) * 78.233) * 43758.5453;
    const dj = (hj - Math.floor(hj)) * 3.2 - 1.6;
    const door = { x: s.door.x + dj, z: s.door.z + dj };
    if (Math.hypot(door.x - A.x[i], door.z - A.z[i]) < 140 && clearLine(A.x[i], A.z[i], door.x, door.z)) return [{ x: A.x[i], z: A.z[i] }, door];
    const start = nearestNodeTo(A.x[i], A.z[i]);
    const ids = nodePath(start, s.node);
    const pts = [{ x: A.x[i], z: A.z[i] }];
    const off = A.lane[i] * 3.5 + Math.sign(A.lane[i] || 1) * 5.5; // keep to the sidewalks
    for (let q = 0; q < ids.length; q++) {
      const n = L.nodes[ids[q]];
      const prev = L.nodes[ids[Math.max(0, q - 1)]], next = L.nodes[ids[Math.min(ids.length - 1, q + 1)]];
      let tx = next.x - prev.x, tz = next.z - prev.z; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      pts.push({ x: n.x - tz * off, z: n.z + tx * off });
    }
    pts.push(door);
    // drop the first node if it doubles back past the start
    if (pts.length > 2) {
      const a = pts[0], b = pts[1], c = pts[2];
      if ((b.x - a.x) * (c.x - b.x) + (b.z - a.z) * (c.z - b.z) < 0) pts.splice(1, 1);
    }
    return pts;
  }
  function buildPath(i, si) { A.path[i] = makePath(i, si); A.pi[i] = 1; A.shelter[i] = si; }
  function pathLen(pts) { let d = 0; for (let q = 1; q < pts.length; q++) d += Math.hypot(pts[q].x - pts[q - 1].x, pts[q].z - pts[q - 1].z); return d; }
  function remaining(i) {
    const p = A.path[i]; if (!p) return 0;
    let d = 0, px = A.x[i], pz = A.z[i];
    for (let q = A.pi[i]; q < p.length; q++) { d += Math.hypot(p[q].x - px, p[q].z - pz); px = p[q].x; pz = p[q].z; }
    return d;
  }

  // ---------------------------------------------------------------- commands
  function route(groupId, shelterId, by = 'player') {
    const g = groups.find((q) => q.id === groupId), si = shIdx.get(shelterId);
    if (!g || si == null) return { ok: false, why: 'Unknown group or shelter' };
    g.shelter = shelterId; g.assignedBy = by;
    for (const i of g.members) {
      if (A.state[i] === CIV.SHELTERED || A.state[i] === CIV.EMERGING || A.state[i] === CIV.AFTER) continue;
      if (A.state[i] === CIV.QUEUE || A.state[i] === CIV.WAITING) leaveQueue(i);
      if (A.state[i] === CIV.REACT) buildPath(i, si);
      else if (A.state[i] === CIV.MOVING || A.state[i] === CIV.WAITING || A.state[i] === CIV.QUEUE) { buildPath(i, si); A.state[i] = CIV.MOVING; }
    }
    sim.bus.emit('civ:route', { t: sim.t, group: groupId, shelter: shelterId, by });
    return { ok: true };
  }
  function unlock(shelterId) {
    const s = shelters[shIdx.get(shelterId)];
    if (!s) return { ok: false, why: 'Unknown shelter' };
    if (!s.locked) return { ok: false, why: `${s.name} is already open` };
    if (s.opening > 0) return { ok: false, why: `${s.name} is being opened` };
    s.opening = OPEN_TIME;
    sim.bus.emit('shelter:opening', { t: sim.t, id: s.id, dur: OPEN_TIME });
    sim.msg(`Municipal crew opening the ${s.name}: ${OPEN_TIME} s.`, 'info');
    return { ok: true };
  }
  function leaveQueue(i) {
    const si = A.shelter[i]; if (si < 0) return;
    const q = shelters[si].queue, at = q.indexOf(i);
    if (at >= 0) q.splice(at, 1);
  }

  // ---------------------------------------------------------------- alert / all-clear
  function alert() {
    for (const g of groups) {
      const si = shIdx.get(g.shelter);
      const reactLo = g.id === 'G1' ? 2.5 : 0.4, reactHi = g.id === 'G1' ? 6 : 2.6;
      for (const i of g.members) {
        A.state[i] = CIV.REACT; A.react[i] = rng.range(reactLo, reactHi);
        buildPath(i, si);
      }
    }
  }
  function allClear() {
    for (const s of shelters) s.emergeT = rng.range(0.5, 2.5);
  }

  // ---------------------------------------------------------------- per-step
  function step(dt) {
    const t = sim.t;
    for (const s of shelters) {
      if (s.opening > 0) {
        s.opening -= dt;
        if (s.opening <= 0) {
          s.opening = 0; s.locked = false;
          sim.bus.emit('shelter:open', { t, id: s.id });
          sim.msg(`${s.name} is open.`, 'good');
          // people waiting outside go in
          for (let i = 0; i < N; i++) if (A.state[i] === CIV.WAITING && A.shelter[i] === shIdx.get(s.id)) { A.state[i] = CIV.QUEUE; s.queue.push(i); }
        }
      }
      // door throughput
      s.doorT -= dt;
      if (s.queue.length && s.doorT <= 0 && !s.locked) {
        const i = s.queue.shift();
        if (s.occ < s.cap) {
          A.state[i] = CIV.SHELTERED; s.occ++; s.doorT = 1 / DOOR_RATE;
          sim.bus.emit('civ:sheltered', { t, i, shelter: s.id, group: groups[A.group[i]].id });
        } else overflow(i, s);
      }
      // after the all-clear people come out in a trickle
      if (sim.phase === 'aftermath' && s.occ > 0) {
        s.emergeT -= dt;
        if (s.emergeT <= 0) {
          s.emergeT = 1 / 2.2;
          const si = shIdx.get(s.id);
          for (let i = 0; i < N; i++) if (A.state[i] === CIV.SHELTERED && A.shelter[i] === si) {
            A.state[i] = CIV.EMERGING; s.occ--;
            A.x[i] = s.door.x; A.z[i] = s.door.z;
            const a = rng.range(-Math.PI, Math.PI), r = rng.range(10, 34);
            A.ax[i] = s.door.x + Math.cos(a) * r; A.az[i] = s.door.z + Math.sin(a) * r;
            A.wait[i] = 0;
            break;
          }
        }
      }
    }
    for (let i = 0; i < N; i++) stepAgent(i, dt, t);
  }

  function overflow(i, full) {
    // the shelter is full: go to the nearest open shelter with room
    let best = -1, bd = Infinity;
    shelters.forEach((s, si) => {
      if (s === full || s.locked || s.occ + s.queue.length >= s.cap) return;
      const d = Math.hypot(s.door.x - A.x[i], s.door.z - A.z[i]);
      if (d < bd) { bd = d; best = si; }
    });
    if (best < 0) { A.state[i] = CIV.WAITING; return; }
    buildPath(i, best); A.state[i] = CIV.MOVING;
    if (!full.overflowed) { full.overflowed = true; sim.msg(`${full.name} is full. People are being sent on to the next shelter.`, 'alert'); sim.bus.emit('shelter:full', { t: sim.t, id: full.id }); }
  }

  function moveToward(i, tx, tz, sp, dt) {
    const dx = tx - A.x[i], dz = tz - A.z[i], d = Math.hypot(dx, dz);
    if (d < 1e-3) return 0;
    const s = Math.min(d, sp * dt);
    A.x[i] += (dx / d) * s; A.z[i] += (dz / d) * s;
    const h = Math.atan2(dz, dx);
    let dh = h - A.heading[i]; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    A.heading[i] += dh * Math.min(1, dt * 8);
    return d - s;
  }

  function stepAgent(i, dt, t) {
    const st = A.state[i];
    if (st === CIV.SHELTERED) { A.speed[i] = 0; return; }
    if (st === CIV.IDLE || st === CIV.AFTER || st === CIV.EMERGING) {
      // milling about an anchor point
      if (A.look[i] && st === CIV.IDLE) { A.speed[i] = 0; return; }
      A.wait[i] -= dt;
      const d = Math.hypot(A.ax[i] - A.x[i], A.az[i] - A.z[i]);
      if (d < 0.6) {
        A.speed[i] = 0;
        if (st === CIV.EMERGING) A.state[i] = CIV.AFTER;
        if (A.wait[i] <= 0) {
          const g = groups[A.group[i]];
          const cx = st === CIV.IDLE ? g.x : A.x[i], cz = st === CIV.IDLE ? g.z : A.z[i];
          const a = rng.range(0, Math.PI * 2), r = Math.sqrt(rng.next()) * (st === CIV.IDLE ? g.spread : 8);
          A.ax[i] = cx + Math.cos(a) * r; A.az[i] = cz + Math.sin(a) * r; A.wait[i] = rng.range(3, 12);
        }
      } else if (A.wait[i] <= 0 || st === CIV.EMERGING) {
        A.speed[i] = A.walk[i] * (st === CIV.EMERGING ? 0.8 : 0.55);
        moveToward(i, A.ax[i], A.az[i], A.speed[i], dt);
      } else A.speed[i] = 0;
    } else if (st === CIV.REACT) {
      A.react[i] -= dt; A.speed[i] = 0;
      if (A.react[i] <= 0) A.state[i] = CIV.MOVING;
    } else if (st === CIV.MOVING) {
      const p = A.path[i];
      const sp = A.run[i] * (0.94 + 0.06 * Math.sin(t * 1.7 + A.phase[i]));
      A.speed[i] = sp;
      let budget = sp * dt;
      while (budget > 0 && A.pi[i] < p.length) {
        const q = p[A.pi[i]], dx = q.x - A.x[i], dz = q.z - A.z[i], d = Math.hypot(dx, dz);
        if (d <= budget) { A.x[i] = q.x; A.z[i] = q.z; budget -= d; A.pi[i]++; }
        else { moveToward(i, q.x, q.z, budget / dt, dt); budget = 0; }
      }
      if (A.pi[i] >= p.length) arriveDoor(i);
    } else if (st === CIV.WAITING || st === CIV.QUEUE) {
      // bunch up near the door, facing it
      const s = shelters[A.shelter[i]];
      const qi = st === CIV.QUEUE ? s.queue.indexOf(i) : 6 + (i % 14);
      const ring = 2.2 + Math.sqrt(Math.max(0, qi)) * 1.5, a = s.rot + Math.PI + ((i * 2.399) % 1.6) - 0.8;
      const tx = s.door.x + Math.sin(a) * ring, tz = s.door.z + Math.cos(a) * ring;
      A.speed[i] = moveToward(i, tx, tz, A.walk[i], dt) > 0.3 ? A.walk[i] : 0;
      const h = Math.atan2(s.door.z - A.z[i], s.door.x - A.x[i]);
      if (A.speed[i] === 0) { let dh = h - A.heading[i]; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); A.heading[i] += dh * Math.min(1, dt * 4); }
    }
    A.y[i] = groundAt(A.x[i], A.z[i]);
  }

  function arriveDoor(i) {
    const s = shelters[A.shelter[i]];
    if (s.locked) { A.state[i] = CIV.WAITING; if (!s.waitWarned) { s.waitWarned = true; sim.msg(`People are waiting outside the locked ${s.name}.`, 'alert'); sim.bus.emit('shelter:blocked', { t: sim.t, id: s.id }); } return; }
    if (s.occ + s.queue.length >= s.cap) return overflow(i, s);
    A.state[i] = CIV.QUEUE; s.queue.push(i);
  }

  // ---------------------------------------------------------------- HUD info
  function groupInfo() {
    const left = sim.countdownLeft();
    return groups.map((g) => {
      let inside = 0, eta = 0, waiting = 0;
      const s = shelters[shIdx.get(g.shelter)];
      for (const i of g.members) {
        const st = A.state[i];
        if (st === CIV.SHELTERED || st === CIV.EMERGING || st === CIV.AFTER) { inside++; continue; }
        if (st === CIV.WAITING) waiting++;
        const sh = A.shelter[i] >= 0 ? shelters[A.shelter[i]] : s;
        let e = st === CIV.IDLE ? estimateFrom(i, sh) : (st === CIV.REACT ? A.react[i] : 0) + remaining(i) / A.run[i];
        if (sh.locked) e += sh.opening > 0 ? Math.max(0, sh.opening - e) : 999;
        const qpos = st === CIV.QUEUE ? sh.queue.indexOf(i) + 1 : sh.queue.length + 1;
        e += qpos / DOOR_RATE * 0.5;
        eta = Math.max(eta, e);
      }
      const done = inside === g.n;
      let status = 'idle';
      if (done) status = sim.phase === 'aftermath' || sim.phase === 'debrief' ? 'out' : 'sheltered';
      else if (s.locked && s.opening <= 0) status = 'blocked';
      else if (left != null) status = eta <= left - 6 ? 'ok' : eta <= left ? 'tight' : 'late';
      else if (sim.phase === 'prep') status = eta >= 999 ? 'blocked' : eta > sim.pacing.countdown - 6 ? 'late' : 'ok';
      const cx = g.members.reduce((a, i) => a + A.x[i], 0) / g.n, cz = g.members.reduce((a, i) => a + A.z[i], 0) / g.n;
      return { id: g.id, name: g.name, n: g.n, inside, waiting, shelter: g.shelter, assignedBy: g.assignedBy, eta: done ? 0 : Math.min(eta, 999), status, x: cx, z: cz };
    });
  }
  const estCache = new Map();
  function estimateFrom(i, s) {
    // planning estimate before the siren: reaction + run time along the route this person would take
    const key = i + ':' + s.id;
    if (!estCache.has(key)) estCache.set(key, 1.5 + pathLen(makePath(i, shIdx.get(s.id))) / A.run[i]);
    return estCache.get(key);
  }
  function counts() {
    let inside = 0, outside = 0;
    for (let i = 0; i < N; i++) { if (A.state[i] === CIV.SHELTERED) inside++; else outside++; }
    return { inside, outside, total: N };
  }
  function markExposed() {
    let n = 0;
    for (let i = 0; i < N; i++) if (A.state[i] !== CIV.SHELTERED) { A.exposed[i] = 1; n++; }
    return n;
  }

  return { A, groups, shelters, total: N, step, route, unlock, alert, allClear, groupInfo, counts, markExposed, shIdx };
}
