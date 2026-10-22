// Distant lights that give the night its depth: Dimona, Be'er Sheva on the western horizon,
// Bedouin villages, Route 31 and Route 90 along the Dead Sea, the Ein Bokek hotels, the
// Dead Sea Works, and Karak's lights on the Moab plateau in Jordan.
import * as THREE from 'three';
import { heightAt, groundAt, GEO } from '../world/geo.js';
import { makeRng } from '../core/rng.js';
import { makeGlowPoints } from './city.js';

export function createDistant(ctx) {
  const rng = makeRng(ctx.params.seed, 'distant');
  const P = [], C = [], S = [];
  const warm = [1.0, 0.6, 0.28], white = [0.9, 0.9, 1.0];
  const add = (x, z, col, gain, size, lift = 3) => { P.push(x, groundAt(x, z) + lift, z); C.push(col[0] * gain, col[1] * gain, col[2] * gain); S.push(size); };
  const cluster = (cx, cz, r, n, gain, size, coolP = 0.25) => {
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, Math.PI * 2), rr = r * Math.sqrt(-Math.log(1 - rng.next() * 0.97)) * 0.55;
      add(cx + Math.cos(a) * rr, cz + Math.sin(a) * rr * 0.8, rng.chance(coolP) ? white : warm, gain * rng.range(0.5, 1.4), size);
    }
  };
  cluster(GEO.dimona.x, GEO.dimona.z, GEO.dimona.r, 900, 3.2, 6);
  cluster(GEO.beersheba.x, GEO.beersheba.z, GEO.beersheba.r, 2600, 3.0, 18);
  cluster(GEO.karak.x, GEO.karak.z, GEO.karak.r, 500, 2.4, 14, 0.4);
  for (let i = 0; i < 16; i++) cluster(rng.range(-14000, -1500), rng.range(-6000, 9000), rng.range(120, 380), rng.int(15, 60), 2.0, 5, 0.1); // Bedouin villages
  for (let i = 0; i < 9; i++) cluster(rng.range(19000, 36000), rng.range(-16000, 14000), rng.range(250, 700), rng.int(20, 70), 1.8, 12, 0.35); // Jordanian villages
  cluster(10100, 9200, 700, 240, 3.0, 7, 0.5);   // Ein Bokek hotels
  cluster(10400, 19500, 1300, 260, 3.0, 9, 0.1); // Dead Sea Works
  for (const r of ctx.layout.roads) {
    if (!r.lit) continue;
    for (let i = 1; i < r.pts.length; i++) {
      const [x0, z0] = r.pts[i - 1], [x1, z1] = r.pts[i], L = Math.hypot(x1 - x0, z1 - z0);
      for (let d = 0; d < L; d += 55) { const t = d / L; add(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, warm, 2.6, 4, 8); }
    }
  }
  const pts = makeGlowPoints(new Float32Array(P), new Float32Array(C), new Float32Array(S), 1.2);
  pts.name = 'distant-lights';
  ctx.scene.add(pts);
  return { pts };
}
