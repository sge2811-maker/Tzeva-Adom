// Point-sprite particle pools (one draw call each). Sizes are world metres with a minimum pixel
// size so far-away bursts still read; below that size the brightness falls off (energy-preserving)
// instead of drawing fat placeholder dots.
//  - additive pool ("fire"): soft glows/sparks, procedural noise fireballs whose temperature cools
//    white -> orange -> red, star flashes with lens-glint spikes, and shock rings.
//  - alpha pool ("smoke"): smoke and dust puffs with an eroding fbm silhouette, lit by the moon
//    (fake sphere normal), by the VFX light set (flashes, fires, town glow) and by internal fire glow.
// Every sprite gets a depth bias toward the camera so puffs don't slice hard into the ground.
import * as THREE from 'three';
import { NOISE, LIGHTS } from './shaderlib.js';

export const T_GLOW = 0, T_FIREBALL = 1, T_STAR = 2, T_RING = 3;
export const T_SMOKE = 0, T_DUST = 1;

const VERT = (lit) => /* glsl */`
  attribute float aSize; attribute float aAlpha; attribute vec3 aCol; attribute float aSeed; attribute vec3 aAux;
  uniform float uScale; uniform float uMinPx; uniform float uMaxPx;
  varying float vA; varying vec3 vC; varying float vSeed; varying vec3 vAux; varying float vPx; varying vec4 vAtm;
  ${lit ? 'varying vec3 vLC; varying vec3 vLDir;' : ''}
  ${LIGHTS}
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float dz = max(1.0, -mv.z);
    float px = aSize * uScale / dz;
    int ty = int(aAux.x + 0.5);
    // star flashes keep a fixed minimum on-screen size (lens flare), fireballs keep more energy
    float mpx = ${lit ? 'uMinPx' : '(ty == 2 ? 64.0 : uMinPx)'};
    float k = min(1.0, px / mpx);
    vA = aAlpha * ${lit ? 'k' : '(ty == 2 ? 1.0 : ty == 1 ? k : k * k)'};
    vPx = max(px, mpx);
    gl_PointSize = clamp(px, mpx, uMaxPx);
    vec4 cp = projectionMatrix * mv;
    vec4 mv2 = mv; mv2.z += min(aSize * 0.5, dz * 0.5);
    vec4 cp2 = projectionMatrix * mv2;
    cp.z = cp2.z / cp2.w * cp.w;
    gl_Position = cp;
    vC = aCol; vSeed = aSeed; vAux = aAux;
    vAtm = vfxAtm(position);
    ${lit ? 'vec3 ld; vLC = vfxLight(position, ld); vLDir = normalize((viewMatrix * vec4(ld, 0.0)).xyz + vec3(0.0, 0.0, 1e-4));' : ''}
  }`;

const FRAG_FIRE = /* glsl */`
  varying float vA; varying vec3 vC; varying float vSeed; varying vec3 vAux; varying float vPx; varying vec4 vAtm;
  ${NOISE}
  vec3 ramp(float T) {
    T = clamp(T, 0.0, 1.5);
    vec3 c = vec3(0.85, 0.10, 0.015) * smoothstep(0.03, 0.30, T);
    c += vec3(2.3, 0.95, 0.16) * smoothstep(0.22, 0.62, T);
    c += vec3(4.6, 4.1, 3.3) * smoothstep(0.62, 1.08, T);
    return c;
  }
  void main() {
    vec2 uv = gl_PointCoord * 2.0 - 1.0; float r = length(uv); if (r > 1.0) discard;
    int ty = int(vAux.x + 0.5);
    vec3 col;
    if (ty == 1) {
      float ang = vSeed * 6.2831 + vAux.z * (vSeed - 0.5) * 0.9;
      float cs = cos(ang), sn = sin(ang); vec2 q = vec2(cs * uv.x - sn * uv.y, sn * uv.x + cs * uv.y);
      float n = fbm3(q * 1.6 + vSeed * 31.0 + vec2(0.0, vAux.z * 0.8));
      float n2 = vn(q * 4.7 - vSeed * 17.0 - vec2(0.0, vAux.z * 1.6));
      float edge = r + (n - 0.5) * 0.9;
      float dens = smoothstep(1.0, 0.42, edge);
      float T = vAux.y * (1.3 - edge * 0.75) * (0.62 + 0.7 * n2);
      col = ramp(T) * dens * vC;
    } else if (ty == 2) {
      float sh = clamp(vPx * 0.5, 14.0, 90.0);
      float cs = max(60.0, vPx * vPx * 0.004);
      float core = exp(-r * r * cs) * 3.2 + exp(-r * r * cs * 0.25) * 0.22;
      float sp = exp(-abs(uv.y) * sh) * pow(1.0 - abs(uv.x), 3.0) + exp(-abs(uv.x) * sh) * pow(1.0 - abs(uv.y), 3.0);
      vec2 dg = vec2(uv.x + uv.y, uv.x - uv.y) * 0.7071;
      sp += 0.3 * (exp(-abs(dg.y) * sh * 1.3) * pow(max(0.0, 1.0 - abs(dg.x) * 1.4), 3.0) + exp(-abs(dg.x) * sh * 1.3) * pow(max(0.0, 1.0 - abs(dg.y) * 1.4), 3.0));
      col = vC * (core + sp * vAux.y);
    } else if (ty == 3) {
      float n = vn(uv * 5.0 + vSeed * 9.0);
      col = vC * exp(-pow((r - 0.8) / 0.075, 2.0)) * (0.5 + 0.7 * n);
    } else {
      col = vC * (exp(-r * r * 7.0) * 0.8 + pow(1.0 - r, 2.5) * 0.3);
    }
    gl_FragColor = vec4(col * vA * (1.0 - vAtm.a) * smoothstep(1.0, 0.65, r), 1.0);
  }`;

