# Tzeva Adom: Seven Fronts

A self-contained browser RTS with 31 campaign missions, branching future operations, a diplomacy finale, and nine skirmish scenarios. The continuation to January 2029 is explicitly fictional.

## Play locally

Open `index.html` in a current Chromium-based browser, or serve this folder:

```sh
python -m http.server 8765
```

Then open **http://localhost:8765/?speed=8**. Turn Sound on after opening. No build step, installation, API key or online asset download is required.

## Controls

- Click or drag a box to select; right-click to move or attack on desktop.
- Keys **1–4** select **1× / 2× / 4× / 8×**; **Space** pauses; **Escape** cancels placement.
- On touch devices, tap to select/order, pinch to zoom and use two fingers to pan.
- **Pan** enables one-finger/mouse dragging; **Select** enables drag-box selection. **Fit** shows the whole battlefield.
- On narrow screens, tap Build/Train/Orders/Diplomacy to open the command panel; tap the active tab again or Hide to collapse it. **Stats** expands the meters. **?** opens the controls guide and pauses play while reading.
- Focus the map and use **arrow keys / WASD** to pan with a keyboard.
- Army, fleet, engineer, artillery and MCV selection controls are separate.

## Saves and sound

Progress is stored in your browser for the current origin. Keep using the same browser and localhost port; use the game's native operation export/import controls for backups or transfers. The approved 52-clip English/Hebrew voice starter pack and fonts are embedded. Unrecorded English/Hebrew narration retains captions rather than inventing spoken lines.

## Responsive interface (v47)

The interface follows the visible browser viewport. Upright phones have a collapsible bottom panel; phone landscape uses a full-width battlefield with an on-demand **Commands** drawer; large displays use a sidebar. Touch controls, safe-area padding, rotation without restarting or shrinking units, and larger controls on large displays are included. Gameplay rules, the campaign, and save formats are unchanged. The separate `mission2-3d-review` export is unchanged.

Focused layout and interaction checks run in Chromium and WebKit from 320×568 to 3840×2160. This is browser emulation, not certification of a physical iPhone or a TV browser. See [responsive QA and limitations](docs/RESPONSIVE.md).

To run only these focused checks: install Node.js, run `npm install`, `npx playwright install chromium webkit`, then `npm run test:responsive`. No build step is needed to play.

## Mobile audio (v48)

Sound starts on Deploy unless you previously muted it. The Sound button shows **Tap for sound** when the browser suspends audio. **? → Restart / test sound** rebuilds the audio connection and plays two notes. Music and Voice controls can enable audio, and mute preferences persist. See [audio checks and iPhone/Safari limitations](docs/AUDIO.md). Run only the audio checks with `npm run test:audio`.

## Prior release and QA

Version **v45**, 15 October 2026. The final HTML SHA-256 is:

```text
5086625a8055b0cd55d0d164e9b508a3a1673958a3ad53873584c17c54772fc3
```

See [release notes](docs/RELEASE-NOTES.md), [QA coverage and limits](docs/QA.md), and [the issue register](docs/QA-ISSUES.json). QA primarily used Chromium 156. Full M3/M12 victories and exhaustive branch/browser coverage remain unverified; developer fixtures are not played wins. No claim of zero possible bugs is made.

Private screenshots, browser profiles, player saves and test input logs are excluded from this repository. The game code is licensed under the [MIT License](LICENSE). Embedded third-party fonts retain their licences in [FONT-LICENSES.txt](FONT-LICENSES.txt).
