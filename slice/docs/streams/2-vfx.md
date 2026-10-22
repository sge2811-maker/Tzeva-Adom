# Stream 2: VFX

**Owner:** builder `vfx`.

**Files you own:** `src/vfx/**`.

**Benchmark:** `../../benchmark/TARGET.md` §2. References: WARNO and Broken Arrow air-defence vocabulary, and CoH3 explosions.

## Current state

The baseline works but is first-pass:

- **Bodies:** instanced meshes for drones, cruise missiles, ballistic missiles, interceptors and jets, with additive glow sprites.
- **Trails:** ribbon trails (`trails.js`) with a smoke layer and an additive hot-core layer.
- **Particles:** `particles.js` holds the additive fire and alpha smoke pools.
- **Events:**
  - `launch`: smoke burst, flash and a light request.
  - `intercept`: flash, fireball, sparks, smoke and burning debris with trails.
  - `impact`: fireball, sparks, dust and a smoke column.
- **Requests to other streams:** camera shake via the bus `shake` event, light via `ctx.lights.flash`, and screen flash via `ctx.fx.flash`.

## Goals, in priority order

1. **Interceptor trails and launches.** These are the signature image of that night. Make thick, billowing smoke ribbons that widen and drift and catch the light of flashes and the town glow. Add a white-hot motor head with flicker, a booster ground billow at the battery and a curving climb. Arrow 3 legs above about 20 km have no smoke, only a moving star. Interceptors launch in pairs or ripples where it makes sense.
2. **Intercepts.**
   - **Exo-atmospheric (Arrow, about 25 km up):** a brief brilliant star-flash, maybe with a lens-glint cross, and a fading debris cloud. Seen from Arad, these are bright points high over the Dead Sea.
   - **Endo-atmospheric (Sling, Dome):** flash, a fireball that cools from white to orange to red (procedural noise flipbook or shader, not round blobs), sparks, a shock ring, then a smoke puff that lingers and drifts.
   - **Scale:** effects must read both at 30 km and overhead.
3. **Debris.** Burning fragments fall in arcs with glowing smoke trails, some breaking up, and land as small fires or sparks on terrain, rooftops and streets. This is the reason people shelter.
4. **Ballistic re-entry.** Missiles enter as a meteor-like plasma head with a long glowing trail, brightening as they descend. Impacts at Nevatim or on open ground show a flash, a dust ring, a fireball, a persistent smoke column lit from below by fire, embers and a scorch decal.
5. **Drones, cruise missiles and jets.**
   - **Shahed:** a small silhouette with a faint engine glow. In-game readability matters more than realism.
   - **Cruise:** a low, fast streak.
   - **Coalition jets:** afterburner and nav lights. Their AAM shots should look distinct from Iron Dome.
6. **Distant allied kills** (`intercept` with `offmap`). Small flashes on the eastern horizon over Jordan and very high SM-3 flashes. They should be subtle but present.
7. **Shake.** Tune the `shake` amplitudes you request so they scale with distance and never nauseate. The camera stream applies them.

## Determinism

Use the seeded RNG (`makeRng`) and the `dt` you are given; captures must be reproducible.

## Critic evidence

- **Clips:** `C1-arrow`, `C3-drone-kill`, `C4-overhead` (contact sheets).
- **Shots:** `S3-drones`, `S5-street`, `S6-salvo`, `S7-aftermath`.
- You may add a clip for ground impacts at Nevatim. Look for impact times in `node tools/sim-check.mjs --verbose`.

## Budget

At peak: ≤ 30 draw calls, ≤ 1.5 ms CPU, and particle counts scaled by `quality.s.particleMul`. Avoid per-frame allocations.
