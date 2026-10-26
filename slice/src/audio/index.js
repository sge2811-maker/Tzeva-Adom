// Audio stream. Everything is synthesized at runtime (no audio files): a civil-defence
// rising-and-falling siren from three poles in Arad plus Nevatim and Dimona in the distance,
// per-layer interceptor launches, near crack / far rumble blasts delayed by the speed of sound,
// heavy impacts, debris crackle, the Shahed two-stroke, cruise missiles, coalition jets, desert
// wind, insects that stop with the siren, a faint town hum, a distant dog and a low tension bed.
//
//   engine.js   graph builders, recipes, distance model, voice cap/stealing (shared live/offline)
//   dsp.js      seeded procedural buffers, clip-aware automation, WAV encoder
//   offline.js  window.__slice.audioOffline(t0, t1[, opts]) -> base64 WAV (+ __slice.audioMeta)
//
// The live mix starts on the 'begin' gesture. The camera track (listener) and mover positions
// are recorded every frame / 0.1 s so the offline render can reproduce the mix deterministically.
import { createEngine, C, EXO_ALT, MAXD, evRng } from './engine.js';
import { renderOffline, POLES, sirenCycles, dogPlan } from './offline.js';
import { makeRng } from '../core/rng.js';

const TRACK_N = 16384;

