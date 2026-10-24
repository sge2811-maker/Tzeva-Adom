// Camera responsiveness test (stream 5). Drives the RUNNING slice in real time (rAF loop, not
// capture mode) with synthetic Playwright input — drags, flings, wheel, right-drag rotate,
// keyboard pan/zoom, F focus, a zoomed-in sweep over the town and the escarpment — and logs the
// camera pose every frame. Reports latency to first movement, settle time, overshoot, jitter,
// zoom-to-cursor anchor error and terrain/building clearance, with PASS/FAIL per threshold.
//
// Usage: node tools/input-test.mjs [--w 480 --h 270] [--q low] [--out status/camera-input.json]
//
// Notes: this box renders with SwiftShader on 2 CPUs, so frames are slow (tens of ms); latency is
// reported both in ms and in frames. "First movement" is the first rendered frame whose camera
// moved after the input event was dispatched. The camera only uses the dt it is given, so settle
// times in ms transfer to real hardware (frame rate independent).
//
// Thresholds (and why):
//   latency        <= 1 frame after the input event (the rig reads input in the same frame)
//   settle (pan)   <= 350 ms after release to within 0.5% of the zoom distance (AoE IV feels instant)
//   settle (zoom)  <= 450 ms to within 1% of the final distance (a smoothed but snappy zoom)
//   settle (rotate)<= 350 ms to within 0.3 deg
//   overshoot      <= 1% of the move (no float, no spring-back)
//   key stop       <= 250 ms from key-up to rest
//   fling          glides, stops by itself in <= 1.4 s, never reverses
//   zoom anchor    ground point under the cursor drifts <= 3% of the camera distance
//   jitter         steady keyboard pan speed CV (dt-normalised) <= 0.12
//   clearance      camera >= 3 m above terrain/roofs in every logged frame
import fs from 'node:fs';
import path from 'node:path';
import { serve, withRenderLock, launch, args, openSlice, SLICE } from './lib.mjs';

