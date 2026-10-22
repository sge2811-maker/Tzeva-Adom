// Arad: streets, sidewalks, buildings (single merged mesh, procedural lit windows), rooftop
// solar water heaters, street lights (poles, glowing heads, light pools), palms, public shelters.
import * as THREE from 'three';
import { heightAt, GEO } from '../world/geo.js';
import { makeRng } from '../core/rng.js';

const TYPE_ID = { slab: 0, tower: 1, house: 2, commercial: 3 };

export function createCity(ctx) {
  const { scene, layout } = ctx;
  const rng = makeRng(ctx.params.seed, 'city');
  const group = new THREE.Group(); group.name = 'city'; scene.add(group);

  // ---------------------------------------------------------------- streets
  {
    const roadPos = [], walkPos = [];
    const quad = (arr, ax, az, bx, bz, w, lift) => {
      const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1, nx = -dz / L * w / 2, nz = dx / L * w / 2;
      const n = Math.max(1, Math.ceil(L / 25));
      for (let s = 0; s < n; s++) {
        const t0 = s / n, t1 = (s + 1) / n;
        const x0 = ax + dx * t0, z0 = az + dz * t0, x1 = ax + dx * t1, z1 = az + dz * t1;
        const p = [[x0 + nx, z0 + nz], [x0 - nx, z0 - nz], [x1 + nx, z1 + nz], [x1 - nx, z1 - nz]].map(([x, z]) => [x, heightAt(x, z) + lift, z]);
        arr.push(...p[0], ...p[2], ...p[1], ...p[1], ...p[2], ...p[3]);
      }
    };
    for (const e of layout.edges) {
      if (!e.on) continue;
      const A = layout.nodes[e.a], B = layout.nodes[e.b];
      quad(roadPos, A.x, A.z, B.x, B.z, e.w, 0.35);
      quad(walkPos, A.x, A.z, B.x, B.z, e.w + 7, 0.22);
    }
    for (const n of layout.nodes) {
      const w = Math.max(...n.adj.map((id) => (layout.edges[id].on ? layout.edges[id].w : 0)), 0);
      if (!w) continue;
      quad(roadPos, n.x - w / 2, n.z, n.x + w / 2, n.z, w, 0.36);
    }
    for (const r of layout.roads) {
      for (let i = 1; i < r.pts.length; i++) quad(roadPos, r.pts[i - 1][0], r.pts[i - 1][1], r.pts[i][0], r.pts[i][1], r.w, 0.6);
    }
    const mk = (arr, color, rough, order) => {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); g.computeVertexNormals();
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2 * order, polygonOffsetUnits: -2 * order }));
      m.renderOrder = order; group.add(m); return m;
    };
    mk(walkPos, 0x3b3833, 0.95, 1);
    mk(roadPos, 0x17181a, 0.8, 2);
  }

  // ---------------------------------------------------------------- buildings
  const B = layout.buildings;
  {
    const P = [], N = [], F = [], C = [];
    const wallCols = [[0.78, 0.74, 0.66], [0.82, 0.80, 0.74], [0.70, 0.64, 0.55], [0.86, 0.84, 0.80], [0.66, 0.62, 0.58], [0.74, 0.70, 0.62]];
    for (const b of B) {
      const base = b.y - 3, top = b.y + b.h, hw = b.w / 2, hd = b.d / 2;
      const c = Math.cos(b.rot), s = Math.sin(b.rot);
      const tr = (lx, lz) => [b.x + lx * c - lz * s, b.z + lx * s + lz * c];
      const wc = wallCols[Math.floor(b.seed * wallCols.length)];
      const tint = 0.9 + 0.2 * ((b.seed * 7.13) % 1);
      const col = wc.map((v) => v * tint);
      const floors = b.floors, type = TYPE_ID[b.type] ?? 0;
      const face = (p0, p1, nx, nz, uLen) => {
        const [x0, z0] = tr(...p0), [x1, z1] = tr(...p1);
        const v = [[x0, base, z0, 0, -3], [x1, base, z1, uLen, -3], [x0, top, z0, 0, b.h], [x1, top, z1, uLen, b.h]];
        const order = [0, 1, 2, 2, 1, 3];
        const wn = [nx * c - nz * s, 0, nx * s + nz * c];
        for (const o of order) { const q = v[o]; P.push(q[0], q[1], q[2]); N.push(...wn); F.push(q[3], q[4], b.seed * 97.0 + b.id, floors + type * 100); C.push(...col); }
      };
      face([-hw, hd], [hw, hd], 0, 1, b.w);
      face([hw, -hd], [-hw, -hd], 0, -1, b.w);
      face([hw, hd], [hw, -hd], 1, 0, b.d);
      face([-hw, -hd], [-hw, hd], -1, 0, b.d);
      // roof
      const r = [tr(-hw, -hd), tr(hw, -hd), tr(-hw, hd), tr(hw, hd)];
      for (const o of [0, 2, 1, 1, 2, 3]) { P.push(r[o][0], top, r[o][1]); N.push(0, 1, 0); F.push(0, b.h, b.seed * 97.0 + b.id, -1); C.push(col[0] * 0.55, col[1] * 0.55, col[2] * 0.55); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute('aFac', new THREE.Float32BufferAttribute(F, 4));
    g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.0 });
    const uniforms = { uTime: { value: 0 }, uWake: { value: 0 }, uWinGain: { value: 1.0 } };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 aFac; varying vec4 vFac;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFac = aFac;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec4 vFac; uniform float uTime; uniform float uWake; uniform float uWinGain;
          float bh(vec2 p) { return fract(sin(dot(p, vec2(41.31, 289.17))) * 15731.7431); }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          float wWin = 0.0; vec3 wEmit = vec3(0.0);
          if (vFac.w >= 0.0) {
            float type = floor(vFac.w / 100.0), floors = mod(vFac.w, 100.0);
            float fh = type == 1.0 ? 3.2 : (type == 2.0 ? 3.1 : 3.0);
            float sp = type == 3.0 ? 5.0 : (type == 2.0 ? 4.2 : 3.4);
            vec2 g = vec2(vFac.x / sp, (vFac.y - 0.4) / fh);
            vec2 id = floor(g); vec2 f = fract(g);
            float inF = step(0.0, id.y) * step(id.y, floors - 1.0);
            float ww = type == 3.0 && id.y < 0.5 ? 0.06 : 0.2;
            wWin = step(ww, f.x) * step(f.x, 1.0 - ww) * step(0.26, f.y) * step(f.y, 0.86) * inF;
            float r1 = bh(id + vFac.z), r2 = bh(id * 1.7 + vFac.z * 3.1), r3 = bh(id + vFac.z * 7.7 + 11.0);
            float litFrac = 0.30 + 0.38 * uWake * step(r3, 0.85) + (type == 3.0 && id.y < 0.5 ? 0.6 : 0.0);
            float lit = step(1.0 - litFrac, r1);
            vec3 warm = vec3(1.0, 0.62, 0.30), neutral = vec3(1.0, 0.85, 0.62), cool = vec3(0.62, 0.78, 1.0);
            vec3 wc = r2 < 0.55 ? warm : (r2 < 0.88 ? neutral : cool);
            float tv = r2 > 0.94 ? 0.65 + 0.35 * sin(uTime * (7.0 + r3 * 9.0) + r1 * 40.0) : 1.0;
            float curtain = 0.55 + 0.45 * smoothstep(0.25, 0.9, f.y) * (0.6 + 0.4 * r3);
            wEmit = wc * lit * wWin * tv * curtain * (0.7 + 1.6 * r3) * uWinGain;
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.035, 0.04, 0.05), wWin * 0.9);
            // grime streaks and floor lines
            diffuseColor.rgb *= 0.86 + 0.14 * smoothstep(0.0, 0.08, abs(f.y - 0.06));
          }`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance += wEmit * 2.4;
          // street lights wash the lower walls
          if (vFac.w >= 0.0) totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.6, 0.3) * 0.11 * exp(-max(vFac.y, 0.0) / 6.0);`);
    };
    const mesh = new THREE.Mesh(g, mat);
    mesh.name = 'buildings';
    group.add(mesh);
    ctx.envCity = { buildingUniforms: uniforms };
  }

  // ---------------------------------------------------------------- rooftop solar water heaters
  {
    const panels = [], tanks = [];
    for (const b of B) {
      if (b.type === 'commercial') continue;
      const n = b.type === 'house' ? 1 : b.type === 'tower' ? 2 : Math.max(2, Math.floor(b.w * b.d / 90));
      for (let i = 0; i < n; i++) {
        const lx = (rng.next() - 0.5) * (b.w - 4), lz = (rng.next() - 0.5) * (b.d - 4);
        panels.push([b.x + lx, b.y + b.h + 0.9, b.z + lz]);
        tanks.push([b.x + lx, b.y + b.h + 1.6, b.z + lz - 1.2]);
      }
    }
    const pg = new THREE.BoxGeometry(2.0, 0.08, 1.4); pg.rotateX(-0.55);
    const tg = new THREE.CylinderGeometry(0.32, 0.32, 1.8, 8); tg.rotateZ(Math.PI / 2);
    const pm = new THREE.InstancedMesh(pg, new THREE.MeshStandardMaterial({ color: 0x1b2433, roughness: 0.35, metalness: 0.6 }), panels.length);
    const tm = new THREE.InstancedMesh(tg, new THREE.MeshStandardMaterial({ color: 0xb8b6ae, roughness: 0.5, metalness: 0.3 }), tanks.length);
    const m4 = new THREE.Matrix4();
    panels.forEach((p, i) => { m4.makeTranslation(p[0], p[1], p[2]); pm.setMatrixAt(i, m4); });
    tanks.forEach((p, i) => { m4.makeTranslation(p[0], p[1], p[2]); tm.setMatrixAt(i, m4); });
    group.add(pm, tm);
  }

  // ---------------------------------------------------------------- street lights
  const lights = layout.lights;
  {
    const poleG = new THREE.CylinderGeometry(0.09, 0.13, 1, 6); poleG.translate(0, 0.5, 0);
    const poles = new THREE.InstancedMesh(poleG, new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 0.6, metalness: 0.5 }), lights.length);
    const m4 = new THREE.Matrix4();
    lights.forEach((l, i) => { m4.makeScale(1, l.h, 1).setPosition(l.x, l.y, l.z); poles.setMatrixAt(i, m4); });
    group.add(poles);
    // lamp heads: additive sprites with a world size and a minimum pixel size
    const P = new Float32Array(lights.length * 3), Cc = new Float32Array(lights.length * 3), Sz = new Float32Array(lights.length);
    lights.forEach((l, i) => {
      P[i * 3] = l.x + l.armX * 1.4; P[i * 3 + 1] = l.y + l.h; P[i * 3 + 2] = l.z + l.armZ * 1.4;
      const c = l.kind === 'led' ? [0.75, 0.85, 1.0] : [1.0, 0.58, 0.22];
      Cc[i * 3] = c[0] * 5; Cc[i * 3 + 1] = c[1] * 5; Cc[i * 3 + 2] = c[2] * 5; Sz[i] = 1.6;
    });
    group.add(makeGlowPoints(P, Cc, Sz, 1.5));
    // light pools on the ground
    const poolG = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const poolM = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uGain: { value: 1 } }]),
      vertexShader: /* glsl */`
        #include <fog_pars_vertex>
        attribute vec3 aCol; varying vec3 vCol; varying vec2 vUv;
        void main() { vUv = uv; vCol = aCol; vec4 mvPosition = viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */`
        #include <fog_pars_fragment>
        varying vec3 vCol; varying vec2 vUv; uniform float uGain;
        void main() { float r = length(vUv - 0.5) * 2.0; float f = pow(max(0.0, 1.0 - r), 2.2); gl_FragColor = vec4(vCol * f * uGain, 1.0);
          #include <fog_fragment>
        }`,
    });
    const pools = new THREE.InstancedMesh(poolG, poolM, lights.length);
    const aCol = new Float32Array(lights.length * 3);
    lights.forEach((l, i) => {
      const r = l.h * 2.4;
      m4.makeScale(r, 1, r).setPosition(l.x + l.armX * 2, heightAt(l.x, l.z) + 0.45, l.z + l.armZ * 2);
      pools.setMatrixAt(i, m4);
      const c = l.kind === 'led' ? [0.16, 0.18, 0.22] : [0.30, 0.16, 0.05];
      aCol.set(c, i * 3);
    });
    pools.geometry.setAttribute('aCol', new THREE.InstancedBufferAttribute(aCol, 3));
    pools.renderOrder = 3;
    group.add(pools);
  }

  // ---------------------------------------------------------------- trees
  {
    const palms = layout.trees.filter((t) => t.kind === 'palm'), broad = layout.trees.filter((t) => t.kind !== 'palm');
    const trunkG = new THREE.CylinderGeometry(0.22, 0.32, 1, 6); trunkG.translate(0, 0.5, 0);
    const crownG = new THREE.ConeGeometry(2.6, 1.6, 7, 1, true); crownG.rotateX(Math.PI); crownG.translate(0, 0.2, 0);
    const blobG = new THREE.IcosahedronGeometry(2.6, 0);
    const darkGreen = new THREE.MeshStandardMaterial({ color: 0x18241a, roughness: 0.9, side: THREE.DoubleSide });
    const trunks = new THREE.InstancedMesh(trunkG, new THREE.MeshStandardMaterial({ color: 0x3a3127, roughness: 0.95 }), palms.length);
    const crowns = new THREE.InstancedMesh(crownG, darkGreen, palms.length);
    const blobs = new THREE.InstancedMesh(blobG, darkGreen, broad.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    palms.forEach((t, i) => {
      const y = heightAt(t.x, t.z), h = 8 * t.s;
      m4.compose(p.set(t.x, y, t.z), q.identity(), s.set(t.s, h, t.s)); trunks.setMatrixAt(i, m4);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.x * 0.37); m4.compose(p.set(t.x, y + h, t.z), q, s.set(t.s, t.s, t.s)); crowns.setMatrixAt(i, m4);
    });
    broad.forEach((t, i) => {
      const y = heightAt(t.x, t.z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.z * 0.7);
      m4.compose(p.set(t.x, y + 3.2 * t.s, t.z), q, s.set(t.s, t.s * 0.85, t.s)); blobs.setMatrixAt(i, m4);
    });
    group.add(trunks, crowns, blobs);
  }

  // ---------------------------------------------------------------- public shelters
  const shelterMeshes = new Map();
  {
    const conc = new THREE.MeshStandardMaterial({ color: 0x8b877d, roughness: 0.9 });
    for (const s of layout.shelters) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(7, 2.6, 5), conc); body.position.y = 1.3; g.add(body);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.7), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 2.4, 0.9) }));
      sign.position.set(0, 2.25, 2.52); g.add(sign);
      const door = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.0), new THREE.MeshBasicMaterial({ color: s.locked ? new THREE.Color(0.05, 0.05, 0.05) : new THREE.Color(2.2, 1.6, 0.9) }));
      door.position.set(0, 1.0, 2.51); g.add(door);
      g.position.set(s.x, s.y, s.z);
      g.rotation.y = s.rot;
      group.add(g);
      shelterMeshes.set(s.id, { g, door, sign });
    }
    ctx.bus.on('shelter:open', ({ id }) => { const m = shelterMeshes.get(id); if (m) m.door.material.color.setRGB(2.2, 1.6, 0.9); });
  }

  return {
    group,
    update(dt, t) {
      const u = ctx.envCity.buildingUniforms;
      u.uTime.value = t;
      // windows come on as people wake up to the siren
      const target = ctx.sim.phase === 'alert' || ctx.sim.phase === 'barrage' || ctx.sim.phase === 'hold' ? 1 : ctx.sim.phase === 'aftermath' || ctx.sim.phase === 'debrief' ? 0.85 : 0;
      u.uWake.value += (target - u.uWake.value) * Math.min(1, dt * 0.25);
    },
  };
}

// additive glow sprites sized in world units with a minimum on-screen size
export function makeGlowPoints(P, C, S, minPx = 1.5) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('aCol', new THREE.BufferAttribute(C, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(S, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uScale: { value: 800 }, uMinPx: { value: minPx } },
    vertexShader: /* glsl */`
      attribute vec3 aCol; attribute float aSize; varying vec3 vCol; varying float vA; uniform float uScale; uniform float uMinPx;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
        float px = aSize * uScale / max(1.0, -mv.z); gl_PointSize = max(uMinPx, px); vA = min(1.0, px / uMinPx + 0.15); vCol = aCol; }`,
    fragmentShader: /* glsl */`
      varying vec3 vCol; varying float vA;
      void main() { vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0; if (r > 1.0) discard; float f = pow(1.0 - r, 2.0); gl_FragColor = vec4(vCol * f * vA, 1.0); }`,
  });
  m.userData.glowPoints = true;
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  pts.renderOrder = 5;
  return pts;
}
