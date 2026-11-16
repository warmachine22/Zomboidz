# Technical and Development Notes

## Stack

- Static HTML/CSS and vanilla JavaScript; no backend or multiplayer.
- Three.js 0.162 through an import map (jsDelivr CDN).
- WebGL2 scene rendering, Three.js WebXR / VRButton, Web Audio API with HRTF positional sound.
- GLTFLoader and MeshoptDecoder load the compressed PSX-style zombie model.
- Game logic and procedural environment are in `src/game.js`; the root `game.js` loads it as a JavaScript module. Gzip output is optional.
- The game can deploy on Vercel with no server framework or build step because the compiled files are committed.

## Repository layout

```text
index.html                   # Entry page and desktop landing overlay
style.css                    # UI styles
game.js                      # Browser bootstrap: imports src/game.js
game.js.gz                   # Optional generated gzip archive (not required)
src/game.js                  # Editable gameplay source
assets/npc-part-*.bin        # 15 chunks of a meshopt-compressed game-ready GLB
assets/audio/*.ogg           # Spatial zombie and recorded weapon audio
scripts/build.mjs            # Regenerates game.js.gz from src/game.js
scripts/sync-from-live.mjs   # Optional snapshot refresh from the live site
docs/GAME_DESIGN.md          # Product vision and success criteria
docs/DEVELOPMENT.md          # This file
SPEC.md                      # Current implementation notes
CREDITS.md                   # Asset source and licensing notes
```

## Run

Start a static server in the repository root:

```bash
python3 -m http.server 8080
# Open http://localhost:8080 on desktop
```

To modify the game, edit `src/game.js` and refresh the page. Optionally create a gzip artifact with Node 20+:

```bash
node scripts/build.mjs
```

The runtime imports Three.js from a CDN; an internet connection is required.

For headset testing, host the built static site using HTTPS on Vercel and open it in Quest Browser. Do not assume a normal HTTP LAN URL can enter immersive VR.

## Data and rendering

The world is built from instanced low-poly trees and textured procedural ground. Trees are recycled around a moving player to create an extended forest while keeping a fixed geometry budget. Zombies use skeleton-animation mixers; distant animation updates are throttled to reduce CPU load. Enemy headshots are traced against the animated Head bone world transform rather than a fixed-height target. Limb/torso collisions use lightweight analytic volumes and share the same gun-ray calculations as the laser. Tree shots are resolved against the true tilted, tapered seven-sided trunk meshes using a fast candidate shortlist and exact triangle raycasts. The laser and bullet share one hit test; desktop/iPad shots use the center view ray to remove crosshair–muzzle parallax, while Quest uses the tracked right-hand gun.

Enemy AI follows a small state machine: initial wandering, alert via distance/footsteps/noise, pursuit with varied pace, and contact death. Zombies now steer around the actual ground-level tree bases, holding a chosen tangent side while passing each obstacle; local avoidance is not a full navmesh. The intended endless horde target grows over time, but Quest frame timing can lower the permitted population to prioritize comfort.

Light is a pair of SpotLights attached to the left controller; focused and wide modes adjust angle, intensity and distance. Flashlight battery drains over 30 seconds while switched on and automatically refills in 5 seconds while switched off; Quest left trigger toggles it. Flashlight pickups add 10 seconds of on-time per upgrade, up to 90 seconds. The gameplay state is entirely client-side and a minimal localStorage key retains the best run.

Bark hit marks, small brown voxel splinters and dark-red blood flecks share reusable primitive geometry. Particle lists and persistent tree damage marks have caps and are cleared when trees recycle or a new run begins.

## Touch and desktop testing

- Desktop: WASD + pointer lock mouse aiming, click fire, R reload, F toggle flashlight, Q beam mode.
- Touch: virtual joystick, right-screen dragging, FIRE, RELOAD, LIGHT ON/OFF, beam toggle.
- Production smoke tests used a desktop Chromium browser and emulated touch viewport. This is **not** a substitute for a physical Quest test, especially hand tracking, audio positioning, haptics, left-trigger toggle and comfort.

## Build and deployment

`node scripts/build.mjs` optionally gzips the module into `game.js.gz`. The v0.9 browser entry point imports `src/game.js` directly, so a compressed artifact is not needed for ordinary static deployment.

The project can be deployed as a static Vercel project. The original prototype is live at https://zombiez.vercel.app.

`scripts/sync-from-live.mjs` captures a **snapshot** of the current live deployment (used to bootstrap this repository). Ordinary development should go in the opposite direction: edit source in GitHub, build, test, deploy. Avoid repeatedly replacing local work with a live snapshot.

## Third-party assets

The public repository must not include the **original downloadable zip or source GLB archives** from the external character sample. The browser game uses optimized model data distributed as packaged runtime chunks, not raw author source files. See [CREDITS.md](../CREDITS.md) for restrictions and attribution. The original sounds are CC0.

## Known limitations

- Haptics and Meta Quest X/Y controller mappings require physical-headset validation.
- Animated/physics-inspired corpse fall is not a full joint physics ragdoll.
- The horde cap (64) is exploratory. A WebGL desktop browser handling 64 does not prove Quest can sustain comfortable 72/90Hz.
- One zombie model with cosmetic variations, limited animation variety.
- Model and audio files are required; missing assets prevent or degrade gameplay.
