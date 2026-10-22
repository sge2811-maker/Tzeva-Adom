// Performance stream: overlay (?perf=1 or F8), dynamic resolution to hold 60 fps, and the F9
// frame-time capture (30 s sample after a 2 s warm-up, downloaded as JSON) for hardware sign-off.
export function create(ctx) {
  const { renderer, quality, params, bus } = ctx;
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:8px;top:84px;z-index:40;font:11px/1.45 ui-monospace,Menlo,Consolas,monospace;color:#cfe;background:rgba(0,0,0,0.6);padding:6px 8px;pointer-events:none;white-space:pre;display:none';
  document.body.appendChild(el);
  let show = params.perf;
  const frames = new Float32Array(240); let fi = 0, fn = 0;
  let last = performance.now();
  const dyn = { enabled: !params.capture, t: 0, cool: 0 };
  let capture = null;

  addEventListener('keydown', (e) => {
    if (e.key === 'F8') { show = !show; e.preventDefault(); }
    if (e.key === 'F9') { e.preventDefault(); startCapture(); }
  });
  function startCapture() {
    if (capture) return;
    capture = { warm: 2, dur: 30, t: 0, ft: [], calls: [], tris: [], scale: [], started: new Date().toISOString() };
    bus.emit('perf:capture', { state: 'start' });
  }
  function finishCapture() {
    const ft = capture.ft.slice().sort((a, b) => a - b);
    const avg = capture.ft.reduce((a, b) => a + b, 0) / capture.ft.length;
    const pct = (p) => ft[Math.min(ft.length - 1, Math.floor(ft.length * p))];
    const report = {
      schema: 'iron-wall-perf/1', started: capture.started, gpu: quality.gpu, tier: quality.tier, ua: navigator.userAgent,
      canvas: { cssW: innerWidth, cssH: innerHeight, dpr: ctx.size.dpr, drawW: renderer.domElement.width, drawH: renderer.domElement.height },
      frames: capture.ft.length, avgFps: +(1000 / avg).toFixed(2), avgMs: +avg.toFixed(2), p50: +pct(0.5).toFixed(2), p95: +pct(0.95).toFixed(2), p99: +pct(0.99).toFixed(2),
      avgCalls: Math.round(capture.calls.reduce((a, b) => a + b, 0) / capture.calls.length),
      avgTris: Math.round(capture.tris.reduce((a, b) => a + b, 0) / capture.tris.length),
      renderScale: { min: Math.min(...capture.scale), max: Math.max(...capture.scale) },
      phase: ctx.sim.phase, simT: +ctx.sim.t.toFixed(1),
      pass: 1000 / avg >= 59 && pct(0.99) <= 22.3,
    };
    capture = null;
    window.__slice.lastPerf = report;
    bus.emit('perf:capture', { state: 'done', report });
    try {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
      a.download = `iron-wall-perf-${Date.now()}.json`; a.click();
    } catch (e) { /* ignore */ }
  }

  return {
    afterRender() {
      const now = performance.now(), ft = now - last; last = now;
      frames[fi] = ft; fi = (fi + 1) % frames.length; fn = Math.min(frames.length, fn + 1);
      const info = renderer.info.render;
      if (capture) {
        capture.t += ft / 1000;
        if (capture.t > capture.warm) { capture.ft.push(ft); capture.calls.push(info.calls); capture.tris.push(info.triangles); capture.scale.push(quality.renderScale); }
        if (capture.t > capture.warm + capture.dur) finishCapture();
      }
      // dynamic resolution: hold ~60 fps by trading render scale (0.6–1.0), with hysteresis
      if (dyn.enabled && ctx.flow === 'play' && fn > 60) {
        dyn.t += ft / 1000; dyn.cool -= ft / 1000;
        if (dyn.t > 1 && dyn.cool <= 0) {
          dyn.t = 0;
          let sum = 0; for (let i = 0; i < 60; i++) sum += frames[(fi - 1 - i + frames.length) % frames.length];
          const avg = sum / 60;
          if (avg > 18.5 && quality.renderScale > 0.6) { quality.setRenderScale(quality.renderScale - 0.08); dyn.cool = 2; }
          else if (avg < 14.5 && quality.renderScale < quality.s.renderScale) { quality.setRenderScale(quality.renderScale + 0.04); dyn.cool = 3; }
        }
      }
      if (!show) { if (el.style.display !== 'none') el.style.display = 'none'; return; }
      el.style.display = '';
      let sum = 0; for (let i = 0; i < fn; i++) sum += frames[i];
      const avg = sum / Math.max(1, fn);
      const tm = ctx.timings;
      el.textContent = `${(1000 / avg).toFixed(0)} fps  ${avg.toFixed(1)} ms  scale ${quality.renderScale.toFixed(2)} ${quality.tier}\n` +
        `calls ${info.calls}  tris ${(info.triangles / 1000).toFixed(0)}k  pts ${(info.points / 1000).toFixed(0)}k\n` +
        `sim ${tm.sim.toFixed(2)}  ` + Object.entries(tm.update).map(([k, v]) => `${k} ${v.toFixed(2)}`).join('  ') + `  render ${tm.render.toFixed(2)}\n` +
        (capture ? `CAPTURING ${Math.max(0, capture.t - capture.warm).toFixed(1)}/${capture.dur}s` : 'F9 capture 30 s · F8 hide');
    },
  };
}
