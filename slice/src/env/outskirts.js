// Env-only decoration that turns the town plan into a place (none of this touches the sim):
//  - outskirts: a light-industrial edge by the town gate, scattered low farm/Bedouin-style
//    houses with yards, and unlit dirt tracks wandering out into the desert, so Arad does not end
//    at a hard perimeter road;
//  - block interiors: paved parking courts with parked cars, scrub gardens, dirt compounds and
//    play areas, as tilted ground decals (one instanced draw call).
import * as THREE from 'three';
import { heightAt, GEO } from '../world/geo.js';
import { makeRng } from '../core/rng.js';
import { GN_GLSL } from './terrain.js';

const segDist = (px, pz, ax, az, bx, bz) => {
  const vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / L2));
  return Math.hypot(px - ax - vx * t, pz - az - vz * t);
};

export function planOutskirts(ctx) {
  const { layout } = ctx;
  const rng = makeRng(ctx.params.seed, 'outskirts');
  const B = layout.buildings;
  const extra = [], decals = [], cars = [];
  const keep = [];
  for (const p of layout.pads) keep.push({ x: p.x, z: p.z, r: 90 });
  for (const s of layout.shelters) keep.push({ x: s.x, z: s.z, r: 20 });
  for (const g of layout.groups) keep.push({ x: g.x, z: g.z, r: g.spread + 10 });
  keep.push({ x: GEO.lookout.x, z: GEO.lookout.z, r: 140 });
  const ell = (x, z) => Math.hypot(x / GEO.town.rx, z / GEO.town.rz);
  const segs = [], lights = [];
  const nearRoad = (x, z, m) => {
    for (const r of layout.roads) for (let i = 1; i < r.pts.length; i++) if (segDist(x, z, r.pts[i - 1][0], r.pts[i - 1][1], r.pts[i][0], r.pts[i][1]) < m + r.w / 2) return true;
    for (const e of layout.edges) { if (!e.on) continue; const A = layout.nodes[e.a], C = layout.nodes[e.b]; if (segDist(x, z, A.x, A.z, C.x, C.z) < m + e.w / 2) return true; }
    for (const g of segs) if (segDist(x, z, g.ax, g.az, g.bx, g.bz) < m + g.w / 2) return true;
    return false;
  };
  const clearOf = (x, z, w, d, margin) => {
    for (const k of keep) if (Math.hypot(x - k.x, z - k.z) < k.r + Math.max(w, d) / 2) return false;
    for (const b of B.concat(extra)) if (b.type !== 'wall' && Math.abs(x - b.x) < (b.w + w) / 2 + margin && Math.abs(z - b.z) < (b.d + d) / 2 + margin) return false;
    return true;
  };
  const addB = (b) => { b.id = B.length + extra.length; b.y = heightAt(b.x, b.z); b.seed = rng.next(); b.h = b.type === 'wall' ? b.h : b.floors * (b.type === 'slab' ? 3.0 : 3.1) + (b.type === 'shed' ? 2.5 : b.type === 'house' ? 1.2 : 1.6); b.rot = b.rot || 0; extra.push(b); return b; };
  const wall = (ax, az, bx, bz, h = 1.8) => { const L = Math.hypot(bx - ax, bz - az); addB({ type: 'wall', x: (ax + bx) / 2, z: (az + bz) / 2, w: L, d: 0.25, h, floors: 0, rot: Math.atan2(bz - az, bx - ax) }); };
  const light = (x, z, ux, uz, h = 7.5, kind = 'sodium') => lights.push({ x, z, y: heightAt(x, z), h, kind, armX: ux, armZ: uz });
  // a street segment of a new neighbourhood: drawn and lit like the town's own streets
  const street = (ax, az, bx, bz, w = 10, lit = true) => {
    const g = { ax, az, bx, bz, w, kind: w >= 12 ? 'street' : 'lane' }; segs.push(g);
    if (!lit) return g;
    const L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L, nx = -uz, nz = ux;
    for (let k = 0, u = 16; u < L - 8; u += 34, k++) { const sd = k % 2 ? 1 : -1; light(ax + ux * u + nx * (w / 2 + 1.2) * sd, az + uz * u + nz * (w / 2 + 1.2) * sd, -nx * sd, -nz * sd); }
    return g;
  };
  const polyStreet = (pts, w, lit = true) => { for (let i = 1; i < pts.length; i++) street(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], w, lit); };
  // buildings fronting a street on both sides
  const frontage = (g, spacing, make, setback) => {
    const L = Math.hypot(g.bx - g.ax, g.bz - g.az), ux = (g.bx - g.ax) / L, uz = (g.bz - g.az) / L, nx = -uz, nz = ux;
    for (let u = spacing * 0.6; u < L - spacing * 0.4; u += spacing * rng.range(0.85, 1.15)) for (const sd of [-1, 1]) {
      if (rng.chance(0.15)) continue;
      const b = make(); const off = g.w / 2 + setback + b.d / 2;
      const x = g.ax + ux * u + nx * off * sd, z = g.az + uz * u + nz * off * sd;
      if (nearRoad(x, z, b.d / 2 + 0.5) || !clearOf(x, z, b.w + 3, b.d + 3, 2)) continue;
      b.x = x; b.z = z; b.rot = Math.atan2(uz, ux) + rng.range(-0.03, 0.03);
      addB(b);
      if (b.type === 'house' && rng.chance(0.5)) decals.push({ type: 1, x: x + nx * sd * (b.d / 2 + 4), z: z + nz * sd * (b.d / 2 + 4), w: b.w + 4, d: 7, rot: b.rot + Math.PI / 2 });
    }
  };
  const node = (x, z) => { let best = null, bd = 1e9; for (const n of layout.nodes) { if (!n.adj.some((id) => layout.edges[id].on)) continue; const d = Math.hypot(n.x - x, n.z - z); if (d < bd) { bd = d; best = n; } } return best; };

  // 1) south: a villa quarter on a looping lane, joined to the town's southern edge
  {
    const cx = -60, cz = 930, rx = 330, rz = 150, loop = [];
    for (let k = 0; k <= 20; k++) { const a = (k / 20) * Math.PI * 2; loop.push([cx + Math.cos(a) * rx, cz + Math.sin(a) * rz]); }
    const top = [cx, cz - rz], n0 = node(cx, cz - rz - 200);
    street(n0.x, n0.z, top[0], top[1], 10);
    polyStreet(loop, 9);
    street(cx - 120, cz, cx + 140, cz + 10, 8);
    const before = segs.length;
    for (const g of segs.slice(0)) if (g.az > 650 || g.bz > 650) frontage(g, 19, () => ({ type: 'house', w: rng.range(11, 15), d: rng.range(9, 12), floors: rng.chance(0.4) ? 2 : 1 }), 5);
    void before;
  }
  // 2) north-east: a newer quarter of 4-6 storey slabs on a curving street
  {
    const n0 = node(380, -760);
    const pts = [[n0.x, n0.z], [n0.x + 20, -780], [420, -900], [560, -980], [760, -990]];
    const s0 = segs.length;
    polyStreet(pts, 12);
    street(420, -900, 300, -1010, 10);
    for (const g of segs.slice(s0)) frontage(g, 44, () => ({ type: 'slab', w: rng.range(30, 46), d: 12, floors: rng.int(4, 6) }), 9);
  }
  // 3) west: light industry along Route 31 beyond the gate, sheds in fenced compounds
  {
    const xsI = [-1010, -1260, -1500];
    for (const x of xsI) street(x, -300, x, 400, 12);
    street(-1010, -300, -1500, -300, 12); street(-1010, 400, -1500, 400, 12);
    for (let a = 0; a < 2; a++) for (const [z0, z1] of [[-290, -40], [130, 390]]) {
      const x0 = xsI[a] - 8, x1 = xsI[a + 1] + 8; // cell between two side streets (x0 > x1)
      for (let k = 0; k < 9; k++) {
        const w = rng.range(22, 44), d = rng.range(16, 28);
        const x = (x0 + x1) / 2 + rng.range(-70, 70), z = z0 + rng.range(30, z1 - z0 - 30);
        if (nearRoad(x, z, Math.max(w, d) / 2 + 6) || !clearOf(x, z, w + 20, d + 20, 3)) continue;
        addB({ type: 'shed', x, z, w, d, floors: 1 });
        const fw = w / 2 + 9, fd = d / 2 + 9;
        wall(x - fw, z - fd, x + fw, z - fd); wall(x - fw, z + fd, x + fw, z + fd); wall(x - fw, z - fd, x - fw, z + fd);
        wall(x + fw, z - fd, x + fw, z - 4); wall(x + fw, z + 4, x + fw, z + fd);
        light(x + fw + 1, z + 5, -1, 0, 6, 'led');
        decals.push({ type: 2, x, z, w: fw * 2 - 1, d: fd * 2 - 1, rot: 0 });
      }
    }
  }
  // 4) three fenced farm / Bedouin-style compounds out in the desert, each with a gate light and a faint track
  for (const [cx, cz] of [[-2100, -900], [-1900, 1250], [1300, 900]]) {
    const R = 34;
    for (let k = 0; k < 4; k++) {
      const x = cx + rng.range(-R + 8, R - 8), z = cz + rng.range(-R + 8, R - 8);
      if (!clearOf(x, z, 12, 10, 2)) continue;
      addB(rng.chance(0.4) ? { type: 'shed', x, z, w: rng.range(12, 18), d: rng.range(8, 12), floors: 1 } : { type: 'house', x, z, w: rng.range(9, 13), d: rng.range(8, 10), floors: 1 });
    }
    wall(cx - R, cz - R, cx + R, cz - R); wall(cx - R, cz + R, cx + R, cz + R); wall(cx - R, cz - R, cx - R, cz + R);
    wall(cx + R, cz - R, cx + R, cz - 5); wall(cx + R, cz + 5, cx + R, cz + R);
    light(cx + R + 1, cz, -1, 0, 5, 'sodium');
    decals.push({ type: 2, x: cx, z: cz, w: R * 2 - 1, d: R * 2 - 1, rot: 0 });
    let px = cx + R, pz = cz, ang = Math.atan2(-cz, -cx);
    for (let s = 0; s < 18; s++) {
      const L = 42, nx = px + Math.cos(ang) * L, nz = pz + Math.sin(ang) * L;
      if (ell(nx, nz) < 1.05 || nearRoad(nx, nz, 4)) break;
      decals.push({ type: 4, x: (px + nx) / 2, z: (pz + nz) / 2, w: 5, d: L + 4, rot: Math.atan2(nx - px, nz - pz) });
      px = nx; pz = nz; ang += rng.range(-0.25, 0.25);
    }
  }
  // block interiors: parking courts (with cars), scrub gardens, play areas
  for (const bl of layout.blocks) {
    if (bl.zone === 'park') continue;
    const want = bl.zone === 'outer' ? 1 : 3;
    for (let n = 0, tries = 0; n < want && tries < 40; tries++) {
      const park = rng.chance(0.55);
      const w = park ? rng.range(22, 34) : rng.range(10, 22), d = park ? 15 : rng.range(9, 18);
      const x = rng.range(bl.x0 + w / 2 + 2, bl.x1 - w / 2 - 2), z = rng.range(bl.z0 + d / 2 + 2, bl.z1 - d / 2 - 2);
      if (!(bl.x1 - bl.x0 > w + 4 && bl.z1 - bl.z0 > d + 4) || !clearOf(x, z, w, d, 2)) continue;
      if (park) {
        decals.push({ type: 0, x, z, w, d, rot: 0 });
        for (const row of [-1, 1]) for (let u = -w / 2 + 1.6; u < w / 2 - 1.2; u += 2.6) {
          if (rng.chance(0.35)) continue;
          const cxp = x + u, czp = z + row * 4.4;
          cars.push({ x: cxp, z: czp, y: heightAt(cxp, czp) + 0.2, yaw: row > 0 ? 0 : Math.PI, c: rng.int(0, 99) });
        }
      } else decals.push({ type: rng.chance(0.75) ? 1 : 3, x, z, w, d, rot: rng.range(-0.2, 0.2) });
      keep.push({ x, z, r: Math.max(w, d) / 2 });
      n++;
    }
  }
  return { extra, decals, cars, segs, lights };
}

