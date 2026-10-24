// Tactical RTS rig maths: zoom range and the zoom->pitch curve (AoE IV / CoH3 style: steep when
// far, shallow when near), ground picking, the town roof-height grid used for anti-clipping, and
// the clearance solve (keeps the camera and its sight line above terrain and buildings).
import * as THREE from 'three';
import { groundAt } from '../world/geo.js';

export const ZMIN = 150, ZMAX = 12000;
export const BOUNDS = { x0: -14000, x1: 12000, z0: -9000, z1: 9000 };
const LZ = Math.log(ZMAX / ZMIN);
export const zoomU = (d) => Math.min(1, Math.max(0, Math.log(d / ZMIN) / LZ));
// pitch (radians above the horizon) from distance: ~22 deg at 150 m, ~35 deg at 2.6 km, ~60 deg at 12 km
export const pitchCurve = (d) => 0.38 + 0.66 * Math.pow(zoomU(d), 2.4);

// ray from a camera through client pixel (x, y) -> ground point (or null above the horizon)
const _o = new THREE.Vector3(), _d = new THREE.Vector3();
export function pickGround(camera, x, y, w, h, out = new THREE.Vector3()) {
  _o.setFromMatrixPosition(camera.matrixWorld);
  _d.set((x / w) * 2 - 1, -(y / h) * 2 + 1, 0.5).unproject(camera).sub(_o).normalize();
  return marchGround(_o, _d, out);
}
export function marchGround(o, d, out) {
  if (d.y > -0.002) return null;
  let a = 0, b = 0, hit = false;
  // coarse march (geometric steps), then bisection
  for (let s = 20, i = 0; i < 48; i++, s *= 1.18) {
    const t = b + s, y = o.y + d.y * t;
    if (y <= groundAt(o.x + d.x * t, o.z + d.z * t)) { a = b; b = t; hit = true; break; }
    b = t; if (b > 90000) break;
  }
  if (!hit) return null;
  for (let i = 0; i < 18; i++) {
    const m = (a + b) / 2;
    if (o.y + d.y * m <= groundAt(o.x + d.x * m, o.z + d.z * m)) b = m; else a = m;
  }
  return out.set(o.x + d.x * b, o.y + d.y * b, o.z + d.z * b);
}
// intersect the ray through pixel (x, y) of a frozen camera with the plane y = h (drag-panning)
export function rayPlane(camWorld, projInv, x, y, w, h, planeY, out) {
  _o.setFromMatrixPosition(camWorld);
  _d.set((x / w) * 2 - 1, -(y / h) * 2 + 1, 0.5).applyMatrix4(projInv).applyMatrix4(camWorld).sub(_o).normalize();
  // never let the ray reach the horizon: clamp its slope so a drag near the horizon stays finite
  if (_d.y > -0.03) { _d.y = -0.03; _d.normalize(); }
  const t = (planeY - _o.y) / _d.y;
  return out.set(_o.x + _d.x * t, planeY, _o.z + _d.z * t);
}

// roof heights over the town on a 20 m grid (max roof + margin per cell)
export function makeRoofGrid(layout) {
  const C = 20, X0 = -1200, Z0 = -1200, N = 120;
  const g = new Float32Array(N * N).fill(-1e9);
  for (const b of layout.buildings) {
    const r = Math.hypot(b.w, b.d) / 2 + 6, top = b.y + b.h;
    for (let x = b.x - r; x <= b.x + r; x += C / 2) for (let z = b.z - r; z <= b.z + r; z += C / 2) {
      const i = Math.floor((x - X0) / C), j = Math.floor((z - Z0) / C);
      if (i >= 0 && j >= 0 && i < N && j < N) g[j * N + i] = Math.max(g[j * N + i], top);
    }
  }
  return (x, z) => { const i = Math.floor((x - X0) / C), j = Math.floor((z - Z0) / C); return i >= 0 && j >= 0 && i < N && j < N ? g[j * N + i] : -1e9; };
}

// minimum height for a camera at (x, z): terrain/roofs plus a margin
export function floorAt(roof, x, z, margin = 6) { return Math.max(groundAt(x, z), roof(x, z)) + margin; }
// how much to raise the camera so the sight line to the target clears terrain and roofs
export function sightLift(roof, cx, cy, cz, tx, ty, tz) {
  let lift = floorAt(roof, cx, cz) - cy;
  for (let k = 1; k <= 4; k++) {
    const f = k / 5, x = cx + (tx - cx) * f, z = cz + (tz - cz) * f, y = cy + (ty - cy) * f;
    const need = (floorAt(roof, x, z, 4) - y) / (1 - f);
    if (need > lift) lift = need;
  }
  return Math.max(0, lift);
}
