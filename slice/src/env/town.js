// Arad's streets and buildings (env stream). One merged mesh each:
//  - streets: asphalt with lane paint, a planted median on avenues, zebra crossings at
//    junctions, concrete sidewalks with curbs; parked cars (instanced, unbranded).
//  - buildings: Negev housing-estate vernacular. 4-storey slab blocks with balconies and lit
//    stairwells, centre towers with roof plant, low houses with garden walls and some tile
//    roofs, commercial strips with shopfronts. Procedural windows with per-building occupancy,
//    dark floors, colour temperatures, blinds and TV flicker; windows wake with the siren.
import * as THREE from 'three';
import { heightAt } from '../world/geo.js';

const TYPE_ID = { slab: 0, tower: 1, house: 2, commercial: 3, shed: 4 };
const hash = (x) => { const s = Math.sin(x * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

// ------------------------------------------------------------------ streets
export function buildStreets(ctx, group, rng, segs = []) {
  const { layout } = ctx;
  const road = { P: [], A: [] }, walk = { P: [], A: [] };
  // quad strip along A->B; attribute aRd = (u metres along, v 0..1 across, length, code)
  const strip = (dst, ax, az, bx, bz, w, lift, code, L0 = 0) => {
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1, nx = -dz / L * w / 2, nz = dx / L * w / 2;
    const n = Math.max(1, Math.ceil(L / 20));
    for (let s = 0; s < n; s++) {
      const t0 = s / n, t1 = (s + 1) / n;
      const x0 = ax + dx * t0, z0 = az + dz * t0, x1 = ax + dx * t1, z1 = az + dz * t1;
      const p = [[x0 + nx, z0 + nz, t0, 0], [x0 - nx, z0 - nz, t0, 1], [x1 + nx, z1 + nz, t1, 0], [x1 - nx, z1 - nz, t1, 1]];
      for (const o of [0, 2, 1, 1, 2, 3]) {
        const [x, z, t, v] = p[o];
        dst.P.push(x, (ctx.envGround ? ctx.envGround(x, z) : heightAt(x, z)) + lift, z);
        dst.A.push(L0 + t * L, v, L0 + L, code);
      }
    }
  };
  const W = { avenue: 2, street: 1, lane: 0 };
  const isJunction = (id) => layout.nodes[id].kind === 'x' && layout.nodes[id].adj.filter((e) => layout.edges[e].on).length >= 3;
  const cars = [];
  for (const e of layout.edges) {
    if (!e.on) continue;
    const A = layout.nodes[e.a], B = layout.nodes[e.b];
    const code = W[e.kind] + (isJunction(e.a) ? 4 : 0) + (isJunction(e.b) ? 8 : 0) + e.w * 16;
    strip(road, A.x, A.z, B.x, B.z, e.w, 0.35, code);
    strip(walk, A.x, A.z, B.x, B.z, e.w + 7, 0.22, e.w * 16);
    // parked cars along both curbs of streets and lanes (avenues have bus/through lanes)
    if (e.kind !== 'avenue') {
      const L = e.len, ux = (B.x - A.x) / L, uz = (B.z - A.z) / L, nx = -uz, nz = ux;
      for (const sd of [-1, 1]) {
        let u = 12 + rng.range(0, 6);
        while (u < L - 12) {
          if (rng.chance(0.62)) {
            const off = e.w / 2 - 1.15;
            const x = A.x + ux * u + nx * off * sd, z = A.z + uz * u + nz * off * sd;
            cars.push({ x, z, y: heightAt(x, z) + 0.35, yaw: Math.atan2(ux, uz) + (rng.chance(0.5) ? Math.PI : 0) + rng.range(-0.03, 0.03), c: rng.int(0, 99) });
          }
          u += rng.range(5.6, 7.5);
        }
      }
    }
  }
  // env-only neighbourhood streets (outskirts lobes): same look, no crossings
  for (const g of segs) {
    const code = W[g.kind] + g.w * 16;
    strip(road, g.ax, g.az, g.bx, g.bz, g.w, 0.35, code);
    strip(walk, g.ax, g.az, g.bx, g.bz, g.w + 6, 0.22, g.w * 16);
    for (const [x, z] of [[g.ax, g.az], [g.bx, g.bz]]) strip(road, x - g.w / 2, z, x + g.w / 2, z, g.w, 0.36, 3 + g.w * 16);
    const L = Math.hypot(g.bx - g.ax, g.bz - g.az), ux = (g.bx - g.ax) / L, uz = (g.bz - g.az) / L, nx = -uz, nz = ux;
    for (const sd of [-1, 1]) for (let u = 10 + rng.range(0, 8); u < L - 10; u += rng.range(6, 14)) {
      if (!rng.chance(0.4)) continue;
      const off = g.w / 2 - 1.15, x = g.ax + ux * u + nx * off * sd, z = g.az + uz * u + nz * off * sd;
      cars.push({ x, z, y: heightAt(x, z) + 0.35, yaw: Math.atan2(ux, uz) + (rng.chance(0.5) ? Math.PI : 0), c: rng.int(0, 99) });
    }
  }
  for (const n of layout.nodes) {
    const w = Math.max(...n.adj.map((id) => (layout.edges[id].on ? layout.edges[id].w : 0)), 0);
    if (!w) continue;
    strip(road, n.x - w / 2, n.z, n.x + w / 2, n.z, w, 0.36, 3 + w * 16); // junction box: plain asphalt
  }
  for (const r of layout.roads) {
    const curve = new THREE.CatmullRomCurve3(r.pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
    const len = curve.getLength(), pts = curve.getSpacedPoints(Math.max(2, Math.ceil(len / 25)));
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      strip(walk, a.x, a.z, b.x, b.z, r.w + 6, 0.12, r.w * 16 + 8);            // gravel shoulders
      strip(road, a.x, a.z, b.x, b.z, r.w, 0.25, 2 + r.w * 16, acc);          // asphalt: lane paint, no median
      acc += a.distanceTo(b);
    }
  }
  const mk = (src, color, order, frag) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(src.P, 3));
    g.setAttribute('aRd', new THREE.Float32BufferAttribute(src.A, 4));
    g.computeVertexNormals();
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2 * order, polygonOffsetUnits: -2 * order });
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aRd; varying vec4 vRd; varying vec3 vRW;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRd = aRd; vRW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
          varying vec4 vRd; varying vec3 vRW;
          float rH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float rN(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f); return mix(mix(rH(i), rH(i + vec2(1, 0)), u.x), mix(rH(i + vec2(0, 1)), rH(i + vec2(1, 1)), u.x), u.y); }`)
        .replace('#include <color_fragment>', `#include <color_fragment>\n${frag}`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          // street lighting: sodium fill over the town's streets (pools add the hot spots)
          float townK = exp(-dot(vRW.xz / vec2(820.0, 700.0), vRW.xz / vec2(820.0, 700.0)) * 0.7);
          totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.62, 0.32) * 0.85 * townK;`);
    };
    m.customProgramCacheKey = () => 'env-street-' + order; // same onBeforeCompile source, different GLSL
    const mesh = new THREE.Mesh(g, m); mesh.renderOrder = order; group.add(mesh); return mesh;
  };
  // sidewalks: pale concrete pavers, a bright curb on the road edge, dusty outer edge
  mk(walk, 0x7a756c, 1, /* glsl */`
    if (mod(vRd.w, 16.0) > 7.5) {
      // gravel shoulder blending into the desert
      float Ws = floor(vRd.w / 16.0) + 6.0; float vs = abs(vRd.y - 0.5) * Ws;
      diffuseColor.rgb = vec3(0.27, 0.23, 0.18) * (0.8 + 0.4 * rN(vRW.xz * 0.9)) * mix(1.0, 1.15, smoothstep(Ws * 0.5 - 0.5, Ws * 0.5 - 2.5, vs));
    } else {
    float W = floor(vRd.w / 16.0) + 7.0, rw = W - 7.0;
    float vm = abs(vRd.y - 0.5) * W;
    vec2 tile = vec2(vRd.x / 0.6, vm / 0.6);
    vec2 tf = abs(fract(tile) - 0.5);
    float joint = smoothstep(0.44, 0.5, max(tf.x, tf.y));
    float curb = smoothstep(rw * 0.5 + 0.45, rw * 0.5 + 0.2, vm);
    diffuseColor.rgb *= (0.86 + 0.22 * rN(tile * 0.37)) * (1.0 - 0.18 * joint);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.60, 0.56), curb);
    diffuseColor.rgb *= mix(1.0, 0.8, smoothstep(W * 0.5 - 0.6, W * 0.5, vm));
    }`);
  // asphalt: worn grey with patches, paint, median and crossings
  mk(road, 0x45464b, 2, /* glsl */`
    float code = vRd.w; float w = floor(code / 16.0); float c = mod(code, 16.0);
    float regional = step(64.0, mod(code, 128.0)) * 0.0;
    float kind = mod(c, 4.0); float cwA = step(4.0, mod(c, 8.0)); float cwB = step(8.0, c);
    float vm = (vRd.y - 0.5) * w; float av = abs(vm);
    float u = vRd.x, L = vRd.z;
    float wear = 0.82 + 0.3 * rN(vRW.xz * 0.15) + 0.12 * rN(vRW.xz * 1.3);
    vec3 col = diffuseColor.rgb * wear;
    col *= mix(1.0, 0.72, smoothstep(w * 0.5 - 1.2, w * 0.5, av));        // gutters
    col *= mix(1.0, 0.86, (1.0 - smoothstep(0.6, 1.6, abs(av - w * 0.27))) * 0.8); // tyre tracks
    float paint = 0.0;
    if (kind > 2.5) { /* junction box: plain */ }
    else if (kind > 1.5) {
      // avenue / regional: dashed lane lines; avenues carry a planted median
      float dash = step(0.55, fract(u / 9.0));
      paint += (1.0 - smoothstep(0.08, 0.16, abs(av - w * 0.25))) * dash * step(w, 20.0);
      if (w > 20.0) {
        float med = 1.0 - smoothstep(1.5, 1.65, av);
        float curbM = (1.0 - smoothstep(0.0, 0.18, abs(av - 1.6)));
        col = mix(col, vec3(0.16, 0.13, 0.10) * (0.7 + 0.5 * rN(vRW.xz * 0.7)), med);
        col = mix(col, vec3(0.55, 0.53, 0.5), curbM);
        paint += (1.0 - smoothstep(0.08, 0.15, abs(av - 5.6))) * dash;
      } else {
        paint += (1.0 - smoothstep(0.07, 0.13, av)) * step(0.5, fract(u / 12.0)) * step(w, 13.0) * 0.0;
      }
      paint += (1.0 - smoothstep(0.07, 0.13, abs(av - (w * 0.5 - 0.5)))) * 0.8;   // edge lines
    } else if (kind > 0.5) {
      paint += (1.0 - smoothstep(0.06, 0.12, av)) * step(0.5, fract(u / 6.0)); // street centre dashes
    }
    // zebra crossings just outside each junction box
    float hw = w * 0.5;
    float inA = cwA * step(hw + 1.0, u) * step(u, hw + 4.0);
    float inB = cwB * step(hw + 1.0, L - u) * step(L - u, hw + 4.0);
    float zebra = step(0.5, fract(vm / 1.1)) * step(av, hw - 0.6);
    paint = max(paint, (inA + inB) * zebra);
    col = mix(col, vec3(0.62, 0.62, 0.6) * (0.75 + 0.25 * rN(vRW.xz * 2.0)), clamp(paint, 0.0, 1.0) * 0.85);
    // far away asphalt reads as a pale grey line, not a black ribbon
    col = mix(col, vec3(0.11, 0.105, 0.10), smoothstep(700.0, 4000.0, length(vRW - cameraPosition)) * 0.8);
    diffuseColor.rgb = col;`);
  return cars;
}

export function buildCars(ctx, group, cars) {
  if (!cars.length) return null;
  // body + cabin in one geometry; cabin vertices flagged so the shader can darken the glass
  const body = new THREE.BoxGeometry(1.8, 0.75, 4.3); body.translate(0, 0.62, 0);
  const cab = new THREE.BoxGeometry(1.6, 0.58, 2.3); cab.translate(0, 1.27, -0.2);
  const parts = [body, cab].map((g, k) => { g = g.toNonIndexed(); g.setAttribute('aCab', new THREE.Float32BufferAttribute(new Array(g.attributes.position.count).fill(k), 1)); return g; });
  const geo = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'aCab']) {
    const size = parts[0].attributes[name].itemSize, arr = [];
    for (const g of parts) arr.push(...g.attributes[name].array);
    geo.setAttribute(name, new THREE.Float32BufferAttribute(arr, size));
  }
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.35 });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aCab; varying float vCab; varying vec3 vCN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCab = aCab; vCN = normal;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vCab; varying vec3 vCN;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float glass = vCab * (1.0 - step(0.9, vCN.y));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.02, 0.025, 0.03), glass * 0.9);`);
  };
  const im = new THREE.InstancedMesh(geo, mat, cars.length);
  const pal = [[0.75, 0.75, 0.74], [0.75, 0.75, 0.74], [0.45, 0.46, 0.48], [0.45, 0.46, 0.48], [0.06, 0.06, 0.07], [0.16, 0.18, 0.22], [0.30, 0.06, 0.05], [0.55, 0.50, 0.40], [0.12, 0.20, 0.30], [0.6, 0.6, 0.62]];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1), col = new THREE.Color();
  cars.forEach((c, i) => {
    q.setFromAxisAngle(Y, c.yaw); s.set(1, 1, 0.92 + (c.c % 7) * 0.03);
    m4.compose(p.set(c.x, c.y, c.z), q, s); im.setMatrixAt(i, m4);
    const k = pal[c.c % pal.length]; col.setRGB(k[0], k[1], k[2]); im.setColorAt(i, col);
  });
  im.name = 'parked-cars';
  group.add(im);
  return im;
}

