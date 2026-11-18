# Zomboidz — The Last Light

Survive Blackwater's forest plateau and search 25 shelters for five radio parts. Zomboidz runs on Meta Quest 3 Browser, desktop first person, and touch. Start with a Service pistol, 50 spare rounds, a flare gun, and a rechargeable flashlight. Resident zombies react to gunshots, footsteps, visible light, and launched flares.

[Play the current release](https://zombiez.vercel.app/). Refresh the page to load the latest release.

Follow roads and tracks to shelters. Search their rooms for radio parts, weapons, upgrades, and armor. Open the field map with **M**, a **left-stick click** on Quest, or the **Map** button on touch. Once the radio is ready, call from the map. On Quest use the weapon trigger to transmit.

Open **Help** from the main menu for in-game images of sheds, the radio, and each zombie type, plus a guide to pickup icons.

## Play locally

Requires Node.js 20 or newer.

```sh
npm ci
npm run dev
```

Open [localhost:8080](http://localhost:8080). Use WASD and the mouse, click or Space to shoot, R to reload, F for the flashlight, Q to change the beam, and E to pick up nearby gear. Press Tab to cycle through the weapons you carry. Touch players can use the Cycle button.

The woods go dark beyond the flashlight, landmark lights, and active flares. Main-menu **Laser dot** is off by default. Enable it to check aim. Gold marks the head, red marks the body, and white marks cover. For the SMG and shotgun it marks the center of spread.

Quest Browser needs an HTTPS deployment to enter immersive VR. On the headset, use **Enter VR**, then the weapon trigger to start. The left stick moves and the right stick snap turns. Right A reloads, right B cycles weapons, left X changes the beam, and left Y pauses. Use the weapon grip to pick up gear and the light trigger to toggle the flashlight.

To aim a shotgun, carbine, or SMG with both hands, bring the flashlight hand to the foregrip and squeeze its grip button. Keep squeezing as you steer with the front hand, then release to aim one-handed.

New weapons equip unloaded. Firearms share one reserve, and each weapon keeps its loaded rounds when you switch. An empty weapon starts reloading automatically when spares are available.

Survival runs start with a loaded flare gun and 19 spare flares. Cycle to it and launch a flare ahead of you to draw nearby zombies toward the landing spot for up to 10 seconds. The optional aim dot marks the expected landing spot. Spare flares collect automatically near ammo caches and from occasional zombie drops.

Choose **Easy**, **Normal**, or **Hard**. Reflective posts mark junctions and amber lanterns mark every entrance. **Settings → Zombie tuning** lets you adjust the selected preset's population, chase speeds, and durability. Edited presets are unranked. Default presets have separate local scoreboards and older scores are in **Classic archive**.

After a fatal hit, the scene freezes and labels the zombie that struck you. On Quest, turn your head or snap turn and aim your flashlight as usual. Press right A to switch between the scene and results. On desktop or touch, drag to look and select **Results** when you’re ready.

## Development and QA

```sh
npm test
node scripts/check-plateau.mjs
npm run build
```

The plateau audit checks collision routes, an extraction with no zombies, and paired combat scenarios. In the development build add `?debug=1&seed=Blackwater` and press **F2** for the developer overlay. Use `?debug=1&scenario=plateau-call` to pick up a final part and exercise the map extraction flow.

Deploy the generated `dist/` directory over HTTPS. Add `?perf=1` to the deployed URL to view Quest frame timing and active crowd size during live play. The session must be tested on a physical Quest 3 to verify aiming alignment, spatial audio, comfort, and the 72 Hz target.

Scores live in the browser on the device that played. Rematches keep the same seed and difficulty settings. See the [project handbook](docs/HANDBOOK.md), [development notes](docs/DEVELOPMENT.md), and [asset credits](CREDITS.md).
