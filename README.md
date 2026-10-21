# Spider Derby

A local Three.js fighting prototype for traditional spider derby. Two spiders hang beneath a thin twig held by a stylized person, with a procedural barangay street behind them. The spiders face one another, move along the stick, and fight with bites and lunges.

## Run

Requires Node.js 20.19+ or 22.12+.

```sh
npm install
npm run dev
```

Open the localhost URL printed by Vite. `npm run build` produces `dist/`; `npm run preview` serves that build. `npm test` runs the movement, combat, runtime, and AI checks.

The start screen offers **Bot Match** and local **PvP**. Select either after the spiders load to begin; the scene and controls stay inactive while choosing. PvP uses one keyboard: P1 plays on the left and P2 uses the arrow and punctuation cluster on the right. Loading failures offer a reload button. Restart starts another round in the same mode.

## Controls

### Bot Match

| Input | Action |
| --- | --- |
| A / D or left / right arrows | Move along the stick |
| K | Shoot a web that briefly stuns; close in and use J to bite |
| J | Bite; commit to a short windup |
| Shift / Space | Lunge in the held direction; from rest, toward the opponent |
| Down arrow / S | Drop from the stick while idle |
| C | Cast silk from the ground or while falling to swing and climb back |
| R | Restart the fight |
| Esc | Pause / resume |
| H or ? | Show controls |

### PvP

| Action | P1 (left) | P2 (right) |
| --- | --- | --- |
| Move | A / D | ← / → |
| Drop | S | ↓ |
| Web return | W | ↑ |
| Bite | Q | `,` |
| Shoot web | E | `.` |
| Lunge | F | `/` |
| Restart | R | R |
| Pause / resume | Esc | Esc |

