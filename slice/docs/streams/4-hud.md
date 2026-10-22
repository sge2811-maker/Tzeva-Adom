# Stream 4: HUD and UX

**Owner:** builder `hud`.

**Files you own:** `src/hud/**`, plus new `tools/ux-test.mjs`. You may vendor an OFL font under `vendor/fonts/` with its licence (`npm install @fontsource/...` from `tools/`).

**Benchmark:** `../../benchmark/TARGET.md` §4. References: AoE IV and CoH3 HUD clarity, and Iron Harvest's cinematic restraint.

## Current state

The baseline is functional but busy:

- **DOM HUD:** start screen, intro cards, clock, budget, objectives, red-alert countdown, threat board, command bar, feed, toasts and debrief.
- **World markers:** pads, shelters, groups, Nevatim and Arad, drawn as text pins that overlap heavily.
- **Route lines:** on a 2D canvas.
- **Routing UX:** click a group, then a shelter. Click a locked shelter to open it.

## Goals, in priority order

1. **Minimal by default.** The world carries the drama. Panels are compact and edge-anchored, and the feed is quieter. Show state at a glance with original SVG icons and no emoji.
2. **Red-alert moment.** The countdown is unmissable but elegant: the Hebrew צבע אדום, the English line, and the seconds to the impact window. It transitions into the barrage ("stay inside") and hold ("all-clear in …") states, then the all-clear.
3. **Shelter routing a first-time player gets in seconds:**
   - Group markers show count and status (OK, tight, late, locked out) with ETA against the countdown.
   - Shelter markers show capacity and locked or open state.
   - Selecting a group previews its route, and hovering a shelter previews the alternative route and its ETA before you click.
   - Clear feedback appears on reroute, unlock and overflow.
   - Planning before the siren works too.
4. **Declutter.** Markers collide-avoid and prioritise: the selected group, groups in trouble and locked shelters first. They scale or simplify with zoom, and aggregate when far away (one Arad cluster pin). At default zoom nothing overlaps.
5. **Information hierarchy.** Objectives are compact, with progress where it matters (`people sheltered 64/92`). Budget, threat board and air-defence status appear in one place: battery ammo and reload, and the air-patrol cooldown. Consider a small radar or minimap for inbound tracks, like the 2D game's.
6. **Typography.** Use one vendored OFL display/UI family plus a mono, with correct Hebrew rendering. The start screen, intro title cards and debrief should feel like a shipped game.
7. **`tools/ux-test.mjs`.** A Playwright script that plays the routing UX through **real clicks** on the HUD and reports pass or fail:
   - Pre-alert: pick the walkers and send them to S7.
   - On the siren: unlock S1 and S5.
   - Verify everyone is sheltered by the impact window.
   - Also verify that building a battery through the pad popup works.

   Critics run it.

## Rules

- Every interaction goes through `sim.cmd()`.
- Keep DOM writes throttled and avoid per-frame layout thrash. Use transforms for marker positions.

## Critic evidence

- **Shots with UI:** `S2-tactical`, `S4-alert`, `S4b-alert-wide`, `S7-aftermath`, `S8-debrief`, and the menu (`?` with no params; take a shot from `flow: menu`).
- **Clip:** `C2-alert-beat`.
- **Test:** `tools/ux-test.mjs` output.
