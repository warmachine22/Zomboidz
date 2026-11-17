# Zombie-free world audit for build 1.0.16

The audit used the production terrain generator, collision rules, and radio logic. It used the existing `populate: false` option for physical traversal and verified zero active enemies through extraction. The audit runner lives in [scripts/audit-world.mjs](../scripts/audit-world.mjs).

## Searching for the radio on foot

The explorer picked the nearest uninspected eligible shed in the surrounding clusters, followed collision-checked waypoints at full movement, and entered each shed. It used the normal radio interaction when offered. That policy knows the local coordinates and approaches, moves at up to 2.72 m/s, and spends no time looking for landmarks or recharging a flashlight.

| Measure | 12 seeded runs |
| --- | ---: |
| Finished with **Escaped** | 12 / 12 |
| First shed doorway | 24–43 s |
| Average time to extraction | 21 min 03 s |
| Fastest and slowest extraction | 1 min 46 s and 40 min 03 s |
| Average distinct sheds entered before extraction | 16.7 |
| Radio assigned by the 30th-shed guarantee | 2 / 12 |

## Straight travel from spawn

The geometric sweep used 72 seeds and 32 evenly spaced headings, each followed up to 5 km. A hit means the corridor enters the 12 m search radius of a shed. These corridors measure layout alone and give travel times at full movement.

| Travel limit | Straight corridors reaching a shed |
| --- | ---: |
| 500 m | 391 / 2,304 (17.0%) |
| 1 km | 590 / 2,304 (25.6%) |
| 3 km | 1,210 / 2,304 (52.5%) |
| 5 km | 1,484 / 2,304 (64.4%) |

Among headings that reached a shed in 5 km, the average time to the first was 10 min 34 s. 898 of 2,304 corridors reached two or more. On those corridors the 1,414 gaps between successive shed encounters averaged 9 min 56 s.

**Straight travel in every direction has no shed guarantee.** The recurring building offsets leave all four exact cardinal lines from the spawn outside shed search range. In a separate collision-enabled pass with the stick held in one cardinal direction for up to five minutes, 0 of 48 runs reached shed search range and 24 stopped at obstacles. The shed placement failure is present even on the unobstructed cardinal lines.

## Radio probability

The audit called the real visit function with distinct generated shed IDs across 25,000 run seeds. Revisiting an already counted shed left the counter unchanged. Every run assigned exactly one radio by shed 30, including runs tested past that visit.

| Search milestone | Measured | Expected |
| --- | ---: | ---: |
| Found on shed 1 | 4.06% | 4.00% |
| Found by shed 4 | 15.26% | 15.07% |
| Found by shed 10 | 33.76% | 33.52% |
| Found by shed 20 | 56.09% | 55.80% |
| Found by shed 29 | 69.89% | 69.39% |
| Placed on shed 30 | 30.11% | 30.61% |
| Found by shed 30 | 100% | 100% |

The mean placement was shed 17.57. The probability guarantee counts distinct eligible shed approaches. The environment determines how long it takes to make those approaches.

## Landmarks and variety

The survey materialized 6,912 backcountry tiles from 48 seed samples, covering 15.93 km². Each of the 48 surveyed building clusters produced six buildings and four eligible sheds. The geometric sweep also checked that count in 25,992 cluster layouts.

| Feature | Generated in the backcountry sample | Average near-pass frequency |
| --- | ---: | --- |
| Eligible sheds | 192 | One every 1.73 km |
| Other cluster buildings | 96 | |
| Wrecked vehicles | 1,144 | One every 272 m |
| Campsites | 1,392 | One every 222 m |

Near passes count a landmark within 35 m of a sampled corridor over 664 km of combined corridor length. Cover, terrain, darkness, and travel choices affect which landmarks the player sees. 177 wrecks had headlights and 171 were beside cluster buildings. 94 of the 288 cluster buildings had exterior lanterns. The survey found all 25 available layout and palette combinations, across workshops, split sheds, lean-tos, porch cabins, and two-room cabins. Backcountry tiles represented all four biomes, with 29% clearing, 28% pine, 26% gully, and 17% ridge. Trees ranged from about 6 to 17 m tall.

### 1.1.0 Environment dressing sample (6,912 tiles, 48 seeds)

| Dressing element | Total across sample | Per chunk |
| --- | ---: | ---: |
| Animal carcasses (deer, bear, fox, rabbit) | 1,471 | 0.21 |
| Human remains | 327 | 0.05 |
| Abandoned roadside vehicles | 372 | 0.05 |
| Camp motorcycles | 550 | 0.08 |
| Road-verge log barriers | 631 | 0.09 |
| Rocks (varied shapes) | 166,561 | 24.1 |
| Extra triangles / colliders | 12,944,756 / 7,934 | 1,873 / 1.15 |

## Reproduce

```sh
node scripts/audit-world.mjs search 12
node scripts/audit-world.mjs directions
node scripts/audit-world.mjs odds
node scripts/audit-world.mjs landmarks
```
