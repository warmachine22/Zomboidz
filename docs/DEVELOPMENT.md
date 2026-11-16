# Development and playtesting

The game builds to a static directory. The executable bundles Three.js instead of fetching it at runtime. There is no service, account, or remote score database. The development server watches source and serves the game with optional diagnostics.

Push completed releases to GitHub `main` as `warmachine22`. The Vercel Git integration runs the tests and build before publishing `main` to the managed production domain. Other branches get previews. Check the build label at [zombiez.vercel.app](https://zombiez.vercel.app/) after a normal refresh. The HTML is served with `Cache-Control: no-store`, and each build fingerprints its script, styles, and assets.

The public alias `zombiez.vercel.app` is assigned to the routing deployment in `deploy/public-url`. Its rewrites serve the current managed production build at the original browser origin, which keeps local scores and settings available. Vercel reserves the name against adding it directly as a project domain. For a routing change, deploy just that directory to the existing `zombiez` project as a preview, verify its page and assets, then assign the public alias to that routing deployment. Ordinary game releases require only the Git push.

The shared fixed-step simulation owns damage, timers, aim rays, sound and light sensing, spawn choices, loot, and survival results. With a seed and a sequence of inputs it can run without Three.js or browser APIs. RequestAnimationFrame collects keyboard, touch, or WebXR input and renders state with Three.js. The top-down overlay reads the same runtime state and displays reasons for target switches.

Terrain chunks are keyed by seed and world coordinates. The renderer streams a 3×3 ring, while simulation maintains a bounded geometry cache and a set of collected landmarks. Shots and perception share terrain and cover queries. Importing the older alpha snapshot is only useful for restoring an older release.

## Art and audio

To regenerate the original GLBs, run Blender 4.5 LTS in the background.

```sh
blender --background --factory-startup --python-exit-code 1 --python scripts/author-assets.py
```

The script creates the authored weapons, flashlight, gloves, utility wreck, and rigged zombies. It also exports the hit anchors from the walk, stumble, attack, and flinch clips. Rendering and ballistics share clip phases and blend weights. Grip, support, and muzzle sockets in the GLBs place the Quest hands and line up the visible barrel with its aim. To export only held hardware, append `-- pistol shotgun smg carbine flashlight`. Ground, bark, and rock use optimized WebP textures. See the credits for asset sources.

## Quest release check

1. Open the HTTPS build on a Quest 3. With Gun Angle at zero, check relaxed-wrist aim and compare the laser to the sights. Brace each weapon, toggle the docked flashlight, and release. Repeat with the weapon in each hand. Test seated and standing play and snap turn.
2. Compare paths and nearby silhouettes with the flashlight off and on. Try firing and reloading while moving. Compare normal and reduced flashes near cover. Cross a road to an active flare and observe how the horde divides.
3. Open a system overlay and briefly put down a controller. The run should pause on loss of headset focus or sustained tracking loss and resume on an intentional input.
4. Use `?perf=1` and Meta’s performance tools for a 15-minute stress run. Record active crowd size, frame timing and missed frames for the late run. The 48-enemy design target depends on hardware measurement.

Local rendering, browser emulation, and simulations cannot measure headset comfort or spatial audio localization.

For repeatable desktop lighting checks, use `?debug&scenario=night` on the development server. It starts with the flashlight off, a nearby shambler, and a faded carbine drop. Use `?debug&scenario=roadside` to compare the wreck lights and fresh flares.
