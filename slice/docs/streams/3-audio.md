# Stream 3: Audio

**Owner:** builder `audio`.

**Files you own:** `src/audio/**`, plus new `tools/audio-render.mjs`.

**Benchmark:** `../../benchmark/TARGET.md` §3. References: CoH3 and WARNO soundscapes. **Original or royalty-free only.** Prefer pure synthesis. Using a CC0 sample requires source and licence in `docs/ASSETS.md`.

## Current state

The baseline is fully synthesized Web Audio:

- **Siren:** a rising-falling saw/square through a lowpass, at Arad, Dimona and Nevatim.
- **Launches:** noise bursts.
- **Booms:** delayed by the speed of sound.
- **Drone buzz:** follows the nearest drone.
- **Ambience:** wind and crickets.
- **UI:** clicks.
- **Spatialisation:** HRTF panners, with the listener on the camera.

Audio starts on the `begin` event (the user gesture).

## Goals, in priority order

1. **Siren.** A convincing civil-defence rising-and-falling siren, synthesized and not a recording, starting exactly on `alert:start`. It is heard from the town centre with distance and reflections, so add slapback or reverb. The Nevatim and Dimona sirens stagger in, and everything stops cleanly. Ducking puts ambience under it.
2. **Spatial mix.** Correct panning as the camera moves. Distance filtering cuts highs over km, and booms arrive late after the flash. Separate audible layers: near crack and far rumble. Cap and steal voices; the barrage can trigger 50+ events a minute.
3. **Weapons and impacts.**
   - **Launch:** an ignition crack, a roaring whoosh that recedes upward with Doppler-ish pitch, and a different signature per layer (Dome, Sling, Arrow).
   - **Intercept:** a sharp double boom when near and a rolling thunder when far.
   - **Impacts:** heavy, with low end.
   - **Debris:** crackle when close.
   - **Shahed:** a moped-like two-stroke buzz.
   - **Jets:** a flyby roar.
   - **Variation:** randomize every one-shot.
4. **Ambience and score.** Desert night wind, insects, an occasional distant dog and a faint town hum. Insects drop out when the siren starts. An optional low, original tension bed or score can swell with the alert and resolve at the all-clear. Keep it tasteful.
5. **UI sounds.** Subtle and consistent: select, route, unlock, build.
6. **Offline render, required for the final 30 s capture.** Implement `window.__slice.audioOffline(t0, t1) → Promise<base64 WAV>`. It renders the mix for that sim-time window with an `OfflineAudioContext`. Use `bus.log`, which holds every event with sim time `t`, and the camera track for the listener: record camera position and orientation per frame into a ring buffer, or accept a provided track. The output must be deterministic. `tools/capture.mjs --audio` muxes it into the MP4.
7. **Critic tooling: `tools/audio-render.mjs`.**
   - **Inputs:** `--t0 --t1 --out`. It runs a seeded headless session to `t1` (seek), then calls `audioOffline`.
   - **Outputs:** a WAV, a spectrogram PNG with event markers (`alert:start`, salvos, impacts), and `report.json`.
   - **`report.json` contents:** peak dBFS, an approximate integrated loudness (LUFS approximation), clipping count, the siren's pitch contour (min, max and period), onset times against event times with expected speed-of-sound delays, and voice counts.

   Critics can't listen. They judge from these artifacts and from your synthesis code, so make the artifacts honest and informative.

## Critic evidence

- `node tools/audio-render.mjs` for three windows: alert beat (150–190), salvo (205–262) and aftermath (295–325). Each produces a spectrogram and `report.json`.
- A code review of the synthesis.

## Budget

No audio-node leaks: disconnect after use. A concurrent voice cap of about 48. The `update()` call stays at or under 0.3 ms CPU.
