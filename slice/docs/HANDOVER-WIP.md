# Iron Wall gauntlet: work-in-progress snapshot

**Snapshot:** 22 Oct 2026, 10:05 IDT. Branch `slice/iron-wall` on `sge2811-maker/Tzeva-Adom`, pushed.

## Done

- **Step 0.** The repo engine (`index.html` v45) is single-file vanilla JS with a Canvas 2D 2.5D renderer, which can't reach AAA. Iron Wall (mission c5) is ported into a standalone Three.js slice in `/slice`. The rest of the game is untouched.
- **Playable baseline, start to finish:** menu → intro flyover → prep (build batteries, air patrol) → Tzeva Adom siren and 75 s shelter routing → three ballistic salvos → hold → all-clear → debrief.
  - **Sim:** deterministic, seeded, 1/60 s fixed step, and runs in Node.
  - **Balance:** good play wins 8/8 seeds, and no play loses 8/8. Check with `node tools/regress.mjs`.
- **Systems at baseline:**
  - env: sky, terrain, town, airbase, distant lights, N8AO, bloom, AgX.
  - vfx: ribbon trails, particles, debris.
  - audio: fully synthesized.
  - HUD: DOM, world markers, routing UX, debrief.
  - camera: intro, RTS rig, cinematic mode, shake, hit-stop.
  - perf: overlay, dynamic resolution, F9 capture.
- **Tooling:**
  - `tools/shoot.mjs`: canonical critic shots.
  - `tools/capture.mjs`: deterministic clips → MP4 + contact sheet.
  - `tools/perf.mjs`: performance probe.
  - `tools/regress.mjs`, `tools/smoke.mjs`: regression and smoke tests.
  - `tools/status.mjs`: generates `status.html`.
- **Docs:**
  - `docs/BRIEF.md`: architecture and event contract.
  - `docs/streams/*.md`: the six briefs with rubrics.
  - `docs/CRITIC.md`: critic protocol.
  - `docs/AGENT-PROMPTS.md`: exact prompts to relaunch the builders and critics.
  - `../benchmark/TARGET.md`: the written 2020-era 3D RTS bar, per the owner's call. No third-party screenshots.

## In flight at the snapshot

Six builder agents had just started round 1: env, VFX, audio, HUD, camera, and perf (phase A). None had landed source changes yet. No critic round has run, so all streams sit at "building" on the status page.

## To resume (any Claude Code session)

```sh
git clone -b slice/iron-wall https://github.com/sge2811-maker/Tzeva-Adom.git && cd Tzeva-Adom/slice
cd tools && npm install && cd ..           # three/postprocessing/n8ao/playwright (dev only)
node tools/regress.mjs && node tools/smoke.mjs
python3 -m http.server 8790                # play at http://127.0.0.1:8790/
```

1. Relaunch the six builders with the prompts in `docs/AGENT-PROMPTS.md`, in parallel and in the background.
2. When a builder reports, spawn a fresh critic with the critic template in the same file. It writes `status/critic/<stream>-r<N>.json`.
3. If the score is ≥ 8, commit that stream's paths with the message `slice(<stream>): passes critic round N (score X)`. Otherwise, send the critic JSON back to the same builder for the next round. After 3 rounds without improvement, flag the stream and move on.
4. Update the board with `node tools/status.mjs --stream <id> --state ... --round N --score X --shot <jpg> --issues <json>`.
5. Run perf phase B once the other streams pass.
6. Run the final 30 s capture: `node tools/capture.mjs --t <t0> --len 30 --fps 30 --camscript trailer --audio --w 1920 --h 1080 --out final`. This needs the camera stream's `script('trailer')` and the audio stream's `__slice.audioOffline`.
7. Write the handover summary.

## Known limits

- **No GPU in the cloud box.** Renders use SwiftShader. True 60 fps sign-off needs one F9 capture on the RTX 3070 Laptop: open the slice in Chrome, play to the barrage, press F9 and wait 32 s, then send the JSON.
- **Audio critics can't listen.** Scores come from spectrograms, timing and loudness reports. Listen yourself before trusting the audio score.
