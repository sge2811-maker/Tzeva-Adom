// Sprite particle pools (one draw call each). Sizes are world metres with a minimum pixel size,
// so far-away bursts still read. `fire` is additive (HDR colours > 1 bloom), `smoke` is alpha.
import * as THREE from 'three';

function spriteMaterial(additive, minPx) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: { uScale: { value: 800 }, uMinPx: { value: minPx }, uLight: { value: new THREE.Color(0.05, 0.055, 0.07) } },
    vertexShader: /* glsl */`
      attribute float aSize; attribute float aAlpha; attribute vec3 aCol; attribute float aSeed;
      varying float vA; varying vec3 vC; varying float vSeed; uniform float uScale; uniform float uMinPx;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
        float px = aSize * uScale / max(1.0, -mv.z); vA = aAlpha * min(1.0, px / uMinPx + 0.2); gl_PointSize = max(uMinPx, px); vC = aCol; vSeed = aSeed; }`,
    fragmentShader: additive
      ? /* glsl */`varying float vA; varying vec3 vC; varying float vSeed;
        void main() { vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0; if (r > 1.0) discard; float f = pow(1.0 - r, 1.7); gl_FragColor = vec4(vC * f * vA, 1.0); }`
      : /* glsl */`varying float vA; varying vec3 vC; varying float vSeed; uniform vec3 uLight;
        float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), u.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), u.x), u.y); }
        void main() { vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0; if (r > 1.0) discard;
          float puff = n(gl_PointCoord * 4.0 + vSeed * 13.0) * 0.6 + n(gl_PointCoord * 9.0 - vSeed * 7.0) * 0.4;
          float a = smoothstep(1.0, 0.1, r) * (0.55 + 0.45 * puff) * vA;
          gl_FragColor = vec4(vC + uLight * 0.6, a); }`,
  });
}

export class Pool {
  constructor(scene, cap, additive, minPx, order) {
    this.cap = cap; this.n = 0;
    this.p = new Float32Array(cap * 3); this.c = new Float32Array(cap * 3); this.s = new Float32Array(cap); this.a = new Float32Array(cap); this.seed = new Float32Array(cap);
    this.v = new Float32Array(cap * 3); this.life = new Float32Array(cap); this.max = new Float32Array(cap);
    this.s0 = new Float32Array(cap); this.s1 = new Float32Array(cap); this.a0 = new Float32Array(cap); this.g = new Float32Array(cap); this.drag = new Float32Array(cap);
    this.c0 = new Float32Array(cap * 3); this.cool = new Float32Array(cap);
    const geo = new THREE.BufferGeometry();
    const mk = (arr, n) => new THREE.BufferAttribute(arr, n).setUsage(THREE.DynamicDrawUsage);
    this.attr = { p: mk(this.p, 3), c: mk(this.c, 3), s: mk(this.s, 1), a: mk(this.a, 1), seed: mk(this.seed, 1) };
    geo.setAttribute('position', this.attr.p); geo.setAttribute('aCol', this.attr.c); geo.setAttribute('aSize', this.attr.s); geo.setAttribute('aAlpha', this.attr.a); geo.setAttribute('aSeed', this.attr.seed);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
    this.mat = spriteMaterial(additive, minPx);
    this.mat.userData.particlePool = true;
    this.pts = new THREE.Points(geo, this.mat); this.pts.frustumCulled = false; this.pts.renderOrder = order;
    scene.add(this.pts);
  }
  // life < 0: lives exactly one frame (glows that follow a moving object)
  add(x, y, z, vx, vy, vz, r, g, b, s0, s1, a0, life, grav = 0, drag = 0, cool = 0) {
    if (this.n >= this.cap) return -1;
    const i = this.n++, i3 = i * 3;
    this.p[i3] = x; this.p[i3 + 1] = y; this.p[i3 + 2] = z; this.v[i3] = vx; this.v[i3 + 1] = vy; this.v[i3 + 2] = vz;
    this.c[i3] = this.c0[i3] = r; this.c[i3 + 1] = this.c0[i3 + 1] = g; this.c[i3 + 2] = this.c0[i3 + 2] = b;
    this.s0[i] = s0; this.s1[i] = s1; this.s[i] = s0; this.a0[i] = a0; this.a[i] = a0; this.life[i] = 0; this.max[i] = life; this.g[i] = grav; this.drag[i] = drag; this.cool[i] = cool;
    this.seed[i] = this.rand ? this.rand() : Math.random();
    return i;
  }
  kill(i) {
    const j = --this.n; if (i === j) return;
    const i3 = i * 3, j3 = j * 3;
    for (let k = 0; k < 3; k++) { this.p[i3 + k] = this.p[j3 + k]; this.v[i3 + k] = this.v[j3 + k]; this.c[i3 + k] = this.c[j3 + k]; this.c0[i3 + k] = this.c0[j3 + k]; }
    this.s0[i] = this.s0[j]; this.s1[i] = this.s1[j]; this.s[i] = this.s[j]; this.a0[i] = this.a0[j]; this.a[i] = this.a[j];
    this.life[i] = this.life[j]; this.max[i] = this.max[j]; this.g[i] = this.g[j]; this.drag[i] = this.drag[j]; this.cool[i] = this.cool[j]; this.seed[i] = this.seed[j];
  }
  purgeFrame() { for (let i = this.n - 1; i >= 0; i--) if (this.max[i] < 0) this.kill(i); }
  update(dt, wind = 0) {
    for (let i = this.n - 1; i >= 0; i--) {
      if (this.max[i] < 0) continue;
      const L = (this.life[i] += dt), M = this.max[i];
      if (L >= M) { this.kill(i); continue; }
      const i3 = i * 3, k = L / M, dr = Math.max(0, 1 - this.drag[i] * dt);
      this.v[i3] = this.v[i3] * dr + wind * dt * 0.3; this.v[i3 + 1] = this.v[i3 + 1] * dr - this.g[i] * dt; this.v[i3 + 2] *= dr;
      this.p[i3] += this.v[i3] * dt; this.p[i3 + 1] += this.v[i3 + 1] * dt; this.p[i3 + 2] += this.v[i3 + 2] * dt;
      this.s[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * Math.sqrt(k);
      this.a[i] = this.a0[i] * Math.min(1, k * 12) * (1 - k) * (1 - k * 0.2);
      if (this.cool[i] > 0) { const c = Math.exp(-L * this.cool[i]); this.c[i3] = this.c0[i3] * c; this.c[i3 + 1] = this.c0[i3 + 1] * c * c; this.c[i3 + 2] = this.c0[i3 + 2] * c * c * c; }
    }
  }
  upload() {
    this.pts.geometry.setDrawRange(0, this.n);
    for (const a of Object.values(this.attr)) { a.clearUpdateRanges(); a.addUpdateRange(0, this.n * a.itemSize); a.needsUpdate = true; }
  }
}
