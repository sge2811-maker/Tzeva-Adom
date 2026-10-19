# Mission 2: AA visual slice target

This document governs the **isolated Godot mission**, not the released browser game. The initial mechanics prototype failed the visual target: box-shaped buildings and soldiers, sparse flat terrain and simple effects. The current isolated art pass adds varied houses, rigged infantry, smooth terrain, scanned outcrops, trees and a redesigned HUD. It still needs further fidelity, animation and combat-effect work before AA sign-off.

## Target scene

Build one representative Northern Front engagement around a Galilee town and a concealed launch position. It should show the Merkava IV, a Golani squad, a Radwan squad, a launch site and bunker, two distinct residential buildings, a rural paved road, stone retaining walls, olive trees, scrub and rocky ground. Keep the mission rules and controls working. Do not replace all 31 missions or touch the original release during this gate.

Use photo and manufacturer references to lock each real-world asset's variant, scale, silhouette, materials and identifying equipment. The Merkava is currently only a Mk IV/Trophy **study**; its exact subvariant is unresolved in the separate source-wide asset audit. Do not use unlicensed downloaded meshes or imply exact authenticity where the reference is uncertain.

## Acceptance gate

1. **Models:** hero vehicles have correctly proportioned hulls, turrets, track geometry, stowage and equipment; soldiers have articulated anatomy and distinct clothing/equipment silhouettes. Nearby assets should not read as primitives or generic blocks.
2. **Materials:** UV-unwrapped PBR materials include color, normal and roughness detail appropriate to painted armor, fabric, stone, concrete, vegetation and road surfaces. Dirt, wear and damage should vary by exposed surface and location rather than uniformly tinting an object.
3. **Environment:** the encounter has convincing terrain relief, grounded roads, believable olive groves and varied buildings. Details must support both a close inspection view and the normal RTS camera. No isolated repeating texture or straight-edged terrain polygon should dominate the frame.
4. **Motion and combat:** infantry locomotion, vehicle track/turret movement, firing, impacts, smoke, dust and damage states must read at game speed. A still render alone does not pass.
5. **Presentation:** directional lighting, contact grounding, atmospheric depth, labels, selection outlines and command UI must be legible and visually consistent. Full-screen screenshots should look like one designed scene.
6. **Play and performance:** review the scene in-engine at normal and zoomed RTS distances, test the actual mission controls, and measure frame time on a defined machine. Offer low-quality settings if the eventual integrated-GPU target requires them; the Gad-El machine's specifications are still unknown.

A render passes only when the same assets hold up in a captured, playable encounter. Sign off on a short in-engine walkthrough and screenshots before multiplying the art pipeline across the 154 required geometry work items identified in the separate source-wide production audit. The 154 count is for the whole game, not for this slice.

## Current gap and next production order

| Area | Current isolated build | Required next pass |
| --- | --- | --- |
| Merkava | Authored UV atlas with surface variation, lower-hull dust and ray-tested occlusion; independent turret, additional mechanical fittings and circulating track links | Reference-locked proportions, additional equipment accuracy and material refinement |
| Golani and Radwan | Rigged anatomical meshes, ten clips including distance-driven walk/run, reload and two falls; baked PBR cloth normals | Field-kit accuracy, close-range face/clothing detail, more natural transitions and varied reactions |
| Launch site and bunker | Authored Blender installations with concrete/metal materials and wreckage | More convincing concealment, damage silhouettes and close-range equipment detail |
| Town | Reference-informed stone cottages, plaster homes and apartment blocks, with shutters, pergolas, tiled roofs and solar hot-water equipment | Planted plots, roof plumbing, benches, drainage and lamps added; further facade wear and accurate street layouts still need work |
| Terrain and vegetation | Blended CC0 materials on smooth relief, optimized tree/outcrop scans, scanned instanced grass, weathered props and road shoulders | Sculpted local terrain, rock and olive-tree assets, varied ground blending and grounding decals |
| Combat | Muzzle flashes, recoil, rocket trails, dust, 90-second impact marks and wreckage; actors freeze on pause/result | More varied destruction, persistent structural damage and richer audio |
| Camera and UI | Perspective camera, contact shading, separate command panels, rendered unit portraits, group health, shaded-relief minimap with labels and markers | Further readability/scale testing on the target machine, richer unit states and production-queue presentation |

Start with the **encounter environment and two opposing infantry kits**, because they occupy far more of the frame than the tank. Review a complete encounter in Godot before producing the remaining mission assets. Keep source and texture license records alongside every imported asset.

## Benchmark review pass — 17 October 2026, evening

The new gate includes a completed OS-input-driven mission run (all five sites, all three towns), 38 automated checks, and a redesigned square minimap with expandable Tab tactical map. The map uses a terrain bake from the actual isolated scene; contacts and objectives remain live overlays with concealed-hostile filtering. See the rewritten `TEST_REPORT.md` for exact evidence and caveats. This is still a review candidate: AA art sign-off and target-PC performance sign-off remain open. Do not reinterpret successful logic tests or a mission victory as AA certification.

## Additional polish review
Armor now has UV-baked color/roughness/occlusion, hull dust, cooling grilles, cables, fasteners, turret fittings and moving track shoes. Infantry blend between standing and crouched firing poses, and local spacing prevents squads from occupying the same point. Houses have more exterior fixtures and planted plots. Production cards show live progress and counts. Grass uses spatial chunks; flat fixture colors are batched as vertex colors to reduce draw calls. These changes improve the review build; they do not remove the reference, animation and target-hardware gaps in this acceptance gate.

## Acceptance review — 18 October 2026

| Gate | Evidence | Decision |
| --- | --- | --- |
| Locomotion correctness | 17 focused checks; actual foot-bone stance drift 3 mm; closed jog loop; pause, firing interruption and frame-rate-independent gait phase | Pass for the tested clips and cases |
| Navigation clearance | Radius-aware routes and sampled-segment smoothing; tank turns before translating; a full controls-driven mission victory | Pass for tested routes, not oriented-body physics or all props |
| Mission playability | 53 smoke checks and full native controls run, all five sites and all three towns | Pass for the tested mission run |
| AA character/environment art | Close-up engine capture still shows study-level equipment, faces and vegetation; structural damage and ambient mix remain limited | Open |
| Target-PC performance | Previous build measured on RTX 3070 Laptop: 26.6 FPS at 2679×1676 High, p99 48.1 ms; cloud checks use software rendering | Open: target not met in that capture; new build and exact 1080p target need hardware retesting |

The performance report proposes 1080p High at 60 average FPS with p99 frame time <=22.23 ms. This target is deliberately separate from art approval. Passing that sample does not certify the entire mission or the AA art gate. Review several representative combat/camera situations on the chosen PC before hardware sign-off.


### Mk4M refinement checkpoint, 18 October 2026
The isolated mission now uses a photo-informed Mk4M exterior with independent hull/turret/gun assemblies and a barrel-bound muzzle marker. The downloadable armor review shows actual engine captures at matched camera positions. This pass does not establish AA/AAA art approval. Detailed fittings, cloth, plate surfacing, broader infantry/environment quality and physical gaming-PC review remain open.
