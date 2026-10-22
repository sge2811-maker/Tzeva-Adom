// Procedural (seeded) plan of the town: street graph, blocks, buildings, parks, public shelters,
// civilian groups, battery pads, street lights and regional roads. Shared by sim, env and HUD.
//
// Ownership: integrator. The environment stream may change building generation (types, sizes,
// heights, skyline composition) but must keep streets, shelters, groups and pads valid:
// run `node tools/check-layout.mjs` after changes.
import { makeRng } from '../core/rng.js';
import { GEO, heightAt } from './geo.js';

const DX = 110, DZ = 95, NI = 6, NJ = 6;
const KEEP_OUT = [{ x: -60, z: -32, r: 27 }]; // env: courtyard around the S5-street camera
export const STREET_W = { avenue: 22, street: 14, lane: 10 };

// Public shelters ("miklat ziburi"). Positions are block interiors; doors face the nearest street.
// Two are locked when the siren sounds (a real-world problem with public shelters); the player can open them.
const SHELTERS = [
  { id: 'S1', name: 'Lookout shelter', x: 800, z: -52, cap: 24, locked: true },
  { id: 'S2', name: 'Avenue shelter', x: 55, z: -40, cap: 26, locked: false },
  { id: 'S3', name: 'North park shelter', x: -275, z: -332, cap: 32, locked: false },
  { id: 'S4', name: 'School shelter', x: 275, z: 332, cap: 40, locked: false },
  { id: 'S5', name: 'West shelter', x: -410, z: 44, cap: 26, locked: true },
  { id: 'S6', name: 'Court shelter', x: -55, z: 428, cap: 28, locked: false },
  { id: 'S7', name: 'East quarter shelter', x: 388, z: -238, cap: 22, locked: false },
];

// People outdoors at 23:00 on a Saturday night. `usual` is the shelter they know and head to by default.
const GROUPS = [
  { id: 'G1', name: 'Lookout', x: 885, z: -8, n: 16, usual: 'S1', spread: 16, mix: { adult: 0.75, teen: 0.25 } },
  { id: 'G2', name: 'Café terrace', x: 96, z: 16, n: 22, usual: 'S2', spread: 12, mix: { adult: 0.55, elder: 0.3, child: 0.15 } },
  { id: 'G3', name: 'Bus stop', x: -362, z: 15, n: 10, usual: 'S5', spread: 7, mix: { adult: 0.6, teen: 0.3, elder: 0.1 } },
  { id: 'G4', name: 'Playground', x: -275, z: -248, n: 14, usual: 'S3', spread: 14, mix: { adult: 0.45, child: 0.55 } },
  { id: 'G5', name: 'Basketball court', x: -55, z: 360, n: 12, usual: 'S6', spread: 12, mix: { teen: 0.9, adult: 0.1 } },
  { id: 'G6', name: 'Kiosk', x: 368, z: 302, n: 8, usual: 'S4', spread: 8, mix: { adult: 0.8, teen: 0.2 } },
  { id: 'G7', name: 'Evening walkers', x: 322, z: -168, n: 10, usual: 'S2', spread: 18, mix: { adult: 0.7, teen: 0.3 } },
];

// Interceptor battery pads. `pre` = deployed before the mission starts.
const PADS = [
  { id: 'AE', name: 'Arad East', x: 1130, z: -170, allow: ['dome', 'sling'] },
  { id: 'AN', name: 'Arad North', x: -120, z: -1080, allow: ['dome', 'sling'] },
  { id: 'NE', name: 'Nevatim East', x: -4600, z: 2200, allow: ['dome', 'sling'], pre: 'dome' },
  { id: 'NW', name: 'Nevatim West', x: -9000, z: 3500, allow: ['dome', 'sling'] },
  { id: 'SW', name: 'Nevatim South-West', x: -10600, z: 1800, allow: ['dome', 'sling'] },
];

