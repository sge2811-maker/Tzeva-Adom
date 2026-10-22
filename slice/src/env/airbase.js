// Nevatim Air Base on the plain west of Arad: runways, taxiways, hardened shelters, and its
// lights (runway edge, thresholds, apron floods). Mostly read as a pattern of lights at night.
import * as THREE from 'three';
import { heightAt, GEO } from '../world/geo.js';
import { makeGlowPoints } from './city.js';

export function createAirbase(ctx) {
  const N = GEO.nevatim, h = N.heading;
  const c = Math.cos(h), s = Math.sin(h);
  const toW = (u, v) => [N.x + u * c - v * s, N.z + u * s + v * c]; // u along runway, v across
  const group = new THREE.Group(); group.name = 'nevatim'; ctx.scene.add(group);
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x141517, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const strip = (u0, u1, v, w) => {
    const pts = [];
    const n = Math.ceil(Math.abs(u1 - u0) / 100);
    for (let i = 0; i < n; i++) {
      const a = u0 + (u1 - u0) * i / n, b = u0 + (u1 - u0) * (i + 1) / n;
      const q = [toW(a, v - w / 2), toW(a, v + w / 2), toW(b, v - w / 2), toW(b, v + w / 2)].map(([x, z]) => [x, heightAt(x, z) + 0.5, z]);
      pts.push(...q[0], ...q[2], ...q[1], ...q[1], ...q[2], ...q[3]);
    }
    return pts;
  };
  const P = [
    ...strip(-1600, 1600, -260, 46), ...strip(-1500, 1500, 260, 46), ...strip(-1500, 1500, 0, 22),
    ...strip(-200, 200, -140, 22), ...strip(-200, 200, 140, 22),
  ];
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.computeVertexNormals();
  group.add(new THREE.Mesh(g, asphalt));
  // hardened aircraft shelters
  const has = new THREE.InstancedMesh(new THREE.BoxGeometry(28, 9, 36), new THREE.MeshStandardMaterial({ color: 0x5e5a52, roughness: 0.9 }), 24);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -h), sc = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  for (let i = 0; i < 24; i++) {
    const u = -1300 + (i % 12) * 230, v = i < 12 ? -560 : 560;
    const [x, z] = toW(u, v);
    m4.compose(p.set(x, heightAt(x, z) + 4.5, z), q, sc); has.setMatrixAt(i, m4);
  }
  group.add(has);
  // lights
  const LP = [], LC = [], LS = [];
  const add = (u, v, col, size, lift = 1.2) => { const [x, z] = toW(u, v); LP.push(x, heightAt(x, z) + lift, z); LC.push(...col); LS.push(size); };
  for (const rv of [-260, 260]) {
    for (let u = -1600; u <= 1600; u += 60) { add(u, rv - 24, [3, 2.8, 2.4], 2.2); add(u, rv + 24, [3, 2.8, 2.4], 2.2); }
    for (let v = -22; v <= 22; v += 6) { add(-1605, rv + v, [0.4, 4, 0.6], 2.6); add(1605, rv + v, [4, 0.4, 0.3], 2.6); }
  }
  for (let u = -1500; u <= 1500; u += 50) { add(u, -12, [0.3, 1.2, 4], 1.8); add(u, 12, [0.3, 1.2, 4], 1.8); }
  for (let i = 0; i < 40; i++) add(-1400 + i * 72, (i % 2 ? -1 : 1) * 620, [4.5, 2.4, 0.9], 6, 14); // apron floods
  add(0, -760, [5, 4, 3], 4, 40); add(0, -760, [5, 0.4, 0.3], 3, 46); // tower and its beacon
  group.add(makeGlowPoints(new Float32Array(LP), new Float32Array(LC), new Float32Array(LS), 1.3));
  return { group, toW };
}
