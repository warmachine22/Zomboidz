# Development and playtesting

The game builds to a static directory. The executable bundles Three.js instead of fetching it at runtime. There is no service, account, or remote score database. The development server watches source and serves the game with optional diagnostics.

Ship completed releases from GitHub `main` to the Vercel production project and verify that [zombiez.vercel.app](https://zombiez.vercel.app/) points to the new deployment. Check the build label after a normal refresh. The HTML is served with `Cache-Control: no-store`, and every build generates a fingerprinted directory for its script, styles, and assets so the browser loads the matching set.

The shared fixed-step simulation owns damage, timers, aim rays, sound and light sensing, spawn choices, loot, and survival results. With a seed and a sequence of inputs it can run without Three.js or browser APIs. RequestAnimationFrame collects keyboard, touch, or WebXR input and renders state with Three.js. The top-down overlay reads the same runtime state and displays reasons for target switches.

Terrain chunks are keyed by seed and world coordinates. The renderer streams a 3×3 ring, while simulation maintains a bounded geometry cache and a set of collected landmarks. Shots and perception share terrain and cover queries. Importing the older alpha snapshot is only useful for restoring an older release.

## Art and audio

To regenerate the original GLBs, run Blender 4.5 LTS in the background.

```sh
blender --background --factory-startup --python-exit-code 1 --python scripts/author-assets.py
```

The script creates the authored weapons, flashlight, gloves, utility wreck, and rigged zombies. It also exports the hit anchors from the walk, stumble, attack, and flinch clips. Rendering and ballistics share clip phases and blend weights. Grip and muzzle sockets in the GLBs align the held models with the Quest grip pose. Ground, bark, and rock use optimized WebP textures. See the credits for asset sources.

## Quest release check

1. Open the HTTPS build on a Quest 3. Start seated and standing runs, test dominant hand and snap turn, and check that tool positions agree with aim.
2. Try firing and reloading while moving and toggling the flashlight. Locate a close enemy by sound with the light off. Cross a road to an active flare and observe how the horde divides.
3. Open a system overlay and briefly put down a controller. The run should pause on loss of headset focus or sustained tracking loss and resume on an intentional input.
4. Use `?perf=1` and Meta’s performance tools for a 15-minute stress run. Record active crowd size, frame timing and missed frames for the late run. The 48-enemy design target depends on hardware measurement.

Local rendering, browser emulation, and simulations cannot measure headset comfort or spatial audio localization.
