// Iron Wall vertical slice: boot, main loop, flow (menu -> intro -> play -> debrief) and the
// window.__slice API used by tools/ (shots, captures, perf). See docs/BRIEF.md.
import * as THREE from 'three';
import { PARAMS } from './core/params.js';
import { createBus } from './core/bus.js';
import { createClock } from './core/time.js';
import { createQuality } from './core/quality.js';
import { SHOTS } from './core/shots.js';
import { buildLayout } from './world/layout.js';
import { createSim, SIM_DT } from './sim/sim.js';
import { createDemo } from './sim/demo.js';
import { PACING } from './sim/pacing.js';
import { create as createEnv } from './env/index.js';
import { create as createVfx } from './vfx/index.js';
import { create as createCamera } from './camera/index.js';
import { create as createHud } from './hud/index.js';
import { create as createAudio } from './audio/index.js';
import { create as createPerf } from './perf/index.js';

const fatal = (msg) => { const el = document.getElementById('fatal'); el.style.display = 'grid'; el.textContent = msg; };

const canvas = document.getElementById('gl');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, depth: true, preserveDrawingBuffer: PARAMS.capture });
} catch (e) {
  fatal('Iron Wall needs WebGL 2, which this browser or device has turned off.');
  throw e;
}
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping; // tone mapping happens in post (env)
renderer.info.autoReset = false;

const quality = createQuality(renderer, PARAMS.quality);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 2, 140000);
camera.position.set(-1400, 420, 900);
camera.lookAt(0, 0, 0);
const bus = createBus();
const clock = createClock();
const layout = buildLayout(PARAMS.seed);
const sim = createSim({ seed: PARAMS.seed, layout, bus, pacing: PACING });
const demo = createDemo(sim, PARAMS.demo);

const ctx = {
  THREE, renderer, scene, camera, canvas, bus, clock, quality, layout, sim, demo, params: PARAMS, pacing: PACING,
  hudRoot: document.getElementById('hud'),
  size: { w: innerWidth, h: innerHeight, dpr: 1 },
  // screen-space effect channels: written by any stream (decaying), read by env's grading pass
  fx: { flash: 0, red: 0, desat: 0, aberration: 0, exposure: 0, shakeAmp: 0, vignette: 0 },
  flow: 'boot',
  systems: {},
  order: [],
  render: () => renderer.render(scene, camera), // replaced by env's post pipeline
  lights: { flash() {} },                      // replaced by env
  timings: { sim: 0, update: {}, render: 0, frame: 0 },
  errors: [],
};
window.__slice = { ctx, sim, ready: false };

ctx.setFlow = (to) => {
  if (ctx.flow === to) return;
  const from = ctx.flow; ctx.flow = to;
  bus.emit('flow', { from, to, t: sim.t });
};
// menu -> intro (skippable) -> play
ctx.begin = ({ intro = true } = {}) => {
  bus.emit('begin', { intro });
  if (intro) { ctx.setFlow('intro'); ctx.introT = 0; }
  else ctx.startPlay();
};
ctx.startPlay = () => {
  if (ctx.flow === 'play') return;
  ctx.setFlow('play');
  sim.start();
};

function addSystem(name, factory) {
  try {
    const s = factory(ctx);
    if (!s) return;
    ctx.systems[name] = s; ctx.order.push(name);
  } catch (e) {
    console.error(`[slice] system "${name}" failed to start`, e);
    ctx.errors.push({ system: name, phase: 'create', message: String(e && e.stack || e) });
  }
}

async function boot() {
  addSystem('env', createEnv);
  addSystem('camera', createCamera);
  addSystem('vfx', createVfx);
  addSystem('hud', createHud);
  addSystem('audio', createAudio);
  addSystem('perf', createPerf);
  // update order: camera first (everything else reads the camera), perf last
  ctx.order.sort((a, b) => ['camera', 'env', 'vfx', 'hud', 'audio', 'perf'].indexOf(a) - ['camera', 'env', 'vfx', 'hud', 'audio', 'perf'].indexOf(b));
  for (const name of ctx.order) {
    const s = ctx.systems[name];
    if (s.ready) { try { await s.ready; } catch (e) { console.error(`[slice] ${name} ready failed`, e); } }
  }
  resize();
  addEventListener('resize', resize);
  try { renderer.compile(scene, camera); } catch (e) { /* compile is a warm-up only */ }
  document.getElementById('boot').classList.add('done');
  if (PARAMS.nointro) ctx.startPlay();
  else ctx.setFlow('menu');
  window.__slice.ready = true;
  bus.emit('ready', {});
  if (!PARAMS.capture) requestAnimationFrame(loop);
}

