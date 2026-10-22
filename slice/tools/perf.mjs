// Performance probe on the running slice. This container has no GPU (SwiftShader), so GPU time
// is NOT measured here; we measure what transfers to real hardware: draw calls, triangles,
// points, programs, render-target passes, and CPU (JavaScript) time per frame for sim + systems.
// Hardware sign-off uses the in-game F9 capture on a real laptop.
// Usage: node tools/perf.mjs [--shots S2-tactical,S6-salvo] [--frames 40] [--out .capture/perf]
import fs from 'node:fs';
import path from 'node:path';
import { serve, withRenderLock, launch, args, openSlice, SLICE } from './lib.mjs';

const a = args();
const { SHOTS } = await import(path.join(SLICE, 'src/core/shots.js'));
const names = String(a.shots || 'S2-tactical,S3-drones,S4-alert,S5-street,S6-salvo,S7-aftermath').split(',');
const frames = +(a.frames || 40);
const out = path.resolve(a.out || path.join(SLICE, '.capture/perf'));
fs.mkdirSync(out, { recursive: true });
const BUDGET = { calls: 250, triangles: 1.5e6, cpuMsP95: 6, cpuMsMedian: 4 };

await withRenderLock(async () => {
  const { srv, url } = await serve();
  const browser = await launch();
  const rows = [];
  try {
    for (const name of names) {
      const q = new URLSearchParams({ shot: name, seed: '1', q: a.q || 'high', capture: '1' });
      const { page, logs } = await openSlice(browser, url, { w: +(a.w || 1920), h: +(a.h || 1080), query: q.toString() });
      await page.evaluate((n) => window.__slice.shot(n), name);
      const r = await page.evaluate((frames) => {
        const S = window.__slice, cpu = [], gpuish = [], calls = [], tris = [], pts = [];
        for (let i = 0; i < frames; i++) {
          const a0 = performance.now();
          S.frame(1 / 60, false);            // sim + all system updates (CPU only)
          const a1 = performance.now();
          S.ctx.renderer.info.reset();
          S.ctx.render();                      // submit + SwiftShader raster (not representative of a GPU)
          S.ctx.renderer.getContext().finish();
          const a2 = performance.now();
          cpu.push(a1 - a0); gpuish.push(a2 - a1);
          const i2 = S.ctx.renderer.info.render; calls.push(i2.calls); tris.push(i2.triangles); pts.push(i2.points);
        }
        const st = (arr) => { const s = arr.slice().sort((x, y) => x - y); return { median: s[Math.floor(s.length / 2)], p95: s[Math.floor(s.length * 0.95)], max: s[s.length - 1] }; };
        const comp = S.ctx.post && S.ctx.post.composer;
        return {
          cpu: st(cpu), swiftshaderRender: st(gpuish), calls: st(calls), triangles: st(tris), points: st(pts),
          programs: S.ctx.renderer.info.programs ? S.ctx.renderer.info.programs.length : null,
          textures: S.ctx.renderer.info.memory.textures, geometries: S.ctx.renderer.info.memory.geometries,
          passes: comp ? comp.passes.map((p) => p.name || p.constructor.name) : null,
          perSystem: S.ctx.timings.update, vfx: S.ctx.systems.vfx && S.ctx.systems.vfx.stats ? S.ctx.systems.vfx.stats() : null,
        };
      }, frames);
      const verdict = {
        calls: r.calls.max <= BUDGET.calls, triangles: r.triangles.max <= BUDGET.triangles,
        cpu: r.cpu.median <= BUDGET.cpuMsMedian && r.cpu.p95 <= BUDGET.cpuMsP95,
      };
      rows.push({ shot: name, ...r, verdict, consoleErrors: logs.length });
      console.log(`${name.padEnd(14)} calls ${String(r.calls.max).padStart(4)}  tris ${(r.triangles.max / 1e6).toFixed(2)}M  pts ${(r.points.max / 1e3).toFixed(0)}k  cpu ${r.cpu.median.toFixed(2)}/${r.cpu.p95.toFixed(2)} ms  swiftshader ${r.swiftshaderRender.median.toFixed(0)} ms  ${Object.entries(verdict).map(([k, v]) => `${k}:${v ? 'ok' : 'OVER'}`).join(' ')}`);
      await page.close();
    }
  } finally { await browser.close(); srv.close(); }
  fs.writeFileSync(path.join(out, 'perf.json'), JSON.stringify({ when: new Date().toISOString(), budget: BUDGET, note: 'No GPU in this environment: swiftshaderRender is CPU rasterisation and is not a GPU frame time.', rows }, null, 2));
}, { label: 'perf' });
