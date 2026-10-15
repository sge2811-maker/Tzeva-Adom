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
- Army, fleet, engineer, artillery and MCV selection controls are separate.

## Saves and sound

Progress is stored in your browser for the current origin. Keep using the same browser and localhost port; use the game's native operation export/import controls for backups or transfers. The approved 52-clip English/Hebrew voice starter pack and fonts are embedded. Unrecorded English/Hebrew narration retains captions rather than inventing spoken lines.

## Release and QA

Version **v45**, 15 October 2026. The final HTML SHA-256 is:

```text
5086625a8055b0cd55d0d164e9b508a3a1673958a3ad53873584c17c54772fc3
```

See [release notes](docs/RELEASE-NOTES.md), [QA coverage and limits](docs/QA.md), and [the issue register](docs/QA-ISSUES.json). QA primarily used Chromium 156. Full M3/M12 victories and exhaustive branch/browser coverage remain unverified; developer fixtures are not played wins. No claim of zero possible bugs is made.

Private screenshots, browser profiles, player saves and test input logs are excluded from this repository. The game code is licensed under the [MIT License](LICENSE). Embedded third-party fonts retain their licences in [FONT-LICENSES.txt](FONT-LICENSES.txt).
