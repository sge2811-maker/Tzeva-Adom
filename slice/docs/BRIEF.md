# Iron Wall vertical slice — brief for builders and critics

Read this first, then your stream brief in `docs/streams/`, then `../benchmark/TARGET.md`.

## What we are making

The slice is mission 6 of *Tzeva Adom: Seven Fronts*, "Iron Wall" (13–14 April 2024), ported from the 2D canvas game in `../index.html` into a standalone Three.js slice. It must play start to finish and look like a polished 2020-era 3D RTS trailer moment.

- **Setting:** the Negev at night. Arad (layout fictional) sits on its plateau, Nevatim Air Base lies on the plain to the west, and the escarpment falls east to the Dead Sea with Jordan's Moab mountains beyond. Iran's drones, cruise missiles and ballistic missiles come from the east.
- **Player loop:** deploy Iron Dome and David's Sling on pads with a budget, and call a coalition air patrol. When the **Tzeva Adom** siren sounds, get the town's people into public shelters within 75 s: open locked shelters and reroute groups. Then ride out three ballistic salvos, with Arrow 3 high above, Sling over the town and debris falling. Hold until the all-clear, then the debrief.
- **Win:** everyone sheltered before impact, Nevatim above 60%, no impacts in Arad, and hold until the all-clear.
- **Tone:** grounded and respectful. Civilians reaching shelter, emergency services and relief. **No gore, no depicted injuries or bodies.** Property damage, fire and smoke are fine. No glorification.
- **Assets:** **original only.** Use procedural geometry, procedural or hand-authored textures, and synthesized audio. Do not use copyrighted models, music, sounds, logos, insignia, unit badges or brand marks: no IDF or Home Front Command emblem, no manufacturer logos, no real news footage. Fonts must be OFL or similar, vendored under `vendor/` with their licence (`npm install @fontsource/<font>` works here). Write down any CC0 asset in `docs/ASSETS.md` with its source and licence; prefer generating your own.

## Run it

```sh
cd slice && python3 -m http.server 8790   # then open http://127.0.0.1:8790/
```

No build step. Three.js 0.186, pmndrs `postprocessing` 6.39 and N8AO are vendored in `vendor/` through the import map in `index.html`.

URL parameters (`src/core/params.js`):

| Parameter | Effect |
| --- | --- |
| `?shot=S6-salvo` | Opens on that canonical shot |
| `?seek=200` | Fast-forwards to that time with the autopilot |
| `?demo=good\|bad\|off` | Autopilot player |
| `?capture=1` | Deterministic stepping driven by `__slice.frame()` |
| `?q=high\|med\|low` | Quality tier |
| `?ui=0` | Hides the HUD |
| `?perf=1` | Performance overlay |
| `?nointro=1` | Skips the intro |
| `?mute=1` | No audio |

`window.__slice` exposes `ctx`, `sim`, `seek(t)`, `frame(dt)`, `shot(name)` and `info()`.

## Environment limits (important)

- **No GPU.** Headless Chromium renders with SwiftShader on 2 CPUs. A 1600×900 shot takes roughly 5–15 s. Frame times measured here are not GPU frame times.
- **One render at a time.** All tools take a cross-process render lock (`/tmp/iron-wall-render.lock`). Six builders and their critics share it, so render only what you need, at the smallest useful size. Don't hold the lock while thinking.
- **Network.** Only npm and PyPI registries and GitHub are reachable from the shell. No CDNs.

## Tools (`slice/tools/`)

| Tool | Use |
| --- | --- |
| `node tools/shoot.mjs --shots S2-tactical,S6-salvo --out <dir> [--w 1600 --h 900] [--ui 0]` | Canonical screenshots plus `report.json` (draw calls, triangles, console errors) |
| `node tools/capture.mjs --clip C1-arrow --out <dir> [--w 960 --h 540]` | Deterministic frame sequence → `clip.mp4` + `contact.png` (12-frame grid you can Read) |
| `node tools/perf.mjs [--shots ...]` | Draw calls, triangles, CPU ms per frame per shot, budget verdicts |
| `node tools/regress.mjs` | Gameplay regression in Node: good play wins, no play loses, the layout is valid. Run it if you touch `sim/`, `world/` or pacing |
| `node tools/sim-check.mjs --verbose` | Headless mission run with the full message log |

Canonical shots and clips live in `src/core/shots.js` (seed 1, `good` autopilot). **Do not change an existing shot.** Add new ones if you need them. Critics compare the same frames every round.

## Architecture

```
src/main.js          boot, loop, flow (menu → intro → play), __slice API          [integrator]
src/core/            bus, rng, clock (hit-stop), params, quality tiers, shots, util  [integrator; quality.js → perf]
src/world/           geo (terrain height, places), layout (streets, buildings,      [integrator; env may change
                     shelters, groups, pads, lights)                                 building generation only]
src/sim/             deterministic mission sim: threats, defence, civilians,        [integrator; pacing.js → camera]
                     mission script, pacing, demo autopilot
src/env/             sky, terrain, city, airbase, distant lights, batteries,        [stream 1: environment]
                     crowd, post-processing, lighting
src/vfx/             bodies, trails, particles, explosions, debris, impacts         [stream 2: vfx]
src/audio/           synthesized audio, spatialisation, mix                         [stream 3: audio]
src/hud/             DOM HUD, world markers, routing UX, menus, debrief             [stream 4: hud]
src/camera/          camera modes, input, intro, cinematic camera, shake, hit-stop  [stream 5: camera]
src/perf/            overlay, dynamic resolution, F9 capture                        [stream 6: perf]
```

