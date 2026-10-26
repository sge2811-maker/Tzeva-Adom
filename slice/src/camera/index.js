// Camera & game feel stream: menu orbit, authored intro flyover, RTS tactical rig (mouse,
// keyboard, touch), beat emphasis (early warning, siren, all-clear), cinematic auto-director (C),
// the deterministic trailer script, fixed poses for critic shots, screen shake, hit-stop and
// slow motion. Everything moves only by the dt it is given (captures are deterministic).
//
// Controls: drag pan (grab the ground) · right/middle/alt-drag rotate + tilt · wheel zoom toward
// the cursor · WASD/arrows pan · Q/E rotate · Z/X or -/= or PgUp/PgDn zoom · F focus on the
// action / cycle Arad, Nevatim, lookout · double-click ground or a marker to fly there ·
// Home reset · C cinematic camera.
//
// API (ctx.systems.camera): mode, rig, goal (HUD radar writes goal.tx/tz), focus(x, z, dist?),
// script(name) ('trailer' | null), pickGround(clientX, clientY), feelLog, state().
import * as THREE from 'three';
import { groundAt, GEO } from '../world/geo.js';
import { clamp } from '../core/util.js';
import { ZMIN, ZMAX, BOUNDS, pitchCurve, pickGround, rayPlane, makeRoofGrid, floorAt, sightLift } from './rig.js';
import { evalKeys, introKeys, rigPose, trailerAt, TACTICAL_HOME } from './paths.js';
import { createCine } from './cine.js';

