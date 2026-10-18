# Reference-based equipment and whole-game research — 18 October 2026

Build fingerprint `c32d1bc00e6a72cf`; PCK 103,213,108 bytes; first download about 141 MB.

The current-day Golani visual rifle is an original M4-family Blender study. The user explicitly requested equipment Golani uses nowadays; an official IDF article dated 14 July 2026 describes the transition to M4, and Golani training photographs dated 12 August 2026 were inspected. Exact attachment brands remain approximate. The earlier X95 blockout is superseded for this target. The opposing infantry now use a distinct fixed-stock AKM-family study based on two museum profiles. Sources and the decision are recorded in `data/visual_equipment.json` and `docs/asset-research/`. No original-game files or balance values changed.

The catalogue reconciles all 39 units, 78 structure definitions, 20 weapon profiles and 7 faction powers with the existing 474-record production plan. There are 154 required geometry work items (76 masters, 78 modules). 154 reference images/manufacturer pages were visually inspected; source candidates are attached to 117 required geometry records. Wrong-system, scale-model, replica and wrong-era images are explicitly rejected; unresolved variants remain open. These counts do not imply all assets are modeled or reference-locked.

Both infantry GLBs retain exactly ten clips, deformation rigs, separate rifle meshes, baked AO and textile normals. Golani now has six material surfaces and opposing infantry four; automatic import LOD generation remains enabled. Standing, crouch and cosmetic reload poses were inspected under actual mission lighting. Reload clips remain cosmetic poses, not complete magazine handling. All 53 mission smoke checks and 17 motion/navigation/report checks pass; planted-foot drift is 0.003011 metres in the checked stance. Evidence: `tests/evidence/current-rifle-assets-2026-10-18.txt` and `current-rifle-regressions-2026-10-18.txt`.

The searchable research gallery passes browser checks at widths 320, 390, 844 and 1440 pixels: 39-unit/78-structure/474-production coverage, faction/search filters, current Golani M4 notes, image decoding and no horizontal overflow or page errors. Blender/GLB downloads are original authored models. Studio renders are labeled separately from in-engine captures. Reference photographs are linked rather than redistributed. Evidence: `tests/evidence/research-gallery-2026-10-18.json`.

The final local Web export passed a Chromium/WebGL input run with zero browser/page errors: briefing, start, all-seven selection, tactical map order, actual tank displacement, factory production and pause. Final simulation time 28.5841 seconds; 1621 credits; one queued job. Renderer is SwiftShader at about 1 FPS, not a target-GPU benchmark. Evidence: `tests/evidence/browser-current-rifle-local-2026-10-18.json`.

The refreshed main phone gallery also passes at 390×844, 320×568, 844×390 and 1440×900, including before/after image switching, full-size links and actual video playback with no PCK/WASM download. This is Chromium mobile/touch emulation, not physical iPhone/Safari testing. Evidence: `tests/evidence/phone-current-rifle-local-2026-10-18.json`.

AA/AAA visual sign-off remains open. These are study models; the cloud has no physical GPU. Prior complete native mission victory remains the latest full playthrough; this pass changes visual assets and documentation. Later sections are historical reports and their build IDs, material counts and asset descriptions refer to earlier versions.

---

# Mission 2 acceptance work — 18 October 2026

## Infantry and combat headgear refinement

Current build fingerprint: `b77710d0c4e05609`; PCK 101,459,760 bytes; first download about 139 MB. Earlier acceptance sections below describe their respective older builds.

Both infantry models now use localized cloth folds, padded sewn pouches, shaped carriers, subdued textile shading, warmer skin variation and smaller boots with soles and laces. Weapon materials are dark steel/polymer. Combat helmets have a deeper protective shell, fitted cover, a bound rim and four-point chin retention; the old shallow cap silhouette was removed following the user’s correction. These remain authored study models rather than verified reproductions of every issued kit item.

Albedo atlases remain 2048px; normal, roughness and AO are 1024px. Each soldier retains three material surfaces. Removing orphaned cross-character actions gives exactly ten animation clips per faction. The asset check now rejects duplicate or unexpected clips. Boot soles/laces and sleeve details inherit nearby garment deformation so they follow bent ankles and arms rather than a mismatched rigid bone. No gameplay rules changed.

The phone gallery gains a matched before/after infantry comparison in the actual mission lighting. Both close-ups are deliberately staged asset inspections. The motion clip, mission overview and portraits are refreshed from the rebuilt models. All changes remain in the isolated mission.

