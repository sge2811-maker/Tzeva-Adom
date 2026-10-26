// Audio engine shared by the live mix (AudioContext) and the offline renderer
// (OfflineAudioContext): the same graph builders, sound recipes, distance model and voice
// allocator are used by both, so __slice.audioOffline() renders what the player hears.
//
// Distance model (per one-shot / mover, computed from the listener at arrival time):
//   level   = ref / max(ref, d)                spherical spreading (inverse distance)
//   air     = lowpass at 20 kHz / (1 + d/700)  air + ground absorption: highs die over km
//   wet     = reverb send grows with distance  (distant sounds are mostly reflections)
//   delay   = d / 343 s                        speed of sound (applied by the caller)
// Direction comes from a PannerNode with no built-in rolloff (equal-power, deterministic).
import { makeRng } from '../core/rng.js';
import { getBuffers, applyEnv } from './dsp.js';

export const C = 343;          // speed of sound, m/s
export const CAP = 48;         // concurrent one-shot voices (sirens, ambience, movers are reserved)
export const EXO_ALT = 20000;  // blasts above this altitude are inaudible on the ground (thin air)
export const MAXD = { launch: 30000, blast: 45000 };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const airCut = (d) => clamp(20000 / (1 + d / 700), 150, 20000);
export const distGain = (d, ref) => ref / Math.max(ref, d);
export const evRng = (seed, e) => makeRng(seed, `snd:${e.type}:${e.kind || ''}:${e.id ?? ''}:${Math.round((e.t || 0) * 600)}`);

const LAUNCH = {
  //        dur  band start→end   roar  low   crack ref  2nd pulse
  dome: { dur: 2.9, b0: 2900, b1: 950, roar: 0.85, low: 0.4, crack: 0.9, ref: 70, pulse2: false },
  sling: { dur: 4.6, b0: 1900, b1: 520, roar: 1.0, low: 0.8, crack: 1.15, ref: 95, pulse2: true },
  arrow: { dur: 8.5, b0: 1000, b1: 190, roar: 1.1, low: 1.35, crack: 1.3, ref: 170, pulse2: false },
  aam: { dur: 1.8, b0: 3800, b1: 1700, roar: 0.45, low: 0.15, crack: 0.25, ref: 45, pulse2: false },
};
export const SIZE = { intercept: { ballistic: 1.0, cruise: 0.62, drone: 0.45 }, impact: { ballistic: 1.7, cruise: 1.05, drone: 0.65 } };