const ease3 = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function create(ctx) {
  const { camera, bus, canvas, clock, sim, pacing, params } = ctx;
  const roof = makeRoofGrid(ctx.layout);
  const floor = (x, z, m) => floorAt(roof, x, z, m);

  // rig state: target on the ground, distance, yaw, pitch offset on top of the zoom->pitch curve
  const mkRig = (r = TACTICAL_HOME) => ({ tx: r.tx, tz: r.tz, dist: r.dist, yaw: r.yaw, pitchOff: r.pitch - pitchCurve(r.dist) });
  const rig = mkRig(), goal = mkRig();
  rig.ty = groundAt(rig.tx, rig.tz);
  Object.defineProperty(rig, 'pitch', { get: () => clamp(pitchCurve(rig.dist) + rig.pitchOff, 0.14, 1.42), enumerable: true });
  Object.defineProperty(goal, 'pitch', { get: () => clamp(pitchCurve(goal.dist) + goal.pitchOff, 0.14, 1.42), set: (p) => { goal.pitchOff = p - pitchCurve(goal.dist); }, enumerable: true });
  let mode = 'menu';
  let pose = null;           // { pos, look, fov } for critic shots
  let scriptName = null, scriptT = 0;
  const feelLog = [];        // hit-stop / slow-mo / beat log (critic evidence)
  const logFeel = (kind, o) => { feelLog.push({ kind, simT: +sim.t.toFixed(2), ...o }); if (feelLog.length > 200) feelLog.shift(); };

  const clampGoal = () => {
    goal.dist = clamp(goal.dist, ZMIN, ZMAX);
    goal.pitchOff = clamp(goal.pitchOff, -0.3, 0.45);
    goal.tx = clamp(goal.tx, BOUNDS.x0, BOUNDS.x1); goal.tz = clamp(goal.tz, BOUNDS.z0, BOUNDS.z1);
  };
  const setRig = (r) => { Object.assign(rig, mkRig(r)); Object.assign(goal, mkRig(r)); rig.ty = groundAt(rig.tx, rig.tz); lastGoal.x = goal.tx; lastGoal.z = goal.tz; travel = null; vel.x = vel.z = 0; lift = 0; };

  // ---------------------------------------------------------------- intro
  let introK = introKeys(pacing.introLen), introLenSeen = pacing.introLen;
  const ev = { p: [0, 0, 0], l: [0, 0, 0], fov: 50 };
  function introPose(t, out = ev) {
    if (pacing.introLen !== introLenSeen) { introK = introKeys(pacing.introLen); introLenSeen = pacing.introLen; }
    evalKeys(introK, clamp(t, 0, pacing.introLen), out);
    // bank gently into the turns (from the yaw rate of the look direction); zero at rest
    const a = evalKeys(introK, clamp(t - 0.25, 0, pacing.introLen), { p: [0, 0, 0], l: [0, 0, 0] }), b = evalKeys(introK, clamp(t + 0.25, 0, pacing.introLen), { p: [0, 0, 0], l: [0, 0, 0] });
    const ya = Math.atan2(a.l[2] - a.p[2], a.l[0] - a.p[0]), yb = Math.atan2(b.l[2] - b.p[2], b.l[0] - b.p[0]);
    out.bank = clamp(wrap(yb - ya) * 0.9, -0.06, 0.06) + (out.roll || 0);
    return out;
  }

  // ---------------------------------------------------------------- input
  const keys = new Set();
  let drag = null, idleT = 999;
  const ptrs = new Map();
  const vel = { x: 0, z: 0 };          // pan momentum (m/s) after a fling
  const kv = { x: 0, z: 0, r: 0, zm: 0 }; // keyboard velocities (ramped)
  let travel = null;                    // eased fly-to { from, to, t, dur, hop }
  const lastGoal = { x: goal.tx, z: goal.tz };
  const frozen = { world: new THREE.Matrix4(), projInv: new THREE.Matrix4() };
  const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();
  const userInput = () => { idleT = 0; if (travel) { travel = null; commitRig(); } beat = null; };
  function commitRig() { goal.tx = rig.tx; goal.tz = rig.tz; goal.dist = rig.dist; goal.yaw = rig.yaw; goal.pitchOff = rig.pitchOff; lastGoal.x = goal.tx; lastGoal.z = goal.tz; }
  const wantTactical = () => { if (mode === 'intro' || mode === 'menu') return false; if (mode !== 'tactical') toTactical(); return true; };

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    canvas.focus();
    if (mode === 'intro' || mode === 'menu' || scriptName) return;
    try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!wantTactical()) return;
    userInput(); vel.x = vel.z = 0;
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; drag = { pinch: true, d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x), dist: goal.dist, yaw: goal.yaw }; return; }
    const rot = e.button === 2 || e.button === 1 || e.altKey;
    drag = { x: e.clientX, y: e.clientY, rot, tx: goal.tx, tz: goal.tz, yaw: goal.yaw, po: goal.pitchOff, samples: [] };
    if (!rot) {
      // grab the ground: freeze the camera so the grabbed point stays under the cursor
      camera.updateMatrixWorld();
      frozen.world.copy(camera.matrixWorld); frozen.projInv.copy(camera.projectionMatrixInverse);
      const g = pickGround(camera, e.clientX, e.clientY, innerWidth, innerHeight, tmpV);
      drag.plane = g ? g.y : rig.ty;
      drag.g = rayPlane(frozen.world, frozen.projInv, e.clientX, e.clientY, innerWidth, innerHeight, drag.plane, new THREE.Vector3());
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!drag || mode !== 'tactical') return;
    idleT = 0;
    if (drag.pinch) {
      if (ptrs.size < 2) return;
      const [a, b] = [...ptrs.values()];
      goal.dist = drag.dist * drag.d / Math.max(20, Math.hypot(a.x - b.x, a.y - b.y));
      goal.yaw = drag.yaw - (Math.atan2(b.y - a.y, b.x - a.x) - drag.ang);
      clampGoal(); return;
    }
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (drag.rot) { goal.yaw = drag.yaw + dx * 0.0055; goal.pitchOff = drag.po + dy * 0.0035; }
    else {
      const c = rayPlane(frozen.world, frozen.projInv, e.clientX, e.clientY, innerWidth, innerHeight, drag.plane, tmpV2);
      goal.tx = drag.tx + (drag.g.x - c.x); goal.tz = drag.tz + (drag.g.z - c.z);
      drag.samples.push({ t: e.timeStamp, x: goal.tx, z: goal.tz });
      if (drag.samples.length > 8) drag.samples.shift();
    }
    clampGoal(); lastGoal.x = goal.tx; lastGoal.z = goal.tz;
  });
  const endPtr = (e) => {
    ptrs.delete(e.pointerId);
    if (drag && !drag.pinch && !drag.rot && drag.samples.length > 1) {
      // fling: release velocity over the last ~90 ms; holding still before release = clean stop
      const S = drag.samples, last = S[S.length - 1], now = e.timeStamp;
      let first = last;
      for (let i = S.length - 1; i >= 0 && last.t - S[i].t < 90; i--) first = S[i];
      const dt = (last.t - first.t) / 1000;
      if (dt > 0.012 && now - last.t < 50) {
        vel.x = (last.x - first.x) / dt; vel.z = (last.z - first.z) / dt;
        const sp = Math.hypot(vel.x, vel.z), cap = goal.dist * 2.5;
        if (sp > cap) { vel.x *= cap / sp; vel.z *= cap / sp; }
        if (sp < goal.dist * 0.15) vel.x = vel.z = 0;
      }
    }
    if (ptrs.size < 2 && drag && drag.pinch) drag = null;
    if (!ptrs.size) drag = null;
  };
  canvas.addEventListener('pointerup', endPtr); canvas.addEventListener('pointercancel', endPtr);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (scriptName || !wantTactical()) return;
    userInput(); vel.x = vel.z = 0;
    const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
    const nd = clamp(goal.dist * Math.exp(clamp(dy, -400, 400) * 0.0012), ZMIN, ZMAX);
    // zoom toward the ground point under the cursor (it stays under the cursor)
    const p = pickGround(camera, e.clientX, e.clientY, innerWidth, innerHeight, tmpV);
    if (p && Math.hypot(p.x - goal.tx, p.z - goal.tz) < goal.dist * 4) {
      const k = nd / goal.dist;
      goal.tx = p.x + (goal.tx - p.x) * k; goal.tz = p.z + (goal.tz - p.z) * k;
    }
    goal.dist = nd; clampGoal(); lastGoal.x = goal.tx; lastGoal.z = goal.tz;
  }, { passive: false });
  addEventListener('dblclick', (e) => {
    if (mode !== 'tactical' && mode !== 'cine' && mode !== 'pose') return;
    const t = e.target, mk = t && t.closest ? t.closest('.iw-mk') : null;
    if (t !== canvas && !mk) return;
    let x = e.clientX, y = e.clientY;
    if (mk) { const r = mk.getBoundingClientRect(); x = r.left + r.width / 2; y = r.bottom + 2; }
    const p = pickGround(camera, x, y, innerWidth, innerHeight, tmpV);
    if (p) api.focus(p.x, p.z, Math.min(goal.dist, mk ? 700 : 1100));
  });
  const KEYS = new Set(['w', 'a', 's', 'd', 'q', 'e', 'z', 'x', '-', '=', '+', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'pageup', 'pagedown']);
  addEventListener('keydown', (e) => {
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    if ((k === 'escape' || k === ' ' || k === 'enter') && mode === 'intro') { e.preventDefault(); ctx.startPlay(); return; }
    if (ctx.flow !== 'play' || scriptName) return;
    if (KEYS.has(k)) { keys.add(k); userInput(); if (k.startsWith('arrow') || k.startsWith('page')) e.preventDefault(); }
    if (e.repeat) return;
    if (k === 'c') { if (mode === 'cine') toTactical(); else { mode = 'cine'; cine.enter(); bus.emit('camera:mode', { mode }); } }
    if (k === 'f') focusAction();
    if (k === 'home') { userInput(); api.focus(TACTICAL_HOME.tx, TACTICAL_HOME.tz, TACTICAL_HOME.dist, TACTICAL_HOME.yaw, TACTICAL_HOME.pitch); }
  });
  addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  addEventListener('blur', () => keys.clear());

  function toTactical() {
    if (mode === 'tactical') return;
    if (mode === 'cine' || mode === 'pose' || mode === 'script') {
      // re-seat the rig on what the camera is looking at (no jump)
      const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
      let p = dir.y < -0.05 ? pickGround(camera, innerWidth / 2, innerHeight / 2, innerWidth, innerHeight, new THREE.Vector3()) : null;
      if (!p || p.distanceTo(camera.position) > 9000) {
        const d = clamp(camera.position.y / Math.max(0.2, -dir.y), 400, 4000);
        p = camera.position.clone().addScaledVector(dir.setY(Math.min(dir.y, -0.2)).normalize(), d); p.y = groundAt(p.x, p.z);
      }
      const dist = clamp(camera.position.distanceTo(p), ZMIN, 9000);
      const pitch = clamp(Math.asin(clamp((camera.position.y - p.y) / dist, -1, 1)), 0.15, 1.4);
      const yaw = Math.atan2(p.z - camera.position.z, p.x - camera.position.x);
      setRig({ tx: p.x, tz: p.z, dist, yaw, pitch });
    }
    mode = 'tactical'; pose = null; scriptName = null;
    bus.emit('camera:mode', { mode });
  }

  // F: frame the latest action in the sector, otherwise cycle Arad -> Nevatim -> lookout
  const POI = [[TACTICAL_HOME.tx, TACTICAL_HOME.tz, 2600], [GEO.nevatim.x, GEO.nevatim.z, 4200], [GEO.lookout.x, GEO.lookout.z, 900]];
  let poiI = 0, lastAction = null;
  bus.on('intercept', (e) => { if (!e.offmap && e.x > BOUNDS.x0 && e.x < BOUNDS.x1) lastAction = { t: e.t, x: e.x, y: e.y, z: e.z }; });
  bus.on('impact', (e) => { lastAction = { t: e.t, x: e.x, y: e.y, z: e.z }; });
  function focusAction() {
    if (mode !== 'tactical') toTactical();
    userInput();
    if (lastAction && sim.t - lastAction.t < 6) {
      const a = lastAction, h = Math.max(0, a.y - groundAt(a.x, a.z));
      api.focus(a.x, a.z, clamp(h * 1.1 + 900, 900, 9000)); lastAction = null; return;
    }
    const p = POI[poiI++ % POI.length];
    api.focus(p[0], p[1], p[2]);
  }

  // ---------------------------------------------------------------- beats: early warning, siren, all-clear
  let beat = null; // pending { kind, t }
  const pendingBeats = [];
  bus.on('alert:early', (e) => pendingBeats.push({ kind: 'early', t: e.t }));
  bus.on('alert:start', (e) => pendingBeats.push({ kind: 'siren', t: e.t }));
  bus.on('allclear', (e) => pendingBeats.push({ kind: 'allclear', t: e.t }));
  function runBeats() {
    while (pendingBeats.length) {
      const b = pendingBeats.shift();
      if (sim.t - b.t > 0.6 || scriptName) continue; // stale (fast-forward / seek): never re-frame a seeked shot
      if (b.kind === 'siren') {
        shake.trauma = Math.min(1, shake.trauma + 0.38);
        if (mode === 'cine') { cine.siren(); logFeel('beat', { beat: 'siren', mode }); continue; }
      }
      if (mode !== 'tactical' || idleT < (b.kind === 'siren' ? 0.5 : 2.5) || drag) { logFeel('beat-skipped', { beat: b.kind, idle: +idleT.toFixed(1) }); continue; }
      const to = { tx: goal.tx, tz: goal.tz, dist: goal.dist, yaw: goal.yaw, pitchOff: goal.pitchOff };
      let dur;
      if (b.kind === 'early') { to.dist *= 0.93; dur = 2.4; }
      else if (b.kind === 'siren') {
        // a short, readable push toward the town (<= 1.3 s; any input takes control back at once)
        const dT = Math.hypot(goal.tx, goal.tz);
        if (dT < goal.dist * 1.6) { to.tx += (0 - goal.tx) * 0.4; to.tz += (0 - goal.tz) * 0.4; to.dist *= 0.78; } else to.dist *= 0.85;
        dur = 1.2;
      } else { to.dist *= 1.12; to.pitchOff -= 0.035; dur = 3.6; } // all-clear: a slow exhale
      startTravel(to, dur, 0, b.kind === 'siren' ? 'expo' : 'ease');
      logFeel('beat', { beat: b.kind, dur });
    }
  }
  function startTravel(to, dur, hop, ease = 'ease') {
    travel = { from: { tx: rig.tx, tz: rig.tz, dist: rig.dist, yaw: rig.yaw, pitchOff: rig.pitchOff }, to, t: 0, dur, hop, ease };
    Object.assign(goal, to); clampGoal(); lastGoal.x = goal.tx; lastGoal.z = goal.tz; vel.x = vel.z = 0;
  }

  // ---------------------------------------------------------------- hit-stop, slow motion, shake
  const shake = { trauma: 0, t: 0 };
  let lastStopReal = -9, slowDone = false, slingSlow = true, realT = 0;
  const feelOn = () => !params.capture || (scriptName === 'trailer');
  const onScreen = (x, y, z) => { tmpV.set(x, y, z).project(camera); return tmpV.z < 1 && Math.abs(tmpV.x) < 1.05 && Math.abs(tmpV.y) < 1.05; };
  bus.on('shake', ({ amp }) => { shake.trauma = Math.min(1, shake.trauma + Math.min(1.2, amp) * 0.5); });
  bus.on('intercept', (e) => {
    if (!e.kill || e.offmap || !feelOn() || mode === 'intro' || mode === 'menu') return;
    const d = Math.hypot(e.x - camera.position.x, e.y - camera.position.y, e.z - camera.position.z);
    const vis = onScreen(e.x, e.y, e.z);
    // optional slow motion on the first exo-atmospheric (Arrow 3) kill, when it is in view
    if (!slowDone && e.kind === 'arrow' && e.y > 15000 && vis) {
      slowDone = true; clock.slowMo(1.25, 0.32, 0.12, 0.5); lastStopReal = realT;
      logFeel('slowmo', { dur: 1.25, scale: 0.32, d: Math.round(d) }); return;
    }

    // hit-stop: big kills near the camera and in view, at most one per 1.1 s, <= 80 ms
    if (e.big && ((vis && d < 9000) || scriptName === 'trailer') && realT - lastStopReal > 1.1) {
      const dur = d < 4000 ? 0.075 : 0.055;
      clock.hitStop(dur, 0.05); lastStopReal = realT;
      logFeel('hitstop', { dur, scale: 0.05, d: Math.round(d) });
    }
  });
  const shakeEuler = new THREE.Euler(), shakeQ = new THREE.Quaternion();
  function applyShake(dt) {
    shake.t += dt;
    if (shake.trauma < 0.002) return;
    const tr = shake.trauma * shake.trauma, t = shake.t;
    // angular shake (distance independent), smooth multi-sine noise; never nauseating (<= 0.8 deg)
    const n = (a, b, c) => Math.sin(t * a + c) * 0.6 + Math.sin(t * b + c * 1.7) * 0.4;
    shakeEuler.set(n(31.3, 17.9, 0.3) * 0.010 * tr, n(27.1, 13.3, 1.9) * 0.012 * tr, n(23.7, 11.1, 4.1) * 0.014 * tr);
    camera.quaternion.multiply(shakeQ.setFromEuler(shakeEuler));
    shake.trauma = Math.max(0, shake.trauma - dt * 1.5);
  }

  // ---------------------------------------------------------------- events
  const cine = createCine(ctx, (x, z) => floor(x, z, 6));
  bus.on('flow', ({ to }) => {
    if (to === 'intro') { mode = 'intro'; scriptName = null; }
    if (to === 'menu') mode = 'menu';
    if (to === 'play' && (mode === 'intro' || mode === 'menu')) { setRig(TACTICAL_HOME); mode = 'tactical'; idleT = 0; }
  });
  bus.on('shot', ({ shot }) => {
    const c = shot.cam; if (!c) return;
    scriptName = null; travel = null; pendingBeats.length = 0;
    if (c.mode === 'pose') { mode = 'pose'; pose = { pos: new THREE.Vector3(...c.pos), look: new THREE.Vector3(...c.look), fov: c.fov || 50 }; }
    else if (c.mode === 'tactical') { mode = 'tactical'; setRig({ tx: c.target[0], tz: c.target[1], dist: c.dist, yaw: c.yaw, pitch: c.pitch }); exactShot = true; idleT = 999; }
  });
  let exactShot = false; // a critic shot's tactical pose is honoured exactly (no anti-clip nudges)

  // ---------------------------------------------------------------- per frame
  let menuT = 0, lift = 0;
  const api = {
    get mode() { return mode; },
    rig, goal, feelLog,
    setPose(pos, lk, fov = 50) { mode = 'pose'; pose = { pos: new THREE.Vector3(...pos), look: new THREE.Vector3(...lk), fov }; },
    // eased fly-to (also used by double-click and F); dist/yaw/pitch optional
    focus(x, z, dist = goal.dist, yaw = goal.yaw, pitch = null) {
      if (mode !== 'tactical') toTactical();
      const to = { tx: clamp(x, BOUNDS.x0, BOUNDS.x1), tz: clamp(z, BOUNDS.z0, BOUNDS.z1), dist: clamp(dist, ZMIN, ZMAX), yaw: rig.yaw + wrap(yaw - rig.yaw), pitchOff: pitch == null ? goal.pitchOff : pitch - pitchCurve(clamp(dist, ZMIN, ZMAX)) };
      const d = Math.hypot(to.tx - rig.tx, to.tz - rig.tz);
      startTravel(to, clamp(0.5 + 0.22 * Math.log2(1 + d / Math.max(300, rig.dist)), 0.5, 1.25), clamp(d / (rig.dist * 4), 0, 0.35));
    },
    // authored camera scripts for captures: 'trailer' (null/'off' returns to tactical)
    script(name) {
      if (!name || name === 'off') { if (scriptName) { scriptName = null; toTactical(); } return; }
      if (name !== 'trailer') throw new Error(`Unknown camera script ${name}`);
      scriptName = name; scriptT = sim.t; mode = 'script'; pendingBeats.length = 0; slingSlow = false;
      bus.emit('camera:mode', { mode, script: name });
    },
    pickGround(x, y) { camera.updateMatrixWorld(); const p = pickGround(camera, x, y, innerWidth, innerHeight, new THREE.Vector3()); return p && { x: p.x, y: p.y, z: p.z }; },
    introPose: (t) => { const o = introPose(t, { p: [0, 0, 0], l: [0, 0, 0], fov: 50 }); return { p: o.p.slice(), l: o.l.slice(), fov: o.fov }; },
    state() { return { mode, script: scriptName, tx: rig.tx, tz: rig.tz, dist: rig.dist, yaw: rig.yaw, pitch: rig.pitch, goal: { tx: goal.tx, tz: goal.tz, dist: goal.dist, yaw: goal.yaw }, travel: !!travel, vel: Math.hypot(vel.x, vel.z), pos: camera.position.toArray(), fov: camera.fov, clearance: camera.position.y - floor(camera.position.x, camera.position.z, 0), trauma: shake.trauma }; },
    update(dt, simDt = 0) {
      realT += dt; idleT += dt;
      if (ctx.flow === 'play') runBeats();
      let fov = 50, bank = 0;
      if (mode === 'menu') {
        menuT += dt;
        const r = rigPose({ tx: 300, tz: 0, dist: 3400, yaw: 0.35 + Math.sin(menuT * 0.03) * 0.5, pitch: 0.32 });
        camera.position.set(...r.p); camera.lookAt(...r.l);
      } else if (mode === 'intro') {
        const o = introPose(ctx.introT || 0);
        camera.position.set(o.p[0], o.p[1], o.p[2]); camera.lookAt(o.l[0], o.l[1], o.l[2]);
        fov = o.fov; bank = o.bank;
      } else if (mode === 'script') {
        scriptT += simDt;
        // trailer feel is keyed to script time (not to what happens to be on screen):
        // a beat of slow motion as the first David's Sling kill lands over the town
        if (!slingSlow && scriptT >= 250.72) { slingSlow = true; clock.slowMo(1.5, 0.3, 0.12, 0.6); lastStopReal = realT; logFeel('slowmo', { dur: 1.5, scale: 0.3, layer: 'sling', script: true }); }
        const o = trailerAt(scriptT, ev);
        camera.position.set(o.p[0], o.p[1], o.p[2]); camera.lookAt(o.l[0], o.l[1], o.l[2]); fov = o.fov;
      } else if (mode === 'tactical') {
        tactical(dt);
      } else if (mode === 'pose' && pose) {
        camera.position.copy(pose.pos); camera.lookAt(pose.look); fov = pose.fov;
      } else if (mode === 'cine') {
        fov = cine.update(dt, camera);
        if (keys.size) toTactical();
      }
      if (bank) camera.rotateZ(bank);
      if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
      applyShake(dt);
      { const gy = groundAt(camera.position.x, camera.position.z) + 2.5; if (camera.position.y < gy) camera.position.y = gy; }
      camera.updateMatrixWorld();
    },
  };

  function tactical(dt) {
    // external goal writes (HUD radar) become an eased fly-to instead of a snap
    if (!drag && !travel && Math.hypot(goal.tx - lastGoal.x, goal.tz - lastGoal.z) > Math.max(250, rig.dist * 0.4)) {
      const to = { tx: goal.tx, tz: goal.tz, dist: goal.dist, yaw: goal.yaw, pitchOff: goal.pitchOff };
      Object.assign(goal, { tx: rig.tx, tz: rig.tz }); startTravel(to, 0.8, 0.15); idleT = 0;
    }
    // keyboard: ramped velocities (fast attack, quick clean stop)
    let fx = 0, fz = 0, ry = 0, zm = 0;
    if (keys.has('w') || keys.has('arrowup')) fx += 1; if (keys.has('s') || keys.has('arrowdown')) fx -= 1;
    if (keys.has('d') || keys.has('arrowright')) fz += 1; if (keys.has('a') || keys.has('arrowleft')) fz -= 1;
    if (keys.has('q')) ry -= 1; if (keys.has('e')) ry += 1;
    if (keys.has('z') || keys.has('=') || keys.has('+') || keys.has('pageup')) zm -= 1; if (keys.has('x') || keys.has('-') || keys.has('pagedown')) zm += 1;
    const ka = 1 - Math.exp(-dt * (fx || fz ? 18 : 26)), kr = 1 - Math.exp(-dt * (ry ? 14 : 24)), kz = 1 - Math.exp(-dt * (zm ? 12 : 22));
    const sp = goal.dist * 1.05, c = Math.cos(goal.yaw), s = Math.sin(goal.yaw);
    kv.x += ((c * fx - s * fz) * sp - kv.x) * ka; kv.z += ((s * fx + c * fz) * sp - kv.z) * ka;
    kv.r += (ry * 1.5 - kv.r) * kr; kv.zm += (zm * 1.4 - kv.zm) * kz;
    if (Math.abs(kv.x) + Math.abs(kv.z) < goal.dist * 0.002) kv.x = kv.z = 0;
    if (Math.abs(kv.r) < 0.003) kv.r = 0; if (Math.abs(kv.zm) < 0.003) kv.zm = 0;
    if (kv.x || kv.z || kv.r || kv.zm) {
      goal.tx += kv.x * dt; goal.tz += kv.z * dt; goal.yaw += kv.r * dt; goal.dist *= Math.exp(kv.zm * dt);
      clampGoal(); lastGoal.x = goal.tx; lastGoal.z = goal.tz;
    }
    // fling momentum: exponential glide, stops cleanly (no reversal, no creep)
    if (!drag && (vel.x || vel.z)) {
      goal.tx += vel.x * dt; goal.tz += vel.z * dt;
      const k = Math.exp(-dt * 5.5); vel.x *= k; vel.z *= k;
      if (Math.hypot(vel.x, vel.z) < goal.dist * 0.03) vel.x = vel.z = 0;
      clampGoal(); lastGoal.x = goal.tx; lastGoal.z = goal.tz;
    }
    if (travel) {
      travel.t += dt;
      const u = Math.min(1, travel.t / travel.dur), e = travel.ease === 'expo' ? (u >= 1 ? 1 : (1 - Math.pow(2, -9 * u)) / (1 - Math.pow(2, -9))) : ease3(u), F = travel.from, T = travel.to;
      rig.tx = F.tx + (T.tx - F.tx) * e; rig.tz = F.tz + (T.tz - F.tz) * e;
      rig.dist = Math.exp(Math.log(F.dist) + (Math.log(T.dist) - Math.log(F.dist)) * e) * (1 + travel.hop * Math.sin(Math.PI * e));
      rig.yaw = F.yaw + wrap(T.yaw - F.yaw) * e; rig.pitchOff = F.pitchOff + (T.pitchOff - F.pitchOff) * e;
      if (u >= 1) travel = null;
    } else {
      // critically damped-style exponential follow (no overshoot); 1:1 while grabbing the ground
      // keyboard and grab-panning already shape the motion: track the goal tightly then
      const kp = 1 - Math.exp(-dt * ((drag && !drag.rot) || kv.x || kv.z ? 40 : 13)), kd = 1 - Math.exp(-dt * 12), ky = 1 - Math.exp(-dt * 14);
      rig.tx += (goal.tx - rig.tx) * kp; rig.tz += (goal.tz - rig.tz) * kp;
      rig.dist = Math.exp(Math.log(rig.dist) + (Math.log(goal.dist) - Math.log(rig.dist)) * kd);
      rig.yaw += wrap(goal.yaw - rig.yaw) * ky; rig.pitchOff += (goal.pitchOff - rig.pitchOff) * kd;
      const snapD = rig.dist * 1e-4;
      if (Math.abs(goal.tx - rig.tx) < snapD && Math.abs(goal.tz - rig.tz) < snapD) { rig.tx = goal.tx; rig.tz = goal.tz; }
    }
    // the look-at height follows the ground smoothly (no bob over the escarpment)
    const gy = groundAt(rig.tx, rig.tz);
    rig.ty = exactShot ? gy : rig.ty + (gy - rig.ty) * (1 - Math.exp(-dt * 6));
    if (idleT < 0.5 || travel) exactShot = false;
    const P = rigPose({ tx: rig.tx, tz: rig.tz, dist: rig.dist, yaw: rig.yaw, pitch: rig.pitch }, rig.ty);
    // anti-clipping: lift the camera so it and its sight line clear terrain and roofs
    // (rises fast, settles slowly; hard floor every frame)
    const need = exactShot ? 0 : sightLift(roof, P.p[0], P.p[1], P.p[2], P.l[0], P.l[1], P.l[2]);
    lift += (need - lift) * (1 - Math.exp(-dt * (need > lift ? 18 : 3)));
    const y = Math.max(P.p[1] + lift, exactShot ? -1e9 : floor(P.p[0], P.p[2], 6));
    camera.position.set(P.p[0], y, P.p[2]);
    camera.lookAt(P.l[0], P.l[1], P.l[2]);
    // debrief: a slow idle drift around the town (never in captures)
    if (sim.phase === 'debrief' && !params.capture && idleT > 4 && !drag) goal.yaw += 0.02 * dt;
  }
  return api;
}