export function buildLayout(seed = 1) {
  const rng = makeRng(seed, 'layout');
  const nodes = [];
  const key = (i, j) => `${i},${j}`;
  const gridIdx = new Map();
  const addNode = (x, z, kind = 'x', i = null, j = null) => {
    const n = { id: nodes.length, x, z, y: heightAt(x, z), kind, i, j, adj: [] };
    nodes.push(n);
    if (i != null) gridIdx.set(key(i, j), n.id);
    return n;
  };
  for (let i = -NI; i <= NI; i++) {
    for (let j = -NJ; j <= NJ; j++) {
      const x0 = i * DX, z0 = j * DZ;
      const e = (x0 / (GEO.town.rx - 30)) ** 2 + (z0 / (GEO.town.rz - 30)) ** 2;
      if (e > 1) continue;
      const x = i === 0 ? x0 : x0 + rng.range(-10, 10);
      const z = j === 0 ? z0 : z0 + rng.range(-8, 8);
      addNode(x, z, 'x', i, j);
    }
  }
  const edges = [];
  const addEdge = (a, b, kind) => {
    const A = nodes[a], B = nodes[b];
    const e = { id: edges.length, a, b, kind, w: STREET_W[kind], len: Math.hypot(A.x - B.x, A.z - B.z), on: true };
    edges.push(e); A.adj.push(e.id); B.adj.push(e.id);
    return e;
  };
  for (let i = -NI; i <= NI; i++) {
    for (let j = -NJ; j <= NJ; j++) {
      const a = gridIdx.get(key(i, j)); if (a == null) continue;
      const r = gridIdx.get(key(i + 1, j)), d = gridIdx.get(key(i, j + 1));
      if (r != null) addEdge(a, r, j === 0 ? 'avenue' : Math.abs(j) % 3 === 0 ? 'street' : 'lane');
      if (d != null) addEdge(a, d, i === 0 ? 'avenue' : Math.abs(i) % 3 === 0 ? 'street' : 'lane');
    }
  }
  // east: avenue to the lookout plaza over the escarpment; west: town gate toward Route 31
  const eastEnd = nodes[gridIdx.get(key(NI, 0))];
  const plaza1 = addNode(eastEnd.x + 110, 0, 'plaza');
  const lookout = addNode(GEO.lookout.x, GEO.lookout.z, 'lookout');
  addEdge(eastEnd.id, plaza1.id, 'avenue'); addEdge(plaza1.id, lookout.id, 'avenue');
  const westEnd = nodes[gridIdx.get(key(-NI, 0))];
  const gate = addNode(westEnd.x - 160, 6, 'gate');
  addEdge(westEnd.id, gate.id, 'avenue');

  // drop some lanes for irregularity (never avenues, never below degree 3)
  for (const e of rng.shuffle(edges.slice())) {
    if (e.kind !== 'lane') continue;
    const A = nodes[e.a], B = nodes[e.b];
    const degA = A.adj.filter((id) => edges[id].on).length, degB = B.adj.filter((id) => edges[id].on).length;
    if (degA >= 4 && degB >= 4 && rng.chance(0.22)) e.on = false;
  }

  // blocks (grid cells) and buildings
  const reserved = [];
  for (const s of SHELTERS) reserved.push({ x: s.x, z: s.z, r: 24 });
  for (const g of GROUPS) reserved.push({ x: g.x, z: g.z, r: g.spread + 14 });
  const blocks = [], buildings = [], parks = [], trees = [];
  const parkCells = new Set(['-3,-3', '-3,-4', '0,4', '2,3', '-5,0', '4,-3', '-1,-6', '5,2']);
  for (let i = -NI; i < NI; i++) {
    for (let j = -NJ; j < NJ; j++) {
      const A = gridIdx.get(key(i, j)), B = gridIdx.get(key(i + 1, j)), C = gridIdx.get(key(i + 1, j + 1)), D = gridIdx.get(key(i, j + 1));
      if ([A, B, C, D].some((v) => v == null)) continue;
      const nA = nodes[A], nB = nodes[B], nC = nodes[C], nD = nodes[D];
      const insetX0 = (i === 0 || i === -1 ? STREET_W.avenue : STREET_W.street) / 2 + 7;
      const insetZ0 = (j === 0 || j === -1 ? STREET_W.avenue : STREET_W.street) / 2 + 7;
      const x0 = Math.max(nA.x, nD.x) + insetX0, x1 = Math.min(nB.x, nC.x) - insetX0;
      const z0 = Math.max(nA.z, nB.z) + insetZ0, z1 = Math.min(nD.z, nC.z) - insetZ0;
      if (x1 - x0 < 30 || z1 - z0 < 30) continue;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      const r = Math.hypot(cx / GEO.town.rx, cz / GEO.town.rz);
      const k = key(i, j);
      const zone = parkCells.has(k) ? 'park' : r < 0.3 ? 'center' : r < 0.64 ? 'mid' : 'outer';
      const block = { id: blocks.length, i, j, x0, x1, z0, z1, cx, cz, zone };
      blocks.push(block);
      if (zone === 'park') { parks.push(block); fillPark(block); continue; }
      fillBlock(block);
    }
  }

  function free(x, z, w, d) {
    for (const r of reserved) {
      const dx = Math.max(Math.abs(r.x - x) - w / 2, 0), dz = Math.max(Math.abs(r.z - z) - d / 2, 0);
      if (dx * dx + dz * dz < r.r * r.r) return false;
    }
    return true;
  }
  // env: open courtyards where canonical street-level cameras stand (S5-street at -60,-40), so
  // the camera is not inside a building. The rng draw still happens, so the rest of the town
  // (and everything seeded after it) is unchanged.
  function addBuilding(b, block) {
    if (!free(b.x, b.z, b.w, b.d)) return;
    const seed = rng.next();
    for (const k of KEEP_OUT) {
      const dx = Math.max(Math.abs(k.x - b.x) - b.w / 2, 0), dz = Math.max(Math.abs(k.z - b.z) - b.d / 2, 0);
      if (dx * dx + dz * dz < k.r * k.r) return;
    }
    b.id = buildings.length; b.block = block.id; b.y = heightAt(b.x, b.z); b.seed = seed;
    b.h = b.floors * (b.type === 'tower' ? 3.2 : b.type === 'house' ? 3.1 : 3.0) + (b.type === 'house' ? 1.2 : 1.6);
    buildings.push(b);
  }
  function fillBlock(B) {
    const W = B.x1 - B.x0, D = B.z1 - B.z0;
    if (B.zone === 'center') {
      const tw = rng.range(20, 26), td = rng.range(20, 26);
      const corner = rng.int(0, 3);
      const tx = corner & 1 ? B.x1 - tw / 2 : B.x0 + tw / 2, tz = corner & 2 ? B.z1 - td / 2 : B.z0 + td / 2;
      addBuilding({ type: 'tower', x: tx, z: tz, w: tw, d: td, floors: rng.int(9, 17), rot: 0 }, B);
      const cw = W - tw - 10, cd = D * 0.55;
      if (cw > 20) addBuilding({ type: 'commercial', x: corner & 1 ? B.x0 + cw / 2 : B.x1 - cw / 2, z: corner & 2 ? B.z0 + cd / 2 : B.z1 - cd / 2, w: cw, d: cd, floors: rng.int(2, 3), rot: 0 }, B);
      if (rng.chance(0.5)) addBuilding({ type: 'slab', x: B.cx, z: corner & 2 ? B.z0 + 8 : B.z1 - 8, w: W * 0.5, d: 12, floors: rng.int(4, 6), rot: 0 }, B);
    } else if (B.zone === 'mid' || (B.zone === 'outer' && rng.chance(0.35))) {
      const alongX = W >= D;
      const n = Math.max(1, Math.min(3, Math.floor((alongX ? D : W) / 24)));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        const len = (alongX ? W : D) * rng.range(0.7, 0.92);
        const floors = rng.chance(0.12) ? rng.int(7, 9) : rng.int(3, 5);
        if (alongX) addBuilding({ type: 'slab', x: B.cx + rng.range(-4, 4), z: B.z0 + D * t, w: len, d: 12, floors, rot: 0 }, B);
        else addBuilding({ type: 'slab', x: B.x0 + W * t, z: B.cz + rng.range(-4, 4), w: 12, d: len, floors, rot: 0 }, B);
      }
    } else {
      const cols = Math.max(2, Math.floor(W / 22)), rows = Math.max(2, Math.floor(D / 20));
      for (let a = 0; a < cols; a++) for (let b = 0; b < rows; b++) {
        if (rng.chance(0.18)) continue;
        const x = B.x0 + (a + 0.5) * (W / cols) + rng.range(-2, 2), z = B.z0 + (b + 0.5) * (D / rows) + rng.range(-2, 2);
        addBuilding({ type: 'house', x, z, w: rng.range(10, 14), d: rng.range(9, 12), floors: rng.int(1, 2), rot: rng.range(-0.05, 0.05) }, B);
        if (rng.chance(0.5)) trees.push({ x: x + rng.range(-9, 9), z: z + rng.range(-8, 8), kind: rng.chance(0.4) ? 'palm' : 'broad', s: rng.range(0.8, 1.2) });
      }
    }
  }
  function fillPark(B) {
    const n = Math.round(((B.x1 - B.x0) * (B.z1 - B.z0)) / 420);
    for (let k = 0; k < n; k++) {
      const x = rng.range(B.x0 + 4, B.x1 - 4), z = rng.range(B.z0 + 4, B.z1 - 4);
      if (!free(x, z, 2, 2) && rng.chance(0.7)) continue;
      trees.push({ x, z, kind: rng.chance(0.55) ? 'palm' : 'broad', s: rng.range(0.85, 1.25) });
    }
  }
  // avenue palms
  for (const e of edges) {
    if (!e.on || e.kind !== 'avenue') continue;
    const A = nodes[e.a], B = nodes[e.b];
    const n = Math.floor(e.len / 18);
    const nx = -(B.z - A.z) / e.len, nz = (B.x - A.x) / e.len;
    for (let k = 1; k < n; k++) {
      const t = k / n;
      trees.push({ x: A.x + (B.x - A.x) * t + nx * 2, z: A.z + (B.z - A.z) * t + nz * 2, kind: 'palm', s: rng.range(0.9, 1.15), median: true });
    }
  }

  // shelters: attach each door to the nearest street with a short spur
  const shelters = SHELTERS.map((s) => ({ ...s, y: heightAt(s.x, s.z), occ: 0, opening: 0 }));
  for (const s of shelters) {
    const att = attachToGraph(s.x, s.z);
    s.node = att.node;
    s.door = att.door;
    s.rot = Math.atan2(att.dx, att.dz);
  }
  function attachToGraph(x, z) {
    let best = null, bd = Infinity;
    for (const e of edges) {
      if (!e.on) continue;
      const A = nodes[e.a], B = nodes[e.b];
      const vx = B.x - A.x, vz = B.z - A.z, L2 = vx * vx + vz * vz;
      let t = ((x - A.x) * vx + (z - A.z) * vz) / L2; t = Math.max(0.08, Math.min(0.92, t));
      const px = A.x + vx * t, pz = A.z + vz * t, d = Math.hypot(px - x, pz - z);
      if (d < bd) { bd = d; best = { e, t, px, pz }; }
    }
    // split the edge at the projection
    const { e, px, pz } = best;
    const n = addNode(px, pz, 'attach');
    const B = e.b;
    e.b = n.id; e.len = Math.hypot(nodes[e.a].x - px, nodes[e.a].z - pz);
    nodes[B].adj = nodes[B].adj.filter((id) => id !== e.id);
    n.adj.push(e.id);
    addEdge(n.id, B, e.kind).on = e.on;
    const dx = x - px, dz = z - pz, L = Math.hypot(dx, dz) || 1;
    return { node: n.id, door: { x: x - (dx / L) * 4, z: z - (dz / L) * 4 }, dx: -dx / L, dz: -dz / L };
  }

  // civilian groups: nearest graph node for each
  const groups = GROUPS.map((g) => ({ ...g, y: heightAt(g.x, g.z), node: nearestNode(g.x, g.z) }));
  function nearestNode(x, z) {
    let best = 0, bd = Infinity;
    for (const n of nodes) {
      if (!n.adj.some((id) => edges[id].on)) continue;
      const d = Math.hypot(n.x - x, n.z - z);
      if (d < bd) { bd = d; best = n.id; }
    }
    return best;
  }

  const pads = PADS.map((p) => ({ ...p, y: heightAt(p.x, p.z) }));

  // street lights along streets (alternating sides) and both sides of avenues
  const lights = [];
  for (const e of edges) {
    if (!e.on) continue;
    const A = nodes[e.a], B = nodes[e.b];
    const step = e.kind === 'avenue' ? 26 : 32;
    const n = Math.max(1, Math.round(e.len / step));
    const nx = -(B.z - A.z) / e.len, nz = (B.x - A.x) / e.len;
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n, x = A.x + (B.x - A.x) * t, z = A.z + (B.z - A.z) * t;
      const sides = e.kind === 'avenue' ? [-1, 1] : [k % 2 ? 1 : -1];
      for (const sd of sides) {
        const off = e.w / 2 + 1.2;
        lights.push({ x: x + nx * off * sd, z: z + nz * off * sd, y: heightAt(x, z), h: e.kind === 'avenue' ? 9 : 7.5, kind: e.kind === 'lane' && rng.chance(0.35) ? 'led' : 'sodium', armX: -nx * sd, armZ: -nz * sd });
      }
    }
  }

  // regional roads (polylines, x/z only)
  const roads = [
    { id: 'R31', name: 'Route 31', lit: true, w: 12, pts: [[gate.x, gate.z], [-1600, 120], [-2800, 600], [-4200, 1500], [-5600, 2200], [-6600, 2500], [-8200, 2650], [-11000, 2500], [-16000, 2600], [-24000, 2600], [-30000, 2600]] },
    { id: 'R80', name: 'Route 80', lit: false, w: 9, pts: [[-1600, 120], [-1900, 2200], [-2400, 6000], [-3200, 10000], [-3600, 13500]] },
    { id: 'R3199', name: 'Masada road', lit: false, w: 8, pts: [[lookout.x, lookout.z], [1500, -280], [2300, -700], [2900, -500], [3600, -900], [4400, -700], [5200, -1300], [6300, -1500], [7600, -2100], [8600, -2500], [9300, -2600]] },
    { id: 'R90', name: 'Route 90', lit: true, w: 10, pts: [[9300, -14000], [9450, -8000], [9300, -2600], [9500, 2000], [9900, 6500], [10200, 9500], [10600, 14000]] },
  ];

  const landmarks = {
    center: { x: 0, z: 0 },
    lookout: { x: lookout.x, z: lookout.z },
    gate: { x: gate.x, z: gate.z },
    nevatim: { x: GEO.nevatim.x, z: GEO.nevatim.z },
  };

  return { seed, nodes, edges, blocks, buildings, parks, trees, shelters, groups, pads, lights, roads, landmarks };
}

// A* on the street graph. Returns an array of node ids (inclusive) or null.
export function findPath(layout, from, to) {
  const { nodes, edges } = layout;
  const open = new Set([from]);
  const g = new Map([[from, 0]]), f = new Map([[from, 0]]), came = new Map();
  const h = (id) => Math.hypot(nodes[id].x - nodes[to].x, nodes[id].z - nodes[to].z);
  f.set(from, h(from));
  while (open.size) {
    let cur = null, best = Infinity;
    for (const id of open) { const v = f.get(id); if (v < best) { best = v; cur = id; } }
    if (cur === to) {
      const path = [cur];
      while (came.has(cur)) { cur = came.get(cur); path.push(cur); }
      return path.reverse();
    }
    open.delete(cur);
    for (const eid of nodes[cur].adj) {
      const e = edges[eid];
      if (!e.on) continue;
      const nb = e.a === cur ? e.b : e.a;
      const ng = g.get(cur) + e.len;
      if (ng < (g.get(nb) ?? Infinity)) { came.set(nb, cur); g.set(nb, ng); f.set(nb, ng + h(nb)); open.add(nb); }
    }
  }
  return null;
}
