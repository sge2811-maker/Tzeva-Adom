// Quality tiers. Owned by the performance stream; other streams read `ctx.quality.s` and
// react to `ctx.quality.onChange`. Dynamic resolution (renderScale) is driven by the perf system.
export const TIERS = {
  high: { tier: 'high', maxDpr: 1.5, renderScale: 1.0, ao: true, aoHalfRes: true, aoSamples: 12, bloom: true, shadows: true, shadowSize: 2048, aa: 'smaa', particleMul: 1.0, crowdMax: 400, grain: true, lightsMax: 6 },
  med: { tier: 'med', maxDpr: 1.25, renderScale: 0.9, ao: true, aoHalfRes: true, aoSamples: 8, bloom: true, shadows: false, shadowSize: 1024, aa: 'smaa', particleMul: 0.7, crowdMax: 260, grain: true, lightsMax: 4 },
  low: { tier: 'low', maxDpr: 1.0, renderScale: 0.75, ao: false, aoHalfRes: true, aoSamples: 4, bloom: true, shadows: false, shadowSize: 512, aa: 'none', particleMul: 0.45, crowdMax: 160, grain: false, lightsMax: 2 },
};

export function gpuString(renderer) {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  } catch (e) { return 'unknown'; }
}

export function autoTier(gpu) {
  const g = gpu.toLowerCase();
  if (/swiftshader|llvmpipe|software/.test(g)) return 'high'; // CPU rasteriser: only used by headless captures, which want the full look
  if (/rtx|radeon rx|rx [5-9]\d{3}|arc a7|apple m[1-9] (pro|max|ultra)|geforce gtx 16|geforce gtx 10[6-8]0/.test(g)) return 'high';
  if (/intel|iris|uhd|mali|adreno|powervr|apple m[1-9]|radeon\(tm\) graphics|vega/.test(g)) return 'med';
  return 'high';
}

export function createQuality(renderer, requested = 'auto') {
  const gpu = gpuString(renderer);
  const tier = requested === 'auto' || !TIERS[requested] ? autoTier(gpu) : requested;
  const listeners = new Set();
  const q = {
    gpu,
    requested,
    tier,
    s: { ...TIERS[tier] },
    renderScale: TIERS[tier].renderScale, // dynamic, 0.5..1
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    set(t) {
      if (!TIERS[t]) return;
      q.tier = t; q.s = { ...TIERS[t] }; q.renderScale = q.s.renderScale;
      for (const fn of listeners) fn(q);
    },
    setRenderScale(v) {
      const nv = Math.max(0.5, Math.min(1, v));
      if (Math.abs(nv - q.renderScale) < 0.01) return;
      q.renderScale = nv;
      for (const fn of listeners) fn(q, 'scale');
    },
  };
  return q;
}
