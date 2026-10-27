// Quality tiers. Owned by the performance stream; other streams read `ctx.quality.s` (static per
// tier) and `ctx.quality.post` (dynamic post hooks), and react to `ctx.quality.onChange(fn)`:
//   fn(q)          tier changed (everything may differ)
//   fn(q, 'scale') dynamic resolution changed q.renderScale (main.js resizes; env's resize follows)
//   fn(q, 'post')  dynamic post hooks changed q.post (env should re-read ao/bloom settings)
// The mapping and the reasoning behind every number are documented in docs/PERF.md.
//
// Budgets these tiers aim at (1080p, 60 fps): high = RTX 3050/3060 Laptop and up,
// med = Iris Xe / Radeon 680M class iGPUs, low = older iGPUs and mobile.
export const TIERS = {
  high: {
    tier: 'high',
    pixelBudget: 1920 * 1080,  // max drawing-buffer pixels before renderScale (1080p native; caps 1440p/4K/HiDPI)
    maxDpr: 2,                 // hard DPR cap (pixelBudget usually binds first)
    renderScale: 1.0,          // starting / maximum dynamic scale
    minScale: 0.7,             // dynamic resolution floor (0.7 x 1080p = 756p)
    ao: true, aoHalfRes: true, aoSamples: 12, aoDenoise: 4,
    bloom: true, bloomLevels: 6,
    shadows: false, shadowSize: 2048, // at most one shadow map; none in phase A
    aa: 'smaa',
    particleMul: 1.0, crowdMax: 400, lightsMax: 6, trailMax: 260,
    grain: true,
  },
  med: {
    tier: 'med',
    pixelBudget: 1600 * 900,
    maxDpr: 1.5,
    renderScale: 0.9, minScale: 0.6,
    ao: true, aoHalfRes: true, aoSamples: 8, aoDenoise: 4,
    bloom: true, bloomLevels: 5,
    shadows: false, shadowSize: 1024,
    aa: 'smaa',
    particleMul: 0.7, crowdMax: 260, lightsMax: 4, trailMax: 180,
    grain: true,
  },
  low: {
    tier: 'low',
    pixelBudget: 1280 * 720,
    maxDpr: 1.0,
    renderScale: 0.85, minScale: 0.5,
    ao: false, aoHalfRes: true, aoSamples: 4, aoDenoise: 4,
    bloom: true, bloomLevels: 4,
    shadows: false, shadowSize: 512,
    aa: 'none',
    particleMul: 0.45, crowdMax: 160, lightsMax: 2, trailMax: 120,
    grain: false,
  },
};

export function gpuString(renderer) {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  } catch (e) { return 'unknown'; }
}

// Classify the GPU string. Chrome on Windows reports e.g.
// "ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Laptop GPU (0x0000249D) Direct3D11 vs_5_0 ps_5_0, D3D11)".
export function classifyGpu(gpu) {
  const g = String(gpu || '').toLowerCase();
  if (/swiftshader|llvmpipe|softpipe|software|microsoft basic render/.test(g)) return { cls: 'software', tier: 'high' };
  if (/geforce (mx|gt )|rtx 2050|radeon (r[579]|hd)|intel.*hd graphics [2-5]\d{2}|uhd graphics 6\d{2}|mali|adreno|powervr|videocore/.test(g)) return { cls: 'low-end', tier: 'low' };
  if (/rtx|gtx 16\d\d|gtx 10[6-8]0|gtx 9[78]0|radeon rx ?[5-9]\d{3}|radeon pro|arc a[5-7]|apple m[1-9] (pro|max|ultra)/.test(g)) return { cls: 'discrete', tier: 'high' };
  if (/iris|xe graphics|arc|uhd|intel|radeon\(tm\)|radeon graphics|680m|780m|vega|apple m[1-9]|apple gpu/.test(g)) return { cls: 'integrated', tier: 'med' };
  return { cls: 'unknown', tier: 'med' }; // unknown: start mid and let dynamic resolution find headroom
}

// Kept for compatibility with older callers.
export function autoTier(gpu) { return classifyGpu(gpu).tier; }

export function createQuality(renderer, requested = 'auto') {
  const gpu = gpuString(renderer);
  const { cls, tier: autoT } = classifyGpu(gpu);
  const tier = requested === 'auto' || !TIERS[requested] ? autoT : requested;
  const listeners = new Set();
  const emit = (kind) => { for (const fn of listeners) { try { fn(q, kind); } catch (e) { console.error('[quality] listener failed', e); } } };
  const postFor = (s) => ({ ao: s.ao, aoHalfRes: s.aoHalfRes, bloomLevels: s.bloomLevels, level: 0 });
  const q = {
    gpu,
    gpuClass: cls,              // 'discrete' | 'integrated' | 'low-end' | 'software' | 'unknown'
    software: cls === 'software',
    requested,
    tier,
    s: { ...TIERS[tier] },
    renderScale: TIERS[tier].renderScale, // dynamic, s.minScale..s.renderScale
    // dynamic post hooks: perf lowers these only after renderScale has hit s.minScale (see PERF.md)
    post: postFor(TIERS[tier]),
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    set(t) {
      if (!TIERS[t]) return;
      q.tier = t; q.s = { ...TIERS[t] }; q.renderScale = q.s.renderScale; q.post = postFor(q.s);
      emit(undefined);
    },
    setRenderScale(v) {
      const nv = Math.max(q.s.minScale ?? 0.5, Math.min(q.s.renderScale, v));
      if (Math.abs(nv - q.renderScale) < 0.01) return false;
      q.renderScale = nv;
      emit('scale');
      return true;
    },
    // degrade (+1) or restore (-1) the post hooks one step; returns true when something changed
    stepPost(dir) {
      const lv = Math.max(0, Math.min(2, q.post.level + dir));
      if (lv === q.post.level) return false;
      q.post.level = lv;
      q.post.bloomLevels = Math.max(3, q.s.bloomLevels - (lv >= 1 ? 1 : 0));
      q.post.ao = q.s.ao && lv < 2;
      emit('post');
      return true;
    },
    // device-pixel ratio for a CSS size: native DPR, capped by maxDpr and the tier's pixel budget,
    // times the dynamic render scale
    dprFor(cssW, cssH, deviceDpr = (typeof devicePixelRatio !== 'undefined' ? devicePixelRatio : 1) || 1) {
      let d = Math.min(deviceDpr, q.s.maxDpr);
      const px = cssW * cssH * d * d;
      if (q.s.pixelBudget && px > q.s.pixelBudget) d *= Math.sqrt(q.s.pixelBudget / px);
      return d * q.renderScale;
    },
  };
  return q;
}
