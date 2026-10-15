# Spider Derby

A local Three.js movement prototype for traditional spider derby: two spiders meet on a bamboo fighting stick. The original Blender spider is exported to GLB and posed with eight independent leg pivots. Advance and retreat stay on the stick, the spiders face one another, and the player can make a short lunge.

## Run

Requires Node.js 20.19+ or 22.12+.

```sh
npm install
npm run dev
```

Open the localhost URL printed by Vite. `npm run build` produces `dist/`; `npm run preview` serves that build. `npm test` checks movement at multiple frame rates, lunge cooldown, braking, end bounds, and opponent contact.

## Controls

| Input | Action |
| --- | --- |
| A / D or left / right arrows | Move along the stick |
| Shift / Space | Lunge in the held direction; from rest, toward the opponent |
| R | Reset positions |
| Esc | Pause / resume |
| H or ? | Show controls |

The visible movement and lunge buttons also support touch/pointer input. Losing focus pauses practice and clears held inputs.

## Scope

This MVP implements movement, procedural leg motion, a fixed camera, stick limits, solid opponent contact, cooldown feedback, reset, and pause. The opponent is stationary. Attacks, health, damage, win conditions, AI, and audio are not implemented. Numbers labeled `u` show the clear gap between the spiders' movement collision volumes, in game units. Character names and setting are prototype presentation.

## Assets and source

- `assets/source/spider_anatomy_lowpoly.blend`: original supplied low-poly spider model.
- `public/models/spider.glb`: browser-ready model retaining the original meshes and materials.
- `scripts/export_spider.py`: Blender export script and gait pivot preparation.
- `src/movement.js`: renderer-independent movement rules.
- `src/main.js`: scene, loading, input, procedural pose, and HUD.

The game uses the [Three.js renderer](https://threejs.org/docs/pages/WebGLRenderer) and [GLTFLoader](https://threejs.org/docs/pages/GLTFLoader). UI fonts load from Google Fonts when available and fall back to installed sans-serif fonts. No runtime account, backend, or external game assets are needed.
