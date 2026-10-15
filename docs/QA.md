# Tzeva Adom: Seven Fronts — final release QA

**Ready for distribution in the tested Chromium configuration. No confirmed blocking software defect remains in this evidence set.** 15 October 2026. HTML SHA-256: `5086625a8055b0cd55d0d164e9b508a3a1673958a3ad53873584c17c54772fc3`.

The acceptance priority is finding and fixing defects, rather than treating a win as proof of bug freedom. This sign-off covers the reported controls, objectives, timing, production, saves, recovery, branch consequences, endings, offline assets and supported input paths. It is not an assertion of exhaustive play or zero possible bugs.

## Coverage and outcomes

| Area | Evidence and practical limit |
|---|---|
| M1–M25 broad coverage | Immutable v44 reports recorded 22 full wins plus functional/defeat checks. These are historical runs, not 25 new final-build wins. |
| M1/M7/M14 repaired holds | Actual 72c M1 won 16:33 after 120 seconds and reached M2; actual M14 held for 90 seconds, without a full mission replay. Final 508 M7 won 05:31 after 180 seconds, reached M8 and retained ✓05:31 after a real page reload. Independent clock/node/reset fixtures also pass. |
| M3/M12 follow-ups | Repeated real-input attempts reached native defeats. M3 cleared all eight shafts in an intermediate path-fix run but remained unfinished; current 72c worker attempts lost their HQ. M12 cleared all eight strongholds and kept its airbase standing in the parent run, then lost at US Resolve 0, 15:46. No full win/Next/save claim for these two missions. No invulnerable-objective or remaining path dead end was reproduced. |
| M26/M27 | Historical real-input four-sector completions, earned TEHRAN HAS RISEN and mountain engineer holds. No fresh full replay after the narrowly scoped v45 fixes. |
| M28–M31 | Historical representative earned/standalone A/B/C operation and treaty outcomes; earned-record follow-ups checked carry, all-five military gates, eligible M31 entry and refusal of the authentic tactical C ending. M28 operation completion is not comprehensive military victory. Not every branch was played end to end. |
| Future previews | 72c and 355bb native UI checked Automatic/A/B/C, actual A briefing and 390×780 wrap. Viewport-only retest preserved M30 selection. The final UI script is byte-identical; final engine differences concern legacy event scheduling only. |
| Skirmishes/naval | Historical v44: all nine scenarios reached terminal results and all 24 supported-side starts advanced. 72c naval smoke observed real DDG formation movement, target/MCM orders, minimap and reload. This short smoke does not prove a specific corner path or completed mine clearance. |
| Phone/offline/audio | Historical real touch, pinch, pan, rotation/reload and offline file checks; embedded fonts and 52 approved English/Hebrew recorded clips. Assets remain unchanged. Every clip decoded; a fresh human listening review of all lines is not claimed. |

## Six final fixes and validation

| ID | Defect | Validation |
|---|---|---|
| Q45-001 | Evaluation-count holds ran 7.5× too fast. | Actual M1/M7/M14 elapsed holds plus pause, reset and same-clock engine cases. |
| Q45-002 | Future preview could show C objectives while Start launched A. | Shared resolver; 33 contract cases and native Automatic/A/B/C/briefing/portrait checks. |
| Q45-003 | Coarse terrain sampling skipped a blocked cell and stranded a tank at a city corner. | Baseline reproduction; actual corrected city/bridge play; independent engine cases and 2000-cast oracle. |
| Q45-004 | Rear supply point could substitute for an M1 fence crossing. | All three false arrangements rejected; correct three-node hold/reset; actual M1 win. |
| Q45-005 | M7 scripted fighters/rockets returned after their local command was eliminated. | Independent baseline spawned six units while its side was out; corrected engine stays silent, live-command control still fires; final M7 observed through 03:00/05:20 and won. |
| Q45-006 | Duplicate `from` keys erased six authored first-attack times. | Actual-engine first firing/repeat/origin cases for M1/M3/M4/M7/M9/M15; M9's separate +6/+10 responses preserved. |

The final frozen-source suite passed **16/16**: 13 developer fixtures and three source suites. The 109-case sweep had zero invariant failures; 77 result renders passed. Native record validation, exact restores, storage-failure behavior, marker targeting, production, movement, audio and ending/progression checks are separated from player outcomes. Synthetic wins are not counted as played wins. A superseded 355bb broad run may have read changing source and is not used as final proof; the authoritative 508 suite reads its own frozen snapshot.

## Remaining limits and balance observations

- M3 and M12 victories remain unverified. Their repeated tactical defeats warrant additional human balance review; the report does not call them proven unwinnable or conceal the gap.
- This is not one uninterrupted M1–M31 campaign or an exhaustive traversal of every opening and ending.
- Runtime QA primarily used Chromium 156. Safari and Firefox are uncertified. An older Chromium 154 session/profile-specific export crash was not attributed to a game-code fix.
- The approved 52-clip starter pack does not voice all dynamic English/Hebrew narration; unrecorded lines retain captions.
- A screenshot helper's forced Pause click behind menus confounded one responsive-selection observation. A clean viewport-only retest found no selection defect. One worker's six-second M7 clock discrepancy came from a screenshot filename; the visible HUD/debrief both showed 05:48. Neither is retained as a game bug.

## Integrity and method

Independent players used their own immutable private copies, profiles and drivers, real input only, 8× by default and brief focused observation pauses. Developer source review/fixtures are labelled separately; source-informed parent tactics are marked developer-assisted. Captured game-console/page errors in the final follow-ups were zero beyond the deliberate capture self-tests; locator/input errors are recorded as harness issues rather than hidden.

The final HTML and packaged copy match, both inline scripts parse, final UI/assets match the checked baseline, and no external script/stylesheet/media dependency or credential marker was found. Package hashes and ZIP integrity are checked separately. Screenshots, profiles, player/native saves, credentials and input logs are excluded.
