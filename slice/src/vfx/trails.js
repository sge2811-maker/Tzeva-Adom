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
  attribute vec3 aTan; attribute float aW; attribute vec4 aA; attribute float aCid;
  uniform float uScale; uniform float uMinPx; uniform vec3 uCols[16];
  varying vec4 vA; varying vec3 vC; varying float vSide; varying vec4 vAtm;
  ${lit ? 'varying vec3 vLC;' : ''}
  ${LIGHTS}
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 tv = (modelViewMatrix * vec4(aTan, 0.0)).xyz;
    vec3 vd = normalize(mv.xyz); float tl = length(tv);
    vec3 sd = cross(tv, vd); float sl = length(sd);
    // edge-on (trail pointing at the camera): blend to a stable screen-space side, widen and fade,
    // so the ribbon reads as a soft cross-section instead of folding into flat triangles
    float f = tl > 1e-6 ? abs(dot(tv / tl, vd)) : 1.0;
    float eo = smoothstep(0.82, 0.97, f);
    vec3 fb = normalize(cross(vec3(0.0, 1.0, 0.0), vd) + vec3(1e-4, 0.0, 0.0));
    sd = normalize(mix(sl > 1e-6 ? sd / sl : fb, fb, eo));
    float dz = max(1.0, -mv.z);
    float hw = abs(aW) * (1.0 + eo * 1.6); float px = hw * uScale / dz;
    float side = aW < 0.0 ? -1.0 : 1.0;
    mv.xyz += sd * max(hw, uMinPx * dz / uScale) * side;
    gl_Position = projectionMatrix * mv;
    vA = aA; vA.x *= min(1.0, px / uMinPx) * (1.0 - 0.55 * eo) * smoothstep(hw * 1.5, hw * 6.0, dz);
    vSide = side; vC = uCols[int(aCid + 0.5)];
    vAtm = vfxAtm(position);
    ${lit ? 'vec3 ld; vLC = vfxLight(position, ld);' : ''}
  }`;

const FRAG_SMOKE = /* glsl */`
  varying vec4 vA; varying vec3 vC; varying float vSide; varying vec4 vAtm; varying vec3 vLC;
  uniform vec3 uAmb; uniform vec3 uMoonC; uniform vec3 uFogC;
  ${NOISE}
  void main() {
    float v = vSide;
    float n = fbm3(vec2(vA.z, v * 0.75 + vA.z * 0.37));
    float n2 = vn(vec2(vA.z * 3.1 + 7.0, v * 1.6));
    float n3 = vn(vec2(vA.z * 9.0 - 3.0, v * 3.2 + vA.z));
    float e = abs(v) + (n - 0.5) * (0.7 + 0.75 * vA.y) + (n3 - 0.5) * 0.25;
    float dens = smoothstep(0.85, 0.1, e) * (0.5 + 0.55 * n + 0.25 * n2);
    float shade = 0.75 + 0.25 * v;
    vec3 lit = vC * (uAmb + uMoonC * shade + vLC * 0.85);
    lit += vec3(1.0, 0.42, 0.13) * vA.w * max(0.0, 1.0 - abs(v) * 1.2);
    lit = mix(lit, vAtm.rgb, vAtm.a);
    gl_FragColor = vec4(lit, dens * vA.x);
  }`;

const FRAG_HOT = /* glsl */`
  varying vec4 vA; varying vec3 vC; varying float vSide; varying vec4 vAtm;
  ${NOISE}
  void main() {
    float e = 1.0 - abs(vSide);
    vec3 c = mix(vC, vC * vec3(0.85, 0.36, 0.12), vA.y) * (0.6 + 0.55 * vn(vec2(vA.z * 3.0, 0.5)));
    gl_FragColor = vec4(c * (e * e * 0.7 + pow(e, 6.0) * 1.4) * vA.x * (1.0 - vAtm.a), 1.0);
  }`;

export class TrailSet {
  constructor(scene, { maxTrails = 300, maxPts = 96, additive = false, order = 6, shared, minPx = 1.4, rand = Math.random } = {}) {
    const N = this.N = maxTrails, M = this.M = maxPts, P = N * M;
    this.additive = additive; this.rand = rand;
    const f = () => new Float32Array(P);
    this.X = f(); this.Y = f(); this.Z = f(); this.T = new Float64Array(P); this.S = f(); this.VX = f(); this.VY = f(); this.VZ = f(); this.WK = f(); this.AK = f();
    this.rs = new Int32Array(N); this.count = new Int32Array(N); this.alive = new Uint8Array(N); this.used = new Uint8Array(N);
    this.style = new Array(N).fill(null);
    this.cols = []; for (let i = 0; i < 16; i++) this.cols.push(new THREE.Vector3(1, 1, 1));
    this.ncols = 0;
    this.free = []; for (let i = N - 1; i >= 0; i--) this.free.push(i);
    this.map = new Map(); this.keyOf = new Float64Array(N);
    const maxV = P * 2;
    this.pos = new Float32Array(maxV * 3); this.tan = new Float32Array(maxV * 3); this.w = new Float32Array(maxV);
    this.aa = new Float32Array(maxV * 4); this.cid = new Float32Array(maxV);
    const idx = new Uint32Array(P * 6);
    const geo = this.geo = new THREE.BufferGeometry();
    const mk = (arr, n) => new THREE.BufferAttribute(arr, n).setUsage(THREE.DynamicDrawUsage);
    this.attrs = [mk(this.pos, 3), mk(this.tan, 3), mk(this.w, 1), mk(this.aa, 4), mk(this.cid, 1)];
    ['position', 'aTan', 'aW', 'aA', 'aCid'].forEach((nm, i) => geo.setAttribute(nm, this.attrs[i]));
    this.idx = new THREE.BufferAttribute(idx, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setIndex(this.idx);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { ...shared, uMinPx: { value: minPx }, uCols: { value: this.cols } },
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
    if (style._cid === undefined || style._set !== this) {
      style._set = this; style._cid = Math.min(15, this.ncols++);
      this.cols[style._cid].set(style.col[0], style.col[1], style.col[2]);
    }
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
    const sp = this.S[pc], seg = sp < 300 ? st.minSeg * 0.35 : st.minSeg * (1 + sp / (st.segGrow || 2500));
    if (d < seg) return;
    // commit the head: give it its own turbulence and width variation
    const r = this.rand, tb = st.turb || 0;
    this.VX[h] = (r() - 0.5) * 2 * tb; this.VY[h] = (r() - 0.5) * 2 * tb * 0.6; this.VZ[h] = (r() - 0.5) * 2 * tb;
    const wv = st.wkVar ?? 0.5;
    this.WK[h] = (1 - wv / 2 + wv * r()) * (this.S[h] < 250 && st.boost ? 1 + st.boost * (1 - this.S[h] / 250) : 1) * (st.altGrow ? 1 + Math.max(0, y) / st.altGrow : 1);
    if (st.breakup) this.AK[h] *= 1 - st.breakup + st.breakup * r();
    if (c === M) { s0 = this.rs[sl] = (s0 + 1) % M; c--; }
    const nh = base + (s0 + c) % M;
    this._put(nh, x, y, z, t, this.S[h], ak);
    this.count[sl] = c + 1;
  }
  // minInterval: rebuild at most this often (slow-moving smoke); drift integrates the accumulated dt
  update(t, dt, wind = 0, minInterval = 0) {
    this.acc = (this.acc || 0) + dt;
    if (minInterval > 0 && this.acc < minInterval && dt > 0) return;
    dt = this.acc; this.acc = 0;
    let v = 0, q = 0;
    const P = this.pos, TN = this.tan, W = this.w, A = this.aa, I = this.idx.array;
    const X = this.X, Y = this.Y, Z = this.Z, T = this.T, M = this.M;
    const vdamp = Math.max(0, 1 - 0.35 * dt);
    for (let sl = 0; sl < this.N; sl++) {
      if (!this.used[sl]) continue;
      const st = this.style[sl], base = sl * M;
      let s0 = this.rs[sl], c = this.count[sl];
      const cut = st.life * 0.88;
      while (c > 0 && t - T[base + s0 % M] > cut) { s0 = (s0 + 1) % M; c--; }
      this.rs[sl] = s0; this.count[sl] = c;
      const al = this.alive[sl];
      if (c < 2) { if (!al) { this.used[sl] = 0; this.style[sl] = null; this.free.push(sl); this.size--; } continue; }
      const last = al ? c - 1 : c; // the live head does not drift
      const rise = st.rise || 0, wd = st.turb ? wind : 0;
      const VX = this.VX, VY = this.VY, VZ = this.VZ, WK = this.WK, AK = this.AK, S = this.S, CID = this.cid;
      const life = st.life, w0 = st.w0, dw = st.w1 - st.w0, hf = st.headFade || 0, fp = st.fadePow || 1.4;
      const warmK = st.warm || 0, nl = 1 / (st.noiseLen || 50), cidv = st._cid, al0 = st.alpha;
      const vb = v;
      const sFirst = S[base + s0 % M], sLast = S[base + (s0 + c - 1) % M], tlen = 2 * st.minSeg;
      for (let i = 0; i < c; i++) {
        const j = base + (s0 + i) % M;
        if (i < last && dt > 0) {
          X[j] += (VX[j] + wd) * dt; Y[j] += (VY[j] + rise) * dt; Z[j] += VZ[j] * dt;
          VX[j] *= vdamp; VY[j] *= vdamp; VZ[j] *= vdamp;
        }
        const ja = base + (s0 + (i > 0 ? i - 1 : 0)) % M, jb = base + (s0 + (i < c - 1 ? i + 1 : i)) % M;
        const ageS = t > T[j] ? t - T[j] : 0, age = ageS < life ? ageS / life : 1;
        const hw = 0.5 * (w0 + dw * Math.sqrt(age)) * WK[j] * (0.55 + 0.45 * Math.min(1, (S[j] - sFirst) / tlen));
        const head = hf && ageS < hf ? ageS / hf : 1;
        const om = 1 - age;
        const fade = fp > 1.45 ? om * om : fp > 1.25 ? om * Math.sqrt(om) : om;
        let tp = Math.min(1, (S[j] - sFirst) / tlen);
        if (!al) tp = Math.min(tp, (sLast - S[j]) / tlen);
        tp = tp < 0 ? 0 : tp * tp * (3 - 2 * tp);
        const alpha = al0 * AK[j] * fade * head * tp;
        const warm = warmK && ageS < 2 ? warmK * Math.exp(-ageS / 0.35) : 0;
        const sn = S[j] * nl;
        const tx = X[jb] - X[ja], ty = Y[jb] - Y[ja], tz = Z[jb] - Z[ja];
        const x = X[j], y = Y[j], z = Z[j];
        let v3 = v * 3, v4 = v * 4;
        P[v3] = x; P[v3 + 1] = y; P[v3 + 2] = z; TN[v3] = tx; TN[v3 + 1] = ty; TN[v3 + 2] = tz;
        W[v] = -hw; A[v4] = alpha; A[v4 + 1] = age; A[v4 + 2] = sn; A[v4 + 3] = warm; CID[v] = cidv;
        v++; v3 += 3; v4 += 4;
        P[v3] = x; P[v3 + 1] = y; P[v3 + 2] = z; TN[v3] = tx; TN[v3 + 1] = ty; TN[v3 + 2] = tz;
        W[v] = hw; A[v4] = alpha; A[v4 + 1] = age; A[v4 + 2] = sn; A[v4 + 3] = warm; CID[v] = cidv;
        v++;
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
