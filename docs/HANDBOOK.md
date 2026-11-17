# Zomboidz — The Last Light project handbook

This handbook describes the live 1.0 rebuild as of **1.0.17**. Start here when changing the game. See [development and playtesting](DEVELOPMENT.md) for commands and [release history](../progress.md) for changes by version. [Play the production build](https://zombiez.vercel.app/).

## Product and run flow

Zomboidz is a single-player browser survival and escape game. **Meta Quest 3 Browser** is the release target. Desktop is first person, and touch has an on-screen joystick and drag-to-look. The player follows roads into a dark, procedurally streamed forest, manages their ammo and light, and searches sheds for a radio while the horde grows.

1. The main menu selects difficulty and mode, shows the build number and extraction objective, and links to Help, controls, settings, and local scores. Help explains the objective and shows game-rendered reference images and actual pickup icons. Quest immersive play starts through **Enter VR** over HTTPS and has a controller-operated start panel.
2. A run can end in death or extraction. A clean hit kills an unarmored player. One armor charge absorbs one hit, and a better vest or plate pickup replaces a weaker one. Armor comes in one-, two-, or three-charge pieces.
3. On a fatal hit, the scene freezes at contact and identifies the attacker. The player can look, snap turn on Quest, and move or toggle their flashlight during inspection. Quest right A opens the results or returns to inspection from the death result. Desktop and touch use the Results and Look around controls.
4. A working radio plays a short reply and ends the run as **Escaped**. The result shows escape time, kills, and headshots. Helicopter animation is deferred.
5. Results offer a new forest and a same-seed rematch. Rematches retain the run's difficulty and mode, including the Arsenal start configuration. Survival deaths can enter the local top 10. Rankings use survival time, then kills, then headshots. Each difficulty has its own table.

### Modes

| Mode | Starting gear and rules |
| --- | --- |
| **Survival** | Six loaded Service pistol rounds, 50 spare firearm rounds, one loaded flare and 19 spare flares, a rechargeable flashlight, and zero run upgrades. Field pickups build the loadout. Eligible death results enter local scores. |
| **Arsenal Test** | Select Easy, Normal, or Hard, a starting wave at minute 0, 5, 10, 15, or 20, and an equipped weapon. All five weapons are owned and loaded at their highest magazine tier, with 125 spare firearm rounds, 49 spare flares, and all run upgrades maxed. The selected wave sets horde pressure and starting population. The run clock, pickups, battery, and other local timers begin fresh. Normal damage and radio extraction apply. Unranked. |
| **Legendary** | Two independent 50-round Service pistols and 50 shared spare rounds. Each pistol has a permanent mounted flashlight and its own beam mode and aim dot when enabled. Ammo and armor are the field pickups. Quest triggers fire separately. Desktop and touch fire both pistols together. Unranked. |

The public game has a static frontend. Settings and local scores live in `zomboidz.settings.v1` and `zomboidz.scores.v1` in browser storage. Runs are in memory. `records.js` validates saved values and falls back gracefully when browser storage is unavailable. **Normal** retains the historical internal key `standard` and its scores. The previous Legendary checkbox migrates to the saved **Mode** setting.

### Controls

| Action | Desktop | Quest in Survival or Arsenal Test |
| --- | --- | --- |
| Move and look | WASD or arrows, mouse or drag when pointer lock is unavailable | Left stick locomotion, head tracking, right stick snap turn |
| Quiet movement | Hold Shift | Partial left-stick deflection |
| Shoot and reload | Click or Space, R | Weapon trigger, right A |
| Cycle weapons | Tab | Right B |
| Use flashlight and change beam | F, Q | Flashlight trigger, left X |
| Use radio or take nearby gear | E | Weapon grip |
| Hold a foregrip | — | Squeeze the flashlight-hand grip near the gun, hold to steer, release to return to one hand |
| Pause | Esc | Left Y |

Touch supplies a movement pad, look area, and buttons for fire, reload, equipment, weapon cycle, light, beam, and pause. On the Quest pre-run panel, **B** cycles mode and **X** cycles difficulty. In Arsenal Test, **Y** changes the wave and the weapon grip changes the starting weapon. **A** opens gun-angle calibration and the weapon trigger starts. Legendary play gives **B** to the right lamp and **Y** to the left lamp. They cycle Wide, Focus, and Off. **X** pauses. On desktop use Q and F for the two Legendary lights.

Settings include left-handed tools, seated calibration, pitch and yaw gun-angle adjustment, laser dot, brighter night, reduced flashes, volume, and score initials. Quest shows ammunition, battery, and armor on the wrist. The visible player rig uses gloves and short cuffs.

## Combat, light, and loot

### Weapons and handling

| Weapon | Magazine at capacity tiers 0 / 1 / 2 / 3 | Base reload | Behavior |
| --- | --- | --- | --- |
| Service pistol | 6 / 12 / 24 / 50 | 1.50 s | Semi-auto |
| Pump shotgun | 4 / 5 / 6 / 7 | 2.20 s | Seven pellets with a center pellet and automatic pump cycle |
| Compact SMG | 24 / 28 / 32 / 36 | 1.80 s | Automatic |
| Ranger carbine | 16 / 20 / 24 / 28 | 2.00 s | Semi-auto |
| Flare gun | 1 / 1 / 1 / 1 | 1.35 s | Break-action projectile launcher with a separate reserve |

Weapon pickups require confirmation and equip unloaded. Each carried weapon keeps its magazine on a swap. The four firearms share spares. Reloading allows movement and use of the flashlight, blocks firing until completion, and draws only from reserve. Firing the last shot starts a reload automatically if there are spares. Normal firearm reserves cap at 125 and spare flares at 49.

Quest one-handed tools use the controller grip position and pointing orientation. Two-handed acquisition is within 15 cm of the support socket, then the grip stays latched while squeezed. The shotgun, SMG, and carbine steer from the line between hands with about 30 ms of filtering in tracking space. The rear hand anchors the gun and influences roll. Pistol and flare support applies a gentler correction. The docked light, supported pose, and foregrip are derived from the gun transform. Shotgun support follows the pump. Brief support tracking gaps receive up to 150 ms of grace. After sustained loss, a weapon change, or pause, reacquisition requires a fresh squeeze.

The visible bore, recoil, laser, and shot share the gameplay aim transform. The optional laser uses gold for head, red for body, and white for cover. It shows the center of spread or the flare's predicted landing point. Cover between the viewer and muzzle limits clipping exploits. Flashlight range limits the information available in darkness, while bullets travel according to aim, weapon range, and cover. Muzzle lights and weapon reports are individual to the gun, with haptics on Quest.

### Pickups and run upgrades

Ammo and flare cartridges have small markers and collect automatically within reach and line of sight. Upgrades also collect automatically. Guns and stronger armor require confirmation. Special pickups act as local lights for 5 bright seconds followed by a 20-second fade. The gear remains on the ground and can be revealed with the flashlight after the glow ends.

| Upgrade | Effect | Stack cap |
| --- | --- | --- |
| Hot loads | +15% base damage per tier | 3 |
| Piercing rounds | One additional target per tier, with damage falling through targets | 2 |
| Speed loader | Reload time multiplied by 0.85 per tier | 3 |
| Battery cells | +8 seconds of flashlight runtime per tier | 3 |
| Focus lens | +3 metres of flashlight reach per tier | 3 |
| Extended Capacity | Shared magazine tier across firearms, with no ammo granted on pickup | 3 |

The default light lasts 30 seconds and recharges in five seconds when off. Base Wide reach is 15 m and Focus is 23 m. When a flare is launched, it follows a ballistic arc and stops on the near side of cover. It burns bright for about 1.5 seconds after landing and fades to extinguished at 10 seconds. Fired flares create a stronger local distraction than loot. Flare ammo comes from seeded ammo caches and occasional kills.

## Forest, extraction, and horde

- **World generation.** A run seed and world coordinates determine 48 m terrain tiles, rolling ground, broad forest regions, roads, canopies, and landmarks. Terrain, collider, raycast, and navigation queries use the same geometry. Rendering streams a 3×3 ring while simulation maintains a bounded tile cache. Stable IDs preserve radio assignment, building encounters, and collected caches through tile unload and reload.
- **Search routes.** A district in the code is a cluster of six buildings, four of them eligible sheds, joined by tracks. Five layouts and five palettes provide 25 visual combinations. The starter cluster lies past the roadside ruin. Distinct entrances, roofs, props, and room divisions are navigational landmarks. Reflective posts show road junctions. One seeded starter shed and about a third of other sites have exterior amber lanterns. Lantern assignment is independent of radio placement. Keep the woods dark between routes and preserve readable silhouettes without the flashlight.
- **Radio.** The first approach within 12 m of each distinct eligible shed rolls 1-in-25. The 30th distinct eligible shed guarantees placement if all earlier rolls miss. One radio per run remains at its reachable interior spot even if the player leaves without finding it. Interaction within reach and line of sight triggers the reply and victory. The player searches by memory and environmental signs. Avoid adding visited markers or revealing the odds in the game UI.
- **Building threats.** A building can be empty or trigger threats inside or outside. The first close visit resolves the encounter once. Spawn candidates are outside direct player sight, clear of occupancy, and share the active horde budget. Ordinary enemies can enter any building later.
- **Enemy performances.** Shamblers limp and reach, shriekers warn before a burst and brake after it, and brutes are slow with longer, heavier strikes. Each has two original appearances and type-specific timing. Staggers, directional impacts, falls, seeded gait variation, and near-camera foot planting contribute to motion. Strike sound and damage are tied to the authored contact, with reach and cover checked on that tick. A shambler or shrieker dies from one headshot. A fresh brute takes three base pistol headshots, five base pistol torso shots, or two base carbine headshots. Damage to a brute from one trigger is capped at 55% of its starting health.
- **Perception.** Enemies score nearby gunshots, footsteps, visible flashlight spill, players in close range, and visible flares. Cover and age matter. Loot flares divert roughly a quarter of nearby candidates up to three, while a launched flare can divert up to seven candidates. Close threats still prioritize the player. Zombies retain short-lived player memory, flank near obstacles, and use cover for ambushes.

### Difficulty and performance

| Difficulty | Opening | 3 min | 6 min | 12 min | Late target | Zombie speed ceiling |
| --- | ---: | ---: | ---: | ---: | --- | ---: |
| Easy | 2–3 | 5–7 | 11–13 | 20–24 | 35–37 by 22 min | 2.30 m/s |
| Normal | 3–4 | 8–10 | 15–18 | 27–31 | 38–41 by 18 min | 2.40 m/s |
| Hard | 4–5 | 12–15 | 22–26 | 37–41 | 42–45 by 14 min | 2.50 m/s |

Seeded integer populations rise between checkpoints. Treat the target as a ceiling while concealed locations and device performance determine actual numbers. At full input the player moves at 2.72 m/s and quiet movement tops out at 1.30 m/s. Prevent sustained straight-line escapes through encirclement, hidden arrivals, and later cutoffs. Distant zombie replacement begins at minute 6, 5, or 3 on Easy, Normal, or Hard and is limited to one replacement every 18, 13, or 9 seconds respectively. Active enemies in view or near the player should remain continuous.

Aim for sustained 72 Hz on Quest 3. The renderer lowers quality and then the active crowd budget based on measured timing. Nearby strikes and fast zombies receive higher pose update frequency. Use the current difficulty target and actual active count when reporting performance. Hard at 20 minutes is the current high-load test. Record missed frames, P95 frame interval, and active crowd with the flashlight on.

### Light and sound direction

Moon and canopy shade establish an outdoor baseline. Nearby spots from wrecks, shelters, and lanterns share a small fixture pool. Ammo pickups and ambient navigation lamps have separate presentation from the AI's traveling distractions. Preserve local illumination and use cover-aware beams. A new decorative light should earn its cost from the existing rendering budget.

Web Audio puts moving zombie sounds in 3D with distance gain and cover low-pass filtering. Close threats take priority over distant voices and ambient wind. The player's footstep playback is deliberately soft while its separate AI hearing signal stays meaningful. Gun reports, reloads, shrieks, windups, and the extraction reply are separate cues. Verify location and distance by ear on the physical headset.

## System ownership

| Owner | Responsibility |
| --- | --- |
| `game.js` and `src/game.js` | Entry point, phase transitions, settings, control mapping, render loop, audio and rendering event dispatch |
| `src/simulation.js` | Shared 30 Hz run simulation, timing, shots, interactions, upgrades, player and enemy movement, emitted events |
| `src/world.js`, `src/districts.js`, `src/extraction.js` | Seeded world and building detail, terrain and cover queries, stable visits, encounters, radio |
| `src/difficulty.js`, `src/horde.js`, `src/ambush.js` | Pressure curves, initial and later arrivals, safe placement, flanks, hidden ambushes |
| `src/xr.js`, `src/held-tools.js` | WebXR session and tracking, controller and menu mappings, bracing, aim calibration, recoil, tool sockets |
| `src/presentation.js`, `src/night-lighting.js`, `src/audio.js` | Three.js scene and effects, instanced props, light budgets, wrist display, audio mix and position |
| `src/enemy-motion.js` and generated `src/enemy-rigs.js` | Shared animation timing, pose blend, contact, foot locks, hit anchors. Regenerate the rig data from authored GLBs. |
| `src/records.js` and `src/debug-map.js` | Browser persistence and score ranking, developer-only map based on live simulation state |

Keep aim, loot, steering, attack contact, spawning, and results in the simulation. Feed it input intent from desktop, touch, or XR. Simulation emits gameplay events for sound, presentation, and haptics. Tests and the top-down developer view inspect that same simulation. Run elapsed time drives local effects and cooldowns. Arsenal's pressure time adds the selected wave offset only where difficulty progression is required.

## Assets, testing, and production

- **Asset policy.** The signature tools, weapons, wreck, and enemy rigs are original Blender work. Keep editable character scenes in `art-source`, authoring and export scripts in `scripts`, and runtime GLBs in `assets/art`. Regenerate joint anchors after enemy edits and verify alignment with the shipped skin. Budget for zero paid assets and document licenses for redistribution-friendly background assets. The user declined the Zombie Apocalypse Kit. Historical alpha characters are excluded from current runtime output. [Asset credits](../CREDITS.md).
- **Quick checks.** Use `npm ci`, `npm run dev`, `npm test`, and `npm run build`. The dev server defaults to `127.0.0.1:8080`. On dev builds, `?debug=1` enables the top-down overlay with **M**, plus `window.render_game_to_text()` and `window.advanceTime(ms)`. Use seeded scenarios from the development notes. The `balance.mjs` runner compares stationary, cautious, and aggressive strategies. `check-search.mjs` drives actual collision and simulation along known shed routes and compares the same seeds across difficulties.
- **Build 1.0.16 verification.** The 66 automated tests and production build passed. The 12 seeded collision replays all traversed 12 sheds each. The first shed came into search range in 35–54 seconds at full movement, and travel between nearest buildings took 35–57 seconds. Desktop checked both Arsenal presets, same-seed rematch, a distant lantern, and the radio result. Physical Quest comfort, lighting, positional sound, and the 20-minute Hard frame timing still require a headset playtest.
- **Production.** Releases use GitHub `main` and the established `warmachine22` identity. Vercel's Git integration builds and tests the commit. The public `zombiez.vercel.app` routing deployment forwards to managed production while preserving the browser origin and local scores. Keep HTML uncached and bundle assets under the release hash. Use a normal refresh and confirm the exact `BUILD` label on the public main menu. [Release and Quest checks](DEVELOPMENT.md).

### Search balance baseline

The 1.0.16 scripted explorer followed the same routes and combat policy on 12 seeds per difficulty, with a 13-minute timeout. All 36 runs reached a first shed, with a median of 37 seconds. Consecutive searches within a cluster took 33–109 seconds, depending on which shed was next. The longer legs between clusters took 61–257 seconds. The two escapes on each difficulty came from `district-path-2` and `1`, with radios in the third and seventh sheds along this route. The explorer knows the route in advance, so assess real-world navigation and survival separately on Quest.

| Difficulty | Total sheds reached | Deaths | Escapes | Reached timeout |
| --- | ---: | ---: | ---: | ---: |
| Easy | 95 | 5 | 2 | 5 |
| Normal | 89 | 7 | 2 | 3 |
| Hard | 72 | 10 | 2 | 0 |
