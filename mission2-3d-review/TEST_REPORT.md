# Mission 2 review verification — 17 October 2026

This report covers the separate Godot mission. It does not certify final AA art quality or performance on the user's computer.

## Controls-driven mission completion

A native Godot window at 960×600 was operated through Linux XTest mouse and keyboard events. The observer in `tests/manual_review.gd` only recorded state; it supplied no gameplay commands, damage, resources, time jumps, or victory triggers.

The run began from the briefing, enabled 4× speed, bought a factory, produced three Merkavas and an airbase, used selection groups and right-click minimap movement, and advanced through the launch sites. Reinforcements arrived normally. At mission time **332.95 seconds**, all **five launch sites** were destroyed and **all three towns** survived: Kiryat Shmona 771 HP, Metula 419 HP, Shlomi 2009 HP. Final credits: 2094. Evidence: `tests/evidence/native-victory-2026-10-17.json` and `benchmark-native-victory.png` in the adjacent preview directory. The native log contained no script/runtime errors. This was an automated controls-driven run, not a human playtest.

That run preceded the final minimap layout, stream/rocket art and explicit-target retention fix. The final UI and these follow-up changes require their own verification below; the completion result should not be misrepresented as a second full run of those changes.

## Automated checks

`tests/mission_smoke.gd` passes **38 checks**, including mission identity/counts, unit animation rigs, perspective selection, production prerequisites and displayed costs, bounded simulation steps, pause, navigation around building cells, aimable turret, damage/recon, supply income, reserve/site events, objective success/failure, expanded-map open/close, minimap coordinate mapping and right-click orders, and explicit distant target retention. Direct state mutation in these tests is separate from the controls-driven completion above.

## Rendering and limits

Native rendering uses Mesa llvmpipe on a four-core CPU quota; browser rendering uses Chromium SwiftShader. The native controls run reported approximately **2–6 FPS in Low**. High paused overview captures were approximately **1.5–1.9 seconds per frame** after LOD/batching changes. These software-renderer results do not predict hardware-GPU performance. No performance sign-off on Gad-El or another target PC is possible from these measurements.

The graphics pass adds authored Namer/installations, an independently aimed Merkava turret, static mesh batching/imported LOD, smaller field grass, sound, wreckage, screen-space labels, improved water/rocket visuals and the revised tactical map. Town architecture is reference-informed but the mission geography is compressed, not a street-for-street reconstruction.

Remaining production limits: study-quality characters/vehicles and animation, simplified avoidance and damage states, no complete ambient/engine/footstep mix, no accessibility/settings save system, and no measured target-PC frame-time budget. This build is a **review candidate**, not a certified AA benchmark.

## Original-game isolation

The original release repository remains clean. Its `index.html` SHA-256 remains `5086625a8055b0cd55d0d164e9b508a3a1673958a3ad53873584c17c54772fc3`. Publishing adds only `mission2-3d-review/` to the existing Pages repository, at a separate URL. No existing game file is changed. A separate repository could not be created with the connected GitHub integration.

## Browser verification

Chromium/WebGL 2 loaded the exported mission and briefing. Actual Playwright keyboard/mouse input selected all seven initial mobile units, opened the Tab map, issued an order on that map, closed it, moved the Merkava, purchased a factory, and paused. No browser/page runtime errors were recorded. The initial pass reported 1 FPS in High on SwiftShader; that revealed that Godot's generic WebGL adapter label did not identify software rendering. The final build also queries the browser renderer string and starts software adapters in Low. Hosted verification is recorded separately after deployment.

Final local browser input run passed with **zero errors** and automatic **Low** on SwiftShader. It verified all seven selected units, map-issued movement, a queued factory, and pause at mission time 25.74 seconds. Software browser rendering still reported 1 FPS, so this is functional verification, not a performance pass.

GitHub Pages built deployment `0b6bb001732add2268873d6441d28aada5a7f0b8`. The public review URL, JavaScript, WASM and PCK were fetched with normal HTTPS certificate validation and matched the local export byte-for-byte. The original public game page also retained its exact SHA-256. Direct Chromium navigation encounters the cloud's HTTPS inspection certificate trust error; no browser certificate verification was disabled.

Final High captures (`aa-overview.png`, `aa-tactical.png`) measured 1431.8 and 1452.8 ms/frame on llvmpipe.

A further hosted-origin probe using TLS-verified response fulfillment closed before the engine finished loading; it is **not** recorded as a pass. Final verification therefore consists of the clean local browser input pass, byte-identical hosted assets over verified HTTPS, the successful Pages build, and the native controls-driven mission victory.
