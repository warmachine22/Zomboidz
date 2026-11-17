# Working on Zomboidz

- Read [the project handbook](docs/HANDBOOK.md) for current behavior, system boundaries, and design decisions. Use [development and playtesting](docs/DEVELOPMENT.md) for commands, headset checks, and production delivery. `SPEC.md` and [the alpha design](docs/GAME_DESIGN.md) describe historical builds.
- Use Node 20 or newer. Run `npm test` and `npm run build` from the repository root. Use the built-in browser first for browser checks. Keep hardware results distinct from headless and browser results.
- Keep gameplay in the shared fixed-step simulation. Preserve seed stability, saved settings and scores, the public URL, and the simulation's agreement with visible poses and effects.
- Keep the version in `src/simulation.js`, `package.json`, and `package-lock.json` in sync for game releases. Record changes and the validation status in `progress.md`. Push completed releases as `warmachine22` to GitHub `main` and verify the public menu build label. Use the established Git identity.
