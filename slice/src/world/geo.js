// World conventions: 1 unit = 1 metre. +x east, +y up, +z south (north is -z).
// Geography is compressed and stylised (the real Nevatim is ~25 km west of Arad).
// Threats come from the east: over the Moab mountains (Jordan) and the Dead Sea rift.
import { fbm, ridged, smoothstep, lerp } from '../core/util.js';

export const GEO = {
  town: { name: 'Arad', x: 0, z: 0, rx: 800, rz: 680 },
  nevatim: { name: 'Nevatim Air Base', x: -6800, z: 2900, r: 1800, heading: 0.52 },
  dimona: { name: 'Dimona', x: -3600, z: 13800, r: 1500 },
  beersheba: { name: "Be'er Sheva", x: -30000, z: 2600, r: 6000 },
  karak: { name: 'Karak (Jordan)', x: 27500, z: 2200, r: 1300 },
  deadSea: { x0: 9600, x1: 16400, level: -400 },
  arrowSite: { name: 'Arrow 3 battery', x: -26000, z: -7500 },
  lookout: { x: 900, z: -10 },
};

// Terrain height in metres (town plateau ~ 0). Shared by sim (ground contact) and env (mesh).
export function heightAt(x, z) {
  const n1 = fbm(x * 0.00045 + 7.1, z * 0.00045 - 3.3, 4);
  const n2 = fbm(x * 0.0021 + 1.7, z * 0.0021 + 9.2, 3);
  const r1 = ridged(x * 0.0009 + 11.3, z * 0.0009 + 2.1, 4);
  let h = (n1 - 0.5) * 70 + (n2 - 0.5) * 16;
  // west: down to the Nevatim plain
  h -= 150 * smoothstep(-1800, -7000, x);
  // north: Judean desert hills
  h += 240 * smoothstep(-2600, -10000, z) * (0.45 + 0.8 * r1);
  // east: the escarpment down to the Dead Sea, with a wandering edge and wadis
  const warp = (fbm(z * 0.0006 + 40.0, x * 0.0002 + 3.0, 3) - 0.5) * 2000;
  const ex = x + warp;
  const drop = smoothstep(2700, 8600, ex);
  const terr = Math.sin(ex * 0.006) * 9 * drop * (1 - drop) * 4;           // terraces on the slope
  const wadi = (1 - ridged(x * 0.0016 + 5.0, z * 0.0011 - 8.0, 3)) * 120 * drop * (1 - drop) * 4;
  h = lerp(h, -398 - 30 * smoothstep(9000, 11000, ex), drop) + terr - wadi;
  // Moab: the Jordanian mountains rising beyond the sea
  const mx = x - (fbm(z * 0.0004 + 90.0, 1.3, 3) - 0.5) * 2600;
  const moab = smoothstep(16200, 21500, mx);
  h = lerp(h, 420 + 360 * r1 + (n1 - 0.5) * 240, moab);
  // flatten the town and the airbase
  const tx = x / (GEO.town.rx * 1.35), tz = z / (GEO.town.rz * 1.35);
  const flat = 1 - smoothstep(0.5, 1.0, tx * tx + tz * tz);
  h = lerp(h, (n1 - 0.5) * 14, flat);
  const nx = (x - GEO.nevatim.x) / 2600, nz = (z - GEO.nevatim.z) / 1900;
  const nflat = 1 - smoothstep(0.55, 1.0, nx * nx + nz * nz);
  h = lerp(h, -150 + (n1 - 0.5) * 6, nflat);
  return h;
}

// ground surface including water (the Dead Sea surface is the ground for threats/debris)
export function groundAt(x, z) {
  const h = heightAt(x, z);
  return h < GEO.deadSea.level && x > 7000 && x < 19000 ? GEO.deadSea.level : h;
}

export function inTown(x, z, pad = 0) {
  const a = (x - GEO.town.x) / (GEO.town.rx + pad), b = (z - GEO.town.z) / (GEO.town.rz + pad);
  return a * a + b * b < 1;
}
export function inNevatim(x, z) {
  return Math.hypot(x - GEO.nevatim.x, z - GEO.nevatim.z) < GEO.nevatim.r;
}
