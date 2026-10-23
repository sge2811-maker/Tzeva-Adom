// Environment & lighting stream: sky, terrain, town, airbase, distant lights, batteries, crowd,
// lighting, fog and the post-processing pipeline (AO, bloom, grade, tone mapping, AA).
// Provides ctx.render (the frame) and ctx.lights.flash (transient explosion light).
import * as THREE from 'three';
import { EffectComposer, RenderPass, EffectPass, BloomEffect, ToneMappingEffect, ToneMappingMode, VignetteEffect, NoiseEffect, BlendFunction, SMAAEffect, SMAAPreset } from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import { createSky, MOON_DIR } from './sky.js';
import { createTerrain } from './terrain.js';
import { createCity } from './city.js';
import { createAirbase } from './airbase.js';
import { createDistant } from './distant.js';
import { createBatteries } from './batteries.js';
import { createCrowd } from './crowd.js';
import { GradeEffect, LookEffect } from './grade.js';
import { installAtmosphere, ATM } from './atmosphere.js';

export function create(ctx) {
  const { scene, renderer, camera, quality } = ctx;
  scene.background = null;
  const fog = installAtmosphere(scene);

  // ---------------------------------------------------------------- lighting
  // Moonlight: a low waxing crescent in the west. Silver, not saturated blue, so the desert
  // keeps its sand/rock hue; a weak cool sky fill from the zenith-east models the escarpment.
  const moon = new THREE.DirectionalLight(new THREE.Color().setRGB(0.82, 0.85, 0.95), 1.05);
  moon.position.copy(MOON_DIR).multiplyScalar(8000);
  scene.add(moon, moon.target);
  const fill = new THREE.DirectionalLight(new THREE.Color().setRGB(0.55, 0.65, 0.9), 0.22);
  fill.position.set(3000, 8000, -1500);
  scene.add(fill, fill.target);
  const hemi = new THREE.HemisphereLight(new THREE.Color().setRGB(0.22, 0.26, 0.34), new THREE.Color().setRGB(0.12, 0.09, 0.06), 0.6);
  scene.add(hemi);
  // flash lights: a fixed pool of point lights reused for launches/intercepts/impacts. They stay
  // in the scene at intensity 0 (toggling visibility changes the light count and recompiles every
  // material, which is a hitch on real GPUs).
  const pool = [];
  const flashCol = new THREE.Color(0, 0, 0), hemiBase = new THREE.Color().setRGB(0.22, 0.26, 0.34);
  const nPool = Math.max(2, Math.min(6, quality.s.lightsMax | 0));
  for (let i = 0; i < nPool; i++) { const l = new THREE.PointLight(0xffa860, 0, 1, 2); l.userData = { t: 1, dur: 1, power: 0, on: false }; scene.add(l); pool.push(l); }
  ctx.lights = {
    // world position, colour [r,g,b], peak intensity (candela-ish), radius (m), duration (s)
    flash(pos, color = [1, 0.7, 0.4], intensity = 2e6, radius = 4000, dur = 0.6) {
      const max = Math.min(pool.length, quality.s.lightsMax | 0 || pool.length);
      const live = pool.slice(0, max);
      // reuse an idle light, else the one whose remaining energy is lowest
      let l = live.find((q) => !q.userData.on) || live.reduce((a, b) => (a.userData.power * (1 - a.userData.t / a.userData.dur) < b.userData.power * (1 - b.userData.t / b.userData.dur) ? a : b));
      l.position.set(pos.x, pos.y, pos.z); l.color.setRGB(color[0], color[1], color[2]);
      l.distance = radius; l.decay = pos.y > 1000 ? 1.0 : 2.0; l.userData = { t: 0, dur, power: pos.y > 1000 ? intensity / Math.max(1, Math.min(4000, pos.y)) : intensity, on: true, sky: Math.min(2.5, intensity / 4e6), col: color }; l.intensity = l.userData.power;
      flashCol.r += color[0] * l.userData.sky; flashCol.g += color[1] * l.userData.sky; flashCol.b += color[2] * l.userData.sky;
      flashCol.r = Math.min(flashCol.r, 2); flashCol.g = Math.min(flashCol.g, 2); flashCol.b = Math.min(flashCol.b, 2);
      sky.flash(pos, Math.min(3, intensity / 1.5e6), color);
    },
  };
  // night light levels for other streams (VFX smoke should be lit by these, not emissive)
  ctx.envLight = { ambient: new THREE.Color().setRGB(0.050, 0.056, 0.072), moon: moon.color.clone().multiplyScalar(0.09), fog: fog.color, flash: 0 };

  const sky = createSky(ctx);
  const terrain = createTerrain(ctx);
  const city = createCity(ctx);
  createAirbase(ctx);
  createDistant(ctx);
  const batteries = createBatteries(ctx);
  const crowd = createCrowd(ctx);

  // ---------------------------------------------------------------- post-processing
  const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 0 });
  composer.addPass(new RenderPass(scene, camera));
  let ao = null;
  const buildAO = () => {
    if (!quality.s.ao) return null;
    const p = new N8AOPostPass(scene, camera, ctx.size.w, ctx.size.h);
    Object.assign(p.configuration, { aoRadius: 5, distanceFalloff: 1.2, intensity: 2.2, halfRes: quality.s.aoHalfRes, aoSamples: quality.s.aoSamples, denoiseSamples: 4, denoiseRadius: 8, color: new THREE.Color(0, 0, 0), gammaCorrection: false });
    return p;
  };
  ao = buildAO();
  if (ao) composer.addPass(ao);
  const bloom = new BloomEffect({ mipmapBlur: true, luminanceThreshold: 0.85, luminanceSmoothing: 0.35, intensity: 0.85, radius: 0.72, levels: 6 });
  const grade = new GradeEffect();
  const tone = new ToneMappingEffect({ mode: ToneMappingMode.AGX });
  const look = new LookEffect();
  const vignette = new VignetteEffect({ offset: 0.3, darkness: 0.58 });
  const noise = new NoiseEffect({ premultiply: true, blendFunction: BlendFunction.SCREEN });
  noise.blendMode.opacity.value = quality.s.grain ? 0.10 : 0;
  composer.addPass(new EffectPass(camera, bloom, grade, tone, look, vignette, noise));
  let smaaPass = null;
  if (quality.s.aa === 'smaa') { smaaPass = new EffectPass(camera, new SMAAEffect({ preset: SMAAPreset.HIGH })); composer.addPass(smaaPass); }

  let lastDt = 1 / 60;
  ctx.render = () => composer.render(lastDt);
  ctx.post = { composer, bloom, grade, tone, look, vignette, noise, ao };

  const glowMats = [];
  const collectGlow = () => { glowMats.length = 0; scene.traverse((o) => { if (o.material && o.material.userData && o.material.userData.glowPoints) glowMats.push(o.material); }); };
  collectGlow();
  ctx.bus.on('battery:built', () => setTimeout(collectGlow, 0));
  const updateGlowScale = () => {
    const s = (ctx.size.h * ctx.size.dpr) / (2 * Math.tan((camera.fov * Math.PI) / 360));
    for (const m of glowMats) m.uniforms.uScale.value = s;
  };

  // red alert grade follows the siren
  let red = 0;
  return {
    sky, terrain, city,
    resize(w, h, dpr) {
      composer.setSize(w, h);
      if (ao) ao.setSize(w * dpr, h * dpr);
      updateGlowScale();
    },
    update(dt) {
      lastDt = dt;
      const t = ctx.clock.realT;
      sky.update(dt, t);
      terrain.update(dt, t);
      city.update(dt, t);
      batteries.update(dt);
      crowd.update(dt);
      updateGlowScale();
      let flashSum = 0;
      for (const l of pool) {
        if (!l.userData.on) continue;
        l.userData.t += dt;
        const k = 1 - l.userData.t / l.userData.dur;
        if (k <= 0) { l.userData.on = false; l.intensity = 0; continue; }
        l.intensity = l.userData.power * k * k;
        flashSum += l.intensity / Math.max(1, l.position.distanceToSquared(camera.position));
      }
      ctx.envLight.flash = flashSum;
      // big flashes light the whole scene from above for a beat (roofs, upper walls, terrain)
      flashCol.multiplyScalar(Math.exp(-dt * 5));
      hemi.color.setRGB(hemiBase.r + flashCol.r * 0.6, hemiBase.g + flashCol.g * 0.6, hemiBase.b + flashCol.b * 0.6);
      terrain.flashU.uFlashSky.value.copy(flashCol).multiplyScalar(0.05);
      const wantRed = ctx.sim.phase === 'alert' ? 0.55 : 0;
      red += (Math.max(wantRed, ctx.fx.red) - red) * Math.min(1, dt * 2);
      grade.uniforms.get('uRed').value = red;
      grade.uniforms.get('uFlash').value = ctx.fx.flash;
      grade.uniforms.get('uExposure').value = ctx.fx.exposure;
      grade.uniforms.get('uDesat').value = ctx.fx.desat;
      grade.uniforms.get('uTime').value = t;
    },
  };
}
