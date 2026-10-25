# Mechanics and implementation

## Simulation and lifecycle

The simulation advances at **60 ticks per second**. `src/runtime.js` queues timestamped inputs and advances fixed ticks; rendered positions interpolate between the last two ticks. Pause stops simulation progress and clears held inputs. Restart clears the round's projectiles, stun, damage, and movement state. Browser focus loss pauses play.

A match is first to **two round wins**. Draws replay without awarding points. Advancing a round resets combat and inputs while retaining the score and arena; Restart starts a fresh match. A round lasts up to **60 seconds**. Health reaching zero ends it early; when time expires, higher health wins and equal health is a draw. Menu, pause, and result controls live in `src/main.js` and `index.html`.

## Combat

Each fighter starts with **100 health**. A bite deals **20 damage** and has 18 windup ticks, 6 active ticks, and 21 recovery ticks. Fang-tip contact with the opponent's head patch determines a hit; this is a contact move rather than a broad distance attack. See `src/bite-profile.js` for the shared animation/contact geometry and `src/combat.js` for phases and hit resolution.

A bite freezes the contact pose for 6 ticks. A surviving target then releases the twig and is knocked away from the attacker. Lethal contact ends the round. Lunging changes position without dealing damage; attached fighters cannot walk through each other.

Web shots have 20 windup ticks, 2 release ticks, and 10 recovery ticks. A hit causes 40 ticks of web stun without direct damage. The 150-tick cooldown prevents continuous shooting, and holding the button does not repeat shots. The projectile travels at 8 game units per second and has a 3-unit range; retreat beyond that range or drop below its path to evade. See `src/web-attack.js` for the current range and sweep rules and `src/web-effects.js` for visual effects.

## Falling and silk return

Drop is available while attached and idle. Silk can be cast while falling or grounded. During the 6 deployment ticks, its anchor follows the spinneret; the anchor stays fixed after deployment. The silk retains momentum as the spider swings, with gravity and directional input shaping its arc.

The winch engages on the upswing or after a short motionless hang, easing over 10 ticks toward **2.6 game units per second**. The return corridor is **4.2 × MAP_SCALE** game units; it is not an unlimited lateral movement area. If the opponent blocks the ascent, steer toward the open side shown by the hint. Reattachment lasts 18 ticks and preserves the swing's landing position. Aerial fighters cannot attack. See `src/aerial.js`, `src/silk.js`, and `src/hanging-pose.js`.

Ground exposure accumulates only while touching the pavement. After 120 contact ticks of grace, every further 60 contact ticks deals 5 health damage (first damage at tick 180). Leaving the ground stops exposure; reattaching resets it. Ground damage can end the round, including a simultaneous draw, and never prevents silk recovery.

## Arenas, camera, and opponent

The arenas offer one twig, twin level twigs, and stepped twigs at heights -0.9 and +0.9. Fighter and silk heights use the arena frame. Casts select an eligible twig above the spider; climb and grip finish at that height. Body contact and bites require the same twig. Twig geometry, available space, contact, and return rules share the stage definition in `src/stage.js`. The follow camera frames the fighters and their aerial movement; `src/camera.js` contains framing rules.

The bot observes world state rather than player input. It uses seeded decision timing for repeatability, responds to exposed attack phases, and uses aerial controls to return after a drop or knock-off. The exact delays and tactical choices are defined in `src/ai.js`.

## Input and presentation

`src/controller.js` reads browser-standard controllers once per frame. Left face bites, top face shoots, bottom face lunges, and right face casts silk. The D-pad or horizontal left stick moves; D-pad down drops and Start pauses. In menus, D-pad/left stick navigates, left/right adjusts a choice, bottom face activates, and right face returns. Each action triggers once per press. Neutral-release guards prevent held menu inputs becoming combat actions. Keyboard, touch, and controller direction contributions combine, with opposite directions cancelling.

`src/feedback.js` chooses contextual hints. Visual hints sit near each spider, with a screen-reader live-region fallback. The pause dialog can disable hints; storage access is guarded so blocked browser storage does not prevent play.

Optional coaching waits for movement before allowing the bot to act, then teaches web shots and bites. Actual action starts advance the steps; completion or skipping is saved through guarded browser storage. Two-player touch keeps pointer ownership separate for each fighter.

Hits add render-only camera shake, floating damage numbers, and health-bar emphasis. Reduced-motion preferences suppress moving effects; these effects never change simulation state.

`src/audio.js` synthesizes gameplay sounds through Web Audio after a user gesture and provides mute control. No downloaded audio files are bundled.

After three seconds without gameplay input, an attached, resting spider gently bounces with its feet anchored to the stick; pausing freezes the motion, and combat restores both spiders to their calibrated pose.

## Release checks and limits

`npm test` exercises simulation and input rules. `npm run build` creates the static production files. `node scripts/check-deployment.mjs` checks nested-path asset serving over HTTP, including the GLB header; it cannot establish rendered appearance, browser Gamepad behavior, or successful hosting.

CI also requires production Chromium smoke tests against root and nested paths before a main-branch Pages deployment. The browser suite has not been run locally here. `npm run format` formats source and tests; `npm run format:check` checks them. Pull requests cannot deploy. Deployment still depends on repository Pages configuration and GitHub environment permissions. Live visual playtesting, physical two-controller checks, and publication must be verified separately.
