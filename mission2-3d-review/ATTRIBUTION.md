The [`dirt_aerial_03`](https://polyhaven.com/a/dirt_aerial_03) diffuse and OpenGL normal textures, [`concrete_wall_001`](https://polyhaven.com/a/concrete_wall_001) diffuse texture, and [`asphalt_02`](https://polyhaven.com/a/asphalt_02) diffuse and OpenGL normal textures are from Poly Haven and released under [CC0](https://polyhaven.com/license). They are used as prototype terrain, building and road materials. The Merkava mesh is original to this project; its build script is in `assets/models/build_merkava.py`.

The [`boulder_01`](https://polyhaven.com/a/boulder_01) and [`shrub_02`](https://polyhaven.com/a/shrub_02) models and their textures are also from Poly Haven under CC0. The download manifest for these environment studies is implemented in `assets/download_polyhaven_models.py`. They are stand-ins for eventual Galilee-specific rock and vegetation assets; they do not establish a botanically accurate olive grove.

The [`aerial_grass_rock`](https://polyhaven.com/a/aerial_grass_rock) and [`rocky_terrain_02`](https://polyhaven.com/a/rocky_terrain_02) textures, and [`island_tree_01`](https://polyhaven.com/a/island_tree_01) model/textures, are Poly Haven CC0 assets. `assets/models/broadleaf_tree.glb` is an optimized derivative of Island Tree 01, created with `assets/models/optimize_tree.py`; it is a broadleaf stand-in, not an authenticated olive-tree asset.

The [`coast_rocks_05`](https://polyhaven.com/a/coast_rocks_05) scan and textures are Poly Haven CC0. `assets/models/scanned_outcrop.glb` is an optimized derivative created with `assets/models/optimize_rocks.py`. The unused `rock_face_01` study is also Poly Haven CC0.

The infantry's anatomical base mesh, adult body target, skeleton and deformation weights come from [MakeHuman](https://github.com/makehumancommunity/makehuman), whose bundled graphical assets are [CC0](https://github.com/makehumancommunity/makehuman/blob/master/LICENSE.ASSETS.md). The source assets' own CC0 notices are retained in `assets/model_sources/makehuman`; the license text is in `assets/licenses/MakeHuman-CC0.md`. No MakeHuman application code is included. The clothing treatment, equipment, poses, animation baking and export script are original project work. Houses, launchers, grass geometry and UI icons are also original project code.

The October 17 visual revision adds Poly Haven CC0 albedo, normal, roughness and AO materials: [rough_plaster_03](https://polyhaven.com/a/rough_plaster_03), [roof_tiles_14](https://polyhaven.com/a/roof_tiles_14), [rock_wall_16](https://polyhaven.com/a/rock_wall_16), [gravelly_sand](https://polyhaven.com/a/gravelly_sand), [brown_mud_03](https://polyhaven.com/a/brown_mud_03), [gravel_floor_02](https://polyhaven.com/a/gravel_floor_02), [metal_plate](https://polyhaven.com/a/metal_plate), and the additional maps for concrete_wall_001. Some materials are retained as studies. The [grass_bermuda_01](https://polyhaven.com/a/grass_bermuda_01), [concrete_road_barrier](https://polyhaven.com/a/concrete_road_barrier), and [old_military_crate](https://polyhaven.com/a/old_military_crate) meshes/textures are also Poly Haven CC0. The runtime grass now instances the scanned Bermuda grass geometry. The character PBR atlas baking, screen-space contact shading, road blending and particle effects are original project code.

## Interface revision, 17 October 2026
- Open Sans Regular and Semibold: Google Corporation, Apache License 2.0. Bundled font copyright notice and full license are in `assets/ui/fonts/`.
- Command portraits: generated in Godot from the actual project meshes by `tests/render_portraits.gd`; underlying mesh/texture licenses above still apply.
- Tactical relief texture: generated from this mission's height function. No Google Maps tiles or reference photographs are included. Architecture research links and limitations are recorded in `ARCHITECTURE_REFERENCES.md`.

## Benchmark audio pass
- `audio/rifle.wav`: SKS recording from Tabasco / OpenGameArt, **Gunshot Sounds**, CC0. https://opengameart.org/content/gunshot-sounds . Original archive's CC0 notice retained as `audio/Gunshot-CC0.txt`. Used as a generic rifle report, not a claim to reproduce a specific issued weapon.
- `audio/explosion1.ogg` through `explosion3.ogg`: **Explosions**, EZduzziteh / OpenGameArt, CC0. https://opengameart.org/content/explosions-4 . Attribution follows the source page; these are game sound effects, not documentary recordings.

## Vehicle and motion polish, 17 October 2026
The vehicle atlas rasterizer, scene-BVH occlusion bake, mechanical fittings, distance-driven track links, aiming/crouch/recoil clips, settlement fixtures, impact marks and HUD production indicators are original project work. No additional third-party artwork was introduced in this pass. The vehicle atlases use authored colors, deterministic grain and lower-hull dust, with baked occlusion; they are not photographic scans or reference-locked military reproductions.

## Support vehicles and motion follow-up, 17 October 2026
`build_light_vehicles.py` authors generic pickup/launcher studies, with no specific manufacturer or weapon variant claimed. The Hermes silhouette was compared with [Elbit Systems' Hermes 450 product page](https://www.elbitsystems.com/autonomous/aerial/tactical-uas/hermes-450) and its main banner on 17 October 2026: high straight wing, V-tail, rear pusher, underbody sensor and fixed gear. That photograph is reference-only and is not shipped. The game-scale airframe, support details, wheel/track motion, skeletal walk/fall clips and terrain alignment are original project work. These remain game studies, not dimensionally certified replicas.

## Locomotion and acceptance work, 18 October 2026
The distance-calibrated walk/run cycles, reload poses, cloth weave normal baking, radius-aware navigation, performance report and export/texture-extraction helpers are original project work. No additional third-party assets were imported. The infantry retain the MakeHuman CC0 base and licensing described above.


### Infantry material and combat-headgear refinement — 18 October 2026
Original authored work in `models/infantry_finish.py`: sewn pouches and carrier cutouts, localized garment folds, skin color variation, muted textile/camouflage shaders, and a deep combat helmet shell with fitted cover, bound rim and four-point retention. Existing MakeHuman CC0 anatomical mesh and weights remain the base. No downloaded reference photograph is used as an asset or texture.

Helmet shape reference: [Dalitex ACH/MICH low-cut helmet](https://dalitextactical.com/products/ach-mich-tactical-ballistic-helment-nij-l3a-low-cut-olive-green), viewed 18 October 2026. The model is an original generic combat-helmet study, not a verified reproduction of a particular issued variant. Israeli field infantry must use combat headgear rather than a beret; this is a user-established art requirement.


## Reference-based rifle studies — 18 October 2026

`models/reference_rifles.py` and `models/current_golani_rifle.py` are original exterior game-art geometry with authored materials. The current Golani target is M4-family equipment, following the user’s explicit request for what Golani uses nowadays. Official IDF reporting dated 14 July 2026 describes the transition to M4; Golani training photographs dated 12 August 2026 were visually inspected. The Colt 2026 MLE catalogue, page 8, provides supporting exterior profiles. Accessory brands and exact individual soldier configurations are not asserted. Sources and the decision are recorded in `data/visual_equipment.json`.

The AKM exterior study uses both profiles of a 1971 Swedish Army Museum specimen: https://commons.wikimedia.org/wiki/File:AKM_automatkarbin,_Ryssland_-_7,62x39mm_-_Arm%C3%A9museum.jpg (Armémuseum, CC BY 4.0). The photograph is not shipped as a texture. Wood grain and surface maps were authored procedurally. This is an AK-family appearance candidate, not proof of a uniform Radwan loadout.

The earlier X95 blockout used IWI’s 2021 X95 brochure (https://iwi.net/wp-content/uploads/2021/03/IWI_X95_brochure_2021_EN.pdf) and is retained separately as a superseded historical study. It is not the current-day Golani selection. The research gallery links references without redistributing the downloaded photo collection.


## Merkava Mk4M exterior refinement — 18 October 2026

`models/build_merkava_refined.py` authors a new exterior study from six inspected real-vehicle photographs. Sources, image hashes, observations and limits are in `docs/asset-research/merkava-refinement.json`, and linked from the phone armor review. They include IDF field/training photographs and Zachi Evenor exhibition views on Wikimedia Commons. No downloaded photograph is shipped or used as a texture. Geometry, colors, grain, surface normals and occlusion atlases are original project work.

The model approximates a conventional Trophy-equipped Mk4M, rather than Mk3 or Barak. Rear-view reference coverage and exact equipment shapes remain incomplete. The hull/turret/gun assemblies, barrel-bound muzzle marker and revised track-shoe geometry are authored for the isolated mission.

The painted side chevrons are fictional tactical markings for game identification. They do not identify a verified real tank or unit.
