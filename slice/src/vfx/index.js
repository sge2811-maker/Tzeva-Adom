// VFX stream: threat and interceptor bodies, motor/re-entry glows, ribbon trails, launches,
// intercept explosions (star flash, noise fireball, shock ring, sparks, lingering lit smoke),
// burning debris that breaks up and lands as small fires, ground impacts (flash, dust ring,
// fireball, fire-lit smoke column, embers, scorch decal) and distant allied kills.
// Smoke is shaded as albedo x light: moonlight + a VFX light set of up to 8 dynamic point lights
// (flashes, fires, town glow) chosen each frame. Requests camera shake via bus 'shake', terrain
// light via ctx.lights.flash and the screen flash via ctx.fx.flash.
import * as THREE from 'three';
import { Pool, T_GLOW, T_FIREBALL, T_STAR, T_RING, T_SMOKE, T_DUST } from './particles.js';
import { TrailSet } from './trails.js';
import { createShared, NL, HAS_ATM } from './shaderlib.js';
import { createScorch } from './decals.js';
import { makeRng } from '../core/rng.js';
import { groundAt } from '../world/geo.js';

const WIND = 4; // m/s toward +x (a light westerly)
const MOON = new THREE.Vector3(-0.83, 0.26, 0.18).normalize();
const KT = 100000, KI = 200000, KD = 300000; // trail key spaces: threats, interceptors, debris

// trail styles. smoke col is albedo (lit in the shader); hot col is HDR emission.
const ST = {
  dome: {
    smoke: { life: 11, w0: 8, w1: 46, col: [0.85, 0.85, 0.86], alpha: 0.9, minSeg: 45, turb: 2.4, rise: 0.8, warm: 1.6, noiseLen: 34, boost: 0.9, headFade: 0.12, fadePow: 1.6 },
    hot: { life: 0.32, w0: 4.5, w1: 1.2, col: [12, 8.5, 5], alpha: 1, minSeg: 10 }, head: 7, body: 1.3,
  },
  sling: {
    smoke: { life: 14, w0: 18, w1: 90, col: [0.88, 0.88, 0.9], alpha: 0.95, altGrow: 3000, minSeg: 80, turb: 3, rise: 0.8, warm: 1.8, noiseLen: 55, boost: 1.2, headFade: 0.1, fadePow: 1.5 },
    hot: { life: 0.3, w0: 7, w1: 1.6, col: [13, 9.5, 6], alpha: 1, minSeg: 18 }, head: 10, body: 2,
  },
  arrow: {
    smoke: { life: 18, w0: 22, w1: 130, col: [0.95, 0.95, 0.97], alpha: 1.0, altGrow: 4000, minSeg: 220, turb: 4, rise: 0.5, warm: 1.6, noiseLen: 110, boost: 2.2, headFade: 0.1, fadePow: 1.4 },
    hot: { life: 0.45, w0: 11, w1: 2, col: [14, 11, 8], alpha: 1, minSeg: 50 }, head: 14, body: 3,
  },
  aam: {
    smoke: { life: 5, w0: 2, w1: 12, col: [0.9, 0.9, 0.95], alpha: 0.5, minSeg: 40, turb: 1.5, rise: 0.3, warm: 0.4, noiseLen: 20, headFade: 0.08 },
    hot: { life: 0.22, w0: 3, w1: 0.8, col: [8, 9, 12], alpha: 1, minSeg: 12 }, head: 5, body: 1,
  },
  ballistic: {
    smoke: { life: 12, w0: 24, w1: 170, col: [0.55, 0.5, 0.48], alpha: 0.32, minSeg: 220, turb: 25, rise: 0, warm: 0, noiseLen: 160, fadePow: 1.2, wkVar: 1.0, breakup: 0.6 },
    hot: { life: 3.2, w0: 70, w1: 14, col: [11, 4.2, 1.4], alpha: 1, minSeg: 90 },
  },
  drone: { hot: { life: 0.15, w0: 1.2, w1: 0.4, col: [2.5, 1.1, 0.4], alpha: 0.5, minSeg: 20 } },
  cruise: {
    smoke: { life: 4, w0: 2, w1: 12, col: [0.6, 0.58, 0.56], alpha: 0.35, minSeg: 35, turb: 1.5, rise: 0.4, warm: 0.6, noiseLen: 20 },
    hot: { life: 0.22, w0: 2.6, w1: 0.8, col: [7, 3.4, 1.3], alpha: 1, minSeg: 14 },
  },
  debris: {
    hot: { life: 0.55, w0: 3.2, w1: 0.8, col: [7, 3, 0.9], alpha: 1, minSeg: 10 },
    smoke: { life: 6, w0: 4, w1: 28, col: [0.42, 0.39, 0.36], alpha: 0.55, minSeg: 36, turb: 2, rise: 0.6, warm: 0.9, noiseLen: 14, fadePow: 1.3 },
  },
};

