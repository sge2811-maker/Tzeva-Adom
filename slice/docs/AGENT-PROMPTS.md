# Agent prompts: builders and critics

These are the exact prompts that launch the gauntlet agents. Use them to resume in any Claude Code session.

## Shared rules

Every builder prompt below carries the same rules. Restate them in full when you relaunch an agent:

- Read `slice/docs/BRIEF.md`, then your stream brief `slice/docs/streams/<n>-<id>.md`, then `benchmark/TARGET.md` and `slice/docs/CRITIC.md`.
- Edit only the files your stream owns. Five other builders edit other folders in the same working tree.
- Never run `git checkout`, `reset`, `stash`, `clean`, `commit` or `push`. Never delete other streams' files or outputs.
- Original assets only. No copyrighted models, music, sounds, logos, insignia or brands. Fonts must be OFL and vendored with their licence.
- Tone: grounded and respectful. No gore.
- Respect the budgets in `BRIEF.md`. Keep the console error-free. If you touch `sim/` or `world/`, keep `node tools/regress.mjs` passing.
- Rendering is CPU-only (SwiftShader, 2 cores) behind a shared lock. Iterate at 960×540 and confirm at 1600×900. Never run duplicate renders. Write outputs to `slice/status/shots/<id>-dev*/` and `slice/status/clips/<id>-dev*/`.
- Process: render your evidence, make the biggest wins first, iterate, and stop at 8+/10 or after a substantial round (about 60–120 minutes).
- The final message is a report: (a) changes by file, (b) best evidence paths, (c) known gaps, (d) cross-stream changes, (e) budget numbers.

## Per-stream specifics

**env.** Owns `src/env/**` and the building-generation part of `src/world/layout.js`. Known baseline issues:

- The terrain is too blue or dark and reads as a void in places.
- Roads read as thick black grids.
- Buildings are plain boxes.
- A white bloom blob appears at the lower left of `S3-drones`. Find its cause.
- There is weak atmospheric separation between layers.

Evidence: `S1`–`S7`, plus `--ui 0` versions.

**vfx.** Owns `src/vfx/**`. It may add (not modify) entries in `src/core/shots.js`. Use the seeded RNG and the given `dt`.

- Clips: `C1-arrow`, `C3-drone-kill`, `C4-overhead`.
- Shots: `S3`, `S5`, `S6`, `S7`.
- Budget: ≤ 30 draw calls and ≤ 1.5 ms CPU at peak.

**audio.** Owns `src/audio/**` and the new `tools/audio-render.mjs`. Use synthesis only. Required deliverables:

- `window.__slice.audioOffline(t0, t1)` returning a base64 WAV through `OfflineAudioContext`, driven from `bus.log` and a camera track.
- `tools/audio-render.mjs` producing a WAV, a spectrogram with event markers, and `report.json` (peak, loudness, clipping, siren contour, onset-vs-event alignment, voices).
- Windows: 150–190, 205–262 and 295–325.

**hud.** Owns `src/hud/**`, the new `tools/ux-test.mjs` and `vendor/fonts/**` (OFL).

- Build a minimal cinematic HUD and an elegant red-alert countdown with Hebrew.
- Make the routing UX understandable in seconds, with decluttered markers.
- `tools/ux-test.mjs` uses real clicks with `?demo=off`: send G7 to S7 pre-alert, unlock S1 and S5 at the siren, check everyone is sheltered at t = 235, and build a battery through the pad popup.

**camera.** Owns `src/camera/**`. It may change `src/sim/pacing.js` within limits (never `alertAt`, `countdown`, `ballisticFlight` or `salvos[].enter`), make additive changes to `tools/capture.mjs` (`--intro`), and add the new `tools/input-test.mjs`.

- Authored intro and a deterministic intro capture.
- AoE IV-feel tactical camera.
- `input-test.mjs` reporting latency, settle, overshoot and jitter.
- Beat pacing.
- Hit-stop ≤ 80 ms.
- A better cinematic camera (C).
- Required: `camera.script('trailer')`, a 30 s authored deterministic path around t ≈ 200–232.

**perf.** Phase A owns `src/perf/**`, `src/core/quality.js`, `tools/perf.mjs` and the new `docs/PERF.md`. It may make additive changes to `src/main.js` and allocation-only fixes in `src/sim/*`. There is no GPU here, so never claim GPU timings.

- Instrumentation (timer queries when available), quality tiers, smooth dynamic resolution and a budget checker that fails loudly.
- Optimization requests for the other streams.
- Phase B is cross-stream optimization after the others pass, with before/after numbers.

## Critic template (fresh agent per round)

```
You are a fresh-context CRITIC for the "<Stream name>" stream, round <N>, of the Iron Wall vertical slice
(Three.js port of one mission of the game Tzeva Adom). You did not build it. Judge the RUNNING game strictly
against the 2020-era 3D RTS benchmark.
Slice root: /home/claude/tzeva-adom/slice (do NOT edit source files, do NOT commit).
Read: benchmark/TARGET.md, slice/docs/CRITIC.md (your protocol), slice/docs/streams/<n>-<id>.md (brief + evidence list),
and skim slice/docs/BRIEF.md. Builder's report (context only, verify yourself): <summary>.
Previous round (if any): score <X>, issues in status/critic/<id>-r<N-1>.json — score absolutely, not relative.
Render the evidence into slice/status/shots/<id>-r<N>/ and slice/status/clips/<id>-r<N>/ (shared render lock: be
patient, no duplicates). Write slice/status/critic/<id>-r<N>.json per CRITIC.md including "bestShot" (a .jpg you
rendered). Final message: score + top 3-5 issues.
```
