// Terrain: one warped grid (dense around Arad, ~1.2 degree angular resolution further out),
// heights from world/geo.js. Warm desert albedo under cool moonlight: sand, gravel fans, flint
// reg, banded rock on steep ground and wadi beds that follow real drainage (D8 flow accumulation
// on the grid, not noise isolines). Plus the Dead Sea (shoreline carved by the height field) and
// three far Moab ridge silhouettes that layer through the haze.
import * as THREE from 'three';
import { heightAt, GEO } from '../world/geo.js';
import { fbm, ridged, smoothstep } from '../core/util.js';
import { ATM_GLSL, ATM } from './atmosphere.js';
import { mergeGeometries as mergeG } from 'three/addons/utils/BufferGeometryUtils.js';

// rotated gradient noise (no axis-aligned value-noise cells); lattice hashed mod 512 for fp32
export const GN_GLSL = /* glsl */`
vec2 gH(vec2 i) { i = mod(i, 512.0); vec2 p = vec2(dot(i, vec2(127.1, 311.7)), dot(i, vec2(269.5, 183.3))); return -1.0 + 2.0 * fract(sin(p) * 43758.5453); }
float gN(vec2 p) {
  p = mat2(0.8, -0.6, 0.6, 0.8) * p;
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(gH(i), f), b = dot(gH(i + vec2(1, 0)), f - vec2(1, 0)), c = dot(gH(i + vec2(0, 1)), f - vec2(0, 1)), d = dot(gH(i + vec2(1, 1)), f - vec2(1, 1));
  return 0.5 + 0.7 * mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}`;