export function create(ctx) {
  const { scene, bus, sim, camera, quality } = ctx;
  const rng = makeRng(ctx.params.seed, 'vfx');
  const R = (a, b) => rng.range(a, b);
  // per-frame emitters use their own stream so event bursts are identical at any frame rate
  const rngF = makeRng(ctx.params.seed, 'vfx-frame');
  const RF = (a, b) => rngF.range(a, b);
  const MUL = () => quality.s.particleMul;
  const shared = createShared();
  const fire = new Pool(scene, 20000, true, 1.5, 9, shared);
  const smoke = new Pool(scene, 12000, false, 1.3, 7, shared);
  fire.rand = smoke.rand = rng.next;
  const smokeTr = new TrailSet(scene, { maxTrails: 360, maxPts: 96, additive: false, order: 6, shared, minPx: 1.6, rand: rngF.next });
  const hotTr = new TrailSet(scene, { maxTrails: 360, maxPts: 40, additive: true, order: 8, shared, minPx: 1.3, rand: rngF.next });
  const scorch = createScorch(scene, shared);
  const glow = (x, y, z, r, g, b, s, a = 1, type = T_GLOW, h = 0) => fire.add(x, y, z, 0, 0, 0, r, g, b, s, s, a, -1, 0, 0, 0, type, h);

  // ---------------------------------------------------------------- bodies (instanced)
  const MAXI = 256;
  const mkInst = (geo, mat) => { const m = new THREE.InstancedMesh(geo, mat, MAXI); m.count = 0; m.frustumCulled = false; scene.add(m); return m; };
  const metal = new THREE.MeshStandardMaterial({ color: 0x6d7378, roughness: 0.5, metalness: 0.6 });
  const droneGeo = (() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 1.8, 1.25, 0, -1.0, -1.25, 0, -1.0, 0, 0.25, -0.7], 3)); g.setIndex([0, 1, 3, 0, 3, 2, 0, 2, 1, 1, 2, 3]); g.computeVertexNormals(); return g; })();
  const drones = mkInst(droneGeo, new THREE.MeshStandardMaterial({ color: 0x5b5f61, roughness: 0.7, metalness: 0.3 }));
  const cruises = mkInst(new THREE.CylinderGeometry(0.3, 0.3, 6, 6).rotateX(Math.PI / 2), metal);
  const ballistics = mkInst(new THREE.ConeGeometry(0.6, 9, 8).rotateX(Math.PI / 2), metal);
  const ints = mkInst(new THREE.CylinderGeometry(0.14, 0.14, 3.5, 6).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.5, metalness: 0.2 }));
  const jetGeo = (() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 9, 6, 0, -3, -6, 0, -3, 0, 1.6, -2, 0, 0, -5], 3)); g.setIndex([0, 1, 4, 0, 4, 2, 0, 3, 1, 0, 2, 3]); g.computeVertexNormals(); return g; })();
  const jets = mkInst(jetGeo, new THREE.MeshStandardMaterial({ color: 0x80878d, roughness: 0.4, metalness: 0.6, side: THREE.DoubleSide }));
  const instList = [drones, cruises, ballistics, ints, jets];
  const dummy = new THREE.Object3D();
  const v3 = new THREE.Vector3();
  const placeInst = (mesh, i, pos, vel, scale) => {
    dummy.position.set(pos.x, pos.y, pos.z);
    v3.set(pos.x + vel.x, pos.y + vel.y, pos.z + vel.z);
    if (vel.x * vel.x + vel.y * vel.y + vel.z * vel.z > 1e-6) dummy.lookAt(v3);
    dummy.scale.setScalar(scale); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
  };

  // ---------------------------------------------------------------- VFX light set
  // kind 0: flash (fast attack, exponential decay); kind 1: fire (flicker, long)
  const LMAX = 48;
  const lights = [];
  for (let i = 0; i < LMAX; i++) lights.push({ on: false, x: 0, y: 0, z: 0, r: 0, g: 0, b: 0, rad: 1, t: 0, dur: 1, kind: 0, ph: 0, cur: 0, score: 0 });
  function addLight(x, y, z, r, g, b, rad, dur, kind = 0) {
    let l = null;
    for (let i = 0; i < LMAX; i++) if (!lights[i].on) { l = lights[i]; break; }
    if (!l) { l = lights[0]; for (let i = 1; i < LMAX; i++) if (lights[i].score < l.score) l = lights[i]; }
    l.on = true; l.x = x; l.y = y; l.z = z; l.r = r; l.g = g; l.b = b; l.rad = rad; l.t = 0; l.dur = dur; l.kind = kind; l.ph = Math.abs(x * 0.013 + z * 0.007) % 20; l.cur = 0; l.score = 1e9;
    return l;
  }
  const sel = new Int32Array(NL);
  function updateLights(dt, t) {
    const cp = camera.position;
    let ns = 0;
    for (let i = 0; i < LMAX; i++) {
      const l = lights[i]; if (!l.on) continue;
      l.t += dt;
      if (l.t > l.dur) { l.on = false; l.score = 0; continue; }
      const k = l.t / l.dur;
      if (l.kind === 0) l.cur = Math.min(1, l.t / 0.03) * Math.exp(-4 * k) * (1 - k);
      else l.cur = (0.78 + 0.22 * Math.sin(t * 11.3 + l.ph) * Math.sin(t * 6.7 + l.ph * 1.7)) * Math.min(1, l.t / 0.6) * (k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1);
      const dx = l.x - cp.x, dy = l.y - cp.y, dz = l.z - cp.z, r2 = l.rad * l.rad * 16;
      l.score = l.cur * (l.r + l.g + l.b) * r2 / (r2 + dx * dx + dy * dy + dz * dz);
      // keep the top NL-1 (slot 0 is the town glow)
      if (ns < NL - 1) { sel[ns++] = i; }
      else { let w = 0; for (let j = 1; j < ns; j++) if (lights[sel[j]].score < lights[sel[w]].score) w = j; if (l.score > lights[sel[w]].score) sel[w] = i; }
    }
    const LP = shared.uLP.value, LC = shared.uLC.value;
    LP[0].set(0, 120, 0, 2600); LC[0].set(0.22, 0.13, 0.06); // sodium glow over Arad
    for (let s = 1; s < NL; s++) {
      if (s - 1 < ns) { const l = lights[sel[s - 1]]; LP[s].set(l.x, l.y, l.z, l.rad); LC[s].set(l.r * l.cur, l.g * l.cur, l.b * l.cur); }
      else { LP[s].set(0, -1e6, 0, 1); LC[s].set(0, 0, 0); }
    }
  }

  // ---------------------------------------------------------------- helpers
  // env light + sky flash request; the sky glow is a fixed-size lobe, so far sources ask for less
  const envFlash = (x, y, z, col, I, rad, dur) => {
    const d = Math.hypot(x - camera.position.x, y - camera.position.y, z - camera.position.z);
    fpos.x = x; fpos.y = y; fpos.z = z;
    ctx.lights.flash(fpos, col, I * Math.min(1, Math.max(0.12, 7000 / (d + 1))), rad, dur);
  };
  const fpos = { x: 0, y: 0, z: 0 };
  const camDist = (x, y, z) => Math.hypot(x - camera.position.x, y - camera.position.y, z - camera.position.z);
  const shake = (amp, d, range, dur, kind, t) => {
    if (d >= range) return;
    const k = 1 - d / range;
    bus.emit('shake', { amp: Math.min(0.9, amp * k * k), dur, kind, t });
  };
  const sphere = { x: 0, y: 0, z: 0 };
  const randDir = () => { const a = rng.next() * Math.PI * 2, c = rng.next() * 2 - 1, s = Math.sqrt(1 - c * c); sphere.x = s * Math.cos(a); sphere.y = c; sphere.z = s * Math.sin(a); return sphere; };

  // star flash + fireball cluster + shock ring + sparks + lingering smoke; sz = fireball radius (m)
  function explosion(x, y, z, vx, vy, vz, Rf, opts) {
    const mul = MUL();
    const { sparks = 40, smokeN = 10, bright = 1, ring = true, smokeAlb = 0.42, lightI = 6, life = 1.3 } = opts;
    fire.add(x, y, z, 0, 0, 0, 14 * bright, 12 * bright, 10 * bright, Rf * 4.5, Rf * 5.5, 1, 0.16, 0, 0, 0, T_STAR, 0.8);
    const nf = Math.round(4 + 5 * mul * Math.min(2, Rf / 60));
    for (let i = 0; i < nf; i++) {
      const d = randDir(), off = R(0, 0.45) * Rf, sp = R(0.3, 0.9) * Rf;
      fire.add(x + d.x * off, y + d.y * off, z + d.z * off, vx * 0.12 + d.x * sp, vy * 0.12 + d.y * sp + Rf * 0.15, vz * 0.12 + d.z * sp,
        bright, bright, bright, Rf * R(0.25, 0.4), Rf * R(0.85, 1.35), 1, life * R(0.75, 1.3), -Rf * 0.08, 1.4, 1.6 / life, T_FIREBALL, R(1.05, 1.3), i < 2 ? 0 : R(0, 0.12), 1);
    }
    if (ring) fire.add(x, y, z, 0, 0, 0, 1.6 * bright, 1.45 * bright, 1.3 * bright, Rf * 0.6, Rf * 4.2, 0.6, 0.38, 0, 0, 0, T_RING, 0, 0, 1);
    const ns = Math.round(sparks * mul);
    for (let i = 0; i < ns; i++) {
      const d = randDir(), sp = R(0.6, 3.2) * Rf;
      fire.add(x, y, z, d.x * sp + vx * 0.1, d.y * sp + vy * 0.1, d.z * sp + vz * 0.1, 11, 6, 2, Math.max(2, Rf * 0.05), 1.5, 1, R(0.7, 2.0), 35, 1.1, 1.1);
    }
    const nsm = Math.round(smokeN * mul + 3);
    for (let i = 0; i < nsm; i++) {
      const d = randDir(), off = R(0, 0.7) * Rf, sp = R(0.1, 0.3) * Rf;
      smoke.add(x + d.x * off, y + d.y * off * 0.7, z + d.z * off, vx * 0.04 + d.x * sp, vy * 0.04 + d.y * sp * 0.6, vz * 0.04 + d.z * sp,
        smokeAlb, smokeAlb * 0.97, smokeAlb * 0.94, Rf * R(0.5, 0.8), Rf * R(1.9, 3.0), R(0.5, 0.7), R(16, 30), -1, 0.5, 1.1, T_SMOKE, R(1.4, 2.4), R(0.12, 0.45), 1);
    }
    addLight(x, y, z, 1 * lightI, 0.72 * lightI, 0.45 * lightI, Rf * 8, 1.8, 0);
    if (opts.smudge) for (let i = 0; i < 5; i++) { const d = randDir(), off = R(0, 0.5) * Rf; smoke.add(x + d.x * off, y + d.y * off, z + d.z * off, vx * 0.02 + d.x * 6, vy * 0.02, vz * 0.02 + d.z * 6, 0.3, 0.29, 0.28, Rf * 0.8, Rf * R(2.2, 3.2), 0.6, R(30, 45), 0.2, 0.3, 1.5, T_SMOKE, 0.6, R(0.4, 1.0), 1); }
  }

  // ---------------------------------------------------------------- debris
  const DMAX = 220;
  const debris = [];
  for (let i = 0; i < DMAX; i++) debris.push({ on: false, key: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, heat: 0, breakAt: 0, gen: 0, smoke: false, sz: 1 });
  let dSerial = 0;
  function spawnDebris(x, y, z, vx, vy, vz, heat, gen, sz, g = rng) {
    let d = null;
    for (let i = 0; i < DMAX; i++) if (!debris[i].on) { d = debris[i]; break; }
    if (!d) return;
    d.on = true; d.key = KD + (dSerial = (dSerial + 1) % 600000);
    d.x = x; d.y = y; d.z = z; d.vx = vx; d.vy = vy; d.vz = vz; d.life = 0; d.heat = heat; d.gen = gen; d.sz = sz;
    d.breakAt = gen === 0 && g.chance(0.35) ? g.range(0.8, 2.5) : 1e9;
    d.smoke = gen === 0 && g.chance(0.5);
    hotTr.start(d.key, ST.debris.hot);
    if (d.smoke) smokeTr.start(d.key, ST.debris.smoke);
  }
  const FMAX = 64;
  const fires = []; // small fires where burning debris lands
  for (let i = 0; i < FMAX; i++) fires.push({ on: false, x: 0, y: 0, z: 0, t: 0, dur: 0, acc: 0, s: 1 });
  function smallFire(x, z, s) {
    let f = null;
    for (let i = 0; i < FMAX; i++) if (!fires[i].on) { f = fires[i]; break; }
    if (!f) return;
    f.on = true; f.x = x; f.z = z; f.y = groundAt(x, z); f.t = 0; f.dur = RF(5, 12); f.acc = 0; f.s = s;
    addLight(x, f.y + 4, z, 1.6 * s, 0.7 * s, 0.25 * s, 40, f.dur, 1);
  }

  // ---------------------------------------------------------------- events
  bus.on('launch', (e) => {
    const mul = MUL();
    const st = ST[e.kind] || ST.dome;
    if (e.kind === 'aam') { // air-launched: a white flash and a puff off the rail
      fire.add(e.x, e.y, e.z, 0, 0, 0, 8, 9, 11, 14, 22, 1, 0.18, 0, 0, 0, T_STAR, 0.4);
      for (let i = 0; i < 4; i++) smoke.add(e.x, e.y, e.z, R(-6, 6), R(-3, 3), R(-6, 6), 0.8, 0.8, 0.82, 4, 18, 0.5, R(3, 5), 0, 0.6, 2, T_SMOKE, 1);
      return;
    }
    const big = e.kind === 'arrow' || e.kind === 'sling';
    const s = big ? 1.35 : 1;
    // booster flash and a short-lived light that warms the billow
    fire.add(e.x, e.y + 3, e.z, 0, 0, 0, 14, 10, 6, 22 * s, 30 * s, 1, 0.22, 0, 0, 0, T_STAR, 0.5);
    for (let i = 0; i < 3; i++) fire.add(e.x + R(-2, 2), e.y + 3, e.z + R(-2, 2), e.dx * 10, e.dy * 10 + R(4, 10), e.dz * 10, 1, 1, 1, 4 * s, R(10, 16) * s, 1, R(0.5, 0.8), 0, 1, 3, T_FIREBALL, 1.1, 0, 1);
    addLight(e.x, e.y + 10, e.z, 7, 4.2, 2, 90 * s, 1.4, 0);
    // ground billow: hugs the ground and spreads radially, then the launch plume rises
    const nb = Math.round((big ? 22 : 14) * mul) + 4;
    const gy = groundAt(e.x, e.z);
    for (let i = 0; i < nb; i++) {
      const a = (i / nb) * Math.PI * 2 + R(-0.3, 0.3), sp = R(10, 34) * s;
      smoke.add(e.x + Math.cos(a) * R(2, 8), gy + R(6, 12) * s, e.z + Math.sin(a) * R(2, 8), Math.cos(a) * sp, R(2, 6), Math.sin(a) * sp,
        0.72, 0.7, 0.67, 6 * s, R(16, 30) * s, R(0.32, 0.48), R(7, 12), -0.25, 0.9, 1.6, T_DUST, R(1.2, 2), 0, 1);
    }
    const np = Math.round((big ? 9 : 5) * mul) + 2;
    for (let i = 0; i < np; i++) {
      const k = R(0, 1), dd = k * 70 * s, sp = R(3, 12);
      smoke.add(e.x + e.dx * dd, e.y + 3 + e.dy * dd, e.z + e.dz * dd, e.dx * sp + R(-3, 3), e.dy * sp + R(0, 3), e.dz * sp + R(-3, 3),
        0.8, 0.8, 0.8, R(5, 8) * s, R(16, 28) * s, R(0.3, 0.45), R(5, 9), -0.4, 0.6, 1.4, T_SMOKE, 1.6 * (1 - k), k * 0.25);
    }
    for (let i = 0; i < 10 * mul; i++) { const d = randDir(); fire.add(e.x, gy + 2, e.z, d.x * R(20, 60), Math.abs(d.y) * R(20, 50), d.z * R(20, 60), 9, 5, 1.6, 1.2, 0.6, 1, R(0.3, 0.8), 30, 1, 2); }
    envFlash(e.x, e.y + 6, e.z, [1, 0.7, 0.4], big ? 3e5 : 1.6e5, 500, 0.4);
    void st;
  });

  bus.on('intercept', (e) => {
    const mul = MUL();
    const d = camDist(e.x, e.y, e.z);
    const exo = e.y > 15000;
    if (e.offmap) {
      if (exo) { // SM-3 over the Gulf of Aqaba / Jordan: a bright, very high pinpoint
        fire.add(e.x, e.y, e.z, 0, 0, 0, 10, 9.5, 9, 1600, 2000, 1, 0.45, 0, 0, 0, T_STAR, 0.9);
        for (let i = 0; i < 10 * mul; i++) { const q = randDir(), sp = R(80, 400); fire.add(e.x, e.y, e.z, q.x * sp, q.y * sp, q.z * sp, 6, 3.4, 1.4, 60, 30, 1, R(1.5, 3.5), 0, 0.2, 0.6); }
        envFlash(e.x, e.y, e.z, [0.9, 0.85, 1], 4.5e5, 1, 0.5);
      } else { // allied fighter kill over Jordan: a small orange flash low on the eastern horizon
        fire.add(e.x, e.y, e.z, 0, 0, 0, 8, 6, 4, 300, 380, 1, 0.22, 0, 0, 0, T_STAR, 0.3);
        for (let i = 0; i < 3; i++) fire.add(e.x + R(-30, 30), e.y + R(-30, 30), e.z + R(-30, 30), e.vx * 0.1, 10, 0, 1, 1, 1, 40, R(90, 140), 1, R(0.9, 1.4), 0, 1, 1.4, T_FIREBALL, 1.1, 0, 1);
        for (let i = 0; i < 5; i++) smoke.add(e.x + R(-60, 60), e.y + R(-40, 40), e.z + R(-60, 60), R(-4, 4), R(-2, 2), R(-4, 4), 0.4, 0.39, 0.38, 60, 220, 0.4, R(10, 18), 0, 0.2, 1.2, T_SMOKE, 1.5);
        addLight(e.x, e.y, e.z, 4, 2.6, 1.4, 500, 1.2, 0);
        envFlash(e.x, e.y, e.z, [1, 0.72, 0.45], 1.5e5, 1, 0.4);
      }
      return;
    }
    if (exo) { // Arrow 3: exo-atmospheric hit-to-kill, a star-flash with glints and a fading debris cloud
      const k = e.kill ? 1 : 0.45;
      fire.add(e.x, e.y, e.z, 0, 0, 0, 16 * k, 15 * k, 14 * k, 1400, 1900, 1, 0.55, 0, 0, 0, T_STAR, 1.1);
      fire.add(e.x, e.y, e.z, 0, 0, 0, 1.6 * k, 1.5 * k, 1.45 * k, 360, 700, 0.4, 0.25, 0, 0, 0, T_GLOW, 0, 0, 1);
      const nd = Math.round((e.kill ? 40 : 12) * mul);
      for (let i = 0; i < nd; i++) {
        const q = randDir(), sp = R(60, 420);
        fire.add(e.x, e.y, e.z, q.x * sp + e.vx * 0.3, q.y * sp + e.vy * 0.3, q.z * sp + e.vz * 0.3, 9, 5, 2, R(50, 110), 40, 1, R(3, 6), 4, 0.15, 0.4);
      }
      if (e.kill) for (let i = 0; i < 6 * mul + 2; i++) { const q = randDir(), off = R(0, 250); smoke.add(e.x + q.x * off, e.y + q.y * off, e.z + q.z * off, e.vx * 0.2 + q.x * 30, e.vy * 0.2 + q.y * 30, e.vz * 0.2 + q.z * 30, 0.75, 0.75, 0.8, 300, R(1400, 2400), 0.3, R(18, 28), 0, 0.05, 0.9, T_SMOKE, 0.6); }
      addLight(e.x, e.y, e.z, 9 * k, 8 * k, 7.5 * k, 1800, 1.0, 0);
      envFlash(e.x, e.y, e.z, [0.95, 0.9, 1], e.kill ? 6e5 : 2.5e5, 1, 0.55);
      ctx.fx.flash = Math.min(2.5, ctx.fx.flash + (e.kill ? 0.12 : 0.04));
      return;
    }
    const big = e.threatType === 'ballistic';
    const Rf = (big ? 120 : e.threatType === 'cruise' ? 75 : 65) * (e.kill ? 1 : 0.55) * Math.min(2.4, Math.max(1, Math.sqrt(d / 2500)));
    explosion(e.x, e.y, e.z, e.vx, e.vy, e.vz, Rf, {
      sparks: e.kill ? (big ? 90 : 45) : 14, smokeN: e.kill ? (big ? 16 : 8) : 3, bright: e.kill ? 1 : 0.7,
      lightI: big ? 12 : 6, life: big ? 1.7 : 1.15, ring: e.kill, smudge: e.kill,
    });
    if (e.kill) {
      const nd = Math.round((big ? 12 : 4) * mul) + 1;
      for (let i = 0; i < nd; i++) {
        const q = randDir(), sp = R(40, 170) * (big ? 1 : 0.7);
        spawnDebris(e.x, e.y, e.z, e.vx * 0.22 + q.x * sp, e.vy * 0.15 + Math.abs(q.y) * sp * 0.6 + 20, e.vz * 0.22 + q.z * sp, R(0.7, 1.2), 0, big ? R(1, 1.6) : R(0.6, 1));
      }
    }
    envFlash(e.x, e.y, e.z, [1, 0.8, 0.58], (big ? 1.4e6 : 6e5) * (e.kill ? 1 : 0.4), big ? 16000 : 7000, big ? 0.7 : 0.45);
    ctx.fx.flash = Math.min(2.5, ctx.fx.flash + (big ? 0.45 : 0.18) * Math.min(1, 3000 / (d + 500)));
    shake(big ? 0.7 : 0.3, d, big ? 9000 : 5000, 0.5, 'intercept', e.t);
  });

  bus.on('interceptor:end', (e) => {
    if (e.why === 'selfdestruct') explosion(e.x, e.y, e.z, 0, 0, 0, 22, { sparks: 10, smokeN: 3, bright: 0.6, lightI: 3, life: 0.8, ring: false });
    else if (e.why === 'ground') {
      const gy = groundAt(e.x, e.z);
      fire.add(e.x, gy + 4, e.z, 0, 0, 0, 10, 7, 4, 40, 60, 1, 0.2, 0, 0, 0, T_STAR, 0.4);
      for (let i = 0; i < 8; i++) { const a = R(0, 6.28); smoke.add(e.x, gy + 3, e.z, Math.cos(a) * R(10, 30), R(1, 5), Math.sin(a) * R(10, 30), 0.5, 0.44, 0.36, 8, 40, 0.5, R(6, 10), 0, 1, 1.5, T_DUST, 1.2); }
    }
  });

  const CMAX = 32;
  const columns = [];
  for (let i = 0; i < CMAX; i++) columns.push({ on: false, x: 0, y: 0, z: 0, s: 1, t: 0, life: 0, acc: 0, eacc: 0, fire: 0 });
  bus.on('impact', (e) => {
    const mul = MUL();
    const s = e.type === 'ballistic' ? 1.3 : e.type === 'cruise' ? 0.7 : 0.42;
    const y = groundAt(e.x, e.z);
    // flash + ground fireball
    fire.add(e.x, y + 25 * s, e.z, 0, 0, 0, 16, 13, 10, 320 * s, 420 * s, 1, 0.2, 0, 0, 0, T_STAR, 0.6);
    const nf = Math.round((8 + 8 * mul) * Math.max(0.5, s));
    for (let i = 0; i < nf; i++) {
      const a = R(0, 6.283), rr = R(0, 30) * s;
      fire.add(e.x + Math.cos(a) * rr, y + R(8, 45) * s, e.z + Math.sin(a) * rr, Math.cos(a) * R(10, 40) * s, R(25, 85) * s, Math.sin(a) * R(10, 40) * s,
        1, 1, 1, 30 * s, R(70, 130) * s, 1, R(1.2, 2.3), -6, 1.2, 0.9, T_FIREBALL, R(1.05, 1.3), i < 3 ? 0 : R(0, 0.2), 1);
    }
    fire.add(e.x, y + 6, e.z, 0, 0, 0, 1.4, 1.2, 1, 40 * s, 360 * s, 0.5, 0.45, 0, 0, 0, T_RING, 0, 0, 1);
    // dust ring racing outward along the ground
    const nr = Math.round(40 * mul * Math.max(0.5, s)) + 6;
    for (let i = 0; i < nr; i++) {
      const a = (i / nr) * 6.283 + R(-0.1, 0.1), sp = R(110, 230) * s;
      smoke.add(e.x + Math.cos(a) * 12 * s, y + R(3, 8) * s, e.z + Math.sin(a) * 12 * s, Math.cos(a) * sp, R(2, 10) * s, Math.sin(a) * sp,
        0.62, 0.52, 0.4, 18 * s, R(70, 120) * s, R(0.22, 0.34), R(7, 13), 0.5, 1.7, 1.3, T_DUST, R(0.6, 1.2), 0, 1);
    }
    // ejecta: glowing clods in arcs
    for (let i = 0; i < 50 * mul * s + 6; i++) { const a = R(0, 6.283), sp = R(50, 220) * s; fire.add(e.x, y + 5, e.z, Math.cos(a) * sp, R(70, 260) * s, Math.sin(a) * sp, 10, 5, 1.6, 4 * s, 2, 1, R(1, 3), 95, 0.35, 1.2); }
    // the cloud above the blast, lit by the fireball, then the persistent column
    for (let i = 0; i < 10 * mul + 3; i++) { const q = randDir(); smoke.add(e.x + q.x * 30 * s, y + R(30, 90) * s, e.z + q.z * 30 * s, q.x * 18 * s, R(20, 45) * s, q.z * 18 * s, 0.2, 0.19, 0.18, 50 * s, R(180, 300) * s, 0.75, R(24, 36), -1, 0.6, 1.4, T_SMOKE, R(1.0, 1.6), R(0.1, 0.4), 1); }
    let c = null; for (let i = 0; i < CMAX; i++) if (!columns[i].on) { c = columns[i]; break; }
    if (c) { c.on = true; c.x = e.x; c.y = y; c.z = e.z; c.s = s; c.t = 0; c.acc = 0; c.eacc = 0; c.life = e.type === 'ballistic' ? 120 : 60; c.fire = e.kind === 'open' ? 9 : c.life * 0.75; }
    addLight(e.x, y + 40 * s, e.z, 20 * s, 12 * s, 6 * s, 450 * s, 2.2, 0);
    if (c) addLight(e.x, y + 20 * s, e.z, 4.5 * s, 2.0 * s, 0.6 * s, 200 * s, c.fire, 1);
    scorch.add(e.x, e.z, 48 * s, rng.next(), shared.uTime.value, e.kind === 'open' ? 0.5 : 1);
    envFlash(e.x, y + 60, e.z, [1, 0.62, 0.32], 3e7 * s, 9000, 0.9);
    const d = camDist(e.x, y, e.z);
    ctx.fx.flash = Math.min(2.5, ctx.fx.flash + 0.6 * s * Math.min(1, 4000 / (d + 600)));
    shake(1.2 * s, d, 12000, 0.9, 'impact', e.t);
  });

  // ---------------------------------------------------------------- per frame
  let t = 0, frame = 0, smokeAcc = 0;
  const seen = new Map();
  let curFrame = 0;
  const endStale = (stamp, key) => { if (stamp !== curFrame) { smokeTr.end(key); hotTr.end(key); seen.delete(key); } };
  const camPos = camera.position;
  const PT = { S: 0, A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 };
  return {
    update(realDt, simDt) {
      const dt = simDt ?? realDt;
      PT.S = performance.now();
      t += dt; frame++; curFrame = frame;
      shared.uTime.value = t;
      fire.purgeFrame();
      fire.rand = smoke.rand = rngF.next;
      const mul = MUL();
      // ---- threats
      let di = 0, ci = 0, bi = 0;
      const thr = sim.threats;
      for (let k = 0; k < thr.length; k++) {
        const th = thr[k]; if (!th.alive) continue;
        const key = KT + th.id;
        const stt = ST[th.type];
        if (!seen.has(key)) { if (stt.smoke) smokeTr.start(key, stt.smoke); hotTr.start(key, stt.hot); }
        seen.set(key, frame);
        const p = th.pos, vl = th.vel;
        if (th.type === 'drone') {
          if (di < MAXI) placeInst(drones, di++, p, vl, 1.6);
          const blink = (t * 1.3 + th.id * 0.37) % 1 < 0.1;
          glow(p.x, p.y, p.z, blink ? 5 : 1.6, blink ? 0.7 : 0.7, blink ? 0.4 : 0.25, blink ? 7 : 5, blink ? 1 : 0.7);
          hotTr.push(key, p.x, p.y, p.z, t);
        } else if (th.type === 'cruise') {
          if (ci < MAXI) placeInst(cruises, ci++, p, vl, 1.5);
          glow(p.x, p.y, p.z, 7, 3.4, 1.3, 9, 1);
          smokeTr.push(key, p.x, p.y, p.z, t); hotTr.push(key, p.x, p.y, p.z, t);
        } else {
          if (bi < MAXI) placeInst(ballistics, bi++, p, vl, 4);
          const h = th.heat;
          // meteor-like plasma head: white-hot core, orange sheath that grows with heating
          glow(p.x, p.y, p.z, 5 + 26 * h, 3 + 13 * h, 1.6 + 4 * h, 40 + 110 * h, 1);
          if (h > 0.04) glow(p.x, p.y, p.z, 2.4 * h, 0.9 * h, 0.3 * h, 260 + 380 * h, 0.55);
          if (h > 0.03) hotTr.push(key, p.x, p.y, p.z, t, Math.min(1, h * 1.6));
          if (p.y < 26000) smokeTr.push(key, p.x, p.y, p.z, t, Math.min(1, 0.3 + h));
        }
      }
      drones.count = di; cruises.count = ci; ballistics.count = bi;
      // ---- interceptors: white-hot flickering motor, smoke ribbon below ~20 km, a moving star above
      let ii = 0;
      const its = sim.interceptors;
      for (let k = 0; k < its.length; k++) {
        const it = its[k]; if (!it.alive) continue;
        const key = KI + it.id;
        const st = ST[it.kind] || ST.dome;
        if (!seen.has(key)) { smokeTr.start(key, st.smoke); hotTr.start(key, st.hot); }
        seen.set(key, frame);
        const p = it.pos;
        if (ii < MAXI) placeInst(ints, ii++, p, it.vel, st.body);
        const f = 0.78 + 0.22 * Math.sin(t * 53 + it.id * 2.1) * Math.sin(t * 31.7 + it.id);
        const exoK = Math.min(1, Math.max(0, (p.y - 17000) / 3000));
        if (exoK < 1) {
          glow(p.x, p.y, p.z, 16 * f, 13 * f, 9 * f, st.head * (0.85 + 0.3 * f), 1);
          glow(p.x, p.y, p.z, 5 * f, 2.6 * f, 1.1 * f, st.head * 4, 0.45 * (1 - exoK));
          smokeTr.push(key, p.x, p.y, p.z, t, 1 - exoK);
        } else glow(p.x, p.y, p.z, 9 * f, 9 * f, 10 * f, st.head * 2.4, 1);
        hotTr.push(key, p.x, p.y, p.z, t, 1 - exoK * 0.6);
      }
      ints.count = ii;
      seen.forEach(endStale);
      // ---- coalition jets: afterburner, nav lights, strobe
      let ji = 0;
      const js = sim.jets;
      for (let k = 0; k < js.length; k++) {
        const j = js[k];
        if (ji < MAXI) placeInst(jets, ji++, j.pos, j.vel, 1.4);
        const sp = Math.hypot(j.vel.x, j.vel.y, j.vel.z) || 1;
        const fx = j.vel.x / sp, fy = j.vel.y / sp, fz = j.vel.z / sp;
        const rx = -fz, rz = fx; // right vector (level)
        const ab = 0.85 + 0.15 * Math.sin(t * 40 + j.id);
        glow(j.pos.x - fx * 8, j.pos.y - fy * 8, j.pos.z - fz * 8, 9 * ab, 5 * ab, 2.2 * ab, 9, 1);
        glow(j.pos.x - fx * 13, j.pos.y - fy * 13, j.pos.z - fz * 13, 2.5, 1, 0.4, 16, 0.6);
        glow(j.pos.x - rx * 8.4, j.pos.y, j.pos.z - rz * 8.4, 3, 0.15, 0.1, 4, 1);
        glow(j.pos.x + rx * 8.4, j.pos.y, j.pos.z + rz * 8.4, 0.15, 3, 0.4, 4, 1);
        if ((t * 1.1 + j.id * 0.3) % 1 < 0.06) glow(j.pos.x, j.pos.y + 1, j.pos.z, 7, 7, 7, 6, 1);
      }
      jets.count = ji;
      for (let k = 0; k < instList.length; k++) instList[k].instanceMatrix.needsUpdate = true;
      PT.A = performance.now();
      // ---- falling burning debris (exaggerated gravity so it lands within a beat)
      for (let i = 0; i < DMAX; i++) {
        const d = debris[i]; if (!d.on) continue;
        d.life += dt;
        const dr = Math.max(0, 1 - 0.35 * dt);
        d.vx *= dr; d.vz *= dr; d.vy = d.vy * dr - 42 * dt;
        d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
        const heat = Math.max(0, d.heat - d.life * 0.07);
        const fl = 0.7 + 0.3 * Math.sin(t * 37 + i * 1.7);
        if (heat > 0.04) {
          glow(d.x, d.y, d.z, 7 * heat * fl, 3 * heat * fl, 0.9 * heat, 6 * d.sz, 1);
          hotTr.push(d.key, d.x, d.y, d.z, t, Math.min(1, heat * 1.3));
          if (rngF.next() < dt * 6 * mul) fire.add(d.x, d.y, d.z, RF(-4, 4), RF(-2, 4), RF(-4, 4), 8, 3.5, 1, 1.5, 0.6, 1, RF(0.3, 0.7), 10, 1, 2.5);
        }
        if (d.smoke) smokeTr.push(d.key, d.x, d.y, d.z, t);
        if (d.life > d.breakAt) { // breaks up: two hot fragments and a spit of sparks
          d.breakAt = 1e9;
          for (let c = 0; c < 2; c++) spawnDebris(d.x, d.y, d.z, d.vx + RF(-50, 50), d.vy + RF(-10, 40), d.vz + RF(-50, 50), heat * 0.9, 1, d.sz * 0.6, rngF);
          for (let c = 0; c < 8 * mul; c++) { const q = randDir(); fire.add(d.x, d.y, d.z, d.vx + q.x * 60, d.vy + q.y * 60, d.vz + q.z * 60, 10, 5, 1.6, 2, 1, 1, RF(0.4, 1), 30, 1, 2); }
          fire.add(d.x, d.y, d.z, d.vx * 0.2, d.vy * 0.2, d.vz * 0.2, 1, 1, 1, 6 * d.sz, 18 * d.sz, 1, 0.6, 0, 1, 2.5, T_FIREBALL, 1, 0, 1);
        }
        const gy = d.y < 700 ? groundAt(d.x, d.z) : -1e9;
        if (d.y <= gy || d.life > 40) {
          hotTr.end(d.key); smokeTr.end(d.key); d.on = false;
          if (d.y <= gy && heat > 0.1) {
            for (let k = 0; k < 10 * mul + 2; k++) fire.add(d.x, gy + 1, d.z, RF(-14, 14), RF(6, 26), RF(-14, 14), 9, 4, 1.2, 1.4, 0.5, 1, RF(0.4, 1.2), 30, 0.6, 1.6);
            fire.add(d.x, gy + 2, d.z, 0, 0, 0, 7, 4.5, 2.5, 12, 16, 1, 0.15, 0, 0, 0, T_STAR, 0.3);
            for (let k = 0; k < 3; k++) smoke.add(d.x, gy + 2, d.z, RF(-6, 6), RF(1, 4), RF(-6, 6), 0.55, 0.47, 0.38, 4, 18, 0.5, RF(4, 7), 0, 1, 1.5, T_DUST, 0.8);
            if (heat > 0.35 && rngF.chance(0.6)) smallFire(d.x, d.z, Math.min(1, heat));
          }
        }
      }
      PT.B = performance.now();
      // ---- small fires where debris landed
      for (let i = 0; i < FMAX; i++) {
        const f = fires[i]; if (!f.on) continue;
        f.t += dt; f.acc += dt;
        if (f.t > f.dur) { f.on = false; continue; }
        const k = 1 - f.t / f.dur, rate = 0.09 / mul;
        while (f.acc > rate) {
          f.acc -= rate;
          fire.add(f.x + RF(-2, 2), f.y + RF(0.5, 2), f.z + RF(-2, 2), RF(-1, 1), RF(4, 9), RF(-1, 1), 1, 1, 1, 2.4 * f.s, 5 * f.s, k, RF(0.5, 1.0), -3, 0.5, 2.2, T_FIREBALL, RF(0.8, 1.05));
          if (rngF.next() < 0.35) smoke.add(f.x, f.y + 4, f.z, RF(-1, 1), RF(3, 6), RF(-1, 1), 0.25, 0.24, 0.23, 4, RF(14, 26), 0.45 * k, RF(6, 10), -0.2, 0.2, 1.2, T_SMOKE, 0.8);
        }
      }
      // ---- impact columns: flames and embers at the base, a dark rising column lit from below
      for (let i = 0; i < CMAX; i++) {
        const c = columns[i]; if (!c.on) continue;
        c.t += dt; c.acc += dt; c.eacc += dt;
        if (c.t > c.life) { c.on = false; continue; }
        const k = 1 - c.t / c.life, s = c.s;
        const rate = 0.12 / mul;
        while (c.acc > rate) {
          c.acc -= rate;
          const hot = c.t < c.fire;
          const lo = rngF.next() < 0.35; // low, fire-lit puffs vs the dark column aloft
          const ab = lo ? 0.26 : 0.15;
          smoke.add(c.x + RF(-12, 12) * s, c.y + RF(4, 18) * s, c.z + RF(-12, 12) * s, RF(-4, 4), (lo ? RF(8, 16) : RF(40, 70)) * s, RF(-4, 4),
            ab, ab * 0.93, ab * 0.88, RF(18, 28) * s, (lo ? RF(120, 200) : RF(380, 600)) * s, 0.85 * Math.min(1, k * 1.5), lo ? RF(8, 14) : RF(45, 60), lo ? 0 : -0.5, lo ? 0.3 : 0.04, 1.0, T_SMOKE, hot && lo ? RF(1.4, 2.2) : 0, 0, 0);
        }
        if (c.t < c.fire) {
          const fk = 1 - c.t / c.fire;
          const fr = 0.07 / mul;
          while (c.eacc > fr) {
            c.eacc -= fr;
            fire.add(c.x + RF(-16, 16) * s, c.y + RF(2, 8) * s, c.z + RF(-16, 16) * s, RF(-2, 2), RF(8, 22) * s, RF(-2, 2), 1, 1, 1, 9 * s, RF(22, 38) * s * (0.5 + 0.5 * fk), 1, RF(0.6, 1.2), -4, 0.6, 1.8, T_FIREBALL, RF(0.85, 1.1) * (0.6 + 0.4 * fk), 0, 1);
            if (rngF.next() < 0.5) fire.add(c.x + RF(-10, 10) * s, c.y + RF(5, 15), c.z + RF(-10, 10) * s, RF(-6, 6), RF(18, 45), RF(-6, 6), 9, 3.6, 1, 1.6, 1, 1, RF(2, 4), -2, 0.3, 0.7);
          }
        }
      }
      PT.C = performance.now();
      updateLights(dt, t);
      fire.update(dt, WIND);
      smokeAcc += dt;
      const smokeDue = smokeAcc >= 1 / 40 || dt === 0 || dt >= 1 / 40;
      if (smokeDue) { smoke.update(smokeAcc, WIND); smokeAcc = 0; }
      PT.D = performance.now();
      smokeTr.update(t, dt, WIND, 1 / 40); hotTr.update(t, dt, 0);
      PT.E = performance.now();
      fire.upload(); if (smokeDue) smoke.upload();
      // shared uniforms: pixel scale, moon direction in view space, env ambient / fog
      shared.uScale.value = (ctx.size.h * ctx.size.dpr) / (2 * Math.tan((camera.fov * Math.PI) / 360));
      shared.uMoonV.value.copy(MOON).transformDirection(camera.matrixWorldInverse);
      const el = ctx.envLight;
      // smoke scatters the town glow and sky: lift env's ambient so trails read as pale smoke
      if (el && el.ambient) shared.uAmb.value.setRGB(el.ambient.r * 1.9 + 0.045, el.ambient.g * 1.9 + 0.04, el.ambient.b * 1.9 + 0.03);
      if (el && el.moon) shared.uMoonC.value.copy(el.moon);
      const fc = el && (el.fogColor || el.fog);
      if (fc && fc.isColor) shared.uFogC.value.copy(fc);
      else if (scene.fog && scene.fog.color) shared.uFogC.value.copy(scene.fog.color);
      shared.uFogD.value = scene.fog && scene.fog.density != null && HAS_ATM ? scene.fog.density : 1;
      fire.rand = smoke.rand = rng.next;
      PT.F = performance.now();
      void camPos;
    },
    _pt: PT,
    _dbg: { fire, smoke, smokeTr, hotTr, scorch, shared },
    stats() {
      let nd = 0; for (let i = 0; i < DMAX; i++) if (debris[i].on) nd++;
      let nc = 0; for (let i = 0; i < CMAX; i++) if (columns[i].on) nc++;
      return { fire: fire.n, smoke: smoke.n, smokeTrails: smokeTr.size, hotTrails: hotTr.size, debris: nd, columns: nc };
    },
  };
}
