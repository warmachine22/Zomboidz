# Zomboidz — The Last Light: v0.9

A single-player, first-person WebXR survival prototype for Meta Quest, also playable by mouse/keyboard or iPad touch. Survive as long as possible in a nearly black, dense forest. Slow zombies continuously gather in larger numbers, becoming dangerous through encirclement. Aim carefully: headshots kill instantly, torso and limb hits require multiple shots. One zombie touch ends a run.

## Flashlight simplification — v0.9

- **Left Quest trigger** toggles flashlight on and off. The right trigger still fires the pistol.
- **Desktop:** F toggles flashlight. **iPad:** use LIGHT OFF / LIGHT ON touch button.
- A full battery powers the flashlight for **30 seconds**. When switched off, it automatically regains **100% charge in 5 seconds** (from empty). It does not reactivate by itself.
- The flashlight switches off automatically at zero charge, immediately begins recharging, and remains off until explicitly switched on again.
- The beam stays visibly strong as charge falls, then dims slightly near empty, rather than fading to near darkness prematurely.
- Flashlight pickup chests add **10 seconds of runtime per upgrade**, up to 90 seconds, and can slightly improve range. The offline recharge time stays five seconds.
- The old shake-detection mechanic, hold-to-charge touch button, and tap-F charging are removed. The wristwatch now displays LIGHT ON or RECHARGING and the battery percentage.
- Quest **X/Y** still select focused long-distance or wide nearby flashlight beams. Desktop Q and the iPad WIDE/FOCUS button toggle beam modes.

## Other ongoing mechanics

- PSX-style rigged walking zombies with varying speeds; growing active population targets roughly 18 initially, 30 after 2 minutes, 48 after 5 minutes, and up to 64 after 8 minutes subject to real-time Quest performance.
- Real zombie head-bone collision volumes and laser targeting, persistent body/limb damage, leg damage slows zombies, headshots are lethal.
- Grounded low-poly forest, small dim supply chests, sound-driven alerts, directional 3D zombie sound, pistol/shotgun/SMG and weapon reloads.
- Touchscreen thumbstick, aiming and control buttons; low-light wristwatch HUD on Quest; brief third-person reconstruction identifying fatal attacker.
- Lightweight animated corpse collapse, not full physics ragdoll.
- Quest performance and controller usability remain to be physically validated.

## Verification

Automated browser tests validated the on/off switch on desktop and simulated iPad, thirty-second total battery drain, five-second recharge while switched off, automatic switch-off at empty, manual reactivation, and existing game loading without JavaScript errors. Quest hardware testing is still pending.
