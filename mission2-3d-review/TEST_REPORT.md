# Mission 2 acceptance work — 18 October 2026

Build fingerprint: `ab362411a7ec7f1a`. This pass is confined to the isolated mission. **Full AA sign-off remains open**: character/equipment and environmental art still have study-quality limitations, and the cloud has no physical GPU.

## Changes

- Distance-driven walk/run gait with planted-foot stance, closed loops and scale compensation; ten clips per faction including cosmetic reload and two falls. A manual simulation clock keeps clips coherent across variable frame time and freezes them on pause. Firing/movement cancels reload without changing weapon cooldowns.
- Looser fabric geometry, woven normal maps, reduced specular response and refreshed unit portraits.
- Cached radius-aware routes, obstacle-safe segment smoothing, acceleration, turn limits and approach braking. Building changes invalidate routes; production uses a clear spawn cell. This is clearance-aware navigation, not full oriented-body collision.
- F9 records actual frame times after a two-second warm-up for 30 seconds. F10/the save button exports a JSON report with build, renderer, resolution, quality and percentiles. Software/unidentified renderers cannot pass the proposed hardware gate. Pauses, focus loss, changed settings and insufficient samples invalidate a capture. Art approval is always separate.
- Durable export-pack and GLB texture-extraction tools. Explicit texture extraction fixes missing baked PNGs and cached-import UID warnings.

## Verified locally

- **53 mission smoke checks**, **17 focused motion/navigation/report checks** and both infantry asset validations pass. Planted foot drift measured **0.003011 m** during the tested run stance; loop closure is checked. Clean import has no resource/script errors.
- Ordinary OS mouse/keyboard input completed the native mission at **183.742 simulated seconds**: five sites destroyed and all three towns alive (Kiryat Shmona 1972.33 HP, Metula 868.74 HP, Shlomi 2089.72 HP). It purchased a factory and four tanks and issued group/map orders. Later loop closure, scale compensation and reload-duration fixes are covered by focused checks; mission rules did not change. Evidence: `tests/evidence/native-acceptance-2026-10-18.json`.
- A real native performance capture on llvmpipe Low measured **2.91 average FPS**, **522.56 ms p99**, with 88 samples. It correctly fails hardware acceptance and flags insufficient samples. This is a software-renderer observation, not a forecast for Gad-El.
- The 72-frame in-engine movement clip is rendered offline and encoded at 24 FPS. It shows the actual assets and animation, but is **not real-time performance evidence**.

## Export and hosted review

PCK: **101,843,344 bytes**; SHA-256 `9b06a82f2fdec9feb935d13cb03169c889129a0a6d61ccbeeeadff3e09630d65`. About 140 MB on first download including WASM. The browser runtime remains the verified Godot 4.6.3 build. The final public-origin input/download and byte-integrity checks are pending deployment at the time of this export; their results will be appended after the checks.

## Remaining acceptance limits

Locomotion correctness and the tested mission flow are verified. Close-up anatomy/equipment, authentic local vegetation, structural damage variety and complete ambient/engine/footstep audio still require production work. There is no physical GPU in this cloud, and Gad-El specifications remain unknown. A hardware capture at a defined resolution/quality plus review of representative combat scenes is required before performance sign-off. The proposed 1080p High target is >=60 average FPS and p99 <=22.23 ms; that is not an art certification.

The historical reports below are retained for provenance; their counts, sizes and build hashes are superseded by this section.

---

# Mission 2 motion and support-model verification — 17 October 2026

This latest pass remains isolated from the original game. It improves the benchmark, but AA art approval and target-PC performance are still open.

## Current changes

- Infantry: eight baked skeletal actions, with hip/spine motion during walking, terrain grounding per soldier, DeathFront/DeathBack fall clips, slight stance/height variation, and frozen casualty motion while paused. Infantry deaths no longer emit vehicle-sized explosions.
- Vehicles: independent track circulation during turns, chassis pitch/roll from the terrain footprint, original shaped generic pickups with weathered atlases and rotating wheels, and more detailed launcher service/support fittings.
- Hermes: high wing, V-tail, pusher propeller, sensor housing and fixed gear informed by Elbit's product imagery. These are game-scale studies, not certified replicas.
- Pause: rocket-trail particles now stop with other effects. Command portraits refreshed from the actual models.

