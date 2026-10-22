# Stream 6: Performance

**Owner:** builder `perf`.

**Files you own:** `src/perf/**`, `src/core/quality.js`, `tools/perf.mjs`, and new `docs/PERF.md`.

## Target and constraints

Hold 60 fps at 1080p in Chrome on a mid-range laptop. That means RTX 3050/3060 Laptop or GTX 1660 Ti class, with the owner's RTX 3070 Laptop as the sign-off device. Adaptive resolution keeps integrated GPUs (Iris Xe, 680M) playable.

This environment has **no GPU** (SwiftShader). You cannot measure real GPU frame time here, so be explicit about that in every claim. Work from what transfers:

- draw calls
- triangles
- full-screen passes and render-target sizes
- overdraw estimates from particles and trails
- shader cost
- CPU time per frame
- allocations and GC

The hardware gate is the in-game F9 capture (≥ 59 fps average, p99 ≤ 22.3 ms) run by the owner. Make that easy and trustworthy.

## Phase A (now, in parallel with the other streams)

1. **Instrumentation.**
   - GPU timer queries via `EXT_disjoint_timer_query_webgl2` when available. They are absent here, so detect that and report null.
   - Per-system CPU timings, already in `ctx.timings`.
   - Per-pass costs in the overlay (F8).
   - A proper F9 capture report (schema in `src/perf/index.js`), with a clear "unverified on hardware" flag when the GPU string is SwiftShader.
2. **Quality tiers** (`core/quality.js`). Keep auto-detection sane. Map tiers to concrete settings each stream reads: AO, bloom levels, shadow size, particle multiplier, crowd cap, lights, render scale. Document the mapping in `docs/PERF.md`.
3. **Dynamic resolution** (`perf/index.js`). Make it smooth and hysteretic, never oscillating, and visible in the overlay. Consider separate resolution for AO and bloom.
4. **Budget checker.** `tools/perf.mjs` fails loudly when a shot exceeds budget: calls ≤ 250, triangles ≤ 1.5 M, CPU ≤ 4 ms median / 6 ms p95. It prints a per-system breakdown and a pass-cost table: number of full-screen passes × resolution.
5. **Shared hot paths.** Make CPU-side fixes in shared code you can touch safely: the main loop in `src/main.js` (additive only, coordinate in your report) and sim allocation hotspots in `src/sim/*`, if allocation-free changes keep `node tools/regress.mjs` passing. Do not edit other streams' folders in phase A. Write requests in your report instead: "vfx: reuse Vector3 in placeInst", and so on.

## Phase B (after the other streams pass; the integrator will message you)

Profile the integrated build at every canonical shot and the peak barrage, and optimize across streams with surgical, measured changes. Each change must come with before and after numbers and must not alter the look. Run `tools/shoot.mjs` before and after, then diff the images. Finally, write `docs/PERF.md`, covering the budget table, measured numbers, what is unverified and how to run F9 on a laptop.

## Critic evidence

- `tools/perf.mjs` output on all shots.
- A code review of the instrumentation and adaptive resolution.
- An F9 capture JSON produced headlessly (flagged as unverified).
- `docs/PERF.md`.
