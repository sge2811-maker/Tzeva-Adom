/* The canvas buffer is explicit; CSS/DPR cannot silently enlarge a locked mode. */
(function (root) {
  'use strict';
  const modes = {'1280x720':[1280,720], '1920x1080':[1920,1080], '2560x1440':[2560,1440]};
  function bufferSize(mode, width, height, dpr) {
    if (modes[mode]) return modes[mode].slice();
    const w = Math.max(1, Math.floor(width * dpr));
    const h = Math.max(1, Math.floor(height * dpr));
    const scale = mode === 'native' ? 1 : Math.min(1, 1920 / w, 1080 / h);
    return [Math.max(1, Math.floor(w * scale)), Math.max(1, Math.floor(h * scale))];
  }
  const api = {bufferSize};
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (!root.document) return;
  const canvas = document.getElementById('canvas');
  const button = document.getElementById('display-toggle');
  const panel = document.getElementById('display-panel');
  const select = document.getElementById('display-mode');
  let mode = 'auto';
  try { mode = localStorage.getItem('tzeva-display-mode') || mode; } catch (_) {}
  mode = new URLSearchParams(location.search).get('render') || mode;
  if (!['auto','native',...Object.keys(modes)].includes(mode)) mode = 'auto';
  select.value = mode;
  function layout() {
    const pixels = bufferSize(mode, innerWidth, innerHeight, devicePixelRatio || 1);
    // Assign only when needed: resetting a live canvas discards its GL buffer.
    if (canvas.width !== pixels[0]) canvas.width = pixels[0];
    if (canvas.height !== pixels[1]) canvas.height = pixels[1];
    const fit = Math.min(innerWidth / pixels[0], innerHeight / pixels[1]);
    const w = pixels[0] * fit, h = pixels[1] * fit;
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    canvas.style.left = (innerWidth-w)/2 + 'px'; canvas.style.top = (innerHeight-h)/2 + 'px';
  }
  function info() {
    const gl = canvas.getContext ? canvas.getContext('webgl2') : null;
    return {mode, requested_pixels:bufferSize(mode,innerWidth,innerHeight,devicePixelRatio||1),
      canvas_pixels:[canvas.width,canvas.height], css_pixels:[canvas.clientWidth,canvas.clientHeight],
      drawing_buffer_pixels:gl?[gl.drawingBufferWidth,gl.drawingBufferHeight]:null,
      device_pixel_ratio:devicePixelRatio||1};
  }
  function updateReadout() {
    const data = info(), game = root.tzevaReview;
    const actual = game && game.viewport_pixels ? game.viewport_pixels : data.canvas_pixels;
    document.getElementById('display-readout').textContent = 'Render buffer: ' + actual.join(' × ') +
      (game ? ' · ' + game.graphics.toUpperCase() : '');
  }
  function setOpen(open) {
    panel.hidden = !open; button.setAttribute('aria-expanded',String(open));
    if (open) { updateReadout(); select.focus(); } else canvas.focus();
  }
  button.addEventListener('click',()=>setOpen(panel.hidden));
  document.getElementById('display-close').addEventListener('click',()=>setOpen(false));
  document.getElementById('display-apply').addEventListener('click',()=>{
    mode = select.value;
    try { localStorage.setItem('tzeva-display-mode',mode); } catch (_) {}
    layout(); setOpen(false);
  });
  root.addEventListener('keydown',event=>{
    if (event.code==='F8') { event.preventDefault(); event.stopImmediatePropagation(); setOpen(panel.hidden); }
    else if (event.code==='Escape' && !panel.hidden) { event.preventDefault(); event.stopImmediatePropagation(); setOpen(false); }
  },true);
  root.addEventListener('resize',layout);
  root.tzevaDisplay = {info};
  layout();
  setInterval(()=>{ if (!panel.hidden) updateReadout(); },500);
})(typeof window === 'undefined' ? {} : window);
