Latest performance follow-up (21 October), build `c95500083d48235f`: fresh RTX capture of the previous rifle build was 19.31 FPS versus the 26.04 FPS baseline, with different gameplay workloads. No FPS gain demonstrated. Automatic rifle batching is disabled; the experimental path has a cheaper wrist update. [Run the automatic frozen-scene A/B comparison](https://sge2811-maker.github.io/Tzeva-Adom/mission2-3d-review/?v=rifle-followup-20261021&render=1920x1080&compare=rifles). It does not qualify gameplay performance or art.

Latest release (21 October): explicit Web display resolutions, corrected physical render-size reporting, and supply-crate batching. Use [1920×1080 mode](https://sge2811-maker.github.io/Tzeva-Adom/mission2-3d-review/?v=display-20261021&render=1920x1080) or **Display [F8]**. High/Low quality stays independent.

Latest visual pass (19 October): baked armor grain, grime, dust and material separation; varied track finish; fuller tree canopies using simpler leaves and spatial batching. [Tank comparison](https://sge2811-maker.github.io/Tzeva-Adom/mission2-3d-review/review/armor/?v=surface-20261019).

# Tzeva Adom — The Northern Front: isolated 3D review

Play the [isolated browser review](https://sge2811-maker.github.io/Tzeva-Adom/mission2-3d-review/).

On iPhone or another phone, open the [visual review gallery](https://sge2811-maker.github.io/Tzeva-Adom/mission2-3d-review/review/): compressed previews, a matched before/after infantry comparison, full-size engine captures and an inline movement clip. The gallery does not load the game engine. Its video is rendered offline and does not establish real-time performance. The playable mission still needs a mouse and keyboard.

A separate Godot 4.6.3 mission prototype for Operation 02. The original game and its campaign/save data are untouched. This is a review candidate for the game's visual benchmark; study assets and performance remain below final production sign-off.

Destroy all five launch sites while keeping at least two of the three towns standing. Three sites exist initially; two more appear during the mission. Reconnaissance and enemy firing reveal concealed sites. The mission includes production, income, supply capture, waves, reserve armor, Iron Dome and Trophy interception.

## Controls

- Left click / drag: select. Shift adds to selection. Right click: move or attack.
- WASD: pan. Q/E: rotate. Wheel: zoom.
- Web Display [F8]: Auto (up to1080p),720p,1080p,1440p or native window pixels. Fixed modes fit the window without changing their pixel dimensions.
- Space: begin / pause. F: 1× / 4× speed. G: High / Low graphics. M: audio.
- Ctrl+A: select all mobile units. Ctrl+1–9: store a group. 1–9: recall it.
- Minimap: left click or drag to pan; right click to order selected units.
- Tab or the minimap's `[ + ]` button: expand / close the tactical map.
- Support cards: queue reinforcements and buildings. Prices, prerequisites, live production progress and counts appear on the cards.

The modernized map combines mission-derived cartography, distinct launcher targets, vehicle headings, selected-unit rings, town labels/health arcs and a clipped camera footprint. Concealed enemy positions remain hidden. The larger tactical map supports the same controls.

## Running

Open `project.godot` with Godot 4.6.3 and run the project, or use `godot --path .`. The Web export needs an HTTP server and a browser with WebGL 2. No Godot installation is needed to play the hosted Web version. First load downloads about 140 MB; mouse and keyboard are required.

The Compatibility renderer targets broader GPU support. High enables shadows, contact shading and 4× MSAA; Low reduces 3D resolution and foliage and disables shadows/contact shading. Software adapters automatically start in Low. Gad-El hardware performance is unmeasured. The user reports a local victory on buildc2b9903ca408e1ec and a corrected1920x1080High baseline on buildcd92a40393618bb2:RTX3070Laptop,26.04FPS,p9948.6ms,average828draws,noinvalidflags. Target not met. Earlier18.39/22.31FPS captures did not have trustworthy physical resolution reporting. The original schema1 render-size field was incorrect under UI stretching; its reported dimensions must not be treated as physical pixels. Adapter and frame-time evidence remain useful. New schema2 records actual viewport/render dimensions, requested display mode, canvas/CSS/DPR/WebGL size and average draw/primitive counts. The rifle build a269be0d02bc229a returned19.31FPS,p9969.3ms,717averagecalls with a different workload; no FPS benefit demonstrated. This follow-up defaults to individual rifle draws and remains unmeasured on hardware. The JSON identifies individual versus spatial rifle rendering and records camera/time/speed context for comparing workloads.

## Performance capture

During active gameplay, press **F9** to record a 30-second frame-time sample (after a two-second warm-up). Keep playing at a fixed resolution and graphics setting. Press **F10** or use **Save performance report** to download the JSON. On native Godot it is saved in the user-data folder. The report records the build fingerprint, actual renderer, physical display/render resolution, quality, average FPS, frame-time percentiles and average draw/primitive counts. Requested, canvas and WebGL sizes are cross-checked; mismatches invalidate the capture. Software rendering, paused play, focus loss, changed settings or too few frames cannot clear the hardware gate. The proposed target is 1920×1080 High, at least 60 average FPS and p99 frame time at most 22.23 ms. This is a performance check, not art approval.

[Watch the in-engine movement review](https://sge2811-maker.github.io/Tzeva-Adom/mission2-3d-review/animation-review.mp4). This is an offline frame capture encoded at 24 FPS, not a real-time performance demonstration.

## Verification and provenance

`TEST_REPORT.md` records the latest complete native OS-input run, exported browser checks, focused graphics regressions and remaining limits. Automated mission checks: `godot --headless --path . --script res://tests/mission_smoke.gd`.

`ARCHITECTURE_REFERENCES.md` records actual Map/street-photo research for Metula, Kiryat Shmona and Shlomi. Architecture is reference-informed; geography is compressed. `assets/ATTRIBUTION.md` credits CC0 models/materials/audio and font licenses. Original authored Blender builders are included. The original game's MIT license is in `LICENSE`.

Mission data was extracted one-way from original release commit `faf2121673d281808c75494cefd97a89bec1dc5b`; source index SHA-256: `5086625a8055b0cd55d0d164e9b508a3a1673958a3ad53873584c17c54772fc3`.


The 18 October reference pass adds a [whole-game research snapshot](docs/asset-research/README.md) and a phone catalogue at `review/research/`. Golani’s visual rifle now follows the user’s current-equipment requirement: M4 family, supported by 2026 IDF sources. The earlier X95 blockout is superseded. The original game and legacy gameplay balance remain unchanged.


### Latest armor review — 18 October 2026
The isolated mission now uses a rebuilt conventional Merkava Mk4M exterior. Compare matched engine views, inspect the references and download the editable Blender master at https://sge2811-maker.github.io/Tzeva-Adom/mission2-3d-review/review/armor/ . Mk3 and Barak are not built. Full native OS-input victory and final local browser controls passed; art and real-PC performance approval remain open.
