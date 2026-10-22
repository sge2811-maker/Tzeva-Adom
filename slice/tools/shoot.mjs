// Canonical critic screenshots of the RUNNING slice (deterministic: seeded sim + autopilot + fixed camera).
// Usage:
//   node tools/shoot.mjs --shots S2-tactical,S6-salvo --out status/shots/env-r1 [--w 1600 --h 900] [--q high] [--ui 0]
//   node tools/shoot.mjs --all --out /tmp/x
// Writes <out>/<shot>.png, <out>/<shot>.jpg (smaller, for status.html) and <out>/report.json
// (draw calls, triangles, timings, console errors per shot).
import fs from 'node:fs';
import path from 'node:path';
import { serve, withRenderLock, launch, args, openSlice, SLICE } from './lib.mjs';

const a = args();
const { SHOTS } = await import(path.join(SLICE, 'src/core/shots.js'));
const names = a.all ? Object.keys(SHOTS) : String(a.shots || 'S2-tactical').split(',');
const out = path.resolve(a.out || path.join(SLICE, '.capture/shots'));
const w = +(a.w || 1600), h = +(a.h || 900);
fs.mkdirSync(out, { recursive: true });

await withRenderLock(async () => {
  const { srv, url } = await serve();
  const browser = await launch();
  const report = { when: new Date().toISOString(), w, h, shots: {} };
  try {
    for (const name of names) {
      const t0 = Date.now();
      const q = new URLSearchParams({ shot: name, seed: a.seed || '1', q: a.q || 'high', ui: a.ui === '0' ? '0' : '1', capture: '1' });
      const { page, logs } = await openSlice(browser, url, { w, h, query: q.toString() });
      const res = await page.evaluate(async (n) => window.__slice.shot(n), name);
      await page.waitForTimeout(150);
      const info = await page.evaluate(() => window.__slice.info());
      const png = path.join(out, `${name}.png`);
      await page.screenshot({ path: png });
      await page.screenshot({ path: path.join(out, `${name}.jpg`), type: 'jpeg', quality: 78 });
      report.shots[name] = { ...res, info, ms: Date.now() - t0, consoleErrors: logs.slice(0, 20) };
      console.log(`${name}: t=${res.t.toFixed(1)} phase=${res.phase} calls=${info.calls} tris=${info.triangles} errors=${logs.length} (${Date.now() - t0} ms) -> ${png}`);
      await page.close();
    }
  } finally {
    await browser.close(); srv.close();
  }
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
}, { label: `shoot ${names.join(',')}` });