// ------------------------------------------------------------------ buildings
export function buildBuildings(ctx, group, extra = []) {
  const B = ctx.layout.buildings.concat(extra);
  const P = [], N = [], F = [], F2 = [], C = [];
  const wallCols = [[0.74, 0.65, 0.52], [0.78, 0.71, 0.60], [0.68, 0.59, 0.47], [0.82, 0.75, 0.64], [0.64, 0.57, 0.48], [0.72, 0.63, 0.50], [0.62, 0.55, 0.44]];
  const extras = { roofUnits: [], beacons: [] };
  for (const b of B) {
    if (b.type === 'wall') {
      // compound / garden wall: a plain rendered block wall
      const c = Math.cos(b.rot), s = Math.sin(b.rot), hw = b.w / 2, hd = b.d / 2, y0 = b.y - 0.4, y1 = b.y + b.h;
      const wc = [0.56, 0.51, 0.44];
      const tr = (lx, lz) => [b.x + lx * c - lz * s, b.z + lx * s + lz * c];
      const quads = [[[hw, -hd], [hw, hd], [1, 0]], [[-hw, hd], [-hw, -hd], [-1, 0]], [[hw, hd], [-hw, hd], [0, 1]], [[-hw, -hd], [hw, -hd], [0, -1]]];
      for (const [p0, p1, n] of quads) {
        const [x0, z0] = tr(...p0), [x1, z1] = tr(...p1), wn = [n[0] * c - n[1] * s, n[0] * s + n[1] * c];
        const v = [[x0, y0, z0], [x1, y0, z1], [x0, y1, z0], [x1, y1, z1]];
        for (const o of [0, 2, 1, 1, 2, 3]) { P.push(...v[o]); N.push(wn[0], 0, wn[1]); F.push(0, v[o][1] - b.y, 0, -2); F2.push(0, 0, 0, 0); C.push(...wc); }
      }
      const r = [tr(-hw, -hd), tr(hw, -hd), tr(-hw, hd), tr(hw, hd)];
      for (const o of [0, 2, 1, 1, 2, 3]) { P.push(r[o][0], y1, r[o][1]); N.push(0, 1, 0); F.push(0, b.h, 0, -2); F2.push(0, 0, 0, 0); C.push(...wc); }
      continue;
    }
    const type = TYPE_ID[b.type] ?? 0, floors = b.floors;
    const base = b.y - 3, top = b.y + b.h, hw = b.w / 2, hd = b.d / 2;
    const c = Math.cos(b.rot), s = Math.sin(b.rot);
    const tr = (lx, lz) => [b.x + lx * c - lz * s, b.z + lx * s + lz * c];
    const rot = (nx, nz) => [nx * c - nz * s, nx * s + nz * c];
    const hs = (k) => hash(b.seed * 91.7 + b.id * 0.131 + k * 17.3);
    const wc = wallCols[Math.floor(hs(1) * wallCols.length)];
    const tint = 0.9 + 0.2 * hs(2);
    const col = type === 4 ? [0.42, 0.42, 0.40].map((v) => v * tint) : wc.map((v) => v * tint * 0.8);
    const litFrac = 0.10 + 0.40 * hs(3) * hs(3) + (type === 1 ? 0.08 : 0);
    const style = Math.floor(hs(4) * 8);
    const sid = b.id * 3 + Math.floor(b.seed * 3); // integer: the shader hashes it exactly
    const fh = type === 1 ? 3.2 : type === 2 ? 3.1 : 3.0, sp = type === 3 ? 5.0 : type === 2 ? 4.2 : 3.4;
    const longX = b.w >= b.d;
    // facade face with window attributes
    const face = (p0, p1, nx, nz, uLen, isLong) => {
      const [x0, z0] = tr(...p0), [x1, z1] = tr(...p1);
      const v = [[x0, base, z0, 0, -3], [x1, base, z1, uLen, -3], [x0, top, z0, 0, b.h], [x1, top, z1, uLen, b.h]];
      const wn = rot(nx, nz);
      for (const o of [0, 1, 2, 2, 1, 3]) { const q = v[o]; P.push(q[0], q[1], q[2]); N.push(wn[0], 0, wn[1]); F.push(q[3], q[4], sid, (type === 4 ? 0 : floors) + type * 100); F2.push(uLen, isLong ? 1 : 0, litFrac, style); C.push(...col); }
    };
    face([-hw, hd], [hw, hd], 0, 1, b.w, longX);
    face([hw, -hd], [-hw, -hd], 0, -1, b.w, longX);
    face([hw, hd], [hw, -hd], 1, 0, b.d, !longX);
    face([-hw, -hd], [-hw, hd], -1, 0, b.d, !longX);
    // axis-aligned box in the building's local frame (code: -1 roof-like, -2 trim, -4 tile)
    const box = (lx0, lx1, y0, y1, lz0, lz1, bc, code = -2, bottom = false) => {
      const corners = (lx, y, lz) => { const [x, z] = tr(lx, lz); return [x, y, z]; };
      const quads = [
        [[lx1, y0, lz0], [lx1, y0, lz1], [lx1, y1, lz0], [lx1, y1, lz1], [1, 0, 0]],
        [[lx0, y0, lz1], [lx0, y0, lz0], [lx0, y1, lz1], [lx0, y1, lz0], [-1, 0, 0]],
        [[lx1, y0, lz1], [lx0, y0, lz1], [lx1, y1, lz1], [lx0, y1, lz1], [0, 0, 1]],
        [[lx0, y0, lz0], [lx1, y0, lz0], [lx0, y1, lz0], [lx1, y1, lz0], [0, 0, -1]],
        [[lx0, y1, lz0], [lx1, y1, lz0], [lx0, y1, lz1], [lx1, y1, lz1], [0, 1, 0]],
      ];
      if (bottom) quads.push([[lx0, y0, lz1], [lx1, y0, lz1], [lx0, y0, lz0], [lx1, y0, lz0], [0, -1, 0]]);
      for (const qd of quads) {
        const n = qd[4], wn = n[1] ? [0, n[1], 0] : (() => { const r = rot(n[0], n[2]); return [r[0], 0, r[1]]; })();
        const v = qd.slice(0, 4).map((q) => corners(...q));
        for (const o of [0, 2, 1, 1, 2, 3]) { P.push(...v[o]); N.push(...wn); F.push(0, v[o][1] - b.y, sid, code); F2.push(0, 0, 0, 0); C.push(...bc); }
      }
    };
    // roof: slab, with a parapet; some houses get a hipped tile roof instead
    const roofCol = (type === 4 ? [0.36, 0.36, 0.35] : [0.27, 0.25, 0.22]).map((v) => v * (0.85 + 0.3 * hs(5)));
    const tile = type === 2 && hs(6) < 0.38;
    if (tile) {
      const rh = Math.min(hw, hd) * 0.55, tc = [0.42, 0.17, 0.10].map((v) => v * (0.85 + 0.3 * hs(7)));
      const e = 0.5, R = [tr(-hw - e, -hd - e), tr(hw + e, -hd - e), tr(hw + e, hd + e), tr(-hw - e, hd + e)];
      const ridge = longX ? [tr(-hw + rh, 0), tr(hw - rh, 0)] : [tr(0, -hd + rh), tr(0, hd - rh)];
      const T = top + rh;
      const tri = (a, bb, cc) => {
        const ux = bb[0] - a[0], uy = bb[1] - a[1], uz = bb[2] - a[2], vx = cc[0] - a[0], vy = cc[1] - a[1], vz = cc[2] - a[2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
        if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; const t = bb; bb = cc; cc = t; }
        for (const q of [a, bb, cc]) { P.push(...q); N.push(nx, ny, nz); F.push(0, q[1] - b.y, sid, -4); F2.push(0, 0, 0, 0); C.push(...tc); }
      };
      const r0 = [ridge[0][0], T, ridge[0][1]], r1 = [ridge[1][0], T, ridge[1][1]];
      const c0 = [R[0][0], top, R[0][1]], c1 = [R[1][0], top, R[1][1]], c2 = [R[2][0], top, R[2][1]], c3 = [R[3][0], top, R[3][1]];
      // hip roof: ridge r0-r1 runs along the long axis; each eave edge gets a face
      if (longX) { tri(c0, c1, r1); tri(c0, r1, r0); tri(c1, c2, r1); tri(c2, c3, r0); tri(c2, r0, r1); tri(c3, c0, r0); }
      else { tri(c0, c1, r0); tri(c1, c2, r1); tri(c1, r1, r0); tri(c2, c3, r1); tri(c3, c0, r0); tri(c3, r0, r1); }
    } else {
      const r = [tr(-hw, -hd), tr(hw, -hd), tr(-hw, hd), tr(hw, hd)];
      for (const o of [0, 2, 1, 1, 2, 3]) { P.push(r[o][0], top, r[o][1]); N.push(0, 1, 0); F.push(0, b.h, sid, -1); F2.push(0, 0, 0, 0); C.push(...roofCol); }
      const ph = type === 2 ? 0.7 : type === 4 ? 0.3 : 1.0, pt = 0.25, pc = col.map((v) => v * 0.92);
      box(-hw, hw, top, top + ph, hd - pt, hd, pc); box(-hw, hw, top, top + ph, -hd, -hd + pt, pc);
      box(hw - pt, hw, top, top + ph, -hd + pt, hd - pt, pc); box(-hw, -hw + pt, top, top + ph, -hd + pt, hd - pt, pc);
    }
    // slabs: balconies on the long faces (pairs of bays), stair rooms on the roof
    if (type === 0) {
      const L = longX ? b.w : b.d;
      const ns = Math.max(1, Math.round(L / 24));
      const stairU = Array.from({ length: ns }, (_, k) => (k + 0.5) * L / ns);
      const pattern = Math.floor(hs(8) * 3); // 0 continuous, 1 staggered, 2 sparse
      const sides = longX ? [[[-hw, hd], [1, 0], [0, 1]], [[hw, -hd], [-1, 0], [0, -1]]] : [[[hw, hd], [0, -1], [1, 0]], [[-hw, -hd], [0, 1], [-1, 0]]];
      const balCol = col.map((v) => v * 0.97), railDark = [0.10, 0.11, 0.12];
      for (const [st, t, n] of sides) {
        const nb = Math.floor(L / sp);
        for (let fl = 1; fl < floors; fl++) {
          for (let k = 0; k + 1 < nb; k += 2) {
            if (pattern === 1 && ((k / 2 + fl) % 2)) continue;
            if (pattern === 2 && hash(sid + k * 3.1 + fl * 7.3) < 0.45) continue;
            const u0 = k * sp + 0.15, u1 = (k + 2) * sp - 0.15;
            if (stairU.some((su) => u1 > su - 1.8 && u0 < su + 1.8)) continue;
            const y0 = b.y + 0.4 + fl * fh;
            const dep = 1.45;
            const toL = (u, d) => [st[0] + t[0] * u + n[0] * d, st[1] + t[1] * u + n[1] * d];
            const a = toL(u0, 0), bb = toL(u1, dep);
            const lx0 = Math.min(a[0], bb[0]), lx1 = Math.max(a[0], bb[0]), lz0 = Math.min(a[1], bb[1]), lz1 = Math.max(a[1], bb[1]);
            box(lx0, lx1, y0 - 0.22, y0, lz0, lz1, balCol, -2, true);
            const f0 = toL(u0, dep - 0.12), f1 = toL(u1, dep);
            const dark = hash(sid * 1.7 + k) < 0.35;
            box(Math.min(f0[0], f1[0]), Math.max(f0[0], f1[0]), y0, y0 + 1.05, Math.min(f0[1], f1[1]), Math.max(f0[1], f1[1]), dark ? railDark : balCol, -2);
          }
        }
      }
      for (const su of stairU) {
        const lx = longX ? -hw + su : 0, lz = longX ? 0 : hd - su;
        box(lx - 1.6, lx + 1.6, top, top + 2.6, lz - 1.8, lz + 1.8, col.map((v) => v * 0.95));
      }
    }
    if (type === 1) {
      const balCol = col.map((v) => v * 0.97);
      const sides = [[[-hw, hd], [1, 0], [0, 1], b.w], [[hw, -hd], [-1, 0], [0, -1], b.w], [[hw, hd], [0, -1], [1, 0], b.d], [[-hw, -hd], [0, 1], [-1, 0], b.d]];
      for (const [st, t, n, L] of sides) {
        const nb = Math.floor(L / sp);
        for (let fl = 1; fl < floors; fl++) {
          for (let k = (fl + Math.floor(hs(10) * 2)) % 2; k + 1 < nb; k += 3) {
            const u0 = k * sp + 0.15, u1 = (k + 2) * sp - 0.15, y0 = b.y + 0.4 + fl * fh, dep = 1.3;
            const toL = (u, d) => [st[0] + t[0] * u + n[0] * d, st[1] + t[1] * u + n[1] * d];
            const a = toL(u0, 0), bb = toL(u1, dep), f0 = toL(u0, dep - 0.12);
            box(Math.min(a[0], bb[0]), Math.max(a[0], bb[0]), y0 - 0.22, y0, Math.min(a[1], bb[1]), Math.max(a[1], bb[1]), balCol, -2, true);
            box(Math.min(f0[0], bb[0]), Math.max(f0[0], bb[0]), y0, y0 + 1.05, Math.min(f0[1], bb[1]), Math.max(f0[1], bb[1]), [0.12, 0.13, 0.14], -2);
          }
        }
      }
      // tower roof plant and a red aviation light
      box(-hw * 0.45, hw * 0.45, top, top + 3.4, -hd * 0.4, hd * 0.4, col.map((v) => v * 0.9));
      extras.beacons.push([b.x, top + 4.2, b.z]);
    }
    if (type === 2) {
      // garden wall around the plot with a gate gap on the street side
      const gx = hw + 2.6, gz = hd + 2.4, wh = 1.35, t = 0.22, wcol = [0.62, 0.58, 0.52].map((v) => v * (0.85 + 0.3 * hs(9)));
      const yb = b.y - 0.3;
      box(-gx, gx, yb, yb + wh, -gz, -gz + t, wcol);
      box(-gx, -1.4, yb, yb + wh, gz - t, gz, wcol); box(1.4, gx, yb, yb + wh, gz - t, gz, wcol);
      box(-gx, -gx + t, yb, yb + wh, -gz + t, gz - t, wcol); box(gx - t, gx, yb, yb + wh, -gz + t, gz - t, wcol);
    }
    if (type === 3) {
      // shopfront canopy
      box(-hw - 0.2, hw + 0.2, b.y + 3.2, b.y + 3.45, hd, hd + 2.2, [0.25, 0.25, 0.26], -2, true);
      box(-hw - 0.2, hw + 0.2, b.y + 3.2, b.y + 3.45, -hd - 2.2, -hd, [0.25, 0.25, 0.26], -2, true);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('aFac', new THREE.Float32BufferAttribute(F, 4));
  g.setAttribute('aFac2', new THREE.Float32BufferAttribute(F2, 4));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.0, side: THREE.FrontSide });
  const uniforms = { uTime: { value: 0 }, uWake: { value: 0 }, uWinGain: { value: 1.0 } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aFac; attribute vec4 aFac2; varying vec4 vFac; varying vec4 vFac2; varying vec3 vBW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFac = aFac; vFac2 = aFac2; vBW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec4 vFac; varying vec4 vFac2; varying vec3 vBW; uniform float uTime; uniform float uWake; uniform float uWinGain;
        float bh(vec2 p) { p = mod(p, 289.0); return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        float bn(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f); return mix(mix(bh(i), bh(i + vec2(1, 0)), u.x), mix(bh(i + vec2(0, 1)), bh(i + vec2(1, 1)), u.x), u.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float wWin = 0.0; vec3 wEmit = vec3(0.0);
        float code = vFac.w;
        if (code >= 0.0) {
          float type = floor(code / 100.0), floors = mod(code, 100.0);
          float fh = type == 1.0 ? 3.2 : (type == 2.0 ? 3.1 : 3.0);
          float sp = type == 3.0 ? 5.0 : (type == 2.0 ? 4.2 : 3.4);
          vec2 g = vec2(vFac.x / sp, (vFac.y - 0.4) / fh);
          vec2 id = floor(g); vec2 f = fract(g);
          float inF = step(0.0, id.y) * step(id.y, floors - 1.0);
          float faceLen = max(vFac2.x, 1.0);
          float ns = max(1.0, floor(faceLen / 24.0 + 0.5));
          float su = (fract(vFac.x / faceLen * ns) - 0.5) * faceLen / ns;
          float isStair = (type == 0.0 && vFac2.y > 0.5) ? step(abs(su), 1.5) : 0.0;
          float shop = (type == 3.0 && id.y < 0.5) ? 1.0 : 0.0;
          float ww = shop > 0.5 ? 0.05 : (type == 2.0 ? 0.26 : 0.2);
          vec2 aa = max(fwidth(g), vec2(1e-4));
          float y0w = shop > 0.5 ? 0.05 : 0.26;
          wWin = smoothstep(ww - aa.x, ww + aa.x, f.x) * smoothstep(1.0 - ww + aa.x, 1.0 - ww - aa.x, f.x) * smoothstep(y0w - aa.y, y0w + aa.y, f.y) * smoothstep(0.86 + aa.y, 0.86 - aa.y, f.y) * inF * (1.0 - isStair);
          float sd = floor(vFac.z + 0.5);
          float r1 = bh(id + sd), r2 = bh(id * 1.7 + sd * 3.1), r3 = bh(id + sd * 7.7 + 11.0);
          float rf = bh(vec2(id.y * 3.7 + floor(id.x / 4.0) * 0.61, sd * 1.3));
          float darkFlat = step(rf, 0.22);
          float litFrac = vFac2.z + 0.42 * uWake * step(r3, 0.88);
          litFrac *= 1.0 - darkFlat * (1.0 - 0.7 * uWake);
          if (shop > 0.5) litFrac = 0.35 + 0.5 * step(0.5, bh(vec2(id.x, sd)));
          float lit = step(1.0 - litFrac, r1);
          float ct = fract(r2 + vFac2.w * 0.137);
          vec3 wc = ct < 0.46 ? vec3(1.0, 0.56, 0.24) : (ct < 0.80 ? vec3(1.0, 0.72, 0.44) : (ct < 0.94 ? vec3(0.78, 0.85, 1.0) : vec3(0.42, 0.58, 1.0)));
          if (shop > 0.5) wc = vec3(1.0, 0.86, 0.66);
          float flick = ct >= 0.94 ? 0.55 + 0.45 * sin(uTime * (7.0 + r3 * 9.0) + r1 * 40.0) * sin(uTime * 2.3 + r2 * 9.0) : 1.0;
          float sfw = fwidth(f.y * 10.0); float slatK = smoothstep(0.42 - sfw, 0.42 + sfw, fract(f.y * 10.0));
          float slats = mix(1.0, mix(0.35 + 0.65 * slatK, 0.7, smoothstep(0.3, 0.8, sfw)), step(0.62, r3));
          float curtain = 0.55 + 0.45 * smoothstep(0.2, 0.95, f.y) * (0.75 + 0.25 * sin(f.x * 6.2832 + r1 * 6.0));
          float room = 0.45 + 1.0 * r3 * r3;
          wEmit = wc * lit * wWin * flick * slats * curtain * room;
          if (isStair > 0.5) {
            float sv = fract(g.y + 0.5), sid = floor(g.y + 0.5);
            float sw = step(0.22, sv) * step(sv, 0.78) * step(abs(su), 0.6) * step(0.5, sid) * step(sid, floors - 0.5);
            float sl = step(0.2, bh(vec2(sid, sd * 5.1)));
            vec3 sc = bh(vec2(sd, 3.0)) < 0.6 ? vec3(0.80, 0.90, 1.0) : vec3(1.0, 0.76, 0.48);
            wEmit += sc * sw * sl * 0.75;
            // lobby door at the foot of the stair
            float door = step(abs(su), 0.9) * step(vFac.y, 2.6) * step(0.0, vFac.y);
            wEmit += vec3(1.0, 0.8, 0.55) * door * 0.6;
            wWin = max(wWin, max(sw, door));
          }
          if (type == 4.0) { // sheds: corrugated cladding and a roller door
            float cf = fwidth(vFac.x * 2.5);
            diffuseColor.rgb *= 0.86 + 0.14 * mix(0.5 + 0.5 * sin(vFac.x * 15.7), 0.5, smoothstep(0.2, 0.6, cf));
            float door = step(abs(fract(vFac.x / 14.0) - 0.5) * 14.0, 2.2) * step(vFac.y, 4.2);
            diffuseColor.rgb *= 1.0 - 0.35 * door;
          }
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.028, 0.032, 0.04), wWin * 0.92);
          diffuseColor.rgb *= 0.9 + 0.1 * smoothstep(0.0, 0.05, abs(f.y - 0.03));
          diffuseColor.rgb *= mix(0.72, 1.0, smoothstep(0.0, 1.2, vFac.y)) * (0.92 + 0.12 * bn(vBW.xz * 0.35 + vBW.y * 0.2));
        } else if (code > -1.5) {
          // flat roofs: bitumen and gravel patches, pale membrane on some
          float n1 = bn(vBW.xz * 0.25), n2 = bn(vBW.xz * 1.7);
          diffuseColor.rgb *= 0.7 + 0.45 * n1 + 0.15 * n2;
        } else if (code < -3.5) {
          // clay tiles: courses
          diffuseColor.rgb *= 0.78 + 0.22 * step(0.3, fract(vFac.y * 3.2)) + 0.1 * bn(vBW.xz * 2.0);
        } else {
          diffuseColor.rgb *= 0.9 + 0.12 * bn(vBW.xz * 0.6 + vBW.y);
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        // windows stay legible as a skyline when they shrink below a pixel
        totalEmissiveRadiance += wEmit * 1.5 * uWinGain * (1.0 + 1.2 * smoothstep(350.0, 2500.0, length(vBW - cameraPosition)));
        // street lights wash the lower walls (sodium, falling off with height)
        if (code >= 0.0 || (code < -1.5 && code > -3.5)) totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.58, 0.28) * 0.07 * exp(-max(vFac.y, 0.0) / 5.0);`);
  };
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'buildings';
  group.add(mesh);
  return { mesh, uniforms, extras, tris: P.length / 9 };
}
