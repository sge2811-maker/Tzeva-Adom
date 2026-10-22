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
float atmOD(vec3 ro, vec3 rd, float dist) {
  return dist * (ATM_D0 * atmLayer(ro.y, rd.y, dist, ATM_B0) + ATM_D1 * atmLayer(ro.y, rd.y, dist, ATM_B));
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
  vec3 c = fogC * (1.0 + 0.35 * mu * mu + 1.2 * pow(mu, 16.0));
  float L = min(dist, 26000.0), g = 0.0;
  for (int i = 0; i < 6; i++) { float t = (float(i) + 0.5) / 6.0; g += atmGlowAt(ro + rd * (L * t * t)); }
  c += vec3(1.0, 0.52, 0.24) * (g / 6.0) * 0.060;
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
