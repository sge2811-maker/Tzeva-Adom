# Matched RTX evidence and gameplay script profiling — 21 October 2026

Build `83ec790d07337d08`; PCK 102,138,736 bytes, SHA256 `4e5af0864f3e97cab60336f988ccd229728ca5c86e08b35a7e88ef58b6d30242`. Same Godot4.6.3 Compatibility/Web runtime. Only the isolated review is in scope.

The user reports a successful RTX3070Laptop matched frozen-scene comparison at1920×1080High on c95500083d48235f, invalid reasons empty. Combined ABBA results: individual40.26FPS/p9529.5ms/p9931.9ms/1071calls; spatial40.21FPS/p9529.5ms/p9931.1ms/865calls, approximately0.44ms additional synchronization CPU work perframe. Draws fell19.2% with no demonstrated average FPS gain. A small p99 difference alone does not establish a repeatable gain. **Rifle batching remains disabled by default.** The lower draw count is not evidence that this scene is limited by draw submission, and the test does not identify the actual bottleneck. The latest active-gameplay hardware result remains19.31FPS/p9969.3ms on a269be0d02bc229a; the matched paused test does not replace it or qualify60FPS/art approval. Cloud inspected only the pasted summary, not the local mission2-rifle-comparison (1).json. Per-run raw samples/counts were not supplied. Evidence: tests/evidence/shir-ge-rifle-matched-summary-2026-10-21.json; hardware/spec records keep this separate from gameplay.

Normal F9 now records a nested script_profile schema1 within the existing schema2 gameplay report. Only while capturing, elapsed wall timers split the main._process span into camera/bookkeeping, bounded simulation, animation submission and HUD update. Records include engine-frame index, mission time, simulation-step count, per-stage raw durations and mean/p95/worst summaries. The collector runs after main at process priority100; missing same-frame traces are counted and never reused as current observations. New captures clear all traces. Ending the mission during a capture now invalidates it with mission_ended. Normal F10 downloads include the profile. No new gameplay controls or mutable browser API were added.

Scope: elapsed wall time, including any blocking inside the timed calls. Animation submission excludes later bone/skinning work; HUD updates exclude later CanvasItem drawing. Engine render submission, physics, browser scheduling and GPU execution outside the timed span remain unattributed. Recorder overhead after the end timestamp is excluded; timers/recording add capture overhead. Frame intervals span collection checkpoints rather than GPU-query boundaries. **Unattributed time must not be labeled GPU time.** gpu_time_ms stays null because no GPU timer is instrumented. This profile can identify expensive script stages; it cannot establish a CPU/GPU bottleneck on its own. No FPS optimization or recovery is claimed for this diagnostic release. Graphics, assets, simulation rules and original game remain unchanged.

Validation:38focused timing/report assertions,53mission regressions and17motion/navigation/report checks pass. Checks cover additive/nonnegative stages, simulation step counts, capture resets, same-frame coverage, missing traces, pause, mission end, serialization and null GPU data. Browser/export and publication evidence follows in tests/evidence/script-profile-release-2026-10-21.md. No new full mission victory or new hardware gameplay performance is claimed.

