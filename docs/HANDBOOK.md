# Zomboidz — The Last Light project handbook

This handbook describes **2.1.0**, the Blackwater ambush update. See [development and playtesting](DEVELOPMENT.md) for commands, [environment dressing](ENVIRONMENT_DRESSING.md) for scenery, and [release history](../progress.md) for earlier versions. [Play the production build](https://zombiez.vercel.app/).

## Run flow

Zomboidz is a single-player survival and escape game for Meta Quest 3 Browser, desktop first person, and touch. The player starts with a six-round Service pistol, 50 spare rounds, a loaded flare gun with 19 spares, a rechargeable flashlight, and zero upgrades. Search shelters for five distinct radio parts and call extraction from the field map. The reply leads to an **Escaped** result with time, kills, and headshots.

One unprotected hit kills the player. Armor absorbs one hit per charge and stronger armor can replace weaker armor. On a fatal hit the scene freezes at contact, identifies the attacker, and lets the player look and aim their light. Quest right A switches to results or back to inspection. Desktop and touch use **Results** and **Look around**.

Results offer a new run or a same-seed rematch. Keeping the seed preserves starts, parts, gear, and population placement and starts the run state fresh. Rematches keep difficulty and tuning. Default presets each have a local top 10, ordered by fastest escapes first and longest survival among deaths. Custom tuning is unranked. Settings and scores live in browser storage under `zomboidz.settings.v1` and `zomboidz.scores.v1`. Classic scores are available in **Classic archive**. Normal retains the historical key `standard`. The public game has a single mode. The underlying Classic, Arsenal Test, and Legendary entry points remain for development regression fixtures.

## Controls

| Action | Desktop | Quest |
| --- | --- | --- |
| Move and look | WASD, mouse or drag | Left stick, head tracking, right stick snap turn |
| Move quietly | Hold Shift | Partial left-stick deflection |
| Shoot and reload | Click or Space, R | Weapon trigger, right A |
| Cycle weapons | Tab | Right B |
| Flashlight and beam | F, Q | Flashlight trigger, left X |
| Take weapons or armor | E | Weapon grip |
| Open or close field map | M | Click left stick |
| Call extraction | Call extraction on the map | Weapon trigger on the map |
| Pause | Esc | Left Y |

Touch supplies a movement pad, drag-to-look, and fire, reload, equipment, cycle, light, beam, Map, and pause buttons. On the Quest pre-run panel, **X** changes difficulty, **A** opens gun-angle calibration, and the weapon trigger starts. Settings allow handedness, seated calibration, gun angle, aim laser, a brighter night, reduced flashes, volume, and initials. The Quest wrist display shows ammunition, battery, armor, and radio parts.

## Weapons, light, and loot

| Weapon | Capacity by tier | Base reload | Behavior |
| --- | --- | --- | --- |
| Service pistol | 6 / 12 / 24 / 50 | 1.50 s | Semi-auto |
| Pump shotgun | 4 / 5 / 6 / 7 | 2.20 s | Seven pellets and an automatic pump cycle |
| Compact SMG | 24 / 28 / 32 / 36 | 1.80 s | Automatic |
| Ranger carbine | 16 / 20 / 24 / 28 | 2.00 s | Semi-auto |
| Flare gun | 1 / 1 / 1 / 1 | 1.35 s | Arcing distraction |

Weapon pickups equip unloaded. Carried firearms share the 125-round reserve, while the launcher has its own 49-spare reserve. Each weapon retains its loaded magazine when switched. Shooting the last round starts a reload if spares are available. Extended Capacity adds space in every firearm and draws the additional ammunition from reserve on reload.

Quest one-handed aim uses grip position and pointing orientation. Squeezing the support grip near the foregrip latches it while held and steers long guns from the line between hands. The attached flashlight follows the gun and the support hand follows the shotgun pump. The laser shares the shot and cover calculation. It marks the center of spread and predicts the flare landing. Flashlight range changes what the player can see. Bullets use their own range, aim, and cover.

The flashlight runs for 30 seconds and refills in five seconds when off. Wide reach starts at 15 m and Focus at 23 m. A launched flare stops at cover and fades after up to 10 seconds on the ground. Nearby zombies can investigate it. The moon and canopy provide the outdoor baseline. Wrecks and shelters share a small fixture light pool. Web Audio mixes distance, direction, and cover for zombie voices, with priority for nearby threats and soft player footsteps.

Only ammo and flares can appear outdoors. Inside each shelter the player can find 20 spare rounds and one gear item. The shuffled 25-item deck includes all 17 upgrade pickups, the three additional weapons, and five armor pieces. Ammo, radio parts, and upgrades auto-collect at close range and through clear line of sight. Guns and stronger armor require confirmation. Shelter items give a subtle marker and do not flare.

| Upgrade | Effect per tier | Maximum |
| --- | --- | --- |
| Hot loads | +15% firearm damage | 3 |
| Piercing rounds | One additional target with damage falloff | 2 |
| Speed loader | 15% shorter reload | 3 |
| Battery cells | +8 seconds of light | 3 |
| Focus lens | +3 m beam reach | 3 |
| Extended Capacity | Increases firearm magazine by weapon-specific tier | 3 |

## Plateau and extraction

`plateau.js` defines the 720 × 720 metre map, connected roads, five regions, 25 named two- or three-room shelters, 15 safe starts, authored scene props, and resident anchors. The fence and cliff mark the boundary. Dirt tracks and reflective posts lead to shelter entrances. Every shelter has an amber lantern. The earlier environment dressing supplies deterministic foliage, rocks, logs, wrecks, camps, remains, and ambient life.

Terrain, cover, and raycasts share the 48 m tile geometry. Rendering streams the high-detail ring by player heading. Simplified terrain and trees extend the horizon. Lantern markers remain occludable and visible at up to 142 m where sightlines permit. Only nearby lamps use real-time fixtures.

The seed chooses five distinct shelters and assigns one unique component to each. Gear is assigned independently. Opening the field map freezes gameplay and shows roads, the player, entered shelters, and radio inventory. Crossing into an interior marks it on the map. The map leaves part locations and hostiles undisclosed. Loot and resident states survive tile unloads.

## Resident threats and difficulty

| Difficulty | World population | Nearby active ceiling | Sight | Shambler | Shrieker | Brute |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Easy | 406 | 8 | 6 m | 1.95 m/s | 2.85 m/s | 1.55 m/s |
| Normal | 589 | 10 | 8 m | 2.20 m/s | 3.10 m/s | 1.80 m/s |
| Hard | 693 | 12 | 10 m | 2.40 m/s | 3.35 m/s | 2.00 m/s |

The table shows ordinary chase speeds. A close ambush briefly raises them to at least 3.46 m/s for a shambler, 3.80 m/s for a shrieker, or 3.22 m/s for a brute. Full player movement is 2.72 m/s and quiet movement is 1.30 m/s. A fresh enemy takes **3 head / 5 torso** pistol hits for a shambler, **2 / 4** for a shrieker, and **6 / 10** for a brute. Arms and legs take less damage. One trigger pull can take at most 55% of starting health. **Settings → Zombie tuning** can edit each preset's population, chase speeds, and shot counts. Reset Defaults restores ranking for that preset.

An idle ambusher occupies a large tree at 20%, 30%, or 35% of the 1,580 large trees on Easy, Normal, or Hard. The seed selects posts, including posts near eligible starts and along roads. Every shelter room gets a guard, plus one, two, or three outside. The active window queries spatial buckets and keeps enemies already fighting active. Inactive residents preserve health and death state. The device can lower the active ceiling if headset timing slips.

Sight checks a forward 120° cone, cover and a short sightline around a hiding tree. Hidden tree ambushers hold their position when they hear footsteps. When a nearby player passes into sight, the zombie gives a directional cry, holds briefly, and makes a short sprint with a moving grab. Gunshots are audible 16–20 m in the open by weapon. Cover cuts that range to 55%. A cry can alert enemies within 11 m and share the last seen location. In a group, one enemy attacks directly and up to two choose a side approach and look for tree cover. When the last cue goes stale, enemies check nearby positions and then return home.

Shamblers limp, shriekers drop into a sustained sprint, and brutes load heavier strikes. The rigs share animation timing with hit anchors and contact checks. Blood spray starts at the ray impact. Short-lived emitters follow the struck bone and shed falling droplets. A killing headshot bursts and hides the head, even when the corpse falls. Blood particles share one instanced mesh and have a hard count limit.

## Code ownership and verification

| Files | Responsibility |
| --- | --- |
| `src/game.js`, `src/xr.js`, `src/held-tools.js` | Frontend phases, control mappings, tracking, bracing, aiming, and recoil |
| `src/simulation.js`, `src/campaign.js`, `src/tactics.js`, `src/difficulty.js` | 30 Hz rules, hit resolution, resident life cycle, group pursuit, inventory, and extraction |
| `src/world.js`, `src/plateau.js`, `src/dressing.js` | Authored layout and shelter geometry, streaming, collision, raycasts, and dressing |
| `src/enemy-motion.js`, `src/enemy-rigs.js` | Shared posed hits, foot locks, contacts, and generated rig data |
| `src/presentation.js`, `src/impact-effects.js`, `src/night-lighting.js`, `src/kit.js`, `src/ambient-life.js`, `src/audio.js` | Three.js rendering, pooled impact effects, light budgets, scenery, and spatial audio |
| `src/records.js`, `src/field-map.js`, `src/debug-map.js` | Browser storage, shared field map, and developer overlay |
| `src/districts.js`, `src/extraction.js`, `src/horde.js`, `src/ambush.js` | Classic behavior for historical regression tests and diagnostic scenes |

Verify gameplay with `npm test`, `node scripts/check-plateau.mjs`, and `npm run build`. Use **F2** with `?debug=1` for the developer overlay. The scripts `balance.mjs` and `check-search.mjs` still exercise Classic. Keep the authored Blender scenes in `art-source` and regenerate hit anchors when modifying the shipped GLBs. The Zombie Apocalypse Kit was declined. [Asset credits](../CREDITS.md).

Push releases to GitHub `main` as `warmachine22`. The public Vercel route preserves the browser origin and its scores. Verify the menu build label on the public URL. Quest 3 is the 72 Hz release target. Physical headset checks measure spatial audio, comfort, and frame timing separately from desktop and simulation. [Release and Quest checklist](DEVELOPMENT.md).