export function createEngine(ac, { seed = 1, live = false } = {}) {
  const B = getBuffers(ac, seed);
  const stats = { oneShots: 0, stolen: 0, dropped: 0, maxConc: 0, reserved: 0, maxReserved: 0 };
  const E = { ac, B, seed, live, stats, voices: [], timeline: [] };

  // ---------------------------------------------------------------- master chain
  const out = ac.createGain(); out.gain.value = 0.85;
  const lim = ac.createDynamicsCompressor(); // safety limiter: fast, hard knee
  lim.threshold.value = -2.5; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.0015; lim.release.value = 0.12;
  const trim = ac.createGain(); trim.gain.value = 0.84; // keeps true peak under about -1 dBTP after limiter overshoot
  out.connect(lim).connect(trim).connect(ac.destination);
  const glue = ac.createDynamicsCompressor(); // weapons bus glue: big booms push the rest down a little
  glue.threshold.value = -22; glue.knee.value = 8; glue.ratio.value = 2.6; glue.attack.value = 0.005; glue.release.value = 0.4;
  glue.connect(out);
  const bus = {};
  for (const b of ['sfx', 'siren', 'amb', 'bed', 'ui']) { bus[b] = ac.createGain(); bus[b].connect(b === 'sfx' ? glue : out); }
  bus.amb.gain.value = 1.35; bus.bed.gain.value = 0.3; bus.ui.gain.value = 0.5;
  const verb = ac.createConvolver(); verb.normalize = true; verb.buffer = B.ir;
  const verbOut = ac.createGain(); verbOut.gain.value = 0.55;
  verb.connect(verbOut).connect(out);
  Object.assign(E, { out, bus, verb });

  // ---------------------------------------------------------------- building blocks
  const pannerAt = (pos) => {
    const p = ac.createPanner(); p.panningModel = 'equalpower'; p.distanceModel = 'linear'; p.rolloffFactor = 0; p.refDistance = 1; p.maxDistance = 1e7;
    p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z;
    return p;
  };
  const bq = (type, f, q = 0.7, pts, gain) => { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; if (gain != null) b.gain.value = gain; if (pts) applyEnv(b.frequency, pts); return b; };
  const eg = (pts) => { const g = ac.createGain(); g.gain.value = 0; applyEnv(g.gain, pts); return g; };
  // attack / hold / exponential decay envelope
  const dec = (t, peak, a, hold, end) => [[t, 0, 'set'], [t + a, peak, 'lin'], [t + a + hold, peak * 0.85, 'lin'], [t + end, 0.0001, 'exp']];
  function chain(V, first, ...rest) { let n = first; for (const x of rest) { n.connect(x); n = x; V.nodes.push(x); } n.connect(V.in); return n; }
  function noise(V, buf, t, dur, r, rate = 1, ratePts) {
    const s = ac.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate;
    if (ratePts) applyEnv(s.playbackRate, ratePts);
    s.start(t, r ? r.range(0, buf.duration * 0.95) : 0); s.stop(t + dur); V.srcs.push(s); return s;
  }
  function osc(V, type, t, dur, fPts) { const o = ac.createOscillator(); o.type = type; applyEnv(o.frequency, fPts); o.start(t); o.stop(t + dur); V.srcs.push(o); return o; }

  // a spatial one-shot voice: in -> air lowpass -> distance gain -> panner -> bus (+ reverb send)
  function voice(pos, t, d, o = {}) {
    const gain = distGain(d, o.ref ?? 100) * (o.power ?? 1);
    const V = { t, end: t + (o.dur || 3), prio: gain, d, nodes: [], srcs: [], label: o.label || '' };
    if (!admit(V)) return null;
    const vin = ac.createGain();
    const lp = bq('lowpass', airCut(d) * (o.air ?? 1), 0.5);
    const g = ac.createGain(); g.gain.value = gain;
    const p = pannerAt(pos);
    vin.connect(lp).connect(g).connect(p).connect(bus[o.bus || 'sfx']);
    const s = ac.createGain(); s.gain.value = (o.send ?? 0.25) * (0.3 + 0.7 * clamp(d / 2500, 0, 1));
    g.connect(s).connect(verb);
    V.in = vin; V.nodes.push(vin, lp, g, p, s);
    V.kill = (at) => { vin.gain.setTargetAtTime(0, at, 0.012); for (const x of V.srcs) { try { x.stop(at + 0.1); } catch (_) { /* already stopped */ } } };
    return V;
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
  // free every node once the voice's sources have all ended (no graph leaks in the live mix)
  function finish(V) {
    let left = V.srcs.length;
    const done = () => { if (--left > 0) return; for (const n of V.nodes) n.disconnect(); for (const s of V.srcs) s.disconnect(); };
    for (const s of V.srcs) s.onended = done;
    return V;
  }

  // ---------------------------------------------------------------- recipes
  // supersonic crack / ignition: a 1-3 ms N-wave pair plus a bright noise spit and a short thump
  function crack(V, t, amp, bright = 1, r) {
    const n = noise(V, B.white, t, 0.08, r);
    chain(V, n, bq('highpass', 700 * bright, 0.7), eg([[t, 0, 'set'], [t + 0.0008, amp, 'lin'], [t + 0.004, amp * 0.5, 'lin'], [t + 0.05, 0.0001, 'exp']]));
    const o = osc(V, 'sine', t, 0.3, [[t, 150 * bright, 'set'], [t + 0.14, 42, 'exp']]);
    chain(V, o, eg([[t, 0, 'set'], [t + 0.002, amp * 0.9, 'lin'], [t + 0.22, 0.0001, 'exp']]));
  }

  // interceptor launch: ignition crack, a roaring motor that recedes upward (falling band and a
  // Doppler-like pitch drop), motor crackle and a ground rumble. Per-layer signatures.
  E.launch = (e, t, d, r) => {
    const P = LAUNCH[e.kind] || LAUNCH.dome, k = r.range(0.86, 1.14), dur = P.dur * k;
    const V = voice(e, t, d, { ref: P.ref, send: 0.3, dur: dur + 0.3, label: 'launch:' + e.kind });
    if (!V) return null;
    crack(V, t, P.crack * r.range(0.8, 1.1), e.kind === 'arrow' ? 0.7 : 1, r);
    const rate0 = r.range(0.9, 1.1), b0 = P.b0 * k, roar = P.roar * r.range(0.85, 1.1);
    const rp = [[t, 0, 'set'], [t + 0.06, roar, 'lin']];
    if (P.pulse2) { const t2 = t + r.range(0.75, 1.05); rp.push([t2 - 0.12, roar * 0.55, 'lin'], [t2, roar * 1.05, 'lin']); crack(V, t2, P.crack * 0.45, 0.9, r); rp.push([t2 + dur * 0.3, roar * 0.7, 'lin']); }
    else rp.push([t + dur * 0.28, roar * 0.75, 'lin']);
    rp.push([t + dur, 0.0001, 'exp']);
    const s1 = noise(V, B.pink, t, dur, r, rate0, [[t, rate0, 'set'], [t + dur, rate0 * 0.7, 'exp']]);
    chain(V, s1, bq('bandpass', b0, 0.8, [[t, b0, 'set'], [t + dur, P.b1, 'exp']]), eg(rp));
    const s2 = noise(V, B.crackle, t, dur, r, 1, [[t, 1, 'set'], [t + dur, 0.75, 'exp']]);
    chain(V, s2, bq('highpass', 1300, 0.7), eg(rp.map(([a, v, m]) => [a, v * 0.5, m])));
    const s3 = noise(V, B.brown, t, dur, r);
    chain(V, s3, bq('lowpass', 240, 0.7), eg(dec(t, P.low, 0.08, dur * 0.2, dur)));
    return finish(V);
  };

  // air blast or ground impact: near crack(s), body thump, and a rolling tail whose length grows
  // with distance (terrain echoes; far blasts arrive as thunder with no highs left)
  function blast(e, t, d, r, size, ground, double) {
    const near = clamp(1 - (d - 600) / 3800, 0, 1), far = clamp(d / 3000, 0.3, 1);
    const tail = clamp(2.2 + d / 1800, 2.6, 9) * (ground ? 1.15 : 1) * r.range(0.9, 1.1);
    const V = voice(e, t, d, { ref: 520 * size, send: 0.45, dur: tail + 0.4, label: (ground ? 'impact:' : 'blast:') + (e.threatType || e.type) });
    if (!V) return null;
    if (near > 0) {
      crack(V, t, 1.25 * near * Math.sqrt(size), 1, r);
      if (double) crack(V, t + r.range(0.07, 0.22), 0.75 * near * Math.sqrt(size), 0.85, r);
    }
    const f0 = (ground ? 58 : 72) * r.range(0.9, 1.1);
    const o = osc(V, 'sine', t, 1.8 * size + 0.3, [[t, f0, 'set'], [t + 1.1 * size, ground ? 22 : 28, 'exp']]);
    chain(V, o, eg(dec(t, 1.1 * Math.min(1.4, size), 0.006, 0.05, 1.5 * size + 0.2)));
    const body = noise(V, B.brown, t, 2.2 * size, r);
    chain(V, body, bq('lowpass', 900, 0.6, [[t, 1100 * Math.min(1.3, size), 'set'], [t + 1.6 * size, 110, 'exp']]), eg(dec(t, 1.0, 0.01, 0.1, 2 * size)));
    // rolling tail: echo bumps from terrain / buildings / the escarpment
    const tp = [[t, 0, 'set'], [t + 0.12, 0.55 * far, 'lin']], nb = 3 + Math.floor(r.next() * 3);
    let last = t + 0.12;
    for (let i = 1; i <= nb; i++) {
      const tb = Math.max(last + 0.3, t + (i / (nb + 1)) * tail * r.range(0.85, 1.15)), v = far * 0.6 * Math.exp(-1.3 * i / nb) * r.range(0.7, 1.2);
      if (tb > t + tail - 0.4) break;
      tp.push([tb - 0.22, v * 0.55, 'lin'], [tb, v, 'lin']); last = tb;
    }
    tp.push([t + tail, 0.0001, 'exp']);
    const tl = noise(V, B.brown, t, tail, r, r.range(0.9, 1.1));
    chain(V, tl, bq('lowpass', 300, 0.6, [[t, 420, 'set'], [t + tail, 140, 'exp']]), eg(tp));
    if (ground && near > 0) { // ground debris rattle
      const rr = noise(V, B.crackle, t + 0.05, 2.2, r, 0.7);
      chain(V, rr, bq('lowpass', 2600, 0.6), eg(dec(t + 0.05, 0.45 * near, 0.02, 0.2, 2.1)));
    }
    return finish(V);
  }
  E.intercept = (e, t, d, r) => blast(e, t, d, r, e.kill ? (SIZE.intercept[e.threatType] || 0.5) : 0.35, false, e.kill && e.threatType !== 'drone');
  E.impact = (e, t, d, r) => blast(e, t, d, r, SIZE.impact[e.type] || 1, true, false);
  // burning debris: crackle that flickers as fragments fall (only close to the listener)
  E.debris = (e, t, d, r) => {
    const dur = r.range(3, 6);
    const V = voice(e, t, d, { ref: 60, send: 0.3, dur, label: 'debris' });
    if (!V) return null;
    const pts = [[t, 0, 'set']];
    for (let x = 0.15; x < dur - 0.3; x += r.range(0.15, 0.5)) pts.push([t + x, r.range(0.15, 0.6) * (1 - x / dur), 'lin']);
    pts.push([t + dur, 0.0001, 'exp']);
    const s = noise(V, B.crackle, t, dur, r, r.range(0.8, 1.2));
    chain(V, s, bq('bandpass', 2800, 0.7), eg(pts));
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
        const lfo = ac.createOscillator(); lfo.frequency.value = 5.2; const lg = ac.createGain(); lg.gain.value = 9; lfo.connect(lg).connect(o.frequency); lfo.start(tb); lfo.stop(tb + 2.9); V.srcs.push(lfo); V.nodes.push(lg);
        chain(V, o, bq('bandpass', 950, 1.6), eg([[tb, 0, 'set'], [tb + 0.5, 0.5, 'lin'], [tb + 2.2, 0.45, 'lin'], [tb + 2.85, 0.0001, 'exp']]));
      }
    } else {
      const n = 2 + Math.floor(r.next() * 2);
      for (let i = 0; i < n; i++) {
        const tb = t + i * r.range(0.3, 0.42), f = r.range(480, 600);
        const o = osc(V, 'sawtooth', tb, 0.22, [[tb, f, 'set'], [tb + 0.03, f * 1.12, 'lin'], [tb + 0.18, f * 0.72, 'exp']]);
        chain(V, o, bq('bandpass', 1100, 2.2), eg([[tb, 0, 'set'], [tb + 0.012, 0.9, 'lin'], [tb + 0.18, 0.0001, 'exp']]));
        const nz = noise(V, B.white, tb, 0.08, r);
        chain(V, nz, bq('bandpass', 1700, 1.5), eg([[tb, 0, 'set'], [tb + 0.004, 0.3, 'lin'], [tb + 0.06, 0.0001, 'exp']]));
      }
    }
    return finish(V);
  };

  // ---------------------------------------------------------------- civil-defence siren
  // Electronic rising-and-falling tone through a driven horn: square + octave, soft clip, horn
  // resonances, then distance, slapback off the town's walls and the reverb. Reserved voice.
  // Returns the analytic pitch contour (for the report) and the times it actually sounds.
  E.siren = (pos, t0, nCycles, d, o = {}) => {
    const fLo = o.fLo ?? 330, fHi = o.fHi ?? 720, rise = o.rise ?? 2.3, fall = o.fall ?? 2.3, spin = rise * 1.4;
    const fp = [[t0, fLo * 0.45, 'set'], [t0 + spin, fHi, 'exp']];
    let t = t0 + spin;
    for (let i = 0; i < nCycles; i++) { fp.push([t + fall, fLo, 'exp'], [t + fall + rise, fHi, 'exp']); t += fall + rise; }
    const tEnd = t, tOff = tEnd + 3.6;
    fp.push([tOff, fLo * 0.38, 'exp']);
    const now = live ? ac.currentTime : 0;
    if (tOff <= now) return null;
    // band-limited driven-horn spectrum (no aliasing): strong odd harmonics, weaker even ones,
    // rolled off above the 11th; a second, slightly detuned voice gives the multi-driver chorus
    const mk = (mul) => { const x = ac.createOscillator(); x.setPeriodicWave(hornWave()); applyEnv(x.frequency, fp.map(([a, v, m]) => [a, v * mul, m]), now); x.start(Math.max(now, t0)); x.stop(tOff + 0.05); return x; };
    const o1 = mk(1), o2 = mk(1.0045);
    const g2 = ac.createGain(); g2.gain.value = 0.6;
    const sh = ac.createGain(); sh.gain.value = 1;
    const pre = ac.createGain(); pre.gain.value = 0.5;
    const hp = bq('highpass', 280, 0.7), pk1 = bq('peaking', 1150, 1.4, null, 6), pk2 = bq('peaking', 2500, 2, null, 3), lp = bq('lowpass', 5200, 0.6);
    const env = ac.createGain(); env.gain.value = 0;
    applyEnv(env.gain, [[t0, 0, 'set'], [t0 + 0.5, 1, 'lin'], [tEnd, 1, 'lin'], [tOff, 0.0001, 'exp']], now);
    o1.connect(pre); o2.connect(g2).connect(pre); pre.connect(sh).connect(hp).connect(pk1).connect(pk2).connect(lp).connect(env);
    const air = bq('lowpass', airCut(d), 0.5), g = ac.createGain(); g.gain.value = distGain(d, o.ref ?? 160) * (o.power ?? 1);
    const p = pannerAt(pos);
    env.connect(air).connect(g).connect(p).connect(bus.siren);
    const send = ac.createGain(); send.gain.value = 0.35 + 0.5 * clamp(d / 3000, 0, 1); g.connect(send).connect(verb);
    const nodes = [o1, o2, g2, pre, sh, hp, pk1, pk2, lp, env, air, g, p, send];
    if (o.slap) { // discrete reflections off nearby building faces, from either side
      for (const [dt, gg, pan, f] of [[0.19, 0.32, -0.6, 3000], [0.43, 0.2, 0.55, 2000], [0.78, 0.1, -0.2, 1400]]) {
        const dl = ac.createDelay(1.5); dl.delayTime.value = dt; const fl = bq('lowpass', f, 0.5); const gl = ac.createGain(); gl.gain.value = gg; const sp = ac.createStereoPanner(); sp.pan.value = pan;
        g.connect(dl).connect(fl).connect(gl).connect(sp).connect(bus.siren); nodes.push(dl, fl, gl, sp);
      }
    }
    stats.reserved++; stats.maxReserved = Math.max(stats.maxReserved, stats.reserved);
    o1.onended = () => { stats.reserved--; for (const n of nodes) n.disconnect(); };
    return { t0, tEnd, tOff, fLo, fHi, period: rise + fall, contour: fp, stop(at) { env.gain.cancelScheduledValues(at); env.gain.setTargetAtTime(0, at, 0.8); o1.stop(at + 4); o2.stop(at + 4); } };
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
    const lvl = (v) => { const g = ac.createGain(); g.gain.value = v; return g; };
    const off = o_offset(t0);
    A.duck = lvl(1); A.duck.connect(bus.amb);
    // wind
    A.windL = lvl(0.32); loop(B.wind, 1, off).connect(bq('highpass', 40, 0.7)).connect(A.windL).connect(A.duck);
    // insects
    A.insects = lvl(1); A.insL = lvl(0.18); A.insects.connect(A.insL).connect(A.duck);
    loop(B.cricketsA, 1, off * 1.3).connect(A.insects); const cb = loop(B.cricketsB, 0.97, off * 0.7); const cbg = lvl(0.6); cb.connect(cbg).connect(A.insects);
    // town: low hum (mains 50 Hz harmonics, very faint), distant traffic swells
    A.town = lvl(1); A.townL = lvl(0.12); A.town.connect(A.townL).connect(A.duck);
    const hum = loop(B.brown, 1, off); hum.connect(bq('lowpass', 160, 0.7)).connect(bq('highpass', 45, 0.7)).connect(lvl(0.3)).connect(A.town);
    for (const [f, g] of [[50, 0.012], [100, 0.02], [150, 0.008]]) { const o = ac.createOscillator(); o.frequency.value = f; o.start(t0); o.connect(lvl(g)).connect(A.town); }
    A.traffic = lvl(1); const tr = loop(B.pink, 0.8, off * 1.7); tr.connect(bq('bandpass', 520, 0.9)).connect(A.traffic).connect(lvl(0.5)).connect(A.town);
    const swell = ac.createOscillator(); swell.frequency.value = 0.043; const sw = lvl(0.35); swell.connect(sw).connect(A.traffic.gain); swell.start(t0);
    // tension bed: low open fifth (A1/E2) with a slow beat, filtered pink breath; resolves to a
    // major chord at the all-clear and fades. Very low in the mix.
    A.bed = lvl(0); A.bed.connect(bus.bed);
    for (const [f, g] of [[55, 0.5], [55.35, 0.35], [82.41, 0.4], [110, 0.12]]) { const o = ac.createOscillator(); o.frequency.value = f; o.start(t0); o.connect(lvl(g)).connect(A.bed); }
    const br = loop(B.pink, 0.5, off); br.connect(bq('lowpass', 180, 0.7)).connect(lvl(0.5)).connect(A.bed);
    A.third = lvl(0); A.third.connect(bus.bed);
    for (const [f, g] of [[138.59, 0.3], [164.81, 0.22], [220, 0.14]]) { const o = ac.createOscillator(); o.type = 'triangle'; o.frequency.value = f; o.start(t0); o.connect(lvl(g)).connect(A.third); }
    return A;
  };
  const o_offset = (t0) => (t0 * 0.6180339) % 7;
  // mission beats -> ambience targets (t in context time; tau = time constant)
  E.beat = (A, type, t) => {
    const T = (p, v, at, tau) => { if (at < 0) { p.setValueAtTime(v, 0); return; } p.setTargetAtTime(v, at, tau); };
    if (type === 'alert:early') T(A.bed.gain, 0.04, t, 3);
    else if (type === 'alert:start') { T(A.duck.gain, 0.42, t, 0.5); T(A.insects.gain, 0, t + 0.7, 0.5); T(A.traffic.gain, 0.3, t, 5); T(A.bed.gain, 0.1, t, 4); }
    else if (type === 'alert:impactWindow') { T(A.bed.gain, 0.13, t, 3); T(A.duck.gain, 0.6, t, 2); }
    else if (type === 'alert:end') T(A.bed.gain, 0.06, t, 5);
    else if (type === 'allclear') {
      T(A.third.gain, 0.05, t, 2); T(A.third.gain, 0, t + 9, 4); T(A.bed.gain, 0, t + 8, 4);
      T(A.duck.gain, 1, t, 4); T(A.insects.gain, 1, t + 7, 7); T(A.traffic.gain, 1, t + 4, 9);
    }
  };
  // listener-dependent ambience levels
  E.ambLevels = (L) => {
    const alt = Math.max(0, L.y - 0), dt = Math.hypot(L.x, L.z);
    return { wind: 0.22 + 0.3 * clamp(alt / 2000, 0, 1), ins: 0.2 * clamp(1 - alt / 700, 0.05, 1) * clamp(1.6 - dt / 2500, 0.1, 1), town: 0.14 * clamp(700 / (Math.hypot(dt, alt) + 400), 0, 1.2) };
  };

  // ---------------------------------------------------------------- movers (Shahed, cruise, jets)
  // Persistent voices whose position, level, air filter and Doppler rate are automated.
  E.mover = (kind, r, t0) => {
    const g = ac.createGain(); g.gain.value = 0;
    const lp = bq('lowpass', 2000, 0.5);
    const p = pannerAt({ x: 0, y: 0, z: 0 });
    lp.connect(g).connect(p).connect(bus.sfx);
    const sendG = ac.createGain(); sendG.gain.value = 0.25; g.connect(sendG).connect(verb);
    const rates = [];
    const base = r.range(0.93, 1.07);
    const src = (buf, rate) => { const s = ac.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate * base; s.start(t0, r.range(0, buf.duration)); rates.push([s.playbackRate, rate * base]); return s; };
    const lvl = (v) => { const x = ac.createGain(); x.gain.value = v; return x; };
    let ref = 70, power = 0.8;
    if (kind === 'drone') { src(B.engine, 1).connect(bq('peaking', 900, 1, null, 4)).connect(lvl(1)).connect(lp); }
    else if (kind === 'cruise') { ref = 120; power = 0.9; src(B.pink, 1).connect(bq('bandpass', 1500, 1.2)).connect(lvl(0.9)).connect(lp); src(B.brown, 1).connect(bq('lowpass', 300, 0.7)).connect(lvl(0.8)).connect(lp); }
    else { ref = 400; power = 1; src(B.pink, 1).connect(bq('lowpass', 1100, 0.7)).connect(lvl(0.8)).connect(lp); src(B.brown, 1).connect(bq('lowpass', 260, 0.7)).connect(lvl(1)).connect(lp); src(B.pink, 1.3).connect(bq('bandpass', 2600, 3)).connect(lvl(0.25)).connect(lp); }
    return { kind, g, lp, p, rates, ref, power, nodes: [g, lp, p, sendG] };
  };
  return E;
}
