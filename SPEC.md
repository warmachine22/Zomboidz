# Zomboidz — The Last Light: v0.11

Historical alpha specification. The 1.0 rebuild is documented in `README.md` and `docs/DEVELOPMENT.md`.

## Game goal

A first-person browser/WebXR endless zombie survival game for Meta Quest, playable on iPad and desktop for testing. Survive as long as possible in a thick, dark low-poly forest with 360-degree spatial audio. Ordinary zombies move slowly but form increasingly dense hordes. Fire a six-shot pistol, reload, collect upgrades continuously, and die instantly when touched. Survival time and kill statistics are the score.

## What changed in v0.11

1. **Visible build number:** The main menu shows **LIVE VERSION v0.11** directly beneath the subtitle, the page title also includes v0.11, and the header reads BUILD v0.11. Use this to check that an old browser-cached version is not running.
2. **Directional muzzle lighting:** Each shot produces a momentary additive radial flash and a short flame shape extending along the barrel's **forward -Z axis**. A warm point light at the muzzle is supplemented by a dedicated forward-facing spotlight illuminating the aimed-at forest and zombies. This is lightweight bloom-like rendering rather than a full-screen postprocessing bloom pass.
3. **Hardened zombies:** Default zombies have zero eye emissive intensity, making their eyes invisible until lit normally. Rare hardened walkers use subdued emissive eyes (intensity 1.15 versus the old 2.1), about 7.5 HP and require **two headshots**, or a shotgun headshot, to kill. Spawn chance rises gradually from ~2% toward a maximum 34% in long runs. Ordinary zombies remain instantly killable via one headshot.
4. **Player embodiment:** A visible lightweight chest, belt, animated legs, sleeves, gloves and wrists; Quest hands follow tracked controllers, while desktop/iPad hands align with the on-screen tools. The body is kept unobtrusive to preserve a natural first-person view.
5. **Distinct weapons:** Three recognizable low-poly models: proportionate pistol with front and rear sights, pump shotgun with long barrel and wood foregrip, and compact SMG with extended magazine and folding stock. Switching to a weapon pickup updates the model immediately. The pistol was shrunk and moved farther away from the desktop camera to avoid looking huge.
6. **Identifiable pickups:** Instead of identical crates, modest low-to-ground pickup sprites show flashlight, shotgun, SMG, and ammunition icons, with soft glows and minimal bobbing. An ammo pickup increases magazine capacity and gives additional ammunition.

## Mechanics kept

- Quest left trigger toggles flashlight; desktop F and iPad LIGHT ON/OFF do the same. Flashlight lasts 30 seconds and recharges to full in 5 seconds while switched off. Flashlight pickups grant +10 seconds on-time up to 90 seconds.
- Quest X/Y changes between focused and wide beam, with equivalent desktop/iPad controls.
- Red laser dot tracks the gun; amber indicates bark/tree obstruction, red indicates a body hit and gold marks a possible headshot.
- Bullet collision uses real tapered seven-sided tree meshes, while zombies use local obstacle steering around the true tree bases.
- Small bark fragments and scars on tree hits and restrained blood fragments on zombie hits.
- Slow, rising horde, up to performance-limited goal of 64 active zombies later in a run.
- One-hit player death, short third-person attacker reenactment, survival time and eliminations.

## Verification and limitations

Desktop and emulated iPad browser tests passed for the updated models, pickups, eye emission, headshot damage, player avatar, and JavaScript execution. A dark-world muzzle-light test confirmed that the spotlight direction is forward (world vector [0, 0, -1] when aiming straight ahead), and the central image luminance increased from approximately 19 to 57 during the flash. Actual Quest hardware is still needed to assess controller orientation, comfort, body visibility, and frame rate.
