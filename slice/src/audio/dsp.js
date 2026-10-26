// Audio DSP helpers: seeded, procedurally generated buffers (noise colours, rocket crackle, the
// Shahed two-stroke loop, crickets, desert wind, an outdoor impulse response), clip-aware
// automation for offline windows, and a WAV encoder. Everything is synthesized: no audio files.
import { makeRng } from '../core/rng.js';

const cache = new Map(); // sampleRate|seed -> buffers (AudioBuffers can be shared across contexts)

export function getBuffers(ac, seed = 1) {
  const key = ac.sampleRate + '|' + seed;
  if (!cache.has(key)) cache.set(key, genBuffers(ac, seed));
  return cache.get(key);
}

function genBuffers(ac, seed) {
  const sr = ac.sampleRate;
  const R = makeRng(seed, 'audio:buffers');
  const mk = (ch, sec) => ac.createBuffer(ch, Math.max(1, Math.round(sec * sr)), sr);
  const white = mk(1, 4); { const d = white.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = R.next() * 2 - 1; }
  // pink (Paul Kellet, refined)
  const pink = mk(1, 6); {
    const d = pink.getChannelData(0); let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = R.next() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
    }
    normalize(d, 0.9);
  }
  // brown (leaky integrated white), DC-blocked
  const brown = mk(1, 6); {
    const d = brown.getChannelData(0); let b = 0, x1 = 0, y1 = 0;
    for (let i = 0; i < d.length; i++) { b = 0.996 * b + (R.next() * 2 - 1) * 0.06; const y = b - x1 + 0.9995 * y1; x1 = b; y1 = y; d[i] = y; }
    normalize(d, 0.9);
  }
  // rocket-motor / fire crackle: sparse impulsive bursts with a heavy-tailed amplitude distribution
  const crackle = mk(1, 4); {
    const d = crackle.getChannelData(0); let t = 0;
    while (true) {
      t += -Math.log(1 - R.next()) / 140; const i0 = Math.floor(t * sr); if (i0 >= d.length) break;
      const a = (0.12 + 0.88 * Math.pow(R.next(), 3)) * (R.next() < 0.5 ? -1 : 1);
      const len = Math.floor(sr * R.range(0.0003, 0.0024)), tau = len * 0.35;
      for (let k = 0; k < len && i0 + k < d.length; k++) d[i0 + k] += a * Math.exp(-k / tau) * (k % 2 ? -1 : 1) * (0.6 + 0.4 * R.next());
    }
    normalize(d, 0.95);
  }
  // N-wave: the pressure signature of a shock (sharp rise, linear fall through zero, sharp
  // recovery), with a weaker ground-reflected copy 1.1 ms later. 8 ms at rate 1.
  const nwave = mk(1, 0.03); {
    const d = nwave.getChannelData(0), T = Math.round(0.008 * sr), rt = Math.max(2, Math.round(0.00015 * sr));
    const put = (i0, a) => { for (let k = 0; k < T + 2 * rt; k++) { let v; if (k < rt) v = k / rt; else if (k < rt + T) v = 1 - 2 * (k - rt) / T; else v = -1 + (k - rt - T) / rt; d[i0 + k] += a * v; } };
    put(4, 1); put(4 + Math.round(0.0011 * sr), 0.55);
    let lp = 0; for (let i = 0; i < d.length; i++) { lp += 0.6 * (d[i] - lp); d[i] = lp; } // slight rounding (finite rise time)
    normalize(d, 0.95);
  }
  return { sr, white, pink, brown, crackle, nwave, engine: shahedLoop(mk, sr, R), cricketsA: crickets(mk, sr, R, 7.31), cricketsB: crickets(mk, sr, R, 11.07), cricketsC: crickets(mk, sr, R, 13.73), wind: wind(mk, sr, R, 19.7), ir: impulse(mk, sr, R, 3.2) };
}

function normalize(d, peak) { let m = 1e-9; for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i])); const k = peak / m; for (let i = 0; i < d.length; i++) d[i] *= k; }

