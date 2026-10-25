# Issue implementation and verification

Scope: open issues #1–#14, with WhiteLicorice's [MVP review #14](https://github.com/evolto06/damang-damang/issues/14)
as the priority. Work started from `cc33a60`, which already contained many review
fixes. This document records code coverage; it does not close GitHub issues or
claim subjective playtest approval.

Integration of PR #17 with current main: 141 unit tests pass. The combined Chromium suite is configured but has not been executed here; the PR's earlier 122-unit/22-browser results apply to its original branch only. Physical device and live deployment checks remain pending.

| Issue | Implementation | Evidence / remaining acceptance |
| --- | --- | --- |
| #1 Swing physics | Momentum-preserving cast, pendulum pumping/braking, eased winch, directional blocked-climb hint; simultaneous aerial updates use the same snapshot. | Aerial, crossing and fixed-render-rate tests; confirm feel in QA. |
| #2 Holder and background | Jointed fingers, knuckles, nails, cuff, shadowed limbs, window trim, striped shop awning and wider street coverage. Each outer twig has a holder. | Scene and holder-clearance tests; subjective art approval remains. |
| #3 Lunge combat | Eight-tick startup, nine-tick moving strike, 30 damage and 24-tick recovery. Active lunges evade webs; bites remain a counter. | Combat, lunge, controller and render-rate tests; balance playtest remains. |
| #4 HUD | Distinct fighter tints/markers, nearby per-player hints, readable fallback, damage numbers, health flash, bounded camera shake, touch cues, delayed result, return to menu. | Hint tests and browser viewport scenarios configured; device readability check remains. |
| #5 Upright flight | Smooth spinneret-pivoted upright roll on drop/knock-off, stable flight, eased inversion before the grip. | Mesh-level orientation, silk continuity and floor-clearance tests. |
| #6 Ground damage | 10 on impact, then 5 per 60 grounded ticks. Damage uses fixed ticks and the normal result flow. | Impact/cadence/recovery/lethal-draw tests. |
| #7 Knock-off | Surviving hits release after the six-tick contact hold, with outward velocity. Lethal contact stays visible. | Both headings, trades, AI retrieval and final-hit tests. |
| #8 Arena/camera | Expanded arenas; bounded horizontal tracking and zoom; framing accounts for raised twigs and pavement. | Camera easing and HUD-band tests; imported screenshot is a PR reference only. |
| #9 Layouts | One stick, Twin sticks and Terraces, including two heights. World-owned layout drives spawn, bounds, silk targets, grip, scene, camera and bot. | Crossing, bot traversal, per-world isolation and raised-geometry tests. |
| #10 Audio | Browser-synthesized bite, web, hit, stun, lunge, ground, grip and round cues; gesture unlock, mute and overlap limits. | Audio lifecycle tests; speaker/headphone balance needs human listening. No external sound assets. |
| #11 Animation | Longer articulated legs, distinct lunge poses, continuous airborne sway/climb, upright roll and eased grip. | Real GLB contact, animation and transition tests; visual approval remains. |
| #12 Outplays | Short web range, timed lunge web evasion, punishable attack recovery, drops/swing repositioning, knock-offs, ground cost and round timer. Bot adds seeded ranged pressure. | Combat/AI tests; demonstrate the choices in a two-player playtest. |
| #13 Longer legs | 25% longer intermediate reach with planted toe targets; head/body/jaw geometry and bite range remain calibrated. | Rig stance, source-mesh contact, holder/floor-clearance tests. |

## Adviser defects

| Review item | Coverage |
| --- | --- |
| D1 Subfolder loading | Relative Vite base and model path; HTTP deployment check plus a production browser test. |
| D2 Blocked-climb direction | Open-side hints from legal bounds, per player and input source. |
| D3 Stale tests / no CI | Updated intended contracts; CI checks formatting, unit tests, build, nested serving and Chromium. |
| D4 Predictable bot / endless round | Seeded delays, retreat/dodge, ranged pressure, 60-second timer and ground damage. |
| D5 Fighter identity / framing | Gold/teal rigs, labels, portrait advice, follow camera. |
| D6 Wrong PvP prompts | Per-player bindings and current input-source hints. |
| D7 Phone PvP has no P2 input | Two-player touch controls supply P1 and P2 without requiring a controller. |
| D8 Unavoidable web | Three-unit range plus the active lunge's web-evasion window. |
| D9 Tiny help | Nearby hints and 13px dark-box fallback. |
| D10 Instant result / no menu | One-second result delay, fight again and change mode/arena. |
| D11 Touch keyboard labels | Hide ready key captions and pulse the relevant touch controls. |
| D12 Documentation | Correct title, control table, separate mechanics, credits, explicit license/deployment limits. |
| D13 Per-frame DOM work | Startup lookup cache, changed-value writes, cached label measurements, no hidden distance meter. |
| D14 Script-load failure | Independent inline timeout with reload; production bundle-blocking scenario configured. |
| D15 Distant / P1-only hints | Projected per-player hints, guarded persistent toggle, accessible live-region fallback. |

## Other review recommendations

The required stage, knock-off and controller features are implemented. Controller
input includes analog deadzone, D-pad priority, press edges, neutral-release guards,
menu navigation and stable P1/P2 controller slots; keyboard and touch remain additive. Physical controllers still need QA.

Optional enhancements include synthesized audio, impact feedback, bite hints, formatting, first-to-two scoring, and saved first-match coaching. Videos remain team-owned submission deliverables.
The introductory copy describes the game's inspiration without inventing a team
member's personal experience.

See [QA.md](QA.md) for the concrete human checks. Pages configuration, branch
protection, issue ownership/milestones and a project license require repository
owner decisions; they are not represented as completed code fixes.