## Verified results

`tests/mission_smoke.gd`: **52 checks pass**, including casualty animation start/pause/resume, rocket trail pause, imported wheel nodes, rolling axle preservation, and the existing full mission logic checks. `tests/track_render_check.gd` passes against actual OpenGL: pivoting displaced the two tread samples by **−0.174 / +0.174** along their straight sections. The headless dummy renderer does not retain MultiMesh transforms, so that rendering assertion is deliberately tested separately. Both infantry GLBs retain their rigs, rifles, occlusion and all eight actions. Final Godot import has no script/resource errors.

A fresh native run used ordinary XTest mouse/keyboard input with an observer recording only visible state. It won at **186.2331 simulated seconds**, with **five sites destroyed and three towns alive**: Kiryat Shmona **1968.69 HP**, Metula **1013.145 HP**, Shlomi **2058.69 HP**. It bought a factory/four tanks, selected units and issued map orders. Completion correctly paused the mission. Evidence: `tests/evidence/native-motion-2026-10-17.json`, `native-input-motion-2026-10-17.txt`. The final pickup atlas budget reduction and imported-wheel-axis correction followed this run. The latter is covered by the rolling-axle check; neither changes mission rules.

In-engine captures inspected support vehicles, infantry walking/fallen poses and the standard mission views. Support captures deliberately arrange the models for inspection; they are marked separately from gameplay captures. No generated concept art substitutes for engine screenshots.

Current PCK: **103,012,224 bytes**, SHA-256 `10506fa0b59c5bb49c855b3deb862da0650153b68ff8206ba16db0f9b93bc589`. The export remains below GitHub's 100 MiB per-file ceiling. Smaller pickup atlases and bevel subdivision keep the download near **141 MB** including WASM.

## Direct public-browser verification

Gameplay commit `628164e08923a667fe7b74f82adff619fb8f8c39` is deployed. The direct hosted Chromium/WebGL check **passed with zero page/browser errors**: briefing, start, seven-unit selection, expanded tactical map, right-click movement verified by actual tank displacement, factory production and pause. Final observer state: 27.8415 simulated seconds, 1609 credits, one queued job, 1 FPS on SwiftShader. Evidence: `tests/evidence/browser-motion-hosted-2026-10-17.json`. This is a real hosted browser interaction check, not a full browser mission playthrough; the complete controls-driven run above used native Godot.

Verified HTTPS downloads of the public HTML, JavaScript, WASM and PCK match the local export byte-for-byte. The original public game's index hash is unchanged. Evidence: `tests/evidence/hosted-integrity-motion-2026-10-17.txt`. Browser certificate verification remained enabled, using the environment's configured managed CA.

## Limits

The cloud still has no physical GPU. Native gameplay used llvmpipe, approximately 3–4 FPS in Low; that does not predict a target gaming PC's performance. Locomotion and two authored falls improve the prototype but do not replace a complete production animation set, reloads or blended ragdolls. Asset proportions, destruction variety, authentic local vegetation and full audio production remain unfinished. Town architecture is reference-informed; mission geography is compressed.

The older report below records prior passes and is retained as historical evidence. Its build hash, sizes and test counts are superseded by this section.

---

# Earlier vehicle/environment polish verification — 17 October 2026

This report covers the isolated Godot mission. AA art approval and target-PC performance remain open; a mission victory is not an art certification.

## Controls-driven completion

Two native Godot runs used real XTest mouse/keyboard events at 960×600. The observer `tests/manual_review.gd` only recorded visible state. No resources, damage, time, or victory state were injected.

The first run won at 184.07 simulated seconds and exposed squad overlap and actors continuing to animate after victory. Both were corrected. The second run, with spacing and result freeze enabled, won at **172.71 simulated seconds**, with **all five sites destroyed and all three towns alive**. Town HP: Kiryat Shmona **1909.63**, Metula **1328.69**, Shlomi **2288.83**. It bought a factory and four Merkavas, selected groups, issued minimap orders, fought the encounters and reached victory through ordinary controls. The mission was correctly paused on completion. Evidence: `tests/evidence/native-polish-final-2026-10-17.json` and `polish-native-result.png` in the preview directory. No runtime/script errors were recorded. This is an automated controls-driven run, not a human playtest.

