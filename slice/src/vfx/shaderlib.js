// Shared GLSL for VFX materials: cheap value noise / fbm, VFX light set (up to 8 dynamic point
// lights picked each frame from explosions, fires and the town glow), moonlight and fog terms.
// The uniform objects in `createShared()` are shared by every VFX material (one update per frame).
import * as THREE from 'three';

export const NL = 8;

export const NOISE = /* glsl */`
float vh(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(vh(i), vh(i + vec2(1.0, 0.0)), u.x), mix(vh(i + vec2(0.0, 1.0)), vh(i + vec2(1.0, 1.0)), u.x), u.y); }
float fbm3(vec2 p) { return vn(p) * 0.55 + vn(p * 2.07 + 17.3) * 0.3 + vn(p * 4.13 + 41.7) * 0.15; }
`;

export const LIGHTS = /* glsl */`
#define NL ${NL}
uniform vec4 uLP[NL]; uniform vec3 uLC[NL];
uniform vec3 uAmb; uniform vec3 uMoonC; uniform vec3 uMoonV; uniform vec3 uFogC; uniform float uFogD;
vec3 vfxLight(vec3 wp, out vec3 ldir) {
  vec3 acc = vec3(0.0), ds = vec3(0.0);
  for (int i = 0; i < NL; i++) {
    vec3 L = uLP[i].xyz - wp; float d2 = dot(L, L); float r2 = uLP[i].w * uLP[i].w;
    float k = r2 / (r2 + d2); k *= k;
    vec3 c = uLC[i] * k; acc += c; ds += L * inversesqrt(d2 + 1.0) * (c.r + c.g + c.b);
  }
  ldir = ds / (length(ds) + 1e-5);
  return acc;
}
// exponential-squared fog like the scene's, thinning with altitude (high intercepts stay crisp)
float vfxFog(float dist, float wy) { float f = dist * uFogD; return (1.0 - exp(-f * f)) * (1.0 - smoothstep(1500.0, 14000.0, wy)); }
`;

export function createShared() {
  const LP = [], LC = [];
  for (let i = 0; i < NL; i++) { LP.push(new THREE.Vector4(0, -1e6, 0, 1)); LC.push(new THREE.Vector3()); }
  return {
    uLP: { value: LP }, uLC: { value: LC },
    uAmb: { value: new THREE.Color(0.060, 0.066, 0.085) },
    uMoonC: { value: new THREE.Color(0.060, 0.066, 0.082) },
    uMoonV: { value: new THREE.Vector3(0, 1, 0) },
    uFogC: { value: new THREE.Color(0.006, 0.010, 0.016) },
    uFogD: { value: 0.000032 },
    uScale: { value: 800 },
    uTime: { value: 0 },
  };
}
