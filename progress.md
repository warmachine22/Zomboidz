Original prompt: Implement the full Zomboidz rebuild for Quest 3 and desktop. Build an endless forest with authored gear and enemies, fading loot flares, light and sound perception, upgrades, armor, local scores, and repeatable swarm playtests.

- Built the shared seeded simulation, streamed terrain and landmarks, all three weapons and zombie roles, armor, tiered upgrades, flare attraction, and local records. Added desktop, touch, and XR input paths.
- Authored and exported the replacement assets with Blender. Added CC0 forest textures, wrist and desktop displays, flashlight shadows, weapon effects, and positional threat audio.
- Added seven mechanics tests, a developer-only swarm map and roadside encounter, and a repeatable headless balance runner. Early balance runs exposed a weapon-swap loop and excessive simultaneous diversions. Fixed both and reran the comparisons.
- Physical Quest 3 validation of controller alignment, spatial audio, comfort, and sustained frame rate is pending. The HTTPS build accepts `?perf=1` for headset frame timing.
- 1.0.1 adds dark default lighting with landmark light pools, grip-authored sockets, a saved laser dot with shared ballistic tracing, reaching and stumbling animation clips, and four-sector horde placement with a 30-second opening.
