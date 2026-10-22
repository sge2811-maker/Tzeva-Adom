// Battery pads and interceptor batteries (Iron Dome, David's Sling). Generic, original
// low-poly vehicles: no manufacturer markings. Launchers slew toward their last target.
import * as THREE from 'three';
import { heightAt } from '../world/geo.js';
import { makeGlowPoints } from './city.js';

export function createBatteries(ctx) {
  const { scene, sim, layout, bus } = ctx;
  const group = new THREE.Group(); group.name = 'batteries'; scene.add(group);
  const M = {
    olive: new THREE.MeshStandardMaterial({ color: 0x5a5c47, roughness: 0.75, metalness: 0.2 }),
    sand: new THREE.MeshStandardMaterial({ color: 0x9c8c6a, roughness: 0.8, metalness: 0.1 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x2b2e31, roughness: 0.6, metalness: 0.4 }),
    pad: new THREE.MeshStandardMaterial({ color: 0x4a4740, roughness: 0.95 }),
    panel: new THREE.MeshStandardMaterial({ color: 0x4d5a4c, roughness: 0.5, metalness: 0.3 }),
  };
  const box = (w, h, d, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); return o; };

  // pads: concrete apron + floodlights, visible before anything is deployed
  const LP = [], LC = [], LS = [];
  for (const p of layout.pads) {
    const g = new THREE.Group();
    g.position.set(p.x, heightAt(p.x, p.z), p.z);
    const apron = box(90, 0.6, 70, M.pad, 0, 0.1, 0); g.add(apron);
    group.add(g);
    for (const [dx, dz] of [[-44, -34], [44, -34], [-44, 34], [44, 34]]) { LP.push(p.x + dx, g.position.y + 9, p.z + dz); LC.push(4, 2.4, 1.0); LS.push(3); }
  }
  group.add(makeGlowPoints(new Float32Array(LP), new Float32Array(LC), new Float32Array(LS), 1.4));

  function launcher(type) {
    const g = new THREE.Group();
    const mat = type === 'dome' ? M.sand : M.olive;
    g.add(box(2.5, 1.2, 7.5, mat, 0, 1.0, 0));        // truck/trailer bed
    g.add(box(2.4, 1.6, 2.2, M.dark, 0, 1.4, 4.4));   // cab
    const turret = new THREE.Group(); turret.position.set(0, 1.7, -0.8);
    const pack = type === 'dome' ? box(2.2, 2.0, 4.2, mat, 0, 1.0, 0) : box(1.8, 1.6, 6.0, mat, 0, 0.8, 0);
    pack.rotation.x = type === 'dome' ? -0.9 : -1.35;
    turret.add(pack); g.add(turret);
    g.userData.turret = turret;
    return g;
  }
  function radar(size) {
    const g = new THREE.Group();
    g.add(box(2.6, 1.3, 6.5, M.olive, 0, 1.0, 0));
    const head = new THREE.Group(); head.position.y = 2.2;
    const p = box(size * 1.6, size, 0.3, M.panel, 0, size * 0.5, 0); p.rotation.x = -0.25; head.add(p);
    g.add(head); g.userData.head = head;
    return g;
  }
  const models = new Map();
  function build(b) {
    if (b.offstage || models.has(b.id)) return;
    const g = new THREE.Group();
    g.position.set(b.x, heightAt(b.x, b.z) + 0.4, b.z);
    const n = b.type === 'dome' ? 3 : 2;
    const launchers = [];
    for (let i = 0; i < n; i++) {
      const L = launcher(b.type);
      const a = (i / n) * Math.PI * 2 + 0.5;
      L.position.set(Math.cos(a) * 22, 0, Math.sin(a) * 18);
      L.rotation.y = -a + Math.PI / 2;
      g.add(L); launchers.push(L);
    }
    const R = radar(b.type === 'sling' ? 4.2 : 3.4); R.position.set(-8, 0, -20); g.add(R);
    group.add(g);
    models.set(b.id, { g, launchers, radar: R, b });
  }
  for (const b of sim.batteries) build(b);
  bus.on('battery:built', ({ id }) => { const b = sim.batteries.find((q) => q.id === id); if (b) build(b); });

  return {
    group, models,
    update(dt) {
      for (const m of models.values()) {
        if (m.radar.userData.head) m.radar.userData.head.rotation.y += dt * 1.1;
        // launchers slew toward the last engagement bearing
        const want = -m.b.yaw + Math.PI / 2;
        for (const L of m.launchers) {
          const tr = L.userData.turret;
          let d = want - L.rotation.y - tr.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
          tr.rotation.y += d * Math.min(1, dt * 1.5);
        }
      }
    },
  };
}
