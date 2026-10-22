// Terrain: one warped grid (dense around Arad, ~1.2 degree angular resolution further out),
// heights from world/geo.js. Night desert palette, town light-pollution glow on the ground,
// and the Dead Sea surface.
import * as THREE from 'three';
import { heightAt, GEO } from '../world/geo.js';
import { fbm, smoothstep } from '../core/util.js';
import { ATM_GLSL, ATM } from './atmosphere.js';

export function createTerrain(ctx) {
  const N = 520, L = 62000, S = 5.0;
  const warp = (u) => Math.sign(u) * L * (Math.exp(S * Math.abs(u)) - 1) / (Math.exp(S) - 1);
  const pos = new Float32Array((N + 1) * (N + 1) * 3);
  const col = new Float32Array((N + 1) * (N + 1) * 3);
  const glow = new Float32Array((N + 1) * (N + 1));
  let k = 0;
  for (let j = 0; j <= N; j++) {
    const z = warp(j / N * 2 - 1);
    for (let i = 0; i <= N; i++, k++) {
      const x = warp(i / N * 2 - 1);
      const h = heightAt(x, z);
      pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
      // night desert: dark ochre sand, greyer rock on the escarpment and Moab, salt near the sea
      const n = fbm(x * 0.002 + 3, z * 0.002, 3), n2 = fbm(x * 0.0003, z * 0.0003 + 7, 3);
      let r = 0.33 + 0.10 * n, g = 0.28 + 0.08 * n, b = 0.22 + 0.06 * n;
      const urb = Math.exp(-((x / 900) ** 2 + (z / 780) ** 2) * 1.6);
      r = r * (1 - urb * 0.35) + 0.30 * urb * 0.35; g = g * (1 - urb * 0.35) + 0.28 * urb * 0.35; b = b * (1 - urb * 0.35) + 0.25 * urb * 0.35;
      const rock = smoothstep(2600, 6000, x) * (1 - smoothstep(15000, 17000, x)) + smoothstep(16500, 19000, x) * 0.6;
      r = r * (1 - rock * 0.35) + 0.22 * rock * (0.8 + 0.4 * n2); g = g * (1 - rock * 0.35) + 0.19 * rock; b = b * (1 - rock * 0.35) + 0.16 * rock;
      if (h < -390 && x > 7000) { r = 0.42; g = 0.40; b = 0.36; } // salt flats at the shore
      col[k * 3] = r; col[k * 3 + 1] = g; col[k * 3 + 2] = b;
      // light pollution from the town and the airbase onto the ground
      const dt = Math.hypot(x / GEO.town.rx, z / GEO.town.rz), dn = Math.hypot(x - GEO.nevatim.x, z - GEO.nevatim.z) / GEO.nevatim.r;
      glow[k] = Math.exp(-dt * dt * 0.9) * 1.0 + Math.exp(-dn * dn * 1.2) * 0.35;
    }
  }
  const idx = new Uint32Array(N * N * 6);
  let q = 0;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
    idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('glow', new THREE.BufferAttribute(glow, 1));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float glow; varying float vGlow; varying vec3 vWP;')
      .replace('#include <common>', '#include <common>\nvarying vec3 vWN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = glow; vWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vGlow; varying vec3 vWP; varying vec3 vWN;
        float tH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float tN(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f); return mix(mix(tH(i), tH(i + vec2(1, 0)), u.x), mix(tH(i + vec2(0, 1)), tH(i + vec2(1, 1)), u.x), u.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float dcam = length(vWP - cameraPosition);
        float slope = 1.0 - clamp(normalize(vWN).y, 0.0, 1.0);
        float m1 = tN(vWP.xz * 0.0035), m2 = tN(vWP.xz * 0.021 + 7.0), m3 = tN(vWP.xz * 0.11 + 3.0);
        // cliff bands: steep ground turns to banded limestone/chalk with darker ledges
        float rockK = smoothstep(0.16, 0.40, slope + (m2 - 0.5) * 0.18);
        float strata = 0.72 + 0.28 * smoothstep(-0.3, 0.6, sin(vWP.y * 0.36 + m1 * 7.0 + m3 * 1.5));
        vec3 rock = vec3(0.30, 0.27, 0.235) * strata * (0.78 + 0.4 * m2);
        vec3 col = mix(diffuseColor.rgb, rock, rockK);
        // flat ground: pale gravel fans and darker reg/scrub patches
        float flatK = 1.0 - smoothstep(0.03, 0.12, slope);
        col *= mix(1.0, 0.82 + 0.36 * smoothstep(0.35, 0.75, m2 * 0.6 + m1 * 0.4), flatK);
        // close-up detail, faded with distance so it never shimmers far away
        float det = tN(vWP.xz * 0.08) * 0.45 + tN(vWP.xz * 0.6) * 0.35 + tN(vWP.xz * 3.1) * 0.2;
        float fade = 1.0 - smoothstep(600.0, 7000.0, dcam);
        col *= mix(1.0, 0.76 + 0.48 * det, fade);
        diffuseColor.rgb = col;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(1.0, 0.55, 0.24) * vGlow * vGlow * 0.10 * diffuseColor.rgb;`);
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'terrain';
  ctx.scene.add(mesh);

  // Dead Sea
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(14000, 90000, 1, 1).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uFogC: { value: ATM.fog } }]),
    vertexShader: /* glsl */`
      #include <fog_pars_vertex>
      varying vec3 vWP;
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWP = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <fog_pars_fragment>
      varying vec3 vWP; uniform float uTime; uniform vec3 uFogC;
      ${ATM_GLSL}
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), u.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), u.x), u.y); }
      void main() {
        vec3 V = normalize(cameraPosition - vWP);
        vec2 p = vWP.xz * 0.004;
        float w = n(p + uTime * 0.05) * 0.6 + n(p * 3.1 - uTime * 0.07) * 0.4;
        vec3 N = normalize(vec3((w - 0.5) * 0.05, 1.0, (n(p * 2.0 + 3.0) - 0.5) * 0.05));
        vec3 R = reflect(-V, N); R.y = abs(R.y);
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
        // the still, dense brine mirrors the hazy sky, the moon and the shore lights
        vec3 skyR = atmInscatter(vWP, R, 60000.0, uFogC) * (1.0 - exp(-atmOD(vWP, R, 60000.0)));
        vec3 col = vec3(0.004, 0.007, 0.010) + skyR * (0.35 + 0.65 * fres) * 1.4;
        col += vec3(0.9, 0.95, 1.1) * pow(max(dot(R, ATM_MOON), 0.0), 500.0) * 3.0;
        // glitter of shore lights: Ein Bokek hotels, Route 90
        float sh = smoothstep(9600.0, 9700.0, vWP.x) * (1.0 - smoothstep(10600.0, 11800.0, vWP.x));
        col += vec3(1.0, 0.6, 0.3) * sh * 0.010 * smoothstep(0.55, 0.9, n(vWP.xz * vec2(0.002, 0.05) + uTime * 0.2));
        // southern basin: evaporation ponds with pale salt dikes
        float pond = smoothstep(13000.0, 14000.0, vWP.z);
        vec2 g = abs(fract(vWP.xz / vec2(1300.0, 950.0)) - 0.5);
        float dike = 1.0 - smoothstep(0.47, 0.49, max(g.x, g.y));
        vec3 pc = mix(vec3(0.030, 0.040, 0.042), vec3(0.11, 0.105, 0.095), 1.0 - dike);
        col = mix(col, pc + skyR * 0.25, pond);
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }`,
  }));
  sea.position.set((GEO.deadSea.x0 + GEO.deadSea.x1) / 2 + 1500, GEO.deadSea.level, 0);
  sea.name = 'deadsea';
  ctx.scene.add(sea);

  return {
    mesh, sea,
    update(dt, t) { sea.material.uniforms.uTime.value = t; },
  };
}
