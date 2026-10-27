// Deterministic offline render of the mix for a sim-time window: replays bus.log (every event
// carries sim time t) through the shared engine in an OfflineAudioContext, with the listener on
// the recorded camera track (or a fixed pose). Speed-of-sound arrival is solved against the
// moving listener; movers (Shahed, cruise, jets) use retarded positions, which also yields their
// Doppler shift. Output time follows the track's real time, so slow-mo/hit-stop in captures stay
// in sync with the video.
import { makeRng } from '../core/rng.js';
import { createEngine, C, EXO_ALT, MAXD, distGain, airCut, evRng } from './engine.js';
import { encodeWav, toBase64 } from './dsp.js';

export const SR = 48000;
const REENTRY_LEAD = 3; // s of re-entry roar before the ground blast
export const PRE = 12; // pre-roll seconds (tails of earlier sounds, limiter settles), trimmed

// Siren poles: three in Arad (relay offsets and slightly different horns, so they phase against
// each other like real poles), plus the Nevatim and Dimona sirens heard from afar.
export const POLES = [
  { name: 'Arad centre', pos: { x: 0, y: 28, z: 0 }, dt: 0, fLo: 330, fHi: 720, rise: 2.3, fall: 2.3, ref: 160, power: 0.15, slap: true },
  { name: 'Arad north', pos: { x: -380, y: 28, z: -300 }, dt: 0.35, fLo: 338, fHi: 736, rise: 2.25, fall: 2.4, ref: 140, power: 0.15, slap: true },
  { name: 'Arad south-east', pos: { x: 430, y: 28, z: 340 }, dt: 0.8, fLo: 322, fHi: 706, rise: 2.4, fall: 2.2, ref: 140, power: 0.15, slap: true },
  { name: 'Nevatim', pos: { x: -6800, y: 40, z: 2900 }, dt: 1.2, fLo: 300, fHi: 660, rise: 2.6, fall: 2.6, ref: 700, power: 0.4, cycles: 9 },
  { name: 'Dimona', pos: { x: -3600, y: 40, z: 13800 }, dt: 2.0, fLo: 345, fHi: 760, rise: 2.2, fall: 2.5, ref: 1100, power: 0.4, cycles: 7 },
];
export function sirenCycles(P, countdown) { return P.cycles ?? Math.max(4, Math.round((countdown - P.rise * 1.4 - 3.6) / (P.rise + P.fall))); }

export const DOGS = [{ x: -620, y: 4, z: 430 }, { x: 760, y: 4, z: -420 }, { x: -150, y: 4, z: -700 }];
export function dogPlan(seed, alertT, clearT) {
  const r = makeRng(seed, 'dog'), out = [];
  let t = 4;
  while (t < 420) {
    t += r.range(16, 40); const pos = r.pick(DOGS);
    if (alertT != null && t > alertT - 2 && t < (clearT ?? 1e9) + 10) continue; // dogs fall quiet under the barrage
    out.push({ t, howl: false, pos });
  }
  if (alertT != null) out.push({ t: alertT + 8.5, howl: true, pos: DOGS[0] });
  return out.sort((a, b) => a.t - b.t);
}

// bus.log stores { type, ...payload }; the impact payload has its own `type` (the threat type),
// which overwrites 'impact' in the log, so impacts are recognised by shape.
export const isImpact = (e) => e.type === 'impact' || ('dmg' in e && (e.kind === 'nevatim' || e.kind === 'town' || e.kind === 'open'));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const RANGE = { drone: 6500, cruise: 9000, jet: 16000 };

