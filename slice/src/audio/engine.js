// Audio engine shared by the live mix (AudioContext) and the offline renderer
// (OfflineAudioContext): the same graph builders, sound recipes, distance model and voice
// allocator are used by both, so __slice.audioOffline() renders what the player hears.
//
// Distance model (per voice, from the listener; moving sources re-evaluated at 10 Hz):
//   level   = ref / max(ref, d)                 spherical spreading for the full-band layer
//   LF      = (lfRef / d)^0.75 below ~250 Hz    blast rumble falls off slower (ground-coupled,
//                                               little absorption): distant booms keep weight
//   air     = 2 x lowpass (24 dB/oct) at 20 kHz / (1 + d/700): highs die over km
//   wet     = reverb send grows with distance   (distant sounds are mostly reflections)
//   delay   = d / 343 s                         speed of sound (applied by the caller)
// Direction: PannerNode, no built-in rolloff (equal-power, deterministic).
// Mix: every boom ducks the siren and ambience 3-6 dB for ~1 s (scaled by its level).
import { makeRng } from '../core/rng.js';
import { getBuffers, applyEnv } from './dsp.js';

export const C = 343;          // speed of sound, m/s
export const CAP = 48;         // concurrent one-shot voices (sirens, ambience, movers are reserved)
export const EXO_ALT = 20000;  // blasts above this altitude are inaudible on the ground (thin air)
export const MAXD = { launch: 30000, blast: 45000 };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const airCut = (d) => clamp(20000 / (1 + d / 700), 150, 20000);
export const distGain = (d, ref) => ref / Math.max(ref, d);
export const lfGainAt = (d, ref) => Math.pow(Math.min(1, ref / Math.max(1, d)), 0.75);
export const evRng = (seed, e) => makeRng(seed, `snd:${e.type}:${e.kind || ''}:${e.id ?? ''}:${Math.round((e.t || 0) * 600)}`);

const LAUNCH = {
  //  dur, roar band start→end, roar, low rumble, crack, ref, Sling's second pulse, motor kinematics
  dome: { dur: 2.9, b0: 2900, b1: 950, roar: 0.85, low: 0.4, crack: 0.9, ref: 70, pulse2: false, v: 820, boost: 0.9 },
  sling: { dur: 4.6, b0: 1900, b1: 520, roar: 1.0, low: 0.8, crack: 1.15, ref: 95, pulse2: true, v: 1700, boost: 1.1 },
  arrow: { dur: 8.5, b0: 1000, b1: 190, roar: 1.1, low: 1.35, crack: 1.3, ref: 170, pulse2: false, v: 4600, boost: 2.2 },
  aam: { dur: 1.8, b0: 3800, b1: 1700, roar: 0.45, low: 0.15, crack: 0.25, ref: 45, pulse2: false, v: 950, boost: 0.3 },
};
export const SIZE = { intercept: { ballistic: 1.0, cruise: 0.62, drone: 0.45 }, impact: { ballistic: 1.7, cruise: 1.05, drone: 0.65 } };
const BOOM = { ref: 900, lfRef: 1900, lfPower: 1.3 }; // blast loudness: ~+9 dB over the siren at equal distance

