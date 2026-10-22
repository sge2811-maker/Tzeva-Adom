// Mission clock. Real time drives the loop; the sim advances by realDt * speed * scale.
// `scale` is the game-feel channel (hit-stop, slow motion). It is owned by the camera &
// game-feel stream, which calls hitStop()/slowMo(); nothing else should write `scale`.
import { clamp } from './util.js';

export function createClock() {
  const c = {
    realT: 0,       // seconds since boot (real)
    simT: 0,        // mirror of sim.t (set by main loop)
    speed: 1,       // player speed setting (1, 2, 4)
    paused: false,
    scale: 1,       // game-feel time scale (1 = normal)
    _effects: [],   // active scale effects { kind, t, dur, scale, rampIn, rampOut }
    hitStop(dur = 0.08, scale = 0.04) {
      c._effects.push({ kind: 'hitstop', t: 0, dur, scale, rampIn: 0, rampOut: Math.min(0.06, dur * 0.5) });
    },
    slowMo(dur = 1.2, scale = 0.35, rampIn = 0.12, rampOut = 0.35) {
      c._effects.push({ kind: 'slowmo', t: 0, dur, scale, rampIn, rampOut });
    },
    clearEffects() { c._effects.length = 0; c.scale = 1; },
    // advance by a real delta; returns the sim delta to integrate
    advance(realDt) {
      c.realT += realDt;
      let s = 1;
      for (let i = c._effects.length - 1; i >= 0; i--) {
        const e = c._effects[i];
        e.t += realDt;
        if (e.t >= e.dur) { c._effects.splice(i, 1); continue; }
        let k = 1;
        if (e.rampIn > 0 && e.t < e.rampIn) k = e.t / e.rampIn;
        else if (e.rampOut > 0 && e.t > e.dur - e.rampOut) k = (e.dur - e.t) / e.rampOut;
        const v = 1 + (e.scale - 1) * clamp(k, 0, 1);
        s = Math.min(s, v);
      }
      c.scale = s;
      return c.paused ? 0 : realDt * c.speed * s;
    },
  };
  return c;
}
