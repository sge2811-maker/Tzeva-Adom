# Tzeva Adom — The Northern Front: isolated 3D review

Play the [isolated browser review](https://sge2811-maker.github.io/Tzeva-Adom/mission2-3d-review/).

On iPhone or another phone, open the [visual review gallery](https://sge2811-maker.github.io/Tzeva-Adom/mission2-3d-review/review/): compressed previews, a matched before/after infantry comparison, full-size engine captures and an inline movement clip. The gallery does not load the game engine. Its video is rendered offline and does not establish real-time performance. The playable mission still needs a mouse and keyboard.

A separate Godot 4.6.3 mission prototype for Operation 02. The original game and its campaign/save data are untouched. This is a review candidate for the game's visual benchmark; study assets and unmeasured target-PC performance remain below final production sign-off.

Destroy all five launch sites while keeping at least two of the three towns standing. Three sites exist initially; two more appear during the mission. Reconnaissance and enemy firing reveal concealed sites. The mission includes production, income, supply capture, waves, reserve armor, Iron Dome and Trophy interception.

## Controls

- Left click / drag: select. Shift adds to selection. Right click: move or attack.
- WASD: pan. Q/E: rotate. Wheel: zoom.
- Space: begin / pause. F: 1× / 4× speed. G: High / Low graphics. M: audio.
- Ctrl+A: select all mobile units. Ctrl+1–9: store a group. 1–9: recall it.
- Minimap: left click or drag to pan; right click to order selected units.
- Tab or the minimap's `[ + ]` button: expand / close the tactical map.
- Support cards: queue reinforcements and buildings. Prices, prerequisites, live production progress and counts appear on the cards.

The modernized map combines mission-derived cartography, distinct launcher targets, vehicle headings, selected-unit rings, town labels/health arcs and a clipped camera footprint. Concealed enemy positions remain hidden. The larger tactical map supports the same controls.

## Running

Open `project.godot` with Godot 4.6.3 and run the project, or use `godot --path .`. The Web export needs an HTTP server and a browser with WebGL 2. No Godot installation is needed to play the hosted Web version. First load downloads about 139 MB; mouse and keyboard are required.

The Compatibility renderer targets broader GPU support. High enables shadows, contact shading and 4× MSAA; Low reduces 3D resolution and foliage and disables shadows/contact shading. Software adapters automatically start in Low. Gad-El hardware performance is unmeasured.

## Performance capture

During active gameplay, press **F9** to record a 30-second frame-time sample (after a two-second warm-up). Keep playing at a fixed resolution and graphics setting. Press **F10** or use **Save performance report** to download the JSON. On native Godot it is saved in the user-data folder. The report records the build fingerprint, actual renderer, resolution, quality, average FPS and frame-time percentiles. Software rendering, paused play, focus loss, changed settings or too few frames cannot clear the hardware gate. The proposed target is 1920×1080 High, at least 60 average FPS and p99 frame time at most 22.23 ms. This is a performance check, not art approval.

[Watch the in-engine movement review](https://sge2811-maker.github.io/Tzeva-Adom/mission2-3d-review/animation-review.mp4). This is an offline frame capture encoded at 24 FPS, not a real-time performance demonstration.

## Verification and provenance

The latest OS-input-driven native run completed all five sites with all three towns alive at 183.74 simulated seconds, using footprint-aware routes, acceleration and the updated infantry locomotion. Final gait-loop and foot-scale corrections are additionally covered by focused animation checks. `TEST_REPORT.md` distinguishes that run, automated checks, later changes and remaining limits. Automated checks: `godot --headless --path . --script res://tests/mission_smoke.gd`.

`ARCHITECTURE_REFERENCES.md` records actual Map/street-photo research for Metula, Kiryat Shmona and Shlomi. Architecture is reference-informed; geography is compressed. `assets/ATTRIBUTION.md` credits CC0 models/materials/audio and font licenses. Original authored Blender builders are included. The original game's MIT license is in `LICENSE`.

Mission data was extracted one-way from original release commit `faf2121673d281808c75494cefd97a89bec1dc5b`; source index SHA-256: `5086625a8055b0cd55d0d164e9b508a3a1673958a3ad53873584c17c54772fc3`.
