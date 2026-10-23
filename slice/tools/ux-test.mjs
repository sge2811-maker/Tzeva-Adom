// HUD/UX test: plays the shelter-routing UX and the pad build popup with REAL clicks on HUD
// elements (Playwright mouse events on the DOM), with the autopilot off. Time is driven
// deterministically through window.__slice (capture mode), so the run is identical every time.
//   1. Prep: click the Arad North pad marker, pick David's Sling in the popup -> battery built.
//   2. Prep (t=45): click the Evening walkers (G7) marker, hover the East quarter shelter (S7)
//      to preview, click S7 -> G7 is routed to S7 by the player.
//   3. Siren (t=160.4): click the locked Lookout (S1) and West (S5) shelter markers -> opening.
//   4. Impact window (t=235): everyone outdoors is in a protected space.
// Usage: node tools/ux-test.mjs [--out status/shots/hud-ux] [--w 1280 --h 720]
// Prints one line per check and UX-TEST PASS / UX-TEST FAIL; exit code 1 on failure.
import fs from 'node:fs';
import path from 'node:path';
import { serve, withRenderLock, launch, args, openSlice, SLICE } from './lib.mjs';

const a = args();
const out = path.resolve(a.out || path.join(SLICE, 'status/shots/hud-ux'));
const w = +(a.w || 1280), h = +(a.h || 720);
fs.mkdirSync(out, { recursive: true });
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  · ' + detail : ''}`); };

