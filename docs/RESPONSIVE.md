# Responsive interface — v47

The player should be able to open the full game, reach the campaign or skirmish, deploy, select troops, issue orders, use production and diplomacy, and keep playing when the screen size or orientation changes.

## Changes

- The game follows `visualViewport` height, with dynamic viewport CSS and `innerHeight` fallbacks. Page zoom remains available. Inputs have a minimum 16px font to avoid unintended Safari form zoom.
- Narrow upright screens have a collapsible bottom command panel and expandable statistics. Phone landscape has a full-width battlefield with a **Commands** drawer; large tablets, PCs and TVs use a sidebar when space permits. No orientation is forced.
- The battlefield has persistent Pan/Select, zoom, base, Fit and Help controls. Touch dragging defaults to Pan; desktop dragging defaults to Select. Taps still select and issue orders. Two-finger pan/pinch and right-click orders remain available.
- Touch hit tolerance is larger. Touch cancellation, lost pointer capture, leaving the page, and orientation changes clear incomplete gestures. Small control labels use the readable body font, avoiding very thin decorative lettering in WebKit.
- Map focus supports arrow/WASD panning. Help pauses an active battle and restores the prior pause state when closed.
- Canvas resizing preserves the centre world point and on-screen unit size. Explicit Fit mode continues to fit the whole map after resizing. Safe-area padding protects controls near notches and home indicators. Large displays scale HUD, production and command controls up to 1.6×.
- Menus, briefing panels and command panels scroll within the available space. The page stays self-contained with embedded assets.

## Focused verification

### v47 landscape follow-up

The v46 landscape sidebar permanently consumed at least 250 CSS pixels, and rotation scaled camera zoom with the shorter map height. Both made the horizontal phone layout harder to play. The drawer now overlays the map only when requested. Commands, Hide or a first map tap closes it; that dismissal tap does not issue an accidental order. Statistics and commands dismiss one another. The one-row HUD puts Pause and Stats first, with remaining actions horizontally scrollable if necessary. The selected-unit strip also scrolls horizontally rather than stacking over a short battlefield.

Chromium and WebKit passed focused landscape checks at 932×430, 932×300, 852×300, 667×280 and 568×280. The first three cases simulate 59px side safe areas; all simulate a 21px bottom safe area. These are explicit CSS test inputs, not measurements from an iPhone. Assertions cover the full available map width, at least 54% of the visible height for the map, 44px map controls inside safe bounds, scrollable drawer tabs and production reaching the engine, safe map dismissal followed by an actual order, statistics without map shrinkage, and rotation preserving unit size, entity identity and selection. At 932×300 with those insets, the map is 814×175 CSS pixels. Private screenshots were inspected with the drawer open and closed.

The retained nine-size layout checks and actual-input interaction checks also passed in both engines. The campaign path now runs at 852×300 through menu, briefing, deployment and opening/closing Orders. Run `node tests/responsive.cjs --landscape-only` for the ten landscape cases, or `--skip-landscape` for the retained coverage separately. No full campaign regression was run.

### Retained responsive coverage

Playwright 1.62.1, Chromium and WebKit on Windows. `tests/responsive.cjs` starts its own local server and fresh browser contexts; it never imports the user's saves or forces a victory.

Both engines passed the layout flow at 320×568, 390×664, 430×932, 932×430, 768×1024, 1024×768, 1366×768, 1920×1080 and 3840×2160. Checks cover menu deployment, Build/Train/Diplomacy panel access, expanded statistics, help, viewport containment, minimum battlefield area and continuing simulation. No page errors were recorded.

Both engines passed actual UI selection, a ground order followed by unit movement, shared-pointer panning, zoom/home, keyboard pan, live portrait/landscape/shorter-viewport resizing, retained selection and entity identity, accepting production, and campaign menu → M1 briefing → deployment. Chromium additionally passed trusted multi-touch pinch, one-finger pan, and touch cancellation checks. WebKit touch taps were exercised; its drag path was checked with mouse pointer input. Physical iOS gestures and Safari chrome transitions still need a device check.

At 430×932 in WebKit, the battlefield increased from about 415px to 754px high with panels collapsed. The panel and statistics remain accessible. Screenshots and raw local run logs remain private and are excluded from this repository.

The simulation/mission engine (first inline script) is byte-identical to the parent commit: SHA-256 `cf39cd6ab4d94ad413acf013700e55da47dc03a9814048e3079bebc3b0323a3b`. Campaign content, balance, storage keys, saves, embedded assets and diagnostic PCKs were not changed. No full regression suite or new campaign victory is claimed.

## Limits

Browser emulation does not certify hardware performance, physical safe-area dimensions, remote-only TV input, every browser/OS version, or every campaign branch. This update addresses the reported loading-but-unusable layout/controls issue. It does not claim to fix an unobserved iPhone rendering crash or guarantee a frame rate. The native 1080p/High/30-FPS diagnostic acceptance remains separate.
