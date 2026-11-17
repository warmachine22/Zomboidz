# Zomboidz — The Last Light

An endless first-person zombie survival game for Meta Quest 3 Browser and desktop, with on-screen controls for touch. Survive Blackwater Forest with a service pistol, 50 spare rounds, a flare gun, a flashlight, and whatever you can scavenge. Gunshots, footsteps, and visible light draw the horde. A fresh rare drop burns like a flare and may draw a few walkers away from you.

[Play the current release](https://zombiez.vercel.app/). Refresh the page to load the latest release.

Survive and escape by following roads and tracks to search sheds. When you find the working radio, approach it and press **E**, use the **weapon grip** in VR, or tap **Call** on touch. The reply confirms extraction and ends the run with your escape time.

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

Choose **Easy**, **Normal**, or **Hard** on the main menu. Reflective posts mark road junctions, and occasional amber lanterns mark entrances. Search sheds for the radio.

Choose **Arsenal Test** to start an unranked run with all weapons loaded, all upgrades maxed, and a starting wave from minute 0, 5, 10, 15, or 20. On the Quest start panel, B cycles modes, X cycles difficulty, Y cycles the wave in Arsenal Test, and the weapon grip cycles the starting weapon. The clock starts at zero on every wave.

Choose **Legendary** on the main menu to start with two 50-round pistols and a light on each pistol. On Quest, right B cycles the right gun's light and left Y cycles the left gun's light through Wide, Focus, and Off. Left X pauses. On desktop, Q cycles the main light and F cycles the other. Touch gets buttons for each light. The lights never run out of charge.

The Laser dot setting enables both aiming dots. Armor and ammo are the only pickups. On Quest, each trigger fires its pistol and right A tops up both from the shared reserve. Desktop and touch fire both pistols together. Legendary runs are kept out of the local scoreboards.

After a fatal hit, the scene freezes and labels the zombie that struck you. On Quest, turn your head or snap turn and aim your flashlight as usual. Press right A to switch between the scene and results. On desktop or touch, drag to look and select **Results** when you’re ready.

## Development and QA

```sh
npm test
node scripts/balance.mjs --seconds=540
npm run build
```

The balance runner compares stationary, cautious, and aggressive strategies across the same seeds. Pass `--seeds=Blackwater,Cold Creek`, `--strategy=cautious`, or `--json` to narrow a run or export metrics. In the development build, add `?debug=1&seed=Blackwater` and press **M** for the top-down view. Use `?debug=1&scenario=roadside` to show all three enemy types and two fresh loot flares near the opening.

Deploy the generated `dist/` directory over HTTPS. Add `?perf=1` to the deployed URL to view Quest frame timing and active crowd size during live play. The session must be tested on a physical Quest 3 to verify aiming alignment, spatial audio, comfort, and the 72 Hz target.

Scores live in the browser on the device that played. Each completed run can be replayed with the same seed or a new forest. See [development notes](docs/DEVELOPMENT.md) and [asset credits](CREDITS.md).
