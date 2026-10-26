// Authored camera paths: time-parametrised cubic Hermite splines (no THREE, so tools can
// evaluate them in Node). Keys: { t, p:[x,y,z], l:[x,y,z], fov, agl? } where `agl` means p[1] is
// metres above the ground (resolved with groundAt at evaluation time). Tangents are non-uniform
// Catmull-Rom (finite differences over key time), so speed follows key spacing; an optional
// `v` / `lv` on a key overrides the position / look-target velocity (m/s) there.
import { groundAt } from '../world/geo.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function tangent(keys, i, f) {
  const k = keys[i];
  if (f === 'p' && k.v) return k.v;
  if (f === 'l' && k.lv) return k.lv;
  const a = keys[Math.max(0, i - 1)], b = keys[Math.min(keys.length - 1, i + 1)];
  if (a === b) return [0, 0, 0];
  // ends: ease in/out to rest unless a velocity is given
  if (i === 0 || i === keys.length - 1) return [0, 0, 0];
  const dt = b.t - a.t;
  return [0, 1, 2].map((j) => (b[f][j] - a[f][j]) / dt);
}
function herm(keys, f, i, s, h, out) {
  const A = keys[i], B = keys[i + 1], mA = tangent(keys, i, f), mB = tangent(keys, i + 1, f);
  const s2 = s * s, s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
  for (let j = 0; j < 3; j++) out[j] = h00 * A[f][j] + h10 * h * mA[j] + h01 * B[f][j] + h11 * h * mB[j];
  return out;
}
// evaluate a key list at time t -> { p, l, fov }
export function evalKeys(keys, t, out = { p: [0, 0, 0], l: [0, 0, 0], fov: 50 }) {
  if (t <= keys[0].t) return fill(keys, 0, 0, out);
  if (t >= keys[keys.length - 1].t) return fill(keys, keys.length - 2, 1, out);
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1].t) i++;
  const h = keys[i + 1].t - keys[i].t;
  return fill(keys, i, (t - keys[i].t) / h, out);
}
function fill(keys, i, s, out) {
  const h = keys[i + 1].t - keys[i].t;
  herm(keys, 'p', i, s, h, out.p);
  herm(keys, 'l', i, s, h, out.l);
  const A = keys[i], B = keys[i + 1], e = s * s * (3 - 2 * s);
  out.fov = (A.fov ?? 50) + ((B.fov ?? 50) - (A.fov ?? 50)) * e;
  const agl = (A.agl ? 1 : 0) + ((B.agl ? 1 : 0) - (A.agl ? 1 : 0)) * e;
  if (agl > 0) out.p[1] += groundAt(out.p[0], out.p[2]) * agl;
  out.roll = (A.roll || 0) + ((B.roll || 0) - (A.roll || 0)) * e;
  return out;
}

// ---------------------------------------------------------------- tactical pose maths (shared)
export const TACTICAL_HOME = { tx: 250, tz: 0, dist: 2600, yaw: 0.35, pitch: 0.62 };
export function rigPose(r, ty = groundAt(r.tx, r.tz)) {
  const cp = Math.cos(r.pitch);
  return {
    p: [r.tx - Math.cos(r.yaw) * r.dist * cp, ty + r.dist * Math.sin(r.pitch), r.tz - Math.sin(r.yaw) * r.dist * cp],
    l: [r.tx, ty, r.tz],
  };
}

