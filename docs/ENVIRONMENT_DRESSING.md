# Environment dressing (1.1.0 "Dead Forest")

Seeded, presentation-first forest dressing added in **1.1.0** to give the woods dread, landmarks, and depth without changing 1.0.17 seed layouts, spawn behavior, combat rules, or Quest 3 frame pacing.

## Files added and touched

| File | Role |
| --- | --- |
| [src/dressing.js](file:///c:/Users/mark5/Desktop/antigrvity%20project/Zomboidz/src/dressing.js) | Pure seeded placement (`dress(area, ctx)`), `DRESSING` tunables, `TRIS` triangle table, firefly pocket field (`fireflyField`, `inFireflyPocket`), and snag selector (`isSnag`). No Three.js dependency. |
| [src/kit.js](file:///c:/Users/mark5/Desktop/antigrvity%20project/Zomboidz/src/kit.js) | Procedural low-poly vertex-colored geometry builders (`kit`), chunk geometry merger (`bake`), and lightweight blade meshes (`grassGeometry`, `shrubGeometry`). |
| [src/ambient-life.js](file:///c:/Users/mark5/Desktop/antigrvity%20project/Zomboidz/src/ambient-life.js) | Single-draw-call view-space instanced shader effect for fireflies and carcass flies (`createAmbientLife`). |
| [src/world.js](file:///c:/Users/mark5/Desktop/antigrvity%20project/Zomboidz/src/world.js) | Calls `dress()` at the very end of `makeChunk` when `DRESSING.enabled` is true; exposes `phase`; updates the 3.5 m `raycast` chunk-edge padding comment. |
| [src/presentation.js](file:///c:/Users/mark5/Desktop/antigrvity%20project/Zomboidz/src/presentation.js) | Merged chunk decor rendering (`addDecor`), snag crown collapse, road-shoulder gravel tint in `turf()`, menu shader pre-warm (`warmGroup`), time-sliced & heading-biased chunk streaming (`updateChunks`), sprite distance fades, ambient life update, and brighter signal flare (`updateSignals`). |
| [src/night-lighting.js](file:///c:/Users/mark5/Desktop/antigrvity%20project/Zomboidz/src/night-lighting.js) | Skips dead standing trees (`isSnag`) when building the canopy shadow mask. |
| [src/audio.js](file:///c:/Users/mark5/Desktop/antigrvity%20project/Zomboidz/src/audio.js) | Adds positional carcass fly buzz (`setBuzz`) and rare distant crow caw (`caw`) on the ambience bus. |
| [src/game.js](file:///c:/Users/mark5/Desktop/antigrvity%20project/Zomboidz/src/game.js) | Supports `?dressing=off`, `?debug&scenario=dressing`, wires `audio.setBuzz(...)`, and appends max chunk build time (`chunk X ms`) to `?perf=1`. |
| [scripts/audit-world.mjs](file:///c:/Users/mark5/Desktop/antigrvity%20project/Zomboidz/scripts/audit-world.mjs) | Reports dressing counts, average triangles, and average colliders in `landmarks`. |
| [test/dressing.test.js](file:///c:/Users/mark5/Desktop/antigrvity%20project/Zomboidz/test/dressing.test.js) | Verifies 1.0.17 golden seed stability, determinism, budgets, clearances, barrier pathfinding, collider padding, and frequencies. |

## Scenery catalog and collision rules

| Category | Variants | Colliders | Notes |
| --- | --- | --- | --- |
| **Rocks** | 5 shapes (`0` round, `1` flat slab, `2` tall spire, `3` split, `4` mossy) + pebble clusters + road-shoulder pebbles | Only true boulders (`sy > 1.25`, max 2/chunk) | Non-colliding rocks are capped at `sy <= 0.70` so players never pass through large stone silhouettes. |
| **Fallen logs** | Decorative forest logs + road/verge barrier logs (`logBarrier`, 4.4–5.8 m) | Barriers use 3 axis-aligned boxes (`kind: 'log'`) | Barriers sit within ±0.32 rad of an axis and run from ~1.1 m past road center outward, always leaving a walkable detour. |
| **Dead trees (snags)** | ~8% of generated trees | Uses existing tree trunk collider | Collapses existing crown/canopy instances to `1e-4` and omits canopy shade; zero extra draw calls. |
| **Ground cover** | Grass tufts (6 tris) and thorn/dead shrubs (12 tris) | None | Two instanced meshes per chunk; quality tier 2 hides far cover (> 62 m), quality tier 1 hides all cover. |
| **Gravel** | Road shoulder vertex-color grit + 8-tri pebble instances | None | Applied along `roadDistance` 1.5–3.6 m. |
| **Animal remains** | Deer, grizzly bear, fox, rabbit (2 variants each), plus scattered bones, skulls, and dark stain | None | Discovered by flashlight (`anchors` drive carcass flies and buzz). |
| **Human remains** | Clothed figure slumped against a tree or lying down, plus backpack (3 coat variants) | None | Stylized, no exposed anatomy or loot. |
| **Vehicles & camp extras** | Roadside `sedan`, `pickup`, `van` (4 paint hues); camp `moto`, `motoFallen`, `stump`, `pack`, `bones` | Axis-aligned `wreck` box on cars and motorcycles | Placed along road verges (4.8–7.4 m) or camp clearings, always ≥ 8 m from district buildings. |
| **Atmosphere** | 26 fireflies (`fireflyField > 0.64`), 22 carcass flies (on up to 2 nearest remains within 16 m), buzz loop, rare crow caw | N/A | 1 draw call for all particles (`ShaderMaterial`), 0 real-time lights, 0 shadow casters. |

## Tunables (`src/dressing.js`)

```js
export const DRESSING = {
  enabled: true,
  perChunk: {
    grass: 110, shrubs: 24, rocksSmall: 18, rocksMedium: 5, pebbles: 40, logsDecor: 3,
    snagRate: .08, logBarrier: .18, carcass: .22, person: .05, vehicle: .10, campBike: .40,
  },
  budgets: { colliders: 10, triangles: 8000, drawCalls: 3 },
  firefly: { threshold: .64 },
};
```

## Budgets and invariants (how to add props safely)

1. **Never consume existing RNG streams.** Always generate dressing from `seed + ':dress:' + area.key` (or `hash(...)`) *after* trees, loot, sites, and entrances are placed.
2. **Respect chunk budgets:** ≤ 3 extra draw calls per chunk (`bake` + grass + shrubs), ≤ 8,000 extra triangles per chunk (keep typical average < 3,500), and ≤ 10 extra colliders per chunk.
3. **Keep colliders smaller than the 3.5 m raycast padding:** every box half-extent (`rx`, `rz`) and trunk radius (`r`) must stay `<= 3.5`.
4. **Match visuals and physics:** any non-colliding rock or prop must stay low (`sy <= 0.70`), and any tall blocker must align its box collider(s) to the rendered mesh.
5. **No real-time lights or shadow casters** in dressing or ambient effects.
6. Run `npm test`, `npm run build`, `node scripts/audit-world.mjs landmarks`, and `node scripts/check-search.mjs --routes-only` after any change.

## Rollback

1. **URL toggle (no redeploy):** append `?dressing=off` to disable all 1.1.0 dressing, particles, and gravel tint.
2. **Vercel dashboard:** Instant Rollback to the 1.0.17 deployment.
3. **Git:** tag `v1.0.17` marks the pre-1.1.0 commit (`13f4e84`). Revert with `git revert --no-commit v1.0.17..HEAD && git commit`.
