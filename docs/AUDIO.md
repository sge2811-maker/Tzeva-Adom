# Mobile audio — v48

The reported failure was an iPhone 15 Pro Max running mobile Chrome: the button said Sound on but nothing was audible. Safari was also requested for checking.

## Changes

- New players get audio from the actual Deploy/briefing gesture. An existing saved mute is honored, and no audio context starts on page load.
- Supported platforms receive `navigator.audioSession.type = 'playback'` before audio starts; muting releases the explicit type back to `auto`. Missing or rejected optional APIs leave Web Audio usable.
- Context resume happens directly in the input handler. Suspended/interrupted contexts show **Tap for sound** and retry on subsequent input, page return or restored visibility. Resume failures are caught. Closed contexts rebuild their graph.
- **? → Restart / test sound** explicitly rebuilds even a context that reports running but remains silent, then generates two short notes. This resets audio only; it does not restart the mission.
- Muting reaches zero output after a short fade. Music and Voice controls can enable master sound. All master buttons share current-state labels.

The [Audio Session specification](https://www.w3.org/TR/audio-session/) defines the optional playback type. [Chromium's iOS web layer](https://chromium.googlesource.com/chromium/src/+/main/ios/web/README.md) documents its use of WKWebView. These inform the shared iPhone browser path; they do not certify this release on a physical phone.

## Focused verification

`npm run test:audio` uses fresh browser contexts and actual touch UI input, with the iPhone 15 Pro Max profile at 430×932 and 932×300. Chromium checks observe real PCM samples from the music bus, final output, recorded unit voice source and test tones. They also exercise mute/unmute, saved mute after reload/Deploy, enabling music while muted, rotation and recovering an intentionally suspended or closed platform context. A rejected-resume check confirms that the UI does not falsely report Sound on.

Separate Chromium checks instrument the optional Audio Session interface to confirm playback requests, release on mute, and continued real audio when a platform setter rejects. Campaign briefing sound controls and deployment are exercised through their actual UI. This instrumentation checks API calls; it does not emulate iOS speaker routing.

Chromium passed both viewport flows with nonzero music, recorded voice and output samples, and zero output when muted. No uncaught page errors were recorded. The existing portrait/landscape/large-display layout checks are kept separate from signal verification.

The bundled Windows WebKit 26.5 browser exposes neither AudioContext nor webkitAudioContext. It therefore cannot verify Safari audio playback. Both phone viewport cases instead verify the honest **Sound unavailable** fallback, help, and continuing gameplay. A green fallback check must never be described as a Safari sound pass. Previous WebKit layout checks likewise did not establish audio playback.

No full campaign suite was run. The simulation/mission engine, campaign data, embedded audio assets, save formats and native diagnostic builds are unchanged.

## Physical iPhone check still required

In both Chrome and Safari, open the current published URL and deploy. Confirm music/effects, select a unit for its recorded voice, mute/unmute, and rotate the running battle. Switch apps or lock/unlock, return, and tap if the browser requests it. If Sound on stays silent, use **? → Restart / test sound** and check the two notes with audible media volume and the intended speaker/Bluetooth route. Confirm the same behavior with Silent mode on and off. Neither hardware output nor every iOS interruption can be proven by the Windows browser tests.
