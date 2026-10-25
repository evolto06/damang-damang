# Mechanics and implementation

## Simulation and lifecycle

The simulation advances at **60 ticks per second**. `src/runtime.js` queues timestamped inputs and advances fixed ticks; rendered positions interpolate between the last two ticks. Pause stops simulation progress and clears held inputs. Restart clears the round's projectiles, stun, damage, and movement state. Browser focus loss pauses play.

A round lasts up to **60 seconds**. Health reaching zero ends it early; when time expires, higher health wins and equal health is a draw. Menu, pause, and result controls live in `src/main.js` and `index.html`.

## Combat

Each fighter starts with **100 health**. A bite deals **20 damage** and has 18 windup ticks, 6 active ticks, and 21 recovery ticks. Fang-tip contact with the opponent's head patch determines a hit; this is a contact move rather than a broad distance attack. See `src/bite-profile.js` for the shared animation/contact geometry and `src/combat.js` for phases and hit resolution.

A bite freezes the contact pose for 6 ticks. A surviving target then releases the twig and is knocked away from the attacker. Lethal contact ends the round. A lunge has 26 startup ticks, 9 active moving ticks and 36 recovery ticks. It deals 30 damage once on fang contact. Its active phase evades web projectiles; startup and recovery are exposed. A simultaneous close-range bite interrupts the slower lunge, and bite can punish a missed lunge before its recovery ends. Lunging commits to its initial direction; attached fighters cannot walk through each other.

Web shots have 20 windup ticks, 2 release ticks, and 10 recovery ticks. A hit causes 40 ticks of web stun without direct damage. The 150-tick cooldown prevents continuous shooting, and holding the button does not repeat shots. The projectile travels at 8 game units per second and has a 3-unit range; retreat beyond that range or drop below its path to evade. See `src/web-attack.js` for the current range and sweep rules and `src/web-effects.js` for visual effects.

## Falling and silk return

Drop is available while attached and idle. Silk can be cast while falling or grounded. During the 6 deployment ticks, its anchor follows the spinneret; the anchor stays fixed after deployment. The silk retains momentum as the spider swings, with gravity and directional input shaping its arc.

The winch engages on the upswing or after a short motionless hang, easing over 10 ticks toward **2.6 game units per second**. The return corridor is **4.2 × MAP_SCALE** game units; it is not an unlimited lateral movement area. If the opponent blocks the ascent, steer toward the open side shown by the hint. Reattachment lasts 18 ticks and preserves the swing's landing position. Aerial fighters cannot attack. See `src/aerial.js`, `src/silk.js`, and `src/hanging-pose.js`.

Ground impact deals 10 damage once. Remaining at pavement height costs 5 more health every 60 simulation ticks. Damage can end a round, including a simultaneous draw. Casting silk remains available while grounded. Detached spiders rotate upright about the spinneret, then ease back to the inverted grip near their target twig.

The attached opponent can keep walking, lunging or dropping during a return. Its
movement stays on its own twig; bite and web shots wait until both fighters are
attached. The bot's decision policy still grants recovery grace, without freezing
the human player's controls.

## Arenas, camera, and opponent

The starting arena has one twig; the wider arena has two horizontal twigs with a gap. Terraces adds a 1.25-unit height difference. Attached height is measured in the shared arena frame; silk targets a twig above the outlet and the grip finishes at that twig height. Twig geometry, available space, contact, and return rules share the stage definition in `src/stage.js`. The follow camera frames the fighters and their aerial movement; `src/camera.js` contains framing rules.

The bot observes world state rather than player input. It uses seeded decision timing for repeatability, responds to exposed attack phases, and uses aerial controls to return after a drop or knock-off. The exact delays and tactical choices are defined in `src/ai.js`.

## Input and presentation

`src/controller.js` reads browser-standard controllers once per frame. Left face bites, top face shoots, bottom face lunges, and right face casts silk. The D-pad or left stick moves and drops; Start pauses. Each action triggers once per press. Analog movement has a 0.35 deadzone; D-pad input wins. Back/Share restarts a running match. A single controller plays P2 in PvP; with two, their slots play P1 and P2. The D-pad navigates all menu controls, the bottom face confirms, and left/right changes a focused arena picker. Neutral-release guards prevent held menu inputs becoming combat actions. Keyboard, touch, and controller direction contributions combine, with opposite directions cancelling.

`src/feedback.js` chooses contextual hints. Visual hints sit near each spider, with a screen-reader live-region fallback. The pause dialog can disable hints; storage access is guarded so blocked browser storage does not prevent play.

`src/audio.js` synthesizes gameplay sounds through Web Audio after a user gesture and provides mute control. No downloaded audio files are bundled.

## Release checks and limits

`npm test` exercises simulation and input rules. `npm run build` creates the static production files. `node scripts/check-deployment.mjs` checks nested-path asset serving over HTTP, including the GLB header; it cannot establish rendered appearance, browser Gamepad behavior, or successful hosting.

CI performs those checks before a main-branch Pages deployment. Pull requests cannot deploy. Deployment still depends on repository Pages configuration and GitHub environment permissions. Chromium browser checks also exercise four screen sizes, nested production loading and error recovery. Physical controllers, device performance, combat feel and live publication still need the checks in QA.md.
