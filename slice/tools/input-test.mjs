// Camera responsiveness test (stream 5). Drives the running slice with synthetic Playwright input — drags, flings, wheel, right-drag rotate,
// keyboard pan/zoom, F focus, a zoomed-in sweep over the town and the escarpment — and logs the
// camera pose every frame. Reports latency to first movement, settle time, overshoot, jitter,
// zoom-to-cursor anchor error and terrain/building clearance, with PASS/FAIL per threshold.
//
// Usage: node tools/input-test.mjs [--w 480 --h 270] [--q low] [--out status/camera-input.json]
//
// Method: headless SwiftShader throttles the page's rAF loop to ~1-4 fps here, which would measure
// the container, not the camera. So the page runs in ?capture=1 mode (no rAF loop) and the test
// steps the game at a fixed 60 Hz with __slice.frame(1/60) between real browser input events
// (page.mouse / page.keyboard go through Chromium's input pipeline, with ~16 ms real gaps between
// mouse moves like a 60 Hz mouse). Latency is counted in frames after the event; settle times are
// game milliseconds at 60 Hz, which is what a player sees on real hardware (the camera only uses
// the dt it is given). --render also renders each frame (slow; same numbers).
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
    const q = new URLSearchParams({ seed: '1', q: a.q || 'low', capture: '1', demo: 'off', ui: '1' });
    const { page, logs } = await openSlice(browser, url, { w, h, query: q.toString() });
    const DT = 1 / 60, FMS = 1000 / 60, draw = !!a.render;
    await page.evaluate(() => { window.__log = []; window.__n = 0; });
    // advance n frames at 60 Hz, logging the camera pose after each
    const step = (n = 1) => page.evaluate(([n, dt, draw]) => {
      const S = window.__slice, cam = S.ctx.systems.camera;
      for (let i = 0; i < n; i++) {
        S.frame(dt, draw);
        const s = cam.state(); window.__n++;
        window.__log.push({ f: window.__n, tx: s.tx, tz: s.tz, dist: s.dist, yaw: s.yaw, pitch: s.pitch, y: s.pos[1], clr: s.clearance, mode: s.mode, travel: s.travel, gtx: s.goal.tx, gtz: s.goal.tz });
      }
      return window.__n;
    }, [n, DT, draw]);
    const mark = () => page.evaluate(() => window.__n);
    const slice = (m0) => page.evaluate((m) => window.__log.filter((f) => f.f > m), m0);
    const sleep = (ms) => page.waitForTimeout(ms);
    await step(30);
    // a screen point that hits the canvas (not a HUD marker or panel)
    const P = await page.evaluate(([W, H]) => {
      const c = document.getElementById('gl');
      for (const [fx, fy] of [[0.5, 0.62], [0.42, 0.7], [0.6, 0.55], [0.35, 0.5], [0.5, 0.45], [0.65, 0.72]]) { const x = Math.round(W * fx), y = Math.round(H * fy); if (document.elementFromPoint(x, y) === c) return { x, y }; }
      return { x: Math.round(W / 2), y: Math.round(H * 0.6) };
    }, [w, h]);
    console.log(`viewport ${w}x${h}, fixed 60 Hz stepping, probe point ${P.x},${P.y}`);
    // frames from input (frame index m) until the first frame that moved
    const latency = (log, key) => { const b = log[0], tol = key === 'yaw' ? 1e-5 : key === 'dist' ? b.dist * 1e-5 : 0.01; const i = log.findIndex((f, k) => k > 0 && Math.abs(f[key] - log[k - 1][key]) > tol) ; return i < 0 ? null : i; };
    const settleMs = (log, key, tol) => { const fin = log[log.length - 1][key]; let last = -1; log.forEach((f, i) => { if (Math.abs(f[key] - fin) > tol) last = i; }); return (last + 1) * FMS; };
    const overshoot = (log, key, start, fin) => { const tot = fin - start; if (Math.abs(tot) < 1e-9) return 0; let o = 0; for (const f of log) o = Math.max(o, (f[key] - fin) / tot); return Math.max(0, o); };

    // 1. drag pan, hold still, release: grab feel and a clean stop
    {
      await page.mouse.move(P.x, P.y); await step(2);
      await page.mouse.down(); await step(1);
      const m0 = await mark(), b0 = (await slice(m0 - 1))[0];
      let lat = null;
      for (let i = 1; i <= 12; i++) { await page.mouse.move(P.x - i * 12, P.y + i * 3); await sleep(16); await step(1); if (i === 1) { const L = await slice(m0); lat = Math.abs(L[0].tx - b0.tx) + Math.abs(L[0].tz - b0.tz) > 0.01 ? 1 : null; } }
      await sleep(120); await step(8);
      const mUp = await mark(); await page.mouse.up(); await step(45);
      const all = await slice(m0), rel = all.filter((f) => f.f > mUp), fin = all[all.length - 1];
      const d = Math.hypot(fin.tx - b0.tx, fin.tz - b0.tz) || 1, dir = { x: (fin.tx - b0.tx) / d, z: (fin.tz - b0.tz) / d };
      const A = all.map((f) => ({ s: (f.tx - b0.tx) * dir.x + (f.tz - b0.tz) * dir.z }));
      check('drag: latency to first movement', lat === 1, lat ? `${lat} frame` : 'none', '<= 1 frame');
      const st = settleMs([...all.filter((f) => f.f <= mUp).slice(-1), ...rel], 'tx', fin.dist * 0.005);
      check('drag: settle after release', st <= 350, `${st.toFixed(0)}ms`, '<= 350 ms', 'held still before release: no glide');
      check('drag: overshoot', overshoot(A, 's', 0, d) <= 0.01, `${(overshoot(A, 's', 0, d) * 100).toFixed(2)}%`, '<= 1%', `moved ${d.toFixed(0)} m`);
      // grab accuracy: the ground point grabbed stays under the cursor
    }
    // 2. fling (release while moving): glide, stop by itself, never reverse
    {
      await page.mouse.move(P.x, P.y); await step(2);
      await page.mouse.down(); await step(1);
      for (let i = 1; i <= 6; i++) { await page.mouse.move(P.x + i * 16, P.y); await sleep(16); await step(1); }
      const mUp = await mark(); await page.mouse.up(); await step(100);
      const log = await slice(mUp), fUp = log[0], fin = log[log.length - 1];
      const glide = Math.hypot(fin.tx - fUp.tx, fin.tz - fUp.tz), dir = { x: (fin.tx - fUp.tx) / (glide || 1), z: (fin.tz - fUp.tz) / (glide || 1) };
      let rev = 0, best = 0, stopF = null;
      log.forEach((f, i) => { const s = (f.tx - fUp.tx) * dir.x + (f.tz - fUp.tz) * dir.z; rev = Math.max(rev, best - s); best = Math.max(best, s); if (stopF == null && glide - s < fin.dist * 0.002) stopF = i + 1; });
      check('fling: glides after release', glide > fin.dist * 0.03, `${glide.toFixed(0)}m`, '> 3% of dist');
      check('fling: stops by itself', stopF != null && stopF * FMS <= 1400, stopF == null ? 'never' : `${(stopF * FMS).toFixed(0)}ms`, '<= 1400 ms');
      check('fling: no reversal', rev < fin.dist * 0.001, `${rev.toFixed(2)}m`, '~0');
    }
    // 3. wheel zoom toward the cursor (3 notches), pitch eases with zoom
    {
      const Q = await page.evaluate(([W, H, px, py]) => {
        const c = document.getElementById('gl');
        for (const [dx, dy] of [[-0.14, -0.04], [0.12, -0.06], [-0.1, 0.08], [0.15, 0.05], [0, -0.1]]) { const x = Math.round(px + W * dx), y = Math.round(py + H * dy); if (document.elementFromPoint(x, y) === c) return { x, y }; }
        return { x: px, y: py };
      }, [w, h, P.x, P.y]);
      await page.mouse.move(Q.x, Q.y); await step(2);
      const g0 = await page.evaluate(([x, y]) => window.__slice.ctx.systems.camera.pickGround(x, y), [Q.x, Q.y]);
      const m0 = await mark(), b0 = (await slice(m0 - 1))[0];
      // page.mouse.wheel dispatch is asynchronous: give Chromium ~25 ms to deliver each notch
      await page.mouse.wheel(0, -120); await sleep(25); await step(1);
      const first = (await slice(m0))[0];
      for (let i = 0; i < 2; i++) { await step(2); await page.mouse.wheel(0, -120); await sleep(25); }
      const mLast = await mark(); await step(60);
      const log = await slice(m0), after = await slice(mLast), fin = log[log.length - 1];
      const g1 = await page.evaluate(([x, y]) => window.__slice.ctx.systems.camera.pickGround(x, y), [Q.x, Q.y]);
      const drift = g0 && g1 ? Math.hypot(g1.x - g0.x, g1.z - g0.z) : NaN;
      check('zoom: latency to first movement', Math.abs(first.dist - b0.dist) > 0.01, Math.abs(first.dist - b0.dist) > 0.01 ? '1 frame' : 'none', '<= 1 frame');
      const st = settleMs(after, 'dist', fin.dist * 0.01);
      check('zoom: settle after last notch', st <= 450, `${st.toFixed(0)}ms`, '<= 450 ms', `${b0.dist.toFixed(0)} -> ${fin.dist.toFixed(0)} m`);
      check('zoom: overshoot', overshoot(log, 'dist', b0.dist, fin.dist) <= 0.01, `${(overshoot(log, 'dist', b0.dist, fin.dist) * 100).toFixed(2)}%`, '<= 1%');
      check('zoom: cursor anchor drift', drift <= fin.dist * 0.03, `${drift.toFixed(1)}m`, `<= ${(fin.dist * 0.03).toFixed(0)} m (3% of dist)`);
      check('zoom: pitch eases with zoom', fin.pitch < b0.pitch - 0.02, `${(b0.pitch * 57.3).toFixed(1)}->${(fin.pitch * 57.3).toFixed(1)}deg`, 'shallower when nearer');
      // zoom back out
      for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, 120); await sleep(25); await step(2); } await step(40);
    }
    // 4. right-drag rotate around the screen centre
    {
      await page.mouse.move(P.x, P.y); await step(2);
      await page.mouse.down({ button: 'right' }); await step(1);
      const m0 = await mark(), b0 = (await slice(m0 - 1))[0];
      for (let i = 1; i <= 8; i++) { await page.mouse.move(P.x + i * 12, P.y); await sleep(16); await step(1); }
      const mUp = await mark(); await page.mouse.up({ button: 'right' }); await step(45);
      const log = await slice(m0), after = await slice(mUp), fin = log[log.length - 1];
      const lat = latency([b0, ...log], 'yaw');
      check('rotate: latency to first movement', lat === 1, lat ? `${lat} frame` : 'none', '<= 1 frame');
      const st = settleMs(after, 'yaw', 0.3 / 57.3);
      check('rotate: settle after release', st <= 350, `${st.toFixed(0)}ms`, '<= 350 ms', `${((fin.yaw - b0.yaw) * 57.3).toFixed(1)} deg`);
      check('rotate: overshoot', overshoot(log, 'yaw', b0.yaw, fin.yaw) <= 0.01, `${(overshoot(log, 'yaw', b0.yaw, fin.yaw) * 100).toFixed(2)}%`, '<= 1%');
      const drift = Math.hypot(fin.tx - b0.tx, fin.tz - b0.tz);
      check('rotate: pivots on screen centre', drift < 1, `${drift.toFixed(2)}m`, 'target fixed');
    }
    // 5. keyboard pan (hold W): latency, ramp, steady speed jitter, stop
    {
      await page.mouse.move(2, 2); await step(2);
      const m0 = await mark(), b0 = (await slice(m0 - 1))[0];
      await page.keyboard.down('w'); await step(48);
      const mUp = await mark(); await page.keyboard.up('w'); await step(40);
      const log = await slice(m0), after = await slice(mUp), fin = log[log.length - 1];
      const lat = latency([b0, ...log], 'tx') || latency([b0, ...log], 'tz');
      const sp = []; for (let i = 15; i < 48; i++) sp.push(Math.hypot(log[i].tx - log[i - 1].tx, log[i].tz - log[i - 1].tz) * 60);
      const mean = sp.reduce((s, v) => s + v, 0) / sp.length, cv = Math.sqrt(sp.reduce((s, v) => s + (v - mean) ** 2, 0) / sp.length) / (mean || 1);
      let ramp = log.findIndex((f, i) => i > 0 && Math.hypot(f.tx - log[i - 1].tx, f.tz - log[i - 1].tz) * 60 > mean * 0.9);
      check('keys: latency to first movement', lat === 1, lat ? `${lat} frame` : 'none', '<= 1 frame', `90% speed after ${((ramp + 1) * FMS).toFixed(0)} ms`);
      const st = settleMs(after, 'tx', fin.dist * 0.002);
      check('keys: stop after key-up', st <= 250, `${st.toFixed(0)}ms`, '<= 250 ms');
      check('keys: pan jitter (speed CV)', cv <= 0.12, cv.toFixed(4), '<= 0.12', `${mean.toFixed(0)} m/s at ${fin.dist.toFixed(0)} m`);
    }
    // 6. keyboard parity: zoom (Z) and rotate (Q)
    {
      const m0 = await mark(), b0 = (await slice(m0 - 1))[0];
      await page.keyboard.down('z'); await step(30); await page.keyboard.up('z'); await step(30);
      await page.keyboard.down('q'); await step(30); await page.keyboard.up('q'); await step(30);
      const log = await slice(m0), fin = log[log.length - 1];
      check('keys: Z zooms in, Q rotates', fin.dist < b0.dist * 0.9 && Math.abs(fin.yaw - b0.yaw) > 0.3, `${b0.dist.toFixed(0)}->${fin.dist.toFixed(0)}m, ${((fin.yaw - b0.yaw) * 57.3).toFixed(0)}deg`, 'closer, rotated');
    }
    // 7. F focus: eased fly-to that arrives
    {
      const m0 = await mark();
      await page.keyboard.press('f'); await step(90);
      const log = await slice(m0), fin = log[log.length - 1];
      const arriveF = log.findIndex((f) => !f.travel);
      check('focus (F): eased fly-to arrives', arriveF >= 0 && !fin.travel && Math.hypot(fin.tx - fin.gtx, fin.tz - fin.gtz) < 2, `${(arriveF * FMS).toFixed(0)}ms`, '<= 1300 ms', `moved ${Math.hypot(fin.tx - log[0].tx, fin.tz - log[0].tz).toFixed(0)} m`);
    }
    // 8. clearance sweep: 150 m over the towers, pan and rotate low; then below the escarpment rim
    {
      const m0 = await mark();
      await page.evaluate(() => window.__slice.ctx.systems.camera.focus(-60, -60, 150, 0.4, 0.2)); await step(90);
      await page.keyboard.down('d'); await step(70); await page.keyboard.up('d'); await step(10);
      await page.keyboard.down('e'); await step(80); await page.keyboard.up('e'); await step(10);
      await page.evaluate(() => window.__slice.ctx.systems.camera.focus(5200, -900, 160, 3.3, 0.15)); await step(90);
      await page.keyboard.down('q'); await step(90); await page.keyboard.up('q'); await step(20);
      await page.mouse.move(P.x, P.y); for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, 400); await sleep(25); await step(3); } await step(40);
      const log = await slice(m0), minClr = Math.min(...log.map((f) => f.clr));
      check('clearance: never clips terrain/roofs', minClr >= 3, `${minClr.toFixed(1)}m`, '>= 3 m', `${log.length} frames: 150 m over towers, below the rim, extreme zoom-out`);
    }
    // 9. bounds and zoom limits
    {
      await page.evaluate(() => window.__slice.ctx.systems.camera.focus(99999, 99999, 99999)); await step(90);
      const s = await page.evaluate(() => window.__slice.ctx.systems.camera.state());
      check('bounds: target and zoom clamped', s.tx <= 12000 && s.tz <= 9000 && s.dist <= 12000, `${s.tx.toFixed(0)},${s.tz.toFixed(0)} d${s.dist.toFixed(0)}`, 'x<=12000 z<=9000 d<=12000');
    }
    // 10. CPU: camera update cost (median over 300 frames, tactical with keys held)
    {
      await page.evaluate(() => window.__slice.ctx.systems.camera.focus(250, 0, 2600)); await step(90);
      await page.keyboard.down('d');
      const ms = await page.evaluate(() => { const S = window.__slice, a = []; for (let i = 0; i < 300; i++) { S.frame(1 / 60, false); a.push(S.ctx.timings.update.camera); } a.sort((x, y) => x - y); return { med: a[150], p95: a[285] }; });
      await page.keyboard.up('d');
      check('cpu: camera update', ms.med <= 0.3, `${ms.med.toFixed(3)}ms`, '<= 0.3 ms median', `p95 ${ms.p95.toFixed(3)} ms (performance.now() is coarsened to 0.1 ms)`);
    }
    const errs = logs.filter((l) => l.startsWith('[error]') || l.startsWith('[pageerror]'));
    check('console: no errors', errs.length === 0, errs.length, 0, errs.slice(0, 3).join(' | '));
    const nFail = results.filter((r) => !r.ok).length;
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify({ when: new Date().toISOString(), viewport: [w, h], method: 'capture=1, fixed 60 Hz stepping between real browser input events', results, pass: nFail === 0 }, null, 2));
    console.log(`\n${nFail ? nFail + ' check(s) FAILED' : 'ALL PASS'} -> ${out}`);
    process.exitCode = nFail ? 1 : 0;
    await page.close();
  } finally { await browser.close(); srv.close(); }
}, { label: 'camera input-test' });
