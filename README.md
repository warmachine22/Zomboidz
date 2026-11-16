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
2. **Aim for the brain.** Headshots kill instantly. Torso and limb damage takes multiple rounds; repeated leg hits can cause limping.
3. **Slow walkers, overwhelming numbers.** Individual undead shuffle rather than sprint, but their population grows throughout a run. Standing still or wasting ammunition invites encirclement.
4. **The flashlight is a survival tool.** Choose between long, focused light and a wide, short-range beam. Its battery runs down quickly; deliberate left-hand shaking restores it. Flashlight pickups extend its capacity and endurance.
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
| Recharge | Rapidly shake left controller | Tap F | Hold CHARGE |

## Survival mechanics

- **Weapons:** six-round pistol; shotgun and SMG found as pickups.
- **Enemies:** rigged PSX-style zombie character with animation variations and sound-driven pursuit.
- **Damage:** one headshot; approximately three pistol torso shots; limb shots are weaker.
- **Crowd:** starts around 18 enemies, increases by roughly three every 30 seconds, targeting up to 64 in Quest with an adaptive frame-rate-based ceiling. **64 is a target, not a validated headset-performance guarantee.**
- **Environment:** dense procedurally populated forest with low-poly pixelated trees, bark, shrubs and foliage; simple tree collisions and bullet occlusion.
- **Deaths:** a short third-person reenactment identifies the direction of the attacking zombie. Zombies use a lightweight procedural collapse rather than full rigid-body simulation.

## Run locally

You'll need a modern browser with JavaScript, WebGL2 and `DecompressionStream`. WebXR play additionally requires a compatible VR browser and secure origin (HTTPS).

```bash
git clone https://github.com/warmachine22/Zomboidz.git
cd Zomboidz
python3 -m http.server 8080
```

Open http://localhost:8080 in Chrome/Safari for desktop or touch testing.

To rebuild the compressed runtime after editing `src/game.js`:

```bash
node scripts/build.mjs
```

The root `game.js` is a lightweight browser loader; `game.js.gz` is the generated runtime, and `src/game.js` is the editable gameplay source. Three.js is imported from jsDelivr at runtime.

## Project documentation

- [Game design and vision](docs/GAME_DESIGN.md)
- [Architecture and development notes](docs/DEVELOPMENT.md)
- [Asset attributions and usage](CREDITS.md)
- [Current prototype behavior](SPEC.md)

## Licensing and source assets

The original third-party character asset archives are **not** part of this repository. The project includes optimized **game-runtime** model data and free game audio, with attribution and source information documented in `CREDITS.md`. Please respect each original creator's license; do not extract and redistribute asset packs as standalone content.

The repository does not grant a license to use original third-party artwork outside this game.

## Known limitations

This is experimental, not a production-ready VR game. Quest hardware needs direct validation for shake sensitivity, animation fidelity, comfort, audio and maximum crowd size. Ragdolls are physics-inspired bone poses, not a full rigid-body physics simulation. The game requires network access for its Three.js CDN imports.

---

Built as a personal game-design and WebXR prototyping experiment.
