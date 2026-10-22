// Civilians: one instanced low-poly figure with leg/arm swing driven by speed, hidden once
// inside a shelter. Reads sim.civ.A (struct of arrays) every frame.
import * as THREE from 'three';
import { CIV } from '../sim/civilians.js';

function personGeometry() {
  const parts = [];
  const add = (w, h, d, x, y, z, part, pivotY) => {
    const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z);
    const n = g.attributes.position.count;
    g.setAttribute('aPart', new THREE.Float32BufferAttribute(new Array(n).fill(part), 1));
    g.setAttribute('aPivot', new THREE.Float32BufferAttribute(new Array(n).fill(pivotY), 1));
    parts.push(g);
  };
  add(0.40, 0.62, 0.24, 0, 1.22, 0, 0, 0);          // torso
  add(0.20, 0.22, 0.22, 0, 1.66, 0, 0, 0);          // head
  add(0.15, 0.86, 0.16, -0.11, 0.45, 0, 1, 0.88);   // legs
  add(0.15, 0.86, 0.16, 0.11, 0.45, 0, 2, 0.88);
  add(0.11, 0.58, 0.12, -0.27, 1.22, 0, 3, 1.5);    // arms
  add(0.11, 0.58, 0.12, 0.27, 1.22, 0, 4, 1.5);
  // merge
  const out = new THREE.BufferGeometry();
  const cat = (name, size) => { const arr = []; for (const g of parts) arr.push(...g.attributes[name].array); return new THREE.Float32BufferAttribute(arr, size); };
  let idx = [], off = 0;
  for (const g of parts) { for (const i of g.index.array) idx.push(i + off); off += g.attributes.position.count; }
  out.setAttribute('position', cat('position', 3)); out.setAttribute('normal', cat('normal', 3));
  out.setAttribute('aPart', cat('aPart', 1)); out.setAttribute('aPivot', cat('aPivot', 1));
  out.setIndex(idx);
  return out;
}

export function createCrowd(ctx) {
  const A = ctx.sim.civ.A, N = A.n;
  const geo = personGeometry();
  const anim = new Float32Array(N * 2);
  geo.setAttribute('aAnim', new THREE.InstancedBufferAttribute(anim, 2));
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aPart; attribute float aPivot; attribute vec2 aAnim;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float side = (aPart == 1.0 || aPart == 4.0) ? 1.0 : -1.0;
        float ang = 0.0;
        if (aPart >= 1.0 && aPart <= 2.0) ang = sin(aAnim.x) * 0.75 * aAnim.y * side;
        if (aPart >= 3.0) ang = sin(aAnim.x) * 0.9 * aAnim.y * side;
        if (aPart >= 1.0) { float y = transformed.y - aPivot; float c = cos(ang), s = sin(ang); transformed.yz = vec2(aPivot + y * c - transformed.z * s, y * s + transformed.z * c); }
        // lean forward when running
        transformed.z += transformed.y * 0.18 * aAnim.y;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.62, 0.32) * 0.22;`);
  };
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  mesh.frustumCulled = false;
  const palette = [0x2a3a52, 0x5a2b2b, 0x3c4a3a, 0xa89f8a, 0x1f1f22, 0x6b5a3e, 0x7a7f86, 0x3d2f4f, 0xc2b8a3, 0x24464a];
  const col = new THREE.Color();
  for (let i = 0; i < N; i++) { col.setHex(palette[(i * 7 + A.group[i] * 3) % palette.length]); mesh.setColorAt(i, col); }
  ctx.scene.add(mesh);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  const phase = new Float32Array(N);
  for (let i = 0; i < N; i++) phase[i] = A.phase[i];
  return {
    mesh,
    update(dt) {
      for (let i = 0; i < N; i++) {
        const st = A.state[i];
        if (st === CIV.SHELTERED) { m4.makeScale(0, 0, 0); mesh.setMatrixAt(i, m4); continue; }
        const sp = A.speed[i];
        phase[i] += dt * sp * 2.4;
        anim[i * 2] = phase[i]; anim[i * 2 + 1] = Math.min(1, sp / 3.2);
        const k = A.kind[i] === 3 ? 0.68 : A.kind[i] === 1 ? 0.95 : 1;
        q.setFromAxisAngle(Y, -A.heading[i] + Math.PI / 2);
        m4.compose(p.set(A.x[i], A.y[i] + 0.36, A.z[i]), q, s.set(k, k, k));
        mesh.setMatrixAt(i, m4);
      }
      mesh.instanceMatrix.needsUpdate = true;
      geo.attributes.aAnim.needsUpdate = true;
    },
  };
}