export function createEngine(ac, { seed = 1, live = false } = {}) {
  const B = getBuffers(ac, seed);
  const stats = { oneShots: 0, stolen: 0, dropped: 0, maxConc: 0, reserved: 0, maxReserved: 0, ducks: 0 };
  const E = { ac, B, seed, live, stats, voices: [], timeline: [], lis: null };

  // ---------------------------------------------------------------- master chain
  const out = ac.createGain(); out.gain.value = 0.85;
  const lim = ac.createDynamicsCompressor(); // safety limiter: fast, hard knee
  lim.threshold.value = -2.5; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.0015; lim.release.value = 0.12;
  const trim = ac.createGain(); trim.gain.value = 0.84; // keeps true peak under about -1 dBTP after limiter overshoot
  out.connect(lim).connect(trim).connect(ac.destination);
  const glue = ac.createDynamicsCompressor(); // weapons bus glue, light: transients pass
  glue.threshold.value = -14; glue.knee.value = 8; glue.ratio.value = 2; glue.attack.value = 0.012; glue.release.value = 0.4;
  glue.connect(out);
  const duck = ac.createGain(); duck.connect(out); // siren + ambience duck under booms
  const bus = {};
  for (const b of ['sfx', 'siren', 'amb', 'bed', 'ui']) { bus[b] = ac.createGain(); bus[b].connect(b === 'sfx' ? glue : b === 'siren' || b === 'amb' ? duck : out); }
  bus.amb.gain.value = 1.35; bus.bed.gain.value = 0.3; bus.ui.gain.value = 0.5;
  // two reverbs: a tight town space (slapback off walls) and the wide desert/escarpment space
  const verb = ac.createConvolver(); verb.normalize = true; verb.buffer = B.ir;
  const verbOut = ac.createGain(); verbOut.gain.value = 0.55;
  verb.connect(verbOut).connect(out);
  Object.assign(E, { out, bus, verb, duck });

  // ---------------------------------------------------------------- building blocks
  const pannerAt = (pos) => {
    const p = ac.createPanner(); p.panningModel = 'equalpower'; p.distanceModel = 'linear'; p.rolloffFactor = 0; p.refDistance = 1; p.maxDistance = 1e7;
    p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z;
    return p;
  };
  const bq = (type, f, q = 0.7, pts, gain) => { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; if (gain != null) b.gain.value = gain; if (pts) applyEnv(b.frequency, pts); return b; };
  const eg = (pts) => { const g = ac.createGain(); g.gain.value = 0; applyEnv(g.gain, pts); return g; };
  const lvl = (v) => { const g = ac.createGain(); g.gain.value = v; return g; };
  const dec = (t, peak, a, hold, end) => [[t, 0, 'set'], [t + a, peak, 'lin'], [t + a + hold, peak * 0.85, 'lin'], [t + end, 0.0001, 'exp']];
  function chain(V, first, ...rest) { let n = first; for (const x of rest.slice(0, -1)) { n.connect(x); n = x; V.nodes.push(x); } const last = rest[rest.length - 1]; n.connect(last); return last; }
  function noise(V, buf, t, dur, r, rate = 1, ratePts) {
    const s = ac.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate;
    if (ratePts) applyEnv(s.playbackRate, ratePts);
    s.start(t, r ? r.range(0, buf.duration * 0.95) : 0); s.stop(t + dur); V.srcs.push(s); return s;
  }
  function shot(V, buf, t, rate) { const s = ac.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate; s.start(t); V.srcs.push(s); return s; }
  function osc(V, type, t, dur, fPts) { const o = ac.createOscillator(); o.type = type; applyEnv(o.frequency, fPts); o.start(t); o.stop(t + dur); V.srcs.push(o); return o; }
  const twoPole = (f) => [bq('lowpass', f, 0.54), bq('lowpass', f, 1.31)]; // 4th-order Butterworth

  // a spatial voice: full-band layer (in -> 24 dB/oct air -> 1/d) and optional LF layer
  // (lf -> lowpass 250 -> (lfRef/d)^0.75), both into one panner; reverb send from the full band
  function voice(pos, t, d, o = {}) {
    const ref = o.ref ?? 100, power = o.power ?? 1, gain = distGain(d, ref) * power;
    const lfg0 = o.lfRef ? lfGainAt(d, o.lfRef) * (o.lfPower ?? 1) : 0;
    const V = { t, end: t + (o.dur || 3), prio: Math.max(gain, lfg0 * 0.5), d, nodes: [], srcs: [], label: o.label || '', ref, power, lfRef: o.lfRef, lfPower: o.lfPower ?? 1 };
    if (!admit(V)) return null;
    const vin = ac.createGain(), lps = twoPole(airCut(d) * (o.air ?? 1)), g = lvl(gain), p = pannerAt(pos);
    vin.connect(lps[0]).connect(lps[1]).connect(g).connect(p).connect(bus[o.bus || 'sfx']);
    const s = lvl((o.send ?? 0.25) * (0.3 + 0.7 * clamp(d / 2500, 0, 1)));
    g.connect(s).connect(verb);
    V.in = vin; V.g = g; V.lps = lps; V.p = p; V.nodes.push(vin, ...lps, g, p, s);
    if (o.lfRef) { V.lf = ac.createGain(); const lflp = bq('lowpass', 250, 0.6); V.lfg = lvl(lfg0); V.lf.connect(lflp).connect(V.lfg).connect(p); V.nodes.push(V.lf, lflp, V.lfg); }
    V.kill = (at) => { vin.gain.setTargetAtTime(0, at, 0.012); if (V.lf) V.lf.gain.setTargetAtTime(0, at, 0.012); for (const x of V.srcs) { try { x.stop(at + 0.1); } catch (_) { /* already stopped */ } } };
    return V;
  }
  // moving source: re-evaluate position, level and air at 10 Hz against E.lis(contextTime)
  function follow(V, posAt, dur) {
    if (!E.lis) return;
    const t = V.t;
    for (let tau = 0; tau <= dur + 1e-6; tau += 0.1) {
      const c = t + tau, P = posAt(tau), L = E.lis(c), d = Math.hypot(P.x - L.x, P.y - L.y, P.z - L.z);
      const set = (param, v) => (tau === 0 ? param.setValueAtTime(v, c) : param.linearRampToValueAtTime(v, c));
      set(V.p.positionX, P.x); set(V.p.positionY, P.y); set(V.p.positionZ, P.z);
      set(V.g.gain, distGain(d, V.ref) * V.power); for (const lp of V.lps) set(lp.frequency, airCut(d));
      if (V.lfg) set(V.lfg.gain, lfGainAt(d, V.lfRef) * V.lfPower);
    }
  }
  // voice cap with stealing: the quietest sounding voice (by level at the listener) yields
  function admit(V) {
    const t = V.t, vs = E.voices;
    for (let i = vs.length - 1; i >= 0; i--) if (vs[i].end <= t) vs.splice(i, 1);
    let n = 0, low = null;
    for (const v of vs) if (v.t <= t) { n++; if (!low || v.prio < low.prio) low = v; }
    if (n >= CAP) {
      if (low.prio >= V.prio) { stats.dropped++; return false; }
      low.kill(t); low.end = t; vs.splice(vs.indexOf(low), 1); stats.stolen++; n--;
    }
    vs.push(V); stats.oneShots++;
    if (n + 1 > stats.maxConc) stats.maxConc = n + 1;
    E.timeline.push([+t.toFixed(3), n + 1]);
    return true;
  }
  function finish(V) {
    let left = V.srcs.length;
    const done = () => { if (--left > 0) return; for (const n of V.nodes) n.disconnect(); for (const s of V.srcs) s.disconnect(); };
    for (const s of V.srcs) s.onended = done;
    return V;
  }
  // sidechain-style duck of siren + ambience under a boom (depth by the boom's level here)
  function boomDuck(t, level) {
    const db = level > 0.25 ? 6 : level > 0.1 ? 4.5 : level > 0.04 ? 3 : 0;
    if (!db) return;
    stats.ducks++;
    duck.gain.setTargetAtTime(Math.pow(10, -db / 20), t, 0.012);
    duck.gain.setTargetAtTime(1, t + 0.35, 0.7);
  }

  // ---------------------------------------------------------------- recipes
  // shock crack: a real N-wave (rate sets its length: bigger blast = longer wave), a faint
  // bright spit, and an un-pitched noise thump (no tonal "808" body)
  function crack(V, t, amp, len, r, spit = 0.25) {
    const s = shot(V, B.nwave, t, clamp(1 / len, 0.25, 4) * r.range(0.9, 1.1));
    chain(V, s, lvl(amp), V.in);
    if (spit > 0) { const n = noise(V, B.white, t, 0.06, r); chain(V, n, bq('highpass', 1500, 0.7), eg([[t, 0, 'set'], [t + 0.001, amp * spit, 'lin'], [t + 0.035, 0.0001, 'exp']]), V.in); }
    const th = noise(V, B.brown, t, 0.4, r);
    chain(V, th, bq('lowpass', 300, 0.7, [[t, 380, 'set'], [t + 0.3, 70, 'exp']]), eg(dec(t, amp * 0.9, 0.004, 0.02, 0.35)), V.lf || V.in);
  }

  // interceptor launch: ignition crack, a roaring motor that climbs away (the source position is
  // flown along the launch direction with the motor's boost profile, so level and air follow),
  // a band/pitch fall, motor crackle and a ground rumble. Per-layer signatures.
  E.launch = (e, t, d, r) => {
    const P = LAUNCH[e.kind] || LAUNCH.dome, k = r.range(0.86, 1.14), dur = P.dur * k;
    const V = voice(e, t, d, { ref: P.ref, send: 0.3, dur: dur + 0.3, label: 'launch:' + e.kind });
    if (!V) return null;
    crack(V, t, P.crack * r.range(0.8, 1.1) * 0.8, e.kind === 'arrow' ? 2 : 1, r, 0.4);
    const rate0 = r.range(0.9, 1.1), b0 = P.b0 * k, roar = P.roar * r.range(0.85, 1.1);
    const rp = [[t, 0, 'set'], [t + 0.06, roar, 'lin']];
    if (P.pulse2) { const t2 = t + r.range(0.75, 1.05); rp.push([t2 - 0.12, roar * 0.55, 'lin'], [t2, roar * 1.05, 'lin']); crack(V, t2, P.crack * 0.35, 1, r, 0.2); rp.push([t2 + dur * 0.3, roar * 0.8, 'lin']); }
    else rp.push([t + dur * 0.28, roar * 0.85, 'lin']);
    rp.push([t + dur, 0.0001, 'exp']);
    const s1 = noise(V, B.pink, t, dur, r, rate0, [[t, rate0, 'set'], [t + dur, rate0 * 0.7, 'exp']]);
    chain(V, s1, bq('bandpass', b0, 0.8, [[t, b0, 'set'], [t + dur, P.b1, 'exp']]), eg(rp), V.in);
    const s2 = noise(V, B.crackle, t, dur, r, 1, [[t, 1, 'set'], [t + dur, 0.75, 'exp']]);
    chain(V, s2, bq('highpass', 1300, 0.7), eg(rp.map(([a, v, m]) => [a, v * 0.5, m])), V.in);
    const s3 = noise(V, B.brown, t, dur, r);
    chain(V, s3, bq('lowpass', 240, 0.7), eg(dec(t, P.low, 0.08, dur * 0.2, dur)), V.in);
    // fly the source: boost from 15% to full speed, then cruise, along the launch direction
    const n = Math.hypot(e.dx || 0, e.dy || 1, e.dz || 0) || 1, ux = (e.dx || 0) / n, uy = (e.dy || 1) / n, uz = (e.dz || 0) / n;
    const sAt = (tau) => (tau < P.boost ? P.v * (0.15 * tau + 0.425 * tau * tau / P.boost) : P.v * (0.575 * P.boost + (tau - P.boost)));
    follow(V, (tau) => { const s = sAt(tau); return { x: e.x + ux * s, y: e.y + uy * s, z: e.z + uz * s }; }, dur);
    return finish(V);
  };

  // air blast or ground impact. Full band: N-wave crack(s) within ~1.8 km. LF layer (slow
  // falloff): noise body swept 400 -> 40 Hz, a short inharmonic cluster (randomised), and a
  // rolling tail of terrain echoes that lengthens with distance. Ducks the siren/ambience.
  function blast(e, t, d, r, size, ground, double) {
    const near = clamp(1 - (d - 300) / 1500, 0, 1), far = clamp(d / 3000, 0.3, 1);
    const tail = clamp(2.4 + d / 1600, 2.8, 10) * (ground ? 1.15 : 1) * r.range(0.9, 1.1);
    const V = voice(e, t, d, { ref: BOOM.ref * size, lfRef: BOOM.lfRef * size, lfPower: BOOM.lfPower, send: 0.45, dur: tail + 0.4, label: (ground ? 'impact:' : 'blast:') + (e.threatType || e.type) });
    if (!V) return null;
    if (near > 0) {
      crack(V, t, 1.1 * near * Math.sqrt(size), 0.8 + size * 0.7, r, 0.3);
      if (double) crack(V, t + r.range(0.07, 0.22), 0.7 * near * Math.sqrt(size), 0.7 + size * 0.5, r, 0.2);
    } else { // distant: the shock arrives as a dull thud (N-wave, highs already gone via air filter)
      const s = shot(V, B.nwave, t, 0.35 * r.range(0.85, 1.15)); chain(V, s, lvl(0.6 * Math.sqrt(size)), V.in);
    }
    const bd = 1.6 * size + 0.4;
    const body = noise(V, B.brown, t, bd + 0.2, r, r.range(0.9, 1.1));
    chain(V, body, bq('lowpass', 400, 0.8, [[t, 420 * r.range(0.85, 1.15), 'set'], [t + bd * 0.75, 40, 'exp']]), eg(dec(t, 1.4, 0.005, 0.08, bd)), V.lf);
    for (const f of [31, 47, 73]) {
      const fr = f * r.range(0.85, 1.15), od = r.range(0.5, 1.1) * size;
      const o = osc(V, 'sine', t, od + 0.05, [[t, fr * 1.15, 'set'], [t + od, fr * 0.9, 'exp']]);
      chain(V, o, eg(dec(t, 0.22 * r.range(0.6, 1), 0.01, 0.03, od)), V.lf);
    }
    // rolling tail: echo bumps from terrain / buildings / the escarpment (full band + LF)
    const tp = [[t, 0, 'set'], [t + 0.12, 0.5 * far, 'lin']], nb = 3 + Math.floor(r.next() * 3);
    let last = t + 0.12;
    for (let i = 1; i <= nb; i++) {
      const tb = Math.max(last + 0.3, t + (i / (nb + 1)) * tail * r.range(0.85, 1.15)), v = far * 0.6 * Math.exp(-1.3 * i / nb) * r.range(0.7, 1.2);
      if (tb > t + tail - 0.4) break;
      tp.push([tb - 0.22, v * 0.55, 'lin'], [tb, v, 'lin']); last = tb;
    }
    tp.push([t + tail, 0.0001, 'exp']);
    const tl = noise(V, B.brown, t, tail, r, r.range(0.9, 1.1));
    chain(V, tl, bq('lowpass', 300, 0.6, [[t, 420, 'set'], [t + tail, 120, 'exp']]), eg(tp), V.lf);
    const tl2 = noise(V, B.pink, t, tail, r);
    chain(V, tl2, bq('bandpass', 500, 0.7, [[t, 900, 'set'], [t + tail, 220, 'exp']]), eg(tp.map(([a, v, m]) => [a, v * 0.35, m])), V.in);
    if (ground && near > 0) { // ground debris rattle
      const rr = noise(V, B.crackle, t + 0.05, 2.2, r, 0.7);
      chain(V, rr, bq('lowpass', 2600, 0.6), eg(dec(t + 0.05, 0.45 * near, 0.02, 0.2, 2.1)), V.in);
    }
    boomDuck(t, Math.max(V.g.gain.value, V.lfg.gain.value * 0.6));
    return finish(V);
  }
  E.intercept = (e, t, d, r) => blast(e, t, d, r, e.kill ? (SIZE.intercept[e.threatType] || 0.5) : 0.35, false, e.kill && e.threatType !== 'drone');
  E.impact = (e, t, d, r) => blast(e, t, d, r, SIZE.impact[e.type] || 1, true, false);

  // incoming ballistic re-entry vehicle (supersonic): its shock arrives first as a double
  // N-wave boom, then a tearing roar (band-passed noise, 20-40 Hz flutter) that closes in and
  // stops dead at the ground blast. `t` = arrival of the shock, `lead` = seconds to the impact.
  E.reentry = (pos, t, d, r, lead = 3) => {
    const V = voice(pos, t, d, { ref: 700, lfRef: 1500, lfPower: 0.8, send: 0.35, dur: lead + 0.3, label: 'reentry' });
    if (!V) return null;
    const s1 = shot(V, B.nwave, t, 0.5 * r.range(0.9, 1.1)); chain(V, s1, lvl(0.9), V.in);
    const s2 = shot(V, B.nwave, t + r.range(0.09, 0.16), 0.5 * r.range(0.9, 1.1)); chain(V, s2, lvl(0.7), V.in);
    const te = t + lead;
    const rp = [[t, 0, 'set'], [t + 0.25, 0.35, 'lin'], [te - 0.12, 1, 'exp'], [te, 0.0001, 'exp']];
    const n = noise(V, B.pink, t, lead + 0.05, r, r.range(0.9, 1.1));
    const am = lvl(0.6); const fl = ac.createOscillator(); fl.frequency.value = r.range(22, 38); const fd = lvl(0.4); fl.connect(fd).connect(am.gain); fl.start(t); fl.stop(te + 0.05); V.srcs.push(fl); V.nodes.push(fd);
    chain(V, n, bq('bandpass', 700, 0.9, [[t, 950, 'set'], [te, 330, 'exp']]), am, eg(rp), V.in);
    const lo = noise(V, B.brown, t, lead + 0.05, r);
    chain(V, lo, bq('lowpass', 180, 0.7), eg(rp.map(([a, v, m]) => [a, v * 0.8, m])), V.lf);
    follow(V, (tau) => ({ x: pos.x, y: pos.y + Math.max(0, 1 - tau / lead) * 3500, z: pos.z }), lead);
    return finish(V);
  };

  // burning debris: crackle that flickers as fragments fall (only close to the listener)
  E.debris = (e, t, d, r) => {
    const dur = r.range(3, 6);
    const V = voice(e, t, d, { ref: 60, send: 0.3, dur, label: 'debris' });
    if (!V) return null;
    const pts = [[t, 0, 'set']];
    for (let x = 0.15; x < dur - 0.3; x += r.range(0.15, 0.5)) pts.push([t + x, r.range(0.15, 0.6) * (1 - x / dur), 'lin']);
    pts.push([t + dur, 0.0001, 'exp']);
    const s = noise(V, B.crackle, t, dur, r, r.range(0.8, 1.2));
    chain(V, s, bq('bandpass', 2800, 0.7), eg(pts), V.in);
    return finish(V);
  };
  // distant dog: short barks, or a howl along with the siren (a real, common detail)
  E.dog = (pos, t, d, r, howl) => {
    const dur = howl ? 6.5 : 1.6;
    const V = voice(pos, t, d, { ref: 30, send: 0.5, dur, label: howl ? 'dog:howl' : 'dog:bark' });
    if (!V) return null;
    if (howl) {
      for (let i = 0; i < 2; i++) {
        const tb = t + i * 3.1, f = r.range(440, 520);
        const o = osc(V, 'sawtooth', tb, 2.9, [[tb, f * 0.9, 'set'], [tb + 0.9, f * 1.3, 'lin'], [tb + 2.0, f * 1.18, 'lin'], [tb + 2.8, f * 0.95, 'lin']]);
        const lfo = ac.createOscillator(); lfo.frequency.value = 5.2; const lg = lvl(9); lfo.connect(lg).connect(o.frequency); lfo.start(tb); lfo.stop(tb + 2.9); V.srcs.push(lfo); V.nodes.push(lg);
        chain(V, o, bq('bandpass', 950, 1.6), eg([[tb, 0, 'set'], [tb + 0.5, 0.5, 'lin'], [tb + 2.2, 0.45, 'lin'], [tb + 2.85, 0.0001, 'exp']]), V.in);
      }
    } else {
      const n = 2 + Math.floor(r.next() * 2);
      for (let i = 0; i < n; i++) {
        const tb = t + i * r.range(0.3, 0.42), f = r.range(480, 600);
        const o = osc(V, 'sawtooth', tb, 0.22, [[tb, f, 'set'], [tb + 0.03, f * 1.12, 'lin'], [tb + 0.18, f * 0.72, 'exp']]);
        chain(V, o, bq('bandpass', 1100, 2.2), eg([[tb, 0, 'set'], [tb + 0.012, 0.9, 'lin'], [tb + 0.18, 0.0001, 'exp']]), V.in);
        const nz = noise(V, B.white, tb, 0.08, r);
        chain(V, nz, bq('bandpass', 1700, 1.5), eg([[tb, 0, 'set'], [tb + 0.004, 0.3, 'lin'], [tb + 0.06, 0.0001, 'exp']]), V.in);
      }
    }
    return finish(V);
  };

  // ---------------------------------------------------------------- civil-defence siren
  // Electronic rising-and-falling tone: band-limited horn spectrum, two detuned drivers, horn
  // resonances; rounded turnarounds; slow random AM (stronger far away: wind, refraction);
  // distance level/air re-evaluated by the caller (track()); slapback off the town's walls.
  E.siren = (pos, t0, nCycles, d, o = {}) => {
    const r = makeRng(seed, 'siren:' + (o.name || '') + ':' + Math.round(t0 * 10));
    const fLo = o.fLo ?? 330, fHi = o.fHi ?? 720, rise = o.rise ?? 2.3, fall = o.fall ?? 2.3, spin = rise * 1.4;
    const fp = [[t0, fLo * 0.45, 'set']];
    const half = (ta, fa, fb, T) => { for (let k = 1; k <= 8; k++) { const u = k / 8, w = 0.75 * u + 0.25 * (0.5 - 0.5 * Math.cos(Math.PI * u)); fp.push([ta + T * u, fa * Math.pow(fb / fa, w), 'lin']); } };
    half(t0, fLo * 0.45, fHi, spin);
    let t = t0 + spin;
    for (let i = 0; i < nCycles; i++) { half(t, fHi, fLo, fall); t += fall; half(t, fLo, fHi, rise); t += rise; }
    const tEnd = t, tOff = tEnd + 3.6;
    half(tEnd, fHi, fLo * 0.38, 3.6);
    const now = live ? ac.currentTime : 0;
    if (tOff <= now) return null;
    const mk = (mul) => { const x = ac.createOscillator(); x.setPeriodicWave(hornWave()); applyEnv(x.frequency, fp.map(([a, v, m]) => [a, v * mul, m]), now); x.start(Math.max(now, t0)); x.stop(tOff + 0.05); return x; };
    const o1 = mk(1), o2 = mk(1.0045);
    const g2 = lvl(0.6), pre = lvl(0.5);
    const hp = bq('highpass', 280, 0.7), pk1 = bq('peaking', 1150, 1.4, null, 6), pk2 = bq('peaking', 2500, 2, null, 3), lp = bq('lowpass', 5200, 0.6);
    const env = lvl(0);
    applyEnv(env.gain, [[t0, 0, 'set'], [t0 + 0.5, 1, 'lin'], [tEnd, 1, 'lin'], [tOff, 0.0001, 'exp']], now);
    const am = lvl(1), depth = clamp(0.12 + d / 12000, 0.12, 0.4);
    const lfos = [];
    for (const [f, a] of [[r.range(0.13, 0.22), 0.6], [r.range(0.33, 0.5), 0.4]]) { const l = ac.createOscillator(); l.frequency.value = f; const lg = lvl(depth * a); l.connect(lg).connect(am.gain); l.start(Math.max(now, t0)); l.stop(tOff + 0.05); lfos.push(l, lg); }
    o1.connect(pre); o2.connect(g2).connect(pre); pre.connect(hp).connect(pk1).connect(pk2).connect(lp).connect(env).connect(am);
    const airs = twoPole(airCut(d)), ref = o.ref ?? 160, power = o.power ?? 1, g = lvl(distGain(d, ref) * power);
    const p = pannerAt(pos);
    am.connect(airs[0]).connect(airs[1]).connect(g).connect(p).connect(bus.siren);
    const send = lvl(0.35 + 0.5 * clamp(d / 3000, 0, 1)); g.connect(send).connect(verb);
    const nodes = [o1, o2, g2, pre, hp, pk1, pk2, lp, env, am, ...airs, g, p, send, ...lfos];
    if (o.slap) { // discrete reflections off nearby building faces, from either side
      for (const [dt, gg, pan, f] of [[0.19, 0.32, -0.6, 3000], [0.43, 0.2, 0.55, 2000], [0.78, 0.1, -0.2, 1400]]) {
        const dl = ac.createDelay(1.5); dl.delayTime.value = dt; const fl = bq('lowpass', f, 0.5); const gl = lvl(gg); const sp = ac.createStereoPanner(); sp.pan.value = pan;
        g.connect(dl).connect(fl).connect(gl).connect(sp).connect(bus.siren); nodes.push(dl, fl, gl, sp);
      }
    }
    stats.reserved++; stats.maxReserved = Math.max(stats.maxReserved, stats.reserved);
    o1.onended = () => { stats.reserved--; for (const n of nodes) n.disconnect(); };
    let stopped = false;
    return {
      t0, tEnd, tOff, fLo, fHi, period: rise + fall, contour: fp, pos, ref, power, g, airs,
      // re-evaluate level and air for the listener at context time c
      track(L, c, first) { const dd = Math.hypot(pos.x - L.x, pos.y - L.y, pos.z - L.z), set = (pr, v) => (first ? pr.setValueAtTime(v, c) : pr.linearRampToValueAtTime(v, c)); set(g.gain, distGain(dd, ref) * power); for (const a of airs) set(a.frequency, airCut(dd)); },
      // clean early stop: hold the current value, wind the pitch down, fade out
      stop(at) {
        if (stopped || at >= tOff) return; stopped = true;
        const hold = (pr) => { if (pr.cancelAndHoldAtTime) pr.cancelAndHoldAtTime(at); else { pr.cancelScheduledValues(at); pr.setValueAtTime(pr.value, at); } };
        hold(env.gain); env.gain.setTargetAtTime(0, at, 0.7);
        for (const x of [o1, o2]) { hold(x.frequency); x.frequency.exponentialRampToValueAtTime(fLo * 0.4, at + 3); try { x.stop(at + 3.2); } catch (_) { /* */ } }
      },
    };
  };
  let horn = null;
  function hornWave() {
    if (horn) return horn;
    const N = 14, re = new Float32Array(N + 1), im = new Float32Array(N + 1);
    for (let k = 1; k <= N; k++) im[k] = (k % 2 ? 1 : 0.35) / Math.pow(k, 1.05) * (k > 9 ? Math.exp(-(k - 9) * 0.5) : 1);
    return (horn = ac.createPeriodicWave(re, im));
  }

  // ---------------------------------------------------------------- ambience + tension bed
  // Non-positional beds with listener-dependent levels: wind (more with altitude), insects (near
  // the ground, silenced by the siren), town hum + traffic (near Arad), and a low original bed.
  E.ambience = (t0 = 0) => {
    const A = {};
    const loop = (buf, rate, off) => { const s = ac.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate; s.start(t0, off % buf.duration); return s; };
    const off = (t0 * 0.6180339) % 7;
    const slow = (param, f, depth) => { const l = ac.createOscillator(); l.frequency.value = f; const g = lvl(depth); l.connect(g).connect(param); l.start(t0); };
    A.duck = lvl(1); A.duck.connect(bus.amb);
    // wind: the 19.7 s loop gets a slow level/brightness drift at unrelated rates, so it never repeats exactly
    A.windL = lvl(0.32); const wl = lvl(1), wf = bq('lowpass', 2500, 0.5);
    loop(B.wind, 1, off).connect(bq('highpass', 85, 0.7)).connect(wf).connect(wl).connect(A.windL).connect(A.duck);
    slow(wl.gain, 0.031, 0.25); slow(wf.frequency, 0.047, 900);
    // insects: three individuals' loops at prime-ish lengths (7.31, 11.07, 13.73 s) and rates
    A.insects = lvl(1); A.insL = lvl(0.18); A.insects.connect(A.insL).connect(A.duck);
    loop(B.cricketsA, 1, off * 1.3).connect(A.insects);
    loop(B.cricketsB, 0.97, off * 0.7).connect(lvl(0.6)).connect(A.insects);
    loop(B.cricketsC, 1.021, off * 1.9).connect(lvl(0.45)).connect(A.insects);
    // town: low hum (mains 50 Hz harmonics, very faint), distant traffic swells
    A.town = lvl(1); A.townL = lvl(0.12); A.town.connect(A.townL).connect(A.duck);
    loop(B.brown, 1, off).connect(bq('lowpass', 160, 0.7)).connect(bq('highpass', 45, 0.7)).connect(lvl(0.3)).connect(A.town);
    for (const [f, g] of [[50, 0.006], [100, 0.01], [150, 0.004]]) { const o = ac.createOscillator(); o.frequency.value = f; o.start(t0); o.connect(lvl(g)).connect(A.town); }
    A.traffic = lvl(1); loop(B.pink, 0.8, off * 1.7).connect(bq('bandpass', 520, 0.9)).connect(A.traffic).connect(lvl(0.5)).connect(A.town);
    slow(A.traffic.gain, 0.043, 0.35);
    // tension bed: "bowed" noise resonances at A1/E2 plus three detuned saws through a slowly
    // moving lowpass: a breathing, un-tonal low pad. Resolves to a warm major pad at the all-clear.
    A.bed = lvl(0); A.bed.connect(bus.bed);
    for (const [f, g] of [[55, 7], [82.41, 5], [110, 2.5]]) loop(B.pink, 1, off * f % 5).connect(bq('bandpass', f, 18)).connect(lvl(g)).connect(A.bed);
    const sawF = bq('lowpass', 240, 0.8); slow(sawF.frequency, 0.053, 110); sawF.connect(lvl(0.5)).connect(A.bed);
    for (const f of [54.7, 55.4, 82.0]) { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.start(t0); o.connect(lvl(0.12)).connect(sawF); }
    A.third = lvl(0); A.third.connect(bus.bed);
    const padF = bq('lowpass', 700, 0.6); slow(padF.frequency, 0.07, 250); padF.connect(A.third);
    for (const f of [110.3, 138.59, 164.81, 219.6]) { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.start(t0); o.connect(lvl(0.1)).connect(padF); }
    return A;
  };
  // mission beats -> ambience targets (t in context time; tau = time constant)
  E.beat = (A, type, t) => {
    const T = (p, v, at, tau) => { if (at < 0) { p.setValueAtTime(v, 0); return; } p.setTargetAtTime(v, at, tau); };
    if (type === 'alert:early') T(A.bed.gain, 0.03, t, 3);
    else if (type === 'alert:start') { T(A.duck.gain, 0.42, t, 0.5); T(A.insects.gain, 0, t + 0.7, 0.5); T(A.traffic.gain, 0.3, t, 5); T(A.bed.gain, 0.06, t, 4); }
    else if (type === 'alert:impactWindow') { T(A.bed.gain, 0.06, t, 3); T(A.duck.gain, 0.6, t, 2); }
    else if (type === 'alert:end') T(A.bed.gain, 0.035, t, 5);
    else if (type === 'allclear') {
      T(A.third.gain, 0.06, t, 2.5); T(A.third.gain, 0, t + 10, 4); T(A.bed.gain, 0, t + 6, 4);
      T(A.duck.gain, 1, t, 4); T(A.insects.gain, 1, t + 7, 7); T(A.traffic.gain, 1, t + 4, 9);
    }
  };
  // listener-dependent ambience levels
  E.ambLevels = (L) => {
    const alt = Math.max(0, L.y), dt = Math.hypot(L.x, L.z);
    return { wind: 0.22 + 0.3 * clamp(alt / 2000, 0, 1), ins: 0.2 * clamp(1 - alt / 700, 0.05, 1) * clamp(1.6 - dt / 2500, 0.1, 1), town: 0.14 * clamp(700 / (Math.hypot(dt, alt) + 400), 0, 1.2) };
  };

  // ---------------------------------------------------------------- movers (Shahed, cruise, jets)
  // Persistent voices whose position, level, air filter and Doppler rate are automated. Jets
  // also get a ground-reflection comb (delay = path difference) that sweeps as they pass.
  E.mover = (kind, r, t0) => {
    const g = lvl(0);
    const lps = twoPole(2000);
    const p = pannerAt({ x: 0, y: 0, z: 0 });
    const mixIn = ac.createGain();
    mixIn.connect(lps[0]).connect(lps[1]).connect(g).connect(p).connect(bus.sfx);
    const sendG = lvl(0.25); g.connect(sendG).connect(verb);
    const rates = [];
    const base = r.range(0.93, 1.07);
    const src = (buf, rate) => { const s = ac.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate * base; s.start(t0, r.range(0, buf.duration)); rates.push([s.playbackRate, rate * base]); return s; };
    let ref = 70, power = 0.8, flange = null;
    if (kind === 'drone') { src(B.engine, 1).connect(bq('peaking', 900, 1, null, 4)).connect(mixIn); }
    else if (kind === 'cruise') { ref = 120; power = 0.9; src(B.pink, 1).connect(bq('bandpass', 1500, 1.2)).connect(lvl(0.9)).connect(mixIn); src(B.brown, 1).connect(bq('lowpass', 300, 0.7)).connect(lvl(0.8)).connect(mixIn); }
    else {
      ref = 400; power = 1;
      const jin = ac.createGain();
      src(B.pink, 1).connect(bq('lowpass', 1100, 0.7)).connect(lvl(0.8)).connect(jin); src(B.brown, 1).connect(bq('lowpass', 260, 0.7)).connect(jin); src(B.pink, 1.3).connect(bq('bandpass', 2600, 3)).connect(lvl(0.25)).connect(jin);
      flange = ac.createDelay(0.05); flange.delayTime.value = 0.005;
      jin.connect(mixIn); jin.connect(flange).connect(lvl(0.7)).connect(mixIn);
    }
    return { kind, g, lp: lps[0], lps, p, rates, ref, power, flange };
  };
  E.flangeDelay = (L, P, d) => clamp(2 * Math.max(2, L.y) * Math.max(10, P.y) / Math.max(50, d) / C, 0.0003, 0.03);
  return E;
}
