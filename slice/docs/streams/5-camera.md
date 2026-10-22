# Stream 5: Camera and game feel

**Owner:** builder `camera`.

**Files you own:** `src/camera/**`. You may also change `src/sim/pacing.js` for beat timing with these limits:

- You may freely change `introLen`, `shelterHold`, `aftermath` and message-only timings.
- Do not move `alertAt`, `countdown`, `ballisticFlight` or `salvos[].enter` without asking the integrator first. Canonical shot times depend on them.
- Run `node tools/regress.mjs` after any pacing change.

**Benchmark:** `../../benchmark/TARGET.md` §5. References: AoE IV camera feel, and CoH3 and Iron Harvest intros.

## Current state

The baseline modes are:

- **Menu:** a slow orbit.
- **Intro:** a 24 s Catmull-Rom flyover from the Dead Sea up the escarpment to the tactical view.
- **Tactical:** a smoothed RTS rig. Drag pans, right-drag rotates, the wheel zooms, WASD and QE move and rotate, and there is pinch support.
- **Cine:** press C for a crude follow cam.
- **Pose:** used for critic shots.

Shake uses a trauma model from bus `shake` events. Hit-stop is `clock.hitStop` on big kills.

## Goals, in priority order

1. **Intro flyover.** An authored, cinematic composition:
   - Open low over the Dead Sea at night.
   - Climb the escarpment wadi.
   - Crest to reveal Arad's lights and skyline, timed to the title card.
   - Ease into the gameplay camera with a seamless hand-off: same pose, no pop.

   You may change the intro cards' timing with the HUD stream through `ctx` or the bus; do not edit HUD files. Add a capture path for the intro: either extend `tools/capture.mjs` with `--intro`, which you may edit, or provide `__slice.introFrame(t)`.
2. **Tactical camera feel.**
   - Zoom toward the cursor, with pitch that eases with zoom: steeper when far, shallower when near, like AoE IV and CoH3.
   - Momentum that stops cleanly, and rotation around the screen centre.
   - Bounds, and no terrain or building clipping.
   - Double-click a marker or press F to focus.
   - Edge panning is optional (off by default in the browser).

   Measure responsiveness. Write `tools/input-test.mjs`: synthetic drags and wheel events through Playwright, with the camera pose logged per frame, reporting latency to first movement, settle time and overshoot.
3. **Pacing of the alert, shelter and aftermath beat.**
   - **Calm, then early warning:** a subtle push-in or HUD cue (coordinate with HUD through events).
   - **Siren:** a short, readable camera emphasis (for example, a brief push toward the town). Never take control away from the player for more than about 1.5 s.
   - **Barrage:** keep the player in control. Offer a cinematic option.
   - **All-clear:** a gentle release.

   There should be no dead stretch over about 20 s: tune message beats in `pacing.js` within the limits above.
4. **Hit-stop and slow motion.** Brief (≤ 80 ms) on big nearby intercepts. Optionally a short slow-motion moment on the first exo-atmospheric intercept of salvo 1 if it reads well. It must never feel like lag. Disable it in `?capture=1` unless the trailer script asks for it.
5. **Cinematic camera (C).** Picks good subjects (interceptor closing on a ballistic missile, debris over the town), frames them with the skyline, and cuts or blends smoothly.
6. **Trailer camera, required for the final deliverable.** Implement `ctx.systems.camera.script('trailer')`: an authored, deterministic camera path for a 30 s capture of the best moment. Suggested window: the siren and salvo 1 to 2, about t = 200 to 230, over the skyline with Arrow flashes, Sling launches and debris. `tools/capture.mjs --camscript trailer --t <t0> --len 30` must produce it.

## Critic evidence

- `S1-intro` plus an intro contact sheet.
- `C2-alert-beat` and `C4-overhead`.
- `tools/input-test.mjs` output.
- Hit-stop logs.
- The trailer contact sheet.
