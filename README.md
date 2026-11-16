# Zomboidz — The Last Light

An endless first-person zombie survival game for Meta Quest 3 Browser and desktop, with on-screen controls for touch. Survive Blackwater Forest with a service pistol, 50 spare rounds, a flashlight, and whatever you can scavenge. Gunshots, footsteps, and visible light draw the horde. A fresh rare drop burns like a flare and may draw a few walkers away from you.

[Play the current release](https://zombiez.vercel.app/). Refresh the page to load the latest release.

## Play locally

Requires Node.js 20 or newer.

```sh
npm ci
npm run dev
```

Open [localhost:8080](http://localhost:8080). Use WASD and the mouse, click or Space to shoot, R to reload, F for the flashlight, Q to change the beam, and E to pick up nearby gear. Press Tab to cycle through the weapons you carry. Touch players can use the Cycle button.

The woods go dark beyond the flashlight, landmark lights, and active flares. Main-menu **Laser dot** is off by default. Enable it to check aim. Gold marks the head, red marks the body, and white marks cover. For the SMG and shotgun it marks the center of spread.

Quest Browser needs an HTTPS deployment to enter immersive VR. On the headset, use **Enter VR**, then the weapon trigger to start. The left stick moves and the right stick snap turns. Right A reloads, right B cycles weapons, left X changes the beam, and left Y pauses. Use the weapon grip to pick up gear and the light trigger to toggle the flashlight.

New weapons equip unloaded. Every weapon keeps its loaded rounds when you switch, and they all draw from the same spare ammo. An empty weapon starts reloading automatically when spares are available.

## Development and QA

```sh
npm test
node scripts/balance.mjs --seconds=540
npm run build
```

The balance runner compares stationary, cautious, and aggressive strategies across the same seeds. Pass `--seeds=Blackwater,Cold Creek`, `--strategy=cautious`, or `--json` to narrow a run or export metrics. In the development build, add `?debug=1&seed=Blackwater` and press **M** for the top-down view. Use `?debug=1&scenario=roadside` to show all three enemy types and two fresh loot flares near the opening.

Deploy the generated `dist/` directory over HTTPS. Add `?perf=1` to the deployed URL to view Quest frame timing and active crowd size during live play. The session must be tested on a physical Quest 3 to verify aiming alignment, spatial audio, comfort, and the 72 Hz target.

Scores live in the browser on the device that played. Each completed run can be replayed with the same seed or a new forest. See [development notes](docs/DEVELOPMENT.md) and [asset credits](CREDITS.md).
