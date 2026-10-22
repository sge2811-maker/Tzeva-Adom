// VFX stream: threat and interceptor bodies, exhaust/re-entry glows, ribbon trails, launch
// bursts, intercept explosions with falling burning debris, ground impacts with smoke columns,
// distant allied intercepts. Requests camera shake via bus 'shake' and light via ctx.lights.
import * as THREE from 'three';
import { Pool } from './particles.js';
import { TrailSet } from './trails.js';
import { makeRng } from '../core/rng.js';
import { groundAt } from '../world/geo.js';

const WIND = 4; // m/s toward +x (a light westerly)

export function create(ctx) {
  const { scene, bus, sim, camera, quality } = ctx;
  const rng = makeRng(ctx.params.seed, 'vfx');
  const R = (a, b) => rng.range(a, b);
  const mul = quality.s.particleMul;
  const fire = new Pool(scene, Math.round(24000 * mul), true, 1.6, 9);
  const smoke = new Pool(scene, Math.round(14000 * mul), false, 1.2, 7);
  fire.rand = smoke.rand = rng.next;
  const smokeTrails = new TrailSet(scene, { maxTrails: 260, maxPts: 80, additive: false, order: 6 });
  const hotTrails = new TrailSet(scene, { maxTrails: 260, maxPts: 24, additive: true, order: 8 });
  const glow = (p, r, g, b, s, a = 1) => fire.add(p.x, p.y, p.z, 0, 0, 0, r, g, b, s, s, a, -1);

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
  const dummy = new THREE.Object3D();
  const v3 = new THREE.Vector3();
  const placeInst = (mesh, i, pos, vel, scale) => {
    dummy.position.set(pos.x, pos.y, pos.z);
    v3.set(pos.x + vel.x, pos.y + vel.y, pos.z + vel.z);
    if (vel.x * vel.x + vel.y * vel.y + vel.z * vel.z > 1e-6) dummy.lookAt(v3);
    dummy.scale.setScalar(scale); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
  };

  // ---------------------------------------------------------------- trail styles
  const S = {
    dome: { smoke: { life: 14, w0: 5, w1: 40, color: [0.62, 0.62, 0.64], alpha: 0.55, minSeg: 25, drift: 1 }, hot: { life: 0.35, w0: 6, w1: 2, color: [9, 6.5, 3.5], alpha: 1, minSeg: 10 } },
    sling: { smoke: { life: 16, w0: 7, w1: 55, color: [0.62, 0.62, 0.64], alpha: 0.55, minSeg: 40, drift: 1 }, hot: { life: 0.3, w0: 9, w1: 3, color: [10, 7.5, 4.5], alpha: 1, minSeg: 15 } },
    arrow: { smoke: { life: 22, w0: 10, w1: 90, color: [0.64, 0.64, 0.66], alpha: 0.5, minSeg: 120, drift: 1 }, hot: { life: 0.45, w0: 14, w1: 4, color: [12, 9, 6], alpha: 1, minSeg: 40 } },
    aam: { smoke: { life: 6, w0: 3, w1: 18, color: [0.66, 0.66, 0.68], alpha: 0.4, minSeg: 25, drift: 1 }, hot: { life: 0.25, w0: 4, w1: 1, color: [8, 6, 4], alpha: 1, minSeg: 10 } },
    ballistic: { smoke: { life: 18, w0: 20, w1: 140, color: [0.42, 0.4, 0.4], alpha: 0.35, minSeg: 150, drift: 1, fadePow: 1.2 }, hot: { life: 1.6, w0: 34, w1: 4, color: [9, 3.6, 1.2], alpha: 1, minSeg: 60 } },
    drone: { smoke: { life: 3, w0: 1.5, w1: 6, color: [0.5, 0.5, 0.5], alpha: 0.12, minSeg: 40, drift: 1 }, hot: { life: 0.15, w0: 1.5, w1: 0.5, color: [3, 1.4, 0.6], alpha: 0.6, minSeg: 20 } },
    cruise: { smoke: { life: 5, w0: 2, w1: 10, color: [0.5, 0.5, 0.5], alpha: 0.3, minSeg: 30, drift: 1 }, hot: { life: 0.2, w0: 2.5, w1: 1, color: [6, 3, 1.2], alpha: 1, minSeg: 15 } },
    debris: { hot: { life: 0.9, w0: 5, w1: 1.5, color: [6, 2.6, 0.8], alpha: 1, minSeg: 12 }, smoke: { life: 7, w0: 4, w1: 26, color: [0.3, 0.29, 0.28], alpha: 0.35, minSeg: 30, drift: 1 } },
  };
  const tracked = new Map(); // key -> { kind }
  const debris = []; // falling burning fragments

  // ---------------------------------------------------------------- events
  const camDist = (x, y, z) => Math.hypot(x - camera.position.x, y - camera.position.y, z - camera.position.z);
  bus.on('launch', (e) => {
    const big = e.kind === 'arrow' || e.kind === 'sling';
    for (let i = 0; i < (big ? 26 : 16) * mul; i++) smoke.add(e.x + R(-8, 8), e.y + R(0, 4), e.z + R(-8, 8), R(-14, 14), R(2, 10), R(-14, 14), 0.5, 0.49, 0.47, 8, big ? 70 : 45, 0.7, R(5, 10), 0, 0.5);
    fire.add(e.x, e.y + 2, e.z, 0, 0, 0, 14, 9, 5, big ? 30 : 18, big ? 50 : 30, 1, 0.25);
    if (e.kind !== 'aam') ctx.lights.flash({ x: e.x, y: e.y + 6, z: e.z }, [1, 0.7, 0.4], big ? 1.2e6 : 6e5, 900, 0.5);
  });
  bus.on('intercept', (e) => {
    const big = e.threatType === 'ballistic';
    const d = camDist(e.x, e.y, e.z);
    const k = e.offmap ? 0.6 : 1;
    const sz = (big ? 1 : e.threatType === 'cruise' ? 0.55 : 0.4) * k;
    if (!e.kill) { // interceptor detonated but missed: a smaller pop
      fire.add(e.x, e.y, e.z, 0, 0, 0, 10, 7, 4, 120 * sz, 220 * sz, 1, 0.22);
      for (let i = 0; i < 6; i++) smoke.add(e.x, e.y, e.z, R(-8, 8), R(-4, 6), R(-8, 8), 0.35, 0.34, 0.33, 40 * sz, 160 * sz, 0.5, R(10, 16), 0, 0.2);
      return;
    }
    // flash, fireball, sparks, smoke, burning debris
    fire.add(e.x, e.y, e.z, 0, 0, 0, 22, 18, 13, 300 * sz, 700 * sz, 1, 0.18);
    for (let i = 0; i < 9 * mul + 3; i++) fire.add(e.x + R(-40, 40) * sz, e.y + R(-40, 40) * sz, e.z + R(-40, 40) * sz, R(-30, 30) * sz, R(-20, 30) * sz, R(-30, 30) * sz, 9, 4.5, 1.6, 90 * sz, 260 * sz, 1, R(0.6, 1.3), 0, 1.2, 1.4);
    const sparks = Math.round((big ? 70 : 34) * mul);
    for (let i = 0; i < sparks; i++) {
      const a = R(0, Math.PI * 2), b = Math.acos(R(-1, 1)), sp = R(80, 420) * Math.sqrt(sz);
      fire.add(e.x, e.y, e.z, Math.sin(b) * Math.cos(a) * sp + e.vx * 0.15, Math.cos(b) * sp, Math.sin(b) * Math.sin(a) * sp + e.vz * 0.15, 12, 6, 2, 14 * sz, 4, 1, R(0.8, 2.4), 60, 0.9, 1.2);
    }
    for (let i = 0; i < 10 * mul + 4; i++) smoke.add(e.x + R(-60, 60) * sz, e.y + R(-40, 40) * sz, e.z + R(-60, 60) * sz, R(-10, 10), R(-3, 6), R(-10, 10), 0.32, 0.31, 0.3, 120 * sz, 480 * sz, 0.55, R(18, 34), 0, 0.15);
    if (!e.offmap) {
      const nd = Math.round((big ? 14 : 6) * mul);
      for (let i = 0; i < nd; i++) {
        const id = 'deb' + e.id + '_' + i + '_' + Math.floor(e.t * 100);
        debris.push({ id, x: e.x, y: e.y, z: e.z, vx: e.vx * 0.25 + R(-160, 160), vy: R(-40, 140), vz: e.vz * 0.25 + R(-160, 160), life: 0, heat: R(0.6, 1.2) });
        hotTrails.start(id + 'h', S.debris.hot); smokeTrails.start(id + 's', S.debris.smoke);
      }
    }
    // light the world and the sky; nearby blasts shake the camera
    const power = (big ? 2.2e7 : 6e6) * k;
    ctx.lights.flash({ x: e.x, y: e.y, z: e.z }, [1, 0.82, 0.62], power, big ? 18000 : 7000, big ? 0.7 : 0.45);
    ctx.fx.flash = Math.min(2.5, ctx.fx.flash + (big ? 1.2 : 0.4) * Math.min(1, 9000 / (d + 1000)) * k);
    if (!e.offmap && d < 9000) bus.emit('shake', { amp: (big ? 1.0 : 0.4) * (1 - d / 9000), dur: 0.6, kind: 'intercept', t: e.t });
  });
  bus.on('interceptor:end', (e) => {
    if (e.why === 'selfdestruct') fire.add(e.x, e.y, e.z, 0, 0, 0, 8, 6, 3.5, 40, 90, 1, 0.2);
  });
  const columns = [];
  bus.on('impact', (e) => {
    const s = e.type === 'ballistic' ? 1 : e.type === 'cruise' ? 0.65 : 0.4;
    const y = groundAt(e.x, e.z);
    fire.add(e.x, y + 30 * s, e.z, 0, 0, 0, 24, 16, 10, 260 * s, 520 * s, 1, 0.28);
    for (let i = 0; i < 16 * mul + 4; i++) fire.add(e.x + R(-30, 30) * s, y + R(5, 60) * s, e.z + R(-30, 30) * s, R(-40, 40) * s, R(20, 90) * s, R(-40, 40) * s, 8, 3.6, 1.2, 70 * s, 200 * s, 1, R(0.8, 1.8), 15, 1.1, 1.1);
    for (let i = 0; i < 60 * mul; i++) { const a = R(0, Math.PI * 2), sp = R(60, 260) * s; fire.add(e.x, y + 5, e.z, Math.cos(a) * sp, R(60, 240) * s, Math.sin(a) * sp, 10, 5, 1.6, 10 * s, 3, 1, R(1, 3), 90, 0.4, 1.3); }
    for (let i = 0; i < 26 * mul; i++) { const a = R(0, Math.PI * 2), sp = R(50, 140) * s; smoke.add(e.x, y + 4, e.z, Math.cos(a) * sp, R(2, 12), Math.sin(a) * sp, 0.36, 0.3, 0.24, 40 * s, 220 * s, 0.6, R(6, 12), 0, 0.6); }
    columns.push({ x: e.x, y, z: e.z, s, t: 0, life: e.type === 'ballistic' ? 70 : 40, acc: 0, fire: e.kind !== 'open' });
    ctx.lights.flash({ x: e.x, y: y + 60, z: e.z }, [1, 0.62, 0.32], 3e7 * s, 9000, 0.9);
    const d = camDist(e.x, y, e.z);
    ctx.fx.flash = Math.min(2.5, ctx.fx.flash + 0.9 * s * Math.min(1, 6000 / (d + 600)));
    if (d < 14000) bus.emit('shake', { amp: 1.6 * s * (1 - d / 14000), dur: 0.9, kind: 'impact', t: e.t });
  });

  // ---------------------------------------------------------------- per frame
  let t = 0;
  const camPos = camera.position;
  return {
    update(dt) {
      t += dt;
      fire.purgeFrame();
      // bodies + trails for threats
      let di = 0, ci = 0, bi = 0;
      for (const th of sim.threats) {
        const key = 't' + th.id;
        if (!th.alive) { if (tracked.has(key)) { smokeTrails.end(key + 's'); hotTrails.end(key + 'h'); tracked.delete(key); } continue; }
        if (!tracked.has(key)) { tracked.set(key, th.type); const st = S[th.type]; smokeTrails.start(key + 's', st.smoke); hotTrails.start(key + 'h', st.hot); }
        const p = th.pos;
        if (th.type === 'drone') {
          placeInst(drones, di++, p, th.vel, 1.6);
          if ((t * 1.3 + th.id * 0.37) % 1 < 0.12) glow(p, 6, 0.6, 0.4, 6, 1); else glow(p, 1.4, 0.5, 0.2, 4, 0.6);
        } else if (th.type === 'cruise') {
          placeInst(cruises, ci++, p, th.vel, 1.5);
          glow(p, 6, 3, 1.2, 10, 1);
          smokeTrails.push(key + 's', p.x, p.y, p.z, t); hotTrails.push(key + 'h', p.x, p.y, p.z, t);
        } else {
          placeInst(ballistics, bi++, p, th.vel, 4);
          const h = th.heat;
          glow(p, 4 + 18 * h, 2 + 7 * h, 0.8 + 2 * h, 40 + 80 * h, 1);
          if (h > 0.05) hotTrails.push(key + 'h', p.x, p.y, p.z, t);
          if (p.y < 26000) smokeTrails.push(key + 's', p.x, p.y, p.z, t);
        }
      }
      drones.count = di; cruises.count = ci; ballistics.count = bi;
      // interceptors
      let ii = 0;
      for (const it of sim.interceptors) {
        const key = 'i' + it.id;
        if (!tracked.has(key)) { tracked.set(key, it.kind); const st = S[it.kind] || S.dome; smokeTrails.start(key + 's', st.smoke); hotTrails.start(key + 'h', st.hot); }
        placeInst(ints, ii++, it.pos, it.vel, it.kind === 'arrow' ? 3 : it.kind === 'sling' ? 2 : 1.3);
        glow(it.pos, 16, 12, 8, it.kind === 'arrow' ? 60 : it.kind === 'sling' ? 36 : 22, 1);
        if (it.pos.y < 30000) smokeTrails.push(key + 's', it.pos.x, it.pos.y, it.pos.z, t);
        hotTrails.push(key + 'h', it.pos.x, it.pos.y, it.pos.z, t);
      }
      for (const [key, kind] of tracked) {
        if (key[0] !== 'i') continue;
        const id = +key.slice(1);
        if (!sim.interceptors.some((q) => q.id === id)) { smokeTrails.end(key + 's'); hotTrails.end(key + 'h'); tracked.delete(key); }
      }
      ints.count = ii;
      // coalition jets
      let ji = 0;
      for (const j of sim.jets) {
        placeInst(jets, ji++, j.pos, j.vel, 1.4);
        v3.set(j.pos.x - j.vel.x * 0.04, j.pos.y - j.vel.y * 0.04, j.pos.z - j.vel.z * 0.04);
        glow(v3, 8, 4, 1.6, 12, 1);
        if ((t * 1.1 + j.id) % 1 < 0.08) glow(j.pos, 6, 6, 6, 8, 1);
      }
      jets.count = ji;
      for (const m of [drones, cruises, ballistics, ints, jets]) m.instanceMatrix.needsUpdate = true;
      // falling debris
      for (let i = debris.length - 1; i >= 0; i--) {
        const d = debris[i];
        d.life += dt;
        d.vx *= 1 - 0.25 * dt; d.vz *= 1 - 0.25 * dt; d.vy = d.vy * (1 - 0.2 * dt) - 9.8 * dt * 6;
        d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
        const heat = Math.max(0, d.heat - d.life * 0.12);
        if (heat > 0.05) { glow(d, 6 * heat, 2.6 * heat, 0.8 * heat, 10, 1); hotTrails.push(d.id + 'h', d.x, d.y, d.z, t); }
        smokeTrails.push(d.id + 's', d.x, d.y, d.z, t);
        if (d.y <= groundAt(d.x, d.z) || d.life > 40) {
          hotTrails.end(d.id + 'h'); smokeTrails.end(d.id + 's'); debris.splice(i, 1);
          if (heat > 0.1) for (let k = 0; k < 6; k++) fire.add(d.x, groundAt(d.x, d.z) + 2, d.z, R(-6, 6), R(4, 14), R(-6, 6), 6, 2.6, 0.8, 4, 2, 1, R(0.6, 1.4), 9.8, 0.5, 1.2);
        }
      }
      // smoke columns from impacts
      for (let i = columns.length - 1; i >= 0; i--) {
        const c = columns[i]; c.t += dt; c.acc += dt;
        if (c.t > c.life) { columns.splice(i, 1); continue; }
        const rate = 0.12 / mul;
        while (c.acc > rate) {
          c.acc -= rate;
          const k = 1 - c.t / c.life;
          smoke.add(c.x + R(-20, 20) * c.s, c.y + R(5, 25), c.z + R(-20, 20) * c.s, R(-3, 3), R(14, 26) * c.s, R(-3, 3), 0.2, 0.18, 0.17, 50 * c.s, 300 * c.s, 0.65 * k, R(14, 24), -0.3, 0.05);
          if (c.fire && c.t < c.life * 0.6) fire.add(c.x + R(-18, 18) * c.s, c.y + R(2, 10), c.z + R(-18, 18) * c.s, 0, R(6, 14), 0, 6, 2.4, 0.6, 22 * c.s, 50 * c.s, k, R(0.5, 1.1), -2, 0.5, 0.8);
        }
      }
      fire.update(dt, WIND); smoke.update(dt, WIND);
      smokeTrails.update(t, dt, camPos, WIND); hotTrails.update(t, dt, camPos, 0);
      fire.upload(); smoke.upload();
      const s = (ctx.size.h * ctx.size.dpr) / (2 * Math.tan((camera.fov * Math.PI) / 360));
      fire.mat.uniforms.uScale.value = s; smoke.mat.uniforms.uScale.value = s;
      // explosions light the smoke a little
      const fl = Math.min(1, ctx.fx.flash * 0.3);
      smoke.mat.uniforms.uLight.value.setRGB(0.05 + fl * 0.4, 0.055 + fl * 0.3, 0.07 + fl * 0.2);
      smokeTrails.mat.uniforms.uLight.value.setRGB(0.04 + fl * 0.4, 0.045 + fl * 0.3, 0.06 + fl * 0.2);
    },
    stats() { return { fire: fire.n, smoke: smoke.n, smokeTrails: smokeTrails.trails.size, hotTrails: hotTrails.trails.size, debris: debris.length, columns: columns.length }; },
  };
}