// ---------------------------------------------------------------- intro flyover
// Authored at a 24 s length and scaled to pacing.introLen. Beats (HUD cards are fractions of
// introLen): 0–8 s low over the Dead Sea and up the wadi; ~9.6 s crest the rim and Arad's lights
// rise into frame as the IRON WALL title lands (u 0.36–0.68); 13–24 s rise and orbit north of the
// town, easing to rest exactly on the gameplay camera (same pose, zero velocity: no pop).
export function introKeys(introLen = 24) {
  const k = introLen / 24;
  const home = rigPose(TACTICAL_HOME);
  const K = [
    { t: 0.0, p: [10900, -332, -640], l: [6800, -262, -1180], fov: 36, v: [-640, 0, -120], lv: [-560, 10, 0] },
    { t: 3.2, p: [8650, -326, -1060], l: [5300, -170, -1240], fov: 37, roll: -0.02 },
    { t: 6.2, p: [6450, -218, -1080], l: [3600, -40, -1180], fov: 39, roll: 0.025 },
    { t: 8.4, p: [4700, -64, -1240], l: [1900, 30, -700], fov: 42, roll: -0.015 },
    { t: 10.0, p: [3560, 70, -1260], l: [200, 24, -120], fov: 44 },            // crest: the town appears
    { t: 13.2, p: [2350, 290, -1560], l: [60, 14, -40], fov: 45, roll: 0.03 },
    { t: 16.8, p: [880, 560, -2260], l: [80, 6, -20], fov: 46, roll: 0.045 },
    { t: 20.2, p: [-880, 980, -1980], l: [190, 2, -6], fov: 48, roll: 0.03 },
    { t: 24.0, p: home.p, l: home.l, fov: 50 },
  ];
  for (const key of K) {
    key.t *= k;
    if (key.v) key.v = key.v.map((x) => x / k);
    if (key.lv) key.lv = key.lv.map((x) => x / k);
  }
  return K;
}

// ---------------------------------------------------------------- trailer (seed 1, good autopilot)
// Shots keyed to SIM time, so they stay locked to the events (and slow down with slow motion).
// Recommended window: --t 229 --len 30 (Arrow kills overhead 231–232, impacts south and at Nevatim
// 234–239, David's Sling ripple from Arad North 244–250, Sling kills and debris over the town
// 250–257, Arrow 3 star-flashes over the Dead Sea from 258.6). Shot Z covers t 190–229 so the
// suggested 200–232 window also works.
export const TRAILER = [
  { name: 'Z-skyline-east', keys: [
    { t: 190, p: [-1900, 96, 520], l: [9000, 3500, 300], fov: 62 },
    { t: 229.2, p: [-1560, 112, 470], l: [9000, 4300, 300], fov: 64 },
  ] },
  { name: 'A-tilt-up-arrow-overhead', keys: [
    { t: 229.2, p: [-1720, 70, 600], l: [9000, 3700, 300], fov: 62 },
    { t: 231.0, p: [-1600, 82, 540], l: [7000, 4600, 1400], fov: 70 },
    { t: 233.6, p: [-1450, 96, 480], l: [7000, 4900, 1600], fov: 72 },
  ] },
  { name: 'B1-impacts-south', keys: [
    { t: 233.6, p: [-260, 150, 420], l: [1250, 40, 5600], fov: 54 },
    { t: 236.1, p: [-330, 160, 520], l: [1100, 60, 5400], fov: 52 },
  ] },
  { name: 'B2-nevatim-plain', keys: [
    { t: 236.1, p: [-2500, 620, 240], l: [-6400, -140, 2950], fov: 50 },
    { t: 241.2, p: [-2950, 560, 620], l: [-6500, -150, 3050], fov: 48 },
  ] },
  { name: 'C-sling-ripple-over-skyline', keys: [
    { t: 241.2, p: [160, 78, 700], l: [-120, 260, -1080], fov: 56 },
    { t: 244.4, p: [140, 82, 640], l: [-120, 420, -1080], fov: 58 },
    { t: 247.6, p: [110, 88, 580], l: [-140, 900, -700], fov: 62 },
    { t: 249.4, p: [90, 92, 540], l: [-200, 1200, -400], fov: 64 },
  ] },
  { name: 'D-sling-over-town', keys: [
    { t: 249.4, p: [310, 88, -1520], l: [-1500, 2500, 2400], fov: 66 },
    { t: 256.4, p: [160, 112, -1450], l: [-1800, 3000, 2600], fov: 68 },
  ] },
  { name: 'E-finale-arrow-dead-sea', keys: [
    { t: 256.4, p: [-1900, 110, 420], l: [9000, 5400, 650], fov: 58 },
    { t: 264.0, p: [-1600, 150, 380], l: [9000, 6000, 800], fov: 61 },
  ] },
];
export function trailerAt(t, out) {
  let s = TRAILER[0];
  for (const sh of TRAILER) if (t >= sh.keys[0].t) s = sh;
  out = evalKeys(s.keys, clamp(t, s.keys[0].t, s.keys[s.keys.length - 1].t), out);
  out.shot = s.name;
  return out;
}
