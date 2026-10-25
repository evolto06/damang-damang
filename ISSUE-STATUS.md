# Issue implementation and verification

Scope: open issues #1–#14, with WhiteLicorice's [MVP review #14](https://github.com/evolto06/damang-damang/issues/14)
as the priority. Work started from `cc33a60`, which already contained many review
fixes. This document records code coverage; it does not close GitHub issues or
claim subjective playtest approval.

Verified locally on 2026-10-25: 155 unit tests, 36 Chromium browser scenarios,
Prettier check, production build and nested deployment HTTP check all pass.
The browser matrix includes 1366×768, 1024×600, 844×390 and 390×844, virtual
controller routing/menu navigation, model failure and pre-module boot failure.
The Pages API returned 404 and no rulesets were listed; live publication and
the complete branch-protection configuration remain unverified.

| Issue | Implementation | Evidence / remaining acceptance |
| --- | --- | --- |
| #1 Swing physics | Momentum-preserving cast, pendulum pumping/braking, eased winch, directional blocked-climb hint; simultaneous aerial updates use the same snapshot. A free swing can rise above its anchor's twig height. A fresh Web press during a return can cast onto a nearby higher twig and finish there; UI prompts and buttons share the simulation gate. The attached opponent can reposition or lunge during a return, within twig bounds. | Aerial, real run/drop/cast overshoot, low-to-high recasts for both players, crossing, recovery movement and fixed-render-rate tests; confirm feel in QA. |
| #2 Holder and background | Jointed fingers, knuckles, nails, cuff, shadowed limbs, window trim, striped shop awning and wider street coverage. Each twig has a holder, including the Terraces center. | Scene and holder-clearance tests; subjective art approval remains. |
| #3 Lunge combat | 26-tick startup, nine-tick moving strike, 30 damage and 36-tick recovery. Active lunges evade webs; the faster close-range bite wins simultaneous starts and punishes missed lunges. | Combat, lunge, controller and render-rate tests; balance playtest remains. |
| #4 HUD | Distinct fighter tints/markers, nearby per-player hints, readable fallback, damage numbers, health flash, bounded camera shake, touch cues, delayed result, return to menu. | Hint tests and browser viewport checks; device readability check remains. |
| #5 Upright flight | Smooth spinneret-pivoted upright roll on drop/knock-off, then Eusef's eased inversion while returning once clear of pavement. A higher recast preserves that return roll. | Mesh-level orientation, silk continuity, recast continuity and floor-clearance tests. |
| #6 Ground damage | 10 on impact, then 5 per 60 grounded ticks. Damage uses fixed ticks and the normal result flow. | Impact/cadence/recovery/lethal-draw tests. |
| #7 Knock-off | Surviving hits release after the six-tick contact hold, with outward velocity. Lethal contact stays visible. | Both headings, trades, AI retrieval and final-hit tests. |
| #8 Arena/camera | Expanded arenas; bounded horizontal tracking and zoom; framing accounts for raised twigs and pavement. | Camera easing and HUD-band tests; browser screenshots. |
| #9 Layouts | One stick, Twin sticks, Eusef's two-height Stepped sticks and three-stick Terraces. Terraces has symmetric raised starting perches and a lower center fighting stick, requiring two gap crossings to chase between perches. Menu descriptions explain each layout. World-owned layout drives spawn, bounds, silk targets, grip, scene, camera and bot. | Crossing, bot traversal through the center in both directions, per-world isolation and raised-geometry tests; confirm arena variety in QA. |
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
| D7 Phone PvP has no P2 input | Separate touch controls for both players; one controller can alternatively supply P2. Disabling shared touch requires another P2 input. |
| D8 Unavoidable web | Three-unit range plus the active lunge's web-evasion window. |
| D9 Tiny help | Nearby hints and 13px dark-box fallback. |
| D10 Instant result / no menu | One-second result delay, fight again and change mode/arena. |
| D11 Touch keyboard labels | Hide ready key captions and pulse the relevant touch controls. |
| D12 Documentation | Correct title, control table, separate mechanics, credits, explicit license/deployment limits. |
| D13 Per-frame DOM work | Startup lookup cache, changed-value writes, cached label measurements, no hidden distance meter. |
| D14 Script-load failure | Independent inline timeout with reload; tested with the production bundle blocked. |
| D15 Distant / P1-only hints | Projected per-player hints, guarded persistent toggle, accessible live-region fallback. |

## Other review recommendations

The required stage, knock-off and controller features are implemented. Controller
input includes analog deadzone, D-pad priority, press edges, neutral-release guards,
menu navigation and one-pad PvP assignment. Physical controllers still need QA.

Selected optional enhancements are synthesized audio (E1), hit feedback (E3), bite
range hints (E4) and formatting (E8). Eusef's main-branch additions include
best-of-three scoring and saved first-match coaching (E2/E5), retained during
the PR merge reconciliation along with shared touch PvP and idle animation.
Scoring/coaching/idle simulation tests pass; a complete match and physical shared
touch playtest remain human checks. A narrated demo video (E6) remains follow-up.
The introductory copy describes the game's inspiration without inventing a team
member's personal experience.

See [QA.md](QA.md) for the concrete human checks. Pages configuration, branch
protection, issue ownership/milestones and a project license require repository
owner decisions; they are not represented as completed code fixes.