export function createTerrain(ctx) {
  const N = 520, L = 62000, S = 5.0, NV = (N + 1) * (N + 1);
  const warp = (u) => Math.sign(u) * L * (Math.exp(S * Math.abs(u)) - 1) / (Math.exp(S) - 1);
  const xs = new Float64Array(N + 1); for (let i = 0; i <= N; i++) xs[i] = warp(i / N * 2 - 1);
  const pos = new Float32Array(NV * 3), col = new Float32Array(NV * 3), glow = new Float32Array(NV);
  const H = new Float32Array(NV);
  let k = 0;
  for (let j = 0; j <= N; j++) {
    const z = xs[j];
    for (let i = 0; i <= N; i++, k++) {
      const x = xs[i];
      const h = heightAt(x, z);
      H[k] = h; pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
      // warm ochre sand that keeps its hue under the moon; greyer rock on the escarpment and Moab
      const n = fbm(x * 0.002 + 3, z * 0.002, 3), n2 = fbm(x * 0.0003, z * 0.0003 + 7, 3);
      let r = 0.33 + 0.07 * n + 0.03 * n2, g = 0.26 + 0.05 * n + 0.02 * n2, b = 0.18 + 0.03 * n;
      const urb = Math.exp(-((x / 900) ** 2 + (z / 780) ** 2) * 1.6);
      r = r * (1 - urb * 0.45); g = g * (1 - urb * 0.45); b = b * (1 - urb * 0.42); // town lots darker: the street pools carry the light
      const rock = smoothstep(2600, 6000, x) * (1 - smoothstep(15000, 17000, x)) + smoothstep(16500, 19000, x) * 0.6;
      r = r * (1 - rock * 0.3) + 0.27 * rock * 0.3 * (0.8 + 0.4 * n2); g = g * (1 - rock * 0.3) + 0.23 * rock * 0.3; b = b * (1 - rock * 0.3) + 0.18 * rock * 0.3;
      if (h < -390 && x > 7000) { r = 0.46; g = 0.44; b = 0.40; } // salt crust at the shore
      col[k * 3] = r; col[k * 3 + 1] = g; col[k * 3 + 2] = b;
      const dt = Math.hypot(x / GEO.town.rx, z / GEO.town.rz), dn = Math.hypot(x - GEO.nevatim.x, z - GEO.nevatim.z) / GEO.nevatim.r;
      glow[k] = Math.exp(-dt * dt * 0.9) * 1.0 + Math.exp(-dn * dn * 1.2) * 0.35;
    }
  }
  // ---- drainage: D8 flow accumulation (catchment area) and concavity on the grid
  const acc = new Float32Array(NV), area = new Float32Array(NV), curv = new Float32Array(NV), wadi = new Float32Array(NV);
  const dx = (i) => (xs[Math.min(N, i + 1)] - xs[Math.max(0, i - 1)]) / (i === 0 || i === N ? 1 : 2);
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) { const v = j * (N + 1) + i; area[v] = dx(i) * dx(j); acc[v] = area[v]; }
  const order = new Uint32Array(NV); for (let v = 0; v < NV; v++) order[v] = v;
  order.sort((a, b) => H[b] - H[a]);
  for (let o = 0; o < NV; o++) {
    const v = order[o], i = v % (N + 1), j = (v / (N + 1)) | 0;
    // multiple-flow-direction: share the catchment among all lower neighbours by slope^1.6, so
    // channels converge along valleys instead of running along grid lines (as D8 does)
    let tot = 0; const ws = [];
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii > N || jj > N) continue;
      const u = jj * (N + 1) + ii, d = Math.hypot(xs[ii] - xs[i], xs[jj] - xs[j]);
      const sl = (H[v] - H[u]) / d; if (sl > 0) { const w = Math.pow(sl, 1.6) * (di && dj ? 0.7071 : 1); ws.push(u, w); tot += w; }
    }
    for (let m = 0; m < ws.length; m += 2) acc[ws[m]] += acc[v] * ws[m + 1] / tot;
  }
  const lnA = Math.log(2.5e4), lnB = Math.log(6e5);
  for (let j = 1; j < N; j++) for (let i = 1; i < N; i++) {
    const v = j * (N + 1) + i;
    const la = Math.log(acc[v]);
    wadi[v] = smoothstep(lnA, lnB, la) * smoothstep(4, 25, acc[v] / area[v]);
    const dE = xs[i + 1] - xs[i], dW = xs[i] - xs[i - 1], dS = xs[j + 1] - xs[j], dN = xs[j] - xs[j - 1];
    const lx = ((H[v + 1] - H[v]) / dE - (H[v] - H[v - 1]) / dW) * 2 / (dE + dW);
    const lz = ((H[v + N + 1] - H[v]) / dS - (H[v] - H[v - N - 1]) / dN) * 2 / (dS + dN);
    curv[v] = Math.max(-1, Math.min(1, (lx + lz) * 250));
  }
  { const tmp = wadi.slice(); for (let j = 1; j < N; j++) for (let i = 1; i < N; i++) { const v = j * (N + 1) + i; wadi[v] = (tmp[v] * 4 + tmp[v - 1] + tmp[v + 1] + tmp[v - N - 1] + tmp[v + N + 1]) / 8; } }
  // carve visible wadi channels into the drawn surface (visual only: the sim keeps geo.js heights;
  // channels stay away from the town, the airbase, the battery pads and the rift floor)
  {
    const wb = wadi.slice();
    for (let pass = 0; pass < 2; pass++) { const t = wb.slice(); for (let j = 1; j < N; j++) for (let i = 1; i < N; i++) { const v = j * (N + 1) + i; wb[v] = Math.max(t[v], (t[v - 1] + t[v + 1] + t[v - N - 1] + t[v + N + 1]) * 0.22); } }
    const pads = ctx.layout.pads;
    for (let j = 1; j < N; j++) for (let i = 1; i < N; i++) {
      const v = j * (N + 1) + i, x = xs[i], z = xs[j];
      if (wb[v] < 0.05 || glow[v] > 0.12 || H[v] < -380) continue;
      let pk = 1; for (const p of pads) pk = Math.min(pk, smoothstep(150, 350, Math.hypot(x - p.x, z - p.z)));
      const dep = 14 * Math.pow(wb[v], 0.8) * pk * (1 - smoothstep(0.04, 0.12, glow[v]));
      H[v] -= dep; pos[v * 3 + 1] = H[v];
    }
  }
  const idx = new Uint32Array(N * N * 6);
  let q = 0;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
    idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('glow', new THREE.BufferAttribute(glow, 1));
  const land = new Float32Array(NV * 2); for (let v = 0; v < NV; v++) { land[v * 2] = wadi[v]; land[v * 2 + 1] = curv[v]; }
  geo.setAttribute('aLand', new THREE.BufferAttribute(land, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  // height of the rendered (triangulated) terrain surface, so roads drape on what is drawn
  const E = Math.exp(S) - 1;
  const inv = (x) => { const u = Math.sign(x) * Math.log(1 + Math.abs(x) * E / L) / S; return Math.max(0, Math.min(N - 1e-6, (u + 1) / 2 * N)); };
  ctx.envGround = (x, z) => {
    const fi = inv(x), fj = inv(z), i = Math.floor(fi), j = Math.floor(fj);
    const fx = (x - xs[i]) / (xs[i + 1] - xs[i]), fz = (z - xs[j]) / (xs[j + 1] - xs[j]);
    const a = j * (N + 1) + i, ha = H[a], hb = H[a + 1], hc = H[a + N + 1], hd = H[a + N + 2];
    return fx + fz <= 1 ? ha + (hb - ha) * fx + (hc - ha) * fz : hd + (hc - hd) * (1 - fx) + (hb - hd) * (1 - fz);
  };
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97, metalness: 0 });
  const flashU = { uFlashSky: ctx.envFlash || { value: new THREE.Color(0, 0, 0) } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, flashU);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float glow; attribute vec2 aLand; varying float vGlow; varying vec3 vWP; varying vec3 vWN; varying vec2 vLand;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = glow; vLand = aLand; vWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vGlow; varying vec3 vWP; varying vec3 vWN; varying vec2 vLand; uniform vec3 uFlashSky;
        ${GN_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float dcam = length(vWP - cameraPosition);
        float slope = 1.0 - clamp(normalize(vWN).y, 0.0, 1.0);
        float near = 1.0 - smoothstep(700.0, 6000.0, dcam);
        float m1 = gN(vWP.xz * 0.0006 + 2.0), m2 = gN(vWP.xz * 0.004 + 7.0), m3 = gN(vWP.xz * 0.05 + 3.0);
        vec3 col = diffuseColor.rgb;
        // landform-driven albedo: pale gravel fans in hollows, darker flint reg on crests
        float concave = smoothstep(0.05, 0.6, vLand.y), convex = smoothstep(0.05, 0.6, -vLand.y);
        col = mix(col, vec3(0.41, 0.36, 0.28), concave * 0.5);
        col *= 1.0 - 0.24 * convex;
        // banded limestone/chalk on steep ground with darker ledges
        float rockK = smoothstep(0.16, 0.42, slope + (m2 - 0.5) * 0.1);
        float strata = 0.78 + 0.22 * smoothstep(-0.3, 0.6, sin(vWP.y * 0.36 + m2 * 5.0));
        col = mix(col, vec3(0.30, 0.26, 0.21) * strata, rockK);
        // wadi beds from drainage: pale gravel centre, darker scrub edges (acacia), fading far away
        float wk = vLand.x * (1.0 - smoothstep(0.25, 0.6, vGlow)) * (1.0 - smoothstep(3500.0, 9000.0, dcam)) * (1.0 - rockK * 0.6);
        float bed = smoothstep(0.55, 0.95, vLand.x), fringe = smoothstep(0.15, 0.55, vLand.x) * (1.0 - bed);
        col = mix(col, vec3(0.44, 0.39, 0.31), bed * wk * 0.8);
        float shrub = smoothstep(0.80, 0.86, gN(vWP.xz * 0.35 + 9.0)) * (1.0 - smoothstep(300.0, 1500.0, dcam));
        col = mix(col, vec3(0.22, 0.18, 0.13), clamp((fringe * 0.10 + shrub * 0.18) * min(1.0, wk + 0.4 * concave + 0.3), 0.0, 1.0));
        // flat hamada: low-contrast desert-pavement mottling
        float flatK2 = 1.0 - smoothstep(0.04, 0.14, slope);
        col = mix(col, vec3(0.36, 0.31, 0.24), (gN(vWP.xz * 0.0025 + 4.0) - 0.5) * 0.24 * flatK2 + 0.0);
        // large-scale hamada/loess variation, gentle
        col *= 0.93 + 0.14 * m1;
        // view-scale hamada: dark flint-gravel sheets against pale loess (300-800 m patches)
        float hm = smoothstep(0.45, 0.75, gN(vWP.xz * 0.0016 + 5.0) * 0.65 + gN(vWP.xz * 0.0045 + 2.0) * 0.35);
        col = mix(col, vec3(0.21, 0.18, 0.14), hm * 0.3 * (1.0 - rockK));
        col = mix(col, vec3(0.42, 0.37, 0.29), smoothstep(0.62, 0.8, gN(vWP.xz * 0.0013 + 8.0)) * 0.3 * (1.0 - hm));
        col *= 0.96 + 0.08 * m2 * (1.0 - rockK);
        // close-up grain, faded so it never shimmers
        col *= mix(1.0, 0.9 + 0.2 * m3, near);
        diffuseColor.rgb = col;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          // gentle micro-relief (erosion rills, gravel) as a bump; strong only on rock
          float fadeB = 1.0 - smoothstep(1200.0, 9000.0, dcam);
          float e = max(1.0, dcam * 0.0015);
          vec2 q = vWP.xz;
          #define BH(p) (0.9 * gN((p) * 0.018) + 0.45 * gN((p) * 0.06 + 3.0) * (1.0 - smoothstep(500.0, 2500.0, dcam)) + 0.15 * gN((p) * 0.2 + 1.0) * (1.0 - smoothstep(150.0, 700.0, dcam)))
          float h0 = BH(q), hx = BH(q + vec2(e, 0.0)), hz = BH(q + vec2(0.0, e));
          float amp = (1.0 + 2.5 * rockK + 1.2 * (1.0 - smoothstep(600.0, 1800.0, dcam))) * (1.0 - 0.7 * smoothstep(0.15, 0.6, vGlow));
          vec3 gW = vec3(-(hx - h0) / e, 0.0, -(hz - h0) / e) * amp * fadeB;
          normal = normalize(normal + (viewMatrix * vec4(gW, 0.0)).xyz);
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(1.0, 0.55, 0.24) * vGlow * vGlow * 0.05 * diffuseColor.rgb;
        totalEmissiveRadiance += uFlashSky * diffuseColor.rgb * (0.5 + 0.5 * normalize(vWN).y);`);
  };
  mat.customProgramCacheKey = () => 'env-terrain';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'terrain';
  ctx.scene.add(mesh);

  // rock outcrops and acacia clusters along the wadi beds within ~7 km of Arad (foreground silhouettes)
  {
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const rocks = [], trees = [];
    for (let v = 0; v < NV; v++) {
      const x = pos[v * 3], z = pos[v * 3 + 2], d = Math.hypot(x, z);
      if (d > 7000 || glow[v] > 0.1 || H[v] < -380) continue;
      const w = wadi[v], c = curv[v];
      if (w > 0.35 && rnd() < 0.14) trees.push([x + (rnd() - 0.5) * 30, z + (rnd() - 0.5) * 30, 0.7 + rnd() * 0.7]);
      else if (c < -0.4 && rnd() < 0.05) rocks.push([x + (rnd() - 0.5) * 30, z + (rnd() - 0.5) * 30, 2 + rnd() * 6]);
    }
    // the scan is row-ordered, so an early break clustered everything in one strip: collect
    // every candidate, then shuffle (seeded) and keep the caps so scatter covers the whole area
    const cap = (arr, n) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; } arr.length = Math.min(arr.length, n); };
    cap(trees, 900); cap(rocks, 700);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
    const rg = new THREE.DodecahedronGeometry(1, 0); rg.scale(1.3, 0.55, 1.0);
    const rm = new THREE.InstancedMesh(rg, new THREE.MeshStandardMaterial({ color: 0x5e5446, roughness: 0.95, flatShading: true }), rocks.length);
    rocks.forEach(([x, z, s2], i) => { q.setFromAxisAngle(Y, x * 0.13); m4.compose(p.set(x, ctx.envGround(x, z) + s2 * 0.15, z), q, sc.set(s2, s2, s2)); rm.setMatrixAt(i, m4); });
    // acacia: thin trunk + flat umbrella crown, one merged geometry
    const tr = new THREE.CylinderGeometry(0.12, 0.18, 3, 5); tr.translate(0, 1.5, 0);
    const cr = new THREE.CylinderGeometry(3.2, 2.2, 0.9, 9); cr.translate(0, 3.4, 0);
    const col2 = (g, c) => { const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set(c, i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g.toNonIndexed(); };
    const ag = mergeG([col2(tr, [0.25, 0.2, 0.15]), col2(cr, [0.17, 0.18, 0.11])]);
    const am = new THREE.InstancedMesh(ag, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }), trees.length);
    trees.forEach(([x, z, s2], i) => { q.setFromAxisAngle(Y, z * 0.17); m4.compose(p.set(x, ctx.envGround(x, z) - 0.2, z), q, sc.set(s2, s2 * (0.8 + 0.3 * ((x * 7) % 1 + 1) % 1), s2)); am.setMatrixAt(i, m4); });
    rm.name = 'rocks'; am.name = 'acacias';
    ctx.scene.add(rm, am);
  }

  // ---- Dead Sea: a grid whose shoreline is carved by the height field
  const SX0 = 7000, SX1 = 19400, SZ0 = -46000, SZ1 = 46000, SD = 200;
  const nx = Math.round((SX1 - SX0) / SD), nz = Math.round((SZ1 - SZ0) / SD);
  const sp = new Float32Array((nx + 1) * (nz + 1) * 3), sdp = new Float32Array((nx + 1) * (nz + 1));
  k = 0;
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++, k++) {
    const x = SX0 + i * SD, z = SZ0 + j * SD;
    sp[k * 3] = x; sp[k * 3 + 1] = GEO.deadSea.level; sp[k * 3 + 2] = z;
    sdp[k] = GEO.deadSea.level - heightAt(x, z);
  }
  const sidx = [];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
    if (Math.max(sdp[a], sdp[b], sdp[c], sdp[d]) < -2) continue;
    sidx.push(a, c, b, b, c, d);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  sg.setAttribute('aDepth', new THREE.BufferAttribute(sdp, 1));
  sg.setIndex(sidx);
  const sea = new THREE.Mesh(sg, new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uFogC: { value: ATM.fog } }]),
    vertexShader: /* glsl */`
      #include <fog_pars_vertex>
      attribute float aDepth; varying float vDepth; varying vec3 vWP;
      void main() { vDepth = aDepth; vec4 w = modelMatrix * vec4(position, 1.0); vWP = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <fog_pars_fragment>
      varying vec3 vWP; varying float vDepth; uniform float uTime; uniform vec3 uFogC;
      ${ATM_GLSL}
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), u.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), u.x), u.y); }
      void main() {
        if (vDepth < 0.0) discard;
        vec3 V = normalize(cameraPosition - vWP);
        float dcam = length(cameraPosition - vWP);
        vec2 p = mat2(0.8, -0.6, 0.6, 0.8) * vWP.xz * 0.03;
        float amp = 0.035 * (1.0 - smoothstep(2000.0, 14000.0, dcam)) + 0.008;
        float w = n(p + uTime * 0.12) * 0.6 + n(p * 3.1 - uTime * 0.17) * 0.4;
        vec3 N = normalize(vec3((w - 0.5) * amp, 1.0, (n(p * 2.0 + 3.0 + uTime * 0.05) - 0.5) * amp));
        vec3 R = reflect(-V, N); R.y = abs(R.y);
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
        // the still brine mirrors the hazy sky, the moon path and the shore lights
        vec3 skyR = atmInscatter(vWP, R, 60000.0, uFogC) * (1.0 - exp(-atmOD(vWP, R, 60000.0)));
        vec3 col = vec3(0.004, 0.006, 0.009) + skyR * (0.2 + 0.8 * fres);
        float mu = max(dot(R, ATM_MOON), 0.0);
        col += vec3(0.85, 0.9, 1.0) * (pow(mu, 60.0) * 0.9 + pow(mu, 8.0) * 0.04);
        float sh = smoothstep(9500.0, 9700.0, vWP.x) * (1.0 - smoothstep(10600.0, 12500.0, vWP.x));
        col += vec3(1.0, 0.6, 0.3) * sh * 0.05 * smoothstep(0.5, 0.9, n(vWP.xz * vec2(0.002, 0.05) + uTime * 0.2));
        // shallows and salt rim along the carved shoreline
        col = mix(vec3(0.12, 0.115, 0.105), col, smoothstep(0.0, 6.0, vDepth));
        // southern basin: evaporation ponds with pale salt dikes
        float pond = smoothstep(13000.0, 14000.0, vWP.z);
        vec2 g = abs(fract(vWP.xz / vec2(1300.0, 950.0)) - 0.5);
        float dike = 1.0 - smoothstep(0.47, 0.49, max(g.x, g.y));
        vec3 pc = mix(vec3(0.030, 0.042, 0.045), vec3(0.12, 0.115, 0.10), 1.0 - dike);
        col = mix(col, pc + skyR * 0.25, pond);
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }`,
  }));
  sea.name = 'deadsea';
  ctx.scene.add(sea);

  // ---- far Moab ridges: fine silhouettes that layer through the haze (lighter, bluer with distance)
  const ridges = new THREE.Group(); ridges.name = 'far-ridges';
  // each ridge is a 4-row heightfield strip (west foot, shoulder, crest, back slope) so it has a
  // moonlit west face and reads as a surface from above; each layer is pulled further toward the
  // haze colour than the one in front of it (aerial perspective)
  const mkRidgeMat = (mixK) => new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uMix: { value: mixK }, uFogC: { value: ATM.fog } }]),
    vertexShader: /* glsl */`
      #include <fog_pars_vertex>
      varying vec3 vN;
      void main() { vN = normal; vec4 mvPosition = viewMatrix * modelMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <fog_pars_fragment>
      varying vec3 vN; uniform float uMix; uniform vec3 uFogC;
      ${ATM_GLSL}
      void main() {
        vec3 n = normalize(vN);
        float lit = max(dot(n, ATM_MOON), 0.0);
        vec3 col = vec3(0.30, 0.26, 0.21) / 3.14159 * (vec3(0.82, 0.85, 0.95) * 1.05 * lit + vec3(0.22, 0.26, 0.34) * 0.6 * (0.5 + 0.5 * n.y));
        col = mix(col, uFogC * 1.15, uMix);
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }`,
  });
  const ridge = (x0, seed, base, amp, followTerrain, mixK) => {
    const step = 70, z0 = -70000, z1 = 70000, rows = [[-2600, 0.0], [-1100, 0.72], [0, 1.0], [1600, 0.82]];
    const tops = [], xs2 = [];
    for (let z = z0; z <= z1; z += step) {
      const x = x0 + (fbm(z * 0.00006 + seed, seed * 3.1, 3) - 0.5) * 5000;
      let top = base + amp * (0.6 * ridged(z * 0.00018 + seed, seed, 3) + 0.4 * fbm(z * 0.0007 + seed * 2, 1.7, 2));
      if (followTerrain) { let m = -400; for (let d = 0; d <= 3000; d += 500) m = Math.max(m, heightAt(x + d, z)); top = Math.max(top, m + 25); }
      tops.push(top); xs2.push(x);
    }
    // low-pass the crest (kills stair steps)
    const sm = tops.map((t, i) => (tops[Math.max(0, i - 2)] + tops[Math.max(0, i - 1)] * 2 + t * 3 + tops[Math.min(tops.length - 1, i + 1)] * 2 + tops[Math.min(tops.length - 1, i + 2)]) / 9);
    const P = [], I = [], R = rows.length;
    sm.forEach((top, i) => {
      const z = z0 + i * step;
      for (const [dx, k] of rows) P.push(xs2[i] + dx, k === 0 ? -450 : -450 + (top + 450) * k, z);
      if (i) for (let r = 0; r < R - 1; r++) { const a = (i - 1) * R + r, b = i * R + r; I.push(a, b, a + 1, b, b + 1, a + 1); }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setIndex(I); g.computeVertexNormals();
    const m = new THREE.Mesh(g, mkRidgeMat(mixK)); m.frustumCulled = false; ridges.add(m);
  };
  ridge(20500, 3.3, 520, 380, true, 0.2);
  ridge(29000, 7.7, 820, 520, false, 0.45);
  ridge(41000, 11.1, 980, 650, false, 0.65);
  ctx.scene.add(ridges);

  return {
    mesh, sea, ridges, flashU,
    update(dt, t) { sea.material.uniforms.uTime.value = t; },
  };
}
