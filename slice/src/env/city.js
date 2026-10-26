// Arad: streets, sidewalks, buildings (single merged mesh, procedural lit windows), rooftop
// solar water heaters, street lights (poles, glowing heads, light pools), palms, public shelters.
import * as THREE from 'three';
import { heightAt, GEO } from '../world/geo.js';
import { makeRng } from '../core/rng.js';
import { ATM_GLSL } from './atmosphere.js';
import { buildStreets, buildCars, buildBuildings } from './town.js';
import { planOutskirts, buildDecals } from './outskirts.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TYPE_ID = { slab: 0, tower: 1, house: 2, commercial: 3 };

export function createCity(ctx) {
  const { scene, layout } = ctx;
  const rng = makeRng(ctx.params.seed, 'city');
  const group = new THREE.Group(); group.name = 'city'; scene.add(group);

  // ---------------------------------------------------------------- streets, cars, buildings (town.js)
  const out = planOutskirts(ctx);
  const cars = buildStreets(ctx, group, rng, out.segs);
  buildCars(ctx, group, cars.concat(out.cars));
  buildDecals(ctx, group, out.decals);
  const B = layout.buildings.concat(out.extra);
  const bld = buildBuildings(ctx, group, out.extra);
  ctx.envCity = { buildingUniforms: bld.uniforms };

  // ---------------------------------------------------------------- rooftop solar water heaters
  {
    const panels = [], tanks = [];
    for (const b of B) {
      if (b.type === 'commercial' || b.type === 'shed' || b.type === 'wall') continue;
      const n = b.type === 'house' ? 1 + Math.floor(rng.next() * 2) : b.type === 'tower' ? 3 + Math.floor(rng.next() * 3) : Math.min(8, Math.max(3, Math.floor(b.w * b.d / 60)));
      for (let i = 0; i < n; i++) {
        const lx = (rng.next() - 0.5) * (b.w - 4), lz = (rng.next() - 0.5) * (b.d - 4);
        const c = Math.cos(b.rot || 0), sn = Math.sin(b.rot || 0);
        panels.push([b.x + lx * c - lz * sn, b.y + b.h + 1.0, b.z + lx * sn + lz * c]);
        tanks.push([b.x + lx * c - (lz - 1.6) * sn, b.y + b.h + 1.9, b.z + lx * sn + (lz - 1.6) * c]);
      }
    }
    const pg = new THREE.BoxGeometry(2.8, 0.1, 2.0); pg.rotateX(-0.55);
    const tg = new THREE.CylinderGeometry(0.45, 0.45, 2.5, 8); tg.rotateZ(Math.PI / 2);
    const pm = new THREE.InstancedMesh(pg, new THREE.MeshStandardMaterial({ color: 0x2a3446, roughness: 0.3, metalness: 0.5 }), panels.length);
    const tm = new THREE.InstancedMesh(tg, new THREE.MeshStandardMaterial({ color: 0xb8b6ae, roughness: 0.5, metalness: 0.3 }), tanks.length);
    const m4 = new THREE.Matrix4();
    panels.forEach((p, i) => { m4.makeTranslation(p[0], p[1], p[2]); pm.setMatrixAt(i, m4); });
    tanks.forEach((p, i) => { m4.makeTranslation(p[0], p[1], p[2]); tm.setMatrixAt(i, m4); });
    group.add(pm, tm);
  }

  // ---------------------------------------------------------------- street lights
  const lights = layout.lights.concat(out.lights);
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
      Cc[i * 3] = c[0] * 3.2; Cc[i * 3 + 1] = c[1] * 3.2; Cc[i * 3 + 2] = c[2] * 3.2; Sz[i] = 1.3;
    });
    group.add(makeGlowPoints(P, Cc, Sz, 1.2));
    // red obstruction lights on the towers
    const bc = bld.extras.beacons;
    if (bc.length) group.add(makeGlowPoints(new Float32Array(bc.flat()), new Float32Array(bc.flatMap(() => [3.0, 0.25, 0.12])), new Float32Array(bc.map(() => 1.2)), 1.4));
    // light pools on the ground
    const poolG = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const poolM = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { uGain: { value: 1 } },
      vertexShader: /* glsl */`
        attribute vec3 aCol; varying vec3 vCol; varying vec2 vUv;
        ${ATM_GLSL}
        void main() { vUv = uv; vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0); vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
          vec3 rel = w.xyz - cameraPosition; float d = length(rel); vCol = aCol * exp(-atmOD(cameraPosition, rel / max(d, 1.0), d)); }`,
      fragmentShader: /* glsl */`
        varying vec3 vCol; varying vec2 vUv; uniform float uGain;
        void main() { float r = length(vUv - 0.5) * 2.0; float f = pow(max(0.0, 1.0 - r), 2.2); gl_FragColor = vec4(vCol * f * uGain, 1.0); }`,
    });
    const SH = layout.shelters;
    const pools = new THREE.InstancedMesh(poolG, poolM, lights.length + SH.length);
    const aCol = new Float32Array((lights.length + SH.length) * 3);
    // a green-white pool at every public shelter door: findable from the RTS camera
    SH.forEach((sh, k) => {
      const i = lights.length + k, fx = Math.sin(sh.rot), fz = Math.cos(sh.rot);
      m4.makeScale(16, 1, 16).setPosition(sh.x + fx * 6, heightAt(sh.x, sh.z) + 0.5, sh.z + fz * 6);
      pools.setMatrixAt(i, m4); aCol.set([0.10, 0.55, 0.28], i * 3);
    });
    lights.forEach((l, i) => {
      const r = l.h * 3.5;
      m4.makeScale(r, 1, r).setPosition(l.x + l.armX * 2, heightAt(l.x, l.z) + 0.45, l.z + l.armZ * 2);
      pools.setMatrixAt(i, m4);
      const c = l.kind === 'led' ? [0.26, 0.29, 0.34] : [0.60, 0.32, 0.10];
      aCol.set(c, i * 3);
    });
    pools.geometry.setAttribute('aCol', new THREE.InstancedBufferAttribute(aCol, 3));
    pools.renderOrder = 3;
    group.add(pools);
  }

  // ---------------------------------------------------------------- trees
  {
    // courtyard trees between the housing blocks (env-only decoration; layout trees stay as they are)
    const yard = [];
    const trng = makeRng(ctx.params.seed, 'yard-trees');
    const clear = (x, z) => {
      for (const b of B) if (Math.abs(x - b.x) < b.w / 2 + 3.5 && Math.abs(z - b.z) < b.d / 2 + 3.5) return false;
      for (const d of out.decals) if (d.type === 0 && Math.abs(x - d.x) < d.w / 2 + 2 && Math.abs(z - d.z) < d.d / 2 + 2) return false;
      for (const sh of layout.shelters) if (Math.hypot(x - sh.x, z - sh.z) < 16) return false;
      for (const gr of layout.groups) if (Math.hypot(x - gr.x, z - gr.z) < gr.spread + 6) return false;
      return true;
    };
    for (const bl of layout.blocks) {
      if (bl.zone === 'park') continue;
      const n = Math.round((bl.x1 - bl.x0) * (bl.z1 - bl.z0) / (bl.zone === 'outer' ? 900 : 600));
      for (let k = 0; k < n; k++) {
        const x = trng.range(bl.x0 + 3, bl.x1 - 3), z = trng.range(bl.z0 + 3, bl.z1 - 3);
        if (!clear(x, z)) continue;
        yard.push({ x, z, kind: trng.chance(0.25) ? 'palm' : 'broad', s: trng.range(0.75, 1.25) });
      }
    }
    const allTrees = layout.trees.concat(yard);
    const palms = allTrees.filter((t) => t.kind === 'palm'), broad = allTrees.filter((t) => t.kind !== 'palm');
    const trunkG = new THREE.CylinderGeometry(0.2, 0.3, 1, 6); trunkG.translate(0, 0.5, 0);
    const crownG = palmCrown();
    // broadleaf (ficus/eucalyptus): a short trunk under 5 jittered, faceted lobes
    const blobG = (() => {
      const parts = [];
      const lobes = [[0, 3.6, 0, 1.7], [1.3, 3.1, 0.4, 1.3], [-1.1, 3.2, 0.7, 1.25], [0.2, 3.0, -1.3, 1.3], [-0.4, 4.6, -0.2, 1.15]];
      for (const [x, y, z, r] of lobes) {
        const g = new THREE.IcosahedronGeometry(r, 0);
        const pa = g.attributes.position;
        for (let i = 0; i < pa.count; i++) { const k = 0.85 + 0.25 * Math.abs(Math.sin(pa.getX(i) * 5.1 + pa.getZ(i) * 3.7 + x)); pa.setXYZ(i, pa.getX(i) * k + x, pa.getY(i) * k * 0.85 + y, pa.getZ(i) * k + z); }
        g.deleteAttribute('uv'); parts.push(g);
      }
      const t = new THREE.CylinderGeometry(0.16, 0.24, 2.8, 5).toNonIndexed(); t.translate(0, 1.4, 0); t.deleteAttribute('uv');
      // trunk vertices get a dark grey-brown via a colour attribute; lobes stay white (instance tint)
      const all = parts.concat([t]);
      for (const g of all) { const n = g.attributes.position.count, c = new Float32Array(n * 3).fill(g === t ? 0.45 : 1.0); if (g === t) for (let i = 0; i < n; i++) { c[i * 3] = 0.42; c[i * 3 + 1] = 0.36; c[i * 3 + 2] = 0.3; } g.setAttribute('color', new THREE.BufferAttribute(c, 3)); }
      const m = mergeGeometries(all); m.computeVertexNormals(); return m;
    })();
    const darkGreen = new THREE.MeshStandardMaterial({ color: 0x4c5e3c, roughness: 0.8, side: THREE.DoubleSide });
    const blobMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, vertexColors: true, flatShading: true });
    const trunks = new THREE.InstancedMesh(trunkG, new THREE.MeshStandardMaterial({ color: 0x6e5e4c, roughness: 0.95 }), palms.length);
    const crowns = new THREE.InstancedMesh(crownG, darkGreen, palms.length);
    const blobs = new THREE.InstancedMesh(blobG, blobMat, broad.length);
    { const tc = new THREE.Color(); broad.forEach((t, i) => { const h = (Math.sin(t.x * 12.9 + t.z * 78.2) * 43758.5) % 1; const k = Math.abs(h); tc.setRGB(0.14 + 0.06 * k, 0.16 + 0.05 * k, 0.10 + 0.03 * k); blobs.setColorAt(i, tc); }); }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    palms.forEach((t, i) => {
      const y = heightAt(t.x, t.z), h = 8 * t.s;
      m4.compose(p.set(t.x, y, t.z), q.identity(), s.set(t.s, h, t.s)); trunks.setMatrixAt(i, m4);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.x * 0.37); m4.compose(p.set(t.x, y + h, t.z), q, s.set(t.s, t.s, t.s)); crowns.setMatrixAt(i, m4);
    });
    broad.forEach((t, i) => {
      const y = heightAt(t.x, t.z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.z * 0.7);
      m4.compose(p.set(t.x, y, t.z), q, s.set(t.s, t.s, t.s)); blobs.setMatrixAt(i, m4);
    });
    group.add(trunks, crowns, blobs);
  }

  // ---------------------------------------------------------------- public shelters
  const shelterMeshes = new Map();
  {
    // Israeli public shelter: a half-sunken concrete block with a stair entrance kiosk, a
    // ventilation stack, a green sign light over the door and a green pool on the pavement.
    const conc = new THREE.MeshStandardMaterial({ color: 0x8e8a80, roughness: 0.92 });
    const concDark = new THREE.MeshStandardMaterial({ color: 0x8a857a, roughness: 0.95 });
    const signM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.15, 2.2, 0.75), fog: true });
    const bandM = new THREE.MeshStandardMaterial({ color: 0xd8cf9a, roughness: 0.8, emissive: new THREE.Color(0.18, 0.16, 0.08) });
    const stripeM = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.8, 1.6), fog: true });
    const P2 = [], C2 = [], S2 = [], shelterParts = [];
    for (const s of layout.shelters) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(9, 1.6, 7), conc); body.position.set(0, 0.8, -1.5); g.add(body);
      const lip = new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.25, 7.4), concDark); lip.position.set(0, 1.72, -1.5); g.add(lip);
      const kiosk = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.8, 3.0), conc); kiosk.position.set(0, 1.4, 2.4); g.add(kiosk);
      const kroof = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.22, 3.6), concDark); kroof.position.set(0, 2.9, 2.5); g.add(kroof);
      // green light strip along the kiosk roof edge (reads from above) and a pale painted band
      const strip = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.14, 0.14), signM); strip.position.set(0, 3.06, 4.25); g.add(strip);
      for (const sx of [-1.9, 1.9]) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 3.5), signM); st.position.set(sx, 3.06, 2.5); g.add(st); }
      const band = new THREE.Mesh(new THREE.BoxGeometry(3.24, 0.35, 3.04), bandM); band.position.set(0, 0.45, 2.4); g.add(band);
      const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.4, 8), concDark); vent.position.set(3.4, 2.3, -3.5); g.add(vent);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.5), signM); sign.position.set(0, 2.45, 3.92); g.add(sign);
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.08), stripeM); stripe.position.set(0, 2.45, 3.925); g.add(stripe);
      const door = new THREE.Object3D(); door.position.set(0, 1.0, 3.91); g.add(door);
      g.position.set(s.x, s.y, s.z);
      g.rotation.y = s.rot;
      g.updateMatrixWorld(true);
      shelterParts.push(g);
      shelterMeshes.set(s.id, { i: shelterMeshes.size, door, locked: s.locked });
      // green glow at the sign and a soft green pool on the ground in front of the door
      const fx = Math.sin(s.rot), fz = Math.cos(s.rot);
      P2.push(s.x + fx * 4.0, s.y + 2.5, s.z + fz * 4.0); C2.push(0.25, 2.6, 0.9); S2.push(1.4);
    }
    if (P2.length) group.add(makeGlowPoints(new Float32Array(P2), new Float32Array(C2), new Float32Array(S2), 1.6));
    // merge all shelters into one mesh per material (draw calls), doors as one instanced mesh
    const byMat = new Map();
    for (const g of shelterParts) g.traverse((o) => { if (o.isMesh) { const k = byMat.get(o.material) || []; k.push(o.geometry.clone().applyMatrix4(o.matrixWorld)); byMat.set(o.material, k); } });
    for (const [m, geos] of byMat) { const mm = new THREE.Mesh(mergeGeometries(geos), m); mm.name = 'shelters'; group.add(mm); }
    var doors = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.3, 2.0), new THREE.MeshBasicMaterial({ fog: true }), shelterMeshes.size);
    for (const m of shelterMeshes.values()) {
      doors.setMatrixAt(m.i, m.door.matrixWorld);
      doors.setColorAt(m.i, m.locked ? new THREE.Color(0.03, 0.03, 0.035) : new THREE.Color(1.6, 1.15, 0.65));
    }
    group.add(doors);
    ctx.bus.on('shelter:open', ({ id }) => { const m = shelterMeshes.get(id); if (m) { doors.setColorAt(m.i, new THREE.Color(1.6, 1.15, 0.65)); doors.instanceColor.needsUpdate = true; } });
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
      ${ATM_GLSL}
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
        float px = aSize * uScale / max(1.0, -mv.z); gl_PointSize = max(uMinPx, px); vA = min(1.0, px / uMinPx + 0.15);
        vec3 rel = (modelMatrix * vec4(position, 1.0)).xyz - cameraPosition; float d = length(rel);
        float tr = exp(-atmOD(cameraPosition, rel / max(d, 1.0), d));
        vCol = aCol * tr * mix(vec3(1.0, 0.82, 0.68), vec3(1.0), tr); }`,
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

// palm crown: 9 arched fronds (double-sided strips), drooping toward the tips
function palmCrown() {
  const P = [], I = [];
  const n = 9, seg = 4;
  for (let f = 0; f < n; f++) {
    const a = (f / n) * Math.PI * 2 + (f % 2) * 0.2, ca = Math.cos(a), sa = Math.sin(a);
    const len = 3.4 + (f % 3) * 0.35, lift = f % 2 ? 0.5 : 0.9;
    const base = P.length / 3;
    for (let k = 0; k <= seg; k++) {
      const t = k / seg, r = len * t, y = lift * Math.sin(t * Math.PI * 0.9) - 1.6 * t * t, w = Math.max(0.06, 0.55 * Math.sin(Math.PI * Math.min(0.97, t * 1.15 + 0.08)));
      for (const sd of [-1, 1]) P.push(ca * r - sa * w * sd, y - w * 0.25, sa * r + ca * w * sd);
    }
    for (let k = 0; k < seg; k++) { const i = base + k * 2; I.push(i, i + 2, i + 1, i + 1, i + 2, i + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setIndex(I); g.computeVertexNormals();
  return g;
}
