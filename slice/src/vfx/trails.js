// Ribbon trails. Each trail is a ring buffer of points in shared typed arrays (no per-frame
// allocation); all trails of a set share one dynamic mesh (one draw call). Ribbons are expanded
// camera-facing in the vertex shader with a minimum pixel width (alpha scaled down to match), so a
// smoke trail reads the same at 300 m and at 40 km.
//  - smoke set: committed points drift with wind and per-point turbulence, widen with age, and are
//    shaded as lit smoke (moon + VFX light set) with an fbm-eroded, billowing edge and a warm glow
//    near the motor.
//  - hot set (additive): short white-hot core behind motors/re-entry heads, cooling to orange.
import * as THREE from 'three';
import { NOISE, LIGHTS } from './shaderlib.js';

const VERT = (lit) => /* glsl */`
  attribute vec3 aTan; attribute float aW; attribute vec4 aA; attribute vec3 aCol;
  uniform float uScale; uniform float uMinPx;
  varying vec4 vA; varying vec3 vC; varying float vSide; varying float vFog;
  ${lit ? 'varying vec3 vLC;' : ''}
  ${LIGHTS}
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 tv = (modelViewMatrix * vec4(aTan, 0.0)).xyz;
    vec3 sd = cross(tv, mv.xyz); float sl = length(sd); sd = sl > 1e-6 ? sd / sl : vec3(1.0, 0.0, 0.0);
    float dz = max(1.0, -mv.z);
    float hw = abs(aW); float px = hw * uScale / dz;
    float side = aW < 0.0 ? -1.0 : 1.0;
    mv.xyz += sd * max(hw, uMinPx * dz / uScale) * side;
    gl_Position = projectionMatrix * mv;
    vA = aA; vA.x *= min(1.0, px / uMinPx);
    vSide = side; vC = aCol;
    vFog = vfxFog(dz, position.y);
    ${lit ? 'vec3 ld; vLC = vfxLight(position, ld);' : ''}
  }`;

const FRAG_SMOKE = /* glsl */`
  varying vec4 vA; varying vec3 vC; varying float vSide; varying float vFog; varying vec3 vLC;
  uniform vec3 uAmb; uniform vec3 uMoonC; uniform vec3 uFogC;
  ${NOISE}
  void main() {
    float v = vSide;
    float n = fbm3(vec2(vA.z, v * 0.75 + vA.z * 0.37));
    float n2 = vn(vec2(vA.z * 3.1 + 7.0, v * 1.6));
    float e = abs(v) + (n - 0.5) * (0.45 + 0.75 * vA.y);
    float dens = smoothstep(1.0, 0.12, e) * (0.5 + 0.55 * n + 0.25 * n2);
    float shade = 0.75 + 0.25 * v;
    vec3 lit = vC * (uAmb + uMoonC * shade + vLC * 0.85);
    lit += vec3(1.0, 0.42, 0.13) * vA.w * max(0.0, 1.0 - abs(v) * 1.2);
    lit = mix(lit, uFogC, vFog);
    gl_FragColor = vec4(lit, dens * vA.x);
  }`;

const FRAG_HOT = /* glsl */`
  varying vec4 vA; varying vec3 vC; varying float vSide; varying float vFog;
  void main() {
    float e = 1.0 - abs(vSide);
    vec3 c = mix(vC, vC * vec3(0.85, 0.36, 0.12), vA.y);
    gl_FragColor = vec4(c * (e * e * 0.7 + pow(e, 6.0) * 1.4) * vA.x * (1.0 - vFog * 0.8), 1.0);
  }`;

