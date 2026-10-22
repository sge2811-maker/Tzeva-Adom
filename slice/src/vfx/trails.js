// Ribbon trails: camera-facing strips built each frame from point histories. All trails of a
// kind share one dynamic mesh (one draw call). Smoke trails widen and drift with the wind;
// the hot core is a short additive ribbon behind the motor.
import * as THREE from 'three';

export class TrailSet {
  constructor(scene, { maxTrails = 220, maxPts = 72, additive = false, order = 6 } = {}) {
    this.maxTrails = maxTrails; this.maxPts = maxPts; this.trails = new Map();
    const maxV = maxTrails * maxPts * 2;
    this.pos = new Float32Array(maxV * 3); this.col = new Float32Array(maxV * 4); this.uv = new Float32Array(maxV * 2);
    const idx = new Uint32Array(maxTrails * (maxPts - 1) * 6);
    this.geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.aUv = new THREE.BufferAttribute(this.uv, 2).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.aPos); this.geo.setAttribute('color', this.aCol); this.geo.setAttribute('uv', this.aUv);
    this.idx = new THREE.BufferAttribute(idx, 1).setUsage(THREE.DynamicDrawUsage);
    this.geo.setIndex(this.idx);
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uLight: { value: new THREE.Color(0.04, 0.045, 0.06) } },
      vertexShader: /* glsl */`
        attribute vec4 color; varying vec4 vC; varying vec2 vUv;
        void main() { vC = color; vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: additive
        ? /* glsl */`varying vec4 vC; varying vec2 vUv; void main() { float e = 1.0 - abs(vUv.y * 2.0 - 1.0); gl_FragColor = vec4(vC.rgb * pow(e, 1.5) * vC.a, 1.0); }`
        : /* glsl */`varying vec4 vC; varying vec2 vUv; uniform vec3 uLight;
          float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float n(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), u.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), u.x), u.y); }
          void main() { float e = 1.0 - abs(vUv.y * 2.0 - 1.0); float puff = 0.6 + 0.4 * n(vec2(vUv.x * 0.08, vUv.y * 3.0));
            gl_FragColor = vec4(vC.rgb + uLight, vC.a * smoothstep(0.0, 0.7, e) * puff); }`,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = order;
    scene.add(this.mesh);
  }
  // style: { life, w0, w1, color:[r,g,b], alpha, minSeg, drift }
  start(id, style) { if (!this.trails.has(id) && this.trails.size < this.maxTrails) this.trails.set(id, { pts: [], style, alive: true, len: 0 }); return this.trails.get(id); }
  push(id, x, y, z, t) {
    const tr = this.trails.get(id); if (!tr || !tr.alive) return;
    const p = tr.pts, last = p[p.length - 1];
    if (last) {
      const d = Math.hypot(x - last.x, y - last.y, z - last.z);
      if (d < tr.style.minSeg) { p.push({ x, y, z, t, s: last.s + d, head: true }); if (p.length > 1 && p[p.length - 2].head) p.splice(p.length - 2, 1); return; }
      for (const q of p) q.head = false;
      p.push({ x, y, z, t, s: last.s + d });
    } else p.push({ x, y, z, t, s: 0 });
    if (p.length > this.maxPts) p.shift();
  }
  end(id) { const tr = this.trails.get(id); if (tr) tr.alive = false; }
  update(t, dt, camPos, wind = 0) {
    let v = 0, q = 0;
    const P = this.pos, C = this.col, U = this.uv, I = this.idx.array;
    for (const [id, tr] of this.trails) {
      const st = tr.style, pts = tr.pts;
      // age out old points
      while (pts.length && t - pts[0].t > st.life) pts.shift();
      if (!pts.length) { if (!tr.alive) this.trails.delete(id); continue; }
      if (pts.length < 2) continue;
      const base = v;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const age = (t - p.t) / st.life;
        if (st.drift) { p.x += wind * dt * st.drift; p.y += dt * st.drift * 1.5; }
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
        let tx = b.x - a.x, ty = b.y - a.y, tz = b.z - a.z;
        const vx = camPos.x - p.x, vy = camPos.y - p.y, vz = camPos.z - p.z;
        let sx = ty * vz - tz * vy, sy = tz * vx - tx * vz, sz = tx * vy - ty * vx;
        const sl = Math.hypot(sx, sy, sz) || 1;
        const w = (st.w0 + (st.w1 - st.w0) * Math.sqrt(Math.min(1, age))) * 0.5;
        sx = sx / sl * w; sy = sy / sl * w; sz = sz / sl * w;
        const headFade = Math.min(1, (pts.length - 1 - i) / 2 + 0.35);
        const alpha = st.alpha * Math.pow(1 - Math.min(1, age), st.fadePow ?? 1.4) * headFade;
        const c = st.color;
        for (let side = -1; side <= 1; side += 2) {
          P[v * 3] = p.x + sx * side; P[v * 3 + 1] = p.y + sy * side; P[v * 3 + 2] = p.z + sz * side;
          C[v * 4] = c[0]; C[v * 4 + 1] = c[1]; C[v * 4 + 2] = c[2]; C[v * 4 + 3] = alpha;
          U[v * 2] = p.s; U[v * 2 + 1] = side > 0 ? 1 : 0;
          v++;
        }
      }
      for (let i = 0; i < pts.length - 1; i++) {
        const a = base + i * 2;
        I[q++] = a; I[q++] = a + 1; I[q++] = a + 2; I[q++] = a + 1; I[q++] = a + 3; I[q++] = a + 2;
      }
      if (v >= this.maxTrails * this.maxPts * 2 - this.maxPts * 2) break;
    }
    this.geo.setDrawRange(0, q);
    for (const a of [this.aPos, this.aCol, this.aUv]) { a.clearUpdateRanges(); a.addUpdateRange(0, v * a.itemSize); a.needsUpdate = true; }
    this.idx.clearUpdateRanges(); this.idx.addUpdateRange(0, q); this.idx.needsUpdate = true;
  }
}