export async function renderOffline(ctx, rec, t0, t1, opts = {}) {
  const seed = ctx.params.seed, len = Math.max(0.5, t1 - t0), total = len + PRE;
  const L = makeListener(ctx, rec, t0, opts);
  const ac = new OfflineAudioContext(2, Math.ceil(total * SR), SR);
  const E = createEngine(ac, { seed, live: false });
  const toCtx = (s) => L.simToOut(s) + PRE;
  const toSim = (c) => L.outToSim(c - PRE);
  const meta = { t0, t1, len, sr: SR, listener: L.kind, events: [], sirens: [], movers: [], beats: [] };
  E.lis = (c) => L.at(toSim(c)).p; // moving sources (launch climb, re-entry) re-evaluate against this

  // listener automation
  const lis = ac.listener;
  for (let c = 0, first = true; c <= total + 0.05; c += 0.1, first = false) {
    const s = toSim(c), q = L.at(s);
    const set = (param, v) => (first ? param.setValueAtTime(v, 0) : param.linearRampToValueAtTime(v, c));
    set(lis.positionX, q.p.x); set(lis.positionY, q.p.y); set(lis.positionZ, q.p.z);
    set(lis.forwardX, q.f.x); set(lis.forwardY, q.f.y); set(lis.forwardZ, q.f.z);
    set(lis.upX, q.u.x); set(lis.upY, q.u.y); set(lis.upZ, q.u.z);
    if (!L.moving) break;
  }

  // ambience + bed with mission beats and listener-dependent levels
  const A = E.ambience(0);
  const log = ctx.bus.log.filter((e) => typeof e.t === 'number');
  const firstOf = (type) => { const e = log.find((x) => x.type === type); return e ? e.t : null; };
  for (const e of log) if (['alert:early', 'alert:start', 'alert:impactWindow', 'alert:end', 'allclear'].includes(e.type)) { E.beat(A, e.type, toCtx(e.t)); meta.beats.push({ type: e.type, t: e.t, outT: +(toCtx(e.t) - PRE).toFixed(3) }); }
  for (let c = 0; c <= total; c += 0.5) {
    const lv = E.ambLevels(L.at(toSim(c)).p);
    A.windL.gain.setTargetAtTime(lv.wind, c, 0.3); A.insL.gain.setTargetAtTime(lv.ins, c, 0.3); A.townL.gain.setTargetAtTime(lv.town, c, 0.3);
  }

  // sirens (reserved voices), started on alert:start and heard after the propagation delay
  for (const e of log) if (e.type === 'alert:start') {
    for (const P of POLES) {
      const te = e.t + P.dt, { ta, d } = arrive(L, te, P.pos);
      const s = E.siren(P.pos, toCtx(ta), sirenCycles(P, e.countdown ?? 75), d, P);
      // level and air follow the listener (10 Hz), e.g. a camera flying from Arad toward Nevatim
      if (s) for (let c = Math.max(0, s.t0), first = true; c <= Math.min(total, s.tOff); c += 0.1, first = false) s.track(L.at(toSim(c)).p, c, first);
      meta.sirens.push({ name: P.name, triggerT: +te.toFixed(3), arriveT: +ta.toFixed(3), outT: +(toCtx(ta) - PRE).toFixed(3), endOutT: s ? +(s.tOff - PRE).toFixed(3) : null, d: Math.round(d), delay: +(ta - te).toFixed(3), fLo: P.fLo, fHi: P.fHi, period: P.rise + P.fall, levelDb: +(20 * Math.log10(distGain(d, P.ref))).toFixed(1) });
    }
  }

  // one-shots, scheduled in arrival order so the voice cap steals deterministically
  const jobs = [];
  const add = (type, e, pos, te, extra = {}) => {
    const { ta, d } = arrive(L, te, pos), c = toCtx(ta);
    const m = { type, kind: e.kind || e.type, threatType: e.threatType ?? (type === 'impact' ? e.type : undefined), te: +te.toFixed(3), ta: +ta.toFixed(3), outT: +(c - PRE).toFixed(3), d: Math.round(d), delay: +(ta - te).toFixed(3), alt: Math.round(pos.y) };
    if (c < 0.05 || c >= total) return;
    jobs.push({ c, type, e, pos, d, m, ...extra });
  };
  for (const e of log) {
    if (e.type === 'launch') add('launch', e, e, e.t);
    else if (e.type === 'intercept') {
      if (e.y > EXO_ALT) { if (e.t >= toSim(PRE) - 1 && e.t <= t1) meta.events.push({ type: 'intercept', kind: e.kind, te: e.t, alt: Math.round(e.y), scheduled: false, why: 'high-altitude kill: inaudible on the ground' }); continue; }
      add('intercept', e, e, e.t);
      if (e.kill && !e.offmap) add('debris', { ...e, type: 'debris' }, { x: e.x, y: e.y - 150, z: e.z }, e.t + 0.4);
    } else if (isImpact(e)) {
      add('impact', e, { x: e.x, y: e.y + 15, z: e.z }, e.t);
      // incoming ballistic: shock + tearing roar arrive just ahead of the ground blast (supersonic)
      if (e.type === 'ballistic') { const { ta } = arrive(L, e.t, e), top = { x: e.x, y: e.y + 3500, z: e.z }; add('reentry', { ...e, type: 'reentry' }, top, ta - REENTRY_LEAD - dist(L.at(ta - REENTRY_LEAD).p, top) / C, { lead: REENTRY_LEAD }); }
    }
  }
  for (const g of dogPlan(seed, firstOf('alert:start'), firstOf('allclear'))) add(g.howl ? 'dog:howl' : 'dog:bark', { type: 'dog', id: Math.round(g.t * 10), t: g.t }, g.pos, g.t, { howl: g.howl });
  jobs.sort((a, b) => a.c - b.c);
  for (const j of jobs) {
    const r = evRng(seed, j.e);
    let V = null, why = '';
    if (j.type === 'launch') V = j.d <= MAXD.launch ? E.launch(j.e, j.c, j.d, r) : (why = 'beyond audible range', null);
    else if (j.type === 'intercept') V = j.d <= MAXD.blast ? E.intercept(j.e, j.c, j.d, r) : (why = 'beyond audible range', null);
    else if (j.type === 'impact') V = j.d <= MAXD.blast ? E.impact(j.e, j.c, j.d, r) : (why = 'beyond audible range', null);
    else if (j.type === 'reentry') V = j.d <= MAXD.blast ? E.reentry(j.pos, j.c, j.d, r, j.lead) : (why = 'beyond audible range', null);
    else if (j.type === 'debris') V = j.d < 5000 ? E.debris(j.pos, j.c, j.d, r) : (why = 'too far to hear crackle', null);
    else V = j.d < 4000 ? E.dog(j.pos, j.c, j.d, r, j.howl) : (why = 'too far', null);
    if (!V && !why) why = 'voice cap (dropped: quieter than all active voices)';
    meta.events.push({ ...j.m, scheduled: !!V, why: V ? undefined : why, levelDb: V ? +(20 * Math.log10(V.prio)).toFixed(1) : undefined, air: Math.round(airCut(j.d)) });
  }

  // movers: retarded position, level, air filter and Doppler, automated at 10 Hz
  const sStart = toSim(0) - 40, sEnd = toSim(total);
  const cands = [];
  for (const [id, M] of rec.movers) {
    const mEnd = M.t0 + (M.a.length / 3 - 1) * 0.1;
    if (mEnd < sStart || M.t0 > sEnd) continue;
    let dmin = 1e12;
    for (let c = 0; c <= total; c += 1) { const s = toSim(c), q = M.at(s); if (q) dmin = Math.min(dmin, dist(q, L.at(s).p)); }
    if (dmin < RANGE[M.kind]) cands.push({ id, M, dmin });
  }
  cands.sort((a, b) => a.dmin - b.dmin);
  for (const { id, M, dmin } of cands.slice(0, 10)) {
    const v = E.mover(M.kind, makeRng(seed, 'mover:' + id), 0);
    let prevTe = null, prevS = null, first = true, peak = 0;
    for (let c = 0; c <= total + 0.05; c += 0.1) {
      const s = toSim(c), lp = L.at(s).p;
      let te = s;
      for (let k = 0; k < 4; k++) { const q = M.at(te); if (!q) break; te = s - dist(lp, q) / C; }
      const q = M.at(te), d = q ? dist(lp, q) : 1e9;
      const gain = q ? distGain(d, v.ref) * v.power : 0;
      const rate = prevTe != null && q ? Math.min(1.6, Math.max(0.6, (te - prevTe) / Math.max(1e-6, s - prevS))) : 1;
      prevTe = q ? te : null; prevS = s; peak = Math.max(peak, gain);
      const set = (param, val) => (first ? param.setValueAtTime(val, c) : param.linearRampToValueAtTime(val, c));
      set(v.g.gain, gain); for (const f of v.lps) set(f.frequency, airCut(d));
      if (v.flange && q) set(v.flange.delayTime, E.flangeDelay(lp, q, d));
      if (q) { set(v.p.positionX, q.x); set(v.p.positionY, q.y); set(v.p.positionZ, q.z); }
      for (const [pr, base] of v.rates) set(pr, base * rate);
      first = false;
    }
    meta.movers.push({ id, kind: M.kind, minDist: Math.round(dmin), peakDb: +(20 * Math.log10(Math.max(1e-6, peak))).toFixed(1) });
  }

  const buf = await ac.startRendering();
  const off = Math.round(PRE * SR), n = Math.round(len * SR);
  const ch = [buf.getChannelData(0).subarray(off, off + n), buf.getChannelData(1).subarray(off, off + n)];
  // 5 ms raised-cosine fades so a muxed window never starts or ends mid-waveform
  const F = Math.round(0.005 * SR);
  for (let i = 0; i < F; i++) { const w = 0.5 - 0.5 * Math.cos(Math.PI * i / F); for (const c of ch) { c[i] *= w; c[n - 1 - i] *= w; } }
  // optional mastering for video (captures): gain toward a loudness target, capped by a -1 dBFS
  // peak ceiling. audio-render.mjs passes { master: false } to show the raw game mix.
  let gain = 1;
  if (opts.master !== false) {
    const target = opts.targetLufs ?? -17;
    let pk = 1e-9, sum = 0, cnt = 0;
    const W = Math.round(0.4 * SR), blocks = [];
    for (let s0 = 0; s0 + W <= n; s0 += W / 4) { let e = 0; for (let i = s0; i < s0 + W; i += 4) e += ch[0][i] * ch[0][i] + ch[1][i] * ch[1][i]; blocks.push(e / (W / 4)); }
    for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(ch[0][i]), Math.abs(ch[1][i]));
    for (const b of blocks) if (b > 1e-7) { sum += b; cnt++; }
    const lufs = cnt ? -0.691 + 10 * Math.log10(sum / cnt) : -70; // ungated, unweighted approximation
    gain = Math.min(Math.pow(10, (target - lufs) / 20), 0.891 / pk, 8);
    meta.master = { approxLufsBefore: +lufs.toFixed(1), gainDb: +(20 * Math.log10(gain)).toFixed(2), target };
  }
  const wav = encodeWav(ch, SR, gain);
  meta.stats = { ...E.stats, cap: 48, voiceTimeline: E.timeline.filter(([c]) => c >= PRE).map(([c, k]) => [+(c - PRE).toFixed(3), k]) };
  meta.maxConcurrentVoices = meta.stats.maxConc + meta.sirens.length + meta.movers.length;
  return { b64: toBase64(wav), meta };
}