export class TrailSet {
  constructor(scene, { maxTrails = 300, maxPts = 96, additive = false, order = 6, shared, minPx = 1.4, rand = Math.random } = {}) {
    const N = this.N = maxTrails, M = this.M = maxPts, P = N * M;
    this.additive = additive; this.rand = rand;
    const f = () => new Float32Array(P);
    this.X = f(); this.Y = f(); this.Z = f(); this.T = new Float64Array(P); this.S = f(); this.VX = f(); this.VY = f(); this.VZ = f(); this.WK = f(); this.AK = f();
    this.rs = new Int32Array(N); this.count = new Int32Array(N); this.alive = new Uint8Array(N); this.used = new Uint8Array(N);
    this.style = new Array(N).fill(null);
    this.free = []; for (let i = N - 1; i >= 0; i--) this.free.push(i);
    this.map = new Map(); this.keyOf = new Float64Array(N);
    const maxV = P * 2;
    this.pos = new Float32Array(maxV * 3); this.tan = new Float32Array(maxV * 3); this.w = new Float32Array(maxV);
    this.aa = new Float32Array(maxV * 4); this.col = new Float32Array(maxV * 3);
    const idx = new Uint32Array(P * 6);
    const geo = this.geo = new THREE.BufferGeometry();
    const mk = (arr, n) => new THREE.BufferAttribute(arr, n).setUsage(THREE.DynamicDrawUsage);
    this.attrs = [mk(this.pos, 3), mk(this.tan, 3), mk(this.w, 1), mk(this.aa, 4), mk(this.col, 3)];
    ['position', 'aTan', 'aW', 'aA', 'aCol'].forEach((nm, i) => geo.setAttribute(nm, this.attrs[i]));
    this.idx = new THREE.BufferAttribute(idx, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setIndex(this.idx);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { ...shared, uMinPx: { value: minPx } },
      vertexShader: VERT(!additive), fragmentShader: additive ? FRAG_HOT : FRAG_SMOKE,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = order;
    scene.add(this.mesh);
    this.size = 0;
  }
  // style: { life, w0, w1, col:[r,g,b], alpha, minSeg, turb, rise, warm, noiseLen, fadePow, headFade }
  start(key, style) {
    if (this.map.has(key) || !this.free.length) return -1;
    const sl = this.free.pop();
    this.map.set(key, sl); this.keyOf[sl] = key;
    this.used[sl] = 1; this.alive[sl] = 1; this.rs[sl] = 0; this.count[sl] = 0; this.style[sl] = style;
    this.size++;
    return sl;
  }
  has(key) { return this.map.has(key); }
  end(key) { const sl = this.map.get(key); if (sl !== undefined) { this.alive[sl] = 0; this.map.delete(key); } }
  _put(j, x, y, z, t, s, ak) { this.X[j] = x; this.Y[j] = y; this.Z[j] = z; this.T[j] = t; this.S[j] = s; this.VX[j] = 0; this.VY[j] = 0; this.VZ[j] = 0; this.WK[j] = 1; this.AK[j] = ak; }
  // ak: per-point alpha multiplier (heat, altitude fades)
  push(key, x, y, z, t, ak = 1) {
    const sl = this.map.get(key); if (sl === undefined) return;
    const M = this.M, base = sl * M, st = this.style[sl];
    let c = this.count[sl], s0 = this.rs[sl];
    if (c === 0) {
      this._put(base + s0 % M, x, y, z, t, 0, ak); this._put(base + (s0 + 1) % M, x, y, z, t, 0, ak);
      this.count[sl] = 2; return;
    }
    const h = base + (s0 + c - 1) % M, pc = base + (s0 + c - 2) % M;
    const dx = x - this.X[pc], dy = y - this.Y[pc], dz = z - this.Z[pc];
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    this.X[h] = x; this.Y[h] = y; this.Z[h] = z; this.T[h] = t; this.S[h] = this.S[pc] + d; this.AK[h] = ak;
    const seg = this.S[pc] < 300 ? st.minSeg * 0.35 : st.minSeg;
    if (d < seg) return;
    // commit the head: give it its own turbulence and width variation
    const r = this.rand, tb = st.turb || 0;
    this.VX[h] = (r() - 0.5) * 2 * tb; this.VY[h] = (r() - 0.5) * 2 * tb * 0.6; this.VZ[h] = (r() - 0.5) * 2 * tb;
    this.WK[h] = (0.75 + 0.5 * r()) * (this.S[h] < 250 && st.boost ? 1 + st.boost * (1 - this.S[h] / 250) : 1);
    if (c === M) { s0 = this.rs[sl] = (s0 + 1) % M; c--; }
    const nh = base + (s0 + c) % M;
    this._put(nh, x, y, z, t, this.S[h], ak);
    this.count[sl] = c + 1;
  }
  update(t, dt, wind = 0) {
    let v = 0, q = 0;
    const P = this.pos, TN = this.tan, W = this.w, A = this.aa, C = this.col, I = this.idx.array;
    const X = this.X, Y = this.Y, Z = this.Z, T = this.T, M = this.M;
    const vdamp = Math.max(0, 1 - 0.35 * dt);
    for (let sl = 0; sl < this.N; sl++) {
      if (!this.used[sl]) continue;
      const st = this.style[sl], base = sl * M;
      let s0 = this.rs[sl], c = this.count[sl];
      while (c > 0 && t - T[base + s0 % M] > st.life) { s0 = (s0 + 1) % M; c--; }
      this.rs[sl] = s0; this.count[sl] = c;
      const al = this.alive[sl];
      if (c < 2) { if (!al) { this.used[sl] = 0; this.style[sl] = null; this.free.push(sl); this.size--; } continue; }
      const last = al ? c - 1 : c; // the live head does not drift
      const rise = st.rise || 0, wd = st.turb ? wind : 0;
      const vb = v;
      for (let i = 0; i < c; i++) {
        const j = base + (s0 + i) % M;
        if (i < last && dt > 0) {
          X[j] += (this.VX[j] + wd) * dt; Y[j] += (this.VY[j] + rise) * dt; Z[j] += this.VZ[j] * dt;
          this.VX[j] *= vdamp; this.VY[j] *= vdamp; this.VZ[j] *= vdamp;
        }
        const ja = base + (s0 + (i > 0 ? i - 1 : 0)) % M, jb = base + (s0 + (i < c - 1 ? i + 1 : i)) % M;
        const ageS = Math.max(0, t - T[j]), age = Math.min(1, ageS / st.life);
        const hw = 0.5 * (st.w0 + (st.w1 - st.w0) * Math.sqrt(age)) * this.WK[j];
        const head = st.headFade ? Math.min(1, ageS / st.headFade) : 1;
        const alpha = st.alpha * this.AK[j] * Math.pow(1 - age, st.fadePow || 1.4) * head;
        const warm = st.warm ? st.warm * Math.exp(-ageS / 0.35) : 0;
        const sn = this.S[j] / (st.noiseLen || 50);
        const tx = X[jb] - X[ja], ty = Y[jb] - Y[ja], tz = Z[jb] - Z[ja];
        for (let side = -1; side <= 1; side += 2) {
          const v3 = v * 3, v4 = v * 4;
          P[v3] = X[j]; P[v3 + 1] = Y[j]; P[v3 + 2] = Z[j];
          TN[v3] = tx; TN[v3 + 1] = ty; TN[v3 + 2] = tz;
          W[v] = side * hw;
          A[v4] = alpha; A[v4 + 1] = age; A[v4 + 2] = sn; A[v4 + 3] = warm;
          C[v3] = st.col[0]; C[v3 + 1] = st.col[1]; C[v3 + 2] = st.col[2];
          v++;
        }
      }
      for (let i = 0; i < c - 1; i++) {
        const a = vb + i * 2;
        I[q++] = a; I[q++] = a + 1; I[q++] = a + 2; I[q++] = a + 1; I[q++] = a + 3; I[q++] = a + 2;
      }
    }
    this.geo.setDrawRange(0, q);
    for (let k = 0; k < this.attrs.length; k++) { const a = this.attrs[k]; a.clearUpdateRanges(); a.addUpdateRange(0, v * a.itemSize); a.needsUpdate = true; }
    this.idx.clearUpdateRanges(); this.idx.addUpdateRange(0, q); this.idx.needsUpdate = true;
  }
}