// Shahed-136 style engine: small 4-cylinder two-stroke (moped/lawnmower rasp) with a pusher prop.
// 2 s seamless loop at ~112 Hz revs; per-cycle jitter and rare misfires give the uneven "blat".
function shahedLoop(mk, sr, R) {
  const sec = 2, f = Math.round(112 * sec) / sec, per = 1 / f, buf = mk(1, sec), d = buf.getChannelData(0), N = d.length;
  const amp = [1, 0.62, 0.86, 0.5];
  const pulse = (t0, a) => {
    const i0 = Math.floor(t0 * sr), len = Math.floor(sr * 0.012);
    for (let k = 0; k < len; k++) {
      const tau = k / sr;
      const v = Math.sin(2 * Math.PI * 940 * tau) * Math.exp(-tau / 0.0019) + 0.55 * Math.sin(2 * Math.PI * 2280 * tau) * Math.exp(-tau / 0.0009)
        + 0.8 * Math.sin(2 * Math.PI * 255 * tau) * Math.exp(-tau / 0.0042) + 0.35 * (R.next() * 2 - 1) * Math.exp(-tau / 0.0007);
      d[(i0 + k) % N] += a * v;
    }
  };
  for (let c = 0; c < Math.round(sec * f); c++) for (let k = 0; k < 4; k++) {
    if (R.next() < 0.018) continue; // misfire
    pulse((c + k / 4 + R.range(-0.025, 0.025)) * per, amp[k] * (1 + 0.14 * R.normal()));
  }
  for (let i = 0; i < N; i++) { const t = i / sr; d[i] += 0.32 * Math.sin(2 * Math.PI * 2 * f * t + 0.4 * Math.sin(2 * Math.PI * f * t)) * (0.8 + 0.2 * Math.sin(2 * Math.PI * 4 * t)); }
  normalize(d, 0.9);
  return buf;
}

// Field crickets: several individuals (own carrier, pan, chirp rhythm), stereo, seamless loop.
function crickets(mk, sr, R, sec) {
  const buf = mk(2, sec), L = buf.getChannelData(0), Rr = buf.getChannelData(1), N = L.length;
  const n = 3 + (R.next() < 0.5 ? 1 : 0);
  for (let c = 0; c < n; c++) {
    const fc = R.range(3900, 5200), pan = R.range(-0.85, 0.85), a = R.range(0.25, 1) * (c === 0 ? 1 : 0.7);
    const gl = Math.sqrt(0.5 * (1 - pan)), gr = Math.sqrt(0.5 * (1 + pan));
    const trill = c === n - 1 && R.next() < 0.6;
    const ci = R.range(0.55, 1.15), np = R.int(3, 5), pl = R.range(0.011, 0.016), pg = R.range(0.02, 0.026);
    let t = R.range(0, ci);
    const writePulse = (t0, amp) => {
      const i0 = Math.floor(t0 * sr), len = Math.floor(pl * sr), ph = R.next() * 6.28;
      for (let k = 0; k < len; k++) {
        const e = Math.sin(Math.PI * k / len) ** 2, s = Math.sin(ph + 2 * Math.PI * fc * (k / sr) * (1 + 0.012 * k / len)) * e * amp;
        const j = (i0 + k) % N; L[j] += s * gl; Rr[j] += s * gr;
      }
    };
    if (trill) { // distant trilling insect: continuous pulses with slow swells
      for (let tt = 0; tt < sec; tt += 1 / 38) writePulse(tt, a * 0.35 * (0.5 + 0.5 * Math.sin(2 * Math.PI * tt / sec * 3)) ** 2);
      continue;
    }
    while (t < sec) {
      for (let p = 0; p < np; p++) writePulse(t + p * (pl + pg), a * (p === 0 ? 0.8 : 1));
      t += ci * R.range(0.88, 1.12) + (R.next() < 0.1 ? R.range(0.3, 1.2) : 0);
    }
  }
  let m = 1e-9; for (let i = 0; i < N; i++) m = Math.max(m, Math.abs(L[i]), Math.abs(Rr[i]));
  for (let i = 0; i < N; i++) { L[i] *= 0.9 / m; Rr[i] *= 0.9 / m; }
  return buf;
}

// Desert night wind: brown/pink noise with a looping gust envelope driving level and a moving
// lowpass, partially decorrelated stereo, a faint whistle in gusts; crossfaded seam.
function wind(mk, sr, R, sec) {
  const xf = 1.5, total = sec + xf, n = Math.round(total * sr), N = Math.round(sec * sr);
  const pts = []; const step = 1.7; for (let t = 0; t <= total + step; t += step * R.range(0.7, 1.3)) pts.push([t, R.range(0.25, 1)]);
  const gust = (t) => { let i = 0; while (i < pts.length - 2 && pts[i + 1][0] < t) i++; const [t0, v0] = pts[i], [t1, v1] = pts[i + 1]; const u = Math.min(1, Math.max(0, (t - t0) / (t1 - t0))); return v0 + (v1 - v0) * u * u * (3 - 2 * u); };
  const out = [new Float32Array(n), new Float32Array(n)];
  const st = [0, 0], lp = [0, 0], bp = [[0, 0], [0, 0]];
  for (let i = 0; i < n; i++) {
    const t = i / sr, g = gust(t);
    const fc = 160 + 560 * g, a = 1 - Math.exp(-2 * Math.PI * fc / sr);
    const w0 = R.next() * 2 - 1, w1 = R.next() * 2 - 1;
    for (let c = 0; c < 2; c++) {
      st[c] = 0.995 * st[c] + (c ? 0.35 * w0 + 0.65 * w1 : 0.65 * w0 + 0.35 * w1) * 0.08;
      lp[c] += a * (st[c] - lp[c]);
      // whistle: resonator around 800-1200 Hz following the gust
      const f0 = 780 + 420 * g, r = 0.996, cw = 2 * r * Math.cos(2 * Math.PI * f0 / sr);
      const y = (c ? w0 : w1) * 0.02 + cw * bp[c][0] - r * r * bp[c][1]; bp[c][1] = bp[c][0]; bp[c][0] = y;
      out[c][i] = lp[c] * (0.3 + 0.7 * g) + y * 0.012 * g * g;
    }
  }
  const buf = mk(2, sec), X = Math.round(xf * sr);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c), o = out[c];
    for (let i = 0; i < N; i++) d[i] = o[i];
    for (let i = 0; i < X; i++) { const u = i / X; d[i] = o[i] * Math.sin(u * Math.PI / 2) + o[N + i] * Math.cos(u * Math.PI / 2); } // equal-power seam
  }
  let m = 1e-9; for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < N; i++) m = Math.max(m, Math.abs(d[i])); }
  for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < N; i++) d[i] *= 0.9 / m; }
  return buf;
}

