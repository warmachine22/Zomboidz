# Zomboidz — The Last Light

**A browser-based, first-person VR zombie survival prototype for Meta Quest**, also playable on desktop and iPad.

**Play:** https://zombiez.vercel.app  
**Status:** Experimental single-player prototype. The GitHub source includes the latest work-in-progress fixes; Quest-specific behavior still requires headset testing.

## The goal

Survive as long as possible in a dense, nearly pitch-black forest. Undead wander between trees, detect your footsteps and gunshots, and steadily close in from all directions. You have a pistol and a hand-held flashlight. Darkness, limited ammunition, surrounding noise, and increasing horde density should create tension—not lightning-fast enemies.

The desired experience combines the **endless survival and escalating pressure of Vampire Survivors** with **slower, dangerous zombie crowds and deliberate headshots**, inspired by the feel of VR zombie survival games. This is an original experimental game, not an adaptation of any existing title.

There is **no winning condition, campaign, or between-wave shop**. One zombie touch ends your run. Your outcome is survival time, eliminations, and headshots. Pick up equipment from small glowing chests on the ground while playing.

## Core design principles

1. **Fear comes from uncertainty.** Visibility is limited to the left-hand flashlight. Spatial growls, screams, and other sounds hint at threats behind and beside you.
2. **Aim for the brain.** Normal walkers fall to a single headshot. Rare hardened glowing-eyed walkers require **two** headshots (or a powerful shotgun headshot), become more common as time passes, and have additional body health. Torso and limb damage takes multiple rounds; repeated leg hits can cause limping.
3. **Slow walkers, overwhelming numbers.** Individual undead shuffle rather than sprint, but their population grows throughout a run. Standing still or wasting ammunition invites encirclement.
4. **The flashlight is a survival tool.** Choose between long, focused light and a wide, short-range beam. It provides 30 seconds of light per full charge, and recharges automatically in 5 seconds while switched off. Use the left controller trigger to toggle it; no shaking required. Flashlight pickups extend its on-time in 10-second increments, up to 90 seconds.
5. **Minimal interface.** In VR, health, rounds, and flashlight charge live on a dim wristwatch rather than a floating HUD. Death is explained by a short third-person reenactment.
6. **Accessible iteration.** Quest WebXR is the target; desktop and iPad controls make quick testing possible.

## Play controls

| Action | Meta Quest | Desktop | iPad / touch |
| --- | --- | --- | --- |
| Move | Left thumbstick, head-relative | WASD | Lower-left virtual stick |
| Aim / look | Headset and right-hand pistol | Move mouse | Drag right side of screen |
| Shoot | Right trigger | Left mouse button | FIRE |
| Reload | A/B or right grip | R | RELOAD |
| Flashlight beam | X = focus; Y = wide | Q to toggle | WIDE / FOCUS |
| Flashlight on/off | Left controller trigger | F | LIGHT ON / LIGHT OFF |

## Survival mechanics

- **Weapons:** six-round pistol; shotgun and SMG found as pickups, each with its own detailed, proportionate low-poly model. A short muzzle flash briefly illuminates the forest ahead.
- **Enemies:** rigged PSX-style zombie character with animation variations and sound-driven pursuit.
- **Damage:** one headshot for regular zombies; hardened walkers need two headshots or a shotgun headshot. Approximately three pistol torso shots for ordinary enemies; limb shots are weaker.
- **Crowd:** starts around 18 enemies, increases by roughly three every 30 seconds, targeting up to 64 in Quest with an adaptive frame-rate-based ceiling. **64 is a target, not a validated headset-performance guarantee.**
- **Environment:** dense procedurally populated forest with low-poly pixelated trees, bark, shrubs and foliage. Tree obstruction uses the exact visible tapered and tilted trunk mesh rather than an oversized invisible cylinder. Walkers steer around the true ground-level trunk bases.
- **Impact feedback:** a few dark-red voxel flecks on zombies; bark chips and a small damage mark on tree hits. The aiming laser shows amber for bark, red for the body, and gold for the head.
- **Deaths:** a short third-person reenactment identifies the direction of the attacking zombie. Zombies use a lightweight procedural collapse rather than full rigid-body simulation.

## Run locally

You'll need a modern browser with JavaScript and WebGL2. WebXR play additionally requires a compatible VR browser and secure origin (HTTPS).

```bash
git clone https://github.com/warmachine22/Zomboidz.git
cd Zomboidz
python3 -m http.server 8080
```

Open http://localhost:8080 in Chrome/Safari for desktop or touch testing.

The playable website imports the editable `src/game.js` directly. An optional compressed build can be generated using:

```bash
node scripts/build.mjs
```

The root `game.js` directly imports `src/game.js`. The optional `game.js.gz` output is not required to run or deploy this version. Three.js is imported from jsDelivr at runtime.

## Project documentation

- [Game design and vision](docs/GAME_DESIGN.md)
- [Architecture and development notes](docs/DEVELOPMENT.md)
- [Asset attributions and usage](CREDITS.md)
- [Current prototype behavior](SPEC.md)

## Licensing and source assets

The original third-party character asset archives are **not** part of this repository. The project includes optimized **game-runtime** model data and free game audio, with attribution and source information documented in `CREDITS.md`. Please respect each original creator's license; do not extract and redistribute asset packs as standalone content.

The repository does not grant a license to use original third-party artwork outside this game.

## v0.10: shooting and obstacle improvements

Bullets and the laser now intersect the visible seven-sided tree-trunk mesh, so a clear gap next to a trunk is no longer blocked by the old larger invisible cylinder. Zombie navigation uses the trunk's actual base and tangent steering to go around obstacles. Small bark gouges and fragments help diagnose tree hits; dark-red particles provide restrained zombie hit feedback. The center crosshair defines the shot on desktop/iPad, while Quest continues to use its tracked pistol.

## v0.11: visible version, muzzle light, harder zombies, player body

**The opening menu now prominently displays `LIVE VERSION v0.11`**, and the top bar identifies the same build so you can tell whether you have the latest deployment.

- Shooting emits a brief additive flare and warm **forward-facing spotlight**, illuminating nearby trees and walkers in the bullet's direction even when the flashlight is off. This is a lightweight bloom-like effect, not an expensive post-processing bloom pass.
- Regular zombies' emissive eye textures are disabled. A rare **hardened** type keeps subdued glowing eyes, needs two headshots or a strong shotgun headshot, and grows more common during long runs.
- Simplified first-person **torso, legs, hands and sleeves** give the player a visible body. In VR the arms follow the motion controllers; desktop and touch use the virtual hand positions.
- Distinct, smaller low-poly pistol, pump shotgun and SMG models replace the generic weapon shape.
- Pickup chests are replaced by modest floating icons for **flashlight**, **shotgun**, **SMG**, and **ammo/magazine** upgrades. They remain low to the ground with soft colored light.

## Known limitations

This is experimental, not a production-ready VR game. Quest hardware needs direct validation for left-trigger toggling, animation fidelity, comfort, audio and maximum crowd size. Ragdolls are physics-inspired bone poses, not a full rigid-body physics simulation. The game requires network access for its Three.js CDN imports.

---

Built as a personal game-design and WebXR prototyping experiment.