function resize() {
  const w = innerWidth, h = innerHeight;
  const dpr = quality.dprFor(w, h); // native DPR capped by tier pixel budget, x dynamic render scale (perf)
  ctx.size = { w, h, dpr };
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  for (const name of ctx.order) { const s = ctx.systems[name]; if (s.resize) { try { s.resize(w, h, dpr); } catch (e) { console.error(e); } } }
}
ctx.resize = resize;
quality.onChange((q, kind) => { if (kind !== 'post') resize(); }); // 'post' hooks are read by env, no resize

// ---------------------------------------------------------------- loop
let last = performance.now(), acc = 0;
const errT = {};
function tick(realDt) {
  const t0 = performance.now();
  let simDt = 0;
  if (ctx.flow === 'intro') { ctx.introT += realDt; if (ctx.introT >= PACING.introLen) ctx.startPlay(); }
  if (ctx.flow === 'play') {
    simDt = clock.advance(realDt);
    acc += simDt;
    let n = 0;
    while (acc >= SIM_DT && n < 20) { demo.step(); sim.step(SIM_DT); acc -= SIM_DT; n++; }
    if (n >= 20) acc = 0;
  } else clock.advance(realDt);
  clock.simT = sim.t;
  const t1 = performance.now();
  ctx.timings.sim = t1 - t0;
  for (const name of ctx.order) {
    const s = ctx.systems[name];
    if (!s.update) continue;
    const a = performance.now();
    try { s.update(realDt, simDt); }
    catch (e) {
      const k = name; if (!errT[k] || performance.now() - errT[k] > 2000) { errT[k] = performance.now(); console.error(`[slice] ${name}.update failed`, e); ctx.errors.push({ system: name, phase: 'update', message: String(e && e.stack || e) }); }
    }
    ctx.timings.update[name] = performance.now() - a;
  }
  // decay screen-space effect channels
  const k = Math.exp(-realDt * 6);
  ctx.fx.flash *= k; ctx.fx.aberration *= k; ctx.fx.exposure *= Math.exp(-realDt * 3);
}
function render() {
  const a = performance.now();
  renderer.info.reset();
  try { ctx.render(); }
  catch (e) { if (!errT.render || performance.now() - errT.render > 2000) { errT.render = performance.now(); console.error('[slice] render failed', e); ctx.errors.push({ system: 'render', phase: 'render', message: String(e && e.stack || e) }); } }
  ctx.timings.render = performance.now() - a;
  for (const name of ctx.order) { const s = ctx.systems[name]; if (s.afterRender) { try { s.afterRender(); } catch (e) { console.error(e); } } }
}
function loop(now) {
  requestAnimationFrame(loop);
  const realDt = Math.min(0.1, Math.max(0, (now - last) / 1000)); last = now;
  const f0 = performance.now();
  tick(realDt);
  render();
  ctx.timings.frame = performance.now() - f0;
}

// ---------------------------------------------------------------- tool API (deterministic)
Object.assign(window.__slice, {
  // advance real time by dt (default 1/fps) and render one frame; used by captures
  frame(dt = 1 / PARAMS.fps, draw = true) { tick(dt); if (draw) render(); return sim.t; },
  // fast-forward the sim to time t; the last `warm` seconds also update visuals (trails, smoke)
  seek(t, warm = 6, dt = 1 / 30) {
    if (ctx.flow !== 'play') ctx.startPlay();
    bus.logEnabled = true;
    while (sim.t < t - warm) { demo.step(); sim.step(SIM_DT); }
    let guard = 0;
    while (sim.t < t && guard++ < 10000) tick(dt);
    return sim.t;
  },
  async shot(name) {
    const S = SHOTS[name];
    if (!S) throw new Error(`Unknown shot ${name}. Known: ${Object.keys(SHOTS).join(', ')}`);
    ctx.shot = S;
    bus.emit('shot', { name, shot: S });
    if (S.flow === 'menu') { ctx.setFlow('menu'); for (let i = 0; i < 30; i++) tick(1 / 30); }
    else if (S.flow === 'intro') { ctx.setFlow('intro'); ctx.introT = 0; while (ctx.introT < S.introT) tick(1 / 30); }
    else window.__slice.seek(S.t, S.warm ?? 6);
    for (let i = 0; i < (S.settle ?? 10); i++) tick(1 / 30);
    render();
    return { name, t: sim.t, flow: ctx.flow, phase: sim.phase };
  },
  info() {
    const i = renderer.info;
    return {
      calls: i.render.calls, triangles: i.render.triangles, points: i.render.points, lines: i.render.lines,
      geometries: i.memory.geometries, textures: i.memory.textures, programs: i.programs ? i.programs.length : null,
      timings: JSON.parse(JSON.stringify(ctx.timings)), quality: quality.tier, renderScale: quality.renderScale, gpu: quality.gpu,
      size: ctx.size, simT: sim.t, phase: sim.phase, flow: ctx.flow, errors: ctx.errors.slice(-10),
    };
  },
});

boot().catch((e) => { console.error(e); fatal('Iron Wall failed to start: ' + e.message); });
