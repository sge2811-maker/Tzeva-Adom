// Civilians: one instanced low-poly figure (tapered torso, head, hips, limbs) with a gait driven
// by speed: leg/arm swing, bob and forward lean when running, a stoop for elders, smaller
// proportions for children. Per-person clothing (top, trousers), skin tone and build come from a
// hash of the instance id. People shrink into the shelter door over ~0.4 s instead of popping.
import * as THREE from 'three';
import { CIV } from '../sim/civilians.js';

function personGeometry() {
  const parts = [];
  const add = (g, x, y, z, part, pivotY) => {
    g = g.index ? g.toNonIndexed() : g; g.translate(x, y, z);
    const n = g.attributes.position.count;
    g.setAttribute('aPart', new THREE.Float32BufferAttribute(new Array(n).fill(part), 1));
    g.setAttribute('aPivot', new THREE.Float32BufferAttribute(new Array(n).fill(pivotY), 1));
    parts.push(g);
  };
  const limb = (r0, r1, h) => new THREE.CylinderGeometry(r0, r1, h, 6, 1);
  const torso = new THREE.CylinderGeometry(0.2, 0.15, 0.6, 7, 1); torso.scale(1, 1, 0.62);
  add(torso, 0, 1.22, 0, 0, 0);
  const hips = new THREE.CylinderGeometry(0.16, 0.15, 0.18, 7, 1); hips.scale(1, 1, 0.7);
  add(hips, 0, 0.88, 0, 5, 0);
  add(new THREE.IcosahedronGeometry(0.115, 1), 0, 1.66, 0.01, 6, 0);       // head
  add(limb(0.075, 0.05, 0.84), -0.09, 0.44, 0, 1, 0.86);                    // legs
  add(limb(0.075, 0.05, 0.84), 0.09, 0.44, 0, 2, 0.86);
  add(limb(0.05, 0.04, 0.6), -0.245, 1.2, 0, 3, 1.48);                      // arms
  add(limb(0.05, 0.04, 0.6), 0.245, 1.2, 0, 4, 1.48);
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'aPart', 'aPivot']) {
    const size = parts[0].attributes[name].itemSize, arr = [];
    for (const g of parts) arr.push(...g.attributes[name].array);
    out.setAttribute(name, new THREE.Float32BufferAttribute(arr, size));
  }
  return out;
}

