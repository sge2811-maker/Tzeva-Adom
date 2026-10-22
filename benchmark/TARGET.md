# Benchmark: Iron Wall vertical slice

**Target:** a playable mission that looks like a polished trailer moment for a 2020-era, commercially released 3D RTS. It should not read as a prototype.

## Why there are no images in this folder

The owner asked for the benchmark to be set by "2020ish 3D RTS games in the market." Screenshots of those games are copyrighted, so none are stored here.

Critics score against the reference titles below, which they know, and against the written criteria. A critic must name the reference it compares against for every judgement. If the owner later drops licensed or self-made reference images in this folder, critics use them as well.

## Reference titles (the bar)

| Title (year) | What it sets the bar for |
| --- | --- |
| **Company of Heroes 3** (2023) | Grounded military RTS readability at tactical zoom. Explosions with debris, dust and lingering smoke. Destructible-feeling streets. Cinematic but readable night maps. Restrained HUD. |
| **Age of Empires IV** (2021) | Clean, legible RTS camera and HUD hierarchy. Strong silhouettes from a high camera. Polished intro cinematics into gameplay. Consistent art direction. |
| **Iron Harvest** (2020) | Moody atmosphere, volumetric-looking fog, warm practical lights against cold ambient, film-grade colour grade, dramatic camera intros. |
| **WARNO** (2024, Eugen) and **Broken Arrow** (2025) | Modern-military VFX vocabulary: missile launches, smoke trails that linger and drift, air-defence engagements, flare-bright intercepts, scale of a modern battlefield, believable radar/air-defence UI. |
| **Total War: Warhammer III** (2022) | Large-scale vistas with layered depth: foreground, mid-ground and far silhouettes. Sky drama and atmospheric perspective. |
| **Cities: Skylines II** (2023), supplementary | Night city lighting: varied window emissives, street-light pools, light pollution, a skyline that reads at a distance. |

## What "8/10" means for this slice

A frame grabbed from the canonical shots could sit in a store-page screenshot row or a 30-second trailer next to those titles without looking like a different budget class. A viewer should not spot primitives, flat lighting, placeholder UI or obviously procedural repetition in the first glance.

The motion clips should feel authored. They need weight, timing, anticipation and follow-through, not linear lerps.

### Scoring anchors (all streams)

| Score | Meaning |
| --- | --- |
| 1–2 | Broken, missing or wrong. |
| 3–4 | Prototype or placeholder: primitives, programmer art, flat lighting, debug-looking UI, mechanical timing. |
| 5–6 | Competent indie: cohesive, but clearly cheaper than the references. Visible artifacts or repetition. Effects read as generic. |
| 7 | Close to the reference bar, with 2–4 specific, visible gaps a player would notice. |
| **8** | **Holds up next to the references at the canonical shots and clips. Only nitpicks remain. Pass mark.** |
| 9 | Top of the genre for this kind of moment. |
| 10 | Best in class. Nothing to fix. |

## Per-stream criteria (what critics look for)

### 1. Environment and lighting

These attributes come from CoH3 night maps, Iron Harvest, TW:WH3 vistas and CS2 night lighting.

- **Layered depth.** The foreground town, the mid-ground escarpment, the Dead Sea and the Moab silhouettes separate through atmospheric perspective: fog density, value and hue shift with distance. There is no flat black void.
- **Night exposure.** Read the scene as moonlit night with legible terrain forms, like an RTS night map, not pitch black. Warm practical lights sit against cold ambient. Highlights bloom without washing out.
- **Skyline.** Buildings have believable massing and variety. Windows show varied, non-repeating lit patterns, with a few colour temperatures and some dark floors. Rooftop clutter (solar heaters, tanks) is visible up close. Street-light pools light the streets. There is a light-pollution glow over the town.
- **Ground.** No visible terrain faceting near the camera. There is material variety (rock, sand, asphalt, salt flats), and roads sit cleanly on the ground without z-fighting or floating.
- **Post-processing.** SSAO grounds buildings and props without halos. Bloom stays localized and HDR-correct. Tone mapping keeps colour in bright explosions with no hue clipping. The colour grade is consistent: cool shadows, sodium-warm highlights, and red-alert grading that is tasteful, not a red filter. Grain and vignette stay subtle.
- **Failure signs.** Banding in the sky, aliasing shimmer, blown-out flat white blooms, z-fighting, a box-like town, uniform window grids, or pure black terrain.