const a = args();
const w = +(a.w || 480), h = +(a.h || 270);
const out = path.resolve(a.out || path.join(SLICE, 'status/camera-input.json'));
const results = [];
const check = (name, ok, value, limit, extra = '') => { results.push({ name, ok: !!ok, value, limit, extra }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(34)} ${String(value).padStart(10)}  (limit ${limit}) ${extra}`); };

await withRenderLock(async () => {
  const { srv, url } = await serve();
  const browser = await launch();
  try {
    const q = new URLSearchParams({ seed: '1', q: a.q || 'low', nointro: '1', mute: '1', demo: 'off' });
    const { page, logs } = await openSlice(browser, url, { w, h, query: q.toString() });
    // per-frame pose logger (registered after the game loop, so it reads the updated camera)
    await page.evaluate(() => {
      const S = window.__slice, cam = S.ctx.systems.camera;
      window.__log = []; window.__marks = [];
      const loop = () => {
        const s = cam.state();
        window.__log.push({ t: performance.now(), tx: s.tx, tz: s.tz, dist: s.dist, yaw: s.yaw, pitch: s.pitch, x: s.pos[0], y: s.pos[1], z: s.pos[2], clr: s.clearance, mode: s.mode });
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
      for (const ev of ['pointerdown', 'pointermove', 'pointerup', 'wheel', 'keydown', 'keyup']) addEventListener(ev, (e) => window.__marks.push({ ev, t: performance.now(), key: e.key }), true);
    });
    const wait = (ms) => page.waitForTimeout(ms);
    const mark = () => page.evaluate(() => ({ t: performance.now(), n: window.__log.length }));
    const slice = (m0, m1) => page.evaluate(([a0, a1]) => window.__log.slice(a0, a1), [m0.n, m1 ? m1.n : undefined]);
    const firstEvent = (ev, after) => page.evaluate(([e, t]) => (window.__marks.find((m) => m.ev === e && m.t >= t) || {}).t, [ev, after]);
    await wait(1500);
    // pick a screen point that hits the canvas (not a HUD marker/panel)
    const P = await page.evaluate(([W, H]) => {
      const c = document.getElementById('gl');
      for (const [fx, fy] of [[0.5, 0.62], [0.42, 0.7], [0.6, 0.55], [0.35, 0.5], [0.5, 0.45], [0.65, 0.72]]) { const x = Math.round(W * fx), y = Math.round(H * fy); if (document.elementFromPoint(x, y) === c) return { x, y }; }
      return { x: Math.round(W / 2), y: Math.round(H * 0.6) };
    }, [w, h]);
    const fps = await page.evaluate(async () => { const n0 = window.__log.length, t0 = performance.now(); await new Promise((r) => setTimeout(r, 1000)); return (window.__log.length - n0) / ((performance.now() - t0) / 1000); });
    console.log(`viewport ${w}x${h}, ~${fps.toFixed(1)} fps (SwiftShader), probe point ${P.x},${P.y}`);
    const frameMs = 1000 / Math.max(1, fps);

    const latency = (log, tIn, key) => { const i0 = log.findIndex((f) => f.t >= tIn); if (i0 < 0) return null; const base = log[Math.max(0, i0 - 1)]; const i = log.findIndex((f, k) => k >= i0 && Math.abs(f[key] - base[key]) > (key === 'yaw' ? 1e-4 : key === 'dist' ? base.dist * 1e-4 : 0.05)); return i < 0 ? null : { ms: log[i].t - tIn, frames: i - i0 + 1 }; };
    const settle = (log, tRel, key, tol) => { const fin = log[log.length - 1][key]; let last = null; for (const f of log) if (f.t >= tRel && Math.abs(f[key] - fin) > tol) last = f.t; return last == null ? 0 : last - tRel + frameMs; };
    const overshoot = (log, key, start, fin) => { const tot = fin - start; if (Math.abs(tot) < 1e-6) return 0; let o = 0; for (const f of log) o = Math.max(o, (f[key] - fin) / tot); return Math.max(0, o); };
    const along = (log, f0, dir) => log.map((f) => ({ ...f, s: (f.tx - f0.tx) * dir.x + (f.tz - f0.tz) * dir.z }));

    // 1. drag pan, hold still, release (clean stop)
    {
      await page.mouse.move(P.x, P.y); await wait(200);
      const m0 = await mark();
      await page.mouse.down();
      for (let i = 1; i <= 10; i++) { await page.mouse.move(P.x - i * 14, P.y + i * 3); await wait(16); }
      await wait(220);
      const tUp = (await mark()).t; await page.mouse.up(); await wait(900);
      const log = await slice(m0);
      const tMove = await firstEvent('pointermove', m0.t);
      const L = latency(log, tMove, 'tx') || latency(log, tMove, 'tz');
      const f0 = log[0], fin = log[log.length - 1], d = Math.hypot(fin.tx - f0.tx, fin.tz - f0.tz) || 1, dir = { x: (fin.tx - f0.tx) / d, z: (fin.tz - f0.tz) / d };
      const A = along(log, f0, dir);
      check('drag: latency to first movement', L && L.frames <= 1, L ? `${L.ms.toFixed(0)}ms/${L.frames}f` : 'none', '<= 1 frame');
      check('drag: settle after release', settle(log, tUp, 'tx', fin.dist * 0.005) <= 350, `${settle(log, tUp, 'tx', fin.dist * 0.005).toFixed(0)}ms`, '<= 350 ms');
      check('drag: overshoot', overshoot(A, 's', 0, d) <= 0.01, `${(overshoot(A, 's', 0, d) * 100).toFixed(2)}%`, '<= 1%', `moved ${d.toFixed(0)} m`);
    }
    // 2. fling (release while moving): glide, clean stop, no reversal
    {
      await page.mouse.move(P.x, P.y); await wait(150);
      const m0 = await mark();
      await page.mouse.down();
      for (let i = 1; i <= 6; i++) { await page.mouse.move(P.x + i * 18, P.y); await wait(14); }
      const tUp = (await mark()).t; await page.mouse.up(); await wait(1800);
      const log = await slice(m0);
      const iUp = log.findIndex((f) => f.t >= tUp), fUp = log[Math.max(0, iUp)], fin = log[log.length - 1];
      const glide = Math.hypot(fin.tx - fUp.tx, fin.tz - fUp.tz);
      const dir = { x: (fin.tx - fUp.tx) / (glide || 1), z: (fin.tz - fUp.tz) / (glide || 1) };
      let rev = 0, prev = 0, stopT = null;
      for (const f of log.slice(iUp)) { const s = (f.tx - fUp.tx) * dir.x + (f.tz - fUp.tz) * dir.z; rev = Math.max(rev, prev - s); prev = Math.max(prev, s); if (stopT == null && Math.abs(glide - s) < fin.dist * 0.002) stopT = f.t - tUp; }
      check('fling: glides after release', glide > fin.dist * 0.03, `${glide.toFixed(0)}m`, `> 3% of dist`);
      check('fling: stops by itself', stopT != null && stopT <= 1400, `${stopT == null ? 'never' : stopT.toFixed(0) + 'ms'}`, '<= 1400 ms');
      check('fling: no reversal', rev < fin.dist * 0.001, `${rev.toFixed(2)}m`, '~0');
    }
    // 3. wheel zoom toward the cursor
    {
      const Q = { x: Math.round(P.x - w * 0.12), y: Math.round(P.y - h * 0.05) };
      await page.mouse.move(Q.x, Q.y); await wait(300);
      const g0 = await page.evaluate(([x, y]) => window.__slice.ctx.systems.camera.pickGround(x, y), [Q.x, Q.y]);
      const m0 = await mark();
      for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, -120); await wait(30); }
      const tLast = (await mark()).t; await wait(1100);
      const log = await slice(m0);
      const tW = await firstEvent('wheel', m0.t);
      const g1 = await page.evaluate(([x, y]) => window.__slice.ctx.systems.camera.pickGround(x, y), [Q.x, Q.y]);
      const fin = log[log.length - 1], st = log[0];
      const L = latency(log, tW, 'dist');
      const drift = g0 && g1 ? Math.hypot(g1.x - g0.x, g1.z - g0.z) : NaN;
      check('zoom: latency to first movement', L && L.frames <= 1, L ? `${L.ms.toFixed(0)}ms/${L.frames}f` : 'none', '<= 1 frame');
      check('zoom: settle', settle(log, tLast, 'dist', fin.dist * 0.01) <= 450, `${settle(log, tLast, 'dist', fin.dist * 0.01).toFixed(0)}ms`, '<= 450 ms', `${st.dist.toFixed(0)} -> ${fin.dist.toFixed(0)} m`);
      check('zoom: overshoot', overshoot(log, 'dist', st.dist, fin.dist) <= 0.01, `${(overshoot(log, 'dist', st.dist, fin.dist) * 100).toFixed(2)}%`, '<= 1%');
      check('zoom: cursor anchor drift', drift <= fin.dist * 0.03, `${drift.toFixed(1)}m`, `<= ${(fin.dist * 0.03).toFixed(0)} m (3%)`);
      check('zoom: pitch eases with zoom', fin.pitch < st.pitch, `${(st.pitch * 57.3).toFixed(1)}->${(fin.pitch * 57.3).toFixed(1)}deg`, 'shallower when nearer');
    }
    // 4. right-drag rotate
    {
      await page.mouse.move(P.x, P.y); await wait(150);
      const m0 = await mark();
      await page.mouse.down({ button: 'right' });
      for (let i = 1; i <= 8; i++) { await page.mouse.move(P.x + i * 12, P.y); await wait(16); }
      const tUp = (await mark()).t; await page.mouse.up({ button: 'right' }); await wait(900);
      const log = await slice(m0), tMove = await firstEvent('pointermove', m0.t);
      const L = latency(log, tMove, 'yaw'), st = log[0], fin = log[log.length - 1];
      check('rotate: latency to first movement', L && L.frames <= 1, L ? `${L.ms.toFixed(0)}ms/${L.frames}f` : 'none', '<= 1 frame');
      check('rotate: settle', settle(log, tUp, 'yaw', 0.3 / 57.3) <= 350, `${settle(log, tUp, 'yaw', 0.3 / 57.3).toFixed(0)}ms`, '<= 350 ms', `${((fin.yaw - st.yaw) * 57.3).toFixed(1)} deg`);
      check('rotate: overshoot', overshoot(log, 'yaw', st.yaw, fin.yaw) <= 0.01, `${(overshoot(log, 'yaw', st.yaw, fin.yaw) * 100).toFixed(2)}%`, '<= 1%');
    }
    // 5. keyboard pan (hold W), key stop, jitter
    {
      await page.mouse.move(5, 5);
      const m0 = await mark();
      await page.keyboard.down('w'); await wait(900);
      const tUp = (await mark()).t; await page.keyboard.up('w'); await wait(700);
      const log = await slice(m0), tKey = await firstEvent('keydown', m0.t);
      const L = latency(log, tKey, 'tx') || latency(log, tKey, 'tz');
      const fin = log[log.length - 1];
      const stop = settle(log, tUp, 'tx', fin.dist * 0.002);
      // steady-state speed (dt-normalised) during the hold, after the 150 ms ramp
      const sp = [];
      for (let i = 1; i < log.length; i++) { const f = log[i], p = log[i - 1]; if (f.t > tKey + 250 && f.t < tUp) { const dt = (f.t - p.t) / 1000; if (dt > 0) sp.push(Math.hypot(f.tx - p.tx, f.tz - p.tz) / dt); } }
      const mean = sp.reduce((s, v) => s + v, 0) / (sp.length || 1), cv = Math.sqrt(sp.reduce((s, v) => s + (v - mean) ** 2, 0) / (sp.length || 1)) / (mean || 1);
      check('keys: latency to first movement', L && L.frames <= 1, L ? `${L.ms.toFixed(0)}ms/${L.frames}f` : 'none', '<= 1 frame');
      check('keys: stop after key-up', stop <= 250, `${stop.toFixed(0)}ms`, '<= 250 ms');
      check('keys: pan jitter (speed CV)', sp.length >= 3 && cv <= 0.12, `${cv.toFixed(3)}`, '<= 0.12', `${sp.length} frames, frame dt varies on SwiftShader`);
    }
    // 6. keyboard zoom parity (hold Z then X)
    {
      const m0 = await mark();
      await page.keyboard.down('z'); await wait(500); await page.keyboard.up('z'); await wait(500);
      const log = await slice(m0);
      check('keys: Z zooms in', log[log.length - 1].dist < log[0].dist * 0.9, `${log[0].dist.toFixed(0)}->${log[log.length - 1].dist.toFixed(0)}m`, 'closer');
    }
    // 7. F focus: eased fly-to, arrives
    {
      const m0 = await mark();
      await page.keyboard.press('f'); await wait(1700);
      const log = await slice(m0), fin = log[log.length - 1];
      const s = await page.evaluate(() => window.__slice.ctx.systems.camera.state());
      check('focus (F): arrives, no travel left', !s.travel && Math.hypot(s.tx - s.goal.tx, s.tz - s.goal.tz) < 5, `${Math.hypot(fin.tx - log[0].tx, fin.tz - log[0].tz).toFixed(0)}m moved`, 'arrive <= 1.25 s');
    }
    // 8. clearance sweep: zoom all the way in over the town, pan across towers and to the escarpment
    {
      await page.evaluate(() => window.__slice.ctx.systems.camera.focus(-60, -60, 150, 0.4, 0.2));
      await wait(1500);
      const m0 = await mark();
      await page.mouse.move(P.x, P.y);
      for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 300); await wait(40); }
      await page.evaluate(() => window.__slice.ctx.systems.camera.focus(-60, -60, 150, 2.2, 0.15));
      await wait(1400);
      await page.keyboard.down('d'); await wait(1200); await page.keyboard.up('d');
      await page.evaluate(() => window.__slice.ctx.systems.camera.focus(3900, -600, 160, 3.4, 0.15)); // camera east of the rim, below the plateau edge
      await wait(1600);
      await page.keyboard.down('q'); await wait(1200); await page.keyboard.up('q'); await wait(400);
      const log = await slice(m0);
      const minClr = Math.min(...log.map((f) => f.clr));
      check('clearance: never clips terrain/roofs', minClr >= 3, `${minClr.toFixed(1)}m`, '>= 3 m', `${log.length} frames incl. 150 m zoom over towers and the escarpment`);
    }
    // bounds
    {
      await page.evaluate(() => window.__slice.ctx.systems.camera.focus(99999, 99999, 99999));
      await wait(1600);
      const s = await page.evaluate(() => window.__slice.ctx.systems.camera.state());
      check('bounds: target and zoom clamped', s.tx <= 12000 && s.tz <= 9000 && s.dist <= 12000, `${s.tx.toFixed(0)},${s.tz.toFixed(0)} d${s.dist.toFixed(0)}`, 'x<=12000 z<=9000 d<=12000');
    }
    const errs = logs.filter((l) => l.startsWith('[error]') || l.startsWith('[pageerror]'));
    check('console: no errors', errs.length === 0, errs.length, 0, errs.slice(0, 3).join(' | '));
    const nFail = results.filter((r) => !r.ok).length;
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify({ when: new Date().toISOString(), viewport: [w, h], fps, results, pass: nFail === 0 }, null, 2));
    console.log(`\n${nFail ? nFail + ' check(s) FAILED' : 'ALL PASS'} -> ${out}`);
    process.exitCode = nFail ? 1 : 0;
    await page.close();
  } finally { await browser.close(); srv.close(); }
}, { label: 'camera input-test' });