export function createCrowd(ctx) {
  const A = ctx.sim.civ.A, N = A.n;
  const geo = personGeometry();
  const anim = new Float32Array(N * 4); // phase, run, kind, seed
  geo.setAttribute('aAnim', new THREE.InstancedBufferAttribute(anim, 4));
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aPart; attribute float aPivot; attribute vec4 aAnim; varying float vPart; varying float vSeed;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vPart = aPart; vSeed = aAnim.w;
        float run = aAnim.y, kind = aAnim.z;
        float side = (aPart == 1.0 || aPart == 4.0) ? 1.0 : -1.0;
        float ang = 0.0;
        if (aPart >= 1.0 && aPart <= 2.0) ang = sin(aAnim.x) * (0.35 + 0.45 * run) * side;
        if (aPart >= 3.0 && aPart <= 4.0) ang = sin(aAnim.x) * (0.3 + 0.7 * run) * side - 0.35 * run; // arms bend forward when running
        if (aPart >= 1.0 && aPart <= 4.0) { float y = transformed.y - aPivot; float c = cos(ang), s = sin(ang); transformed.yz = vec2(aPivot + y * c - transformed.z * s, y * s + transformed.z * c); }
        // build: broader or slimmer shoulders, small height variation
        float b = 0.9 + 0.2 * fract(aAnim.w * 7.31);
        transformed.x *= b;
        // lean forward when running, stoop for elders; a bob at each footfall
        float lean = 0.14 * run + (kind == 2.0 ? 0.12 : 0.0);
        transformed.z += max(transformed.y - 0.85, 0.0) * lean;
        transformed.y += abs(sin(aAnim.x)) * 0.05 * run;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vPart; varying float vSeed;
        vec3 pick4(float h, vec3 a, vec3 b, vec3 c, vec3 d) { return h < 0.25 ? a : (h < 0.5 ? b : (h < 0.75 ? c : d)); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float h1 = fract(vSeed * 13.17), h2 = fract(vSeed * 29.71), h3 = fract(vSeed * 5.93);
        vec3 trousers = pick4(h1, vec3(0.06, 0.08, 0.13), vec3(0.04, 0.04, 0.045), vec3(0.28, 0.25, 0.19), vec3(0.20, 0.21, 0.23));
        vec3 skin = mix(vec3(0.52, 0.36, 0.26), vec3(0.24, 0.15, 0.10), h2);
        vec3 hair = mix(vec3(0.03, 0.025, 0.02), vec3(0.32, 0.26, 0.18), step(0.85, h3));
        if (vPart > 0.5 && vPart < 2.5) diffuseColor.rgb = trousers;
        if (vPart > 4.5 && vPart < 5.5) diffuseColor.rgb = trousers;
        if (vPart > 5.5) diffuseColor.rgb = mix(skin, hair, step(0.0, vNormal.y) * 0.0);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        // street-light key plus a soft rim so small figures separate from the ground at RTS zoom
        float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 2.0);
        totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.62, 0.32) * 0.5 + vec3(1.0, 0.7, 0.45) * rim * 0.06;`);
  };
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  mesh.frustumCulled = false;
  mesh.name = 'crowd';
  const palette = [0x3a5a8a, 0x9a3a32, 0x5c7a52, 0xc8bea6, 0x3a3a40, 0xb08a4e, 0xa8adb4, 0x6d5a8a, 0xe2d8c3, 0x2e7a80, 0xc0603a, 0xeeebe4];
  const col = new THREE.Color();
  const seed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    seed[i] = (Math.sin(i * 91.37 + 3.1) * 43758.5453) % 1;
    seed[i] = Math.abs(seed[i]);
    col.setHex(palette[Math.floor(seed[i] * 977) % palette.length]); mesh.setColorAt(i, col);
  }
  ctx.scene.add(mesh);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  const phase = new Float32Array(N), vis = new Float32Array(N).fill(1);
  for (let i = 0; i < N; i++) phase[i] = A.phase[i];
  return {
    mesh,
    update(dt) {
      for (let i = 0; i < N; i++) {
        const st = A.state[i];
        const target = st === CIV.SHELTERED ? 0 : 1;
        vis[i] += Math.sign(target - vis[i]) * Math.min(Math.abs(target - vis[i]), dt * 2.5);
        if (vis[i] <= 0.001) { m4.makeScale(0, 0, 0); mesh.setMatrixAt(i, m4); continue; }
        const sp = A.speed[i];
        phase[i] += dt * (sp * 2.6 + 0.4);
        const kind = A.kind[i];
        anim[i * 4] = phase[i]; anim[i * 4 + 1] = Math.min(1, Math.max(0, (sp - 1.0) / 2.4)); anim[i * 4 + 2] = kind; anim[i * 4 + 3] = seed[i];
        const k = (kind === 3 ? 0.66 : kind === 1 ? 0.95 : kind === 2 ? 0.96 : 1) * (0.95 + 0.1 * seed[i]);
        const v = vis[i] * vis[i] * (3 - 2 * vis[i]);
        q.setFromAxisAngle(Y, -A.heading[i] + Math.PI / 2);
        m4.compose(p.set(A.x[i], A.y[i] + 0.36, A.z[i]), q, s.set(k * v, k * v, k * v));
        mesh.setMatrixAt(i, m4);
      }
      mesh.instanceMatrix.needsUpdate = true;
      geo.attributes.aAnim.needsUpdate = true;
    },
  };
}