**Edit only files you own.** If you need something outside your area, keep the change additive and small (a new event, a new `ctx` field) and list it in your report under "Cross-stream changes". Never rewrite another stream's file.

### Systems

Each stream's `index.js` exports `create(ctx)` and returns `{ update(realDt, simDt), resize?(w,h,dpr), afterRender?(), ready? }`. The update order is camera → env → vfx → hud → audio → perf. A system that throws is logged and skipped: check `__slice.info().errors`.

### `ctx`

| Field | Contents |
| --- | --- |
| `THREE, renderer, scene, camera, canvas` | Rendering basics |
| `bus` | Events (below) |
| `clock` | `realT`, `speed`, `paused`, `scale`, `hitStop()`, `slowMo()` |
| `sim` | Read-only for visuals; input only via `sim.cmd()` |
| `layout` | Town plan |
| `quality` | `tier`, `s`, `renderScale`, `onChange` |
| `params`, `pacing` | URL parameters and mission timing |
| `fx` | Screen-effect channels written by anyone and read by env's grade: `flash`, `red`, `desat`, `aberration`, `exposure`. They decay each frame |
| `lights.flash(pos, rgb, intensity, radius, dur)` | Provided by env |
| `render()` | Provided by env; the post pipeline |
| `post` | env's composer and effects |
| `size` | `{ w, h, dpr }` |
| `flow` | `'boot' \| 'menu' \| 'intro' \| 'play'` |
| `begin()`, `startPlay()` | Flow transitions |
| `timings`, `errors` | Diagnostics |

### Sim state (read-only)

- `sim.t`, `sim.phase`: `prep → alert → barrage → hold → aftermath → debrief`. `sim.countdownLeft()`, `sim.clockMinutes()`.
- `sim.threats[]`: `{ id, type: drone|cruise|ballistic, alive, pos, vel, target{x,z,kind}, heat (re-entry 0..1), salvo }`.
- `sim.interceptors[]`: `{ id, kind: dome|sling|arrow|aam, pos, vel, th (threat), age }`.
- `sim.batteries[]`: `{ id, type, x, y, z, stock, reload, yaw, offstage }`. `sim.jets[]`.
- `sim.civ.A`: struct of arrays `x, y, z, heading, speed, kind, group, state (CIV enum), path, pi`. `sim.shelters`, `sim.groups`, `sim.groupInfo()`.
- `sim.budget`, `sim.nevatim`, `sim.townHits`, `sim.objectives[]`, `sim.stats`, `sim.result`.

### Bus events (sim time in `t`)

| Event | Payload |
| --- | --- |
| `phase` | `{from, to}` |
| `flow` | `{from, to}` |
| `begin` | `{intro}` (first user gesture: start audio here) |
| `mission:start` | — |
| `mission:end` | result |
| `msg` | `{text, kind: info\|alert\|good\|hint}` |
| `threat:spawn` | `{id, type, x, y, z, target, salvo}` |
| `launch` | `{id, kind, battery, x, y, z, dx, dy, dz, threat, threatType}` |
| `intercept` | `{id, kind, threatType, kill, x, y, z, vx, vy, vz, target, tti, big, offmap}` (`offmap` = allied kills far away) |
| `interceptor:end` | `{why: timeout\|selfdestruct\|ground}` |
| `impact` | `{type, x, y, z, kind: nevatim\|town\|open, dmg, building}` |
| `alert:early` | — |
| `alert:start` | `{countdown, impactAt}` |
| `alert:impactWindow` | `{exposed, total}` |
| `alert:end` | — |
| `allclear` | — |
| `salvo:start` | `{id, n}` |
| `salvo:end` | `{id, n, kill, nevatim, town, open, pass}` |
| `ballistic:launch` | — |
| `battery:built` / `battery:reloading` / `battery:reloaded` | — |
| `airpatrol` / `airpatrol:ready` | — |
| `civ:sheltered` | `{group, shelter}` |
| `civ:route` | — |
| `shelter:opening` / `shelter:open` / `shelter:full` / `shelter:blocked` | — |
| `objective` | `{id, state}` |
| `cmd` / `cmd:rejected` | `{why}` |
| `shake` | `{amp 0..1+, dur, kind}`: requested by VFX, applied by camera |
| `shot` | `{name, shot}`: applied by camera and others for critic shots |
| `camera:mode` | — |

### Determinism

The sim is seeded and fixed-step at 1/60 s. Visual randomness that affects captures should come from `makeRng(ctx.params.seed, '<name>')` (see `vfx/particles.js`). `?capture=1` steps real time exactly through `__slice.frame(dt)`, so animations must use the `dt` they are given, not `performance.now()`.

## Performance budget (shared)

| Area | Budget |
| --- | --- |
| Whole frame at peak | ≤ 250 draw calls, ≤ 1.5 M triangles, CPU (sim + all updates) ≤ 4 ms median / 6 ms p95 |
| env | ≤ 120 calls, ≤ 1.1 M triangles; AO and bloom at reduced resolution; at most one shadow map |
| vfx | ≤ 30 calls, ≤ 1.5 ms CPU at peak; particles capped by `quality.s.particleMul` |
| hud | DOM writes throttled (≤ 10 Hz for text), no layout thrash, ≤ 1 ms CPU |
| audio | Node graphs garbage-collected; no unbounded voice growth (cap and steal voices) |
| camera | ≤ 0.3 ms CPU |

## Reporting (builders)

End every round with a short report:

1. What changed, by file.
2. Screenshot or clip paths you rendered.
3. Known gaps.
4. Cross-stream changes, if any.
5. Budget impact (draw calls, triangles, CPU).

Do not commit; the integrator commits after your stream passes. Keep the console free of errors (`report.json` lists them).
