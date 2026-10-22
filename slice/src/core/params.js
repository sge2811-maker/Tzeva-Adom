// URL parameters. All are optional.
//   seed=1            sim + visual seed
//   shot=S4-alert     jump to a canonical critic shot (see core/shots.js); implies capture-friendly mode
//   seek=180          fast-forward the sim to t seconds after start (with demo autopilot unless demo=off)
//   demo=good|bad|off autopilot player (default: off for normal play, good for shot/seek/capture)
//   capture=1         deterministic stepping driven by window.__slice.frame(); no rAF loop
//   q=high|med|low|auto  quality tier (default auto)
//   perf=1            show the performance overlay
//   mute=1            no audio
//   nointro=1         skip the start screen and intro flyover
//   ui=0              hide the HUD (for clean environment shots)
//   debug=1           debug helpers (axes, sim inspector)
const p = new URLSearchParams(location.search);
const num = (k, d) => (p.has(k) && p.get(k) !== '' && !Number.isNaN(+p.get(k)) ? +p.get(k) : d);
const shot = p.get('shot') || null;
const seek = p.has('seek') ? num('seek', 0) : null;
const capture = p.get('capture') === '1';
export const PARAMS = {
  seed: num('seed', 1),
  shot,
  seek,
  capture,
  demo: p.get('demo') || (shot || seek != null || capture ? 'good' : 'off'),
  quality: p.get('q') || 'auto',
  perf: p.get('perf') === '1',
  mute: p.get('mute') === '1' || capture,
  nointro: p.get('nointro') === '1' || !!shot || seek != null || capture,
  ui: p.get('ui') !== '0',
  debug: p.get('debug') === '1',
  fps: num('fps', 30),
  raw: p,
};
