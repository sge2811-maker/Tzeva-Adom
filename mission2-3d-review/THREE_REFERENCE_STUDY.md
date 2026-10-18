# Realism study: 0 A.D., Beyond All Reason and Terrain3D

18 October 2026. User prioritizes true-to-life graphics and rejected Ironbound's toy-like appearance as the visual target. This pass studies all three replacement references and integrates original implementations in isolated Mission 2. The original game remains untouched.

## Sources actually inspected

| Project / pinned source | What was read | Useful lesson |
| --- | --- | --- |
| [0 A.D.](https://github.com/0ad/0ad/tree/61a3b9507d974084e6badb88a0826bd89a6d5b8b) | `maps/random/rmgen/painter/LayeredPainter.js`, `maps/random/rmgen2/gaia.js`, `maps/random/mediterranean.js` under `binaries/data/mods/public/`, plus `source/renderer/TerrainRenderer.cpp` and license. | Paint material transitions around meaningful areas, associate forest floors with trees, and constrain vegetation relative to settlements and movement space. The source inspected is the archived GitHub snapshot; current development is on Wildfire Games Gitea. |
| [Beyond All Reason](https://github.com/beyond-all-reason/Beyond-All-Reason/tree/17eaedf6b194508b4fa2c01fa36e84447d67f3cc) | `effects/genericshellexplosion.lua` and `LICENSE.md`; official graphics-update article and screenshots. | Separate short flashes, ground dust, rising smoke and sparks into distinct layers with different lifetimes, velocities and material behavior. Vehicle hit feedback and a destruction explosion should have different visual scales. |
| [Terrain3D](https://github.com/TokisanGames/Terrain3D/tree/59bacc5e61aede7d0fd96ae9cd263f4cc0f09858) | `src/shaders/dual_scaling.glsl`, `src/shaders/main.glsl`, `src/shaders/auto_shader.glsl`, `LICENSE.txt`, platform documentation and example-project tree. | Coordinate albedo and normal coordinates when changing texture scale. Filter according to pixel footprint, use coarse detail at a distance, and provide a lower-cost quality path. |

The source inspection and published-image review are not claims of playing or benchmarking these three projects. 0 A.D. uses Pyrogenesis; BAR uses Recoil; Terrain3D is a Godot terrain extension, not an RTS. No replacement was verified to satisfy realistic AA graphics, RTS gameplay, Godot and documented vibe coding together.

## Integrated changes

1. **Ground that belongs to the scene.** A small, mip-filtered 256×256 runtime context texture records tree-root litter, settlement gravel, limestone aprons and worn house approaches. It is generated from actual tree/outcrop transforms and the shared house layout. Sparse local brush painting keeps generation bounded. This is terrain material context, not painted sunlight or fake baked shadows.
2. **Coordinated material detail.** Earth and grass now blend matching near/far albedo and normal samples using explicit texture gradients and pixel footprint. Normals are decoded, blended and normalized. The Low preset omits the extra far samples; the context texture still connects buildings and trees to the ground. This uses the current Godot Compatibility shader, not a Terrain3D migration. Terrain3D's own web exports remain documented as experimental, so that extension was not added to the tested browser runtime.
3. **Surface-specific impact feedback.** Bullet and shell hits select armor, concrete or ground responses without changing damage. Armor has brief sparks; concrete has dust. Hit positions use the target’s existing visual bounds so sparks are outside hulls and walls. A 16-impact limit bounds transient effects. Ordinary hits no longer create destruction-scale blasts and explosion ground scars.
4. **Layered explosions.** An original runtime-generated density texture gives dust and smoke irregular billows. Shaded dust falls while smoke rises; a short local light ends before the dust tail. Particle materials now apply the lifetime alpha ramp. The contact-shading screen pass now renders before transparent effects: its previous late priority overwrote smoke and dust on High. Existing death explosions, wrecks and movement dust remain integrated. Simulation-aged lights and particle speed handling preserve pause behavior. Low uses unshaded dust/smoke and omits transient impact lights; High retains their lighting.
5. **Readable command feedback.** The command notice has a dark panel instead of relying on outlined text over the terrain. It ignores pointer input and hides when the message expires.

These changes preserve unit models, mission data, balance, damage, targeting, victory rules and navigation obstacles. Existing Galilee houses, Golani M4-family equipment and combat helmets are retained. All improvements are reusable source systems for the future game, presently deployed only to the isolated mission benchmark.

## Licensing and provenance

- 0 A.D. code is GPL; its art has separate share-alike terms. No code or artwork was copied into this game.
- BAR's code is GPLv2, and most model/texture/animation assets have restrictive NC/ND terms. They are not an asset pool for our mission. No BAR artwork, effects textures, code or screenshots are redistributed.
- Terrain3D is MIT, but this pass implements the selected material principles independently and does not bundle the extension.
- Our effect density texture and context painting are original procedural work. Ground, gravel and foliage reuse the mission's existing credited assets. No new outside photo or texture was introduced.

## Validation and remaining gaps

Actual-engine overview, landscape, armor and tactical captures support the phone review. A separate combat image is an explicitly staged particle inspection, with separate layer pre-roll (0.08 seconds for brief hits, 0.4 for ground dust and 1.1 for smoke) and slowed progression for readability; it is not normal gameplay timing footage.

`tests/realism_review.gd` covers meaningful placement context, quality behavior, hit limits, surface selection, unchanged damage, flash lifetime, transparent-pass ordering, exterior placement, lifetime alpha, pause, resource cleanup and notice input behavior. Existing mission and rendered landscape checks remain applicable. A first browser input run verified movement but timed out awaiting the production click. The final harness uses deliberate click/key timing, orders production early, records checkpoints and pauses simulation during screenshot capture; the Low effects path also has a lower lighting cost. These changes were retested rather than treating the initial timeout as a pass. The native mission and exported browser are checked through ordinary input before publication; exact results are recorded in `TEST_REPORT.md` and release evidence.

The result remains a work in progress. Infantry anatomy and cloth, tree variety, settlement density, vehicle surface fidelity, richer structural destruction and target-PC performance remain substantial quality gaps. Neither these references nor passing functional checks establish AA/AAA visual sign-off. Cloud llvmpipe/SwiftShader is not a gaming-GPU benchmark.
