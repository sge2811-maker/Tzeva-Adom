// Battery pads and interceptor batteries (Iron Dome, David's Sling). Generic, original
// low-poly vehicles: no manufacturer markings. Launchers slew toward their last target.
import * as THREE from 'three';
import { heightAt } from '../world/geo.js';
import { makeGlowPoints } from './city.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function createBatteries(ctx) {
  const { scene, sim, layout, bus } = ctx;
  const group = new THREE.Group(); group.name = 'batteries'; scene.add(group);
  const M = {
    olive: new THREE.MeshStandardMaterial({ color: 0x5a5c47, roughness: 0.75, metalness: 0.2 }),
    sand: new THREE.MeshStandardMaterial({ color: 0x9c8c6a, roughness: 0.8, metalness: 0.1 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x2b2e31, roughness: 0.6, metalness: 0.4 }),
    pad: new THREE.MeshStandardMaterial({ color: 0xa39d90, roughness: 0.95 }),
    berm: new THREE.MeshStandardMaterial({ color: 0x8c7c64, roughness: 1.0 }),
    panel: new THREE.MeshStandardMaterial({ color: 0x4d5a4c, roughness: 0.5, metalness: 0.3 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x0b0e12, roughness: 0.2, metalness: 0.6 }),
    tyre: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 }),
    ports: new THREE.MeshStandardMaterial({ color: 0x1a1c1e, roughness: 0.7, metalness: 0.2 }),
    lit: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 1.0, 0.6) }),
  };
  const box = (w, h, d, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); return o; };

  // pads: concrete apron + floodlights, visible before anything is deployed
  const LP = [], LC = [], LS = [];
  const padRoot = new THREE.Group();
  for (const p of layout.pads) {
    const g = new THREE.Group();
    g.position.set(p.x, heightAt(p.x, p.z), p.z);
    const apron = box(90, 0.6, 70, M.pad, 0, 0.1, 0); g.add(apron);
    for (const [w, d, x, z] of [[96, 3, 0, 36.5], [96, 3, 0, -36.5], [3, 70, 46.5, 0], [3, 70, -46.5, 0]]) g.add(box(w, 1.6, d, M.berm, x, 0.4, z));
    padRoot.add(g);
    for (const [dx, dz] of [[-44, -34], [44, -34], [-44, 34], [44, 34]]) { LP.push(p.x + dx, g.position.y + 9, p.z + dz); LC.push(4, 2.4, 1.0); LS.push(3); }
  }
  group.add(makeGlowPoints(new Float32Array(LP), new Float32Array(LC), new Float32Array(LS), 1.4));

  // bake a group's meshes into ONE vertex-coloured mesh (one draw call per moving part)
  const baked = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.25 });
  const bake = (g) => {
    g.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
    const geos = [];
    g.traverse((o) => {
      if (!o.isMesh) return;
      const m4 = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
      const geo = o.geometry.clone().toNonIndexed().applyMatrix4(m4);
      for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
      const c = o.material.color, n = geo.attributes.position.count, arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
      geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      geos.push(geo);
    });
    const mesh = new THREE.Mesh(mergeGeometries(geos), baked);
    mesh.position.copy(g.position); mesh.rotation.copy(g.rotation);
    return mesh;
  };
  group.add(bake(padRoot));
  const cyl = (r, h, m, x, y, z, rx = 0, rz = 0) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 10), m); o.position.set(x, y, z); o.rotation.set(rx, 0, rz); return o; };
  // generic 3-axle truck: chassis, wheels, cab with dark glazing, outriggers
  function truck(mat, len = 7.5) {
    const g = new THREE.Group();
    g.add(box(2.5, 0.5, len, M.dark, 0, 0.95, 0));
    g.add(box(2.4, 1.1, len - 2.6, mat, 0, 1.55, -0.9));
    g.add(box(2.45, 1.7, 2.1, mat, 0, 1.75, len / 2 - 1.0));
    g.add(box(2.3, 0.6, 0.06, M.glass, 0, 2.15, len / 2 + 0.04));
    for (const z of [len / 2 - 1.2, -len / 2 + 2.4, -len / 2 + 1.0]) for (const x of [-1.15, 1.15]) g.add(cyl(0.55, 0.42, M.tyre, x, 0.55, z, 0, Math.PI / 2));
    for (const [x, z] of [[-1.6, -len / 2 + 0.6], [1.6, -len / 2 + 0.6], [-1.6, 1.0], [1.6, 1.0]]) g.add(box(0.3, 0.9, 0.3, M.dark, x, 0.45, z));
    return g;
  }
  function turretMesh(type) {
    const mat = type === 'dome' ? M.sand : M.olive;
    const tg = new THREE.Group();
    tg.add(cyl(0.9, 0.35, M.dark, 0, 0.2, 0));
    const pack = new THREE.Group(); pack.position.set(0, 0.6, 0);
    const pw = type === 'dome' ? 2.2 : 1.9, ph = type === 'dome' ? 2.0 : 1.5, pl = type === 'dome' ? 4.0 : 6.2;
    pack.add(box(pw, ph, pl, mat, 0, ph / 2, 0));
    pack.add(box(pw - 0.2, ph - 0.2, 0.08, M.ports, 0, ph / 2, pl / 2 + 0.03));
    for (const y of [0.15, ph - 0.15]) pack.add(box(pw + 0.12, 0.12, pl + 0.1, M.dark, 0, y, 0));
    pack.rotation.x = type === 'dome' ? -0.9 : -1.35;
    tg.add(pack);
    const t = bake(tg); t.position.set(0, 2.1, -1.4);
    return t;
  }
  function radarHead(size) {
    const hg = new THREE.Group();
    hg.add(cyl(0.25, 1.4, M.dark, 0, 0.7, 0));
    const face = new THREE.Group(); face.position.y = 1.4 + size * 0.5;
    face.add(box(size * 1.6, size, 0.35, M.panel, 0, 0, 0));
    face.add(box(size * 1.5, size * 0.9, 0.05, M.ports, 0, 0, 0.19));
    face.rotation.x = -0.25;
    hg.add(face);
    const head = bake(hg); head.position.y = 2.3;
    return head;
  }
  function trailer() {
    const g = new THREE.Group();
    g.add(box(2.4, 2.4, 6.0, M.olive, 0, 1.9, 0));
    g.add(box(2.4, 0.4, 6.2, M.dark, 0, 0.6, 0));
    for (const x of [-1.1, 1.1]) g.add(cyl(0.45, 0.35, M.tyre, x, 0.45, -1.2, 0, Math.PI / 2));
    return g;
  }
  const models = new Map();
  function build(b) {
    if (b.offstage || models.has(b.id)) return;
    const g = new THREE.Group();
    g.position.set(b.x, heightAt(b.x, b.z) + 0.4, b.z);
    const statics = new THREE.Group();
    const n = b.type === 'dome' ? 3 : 2;
    const launchers = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.5;
      const T = truck(b.type === 'dome' ? M.sand : M.olive);
      T.position.set(Math.cos(a) * 22, 0, Math.sin(a) * 18); T.rotation.y = -a + Math.PI / 2;
      statics.add(T);
      const L = new THREE.Group(); L.position.copy(T.position); L.rotation.copy(T.rotation);
      const turret = turretMesh(b.type); L.add(turret); L.userData.turret = turret;
      g.add(L); launchers.push(L);
    }
    const RT = truck(M.olive, 7); RT.position.set(-8, 0, -20); statics.add(RT);
    const TR = trailer(); TR.position.set(10, 0, -22); TR.rotation.y = 0.3; statics.add(TR);
    g.add(bake(statics));
    const R = new THREE.Group(); R.position.set(-8, 0, -20);
    const head = radarHead(b.type === 'sling' ? 4.2 : 3.4); R.add(head); R.userData.head = head;
    g.add(R);
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
