// Real-time smoke test of the player flow: menu -> Begin -> intro -> skip -> play, with the
// normal requestAnimationFrame loop (not capture mode). Fails on console errors.
// Usage: node tools/smoke.mjs [--out dir]
import fs from 'node:fs';
import path from 'node:path';
import { serve, withRenderLock, launch, args, SLICE } from './lib.mjs';

const a = args();
const out = path.resolve(a.out || path.join(SLICE, '.capture/smoke'));
fs.mkdirSync(out, { recursive: true });
let failed = false;
await withRenderLock(async () => {
  const { srv, url } = await serve();
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errs = [];
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(`${url}/index.html?mute=1`);
    await page.waitForFunction(() => window.__slice && window.__slice.ready, null, { timeout: 180000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(out, '1-menu.png') });
    const flow1 = await page.evaluate(() => window.__slice.ctx.flow);
    await page.click('[data-r="go"]');
    await page.waitForTimeout(4000);
    await page.screenshot({ path: path.join(out, '2-intro.png') });
    const flow2 = await page.evaluate(() => window.__slice.ctx.flow);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(4000);
    await page.screenshot({ path: path.join(out, '3-play.png') });
    const st = await page.evaluate(() => ({ flow: window.__slice.ctx.flow, t: window.__slice.sim.t, phase: window.__slice.sim.phase, info: window.__slice.info() }));
    console.log(JSON.stringify({ flow1, flow2, ...st, consoleErrors: errs }, null, 2));
    failed = flow1 !== 'menu' || flow2 !== 'intro' || st.flow !== 'play' || !(st.t > 0) || errs.length > 0;
  } finally { await browser.close(); srv.close(); }
}, { label: 'smoke' });
console.log(failed ? 'SMOKE FAIL' : 'SMOKE PASS');
process.exit(failed ? 1 : 0);