export function create(ctx) {
  const { bus, camera, sim, params, clock } = ctx;
  const rec = makeRecorder(ctx);
  const A = { ac: null, E: null, amb: null, movers: null, sirens: [], on: !params.mute, rec };
  ctx.audio = A;
  window.__slice.audioOffline = (t0, t1, opts = {}) => renderOffline(ctx, rec, t0, t1, opts).then((r) => { window.__slice.audioMeta = r.meta; return r.b64; });

  // ---------------------------------------------------------------- live mix
  let dogs = dogPlan(params.seed, ctx.pacing.alertAt, null), dogI = 0;
  function init() {
    if (A.ac || params.mute) return;
    try { A.ac = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'playback' }); } catch (e) { return; }
    const ac = A.ac;
    A.E = createEngine(ac, { seed: params.seed, live: true });
    A.amb = A.E.ambience(ac.currentTime);
    A.movers = { drone: [], cruise: [], jet: [] };
    const N = { drone: 4, cruise: 2, jet: 2 };
    for (const k in N) for (let i = 0; i < N[k]; i++) A.movers[k].push(A.E.mover(k, makeRng(params.seed, `live:${k}:${i}`), ac.currentTime));
    while (dogI < dogs.length && dogs[dogI].t <= sim.t) dogI++;
  }
  const camD = (p) => Math.hypot(p.x - camera.position.x, p.y - camera.position.y, p.z - camera.position.z);
  const when = (d) => A.ac.currentTime + 0.03 + d / C;

  bus.on('begin', () => { init(); if (A.ac && A.ac.state === 'suspended') A.ac.resume(); });
  bus.on('launch', (e) => { if (!A.ac) return; const d = camD(e); if (d <= MAXD.launch) A.E.launch(e, when(d), d, evRng(params.seed, { ...e, type: 'launch' })); });
  bus.on('intercept', (e) => {
    if (!A.ac || e.y > EXO_ALT) return;
    const d = camD(e); if (d > MAXD.blast) return;
    A.E.intercept(e, when(d), d, evRng(params.seed, { ...e, type: 'intercept' }));
    if (e.kill && !e.offmap && d < 5000) A.E.debris({ x: e.x, y: e.y - 150, z: e.z }, when(d) + 0.4, d, evRng(params.seed, { ...e, type: 'debris' }));
  });
  bus.on('impact', (e) => { if (!A.ac) return; const p = { x: e.x, y: e.y + 15, z: e.z }, d = camD(p); if (d <= MAXD.blast) A.E.impact(e, when(d), d, evRng(params.seed, e)); });
  bus.on('alert:start', (e) => {
    if (!A.ac) return;
    for (const P of POLES) { const d = camD(P.pos); A.sirens.push(A.E.siren(P.pos, when(d) + P.dt, sirenCycles(P, e.countdown ?? 75), d, P)); }
  });
  for (const type of ['alert:early', 'alert:start', 'alert:impactWindow', 'alert:end', 'allclear']) bus.on(type, () => { if (A.ac) A.E.beat(A.amb, type, A.ac.currentTime); });
  bus.on('allclear', (e) => { dogs = dogPlan(params.seed, ctx.pacing.alertAt, e.t); dogI = 0; while (dogI < dogs.length && dogs[dogI].t <= sim.t) dogI++; });
  // the siren stops cleanly if the sim moves on early (e.g. at 4x speed)
  bus.on('phase', ({ to }) => { if (A.ac && (to === 'hold' || to === 'aftermath')) { for (const s of A.sirens) if (s && s.tOff > A.ac.currentTime) s.stop(A.ac.currentTime); A.sirens.length = 0; } });

  // ---------------------------------------------------------------- UI (subtle, consistent)
  function ui(kind) {
    if (!A.ac) return;
    const ac = A.ac, t = ac.currentTime + 0.005, out = A.E.bus.ui;
    const blip = (f0, f1, dur, g, type = 'sine', at = t) => {
      const o = ac.createOscillator(), e = ac.createGain(); o.type = type;
      o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(f1, at + dur);
      e.gain.setValueAtTime(0, at); e.gain.linearRampToValueAtTime(g, at + 0.004); e.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(e).connect(out); o.start(at); o.stop(at + dur + 0.02); o.onended = () => { o.disconnect(); e.disconnect(); };
    };
    if (kind === 'ok') blip(1500, 1900, 0.05, 0.12);
    else if (kind === 'no') { blip(320, 260, 0.09, 0.14, 'triangle'); blip(320, 240, 0.09, 0.1, 'triangle', t + 0.1); }
    else if (kind === 'route') { blip(900, 1200, 0.05, 0.1); blip(1200, 1500, 0.06, 0.1, 'sine', t + 0.07); }
    else if (kind === 'unlock') { blip(180, 70, 0.18, 0.3, 'triangle'); blip(2400, 1800, 0.04, 0.08, 'square', t + 0.02); }
    else if (kind === 'build') { blip(120, 55, 0.25, 0.35, 'triangle'); blip(600, 1400, 0.22, 0.07, 'sine', t + 0.08); }
  }
  bus.on('cmd', ({ name, ok, args }) => { if (args && args.by === 'demo') return; if (!ok) ui('no'); else if (name === 'route') ui('route'); else if (name === 'unlock') ui('unlock'); else if (name === 'build') ui('build'); else ui('ok'); });

  // ---------------------------------------------------------------- per frame
  const near = { ids: new Array(4), d: new Float64Array(4), o: new Array(4) };
  function nearest(list, kind, k, L) {
    let n = 0;
    for (const th of list) {
      if (!th.alive || (kind !== 'jet' && th.type !== kind)) continue;
      const d = Math.hypot(th.pos.x - L.x, th.pos.y - L.y, th.pos.z - L.z);
      let i = Math.min(n, k); if (i === k && d >= near.d[k - 1]) continue;
      while (i > 0 && near.d[i - 1] > d) { if (i < k) { near.d[i] = near.d[i - 1]; near.o[i] = near.o[i - 1]; } i--; }
      near.d[i] = d; near.o[i] = th; if (n < k) n++;
    }
    return n;
  }
  let ambAcc = 9;
  return {
    update(dt) {
      rec.frame();
      const ac = A.ac; if (!ac) return;
      const L = camera.position, e = camera.matrixWorld.elements, tt = ac.currentTime, lis = ac.listener;
      if (lis.positionX) {
        lis.positionX.setTargetAtTime(L.x, tt, 0.03); lis.positionY.setTargetAtTime(L.y, tt, 0.03); lis.positionZ.setTargetAtTime(L.z, tt, 0.03);
        lis.forwardX.setTargetAtTime(-e[8], tt, 0.03); lis.forwardY.setTargetAtTime(-e[9], tt, 0.03); lis.forwardZ.setTargetAtTime(-e[10], tt, 0.03);
        lis.upX.setTargetAtTime(e[4], tt, 0.03); lis.upY.setTargetAtTime(e[5], tt, 0.03); lis.upZ.setTargetAtTime(e[6], tt, 0.03);
      }
      // movers: nearest Shaheds, cruise missiles and jets, with Doppler from radial speed
      for (const kind of ['drone', 'cruise', 'jet']) {
        const pool = A.movers[kind], n = nearest(kind === 'jet' ? sim.jets : sim.threats, kind, pool.length, L);
        for (let i = 0; i < pool.length; i++) {
          const v = pool[i];
          if (i >= n || ctx.clock.paused) { v.g.gain.setTargetAtTime(0, tt, 0.15); continue; }
          const th = near.o[i], d = near.d[i], p = th.pos, w = th.vel;
          const vr = ((p.x - L.x) * w.x + (p.y - L.y) * w.y + (p.z - L.z) * w.z) / Math.max(1, d);
          const rate = Math.min(1.6, Math.max(0.6, C / (C + vr)));
          v.g.gain.setTargetAtTime(v.ref / Math.max(v.ref, d) * v.power, tt, 0.08);
              for (const f of v.lps) f.frequency.setTargetAtTime(Math.max(150, Math.min(20000, 20000 / (1 + d / 700))), tt, 0.08);
          if (v.flange) v.flange.delayTime.setTargetAtTime(A.E.flangeDelay(L, p, d), tt, 0.05);
          v.p.positionX.setTargetAtTime(p.x, tt, 0.05); v.p.positionY.setTargetAtTime(p.y, tt, 0.05); v.p.positionZ.setTargetAtTime(p.z, tt, 0.05);
          for (const [pr, base] of v.rates) pr.setTargetAtTime(base * rate, tt, 0.1);
        }
      }
      // ambience levels follow the listener (4 Hz), dogs, pause duck
      ambAcc += dt;
      if (ambAcc > 0.25) {
        ambAcc = 0; const lv = A.E.ambLevels(L);
        A.amb.windL.gain.setTargetAtTime(lv.wind, tt, 0.3); A.amb.insL.gain.setTargetAtTime(lv.ins, tt, 0.3); A.amb.townL.gain.setTargetAtTime(lv.town, tt, 0.3);
        A.E.out.gain.setTargetAtTime(ctx.clock.paused ? 0.25 : 0.85, tt, 0.2);
      }
      while (dogI < dogs.length && dogs[dogI].t <= sim.t) {
        const g = dogs[dogI++]; if (ctx.flow !== 'play') continue;
        const d = camD(g.pos); if (d < 4000) A.E.dog(g.pos, when(d), d, evRng(params.seed, { type: 'dog', id: Math.round(g.t * 10), t: g.t }), g.howl);
      }
    },
  };
}

