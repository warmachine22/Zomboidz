# Development and playtesting

The game builds to a static directory. The executable bundles Three.js instead of fetching it at runtime. There is no service, account, or remote score database. The development server watches source and serves the game with optional diagnostics.

Read [the project handbook](HANDBOOK.md) for current features, system ownership, and design decisions.

Push completed releases to GitHub `main` as `warmachine22`. The Vercel Git integration runs the tests and build before publishing `main` to the managed production domain. Other branches get previews. Check the build label at [zombiez.vercel.app](https://zombiez.vercel.app/) after a normal refresh. The HTML is served with `Cache-Control: no-store`, and each build fingerprints its script, styles, and assets.

The public alias `zombiez.vercel.app` is assigned to the routing deployment in `deploy/public-url`. Its rewrites serve the current managed production build at the original browser origin, which keeps local scores and settings available. Vercel reserves the name against adding it directly as a project domain. For a routing change, deploy just that directory to the existing `zombiez` project as a preview, verify its page and assets, then assign the public alias to that routing deployment. Ordinary game releases require only the Git push.

The shared fixed-step simulation owns damage, timers, aim rays, sound and light sensing, spawn choices, loot, and survival results. It runs headlessly with the same joint math used by the renderer. RequestAnimationFrame collects keyboard, touch, or WebXR input and renders state with Three.js. The top-down overlay reads the same runtime state and displays reasons for target switches and ambush behavior.

Terrain chunks are keyed by seed and world coordinates. The renderer streams a 3×3 ring, while simulation maintains a bounded geometry cache and a set of collected landmarks. Shots and perception share terrain and cover queries. Importing the older alpha snapshot is only useful for restoring an older release.

Use `?debug&scenario=escape` on the development server to enter a seeded district beside a shed and exercise the guaranteed radio placement. The regular hunt rolls once per eligible shed within 12 metres and forces placement on the 30th distinct shed if the earlier rolls miss. On Quest, use `?perf=1` during a late run to compare a district with the earlier open-forest build. Record frame time, missed frames, and active enemies together.

## Art and audio

To regenerate the original GLBs, run Blender 4.5 LTS in the background.

```sh
blender --background --factory-startup --python-exit-code 1 --python scripts/author-assets.py
```

The script creates the authored weapons, flashlight, gloves, utility wreck, and rigged zombies. To regenerate the six enemy models alone, append `-- shambler shrieker brute` and then run `node scripts/export-enemy-rig.mjs`. The editable Blender files, named actions, and contact markers are in `art-source`. Each alternate appearance uses the same skeleton and clips as its type. The second command samples the exported GLBs and binds the collision anchors to their joints. The game solves those joint transforms on fixed ticks for hit detection and smooths enemy transforms and poses between renders. For held hardware, append `-- pistol shotgun smg carbine flaregun flashlight`. See the credits for asset sources.

Run the shambler comparison on the dev server with `?debug&scenario=motion`. Append `&version=before` for the 1.0.3 model and baseline animation, `&view=side` for the close side view, or `&light=moon` to start with the flashlight off. Both versions walk around the same trunk and take scripted hits. The old GLB ships with the development server only.

Run `npm run balance -- --difficulty=normal` and repeat with `--difficulty=easy` or `--difficulty=hard` to compare the same seeds. The runner reports both crowd and ambush counts.

Run `node scripts/check-search.mjs --routes-only` to walk seeded shed routes with the real collision and movement rules. Omit the flag to exercise combat and radio interaction along those routes. The scripted explorer uses a known route and reports first shed time, sheds reached, deaths, and escapes. Use `?debug&scenario=lantern` locally to review a shed from a distance with the flashlight off. On a physical Quest 3, select Hard and the 20-minute Arsenal Test preset with `?perf=1` and record the active crowd, P95 frame time, and missed frames.

## Quest release check

1. Open the HTTPS build on a Quest 3. With Gun Angle at zero, check relaxed-wrist aim and compare the laser to the sights. Brace each weapon, toggle the docked flashlight, and release. Repeat with the weapon in each hand. Test seated and standing play and snap turn.
2. Compare paths and nearby silhouettes with the flashlight off and on. Try firing and reloading while moving. Compare normal and reduced flashes near cover. Cross a road to an active flare and observe how the horde divides.
3. Open a system overlay and briefly put down a controller. The run should pause on loss of headset focus or sustained tracking loss and resume on an intentional input.
4. Use `?perf=1` and Meta’s performance tools with the flashlight on, starting with Hard and Arsenal Test at minute 20. The headset HUD shows FPS, 95th-percentile frame interval, missed frames, and active crowd versus its current target. Record these together through late-wave combat and note how long the run lasts. Aim for a sustained 15-minute sample at 72 Hz on Quest 3. Hard late runs target 42–45 enemies depending on the seed and available device budget.
5. Stand still with the flashlight off. Have a second person confirm the approach direction of a zombie before calling it out, then turn your head and check that the sound stays with the zombie. Compare an approach in open ground with a zombie behind a wall. Check both the headset speakers and headphones if available.

Local rendering, browser emulation, and simulations cannot measure headset comfort or spatial audio localization.

For repeatable desktop lighting checks, use `?debug&scenario=night` on the development server. It starts with the flashlight off, a nearby shambler, and a faded carbine drop. Use `?debug&scenario=roadside` for the wreck lights and fresh flares and `?debug&scenario=shelter` for the shelter's lamp and wall shadows.
