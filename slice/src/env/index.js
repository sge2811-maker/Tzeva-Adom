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

export function create(ctx) {
  const { scene, renderer, camera, quality } = ctx;
  scene.background = null;
  scene.fog = new THREE.FogExp2(0x0b1119, 0.000032);

  // ---------------------------------------------------------------- lighting
  const moon = new THREE.DirectionalLight(0xa9bbff, 1.1);
  moon.position.copy(MOON_DIR).multiplyScalar(8000);
  scene.add(moon, moon.target);
  const hemi = new THREE.HemisphereLight(0x2a3d63, 0x1a130c, 1.6);
  scene.add(hemi);
  // flash lights: a small pool of point lights reused for explosions/intercepts near the camera
  const pool = [];
  for (let i = 0; i < 6; i++) { const l = new THREE.PointLight(0xffa860, 0, 1, 2); l.visible = false; l.userData = { t: 0, dur: 1, power: 0 }; scene.add(l); pool.push(l); }
  ctx.lights = {
    // world position, colour [r,g,b], peak intensity (candela-ish), radius (m), duration (s)
    flash(pos, color = [1, 0.7, 0.4], intensity = 2e6, radius = 4000, dur = 0.6) {
      const max = quality.s.lightsMax;
      let l = pool.slice(0, max).find((q) => !q.visible) || pool.slice(0, max).reduce((a, b) => (a.userData.t / a.userData.dur > b.userData.t / b.userData.dur ? a : b));
      l.position.set(pos.x, pos.y, pos.z); l.color.setRGB(color[0], color[1], color[2]);
      l.distance = radius; l.userData = { t: 0, dur, power: intensity }; l.intensity = intensity; l.visible = true;
      sky.flash(pos, Math.min(3, intensity / 1.5e6), color);
    },
  };

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
  const bloom = new BloomEffect({ mipmapBlur: true, luminanceThreshold: 0.55, luminanceSmoothing: 0.3, intensity: 1.25, radius: 0.78, levels: 7 });
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
      for (const l of pool) {
        if (!l.visible) continue;
        l.userData.t += dt;
        const k = 1 - l.userData.t / l.userData.dur;
        if (k <= 0) { l.visible = false; l.intensity = 0; continue; }
        l.intensity = l.userData.power * k * k;
      }
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