// Records (1) the camera/listener track per frame (sim time, real time, position, forward, up)
// in a fixed ring buffer, and (2) mover positions every 6 sim steps (0.1 s) by wrapping
// sim.step (read-only: the wrapper only samples positions after the original step).
function makeRecorder(ctx) {
  const { sim, camera, clock } = ctx;
  const T = new Float64Array(TRACK_N), R = new Float64Array(TRACK_N), P = new Float32Array(TRACK_N * 3), F = new Float32Array(TRACK_N * 3), U = new Float32Array(TRACK_N * 3);
  let head = 0, count = 0, lastT = -1;
  const movers = new Map();
  const step = sim.step;
  let k = 0;
  sim.step = function (dt) {
    step.call(sim, dt);
    if (++k % 6 !== 0 || !sim.started) return;
    for (const th of sim.threats) if (th.alive && th.type !== 'ballistic') put('t' + th.id, th.type, th.pos);
    for (const j of sim.jets) if (j.alive) put('j' + j.id, 'jet', j.pos);
  };
  function put(id, kind, p) {
    let M = movers.get(id);
    if (!M) { M = { kind, t0: sim.t, a: [], at: (s) => { const f = (s - M.t0) / 0.1, i = Math.floor(f), n = M.a.length / 3; if (f < 0 || i >= n - 1) return i === n - 1 && f - i < 1e-6 ? { x: M.a[i * 3], y: M.a[i * 3 + 1], z: M.a[i * 3 + 2] } : null; const u = f - i, a = M.a; return { x: a[i * 3] + (a[i * 3 + 3] - a[i * 3]) * u, y: a[i * 3 + 1] + (a[i * 3 + 4] - a[i * 3 + 1]) * u, z: a[i * 3 + 2] + (a[i * 3 + 5] - a[i * 3 + 2]) * u }; } }; movers.set(id, M); }
    M.a.push(p.x, p.y, p.z);
  }
  return {
    movers,
    frame() {
      if (ctx.flow !== 'play' || sim.t <= lastT) return;
      lastT = sim.t;
      const e = camera.matrixWorld.elements, i = head, p = camera.position;
      T[i] = sim.t; R[i] = clock.realT;
      P[i * 3] = p.x; P[i * 3 + 1] = p.y; P[i * 3 + 2] = p.z;
      F[i * 3] = -e[8]; F[i * 3 + 1] = -e[9]; F[i * 3 + 2] = -e[10];
      U[i * 3] = e[4]; U[i * 3 + 1] = e[5]; U[i * 3 + 2] = e[6];
      head = (head + 1) % TRACK_N; count = Math.min(TRACK_N, count + 1);
    },
    trackArrays() {
      const n = count, o = { T: new Float64Array(n), R: new Float64Array(n), P: new Float32Array(n * 3), F: new Float32Array(n * 3), U: new Float32Array(n * 3) };
      for (let j = 0; j < n; j++) {
        const i = (head - n + j + TRACK_N) % TRACK_N;
        o.T[j] = T[i]; o.R[j] = R[i];
        for (let c = 0; c < 3; c++) { o.P[j * 3 + c] = P[i * 3 + c]; o.F[j * 3 + c] = F[i * 3 + c]; o.U[j * 3 + c] = U[i * 3 + c]; }
      }
      return o;
    },
  };
}
