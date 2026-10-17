# Mission 2 polish verification — 17 October 2026

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

Public runtime verification is recorded below after the final export and deployment.