const FRAG_SMOKE = /* glsl */`
  varying float vA; varying vec3 vC; varying float vSeed; varying vec3 vAux; varying float vPx; varying vec4 vAtm;
  varying vec3 vLC; varying vec3 vLDir;
  uniform vec3 uAmb; uniform vec3 uMoonC; uniform vec3 uMoonV; uniform vec3 uFogC;
  ${NOISE}
  void main() {
    vec2 uv = gl_PointCoord * 2.0 - 1.0; float r = length(uv); if (r > 1.0) discard;
    float ang = vSeed * 6.2831 + vAux.z * (vSeed - 0.5) * 0.18;
    float cs = cos(ang), sn = sin(ang); vec2 q = vec2(cs * uv.x - sn * uv.y, sn * uv.x + cs * uv.y);
    float n = fbm3(q * 1.5 + vSeed * 23.0 + vec2(vAux.z * 0.04, -vAux.z * 0.06));
    float n2 = vn(q * 4.2 - vSeed * 11.0 + vec2(0.0, vAux.z * 0.1));
    float edge = r + (n - 0.5) * 1.05 + (n2 - 0.5) * 0.25;
    float dens = smoothstep(1.0, 0.15, edge) * (0.45 + 0.75 * n) * (0.7 + 0.5 * n2);
    vec3 N = normalize(vec3(uv.x, -uv.y, sqrt(max(0.0, 1.0 - r * r)) + 0.25) + vec3(n - 0.5) * 0.9);
    float moon = 0.3 + 0.7 * max(dot(N, uMoonV), 0.0);
    float lw = 0.25 + 0.75 * max(dot(N, vLDir), 0.0);
    vec3 lit = vC * (uAmb + uMoonC * moon + vLC * lw);
    lit += vec3(1.0, 0.40, 0.11) * vAux.y * max(0.0, 1.0 - edge) * (0.5 + n);
    lit = mix(lit, vAtm.rgb, vAtm.a);
    gl_FragColor = vec4(lit, dens * vA);
  }`;

