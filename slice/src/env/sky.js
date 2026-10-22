// Night sky dome: gradient, light-pollution domes, stars, milky way, waxing crescent moon (low in
// the west at 23:00 on 13 April 2024), and up to 4 transient flash sources from intercepts.
import * as THREE from 'three';
import { ATM_GLSL, ATM } from './atmosphere.js';

export const MOON_DIR = new THREE.Vector3(-0.83, 0.26, 0.18).normalize();

export function createSky(ctx) {
  const flashes = Array.from({ length: 4 }, () => ({ dir: new THREE.Vector3(0, 1, 0), i: 0, c: new THREE.Color(1, 0.8, 0.6), decay: 3 }));
  const uniforms = {
    uTime: { value: 0 },
    uMoon: { value: MOON_DIR },
    uFlashDir: { value: flashes.map((f) => f.dir) },
    uFlashI: { value: [0, 0, 0, 0] },
    uFlashC: { value: flashes.map((f) => f.c) },
    uGlobalFlash: { value: 0 },
    uFogC: { value: ATM.fog },
  };
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false, uniforms,
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vDir;
      uniform float uTime; uniform vec3 uMoon;
      uniform vec3 uFlashDir[4]; uniform float uFlashI[4]; uniform vec3 uFlashC[4]; uniform float uGlobalFlash;
      float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float n2(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
        float a = fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5453), b = fract(sin(dot(i + vec2(1, 0), vec2(127.1, 311.7))) * 43758.5453);
        float c = fract(sin(dot(i + vec2(0, 1), vec2(127.1, 311.7))) * 43758.5453), d = fract(sin(dot(i + vec2(1, 1), vec2(127.1, 311.7))) * 43758.5453);
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y); }
      vec3 dome(vec3 d, vec3 to, float w, float h) { float a = max(dot(normalize(vec3(d.x, 0.0, d.z)), to), 0.0); return vec3(1.0, 0.62, 0.34) * pow(a, w) * exp(-max(d.y, 0.0) * h); }
      uniform vec3 uFogC;
      ${ATM_GLSL}
      void main() {
        vec3 d = normalize(vDir);
        float y = d.y;
        // space above the haze: deep blue-black with a slight lift toward the horizon
        vec3 zen = vec3(0.0018, 0.0030, 0.0072);
        vec3 col = mix(vec3(0.010, 0.014, 0.024), zen, smoothstep(0.0, 0.6, y));
        // distant light-pollution domes beyond the map: Be'er Sheva (west), Dimona (south), Karak (east)
        vec3 lp = dome(d, normalize(vec3(-1.0, 0.0, 0.08)), 7.0, 7.0) * 0.050
                + dome(d, normalize(vec3(-0.25, 0.0, 1.0)), 10.0, 11.0) * 0.016
                + dome(d, normalize(vec3(1.0, 0.0, 0.08)), 16.0, 14.0) * 0.008;
        lp *= 1.0 - 0.6 * smoothstep(0.35, 0.95, uGlobalFlash);
        // stars, fading toward the hazy, light-polluted horizon
        vec3 p = d * 420.0; vec3 ip = floor(p); float h = h3(ip);
        if (h > 0.9955) {
          vec3 f = fract(p) - 0.5; float s = smoothstep(0.22, 0.0, length(f));
          float tw = 0.7 + 0.3 * sin(uTime * (1.5 + h * 3.0) + h * 90.0);
          float vis = smoothstep(0.03, 0.35, y) * (1.0 - 0.6 * smoothstep(0.0, 0.03, length(lp)));
          col += mix(vec3(1.0, 0.86, 0.72), vec3(0.75, 0.84, 1.0), fract(h * 37.0)) * s * tw * (h - 0.9955) * 260.0 * vis;
        }
        // milky way (faint)
        float band = exp(-pow(dot(d, normalize(vec3(0.35, 0.45, -0.82))) * 3.6, 2.0));
        col += vec3(0.010, 0.011, 0.016) * band * smoothstep(0.08, 0.5, y) * (0.5 + 0.8 * n2(d.xz * 28.0 + d.y * 9.0));
        // waxing crescent moon (~27% lit)
        float md = dot(d, uMoon);
        float disc = smoothstep(0.99962, 0.99978, md);
        vec3 sh = normalize(uMoon + vec3(0.0105, 0.0035, 0.0));
        float lit = 1.0 - smoothstep(0.99966, 0.99980, dot(d, sh));
        col += vec3(1.25, 1.18, 1.02) * disc * lit * 4.0 + vec3(0.03, 0.035, 0.05) * disc * (1.0 - lit);
        col += vec3(0.045, 0.05, 0.07) * pow(max(md, 0.0), 300.0) + vec3(0.01, 0.012, 0.018) * pow(max(md, 0.0), 18.0);
        // intercept flashes light the sky around them
        for (int i = 0; i < 4; i++) {
          float a = max(dot(d, uFlashDir[i]), 0.0);
          col += uFlashC[i] * uFlashI[i] * (pow(a, 400.0) * 3.0 + pow(a, 24.0) * 0.25 + pow(a, 3.0) * 0.03);
        }
        col += vec3(0.05, 0.045, 0.05) * uGlobalFlash * (0.4 + 0.6 * smoothstep(-0.1, 0.4, y));
        // the same haze that fogs the terrain, integrated to the horizon: the land melts into it
        vec3 rd = vec3(d.x, max(d.y, -0.02), d.z);
        float od = atmOD(cameraPosition, rd, 60000.0);
        col = mix(col, atmInscatter(cameraPosition, rd, 60000.0, uFogC), 1.0 - exp(-od)) + lp;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), mat);
  mesh.renderOrder = -1000;
  mesh.frustumCulled = false;
  mesh.onBeforeRender = (r, s, cam) => { mesh.position.copy(cam.position); mesh.updateMatrixWorld(); };
  ctx.scene.add(mesh);

  const tmp = new THREE.Vector3();
  return {
    mesh, uniforms,
    // add a flash seen from the camera's position at world point p
    flash(p, intensity = 1, color = [1, 0.8, 0.6], decay = 3) {
      let f = flashes.reduce((a, b) => (a.i < b.i ? a : b));
      tmp.set(p.x, p.y, p.z).sub(ctx.camera.position).normalize();
      f.dir.copy(tmp); f.i = intensity; f.c.setRGB(color[0], color[1], color[2]); f.decay = decay;
      uniforms.uGlobalFlash.value = Math.min(1.5, uniforms.uGlobalFlash.value + intensity * 0.12);
    },
    update(dt, t) {
      uniforms.uTime.value = t;
      for (let i = 0; i < 4; i++) { flashes[i].i *= Math.exp(-dt * flashes[i].decay); uniforms.uFlashI.value[i] = flashes[i].i; }
      uniforms.uGlobalFlash.value *= Math.exp(-dt * 4);
    },
  };
}