await withRenderLock(async () => {
  const { srv, url } = await serve();
  const browser = await launch();
  try {
    const { page, logs } = await openSlice(browser, url, { w, h, query: new URLSearchParams({ seed: '1', demo: 'off', capture: '1', mute: '1', q: a.q || 'low' }).toString() });
    const tick = (n = 4) => page.evaluate((n) => { for (let i = 0; i < n; i++) window.__slice.frame(1 / 30, false); }, n);
    const seek = (t) => page.evaluate((t) => { window.__slice.seek(t, 1); for (let i = 0; i < 4; i++) window.__slice.frame(1 / 30, false); return window.__slice.sim.t; }, t);
    const snap = async (name) => { await page.evaluate(() => window.__slice.frame(1 / 30, true)); await page.screenshot({ path: path.join(out, name) }); };
    const sim = (fn, arg) => page.evaluate(fn, arg);
    // click a world marker the way a player would: its label, or its ground foot when decluttered to a dot
    async function clickMarker(id, { hover = false } = {}) {
      const el = page.locator(`[data-mk="${id}"]`);
      const mode = await el.evaluate((e) => (e.className.match(/m-(\w+)/) || [])[1]);
      if (mode === 'hidden') throw new Error(`marker ${id} is not on screen`);
      const target = el.locator(mode === 'dot' ? '.foot' : '.lbl');
      if (hover) { await target.hover({ timeout: 5000 }); return mode; }
      await target.click({ timeout: 5000 });
      return mode;
    }

    await tick(6);
    const flow = await sim(() => window.__slice.ctx.flow);
    check('slice in play with autopilot off', flow === 'play' && (await sim(() => window.__slice.ctx.params.demo)) === 'off', `flow=${flow}`);

    // 1. build through the pad popup
    try {
      const mode = await clickMarker('pad-AN');
      await page.locator('[data-r="pop"]').waitFor({ state: 'visible', timeout: 3000 });
      await snap('ux-0-pad-popup.png');
      await page.locator('[data-r="pop"] [data-build="sling"]').click({ timeout: 3000 });
      await tick(2);
      const b = await sim(() => { const S = window.__slice.sim, p = S.layout.pads.find((q) => q.id === 'AN'); const bt = S.batteries.find((q) => q.id === p.battery); return bt ? { type: bt.type, budget: S.budget } : null; });
      check('pad popup builds a battery (Arad North -> David\'s Sling)', b && b.type === 'sling', b ? `type=${b.type} budget=$${b.budget}M · marker ${mode}` : 'no battery');
    } catch (e) { check('pad popup builds a battery (Arad North -> David\'s Sling)', false, e.message.split('\n')[0]); }

    // 2. pre-alert planning: Evening walkers -> East quarter shelter
    const t1 = await seek(45);
    try {
      let via = 'marker';
      try { await clickMarker('G7'); } catch (e) { via = 'roster'; await page.locator('[data-group="G7"]').click({ timeout: 3000 }); }
      await tick(2);
      const sel = await page.locator('[data-mk="G7"]').evaluate((e) => e.classList.contains('sel'));
      check('selecting Evening walkers (G7) highlights the group', sel, `t=${t1.toFixed(1)} via ${via}`);
      await clickMarker('S7', { hover: true });
      await tick(2);
      const pv = await page.locator('[data-mk="S7"]').evaluate((e) => ({ hov: e.classList.contains('hov'), text: e.querySelector('.lbl').textContent.trim() }));
      check('hovering S7 previews ETA and capacity for the selected group', pv.hov && /\d+s/.test(pv.text), `label "${pv.text}"`);
      await snap('ux-1-route-preview.png');
      await clickMarker('S7');
      await tick(2);
      const r = await sim(() => { const S = window.__slice.sim; const g = S.groups.find((q) => q.id === 'G7'); const c = S.commandLog.filter((q) => q.name === 'route').pop(); return { shelter: g.shelter, by: g.assignedBy, cmd: c && c.args.shelter, toast: document.querySelector('[data-r="toast"]').textContent }; });
      check('clicking S7 routes G7 to S7 (player command)', r.shelter === 'S7' && r.by === 'player', `shelter=${r.shelter} by=${r.by} · toast "${r.toast}"`);
    } catch (e) { check('pre-alert routing G7 -> S7', false, e.message.split('\n')[0]); }

    // 3. at the siren: open the two locked shelters
    const t2 = await seek(160.4);
    const phase = await sim(() => window.__slice.sim.phase);
    check('siren sounded, red-alert countdown visible', phase === 'alert' && await page.locator('[data-r="alert"]').isVisible(), `t=${t2.toFixed(1)} phase=${phase} countdown=${await page.locator('[data-r="alNum"]').textContent()}`);
    for (const id of ['S1', 'S5']) {
      try {
        const mode = await clickMarker(id);
        await tick(1);
        const s = await sim((id) => { const s = window.__slice.sim.shelters.find((q) => q.id === id); return { locked: s.locked, opening: s.opening }; }, id);
        check(`clicking locked ${id} opens it`, !s.locked || s.opening > 0, `opening=${s.opening.toFixed(1)}s · marker ${mode}`);
      } catch (e) { check(`clicking locked ${id} opens it`, false, e.message.split('\n')[0]); }
    }
    await tick(12);
    await snap('ux-2-siren.png');

    // 4. the impact window
    const t3 = await seek(235.3);
    const res = await sim(() => { const S = window.__slice.sim; return { exposed: S.exposedAtImpact, total: S.civ.total, obj: S.objectives.find((o) => o.id === 'shelter').state, phase: S.phase }; });
    check('everyone sheltered at the impact window (t=235)', res.exposed === 0 && res.obj === 'done', `t=${t3.toFixed(1)} exposed=${res.exposed}/${res.total} objective=${res.obj} phase=${res.phase}`);
    await tick(6);
    await snap('ux-3-impact-window.png');

    const cmds = await sim(() => window.__slice.sim.commandLog.map((c) => `${c.t.toFixed(1)} ${c.name} ${JSON.stringify(c.args)}`));
    check('no console errors', logs.filter((l) => l.startsWith('[error]') || l.startsWith('[pageerror]')).length === 0, logs.slice(0, 3).join(' | '));
    fs.writeFileSync(path.join(out, 'ux-test.json'), JSON.stringify({ when: new Date().toISOString(), w, h, results, commands: cmds, console: logs }, null, 2));
    console.log('commands: ' + cmds.join('  ·  '));
  } finally { await browser.close(); srv.close(); }
}, { label: 'ux-test' });

const pass = results.length > 0 && results.every((r) => r.ok);
console.log(pass ? 'UX-TEST PASS' : 'UX-TEST FAIL');
process.exit(pass ? 0 : 1);