### 2. VFX

These attributes come from WARNO and Broken Arrow air defence, and CoH3 explosions.

- **Launches.** Booster flash, ground smoke that billows and spreads, and a bright motor that climbs with a curving trail.
- **Interceptor trails.** Ribbons that widen, drift with wind and fade over seconds, with a hot core near the motor. Exo-atmospheric legs have no smoke.
- **Intercepts.** A brief flare-bright flash that lights the sky and smoke, a fireball that cools from white to orange to red, sparks, then a lingering smoke puff. Scale reads at distance.
- **Debris.** Burning fragments fall in arcs with small glowing trails and land as sparks or small fires.
- **Ground impacts.** Flash, dust ring, fireball, rising smoke column that persists, embers and a scorch mark.
- **Screen shake.** Proportional to distance and size. Never nauseating.
- **Failure signs.** Sprite-looking puffs, hard-edged circles, additive white blobs, trails as thin lines, everything the same size, no lighting interplay.

### 3. Audio

These attributes come from CoH3 and WARNO soundscapes. Original or synthesized audio only.

- **Siren.** A rising-and-falling civil-defence siren, with timing matched to the alert: it starts with the HUD countdown. Distant sirens from other towns stagger in.
- **Spatial audio.** Sources pan and attenuate correctly as the camera moves. Distant booms arrive after the flash (speed of sound) and lose their highs with distance.
- **Impacts.** Weighty booms with low end and a rolling tail. Interceptor launches have a crack and a whoosh. The drone buzz is recognisable.
- **Ambience.** Night desert wind and insects, a distant town hum, and ambience that ducks under the siren.
- **Mix.** No clipping, a sensible loudness range, and no repetitive identical one-shots (variation per instance).

### 4. HUD and UX

These attributes come from AoE IV and CoH3 HUD clarity, and Iron Harvest's cinematic restraint.

- **Minimal by default.** The world carries the drama, and the HUD stays at the edges. The alert countdown is unmissable but elegant.
- **Clear hierarchy.** Objectives, countdown, budget and threat state have one place each. World markers never pile up: use decluttering, LOD by zoom and priority.
- **Shelter routing.** A first-time player understands it in seconds. Selection, route preview, ETA against the countdown, and locked shelters must be legible and clickable.
- **Typography and iconography.** Coherent typography, consistent iconography with no emoji, and Hebrew rendered correctly where used.
- **Debrief.** Reads like a game's, not a web page.

### 5. Camera and game feel

These attributes come from AoE IV camera feel and CoH3 and Iron Harvest intros.

- **Intro flyover.** Authored composition, eased motion, reveals that land on beats, and a seamless hand-off to gameplay.
- **Input responsiveness.** Pan, zoom and rotate respond immediately and smoothly with no float or overshoot. There are sensible zoom limits and edge cases (terrain clipping, extreme pitch).
- **Hit-stop and impact.** Brief and readable. It never feels like lag.
- **Pacing.** The alert, shelter and aftermath beat lands: calm, then the siren, urgency, the barrage, a quiet hold, then the all-clear and relief. There are no dead stretches over about 20 seconds.

### 6. Performance

These targets come from shipped RTS performance on mid-range laptops.

- **Target.** 60 fps at 1080p on a mid-range laptop GPU in Chrome (RTX 3050/3060 Laptop or GTX 1660 Ti class; the owner's RTX 3070 Laptop is the sign-off device). Adaptive resolution keeps lower-end integrated GPUs playable.
- **Budgets here (no GPU in this environment).** Under 250 draw calls and 1.5 M triangles at peak. CPU (JavaScript) under 4 ms median and 6 ms p95 per frame. Post-processing at half resolution where possible. No per-frame allocations that cause GC hitches. A clean console.
- **Verification.** Hardware sign-off needs the in-game F9 capture on the owner's laptop, reporting at least 59 fps average and p99 frame time at or under 22.3 ms.