Final rebuild: both exact-ten-clip asset checks, 17 motion/navigation/report checks and 53 mission smoke checks pass. Clean import has no script/resource errors. Standing, crouch and reload close-ups were inspected in native Godot; visible boot-lace drift found in an intermediate crouch capture was corrected before release. Evidence: `tests/evidence/infantry-assets-2026-10-18.txt`, `infantry-motion-2026-10-18.txt`, `infantry-smoke-2026-10-18.txt`. These checks establish functional regression coverage, not AA art or target-PC performance approval.

The final local Web export passed a real Chromium/WebGL input run with zero browser/page errors: briefing, start, all-seven selection, tactical map order, verified Merkava displacement, factory production and pause. Final observed simulation time 35.60 seconds, 1705 credits, one queued job. This run uses SwiftShader (about 1 FPS), not a hardware GPU. Evidence: `browser-infantry-local-2026-10-18.json` and `.txt`. The previous full native victory run remains the most recent full playthrough; this pass changes character presentation and leaves mission rules intact.


The updated phone gallery passes local checks at390×844,320×568,844×390 and1440×900: before/after image and full-size link switching, image decoding, navigation, explicit touch Play and video progression, with no page errors, body overflow or PCK/WASM downloads. Its seven WebP previews total about1.8MB; the3-second H.264 clip loads on request. This is Chromium mobile/touch emulation, not physical iPhone/Safari testing. Evidence: `phone-infantry-local-2026-10-18.json`. The previous and updated soldier views use matching mission light, camera and staged positions.

## Phone review gallery — 18 October 2026

Published `review/` at commit `93a17ed348e2e00a747c2170f007491b4b53c5ac`. It presents actual engine captures, compressed WebP previews, links to original PNGs and an explicit touch-friendly Play button for the existing offline three-second clip. Its six previews total about 1.6 MB; the video loads on demand. The caption distinguishes offline animation rendering from live performance. The existing playable mission still requires keyboard and mouse.

Local and direct hosted-browser checks passed at 390×844, 320×568, 844×390 and 1440×900, with no page errors or horizontal document overflow. Image decoding, section navigation, full-size image opening, actual touch activation of the Play button and video progression passed. No PCK or WASM requests occurred. These are Chromium mobile/touch emulation checks, **not physical iPhone or Safari verification**. Evidence: `tests/evidence/phone-review-local-2026-10-18.json` and `phone-review-hosted-2026-10-18.json`. Gameplay PCK and original release files were not changed by this gallery pass.

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

PCK: **101,843,344 bytes**; SHA-256 `9b06a82f2fdec9feb935d13cb03169c889129a0a6d61ccbeeeadff3e09630d65`. About 140 MB on first download including WASM. The browser runtime remains the verified Godot 4.6.3 build. Gameplay commit `b6540102bad840c02614e861b7eccb95bc94139d` is deployed. **Direct hosted-browser checks passed with zero browser/page errors**: briefing, start, selection of all seven initial units, tactical map, right-click order with verified tank displacement, factory production, report capture, visible save-button JSON download, report close and pause. The downloaded report matches the captured sample count and identifies build `ab362411a7ec7f1a`. SwiftShader recorded about 1 FPS and 2032.1 ms p99 (31 samples); the report correctly leaves hardware acceptance false and marks the sample count insufficient. The UI was inspected in the actual browser screenshot. This is a browser interaction check; the full mission completion above used native Godot.

Public HTML, JS, WASM and PCK match the export byte-for-byte over verified HTTPS. The original game's public index hash is unchanged, and the repository diff outside `mission2-3d-review/` remains empty against `faf2121`. Browser TLS verification was enabled throughout. Evidence: `tests/evidence/browser-acceptance-hosted-2026-10-18.json`, `performance-browser-2026-10-18.json`, and `hosted-integrity-acceptance-2026-10-18.txt`.

## Remaining acceptance limits

Locomotion correctness and the tested mission flow are verified. Close-up anatomy/equipment, authentic local vegetation, structural damage variety and complete ambient/engine/footstep audio still require production work. There is no physical GPU in this cloud, and performance on Gad-El and Shir-GE remains unmeasured (their specifications are saved in tests/evidence). A hardware capture at a defined resolution/quality plus review of representative combat scenes is required before performance sign-off. The proposed 1080p High target is >=60 average FPS and p99 <=22.23 ms; that is not an art certification.

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
