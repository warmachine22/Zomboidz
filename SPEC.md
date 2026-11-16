# Zomboidz — The Last Light: v0.10

First-person WebXR zombie survival in a nearly dark forest. Slow, increasingly numerous zombies surround the player. Headshots kill immediately, torso and limb hits take several shots, and a single zombie touch ends the run. Quest motion controls, iPad touch, and desktop keyboard/mouse are available.

## Collision and navigation updates

- **Exact trunk collisions:** Tree models are seven-sided, tapered and tilted. A conservative ray shortlist feeds an exact triangle test against the visible instanced trunk. This eliminates the old oversized invisible cylinders that blocked visually clear shots. Laser and bullets use the same collision logic.
- **Actual ground-level tree bases:** Player collision, zombie collision, and spawn clearances now use the true trunk foot calculated from the instance transform, instead of its midpoint.
- **Zombie obstacle navigation:** Persistent clockwise or counterclockwise tangent steering takes walkers around nearby trunks, with zombie separation to avoid single-file crowds. This is lightweight local avoidance, not a full navmesh.
- **Minimal impact effects:** A tree bullet hit produces several brown voxel chips and a small lasting bark gouge at the precise struck surface. Zombie hits produce a brief small cloud of dark-red voxels. Effects are capped and cleaned up, including when recycled trees move away.
- **Aiming diagnostics:** The pistol laser dot is amber on tree bark, red on zombie bodies, and gold for possible headshots. All use the same trace.
- **Desktop/iPad aiming:** Bullets follow the camera's center reticle instead of an offset muzzle that could miss the surface under the crosshair. Quest VR still fires using the tracked right-hand pistol.

## Preserved design

The flashlight toggles with Quest left trigger, desktop F, or a touch button; its charge lasts 30 seconds when on and automatically replenishes in 5 seconds when off. Pickups extend runtime by 10 seconds up to 90 seconds. X/Y or Q/touch change flashlight beam width. Pistol, shotgun, SMG, wristwatch display, dim upgrade chests, positional audio, increasing horde density and instant death with short third-person replay remain.

## Verification

Browser tests confirmed mesh-accurate tree hits, visible shot clearance beside the tree, bark impact fragments and scar, instant headshot plus blood fragments, and zombie steering around an obstacle without JavaScript errors. Quest headset performance and physical controller precision still require testing.