The visible movement, Shoot web, Bite, Lunge, Drop, and Web return buttons support touch/pointer input for P1. P2 is keyboard-only. The HUD shows each fighter's health and phase. Each starts with 100 health; a bite deals 20 damage after 18 ticks of windup, during 6 active ticks, followed by 21 recovery ticks. The bite motion adapts the silhouette of [Vibi's “Spider Attack Animation1”](https://www.youtube.com/watch?v=vBbR2uFKEls) for the inverted stick pose: the front leg pairs lift and spread during windup, snap forward over the first active ticks, and settle through recovery, while the rear pairs brace against the twig and the pedipalps hinge with the motion. The body and head stay fixed so fang contact remains aligned, and the supplied spider model remains intact. Damage registers only when a fang tip contacts the opponent's front head patch, at a maximum clear gap of about 0.025 game units; most hits land on the third active tick (simulation tick 21). A hit holds the visible contact pose for 6 fixed ticks before up to 0.25 units of recoil; lethal hits remain at contact without recoil. Hitstun lasts 11 ticks. The opponent follows a deterministic state-aware cadence: it waits 60 simulation ticks at the start, approaches until the existing fang-contact range allows a bite, and waits 30 ticks after an action or reattachment before deciding again. It holds while either spider is detached, commits to a bite once chosen, and uses no lunges or player-input inspection. Contextual HUD guidance explains when actions are available and how to return with silk. A lunge moves the fighter without dealing damage. The simulation advances at a fixed 60 ticks per second. Rendered positions blend the last two fixed ticks, so motion stays smooth on displays that refresh at 30, 60, 120, or 144 Hz instead of snapping at the simulation rate.

K fires a finite net from the spider's posed spinneret while attached and idle. Its 20-tick windup extends all eight legs away from the twig and curls the original abdomen forward about the pedicel; the head and jaws stay connected to the torso. Release lasts 2 ticks, recovery 10. The net travels at 8 game units per second, sweeps against the moving opponent's head, and expires after 10 units or 90 ticks. A hit deals no damage and cancels movement, lunges, drops and attacks for 40 ticks (about 0.67 seconds), visibly wrapping the target's head. At contact distance, the shooter's recovery ends in time to press J and complete the 18-tick bite windup before the stun expires. Longer-distance shots leave room for the opponent to evade, and the 150-tick shot cooldown prevents continuous web stun. Holding K does not repeat shots. The shot and stun follow fixed simulation ticks, freeze through pause and bite hitstop, and clear on restart or round end. The AI respects web stun and continues using its existing bite behavior.

Down arrow or S drops a spider only while it is attached, idle, and not lunging. Press C while falling or grounded to cast a visible silk line from its spinnerets to the stick. On the sixth tick of line deployment the silk attaches without discarding the fall's momentum: the spider swings on a taut pendulum arc, gravity and A/D tangential pumping shape the path, and silk length follows the spinnerets throughout. Once the arc reaches its upswing (or after a short motionless hang) the powered climb engages and eases in over 10 ticks up to 1.8 game units per second, so the winch never fights downward momentum or snaps the spider upward. Hold A or D while falling and during retrieval to steer, pump, or brake. With enough swing and room inside the 3.2-unit corridor, you can pass beneath the opponent and grip on the opposite side. The silk-facing direction stays fixed during flight and the grip; after attachment, both spiders turn to face each other, and walking or lunging stops at contact. If the opponent blocks the climb, retrieval holds below their silhouette; follow the HUD prompt and steer with A or D to clear them. The 18-tick reattachment keeps the reel's vertical speed on its first tick, glides out any remaining sideways momentum, and finishes where the swing actually left the spider instead of dragging it back to the cast point. Falling speed is capped. While suspended, the body rocks about the actual spinneret cap, folded legs and pedipalps trail the swing, and climbing adds alternating pulling strokes. Drop and grip poses ease into and out of the planted gait. This motion follows simulation ticks, freezes with pause, and fades near the pavement and twig to preserve clearance. Grounded spiders wait for silk retrieval; aerial movement cannot attack, and the AI waits while either fighter is detached, then resumes its 30-tick decision delay and approaches and bites from the current side.

## Scope and presentation

The round ends when a fighter runs out of health and displays the winner; restarting creates a fresh round. Pause clears held inputs and stops simulation progress. The twig, hand, forearm, partial body, street, house fronts, shop signage, and props are made in code. The holder is static. The supplied spider model is reused with runtime inverted-leg posing, and its original source asset remains intact. The compact HUD uses system fonts, inline SVG, and Filipino labels alongside English control descriptions. It reserves space above and below the scene on narrow and short screens.

## Assets and source

- `assets/source/spider_anatomy_lowpoly.blend`: original supplied low-poly spider model.
- `public/models/spider.glb`: browser-ready model retaining the original meshes and materials.
- `scripts/export_spider.py`: Blender export script and gait pivot preparation.
- `src/movement.js`: renderer-independent movement rules.
- `src/bite-profile.js`: shared jaw/fang animation and contact geometry.
- `src/web-attack.js`: shared web pose, posed spinneret, finite projectile sweep, stun and cooldown rules.
- `src/web-effects.js`: travelling net, short wake and visible stun wrap.
- `src/combat.js`: fighter state, attack phases, hit resolution, and round results.
- `src/runtime.js`: fixed-tick clock, timestamped action queues, and pause/restart lifecycle.
- `src/ai.js`: opponent approach and attack decisions.
- `src/aerial.js`: drop, gravity, swing, and reattachment simulation.
- `src/silk.js`: visible line from the spinneret to the stick.
- `src/scene.js`: procedural street, held twig, and person geometry.
- `src/spider-rig.js`: inverted spider assembly, leg contact posing, and inspection helpers.
- `src/hanging-pose.js`: deterministic hanging sway, climbing strokes, and grip blending.
- `src/main.js`: scene integration, loading, input, camera framing, animation, and HUD updates.
- `src/style.css` and `index.html`: responsive HUD and pause, controls, and result dialogs.

The game uses the [Three.js renderer](https://threejs.org/docs/pages/WebGLRenderer) and [GLTFLoader](https://threejs.org/docs/pages/GLTFLoader). No runtime account, backend, downloaded environment artwork, external font requests, or audio are included.