A subsequent input-only correction prevents Ctrl+A from also panning the camera. Final map/portrait rebakes update presentation without changing mission rules.

## Automated verification

`tests/mission_smoke.gd`: **45 checks pass**, covering identity/counts, skeleton clips, selection, costs/prerequisites, production, recon, supply, reserves, scripted sites, win/loss, map coordinate mapping, expanded map, explicit target retention, bounded simulation timing, pause, distance-driven tracks, stationary tracks, squad separation and victory freeze. These checks mutate test state and are separate from the input run above.

`tests/validate_art_assets.py`: both factions retain their rig, separate rifle, baked occlusion and Idle/Walk/Aim/Fire/Crouch/CrouchFire clips. A clean Godot import completes without script/import errors.

## Visual review

In-engine reviews cover the overview, terrain, armor, infantry ready/aim/crouch poses and tactical map. Changes include UV-baked vehicle color/roughness/occlusion with lower-hull dust; grilles, cables, fasteners and turret fittings; circulating track links and recoil; standing/crouched firing poses; planted plots, paving and exterior fixtures; impact marks; production progress/counts; and frozen animation/particles on pause. The atlas color-space error found in the first render was corrected before release.

Grass is divided into spatial chunks. At the review camera, submitted grass triangles dropped from 545,780 to 161,646. Batching flat fixture colors reduced the detailed pass from 1,630 to 1,147 draw calls. The 960×600 High profile measured about **1,074 ms/frame**, versus 1,343 before fixture batching in this polish pass. This is a bounded software-renderer observation, not a hardware-GPU forecast.

## Runtime limits

The cloud has no physical GPU: native uses Mesa llvmpipe with a four-core CPU quota, and Chromium uses SwiftShader. The controls runs were approximately **3–5 FPS in Low**. Target-PC performance is unmeasured. Low intentionally reduces resolution and removes shadows/contact shading; High is the visual review setting.

Models still need reference-locked proportions/equipment, better locomotion/reload/death animation, and more varied structural damage. Generic broadleaf scans stand in for local olive trees. Town styles are reference-informed, but the geography is compressed. Audio lacks a complete ambient/engine/footstep mix. This remains a review build rather than a signed-off AA production benchmark.

## Original game

Only `mission2-3d-review/` is published. Existing original-game files remain unchanged from release `faf2121673d281808c75494cefd97a89bec1dc5b`; original index SHA-256: `5086625a8055b0cd55d0d164e9b508a3a1673958a3ad53873584c17c54772fc3`.

## Browser publication

GitHub Pages deployed gameplay commit `52e3b97481ec6f2fd58af24832d429dfc99d4fa6`. A **direct public-origin Chromium/WebGL run passed with zero browser/page errors**. It loaded the briefing, automatically selected Low for SwiftShader, began the mission, selected all seven initial units, opened the Tab map, issued a right-click map order, verified actual Merkava displacement, queued a factory and paused. Final observed state: 30.35 simulated seconds, 1645 credits, one queued job, 1 FPS on software WebGL. Evidence: `tests/evidence/browser-polish-hosted-2026-10-17.json`; browser screenshots `benchmark-polish-hosted-tactical.png` and `benchmark-polish-hosted-overview.png`.

Browser HTTPS certificate verification remained enabled. The environment's configured managed CA was registered with the browser NSS trust store; no certificate-error bypass and no response-fulfillment workaround were used.

The public HTML, JavaScript, WASM and PCK matched the local export byte-for-byte over verified HTTPS. The original public game retained its original hash. PCK: **97,218,260 bytes**, SHA-256 `a64ca21d39662113106371974b1f790bfe3469faed8b5454e9ef399e769b16c3`. First download is approximately 135 MB including WASM. The source and offline-browser archives are rebuilt and CRC-checked separately.