// Outdoor impulse response: dense early reflections off nearby buildings (8-90 ms), a few
// discrete slaps off terrain/the escarpment, and a short diffuse tail whose highs die first.
function impulse(mk, sr, R, sec) {
  const buf = mk(2, sec), N = buf.length;
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let k = 0; k < 16; k++) { const i = Math.floor(R.range(0.008, 0.09) * sr); d[i] += R.range(0.25, 0.7) * (R.next() < 0.5 ? -1 : 1); }
    for (const [t, g] of [[0.31, 0.32], [0.57, 0.24], [1.04, 0.15], [1.6, 0.08]]) { const i = Math.floor((t + R.range(-0.03, 0.03)) * sr); for (let k = 0; k < 600; k++) d[i + k] += g * (R.next() * 2 - 1) * Math.exp(-k / 140); }
    let lp = 0;
    for (let i = Math.floor(0.012 * sr); i < N; i++) {
      const t = i / sr, fc = 9000 * Math.exp(-t / 0.9) + 500, a = 1 - Math.exp(-2 * Math.PI * fc / sr);
      lp += a * ((R.next() * 2 - 1) - lp);
      d[i] += lp * 0.55 * Math.exp(-t / 0.62) * Math.min(1, (t - 0.012) / 0.05);
    }
  }
  return buf;
}

// ---------------------------------------------------------------- clip-aware automation
// pts: [[time, value, 'set'|'lin'|'exp'], ...] in context time, ascending. Points before `now`
// are folded into the value at `now` (offline windows can start in the middle of a long sound).
export function applyEnv(param, pts, now = 0) {
  if (!pts.length) return;
  let i = 0;
  while (i < pts.length && pts[i][0] <= now) i++;
  if (i > 0) {
    const [ta, va] = pts[i - 1];
    let v = va;
    if (i < pts.length) {
      const [tb, vb, kb] = pts[i];
      const u = (now - ta) / Math.max(1e-9, tb - ta);
      if (kb === 'lin') v = va + (vb - va) * u;
      else if (kb === 'exp') v = va * Math.pow(Math.max(1e-6, vb) / Math.max(1e-6, va), u);
    }
    param.setValueAtTime(v, now);
  } else if (pts[0][2] !== 'set') param.setValueAtTime(param.value, now);
  for (; i < pts.length; i++) {
    const [t, v, k] = pts[i];
    if (k === 'lin') param.linearRampToValueAtTime(v, t);
    else if (k === 'exp') param.exponentialRampToValueAtTime(Math.max(1e-5, v), t);
    else param.setValueAtTime(v, t);
  }
}

// value of an automation description at time t (for planning and reports)
export function envAt(pts, t) {
  if (!pts.length) return 0;
  if (t <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (t <= pts[i][0]) {
      const [ta, va] = pts[i - 1], [tb, vb, kb] = pts[i], u = (t - ta) / Math.max(1e-9, tb - ta);
      return kb === 'lin' ? va + (vb - va) * u : kb === 'exp' ? va * Math.pow(Math.max(1e-6, vb) / Math.max(1e-6, va), u) : va;
    }
  }
  return pts[pts.length - 1][1];
}

// ---------------------------------------------------------------- WAV
export function encodeWav(channels, sr, scale = 1) {
  const nc = channels.length, n = channels[0].length, bytes = 44 + n * nc * 2;
  const buf = new ArrayBuffer(bytes), v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, bytes - 8, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, nc, true); v.setUint32(24, sr, true);
  v.setUint32(28, sr * nc * 2, true); v.setUint16(32, nc * 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, n * nc * 2, true);
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) {
    const s = Math.max(-1, Math.min(1, channels[c][i] * scale));
    v.setInt16(o, s < 0 ? Math.round(s * 32768) : Math.round(s * 32767), true); o += 2;
  }
  return new Uint8Array(buf);
}
export function toBase64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