[1080p review with F9/F10 script timings](https://sge2811-maker.github.io/Tzeva-Adom/mission2-3d-review/?v=script-profile-20261021&render=1920x1080). A local-control assistant can capture this while playing for the user. Stiff infantry, armor crowding, sparse foliage and AA/AAA art approval remain open.

Final exported Chromium/WebGL test passes build83ec790d07337d08 with zero browser errors: briefing/start,7selection,factoryproduction,tacticalmaporder,actualtankmovement,pause,F9capture andF10download. All21captured frames include matching script traces, zero missing; stage sums and positive simulation-step counts pass, GPUtime remainsnull, defaultindividualrifles confirmed. Finaltime32.6592,credits1669,queue0. SwiftShader0.6603FPS and insufficient-tail invalidity correctly leave targetfalse. These are functional/software results, not physical RTX measurements. New script telemetry has not yet been captured on Shir-GE.

---

# Rifle performance follow-up — 21 October 2026

Build `c95500083d48235f`; PCK 102,131,760 bytes, SHA256 `d42687a16678aa80aa89ff7333524496b3246f6a5407162394b066485fccef0b`. Godot 4.6.3 Compatibility/Web runtime retained. Only the isolated mission is in scope.

The user supplied a fresh verified 1920×1080 High capture on RTX 3070 Laptop GPU, build a269be0d02bc229a, scale 1.0, invalid reasons empty: **19.31 average FPS**, p95 63.1 ms, p99 69.3 ms, worst 85.7 ms, average 717 draw calls. The corrected cd92a40393618bb2 baseline was 26.04 FPS, p95 44.4 ms, p99 48.6 ms, worst 62.1 ms, average 828 calls. The new sample is approximately 25.9% slower despite 13.4% fewer draw calls. Gameplay workloads differed; this does not isolate the optimization's effect. No hardware FPS benefit is demonstrated and the performance target still fails. The cloud inspected the pasted summary only: raw mission2-performance (4).json remains on Shir-GE. Sample count, per-frame samples and synchronization timing were not supplied. Provenance is saved in tests/evidence/shir-ge-rifle-summary-2026-10-21.json.

**Automatic rifle batching is disabled.** Ordinary play now keeps individual rifle draws on every adapter, retaining all existing models, materials and art quality. Instancing remains an explicit diagnostic option (`rifles=spatial`). This is a precaution pending matched evidence, not a claim of proven causality or recovered FPS. Earlier supply-crate and static-tree batching remains unchanged.

The experimental path no longer forces every skeleton's complete bone transform update per frame. Godot 4.6 Skeleton3D::get_bone_global_pose already updates the requested dirty bone and its ancestors; force_update_all_bone_transforms also scans all bones and emits pose_updated. Direct current-wrist reads remain, preserving same-frame weapon poses. No clips or geometry were removed. Shared-cloud CPU-only probes across six alternating runs found old medians 0.659–0.704 ms versus new 0.222–0.224 ms for synchronization of 35 rifles. Means were noisy, including a 186.647 ms scheduling outlier; all runs are retained. This is neither a gaming-GPU benchmark nor an explanation of the 19.31 FPS capture. Reference: https://github.com/godotengine/godot/blob/4.6-stable/scene/3d/skeleton_3d.cpp , get_bone_global_pose/_update_bone_global_pose and force_update_all_bone_transforms.

New opt-in `compare=rifles` runs an automated **individual → spatial → spatial → individual** rendering comparison on one frozen scene/camera at High. Each phase flushes two frames, warms up for two seconds and samples ten seconds. Per-frame rifle synchronization remains active. Mission simulation, camera input and HUD orders stay frozen; original quality, renderer, briefing and pause state are restored afterward. Stream shader time continues; ABBA reduces order bias but cannot remove thermal/driver noise. The report saves raw frame intervals, per-phase FPS/tails, draw counts, synchronization CPU time, build, adapter, actual resolution, render scale, camera context and invalid reasons. Focus loss, changed scene/camera/quality/resolution, inadequate frame count and unidentified hardware invalidate the comparison. It always leaves performance_target_met and art_signoff false because a paused rendering diagnostic does not qualify active gameplay. Chrome auto-downloads mission2-rifle-comparison.json; F10 retries. Normal F9 gameplay captures and their F10 downloads remain separate and take priority after recording.

[Normal 1080p review](https://sge2811-maker.github.io/Tzeva-Adom/mission2-3d-review/?v=rifle-followup-20261021&render=1920x1080). [Automatic 1080p rendering comparison](https://sge2811-maker.github.io/Tzeva-Adom/mission2-3d-review/?v=rifle-followup-20261021&render=1920x1080&compare=rifles). The assistant in a local-control chat can run this without user gameplay. Hardware results for this follow-up build remain unmeasured. Infantry stiffness, armor crowding, sparse foliage and AA/AAA art approval remain open.

Validation details and final publication evidence are retained in tests/evidence/rifle-followup-release-2026-10-21.md. Historical reports below describe earlier builds and are superseded by the fresh hardware evidence above.

Validation so far: 53 mission regressions, 17 motion/navigation/report checks, 7098 actual-renderer rifle checks across ten clips and visibility/production/removal/pause/source restoration, and 26 exact-exported-pack comparison checks pass. The dummy headless renderer cannot round-trip MultiMesh transforms; the weapon suite requires an actual renderer. Deferred source-attachment agreement is inspected after frame_post_draw, rather than the earlier process_frame signal. Initial unsuccessful readback/timing attempts are retained. Exact-pack comparator shutdown is clean after two cleanup frames. No new full-mission victory is claimed for this follow-up.

Final exported Chromium/WebGL checks pass on build c95500083d48235f. At fixed1280×720 High, automatic ABBA comparison and F10 JSON download pass; both individual runs1071calls and both spatial runs865calls, same frozen clock/camera, no scene-change flag. One/two frames per software phase correctly invalidate hardware/tail qualification. Initial combined test was stopped after the comparison passed: its fixed production-click coordinate missed the card in the letterboxed canvas. The fixture now clicks within canvas bounds; logs retained. A separate normal-play run passes briefing/start,7selection, factory production, map order, actual tank movement, pause, F9 and F10 download; zero browser errors, finaltime30.1574,credits1645,queue0. JSON identifies individual draws, software renderer,19frames/0.5847FPS and insufficient-tail invalidity; targetfalse. This is export/functional evidence, not GPU performance. The two browser runs have their distinct contexts preserved.

---

# Spatial rifle rendering — 21 October 2026

Build `a269be0d02bc229a`; PCK102111408bytes (97.38MiB), SHA256`f8e57523321c272572697f95d5b11f9f32ad903fd83b5b031a043b6eb9cdb3ed`. Same Godot4.6.3 Compatibility/Web runtime. Original game and game balance unchanged.

The user reports a fresh JSON-verified1920x1080High baseline for previous buildcd92a40393618bb2 on RTX3070Laptop/ANGLED3D11:26.04averageFPS,p9544.4ms,p9948.6ms,worst62.1ms,782samples,average828draws,scale1,noinvalidflags. Target failed. Raw JSON remains on Shir-GE; this cloud session saved the pasted summary with provenance, not an invented raw report. This is a corrected1080p baseline; older schema1 resolution-affected samples do not establish a comparable FPS gain. This new release has not been measured on Shir-GE.

New `scripts/weapon_batches.gd` groups the existing rigid rifle meshes by exact geometry/material finish and12m spatial cells. Full vertex/index/UV/normal arrays and material maps are retained. Skinned bodies, clips, aiming, picking and combat stay separate. The current wrist-bone pose drives each instance; source BoneAttachment nodes can update later in a frame, so copying their stale node transform was rejected. Original rifle draws are hidden while their bones/animation hierarchy remain. Hidden actors leave no rifle/shadow instances; actors crossing cells, newly produced squads and freed sources are handled. Reused batches grow capacity only when needed. Source meshes and finish resources are retained for the renderer fallback.

Enabled for identified hardware renderers. Software and unidentified renderers retain individual rifle draws: the cloud's instancing path was slower, so no software FPS improvement is claimed. The explicit batch path was forced for native QA; it was not disguised as hardware. Performance JSON now identifies the actual weapon path and CPU-side synchronization duration, plus capture start/end mission time, camera, speed and scene-visible unit counts. A simulation-speed change invalidates a capture. Scene visibility counts are not camera-frustum counts. Metadata helps assess future workload comparability; it does not make different camera paths identical.

Same960x600High paused overview:1023->817draws (-20.14%),1521117->1414949rendered primitives (-6.98%). Independent still comparison:3of576000pixels change by more than3/255, mean absolute RGB error0.00127/255,max10/255. This is an initial still/LOD comparison, not all animation/camera coverage. Software frame times were slower with instancing; the new hardware FPS benefit remains unmeasured. Earlier probes sharing identical materials369->52saved no draws; changing to one directional cascade saved only7draws. Neither alternative was adopted. Shadow atlas, cascades, exposure, MSAA and model art are unchanged.

Validation passed:53mission checks,17motion/navigation/report checks;7060 assertions across10rifle-animation clips, direct bone versus deferred node/world transforms, every weapon surface/array/finish, concealment, cross-cell movement, production, removal and pause; reporting diagnostics and speed-change invalidation. Initial attachment-node copy failed the pose test and was corrected before release; log retained. The initial test's artificial freed-actor fixture was also corrected to remove the actor from the game's unit list before freeing it.

Native OS-input exported-pack play-through with batching explicitly forced: victory147.3843simseconds,5/5sites,3/3towns (HP2324.23/1267.91/2452.63). Factory and four tank orders exercised. Low,4xsimulation,llvmpipe; functional completion only. Exact build identity confirmed. Final native screenshot rifle-native-result.png is an actual window capture. The temporary source setup was restarted against the exported PCK to make build identity exact.

Final exported Chromium/WebGL software-fallback run: briefing,start,7selection,factoryqueue,tacticalmaporder,actualtankmovement,pause,F9capture andF10JSONdownload all pass; errors0,buildmatches. Finaltime29.5706,credits1633,queue0. New report identifies individual rifle draws on SwiftShader, includes workload context and correctly leaves hardware qualification false. Fourteen slow software frames are insufficient for the target gate. This browser run checks fallback and export integration; the hardware-selected Web path still needs a physical-GPU capture. Stiff infantry,armor crowding,sparse foliage and the AA/AAA art gate remain open.

Final exact-export A/B confirmation (build a269be0d02bc229a): 1023 -> 817 draws, 1521117 -> 1414949 primitives. Final paired still: 3/576000 pixels differ by more than 3/255, mean absolute RGB difference 0.00106481/255, maximum 10/255. Software frame timings are not hardware performance evidence. See rifle-final-budget.json/log and rifle-final-source/batched.png.

---

# Display-size correction and supply batching — 21 October 2026

Build `cd92a40393618bb2`; PCK 102,090,804 bytes, SHA256 `854057c5dd56d00c9eba750cc7d0f5ba55388ddfdf61fa6cc2755afb5237080b`. Same Godot4.6.3 Compatibility/Web runtime. Only the isolated review is in scope.

The user reports a real local browser victory on Shir-GE with previous buildc2b9903ca408e1ec:5/5launch sites,3/3towns,08:02simulation. Factory,armor production,selection,movement,combat,maporders,pause andspeed worked. RTX3070 Laptop/ANGLED3D11,High,scale1, captures18.39 and22.31averageFPS with p9973.8/58.5ms. Raw downloads remain on the PC; this cloud session inspected the pasted summary, not those local files. Visual issues reported: stiff infantry,armor crowding,sparse foliage. Those art issues remain open in this release.

**Resolution correction supersedes older resolution claims:** schema1 used ViewportTexture.get_size(), which applies canvas_items stretch again in this setup. At a1920x1080 native window with the old fixed16:10 aspect, the actual image is1728x1080 while the helper returns2074x1296. At960x600 it returns640x400 for a960x600 image. The FPS/frame-time/adapter evidence remains useful, but old reported dimensions cannot establish physical pixel counts, an exact1080p test, or a rendering bottleneck. Earlier statements comparing those reported pixel counts are withdrawn. Original uploaded JSON is preserved unchanged; hardware records carry this correction.

Web canvas sizing is now explicit (Godot policy0), independent of CSS display size/DPR. Display[F8] offers Auto capped to1080p, fixed720p/1080p/1440p and native window pixels. Fixed modes maintain their buffer on browser resize and fit with CSS black borders. URL render=1920x1080 locks1080p. Project stretch aspect expands to the real buffer rather than pillarboxing a fixed16:10 viewport. Quality remains independent. Schema2 measures the viewport rectangle times its stretch once; actual image readback tests confirm960x600,1280x720,1920x1080. It records requested,canvas,CSS,DPR and WebGL drawing-buffer dimensions, actual3D render pixels and average draw/primitive counts. Size mismatches invalidate the performance capture. Focus,pause,changedquality/resolution,minimumsample and software-renderer gates remain.

Supply crates: the original CC0 crate has10 separate meshes sharing one PBR material. An offline Godot builder combines every triangle,UV and source material into one mesh and regenerates three distance LODs. Twelve crates remain in four local MultiMesh piles with exact original poses; each pile changes from30 source material draws to1. No props, textures, shadows, simulation rules or terrain/infantry art were removed. Native High overview draw calls1168->1023 (-12.41%); primitives1557457->1521117 (-2.33%). Low/no-shadow comparison with grass/contact removed674->616 calls. Same960x600 camera. Cloud software frame times varied and were slower in the High comparison; this is scene-workload evidence, not a hardware FPS claim.

Passed:53 mission regressions,17 motion/navigation/report checks, all20952 original crate triangles/UVs and PBR texture bindings, source poses, generated LODs; pure-JS fixed-mode/DPR/Auto/letterbox/resize/persistence/loader-policy checks; native actual-image-versus-reported-size checks and mismatch-gate cases. The initial display test was stopped after the native audit reproduced the legacy size defect; the superseded candidate also completed its gameplay check. Their logs are retained. Final exported browser and hosted release results follow in the source evidence. A new full-mission victory and new-build RTX performance are not claimed. AA/AAA sign-off remains open.

Final exported Chromium/WebGL tests pass with zero browser errors. At DPR1.6875, requested,canvas,WebGL and reported viewport sizes match:1280x720,1920x1080Low/High,1920x1080after browser resize,Auto1620x1012,then1280x720. High screenshot inspected. F9 captures schema2 with physical dimensions and nonzero draw/primitive counters; F10 downloads JSON byte-equivalent as parsed to the in-page report. The cloud software sample correctly fails hardware qualification and retains insufficient-frame invalidity; no gaming-GPU FPS is claimed. Normal exported gameplay also passes briefing/start,allsevenselection,factoryqueue,tacticalmaporder,actualtankmovement andpause; matching buildcd92a40393618bb2,errors0,finaltime9.6167,credits1393,queue1. This is a fresh functional test, not a new full mission victory.

---

# Armor and canopy surface pass — 19 October 2026

Build `c2b9903ca408e1ec`; PCK101,613,628 bytes (96.91 MiB), SHA256 `251a017f06396a33281c4c0c267b1221fd18fd6ce0ee236a6ea1e5b9f9b622d4`; first download about140MB. Same Godot4.6.3 Compatibility/Web runtime. Previous hardware capture is from build553348baa84daaa8, not this release.

Authored armor: object-space non-slip grain, gravity-aligned grime, uneven settled dust, modest physical-panel paint variation and sparse wear on bevels. Normal maps are512/512/256 with mipmaps; color and packed roughness/metal/occlusion maps preserve material separation. The prior atlas had no metallic mask and only a128px generic grain normal. No photograph was used as a texture. Runtime uses the same three atlas materials, plus the existing marking material; geometry counts remain56,924 triangles across the three assemblies. Blender master and GLB were rebuilt together. Track surfaces now use shared vertex colors for darker cast metal and brighter raised contact surfaces, with mild per-link variation, retaining one MultiMesh draw and96 links per vehicle. Track motion logic is unchanged.

Trees: complete leaf polygons reduced from66,252 to22,084 triangles per canopy, retaining more foliage at the normal RTS distance. Leaf tint/backlighting is adjusted. All51 rooted tree markers remain;153 trunk/branch/leaf meshes become42 spatial batches across24m chunks. Original transforms, litter placement and mesh coverage are preserved. Shared geometry replaces duplicate draws, without changing navigation or mission rules.

Same cloud overview counters: High1290 ->1168 draw calls (-9.46%),1,848,064 ->1,557,457 rendered primitives (-15.72%). With grass/contact/shadows removed,725 ->674 calls and812,678 ->724,955 primitives. These are scene-complexity measurements, not a gaming-GPU FPS prediction. Software frame times varied and were slower in this run; full logs are retained. Actual performance of this build on Shir-GE has not been measured.

Validation passed:53 mission regressions; imported armor PBR maps/mipmaps plus assembly seating, muzzle, yaw, actual fire/damage/recoil/pause; actual-renderer preservation of every tree transform with no duplicate source geometry; opposite tread motion on pivot; contact-color regression with exact zero-strength identity and zero brightened pixels under default shading. Native High overview, orchard, armor front/rear/profile and staged combat captures inspected, without script/shader errors. The combat still is staged/slowed for effect inspection. Older infantry/motion/support/map captures keep their earlier context.

The user's earlier valid hardware report identified RTX3070 Laptop GPU at2679x1676 High:26.63 averageFPS, p99 48.1ms, worst849.2ms,800frames, no invalid flags. That resolution has2.17x the pixels of1080p. The target was not met in that capture; it does not establish the new build's performance or an exact1080p result. AA/AAA art sign-off remains open; infantry/cloth, fine equipment geometry, environment variety and destruction still need production work.

Final exported Chromium/WebGL check passes: briefing/start, all seven selected, factory queue, tactical-map order, actual tank displacement, pause and normal G switch to High. Both Low and High report build c2b9903ca408e1ec; zero console/page errors. Final time 14.0668 simulated seconds, 1468 credits, one queued job. High screenshot inspected. SwiftShader reports 1 FPS: functional evidence only. This pass did not repeat the historical full mission victory. Both local review galleries pass four viewports, comparison controls, image decoding and full-size links without errors, overflow or engine downloads; the main gallery also passes touch video activation. Touch checks use Chromium emulation, not physical iPhone/Safari.

---

# Merkava color correction — 18 October 2026

The Merkava's embedded albedo is olive-grey (hull median RGB108/105/95), not white. The High contact-shadow shader sampled the already tone-mapped screen image and returned it as spatial ALBEDO. Godot 4.6 Compatibility tone-maps each spatial draw, so the scene passed through ACES a second time. Sunlit armor was brightened and washed out; the same bug affected terrain contrast.

The replacement reads depth only and alpha-blends black contact shadows. It cannot brighten the underlying scene or reprocess its colors. The pass retains priority -100, ahead of transparent dust/smoke. No tank tint, texture, geometry, Blender master, light settings or gameplay data changed. The original game remains outside this release.

Evidence: `contact_color_review.gd` renders the imported tank and a ground plane under mission ACES lighting with 4x MSAA. The old shader fails: zero strength alters channels by up to44/255 and brightens248,236 pixels. The fixed shader passes: zero strength is pixel-identical; default strength brightens zero pixels and darkens25,302 contact pixels. Old shader retained as a test fixture; both reports retained. Twenty focused realism/effect checks pass. Native High overview, tank, front/rear/profile and staged combat captures inspected; no script/shader errors. Smoke remains visible. The armor gallery compares the same model/camera with only contact rendering changed.

Source verification: Godot4.6 `drivers/gles3/shaders/scene.glsl`, ALBEDO sRGB decoding followed by per-draw tonemapping and output encoding; `tonemap_inc.glsl`, ACES implementation. https://github.com/godotengine/godot/blob/4.6-stable/drivers/gles3/shaders/scene.glsl . The bug is repeated tone mapping, not a claim that the GLB was double-gamma baked.

Build `553348baa84daaa8`; PCK101,072,756 bytes; SHA256 `348c8a19d301392268dd05c79e83a99903b169f9ef5944965ee6a5d99ca6a78c`; same Godot4.6.3 Web runtime, about139MB first download.

This is a focused rendering correction. Previous full mission play-through evidence remains in the historical reports; it is not represented as a fresh full play-through. llvmpipe/SwiftShader testing does not establish gaming-GPU performance or AA/AAA art sign-off.

Final exported Web build passes start/pause and normal High/Low key controls in Chromium/WebGL, with both screenshots inspected, matching build identity and zero console/page errors. Both local galleries pass390x844,320x568,844x390 and1440x900: image decoding, comparison buttons, full-size links, no overflow/errors or engine downloads. The main gallery also checks actual touch video activation. These are software-renderer and Chromium touch-emulation checks, not physical iPhone/Safari tests.

---

# Three-project realism pass — 18 October 2026

Studied pinned source and licensing from **0 A.D., Beyond All Reason and Terrain3D**, plus published visual references. They are qualified technique references, not three verified Godot AA RTS games, and were not played or benchmarked in this pass. Precise source paths, commits, engine differences and reuse decisions: [THREE_REFERENCE_STUDY.md](THREE_REFERENCE_STUDY.md) (source: `docs/THREE_REFERENCE_STUDY.md`). No outside code or art was copied.

Applied original implementations: a bounded mip-filtered context map connects ground treatment to actual tree roots, limestone outcrops and house plots; worn approaches connect southern homes to the road. Terrain blends coordinated near/far albedo and normalized normal samples, with fewer samples on Low. Surface-specific armor/concrete/earth hits replace destruction-scale blasts on ordinary hits. Explosions separate flash, falling dust and rising smoke using an original density texture. Command notices gain a readable panel. Low omits impact lights and uses unshaded dust/smoke; High retains their lighting. The High contact-shading pass now runs before transparent effects, fixing its previous overwriting of dust/smoke; particle materials apply lifetime alpha, and hard-surface hits use exterior visual bounds. Unit models, mission rules and the original game are unchanged.

**Passed:** 53 mission regressions, 20 focused realism checks, 11 actual-renderer landscape checks, and the armor assembly/firing/recoil suite. Native High overview, terrain, armor, tactical and staged combat captures inspected without script/shader errors; tactical terrain rebaked. The combat still pre-rolls the layers separately and slows progression for inspection; it is not normal gameplay timing footage. The earlier infantry close-up and offline motion clip remain labeled as earlier staged/offline captures.

**Native OS-input play-through:** victory at **143.70 simulated seconds**, **5/5 launch sites**, **3/3 towns**; town HP 2331.51 / 1817.21 / 2444.44. It exercised a factory, four tank orders, group selection and minimap orders. Low, 4× simulation, llvmpipe. This is functional completion, not a gaming-PC benchmark.

Final Chromium/WebGL input check passes with zero console/page errors: briefing/start, all seven selected, factory production, tactical-map order, actual tank displacement and pause. Final simulation time 11.6167 seconds, 1417 credits, one queued job; build matches the export. SwiftShader reports 1 FPS, so this is functional evidence only. The initial run timed out awaiting the production click after movement; its failure is preserved in `three-study-browser-initial-timeout.log`. The retest uses deliberate input timing, early production and paused screenshot capture, alongside the lower-cost Low effects path.

The local phone gallery passes four viewports (390×844, 320×568, 844×390, 1440×900), both comparison toggles, image decoding/full-size links and actual touch video activation, with no errors, overflow or engine download. Final hosted checks are recorded in release evidence. Touch checks use Chromium emulation, not physical iPhone/Safari.

Build **`4f5182df86605d8f`**, PCK **101,072,596 bytes** (96.39 MiB), SHA-256 `452a18ea0eb5e362ecb5a51f83f054e5a9ccfdad9e61fe1e83f13463bd021a30`; first download approximately 139 MB. Godot 4.6.3 Compatibility/Web runtime retained. Evidence: `tests/evidence/three-reference-release-2026-10-18.md` and `three-study-*` files.

AA/AAA sign-off remains open: infantry anatomy/cloth, authentic vegetation variety, settlement density, vehicle surface detail and structural destruction still need production work. Cloud llvmpipe/SwiftShader cannot qualify physical gaming-GPU performance. The techniques improve the isolated benchmark and are reusable for later game work; no original-game files were changed. Historical reports below refer to their earlier builds.

---

# Godot RTS source study — landscape pass, 18 October 2026

Research: Ironbound (`destinjones/ironbound`, commit `2993c773483af8b28f1fb05627f4029322097470`), MIT; creator confirms Claude-assisted/vibe-coded development. Published screenshots and actual environment source inspected. AA qualification is not established. See `docs/GODOT_RTS_STUDY.md` (browser bundle: `GODOT_RTS_STUDY.md`) for candidate checks and precise source-to-implementation mapping.

Applied: shared Galilee lighting/terrain/wind preset; authored orchard/scrub vertex weights; scale-aware terrain variation and normal attenuation; 84 low shrubs in 27 cullable chunks with road/house clearance; root-preserving, simulation-time wind for grass/garden/scrub; Low quality scales shrub density to 25%; updated actual-terrain minimap and phone before/after overview.

Verified: 53 mission regressions; 11 actual-renderer landscape checks (clearance, ground contact, <=68cm height, budget, wind pause, Low/High restoration); native High overview/infantry/terrain/armor/tactical captures; local phone gallery at four viewports with both landscape/infantry toggles, full-size original, video and no engine downloads. No script/shader errors in the rendered captures. Cloud llvmpipe/SwiftShader and emulated touch cannot qualify real gaming-PC or physical-iPhone performance.

Native OS-input play-through also won at 143.0 simulation seconds, all five launch sites destroyed and all three towns alive (HP2333.33/1907.21/2459.0). Factory and four tank orders exercised. Low quality, 4× simulation, llvmpipe; not a hardware benchmark.

Final browser WebGL input check passes with zero console/page errors: briefing/start, all seven units selected, tactical map, actual tank movement, factory production and pause. Build identity matches the exported package. SwiftShader reported 1 FPS; this is functional verification only.

Build `991d564d40ee3075`, PCK101,043,828 bytes (96.36 MiB); SHA256`751643e6b06248d7d2d6bf0d01904f9e28b6fbebd644a25c89e2de4b1c49d044`. Full release evidence follows in `tests/evidence/godot-rts-study-release-2026-10-18.md`.

---

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


## Merkava Mk4M exterior pass — 18 October 2026

The conventional Trophy-equipped Mk4M study replaces the earlier box-based tank. Six additional real-vehicle photographs were downloaded and visually inspected; reference notes, hashes and limitations are recorded in `docs/asset-research/merkava-refinement.json`. Rear detail remains an approximation. Mk3 and Barak are not built.

The new model has a lower engine-forward hull, separate sloped turret modules, six road wheels per side, track-shoe end connectors, Trophy exterior fittings, open barrel bore, thermal sleeve bands, rear basket, authored canvas stowage and linked ball-chain curtain. Tactical side chevrons are fictional game identification. The portable authored atlases include normal maps, restrained occlusion and dust. No reference photograph is shipped as a texture.

The turret has an explicit rearward yaw pivot. Gun recoil moves a separate gun assembly, and the actual cannon tracer/flash/audio origin uses the gun’s muzzle marker. A first capture caught a duplicated parent offset; it was corrected before release. Imported assembly tests cover seated geometry, physical muzzle location, yaw, actual flash emission, unchanged damage, fixed pivot, recoil, return and pause. Existing 53 mission and 17 motion/navigation/report checks pass; the real-renderer track test verifies opposite tread movement in a pivot.

A dedicated phone armor gallery provides matched before/after views, front/rear/profile captures, reference links and Blender/GLB downloads. Local comparison/navigation/full-size-image checks pass at 320, 390, 844 and 1440 widths. The main phone gallery also passes at all four viewports. These are Chromium touch-emulation checks, not physical iPhone/Safari tests.

Art acceptance remains open. The model is an improved exterior study; fine fittings, cloth, plate surfacing and wear need further refinement. Native llvmpipe and browser SwiftShader runs establish compatibility and tested controls, not target-PC performance.

Full native OS-input play-through completed the updated mission at 147.106 simulation seconds: all five launch sites destroyed, all three towns alive. Factory production and four tank orders were exercised through ordinary keyboard/mouse controls. Town HP at victory: [{'id': 3, 'hp': 2324.23000000005}, {'id': 4, 'hp': 1298.3}, {'id': 5, 'hp': 2468.10000000001}]. Result and command log are in `tests/evidence/merkava-native-*`. This is a software-renderer functional run at 4× game speed, not a real-GPU benchmark.

Current export: build `37694d61bc3473b7`, PCK101,083,128 bytes (96.40MiB), SHA256`9904d65784462311e7aea8387bc05bff0fde47c50ee69903741a01e122ddca4e`, first game download approximately139MB.

The final local Chromium WebGL build passed briefing/start, all-seven selection, expanded map, an issued movement order with verified tank displacement, factory production and pause. Browser errors:0; state build`37694d61bc3473b7`, simulation time72.676. SwiftShader reports1FPS and cannot qualify as target-PC performance.
