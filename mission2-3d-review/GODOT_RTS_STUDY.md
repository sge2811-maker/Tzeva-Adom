# Godot RTS source study and applied landscape pass

18 October 2026. Scope: isolated Mission 2. Original game remains outside this pass.

## What was found

The closest verified match is [Ironbound by Destin Jones](https://github.com/destinjones/ironbound), a Godot 4.7 RTS derived from Lampe Games' Open RTS. The creator explicitly describes using Claude to write most of the code on the [creator page](https://destinjones.github.io/ironbound/about.html) and [open-source page](https://destinjones.github.io/ironbound/open-source.html). Both pages were fetched successfully over HTTPS, alongside the GitHub source. Its repository was renamed from `godot-open-rts` to `ironbound`; old website URLs can return 404.

Pinned inspection: [`2993c773483af8b28f1fb05627f4029322097470`](https://github.com/destinjones/ironbound/tree/2993c773483af8b28f1fb05627f4029322097470). MIT license verified. Research inspected source, published screenshots and documented methods; Ironbound was not played or benchmarked in this pass.

**AA qualification was not verified.** The inspected battle, city-handover and roads screenshots show a coherent stylized RTS with simple polygonal assets. That is useful engineering and presentation evidence, not proof of AA production quality. The search did not establish an exact match satisfying every requested criterion.

Other candidates checked:

| Project | Why it was not the main benchmark |
| --- | --- |
| [Open RTS](https://github.com/lampe-games/godot-open-rts) | A useful MIT Godot 4.3 template. Its README explicitly targets simplicity rather than competition with advanced RTS games; UI polish and VFX remain unchecked. AI-assisted authorship was not established. |
| [Crusade](https://github.com/saman-mb/crusade-rts) | MIT Godot 4.4.1 isometric terrain/editor foundation. README says combat, economy, fog, AI and HUD are not built. Its showcased golden-hour grade and fire glow include a screenshot post-pass, so those cannot establish live graphics quality. |
| [Frontier Command](https://github.com/buicongnguyen/3d_astra_godot) | Godot/Blender RTS with documented lightweight environmental life. No repository license was returned by the GitHub API; no source/assets reused. AA quality and vibe-coding provenance were not established. |

## What Ironbound actually does

| Source inspected at the pinned commit | Method | Application here |
| --- | --- | --- |
| [`Look.gd`](https://github.com/destinjones/ironbound/blob/2993c773483af8b28f1fb05627f4029322097470/source/match/environment/Look.gd), [`grounded.json`](https://github.com/destinjones/ironbound/blob/2993c773483af8b28f1fb05627f4029322097470/data/looks/grounded.json) | Coordinate environment, sun, haze and terrain through a shared look definition. | `data/galilee_look.json` drives the mission's sun, ambient fill, haze, ground palette, land-use regions and wind. Clear autumn light suits this mission; desert colors were not transplanted. |
| [`desert_terrain.gdshader`](https://github.com/destinjones/ironbound/blob/2993c773483af8b28f1fb05627f4029322097470/source/shaders/3d/desert_terrain.gdshader) | Biome weights, broad/mid/fine variation, domain warping, slope-based rock and pixel-footprint detail attenuation. | Original Galilee shader now uses authored orchard/scrub vertex weights, independently scaled photographic samples, broad color variation, slope-aware limestone and weaker distant normals. Existing licensed textures remain the inputs. |
| [`foliage_sway.gdshader`](https://github.com/destinjones/ironbound/blob/2993c773483af8b28f1fb05627f4029322097470/source/shaders/3d/foliage_sway.gdshader), [`Wind.gd`](https://github.com/destinjones/ironbound/blob/2993c773483af8b28f1fb05627f4029322097470/source/match/environment/Wind.gd) | Height-weighted root-preserving bend, a shared wind direction, variation and instancing. | Existing grass and garden/scrub materials now share restrained wind driven by simulation time. Root displacement is zero; briefing, pause and mission-end freeze motion. Main broadleaf trees remain static. |
| [`Wildlife.gd`](https://github.com/destinjones/ironbound/blob/2993c773483af8b28f1fb05627f4029322097470/source/match/environment/Wildlife.gd), [`CityLife.gd`](https://github.com/destinjones/ironbound/blob/2993c773483af8b28f1fb05627f4029322097470/source/match/environment/CityLife.gd) | Environmental life uses MultiMesh instances rather than an independent processing node for every detail. | New low scrub uses existing scanned foliage in spatial chunks. Placement follows limestone belts and orchard edges, with road, fence and house exclusions. Low graphics reduces its visible count to 25%. No decorative people or unrelated desert wildlife were added. |
| [`art-direction.md`](https://github.com/destinjones/ironbound/blob/2993c773483af8b28f1fb05627f4029322097470/docs/art-direction.md), [`ASSET_CREDITS.md`](https://github.com/destinjones/ironbound/blob/2993c773483af8b28f1fb05627f4029322097470/ASSET_CREDITS.md) | Judge silhouette at the game camera, inspect before/after, and keep an explicit asset pipeline. Their current pipeline also uses paid concept/image-to-3D tools. | Before/after actual-engine overview retained for phone review. We use the available Godot/Blender pipeline and do not claim access to their paid 3D-generation services. |

All mission code in this pass is original implementation of these ideas. No Ironbound code, textures, generated models or screenshots are redistributed in the game. This research credit does not imply endorsement by its authors.

## Review and practical limits

The initial matched capture shows less patchy, repetitive ground, quieter fine relief and stronger orchard/open-ground separation. Understory placement is deliberately sparse and lower than 68cm, so tactical visibility remains the priority. Existing roads, town architecture, unit models, mission rules and navigation obstacles are retained.

The new 11-check rendered landscape review checks ground contact, shrub height, planting clearance, instance budget, wind pause and Low/High restoration. It requires an actual rendering server: Godot's headless dummy server returns identity MultiMesh transforms, which cannot validate placement. Use `DISPLAY=:99 ... godot --path . --script res://tests/landscape_review.gd`, without `--headless`.

Cloud captures use llvmpipe; browser checks use SwiftShader. Neither is a target gaming GPU. This pass does not close the remaining character animation, material fidelity, wider settlement composition or real-hardware acceptance gaps, and does not establish AA/AAA sign-off.
