# Game Design — Zomboidz: The Last Light

## One-sentence pitch

Survive for as long as possible in a dark, claustrophobic forest where **slow-moving zombies become overwhelming through sheer numbers**. Your only certainty is the patch of forest your flashlight reveals.

## Intended experience

A single-player, first-person Meta Quest WebXR survival experiment. The mood is suspense rather than an arcade shooting gallery. A walker is usually manageable; an approaching crowd, insufficient light, six rounds, and threatening sounds behind you are not. The gameplay marries escalating, open-ended roguelite survival with grounded, deliberate zombie combat. It is not intended to copy any particular licensed game's art, characters, or story.

## Core gameplay loop

1. Spawn inside a forest that already contains wandering undead in every direction. A handful notice you shortly after play begins.
2. Move by left-stick locomotion in the direction your headset faces. In your right hand is a pistol; in your left is a rechargeable flashlight.
3. Listen for spatial growls, look into darkness, switch flashlight modes, and **aim at heads**.
4. Footsteps and especially gunshots attract the forest's undead. Walkers converge at different speeds, path around trunks, and gradually gather from behind as well as ahead.
5. Pick up a dimly glowing chest to get a weapon (shotgun/SMG) or improve flashlight range, capacity, and battery longevity.
6. Survive until a zombie physically touches you. That one hit ends the run. A brief third-person reenactment indicates the direction of the fatal attacker, then results show time, kills, headshots, and personal best.
7. Restart immediately. There are no story missions, discrete clearing phases, or between-wave upgrade shops.

## Tension and pacing

- **Opening:** ~18 active enemies, most slow enough for deliberate headshots. Their audio and movement establish that the forest is inhabited.
- **Escalation:** target active population rises by ~3 per 30 seconds, reaching ~30 at 2 minutes, ~48 at 5, and a planned ceiling of 64 at 8 minutes.
- **Quest performance:** the headset's sustained rendering rate can reduce the spawning ceiling. 64 is an **experimental upper target**, not a promised smooth frame rate on Quest. Do not trade VR comfort for horde count.
- **Behavior:** most zombies are slow shamblers (roughly 0.5–0.8 m/s), many are steady stalkers (0.8–1.2 m/s), and a small portion are quicker walkers (1.3–1.7 m/s). They should not sprint. The number of threats, not their maximum speed, carries difficulty.
- **World presence:** creatures roam before they hear you, and sound triggers a pursuit. New enemies become available beyond the useful flashlight range; forward replenishment prevents indefinite safe running in one direction.
- **Fairness:** avoid obvious instantaneous close-range spawning, exact single-file enemy lines, or unavoidable head-on swarms too early.

## Player and weapons

- One-touch death; no health depletion mechanic until intentionally expanded.
- Starting pistol: six rounds, manual reload. **One headshot = one kill**. Body shots require several hits (approximately three pistol torso impacts); limb hits do less damage and sustained leg damage slows movement.
- Shotgun: close-range spread, small magazine. A non-head pellet burst does capped body damage rather than guaranteeing a one-blast kill.
- SMG: larger magazine, fast fire, lower individual body-shot damage.
- Default red pistol laser and dot share ballistic calculations. A gold dot indicates the ray is on a valid zombie head hit zone. Trunks block shots.

## Flashlight and darkness

- The forest is almost pitch-black without a flashlight. A realistic spill should illuminate nearby bark, ground and zombies without making the whole world visible.
- **X** on Quest: focused long-range spotlight. **Y**: wide/short beam. Desktop Q and touch WIDE/FOCUS toggle.
- A rapidly draining battery requires active management. Charge by **deliberately shaking the left Quest controller**; detect both fast head-relative translation and wrist rotation across frames, not ordinary movement.
- Flashlight upgrade chests increase capacity, endurance and illumination range. Repeated upgrades should gradually make the light more dependable while preserving the charging mechanic.

## Embodiment and interface

- The Quest player sees a pistol in the right hand and flashlight plus dim status watch on the left wrist. No oversized floating ammo/health HUD.
- Watch: remaining rounds, single-life indicator, flashlight percent and charging feedback.
- Spatial zombie sound is an important gameplay cue. Recorded pistol/shotgun/SMG sounds replace synthesized beeps.
- The death reenactment should face the user as a small third-person stage in VR; do not move or spin their physical headset view.
- On iPad, provide left movement joystick, right drag-to-look, FIRE, RELOAD, WIDE/FOCUS, and CHARGE controls.

## Visual art direction

Low-poly PS1-style horror, using a dense forest reference: trunks of varied diameter, blocky dark bark and moss, low shrubs and grass firmly on the forest floor, irregular foliage silhouettes, and darkness beyond the flashlight. Enemies use rigged PSX-style models, unsteady gait variations, reactive sound, and lightweight collapse on death. The visual emphasis is silhouettes and immersion, not high-poly realism.

## Current scope and deliberate compromises

The game is a browser-delivered, single-player prototype. Zombies currently share a main Student Zombie model with variation in shade, scale, movement speed and animation phase. There is no persistent character progression, multiplayer, save game, advanced physics, or full rigid-body ragdoll. The aim is to validate the **feeling** of surrounding threats and precise headshot combat.

## Definition of success for this prototype

- An approaching zombie is readable and hittable in the head.
- Deliberate controller shaking visibly restores light in Quest.
- An individual walker isn't excessively fast, but ignoring several causes encirclement.
- Falling enemies settle at ground level and never snap into a T-pose.
- Continuous forward travel remains populated with distant threats.
- The Quest maintains comfortable frame rate as target crowd size grows.
- A failed run gives enough information to understand where the fatal attack originated.

## Future experiments

Headshot feedback polish, believable zombie obstacle navigation and group spacing, better corpse physics and body reactions, calibrated flashlights on physical Quest, measured 72/90Hz load testing, user comfort options, footstep rustling, enemy silhouettes and visual variants, improved adaptive audio, and usability testing of the wristwatch.
