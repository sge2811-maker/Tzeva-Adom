// Camera & game feel stream: menu orbit, intro flyover, RTS tactical rig (mouse, keyboard, touch),
// cinematic auto-camera, fixed poses for critic shots, screen shake and hit-stop.
import * as THREE from 'three';
import { groundAt } from '../world/geo.js';
import { clamp, damp, easeInOut } from '../core/util.js';

export function create(ctx) {
  const { camera, bus, canvas, clock, sim, pacing } = ctx;
  const rig = { tx: 250, tz: 0, dist: 2600, yaw: 0.35, pitch: 0.62 };
  const goal = { ...rig };
  let mode = 'menu';
  let pose = null; // { pos, look, fov }
  const shake = { trauma: 0, amp: 0 };
  const look = new THREE.Vector3();

  const placeRig = (r) => {
    const cp = Math.cos(r.pitch), ty = groundAt(r.tx, r.tz);
    camera.position.set(r.tx - Math.cos(r.yaw) * r.dist * cp, ty + r.dist * Math.sin(r.pitch), r.tz - Math.sin(r.yaw) * r.dist * cp);
    look.set(r.tx, ty, r.tz);
    camera.lookAt(look);
  };
  const clampGoal = () => {
    goal.dist = clamp(goal.dist, 160, 14000);
    goal.pitch = clamp(goal.pitch, 0.12, 1.45);
    goal.tx = clamp(goal.tx, -14000, 12000); goal.tz = clamp(goal.tz, -9000, 9000);
  };

  // ---------------------------------------------------------------- intro flyover
  const K = [
    { p: [12800, -300, -3400], l: [4200, -120, -500] },
    { p: [8200, -170, -2100], l: [2300, 40, -400] },
    { p: [4200, 120, -1100], l: [300, 30, -60] },
    { p: [1700, 230, 160], l: [-200, 10, 30] },
    { p: null, l: null },
  ];
  const tacticalPose = () => {
    const r = { tx: 250, tz: 0, dist: 2600, yaw: 0.35, pitch: 0.62 };
    const cp = Math.cos(r.pitch);
    return { p: [r.tx - Math.cos(r.yaw) * r.dist * cp, groundAt(r.tx, r.tz) + r.dist * Math.sin(r.pitch), r.tz - Math.sin(r.yaw) * r.dist * cp], l: [r.tx, 0, r.tz] };
  };
  K[4] = tacticalPose();
  const curveP = new THREE.CatmullRomCurve3(K.map((k) => new THREE.Vector3(...k.p)), false, 'centripetal');
  const curveL = new THREE.CatmullRomCurve3(K.map((k) => new THREE.Vector3(...k.l)), false, 'centripetal');

  // ---------------------------------------------------------------- input
  const keys = new Set();
  let drag = null;
  const ptrs = new Map();
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    canvas.focus();
    if (mode === 'intro') return;
    try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; drag = { pinch: true, d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x), dist: goal.dist, yaw: goal.yaw }; return; }
    drag = { x: e.clientX, y: e.clientY, btn: e.button, alt: e.altKey, tx: goal.tx, tz: goal.tz, yaw: goal.yaw, pitch: goal.pitch, moved: false };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!drag) return;
    toTactical();
    if (drag.pinch && ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      goal.dist = drag.dist * drag.d / Math.max(20, Math.hypot(a.x - b.x, a.y - b.y));
      goal.yaw = drag.yaw - (Math.atan2(b.y - a.y, b.x - a.x) - drag.ang);
      clampGoal(); return;
    }
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.hypot(dx, dy) > 4) drag.moved = true;
    if (drag.btn === 2 || drag.alt) { goal.yaw = drag.yaw + dx * 0.005; goal.pitch = drag.pitch + dy * 0.004; }
    else {
      const k = goal.dist / innerHeight * 1.25, c = Math.cos(goal.yaw), s = Math.sin(goal.yaw);
      const fwd = dy * k / Math.max(0.35, Math.sin(goal.pitch)), right = -dx * k;
      goal.tx = drag.tx + c * fwd - s * right; goal.tz = drag.tz + s * fwd + c * right;
    }
    clampGoal();
  });
  const endPtr = (e) => { ptrs.delete(e.pointerId); if (ptrs.size < 2 && drag && drag.pinch) drag = null; if (!ptrs.size) drag = null; };
  canvas.addEventListener('pointerup', endPtr); canvas.addEventListener('pointercancel', endPtr);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); if (mode === 'intro') return; toTactical(); goal.dist *= Math.exp(e.deltaY * 0.0011); clampGoal(); }, { passive: false });
  addEventListener('keydown', (e) => {
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    const k = e.key.toLowerCase(); keys.add(k);
    if (k === 'c' && ctx.flow === 'play') { mode === 'cine' ? toTactical() : (mode = 'cine', cine.t = 0, cine.target = null); bus.emit('camera:mode', { mode }); }
    if ((k === 'escape' || k === ' ' || k === 'enter') && mode === 'intro') { e.preventDefault(); ctx.startPlay(); }
  });
  addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  addEventListener('blur', () => keys.clear());
  function toTactical() {
    if (mode === 'tactical') return;
    if (mode === 'cine' || mode === 'pose') {
      // re-seat the rig on what the camera is looking at
      const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
      const tgt = camera.position.clone().addScaledVector(dir, Math.min(4000, Math.max(300, camera.position.y / Math.max(0.15, -dir.y))));
      goal.tx = rig.tx = tgt.x; goal.tz = rig.tz = tgt.z;
      goal.dist = rig.dist = clamp(camera.position.distanceTo(tgt), 300, 9000);
      goal.yaw = rig.yaw = Math.atan2(dir.z, dir.x); goal.pitch = rig.pitch = clamp(Math.asin(-dir.y), 0.15, 1.4);
    }
    mode = 'tactical'; pose = null;
    bus.emit('camera:mode', { mode });
  }

  // ---------------------------------------------------------------- cinematic auto-camera
  const cine = { t: 0, target: null, switchAt: 0, pos: new THREE.Vector3(), look: new THREE.Vector3() };
  function cineUpdate(dt) {
    cine.t += dt;
    if (!cine.target || !cine.target.alive || cine.t > cine.switchAt) {
      const its = sim.interceptors.filter((i) => i.alive && i.th && i.th.alive);
      const bal = its.filter((i) => i.th.type === 'ballistic');
      cine.target = (bal.length ? bal[Math.floor(cine.t * 7) % bal.length] : its[0]) || sim.threats.find((th) => th.alive) || null;
      cine.switchAt = cine.t + 6;
    }
    const tg = cine.target;
    const f = tg ? (tg.th && tg.th.alive ? { x: (tg.pos.x + tg.th.pos.x) / 2, y: (tg.pos.y + tg.th.pos.y) / 2, z: (tg.pos.z + tg.th.pos.z) / 2 } : tg.pos) : { x: 0, y: 200, z: 0 };
    cine.look.set(damp(cine.look.x, f.x, 3, dt), damp(cine.look.y, f.y, 3, dt), damp(cine.look.z, f.z, 3, dt));
    // watch from the ground near town, like a phone camera on a balcony
    const want = new THREE.Vector3(-300 + Math.sin(cine.t * 0.05) * 200, groundAt(-300, 100) + 40, 100);
    cine.pos.lerp(want, 1 - Math.exp(-dt * 1.5));
    camera.position.copy(cine.pos); camera.lookAt(cine.look);
  }

  // ---------------------------------------------------------------- events
  bus.on('flow', ({ to }) => {
    if (to === 'intro') mode = 'intro';
    if (to === 'menu') mode = 'menu';
    if (to === 'play' && (mode === 'intro' || mode === 'menu')) { Object.assign(rig, { tx: 250, tz: 0, dist: 2600, yaw: 0.35, pitch: 0.62 }); Object.assign(goal, rig); mode = 'tactical'; }
  });
  bus.on('shot', ({ shot }) => {
    const c = shot.cam; if (!c) return;
    if (c.mode === 'pose') { mode = 'pose'; pose = { pos: new THREE.Vector3(...c.pos), look: new THREE.Vector3(...c.look), fov: c.fov || 50 }; }
    else if (c.mode === 'tactical') { mode = 'tactical'; Object.assign(rig, { tx: c.target[0], tz: c.target[1], dist: c.dist, yaw: c.yaw, pitch: c.pitch }); Object.assign(goal, rig); }
  });
  bus.on('shake', ({ amp }) => { shake.trauma = Math.min(1, shake.trauma + amp * 0.6); });
  bus.on('intercept', (e) => {
    if (!e.kill || e.offmap || ctx.params.capture) return;
    const d = Math.hypot(e.x - camera.position.x, e.y - camera.position.y, e.z - camera.position.z);
    if (e.big && d < 15000) clock.hitStop(0.06, 0.08);
  });

  // ---------------------------------------------------------------- per frame
  let menuT = 0;
  const off = new THREE.Vector3();
  return {
    get mode() { return mode; },
    rig, goal,
    setPose(pos, lk, fov = 50) { mode = 'pose'; pose = { pos: new THREE.Vector3(...pos), look: new THREE.Vector3(...lk), fov }; },
    update(dt) {
      // keyboard pan/rotate
      if (mode === 'tactical' || mode === 'cine') {
        let fx = 0, fz = 0, ry = 0;
        if (keys.has('w') || keys.has('arrowup')) fx += 1; if (keys.has('s') || keys.has('arrowdown')) fx -= 1;
        if (keys.has('d') || keys.has('arrowright')) fz += 1; if (keys.has('a') || keys.has('arrowleft')) fz -= 1;
        if (keys.has('q')) ry -= 1; if (keys.has('e')) ry += 1;
        if (fx || fz || ry) {
          toTactical();
          const c = Math.cos(goal.yaw), s = Math.sin(goal.yaw), v = goal.dist * 0.9 * dt;
          goal.tx += (c * fx - s * fz) * v; goal.tz += (s * fx + c * fz) * v; goal.yaw += ry * dt * 1.2;
          clampGoal();
        }
      }
      let fov = 50;
      if (mode === 'menu') {
        menuT += dt;
        const a = 0.35 + Math.sin(menuT * 0.03) * 0.5;
        Object.assign(rig, { tx: 300, tz: 0, dist: 3400, yaw: a, pitch: 0.32 });
        placeRig(rig);
      } else if (mode === 'intro') {
        const u = clamp((ctx.introT || 0) / pacing.introLen, 0, 1), e = easeInOut(u);
        camera.position.copy(curveP.getPoint(e)); camera.lookAt(curveL.getPoint(Math.min(1, e + 0.02)));
        fov = 46 + 8 * Math.sin(u * Math.PI);
      } else if (mode === 'tactical') {
        const k = 1 - Math.exp(-dt * 8);
        rig.tx += (goal.tx - rig.tx) * k; rig.tz += (goal.tz - rig.tz) * k; rig.dist += (goal.dist - rig.dist) * k; rig.pitch += (goal.pitch - rig.pitch) * k;
        let dy = goal.yaw - rig.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); rig.yaw += dy * k;
        placeRig(rig);
      } else if (mode === 'pose' && pose) {
        camera.position.copy(pose.pos); camera.lookAt(pose.look); fov = pose.fov;
      } else if (mode === 'cine') { cineUpdate(dt); fov = 42; }
      if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
      // shake (trauma^2 model), never in captures' first frames
      if (shake.trauma > 0.001) {
        const tr = shake.trauma * shake.trauma, t = clock.realT;
        const a = tr * Math.min(30, camera.position.y * 0.01 + 2);
        off.set(Math.sin(t * 41.3) + Math.sin(t * 17.1) * 0.5, Math.sin(t * 37.7 + 1.3) + Math.sin(t * 13.9) * 0.5, Math.sin(t * 45.1 + 2.1) * 0.6).multiplyScalar(a);
        camera.position.add(off);
        shake.trauma = Math.max(0, shake.trauma - dt * 1.3);
      }
      const gy = groundAt(camera.position.x, camera.position.z) + 2.5;
      if (camera.position.y < gy) camera.position.y = gy;
      camera.updateMatrixWorld();
    },
  };
}
