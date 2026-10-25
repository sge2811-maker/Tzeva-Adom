# Tzeva Adom: Seven Fronts — v48 mobile audio

The audio startup and recovery path now handles suspended or closed browser audio contexts. Sound starts from the Deploy gesture unless previously muted, the Sound button reports a retry state instead of claiming a suspended context is running, and supported platforms receive an explicit playback-session request. Music/Voice controls can enable sound. Help includes **Restart / test sound** for the reported “Sound on but silent” case. Chromium signal checks pass; this Windows WebKit build lacks Web Audio, so physical iPhone Chrome/Safari output remains unverified. See [audio verification](AUDIO.md).

## Prior v47 phone landscape

Phone landscape now keeps the battlefield across the available width. **Commands** opens a scrollable drawer for Build, Train, Orders and Diplomacy; Hide or a map tap dismisses it. Statistics open above the battlefield without reducing its height. The HUD stays in one row, Pause stays first, and controls clear the notch and home indicator. Rotation preserves unit size and the running battle. Focused Chromium and WebKit checks include short visible heights, touch production and orders, and campaign briefing/deployment. Physical iPhone Safari remains a device check. See [verification details](RESPONSIVE.md).

## Prior v46 responsive interface

The full game now adapts to narrow phones, tablets, landscape displays, desktops and TVs. Collapsible commands/statistics, explicit Pan/Select touch tools, viewport-aware canvas sizing, safe-area spacing and large-display controls address the reported iPhone layout/control problem. The campaign engine, save format and isolated 3D diagnostic export remain unchanged. See [focused verification and device limitations](RESPONSIVE.md).

## Prior v45 release

Release build: `5086625a8055b0cd55d0d164e9b508a3a1673958a3ad53873584c17c54772fc3`.

The final pass fixes six additional defects on top of the v44 campaign, skirmish, recovery, touch and recorded-voice work:

- M1/M7/M14 holds now measure actual mission time and reset when the required ownership is lost.
- M1 requires its three specific fence crossings; the rear supply point cannot substitute for one. Live point counts explain progress.
- Future-operation previews refresh for Automatic/A/B/C and use the same saved-consequence resolver as Start.
- Grid-aware terrain checks prevent movement shortcuts through blocked city corners while preserving bridges and naval routes.
- M7's eliminated Hamas command no longer respawns scripted fighters or launches later scripted barrages.
- Six recurring attacks in M1/M3/M4/M7/M9/M15 now begin at their authored times. Duplicate `from` keys had overwritten the start time with launch coordinates, causing an immediate first attack. Launch origins and repeat intervals are preserved.

Final-build M7 was won at **05:31**, with the full 180-second hold, debrief, Next to M8 and matching saved completion after reload. Earlier immutable v45 runs verified M1's full 120-second hold/victory and M14's 90-second hold. Current frozen-source regression passed 16/16 checks, including the 109-case scenario sweep; targeted event, movement, branch and result checks are documented separately.

No unit damage, unit prices, starting funds or AI difficulty was reduced to obtain a win. The event corrections restore intended timing and stop a defeated local command from returning.

The release decision is based on defect testing in the documented coverage. It does not certify every branch, browser or mission victory. M3 and M12 have functional/defeat coverage and no verified full wins; their balance remains a follow-up risk. See the QA report for the full distinction between observed play and developer fixtures.
