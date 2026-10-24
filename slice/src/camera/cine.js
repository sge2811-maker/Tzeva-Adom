// Cinematic auto-director (C key). Scores subjects every frame (an interceptor closing on a
// ballistic missile, re-entering warheads, fresh intercepts and their falling debris, launches,
// drone kills), holds a shot 3.5–8 s, and frames the subject from the far side of Arad so the
// skyline sits in the lower third with the subject in the upper third. Cuts between subjects,
// tracks smoothly within a shot, and lingers on the spot where a subject died so the
// explosion and debris play out. Deterministic: uses only sim state, bus events and dt.
import { groundAt } from '../world/geo.js';

const DEG = Math.PI / 180;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function createCine(ctx, floorAt) {
  const { sim, bus } = ctx;
  const recent = []; // { t, x, y, z, kind } sector events (intercepts, launches near town)
  bus.on('intercept', (e) => { if (!e.offmap && e.kill) recent.push({ t: e.t, x: e.x, y: e.y, z: e.z, kind: 'kill', big: e.big }); });
  bus.on('launch', (e) => { if (Math.hypot(e.x, e.z) < 3000 && (e.kind === 'sling' || e.kind === 'dome')) recent.push({ t: e.t, x: e.x, y: e.y + 60, z: e.z, kind: 'launch' }); });
  const S = { t: 0, shotT: 0, subj: null, key: null, last: { x: 0, y: 300, z: 0 }, lostT: 0, cut: true,
    pos: { x: -900, y: 80, z: 300 }, look: { x: 0, y: 300, z: 3000 }, fov: 50, side: 1, siren: 0 };

  function candidates() {
    const out = [];
    for (const it of sim.interceptors) {
      if (!it.alive || !it.th || !it.th.alive) continue;
      const th = it.th, d = Math.hypot(th.pos.x - it.pos.x, th.pos.y - it.pos.y, th.pos.z - it.pos.z);
      const tgo = d / Math.max(300, it.speed);
      if (tgo > 9) continue;
      const near = Math.hypot(th.pos.x, th.pos.z) < 9000 ? 3 : 0;
      out.push({ key: 'i' + it.id, score: (th.type === 'ballistic' ? 10 : 5) + near + (it.kind === 'sling' ? 2 : 0) - tgo * 0.3, get: () => (it.alive ? mid(it.pos, th.pos) : null) });
    }
    for (const th of sim.threats) if (th.alive && th.type === 'ballistic' && th.heat > 0.35 && th.pos.y < 22000) out.push({ key: 't' + th.id, score: 6 + th.heat * 2, get: () => (th.alive ? th.pos : null) });
    for (let i = recent.length - 1; i >= 0; i--) {
      const r = recent[i], age = sim.t - r.t;
      if (age > 5) { recent.splice(i, 1); continue; }
      out.push({ key: 'r' + r.t.toFixed(2), score: (r.kind === 'kill' ? (r.big ? 9 : 5) : 7) - age, get: () => r, fixed: true });
    }
    for (const th of sim.threats) if (th.alive && th.type !== 'ballistic' && th.engaged) out.push({ key: 't' + th.id, score: 3, get: () => (th.alive ? th.pos : null) });
    return out;
  }
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });

  // camera placement: on the far side of the town from the subject, far enough that the subject
  // sits at most ~52 deg above the horizon; over the Dead Sea, from the escarpment rim instead.
  function place(s) {
    const hx = s.x, hz = s.z, hd = Math.hypot(hx, hz);
    let px, pz, py;
    if (hx > 9000 && s.y > 8000) { px = 1500 + S.side * 300; pz = clamp(hz * 0.12, -700, 700) + S.side * 250; py = groundAt(px, pz) + 70; }
    else {
      let dx = -hx, dz = -hz;
      if (hd < 400) { dx = -1; dz = 0.25 * S.side; }
      const L = Math.hypot(dx, dz); dx /= L; dz /= L;
      // swing a little off the axis so the subject is not dead behind the town centre
      const sw = 0.28 * S.side, cx = dx * Math.cos(sw) - dz * Math.sin(sw), cz = dx * Math.sin(sw) + dz * Math.cos(sw);
      const hgt = 45 + 30 * ((S.t * 0.37) % 1);
      let R = Math.min(1900, 750 + hd * 0.1);
      R = Math.max(R, (s.y - hgt) / Math.tan(52 * DEG) - hd);
      R = Math.min(R, 7000);
      px = cx * R; pz = cz * R; py = groundAt(px, pz) + hgt;
    }
    return { x: px, y: Math.max(py, floorAt(px, pz) + 10), z: pz };
  }

  function frame(s, dt, snap) {
    // look: keep the subject in the upper third and the horizon (skyline) at the bottom of frame
    const dx = s.x - S.pos.x, dy = s.y - S.pos.y, dz = s.z - S.pos.z, hd = Math.hypot(dx, dz) || 1;
    const es = Math.atan2(dy, hd);
    const fov = clamp((es / DEG + 5) / 0.74, 42, 74);
    const ec = es - 0.24 * fov * DEG;
    const want = { x: S.pos.x + dx / hd * 1000, y: S.pos.y + Math.tan(ec) * 1000, z: S.pos.z + dz / hd * 1000 };
    const k = snap ? 1 : 1 - Math.exp(-dt * 4.5);
    S.look.x += (want.x - S.look.x) * k; S.look.y += (want.y - S.look.y) * k; S.look.z += (want.z - S.look.z) * k;
    S.fov += (fov - S.fov) * (snap ? 1 : 1 - Math.exp(-dt * 2.5));
  }

  return {
    state: S,
    enter() { S.t = 0; S.subj = null; S.key = null; S.cut = true; },
    siren() { S.siren = 4; S.key = 'siren'; S.subj = { get: () => ({ x: 120, y: 150, z: 0 }), fixed: true }; S.shotT = 0; S.cut = true; S.pos = { x: -1300, y: groundAt(-1300, 600) + 60, z: 600 }; },
    update(dt, camera) {
      S.t += dt; S.shotT += dt;
      if (S.siren > 0) S.siren -= dt;
      const cur = S.subj && S.subj.get();
      const lost = !cur && S.subj;
      if (cur) S.last = { x: cur.x, y: cur.y, z: cur.z };
      if (lost) S.lostT += dt; else S.lostT = 0;
      const minHold = S.siren > 0 ? 4 : 3.5;
      if (!S.subj || S.lostT > 2.2 || (S.shotT > minHold && !S.siren && S.shotT > (lost ? 0 : 8)) || (S.shotT > minHold && !cur)) {
        const c = candidates().filter((q) => q.key !== S.key).sort((a, b) => b.score - a.score)[0];
        if (c && (!S.subj || S.shotT > minHold || S.lostT > 2.2)) {
          const p = c.get();
          if (p) {
            S.subj = c; S.key = c.key; S.shotT = 0; S.lostT = 0; S.side = -S.side; S.last = { x: p.x, y: p.y, z: p.z };
            const np = place(p);
            S.cut = Math.hypot(np.x - S.pos.x, np.z - S.pos.z) > 250 || S.t < 0.05;
            S.pos = S.cut ? np : S.pos; S.goal = np;
          }
        } else if (!S.subj) {
          S.subj = { get: () => ({ x: 600, y: 2600, z: 0 }), fixed: true }; S.key = 'establish'; S.shotT = 0; S.cut = true; S.pos = { x: -1700, y: groundAt(-1700, 500) + 90, z: 500 };
        }
      }
      const s = S.last;
      if (S.goal && !S.cut) {
        const k = 1 - Math.exp(-dt * 1.2);
        S.pos.x += (S.goal.x - S.pos.x) * k; S.pos.y += (S.goal.y - S.pos.y) * k; S.pos.z += (S.goal.z - S.pos.z) * k;
      }
      // slow lateral dolly for parallax
      const ox = -(s.z - S.pos.z), oz = s.x - S.pos.x, ol = Math.hypot(ox, oz) || 1;
      S.pos.x += ox / ol * 9 * dt * S.side; S.pos.z += oz / ol * 9 * dt * S.side;
      S.pos.y = Math.max(S.pos.y, floorAt(S.pos.x, S.pos.z) + 8);
      frame(s, dt, S.cut);
      S.cut = false;
      camera.position.set(S.pos.x, S.pos.y, S.pos.z);
      camera.lookAt(S.look.x, S.look.y, S.look.z);
      return S.fov;
    },
  };
}
