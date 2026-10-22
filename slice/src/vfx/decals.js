// Scorch decals for ground impacts: one InstancedMesh (one draw call). Each decal is a quad laid
// on the terrain (tilted to the local slope), shaded as an fbm-edged charred crater with radial
// ejecta streaks and embers in the middle that cool over ~40 s.
import * as THREE from 'three';
import { NOISE } from './shaderlib.js';
import { groundAt } from '../world/geo.js';

export function createScorch(scene, shared, max = 48) {
  const geo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  const info = new Float32Array(max * 4); // seed, born, heat0, unused
  const aInfo = new THREE.InstancedBufferAttribute(info, 4).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aInfo', aInfo);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6,
    uniforms: { uTime: shared.uTime, uAmb: shared.uAmb },
    vertexShader: /* glsl */`
      attribute vec4 aInfo; varying vec2 vUv; varying vec4 vInfo;
      void main() { vUv = position.xz; vInfo = aInfo; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      varying vec2 vUv; varying vec4 vInfo; uniform float uTime; uniform vec3 uAmb;
      ${NOISE}
      void main() {
        float r = length(vUv); if (r > 1.0) discard;
        float sd = vInfo.x * 37.0;
        float n = fbm3(vUv * 2.6 + sd);
        float ang = atan(vUv.y, vUv.x);
        float streak = vn(vec2(ang * 5.5 + sd, 0.5)) * vn(vec2(ang * 13.0 - sd, 1.5));
        float edge = r + (n - 0.5) * 0.45;
        float core = smoothstep(0.62, 0.25, edge);
        float ejecta = smoothstep(1.0, 0.5, edge - streak * 0.35) * (0.35 + 0.65 * streak);
        float a = clamp(core * 0.92 + ejecta * 0.55, 0.0, 0.95);
        float age = max(0.0, uTime - vInfo.y);
        float heat = vInfo.z * exp(-age / 22.0);
        float emb = smoothstep(0.5, 0.05, edge) * pow(fbm3(vUv * 9.0 - sd), 3.0) * 6.0 * heat;
        emb *= 0.75 + 0.25 * sin(uTime * 3.0 + n * 20.0);
        vec3 col = vec3(0.020, 0.017, 0.014) + uAmb * 0.15 + vec3(2.6, 0.75, 0.16) * emb / max(a, 0.05);
        gl_FragColor = vec4(col, a);
      }`,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.count = 0; mesh.frustumCulled = false; mesh.renderOrder = 2;
  scene.add(mesh);
  const dummy = new THREE.Object3D(), up = new THREE.Vector3(0, 1, 0), nrm = new THREE.Vector3(), q = new THREE.Quaternion(), qy = new THREE.Quaternion();
  let next = 0;
  return {
    mesh,
    add(x, z, radius, seed, t, heat) {
      const i = next; next = (next + 1) % max; mesh.count = Math.max(mesh.count, i + 1);
      const e = radius * 0.5;
      const hx = groundAt(x + e, z) - groundAt(x - e, z), hz = groundAt(x, z + e) - groundAt(x, z - e);
      nrm.set(-hx / (2 * e), 1, -hz / (2 * e)).normalize();
      q.setFromUnitVectors(up, nrm); qy.setFromAxisAngle(up, seed * 6.283);
      dummy.position.set(x, groundAt(x, z) + 1.2, z);
      dummy.quaternion.copy(q).multiply(qy);
      dummy.scale.set(radius, 1, radius);
      dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
      info[i * 4] = seed; info[i * 4 + 1] = t; info[i * 4 + 2] = heat; info[i * 4 + 3] = 0;
      mesh.instanceMatrix.needsUpdate = true; aInfo.needsUpdate = true;
    },
  };
}