export class Pool {
  // shared: uniform objects from shaderlib.createShared()
  constructor(scene, cap, additive, minPx, order, shared) {
    this.cap = cap; this.n = 0; this.additive = additive;
    const f = (k) => new Float32Array(cap * k);
    this.p = f(3); this.v = f(3); this.c = f(3); this.c0 = f(3);
    this.s = f(1); this.s0 = f(1); this.s1 = f(1); this.a = f(1); this.a0 = f(1);
    this.life = f(1); this.max = f(1); this.g = f(1); this.drag = f(1); this.cool = f(1); this.seed = f(1);
    this.aux = f(3); this.h0 = f(1); this.grow = new Uint8Array(cap);
    const geo = new THREE.BufferGeometry();
    const mk = (arr, n) => new THREE.BufferAttribute(arr, n).setUsage(THREE.DynamicDrawUsage);
    this.attrs = [mk(this.p, 3), mk(this.c, 3), mk(this.s, 1), mk(this.a, 1), mk(this.seed, 1), mk(this.aux, 3)];
    ['position', 'aCol', 'aSize', 'aAlpha', 'aSeed', 'aAux'].forEach((nm, i) => geo.setAttribute(nm, this.attrs[i]));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { ...shared, uMinPx: { value: minPx }, uMaxPx: { value: 1024 } },
      vertexShader: VERT(!additive),
      fragmentShader: additive ? FRAG_FIRE : FRAG_SMOKE,
    });
    this.mat.userData.particlePool = true;
    this.pts = new THREE.Points(geo, this.mat); this.pts.frustumCulled = false; this.pts.renderOrder = order;
    scene.add(this.pts);
    this.rand = Math.random;
  }
  // life < 0: lives exactly one frame (glows that follow a moving object).
  // type: T_* ; h0: initial heat (fireball) / spike strength (star) / internal warmth (smoke);
  // cool: colour cooling (glow), heat decay (fireball) or warmth decay (smoke) rate;
  // delay: seconds before the particle appears; grow: 1 = fast ease-out expansion.
  add(x, y, z, vx, vy, vz, r, g, b, s0, s1, a0, life, grav = 0, drag = 0, cool = 0, type = 0, h0 = 0, delay = 0, grow = 0) {
    if (this.n >= this.cap) return -1;
    const i = this.n++, i3 = i * 3;
    this.p[i3] = x; this.p[i3 + 1] = y; this.p[i3 + 2] = z; this.v[i3] = vx; this.v[i3 + 1] = vy; this.v[i3 + 2] = vz;
    this.c[i3] = this.c0[i3] = r; this.c[i3 + 1] = this.c0[i3 + 1] = g; this.c[i3 + 2] = this.c0[i3 + 2] = b;
    this.s0[i] = s0; this.s1[i] = s1; this.s[i] = s0; this.a0[i] = a0; this.a[i] = life < 0 ? a0 : 0;
    this.life[i] = life < 0 ? 0 : -delay; this.max[i] = life; this.g[i] = grav; this.drag[i] = drag; this.cool[i] = cool;
    this.aux[i3] = type; this.aux[i3 + 1] = h0; this.aux[i3 + 2] = 0; this.h0[i] = h0; this.grow[i] = grow;
    this.seed[i] = this.rand();
    return i;
  }
  kill(i) {
    const j = --this.n; if (i === j) return;
    const i3 = i * 3, j3 = j * 3;
    for (let k = 0; k < 3; k++) {
      this.p[i3 + k] = this.p[j3 + k]; this.v[i3 + k] = this.v[j3 + k]; this.c[i3 + k] = this.c[j3 + k];
      this.c0[i3 + k] = this.c0[j3 + k]; this.aux[i3 + k] = this.aux[j3 + k];
    }
    this.s0[i] = this.s0[j]; this.s1[i] = this.s1[j]; this.s[i] = this.s[j]; this.a0[i] = this.a0[j]; this.a[i] = this.a[j];
    this.life[i] = this.life[j]; this.max[i] = this.max[j]; this.g[i] = this.g[j]; this.drag[i] = this.drag[j]; this.cool[i] = this.cool[j];
    this.seed[i] = this.seed[j]; this.h0[i] = this.h0[j]; this.grow[i] = this.grow[j];
  }
  purgeFrame() { for (let i = this.n - 1; i >= 0; i--) if (this.max[i] < 0) this.kill(i); }
  // wind: m/s toward +x, stronger with altitude (smoke columns lean)
  update(dt, wind = 0) {
    const relax = Math.min(1, dt * 0.35);
    for (let i = this.n - 1; i >= 0; i--) {
      const M = this.max[i];
      if (M < 0) continue;
      const L = (this.life[i] += dt);
      if (L >= M) { this.kill(i); continue; }
      const i3 = i * 3;
      if (L < 0) { this.a[i] = 0; continue; }
      const k = L / M, dr = Math.max(0, 1 - this.drag[i] * dt);
      const y = this.p[i3 + 1];
      const ws = wind * (1 + Math.max(0, y + 150) / 700);
      let vx = this.v[i3] * dr, vy = this.v[i3 + 1] * dr - this.g[i] * dt, vz = this.v[i3 + 2] * dr;
      vx += (ws - vx) * relax;
      this.v[i3] = vx; this.v[i3 + 1] = vy; this.v[i3 + 2] = vz;
      this.p[i3] += vx * dt; this.p[i3 + 1] = y + vy * dt; this.p[i3 + 2] += vz * dt;
      const e = this.grow[i] ? 1 - (1 - k) * (1 - k) * (1 - k) : Math.sqrt(k);
      this.s[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * e;
      this.a[i] = this.a0[i] * Math.min(1, k * 14) * (1 - k) * (1 - k * 0.3);
      const ty = this.aux[i3], cool = this.cool[i];
      this.aux[i3 + 2] = L;
      if (cool > 0 && (this.h0[i] > 0 || this.additive) && L * cool < 7) {
        const cc = Math.exp(-L * cool);
        if (this.additive && ty === T_GLOW) { this.c[i3] = this.c0[i3] * cc; this.c[i3 + 1] = this.c0[i3 + 1] * cc * cc; this.c[i3 + 2] = this.c0[i3 + 2] * cc * cc * cc; }
        else this.aux[i3 + 1] = this.h0[i] * cc;
      }
    }
  }
  upload() {
    this.pts.geometry.setDrawRange(0, this.n);
    for (let k = 0; k < this.attrs.length; k++) { const a = this.attrs[k]; a.clearUpdateRanges(); a.addUpdateRange(0, this.n * a.itemSize); a.needsUpdate = true; }
  }
}
