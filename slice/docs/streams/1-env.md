# Stream 1: Environment and lighting

**Owner:** builder `env`.

**Files you own:** `src/env/**`. You may also change the building-generation part of `src/world/layout.js`: types, sizes, heights, skyline composition and new decorative data. Keep streets, shelters, groups, pads and street lights valid, and run `node tools/regress.mjs` after any change there.

**Benchmark:** `../../benchmark/TARGET.md` §1. References: CoH3 night maps, Iron Harvest atmosphere, Total War: Warhammer III vistas, and Cities: Skylines II night lighting.

## Current state

The baseline works but is first-pass:

- **Sky:** gradient, stars, a crescent moon low in the west, and light-pollution domes.
- **Terrain:** one warped-grid mesh with vertex colour and procedural detail, plus a Dead Sea plane.
- **Town:** 334 box buildings in one mesh, with a procedural window shader whose windows wake up during the alert. Rooftop solar heaters are instanced boxes. Street lights are poles plus additive heads plus additive ground pools. Palms are cones; trees are icosahedrons.
- **Other:** shelter boxes, Nevatim runway lights, distant town lights, battery pads and placeholder launchers, and crowd figures made of boxes with limb swing.
- **Post:** N8AO, then mipmap bloom, grade, AgX, look, vignette and grain, then SMAA.

Known problems you can see in the shots:

- The terrain is too dark or too blue and reads as a void in places.
- Roads read as thick black grids.
- Buildings are plain boxes with no balconies or depth.
- A huge white bloom blob appears near the lookout in `S3-drones`; it is probably the pad floodlights or the launch-flash light.
- There is no atmospheric depth between foreground and mid-ground.
- Moab and the escarpment silhouettes are weak.

## Goals, in priority order

1. **Exposure and atmosphere.** Aim for a moonlit night that is legible like an RTS night map. Add height and distance fog with atmospheric perspective that separates layers. Put a warm light-pollution dome over Arad and the airbase. Make the horizon read against the sky.
2. **Skyline and town.** Israeli Negev vernacular in original, generic forms: 4-storey slab blocks with balconies and stairwell lights, a few towers in the centre, low houses with walls, and rooftop solar heaters and tanks. Vary window patterns: some dark floors, colour temperatures, blinds. Add light pools and believable streets: asphalt, sidewalks, curbs, lane paint, parked cars with no brands. Shelters should look like Israeli public shelters, with a concrete entrance, a green sign glow and **no official emblem**.
3. **Terrain.** Make the escarpment dramatic, with cliff bands and wadis. Moab should form layered silhouettes. The Dead Sea needs moonlight glints, salt flats and shoreline lights. The desert near the town needs material variety and no faceting near the camera.
4. **Post and lighting.** Tune N8AO, bloom and grade. Make big intercepts and impacts visibly light the town and terrain through `ctx.lights.flash` (VFX calls it; you own how it looks). Add a tasteful red-alert grade, not a red filter. A moon shadow map is optional and only if affordable.
5. **Crowd figures** (`env/crowd.js`). They should be readable and natural in the close shot `S4-alert`: varied silhouettes, kids, a few elderly, lit by street lights, with a running cycle that reads. They disappear into shelters nicely; no popping in view if you can avoid it.
6. **Battery models and pads.** Generic, credible launchers, radars and command trailers. No markings.

## Critic evidence

- **Shots:** `S1-intro`, `S2-tactical`, `S3-drones`, `S4-alert`, `S5-street`, `S6-salvo`, `S7-aftermath`.
- **Clean environment shots:** the same with `--ui 0`.
- **Budget:** env ≤ 120 draw calls and ≤ 1.1 M triangles at peak. Check with `tools/perf.mjs`.

## Don'ts

- Don't add assets you didn't create. Don't add real logos or insignia.
- Don't move pads, shelters or groups.
- Don't change canonical shots.
- Don't add CDN dependencies.