// earliest arrival time ta >= te of a sound emitted at te from src, for the (moving) listener
function arrive(L, te, src) {
  let ta = te + dist(L.at(te).p, src) / C;
  for (let k = 0; k < 5; k++) ta = te + dist(L.at(ta).p, src) / C;
  return { ta, d: (ta - te) * C };
}

// listener pose + sim->output time map, from the recorded camera track or a fixed pose
function makeListener(ctx, rec, t0, opts) {
  const tr = rec.trackArrays();
  const cam = ctx.camera, e = cam.matrixWorld.elements;
  const fixed = opts.pose || { p: { x: cam.position.x, y: cam.position.y, z: cam.position.z }, f: { x: -e[8], y: -e[9], z: -e[10] }, u: { x: e[4], y: e[5], z: e[6] } };
  const n = tr.T.length;
  const useTrack = opts.listener !== 'camera' && !opts.pose && n > 2 && tr.T[0] <= t0 + 0.05 && tr.T[n - 1] >= t0;
  if (!useTrack) return { kind: 'fixed', moving: false, at: () => fixed, simToOut: (s) => s - t0, outToSim: (o) => o + t0 };
  const { T, R } = tr;
  const idx = (arr, v) => { let lo = 0, hi = n - 1; if (v <= arr[0]) return -1; if (v >= arr[hi]) return n; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (arr[m] <= v) lo = m; else hi = m; } return lo; };
  const interp = (X, Y, v) => { const i = idx(X, v); if (i < 0) return Y[0] + (v - X[0]); if (i >= n) return Y[n - 1] + (v - X[n - 1]); const u = (v - X[i]) / Math.max(1e-9, X[i + 1] - X[i]); return Y[i] + (Y[i + 1] - Y[i]) * u; };
  const r0 = interp(T, R, t0);
  const vec = (A, i, u) => ({ x: A[i * 3] + (A[i * 3 + 3] - A[i * 3]) * u, y: A[i * 3 + 1] + (A[i * 3 + 4] - A[i * 3 + 1]) * u, z: A[i * 3 + 2] + (A[i * 3 + 5] - A[i * 3 + 2]) * u });
  const at = (s) => {
    let i = idx(T, s), u = 0;
    if (i < 0) { i = 0; u = 0; } else if (i >= n - 1) { i = n - 2; u = 1; } else u = (s - T[i]) / Math.max(1e-9, T[i + 1] - T[i]);
    return { p: vec(tr.P, i, u), f: vec(tr.F, i, u), u: vec(tr.U, i, u) };
  };
  return { kind: 'track', moving: true, at, simToOut: (s) => interp(T, R, s) - r0, outToSim: (o) => interp(R, T, o + r0) };
}

export { airCut, distGain };
