# Development and playtesting

The game builds to a static directory. The executable bundles Three.js instead of fetching it at runtime. There is no service, account, or remote score database. The development server watches source and serves the game with optional diagnostics.

Read [the project handbook](HANDBOOK.md) for current features, system ownership, and design decisions.

Push completed releases to GitHub `main` as `warmachine22`. The Vercel Git integration runs the tests and build before publishing `main` to the managed production domain. Other branches get previews. Check the build label at [zombiez.vercel.app](https://zombiez.vercel.app/) after a normal refresh. The HTML is served with `Cache-Control: no-store`, and each build fingerprints its script, styles, and assets.

The public alias `zombiez.vercel.app` is assigned to the routing deployment in `deploy/public-url`. Its rewrites serve the current managed production build at the original browser origin, which keeps local scores and settings available. Vercel reserves the name against adding it directly as a project domain. For a routing change, deploy just that directory to the existing `zombiez` project as a preview, verify its page and assets, then assign the public alias to that routing deployment. Ordinary game releases require only the Git push.

The shared fixed-step simulation owns damage, timers, aim rays, sound and light sensing, spawn choices, loot, and survival results. It runs headlessly with the same joint math used by the renderer. RequestAnimationFrame collects keyboard, touch, or WebXR input and renders state with Three.js. The top-down overlay reads the same runtime state and displays reasons for target switches and ambush behavior.

Plateau terrain uses fixed authoring coordinates and a fixed scenery seed. The run seed chooses start, resident distribution, and gear and part placement. The renderer streams a heading-biased high-detail ring plus a simplified distant layer. The simulation keeps a bounded geometry cache. Shots and perception share terrain and cover queries.

Use `?debug&scenario=plateau-shelter` to stand outside a plateau entrance, or `?debug&scenario=plateau-call` to pick up the final part and call from the field map. Both fixtures are unranked. **F2** opens the developer overlay when `?debug=1` is enabled. **M** opens the player map.

Use `?debug&scenario=plateau-impact` for a stationary shambler with aimed test shots. Fire three times to exercise the fatal head effect. Append `&zone=body` to compare torso wounds. Run `node scripts/check-ambushes.mjs` to compare openings, indoor crowd, covered flanks, and fixed-step cost on 12 starter routes. Pass `--baseline=PATH_TO_SIMULATION_JS` for a same-machine comparison. The test protects the player so every route can reach the shelter.

Run `node scripts/build-tree-posts.mjs` after changing plateau tree generation, collision, or shelter footprints. It enumerates the large trees and records valid cover posts in `src/tree-posts.js`. The fixture avoids creating hundreds of actors or walking terrain at startup. The active-area technique draws on Valve's AI presentation. The small set of pursuit roles was informed by Jeff Orkin's F.E.A.R. talk. [Valve AI systems](https://cdn.cloudflare.steamstatic.com/apps/valve/2009/ai_systems_of_l4d_mike_booth.pdf) · [F.E.A.R. AI presentation](https://gdcvault.com/play/1013459/Three-States-and-a-Plan)

## Art and audio

To regenerate the original GLBs, run Blender 4.5 LTS in the background.

```sh
blender --background --factory-startup --python-exit-code 1 --python scripts/author-assets.py
```

The script creates the authored weapons, flashlight, gloves, utility wreck, and rigged zombies. To regenerate the six enemy models alone, append `-- shambler shrieker brute` and then run `node scripts/export-enemy-rig.mjs`. The editable Blender files, named actions, and contact markers are in `art-source`. Each alternate appearance uses the same skeleton and clips as its type. The second command samples the exported GLBs and binds the collision anchors to their joints. The game solves those joint transforms on fixed ticks for hit detection and smooths enemy transforms and poses between renders. For held hardware, append `-- pistol shotgun smg carbine flaregun flashlight`. See the credits for asset sources.

Run the shambler comparison on the dev server with `?debug&scenario=motion`. Append `&version=before` for the 1.0.3 model and baseline animation, `&view=side` for the close side view, or `&light=moon` to start with the flashlight off. Both versions walk around the same trunk and take scripted hits. The old GLB ships with the development server only.

Run `node scripts/check-plateau.mjs` for collision paths, a zombie-free extraction, and six paired four-versus-ten encounters in both moving and cautious strategies. Use `--routes-only` or `--combat-only` to narrow the check.

The Classic runners `npm run balance` and `node scripts/check-search.mjs` stay available for older seeded worlds, wave tuning, and radio placement. The previous [zombie-free world audit](WORLD_AUDIT.md) records 1.0.16 behavior.

The 2.0.0 route audit connected all five regions, checked 15 starts, and walked the rooms of all 25 shelters. At full movespeed, the closest connected shelter took 8.6–24.6 seconds from spawn and neighboring shelters took 28.2–48.0 seconds. On 12 seeds, a known route without enemies searched 17–25 shelters for all five parts. It averaged 20.5 minutes of movement, and one complete fixed-step walk reached extraction in 20.1 minutes. These timings exclude exploration mistakes and fights.

To refresh the Help artwork after changing models or structures, open `/assets/dev/guide.html` on the dev server. Choose a subject, select **Save WebP**, and replace the matching image in `assets/guide`. The capture page uses the actual game scene and a brighter fill for legibility. The Help pickup pictures come from the in-game icon textures.

## Quest release check

1. Open the HTTPS build on a Quest 3. With Gun Angle at zero, check relaxed-wrist aim and compare the laser to the sights. Brace each weapon, toggle the docked flashlight, and release. Repeat with the weapon in each hand. Test seated and standing play and snap turn.
2. Compare paths and nearby silhouettes with the flashlight off and on. Try firing and reloading while moving. Compare normal and reduced flashes near cover. Cross a road to an active flare and observe how the horde divides.
3. Open a system overlay and briefly put down a controller. The run should pause on loss of headset focus or sustained tracking loss and resume on an intentional input.
4. Use `?perf=1` and Meta’s performance tools on Hard with the flashlight on. Test a busy road junction and a shelter in close combat. Record FPS, 95th-percentile frame interval, missed frames, and actual active crowd. Aim for a 15-minute sample at 72 Hz. Hard has 693 residents across the map and up to 12 active nearby before device adjustments.
5. Stand with the flashlight off and check approach direction by sound. Compare open ground with a zombie behind an interior wall. Press the left stick to open the map and verify that it pauses movement and enemies. After collecting all five parts, use the weapon trigger from the map to call.

Local rendering, browser emulation, and simulations cannot measure headset comfort or spatial audio localization.

For repeatable desktop lighting checks, use `?debug&scenario=night` on the development server. It starts with the flashlight off, a nearby shambler, and a faded carbine drop. Use `?debug&scenario=roadside` for the wreck lights and fresh flares and `?debug&scenario=shelter` for the shelter's lamp and wall shadows. Use `?debug&scenario=dressing&kind=deer` (or `bear`, `fox`, `rabbit`, `personSlumped`, `personLying`, `vehicle`, `log`) to inspect 1.1.0 environment dressing, and append `?dressing=off` to any URL (including production) to compare with 1.0.17 scenery. With `?perf=1`, both desktop and Quest HUDs append `chunk <maxMs> ms` alongside FPS, P95 frame interval, missed frames, and active crowd.
