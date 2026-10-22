// Audio stream: everything is synthesized at runtime (no audio files): rising-falling Home
// Front Command style siren, launches, intercept booms delayed by the speed of sound, impacts,
// the Shahed buzz, desert wind and crickets. Spatialised with HRTF panners on the camera.
const SOUND_SPEED = 343;

export function create(ctx) {
  const { bus, camera, sim, params } = ctx;
  const A = { ac: null, master: null, buses: {}, noise: null, siren: null, buzz: null, on: !params.mute };
  ctx.audio = A;

  function init() {
    if (A.ac || params.mute) return;
    try { A.ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    const ac = A.ac;
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.25;
    A.master = ac.createGain(); A.master.gain.value = 0.9; A.master.connect(comp).connect(ac.destination);
    for (const b of ['sfx', 'amb', 'siren', 'ui']) { const g = ac.createGain(); g.connect(A.master); A.buses[b] = g; }
    A.buses.amb.gain.value = 0.5;
    const buf = ac.createBuffer(1, ac.sampleRate * 3, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    A.noise = buf;
    // ambience: wind + crickets
    const wind = ac.createBufferSource(); wind.buffer = buf; wind.loop = true;
    const wl = ac.createBiquadFilter(); wl.type = 'lowpass'; wl.frequency.value = 420;
    const wg = ac.createGain(); wg.gain.value = 0.08;
    const lfo = ac.createOscillator(); lfo.frequency.value = 0.08; const lg = ac.createGain(); lg.gain.value = 0.04; lfo.connect(lg).connect(wg.gain); lfo.start();
    wind.connect(wl).connect(wg).connect(A.buses.amb); wind.start();
    A.crickets = setInterval(() => chirp(), 650);
    // drone buzz voice
    const bo = ac.createOscillator(); bo.type = 'sawtooth'; bo.frequency.value = 118;
    const bl = ac.createOscillator(); bl.frequency.value = 19; const bg2 = ac.createGain(); bg2.gain.value = 7; bl.connect(bg2).connect(bo.frequency); bl.start();
    const bf = ac.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = 820; bf.Q.value = 1.4;
    const bg = ac.createGain(); bg.gain.value = 0;
    bo.connect(bf).connect(bg).connect(A.buses.sfx); bo.start(); A.buzz = bg;
  }
  function chirp() {
    const ac = A.ac; if (!ac || ctx.flow !== 'play' && ctx.flow !== 'menu') return;
    if (sim.phase === 'barrage' || sim.phase === 'alert') return; // insects go quiet under the siren
    if (Math.random() < 0.45) return;
    const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
    o.frequency.value = 4200 + Math.random() * 600; g.gain.value = 0;
    for (let i = 0; i < 3; i++) { g.gain.setValueAtTime(0.012, t + i * 0.06); g.gain.setValueAtTime(0, t + i * 0.06 + 0.03); }
    o.connect(g).connect(A.buses.amb); o.start(t); o.stop(t + 0.25);
  }

  // positional voice: a panner at world position, optional speed-of-sound delay
  function voice(pos, { delay = 0, bus = 'sfx', ref = 400 } = {}) {
    const ac = A.ac, out = ac.createGain();
    const p = ac.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = ref; p.rolloffFactor = 1; p.maxDistance = 1e6;
    p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z;
    out.connect(p).connect(A.buses[bus]);
    return { out, t: ac.currentTime + delay };
  }
  function noiseBurst(dst, t, dur, f0, f1, type = 'lowpass', q = 0.7, gain = 1) {
    const ac = A.ac, s = ac.createBufferSource(); s.buffer = A.noise;
    const f = ac.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ac.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(dst); s.start(t, Math.random() * 2); s.stop(t + dur + 0.05);
  }
  function boom(pos, size = 1) {
    const d = Math.hypot(pos.x - camera.position.x, pos.y - camera.position.y, pos.z - camera.position.z);
    if (d > 60000) return;
    const delay = Math.min(25, d / SOUND_SPEED);
    const { out, t } = voice(pos, { delay, ref: 900 * size });
    const far = Math.min(1, d / 15000);
    noiseBurst(out, t, 2.6 * size + far * 2, 1800 * (1 - far * 0.85), 50, 'lowpass', 0.7, 1.6);
    const o = A.ac.createOscillator(), og = A.ac.createGain();
    o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(28, t + 1.2);
    og.gain.setValueAtTime(1.2 * size, t); og.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
    o.connect(og).connect(out); o.start(t); o.stop(t + 1.7);
  }

  // ---------------------------------------------------------------- siren
  function sirenStart(pos, delay = 0, gain = 0.22, dur = 70) {
    const ac = A.ac; if (!ac) return null;
    const { out, t } = voice(pos, { delay, bus: 'siren', ref: 2500 });
    const o1 = ac.createOscillator(), o2 = ac.createOscillator(); o1.type = 'sawtooth'; o2.type = 'square';
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2200;
    const g = ac.createGain(); g.gain.value = 0;
    o2.detune.value = 7;
    const mix = ac.createGain(); mix.gain.value = 0.5; o2.connect(mix);
    o1.connect(f); mix.connect(f); f.connect(g).connect(out);
    // rising and falling tone, ~ 4.5 s per cycle
    for (let i = 0; i < Math.ceil(dur / 4.5); i++) {
      const c = t + i * 4.5;
      for (const o of [o1, o2]) { o.frequency.setValueAtTime(380, c); o.frequency.linearRampToValueAtTime(820, c + 2.2); o.frequency.linearRampToValueAtTime(380, c + 4.5); }
    }
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 2.5);
    g.gain.setValueAtTime(gain, t + dur - 4); g.gain.linearRampToValueAtTime(0, t + dur);
    o1.start(t); o2.start(t); o1.stop(t + dur + 0.1); o2.stop(t + dur + 0.1);
    return { g, o1, o2 };
  }

  // ---------------------------------------------------------------- events
  bus.on('begin', () => { init(); if (A.ac && A.ac.state === 'suspended') A.ac.resume(); });
  bus.on('alert:start', () => {
    if (!A.ac) return;
    A.siren = sirenStart({ x: 0, y: 30, z: 0 }, 0, 0.26, ctx.pacing.countdown);
    sirenStart({ x: -3600, y: 40, z: 13800 }, 3.5, 0.08, ctx.pacing.countdown - 5);   // Dimona, later and fainter
    sirenStart({ x: -6800, y: 40, z: 2900 }, 1.5, 0.10, ctx.pacing.countdown - 2);    // Nevatim
  });
  bus.on('launch', (e) => {
    if (!A.ac) return;
    const d = Math.hypot(e.x - camera.position.x, e.y - camera.position.y, e.z - camera.position.z);
    if (d > 30000) return;
    const { out, t } = voice(e, { delay: Math.min(12, d / SOUND_SPEED), ref: 300 });
    noiseBurst(out, t, 2.2, 3200, 260, 'bandpass', 0.8, 1.4);
    noiseBurst(out, t, 0.25, 600, 80, 'lowpass', 0.7, 1.5);
  });
  bus.on('intercept', (e) => { if (A.ac && e.kill) boom(e, e.big ? 1.3 : 0.7); else if (A.ac) boom(e, 0.4); });
  bus.on('impact', (e) => { if (A.ac) boom({ x: e.x, y: e.y + 20, z: e.z }, e.type === 'ballistic' ? 2.2 : 1.4); });
  bus.on('cmd', ({ ok }) => {
    if (!A.ac) return;
    const t = A.ac.currentTime, o = A.ac.createOscillator(), g = A.ac.createGain();
    o.frequency.value = ok ? 1250 : 380; g.gain.setValueAtTime(0.05, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    o.connect(g).connect(A.buses.ui); o.start(t); o.stop(t + 0.1);
  });

  // ---------------------------------------------------------------- per frame
  const fwd = { x: 0, y: 0, z: -1 };
  return {
    update(dt) {
      const ac = A.ac; if (!ac) return;
      const L = ac.listener, p = camera.position;
      const e = camera.matrixWorld.elements;
      fwd.x = -e[8]; fwd.y = -e[9]; fwd.z = -e[10];
      if (L.positionX) {
        const tt = ac.currentTime;
        L.positionX.setTargetAtTime(p.x, tt, 0.02); L.positionY.setTargetAtTime(p.y, tt, 0.02); L.positionZ.setTargetAtTime(p.z, tt, 0.02);
        L.forwardX.setTargetAtTime(fwd.x, tt, 0.02); L.forwardY.setTargetAtTime(fwd.y, tt, 0.02); L.forwardZ.setTargetAtTime(fwd.z, tt, 0.02);
        L.upX.value = e[4]; L.upY.value = e[5]; L.upZ.value = e[6];
      }
      // Shahed buzz follows the nearest drone
      let bd = 1e9; for (const th of sim.threats) if (th.alive && th.type === 'drone') { const d = Math.hypot(th.pos.x - p.x, th.pos.y - p.y, th.pos.z - p.z); if (d < bd) bd = d; }
      A.buzz.gain.setTargetAtTime(ctx.clock.paused ? 0 : Math.max(0, 1 - bd / 6000) * 0.12, ac.currentTime, 0.3);
      A.master.gain.setTargetAtTime(ctx.clock.paused ? 0.2 : 0.9, ac.currentTime, 0.2);
    },
  };
}