export function buildDecals(ctx, group, decals) {
  const n = decals.length;
  if (!n) return null;
  const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const aDec = new Float32Array(n * 4);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aDec; varying vec4 vDec; varying vec2 vDu; varying vec3 vDW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDec = aDec; vDu = uv; vDW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        varying vec4 vDec; varying vec2 vDu; varying vec3 vDW;
        ${GN_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float type = vDec.x; vec2 m = (vDu - 0.5) * vDec.yz; // metres from centre
        vec2 e = 0.5 * vDec.yz - abs(m);                       // metres from edge
        float nz = gN(vDW.xz * 0.35 + vDec.w * 7.0);
        vec3 col;
        if (type < 0.5) { // parking court: asphalt, stall lines, kerb
          col = vec3(0.075, 0.075, 0.08) * (0.85 + 0.3 * gN(vDW.xz * 0.2));
          float stall = (1.0 - smoothstep(0.06, 0.12, abs(fract((m.x + 0.0) / 2.6) - 0.5) * 2.6 - 1.24)) * step(1.6, abs(m.y)) * step(abs(m.y), 6.6);
          col = mix(col, vec3(0.5, 0.5, 0.48), stall * 0.6);
          col = mix(col, vec3(0.45, 0.43, 0.4), 1.0 - smoothstep(0.2, 0.45, min(e.x, e.y)));
        } else if (type < 1.5) { // scrub garden: dry grass, darker shrubs, ragged edge
          if (min(e.x, e.y) < 2.5 * nz) discard;
          col = mix(vec3(0.16, 0.16, 0.09), vec3(0.08, 0.11, 0.06), smoothstep(0.45, 0.7, gN(vDW.xz * 0.6)));
        } else if (type < 2.5) { // compacted dirt compound with a fence line
          if (min(e.x, e.y) < 1.5 * nz) discard;
          col = vec3(0.36, 0.31, 0.25) * (0.85 + 0.3 * nz);
        } else if (type < 3.5) { // play area: rubber surface and sand pit
          col = mix(vec3(0.28, 0.12, 0.09), vec3(0.42, 0.37, 0.28), step(0.0, m.x));
          col = mix(col, vec3(0.4, 0.4, 0.38), 1.0 - smoothstep(0.15, 0.35, min(e.x, e.y)));
        } else { // dirt track: two wheel ruts, soft edges
          float v = abs(m.x);
          if (v > 2.75 - 0.6 * nz) discard;
          col = vec3(0.37, 0.32, 0.26) * (0.9 + 0.2 * nz) * (1.0 - 0.18 * (1.0 - smoothstep(0.2, 0.5, abs(v - 1.1))));
        }
        diffuseColor.rgb = col;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float townK = exp(-dot(vDW.xz / vec2(820.0, 700.0), vDW.xz / vec2(820.0, 700.0)) * 1.4);
        totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.62, 0.32) * 0.3 * townK;`);
  };
  mat.customProgramCacheKey = () => 'env-decals';
  const im = new THREE.InstancedMesh(geo, mat, n);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), qa = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), nrm = new THREE.Vector3();
  decals.forEach((d, i) => {
    const e = 3, h = heightAt(d.x, d.z);
    nrm.set(heightAt(d.x - e, d.z) - heightAt(d.x + e, d.z), 2 * e, heightAt(d.x, d.z - e) - heightAt(d.x, d.z + e)).normalize();
    qa.setFromUnitVectors(up, nrm); q.setFromAxisAngle(up, d.rot); q.premultiply(qa);
    m4.compose(p.set(d.x, h + (d.type === 4 ? 0.35 : 0.24), d.z), q, s.set(d.w, 1, d.d)); im.setMatrixAt(i, m4);
    aDec.set([d.type, d.w, d.d, (i * 0.618) % 1], i * 4);
  });
  geo.setAttribute('aDec', new THREE.InstancedBufferAttribute(aDec, 4));
  im.renderOrder = 1; im.name = 'ground-decals';
  group.add(im);
  return im;
}
