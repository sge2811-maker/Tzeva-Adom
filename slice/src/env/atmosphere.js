// Shared night atmosphere: exponential height fog (dense in the Dead Sea rift, thin on the
// plateau), cool moonlit haze with forward scatter toward the moon, and warm in-scatter from
// the town and airbase lights (the light-pollution dome). The same GLSL is used by the fog
// chunk (every fogged material), the sky dome (so terrain melts into the horizon) and the
// light sprites (distant lights dim and warm with distance).
import * as THREE from 'three';

export const ATM = {
  fog: new THREE.Color().setRGB(0.020, 0.025, 0.036), // linear haze colour
  density: 1.0,                                        // global multiplier (scene.fog.density)
};

// GLSL: needs `cameraPosition`. All distances in metres.
export const ATM_GLSL = /* glsl */`
#ifndef ATM_DEFINED
#define ATM_DEFINED
#define ATM_D0 (1.0 / 95000.0)
#define ATM_D1 (1.0 / 21000.0)
#define ATM_B (1.0 / 560.0)
#define ATM_B0 (1.0 / 4500.0)
const vec3 ATM_MOON = vec3(-0.9345, 0.2927, 0.2027);
float atmLayer(float y, float ry, float dist, float B) {
  float base = exp(-B * clamp(y, -600.0, 30000.0));
  float dy = ry * dist * B;
  float k = abs(dy) > 1e-4 ? (1.0 - exp(-clamp(dy, -12.0, 60.0))) / dy : 1.0;
  return base * k;
}
// a third, dense layer pooled in the Dead Sea rift (below the plateau): the luminous band that
// separates the plateau edge from Moab even when the rift floor is hidden
#define ATM_D2 (1.0 / 2600.0)
#define ATM_B2 (1.0 / 260.0)
float atmOD(vec3 ro, vec3 rd, float dist) {
  float rift = smoothstep(4000.0, 9000.0, ro.x + rd.x * dist * 0.5) * (1.0 - smoothstep(20000.0, 26000.0, ro.x + rd.x * dist * 0.5));
  return dist * (ATM_D0 * atmLayer(ro.y, rd.y, dist, ATM_B0) + ATM_D1 * atmLayer(ro.y, rd.y, dist, ATM_B)
       + ATM_D2 * atmLayer(ro.y + 330.0, rd.y, dist, ATM_B2) * (0.25 + 0.75 * rift));
}
float atmGlowAt(vec3 p) {
  vec2 a = p.xz / vec2(900.0, 780.0);
  vec2 n = (p.xz - vec2(-6800.0, 2900.0)) / vec2(2300.0, 1900.0);
  vec2 d = (p.xz - vec2(-3600.0, 13800.0)) / 1700.0;
  vec2 e = (p.xz - vec2(10100.0, 9200.0)) / 1100.0;
  float g = exp(-dot(a, a) * 0.8) + exp(-dot(n, n) * 1.1) * 0.55 + exp(-dot(d, d)) * 0.35 + exp(-dot(e, e)) * 0.25;
  return g * exp(-max(p.y + 60.0, 0.0) / 380.0);
}
vec3 atmInscatter(vec3 ro, vec3 rd, float dist, vec3 fogC) {
  float mu = max(dot(rd, ATM_MOON), 0.0);
  vec3 c = fogC * (1.0 + 0.35 * mu * mu + 0.6 * pow(mu, 24.0)) * (1.0 + 0.5 * exp(-max(ro.y + rd.y * min(dist, 9000.0) * 0.5 + 300.0, 0.0) / 400.0));
  float L = min(dist, 26000.0), g = 0.0;
  for (int i = 0; i < 6; i++) { float t = (float(i) + 0.5) / 6.0; g += atmGlowAt(ro + rd * (L * t * t)); }
  c += vec3(1.0, 0.52, 0.24) * (g / 6.0) * 0.13;
  return c;
}
#endif
`;

export function installAtmosphere(scene) {
  const C = THREE.ShaderChunk;
  C.fog_pars_vertex = '#ifdef USE_FOG\n\tvarying float vFogDepth;\n\tvarying vec3 vFogRel;\n#endif';
  C.fog_vertex = '#ifdef USE_FOG\n\tvFogDepth = - mvPosition.z;\n\tvFogRel = (vec4(mvPosition.xyz, 0.0) * viewMatrix).xyz;\n#endif';
  C.fog_pars_fragment = `#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	varying vec3 vFogRel;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
${ATM_GLSL}
#endif`;
  C.fog_fragment = `#ifdef USE_FOG
	float fogDist = length(vFogRel);
	vec3 fogRd = vFogRel / max(fogDist, 1e-3);
	#ifdef FOG_EXP2
		float fogMul = fogDensity;
	#else
		float fogMul = 1.0;
	#endif
	float fogFactor = 1.0 - exp(-atmOD(cameraPosition, fogRd, fogDist) * fogMul);
	gl_FragColor.rgb = mix(gl_FragColor.rgb, atmInscatter(cameraPosition, fogRd, fogDist, fogColor), fogFactor);
#endif`;
  scene.fog = new THREE.FogExp2(ATM.fog.clone(), ATM.density);
  return scene.fog;
}

// Light-pollution haze domes: ground-hugging ellipsoids of warm scattered light over Arad and
// Nevatim, seen from outside (fades out as the camera enters). The chord through the ellipsoid
// is integrated analytically (density 1 - r^2), so the glow is soft and volumetric-looking.
export function createGlowDomes(ctx) {
  const domes = [];
  const mk = (cx, cy, cz, rx, ry, rz, gain) => {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { uC: { value: new THREE.Vector3(cx, cy, cz) }, uR: { value: new THREE.Vector3(rx, ry, rz) }, uGain: { value: gain } },
      vertexShader: /* glsl */`
        varying vec3 vW;
        void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */`
        uniform vec3 uC; uniform vec3 uR; uniform float uGain; varying vec3 vW;
        ${ATM_GLSL}
        void main() {
          vec3 o = (cameraPosition - uC) / uR, d = normalize((vW - cameraPosition) / uR);
          float b = dot(o, d), c = dot(o, o) - 1.0, disc = b * b - c;
          if (disc <= 0.0) discard;
          float h = sqrt(disc);                       // half chord in unit-sphere space
          float t0 = max(-b - h, 0.0), t1 = -b + h;
          vec3 m = o + d * (t0 + t1) * 0.5;
          float g = h * h * h * exp(-max(m.y, 0.0) * 1.2);
          float camD = length((cameraPosition - uC).xz) / max(uR.x, uR.z);
          float outside = smoothstep(0.55, 1.4, camD);
          vec3 rel = uC - cameraPosition; float dist = length(rel);
          float tr = exp(-atmOD(cameraPosition, rel / max(dist, 1.0), dist));
          gl_FragColor = vec4(vec3(1.0, 0.56, 0.26) * g * uGain * outside * (0.35 + 0.65 * tr), 1.0);
        }`,
    });
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), mat);
    m.scale.set(rx, ry, rz); m.position.set(cx, cy, cz);
    m.frustumCulled = false; m.renderOrder = 4; m.name = 'glow-dome';
    ctx.scene.add(m); domes.push(m);
  };
  mk(0, -40, 0, 1500, 520, 1300, 0.045);
  mk(-6800, -190, 2900, 2600, 420, 2200, 0.022);
  return domes;
}
