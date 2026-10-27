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
  // ends: ease in/out to rest unless a velocity is given, or keep the chord velocity (keys.linear:
  // the camera is still moving at a cut, like a dolly that runs through the edit)
  if (i === 0 || i === keys.length - 1) {
    if (!keys.linear) return [0, 0, 0];
    const A = keys[0], B = keys[keys.length - 1];
    return [0, 1, 2].map((j) => (B[f][j] - A[f][j]) / (B.t - A.t));
  }
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
// introLen; the title card is u 0.36-0.68):
//   0-8.8 s  skim the Dead Sea shore, then fly the wadi floor 18-30 m above the ground so its
//            walls and the slope fill the frame;
//   9.8 s    crest the rim 2-3 km from Arad: the town's lights rise over the ridge on the title;
//   10-14 s  push in until the town fills ~60% of the width;
//   14-20 s  low orbit (230-300 m) past the towers, north to west;
//   20.4-24  one rising ease into the gameplay camera (same pose, zero velocity: no pop).
export function introKeys(introLen = 24) {
  const k = introLen / 24;
  const home = rigPose(TACTICAL_HOME);
  const K = [
    // along the foot of the escarpment face (steepest stretch, x ~4800-6000), level horizon,
    // looking up-slope so the rim is a skyline edge on the right of frame
    { t: 0.0, p: [6900, 45, -3300], l: [4200, -40, -2350], fov: 40, agl: true, v: [-160, 0, 300], lv: [-120, 0, 260] },
    { t: 2.6, p: [6250, 40, -2450], l: [3900, -20, -1750], fov: 40, agl: true },
    { t: 5.0, p: [5300, 38, -1750], l: [3200, 10, -1250], fov: 41, agl: true },
    { t: 7.2, p: [4100, 32, -1350], l: [1800, 25, -800], fov: 42, agl: true },
    { t: 9.4, p: [2700, 30, -1000], l: [0, 15, -150], fov: 44, agl: true },        // crest: Arad rises over the ridge line
    { t: 11.0, p: [1150, 85, -650], l: [-50, 35, -60], fov: 46, agl: true, roll: 0.015 },
    { t: 12.6, p: [330, 78, -360], l: [-160, 30, 90], fov: 48, agl: true, roll: 0.03 },   // past the towers
    { t: 14.0, p: [-320, 110, -480], l: [20, 25, 40], fov: 48, agl: true, roll: 0.025 },
    { t: 17.0, p: [-1000, 260, -800], l: [180, 10, -20], fov: 48, agl: true },
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
// Recommended: --t 238 --len 30 --ui 0 (covers 238-268). Shots are keyed to SIM time (they stay locked to the events
// and slow down with slow motion). Subjects (s) and anchors (a) are the logged positions of seed-1
// events (Node sim == browser): each frame the look is solved so the subject sits in the upper part
// of the frame and the anchor (town, impact site) in the lower third, tilt limited; keys run at
// constant velocity through the cuts (linear) so the camera never stops before an edit.
//   238.0 warheads inbound over the skyline  244.4 Sling ripple from Arad North (launches 244.8-248.2)
//   250.0 Sling kills over the south of town (250.4-253.9)  254.0 Nevatim impact (254.6), close & low
//   257.6 Arrow 3 kills over the Dead Sea (258.8-261.0)  262.0 smoke and debris drifting over Arad
const shot = (name, keys) => { keys.linear = true; return { name, keys }; };
export const TRAILER = [
  shot('A-warheads-over-skyline', [
    { t: 238.0, p: [-1250, 55, 560], s: [27000, 24000, 2300], a: [0, 25, 0], fov: 64, agl: true },
    { t: 244.4, p: [-900, 70, 380], s: [13000, 17500, 3300], a: [0, 25, 0], fov: 64, agl: true },
  ]),
  shot('B-sling-ripple', [
    { t: 244.4, p: [170, 62, 620], s: [-120, 380, -1080], a: [-120, 0, -1080], fov: 56 },
    { t: 247.0, p: [150, 70, 500], s: [-200, 1400, -600], a: [-120, 0, -1080], fov: 58 },
    { t: 250.0, p: [120, 80, 360], s: [-500, 2600, 600], a: [-60, 0, -700], fov: 60 },
  ]),
  shot('C-kills-over-the-towers', [
    { t: 250.0, p: [-260, 26, -720], s: [-900, 6900, 2700], a: [-100, 20, 0], fov: 68, agl: true, tilt: 36 },
    { t: 254.0, p: [-200, 34, -640], s: [-1400, 6400, 3000], a: [-100, 20, 0], fov: 68, agl: true, tilt: 36 },
  ]),
  shot('D-nevatim-impact', [
    { t: 254.0, p: [-6050, 100, 1300], s: [-6797, -40, 2100], a: [-6797, -150, 2100], fov: 50, agl: true },
    { t: 257.6, p: [-6180, 108, 1480], s: [-6797, 40, 2100], a: [-6797, -150, 2100], fov: 50, agl: true },
  ]),
  shot('E-arrow-over-arad', [
    { t: 257.6, p: [-520, 28, 160], s: [16200, 19700, 2800], a: [200, 25, 0], fov: 66, agl: true, tilt: 32 },
    { t: 262.0, p: [-430, 34, 120], s: [16000, 19400, 2800], a: [200, 25, 0], fov: 66, agl: true, tilt: 32 },
  ]),
  shot('F-pullback-over-rooftops', [
    { t: 262.0, p: [-700, 35, 650], s: [-6700, 500, 2400], a: [-850, 10, 520], fov: 54, agl: true },
    { t: 268.0, p: [-250, 175, 420], s: [-6700, 800, 2400], a: [-850, 10, 520], fov: 56, agl: true },
  ]),
];
const _sa = { p: [0, 0, 0], l: [0, 0, 0] }, _sb = { p: [0, 0, 0], l: [0, 0, 0] };
// look solve: subject above, anchor in the lower third, yaw biased toward the subject
function frameLook(p, s, a, fov0, out, tiltMax = 26) {
  const ys = Math.atan2(s[2] - p[2], s[0] - p[0]), ya = Math.atan2(a[2] - p[2], a[0] - p[0]);
  let dy = ys - ya; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  const yaw = ya + dy * 0.62;
  const es = Math.atan2(s[1] - p[1], Math.hypot(s[0] - p[0], s[2] - p[2]));
  const ea = Math.atan2(a[1] - p[1], Math.hypot(a[0] - p[0], a[2] - p[2]));
  const D = Math.PI / 180;
  const fov = clamp(Math.max(fov0, ((es - ea) / D) / 0.66), 40, 68) * D;
  let c = ea + 0.3 * fov;                       // anchor on the lower-third line
  if (es > c + 0.36 * fov) c = es - 0.36 * fov;  // never lose the subject off the top
  c = Math.min(c, tiltMax * D);                  // tilt limit: keep the world in the frame
  out.l[0] = p[0] + Math.cos(yaw) * Math.cos(c) * 1000; out.l[1] = p[1] + Math.sin(c) * 1000; out.l[2] = p[2] + Math.sin(yaw) * Math.cos(c) * 1000;
  out.fov = fov / D;
  return out;
}
export function trailerAt(t, out = { p: [0, 0, 0], l: [0, 0, 0], fov: 50 }) {
  let sh = TRAILER[0];
  for (const x of TRAILER) if (t >= x.keys[0].t) sh = x;
  const K = sh.keys, tt = clamp(t, K[0].t, K[K.length - 1].t);
  // reuse the Hermite evaluator: p as p, subject as l; then the anchor
  const ks = K.map((k) => ({ t: k.t, p: k.p, l: k.s, fov: k.fov, agl: k.agl })); ks.linear = true;
  const ka = K.map((k) => ({ t: k.t, p: k.a, l: k.a, fov: k.fov })); ka.linear = true;
  evalKeys(ks, tt, _sa); evalKeys(ka, tt, _sb);
  out.p[0] = _sa.p[0]; out.p[1] = _sa.p[1]; out.p[2] = _sa.p[2];
  frameLook(out.p, _sa.l, _sb.p, _sa.fov, out, K[0].tilt || 26);
  out.shot = sh.name; out.roll = 0;
  return out;
}
