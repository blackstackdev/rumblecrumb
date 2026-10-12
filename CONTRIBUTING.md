# Contributing

Small, reproducible improvements are welcome. Start with an issue for a new mechanic or large change; keep fixes focused so the tiny tabletop loop stays readable.

Use Node 24 or newer and Python 3. Run `npm ci --ignore-scripts`, `npm run check`, and `python tests/smoke-launcher.py`. Explain the player-visible behavior and include a screenshot for visual changes. New art, sound or dependencies need clear ownership and licence notices.

Mission rules live in src/simulation.ts, district data in src/levels.ts, validated progress in src/progress.ts, and rendering/physics/input/UI in src/main.ts. Do not put game rules into meshes or silently change the save keys/schema. No paid or external game service is needed.

The focus is a short, local, replayable cardboard destruction puzzle. Wider-device testing, aiming clarity and readable game feel are useful contributions. A feature list is not a commitment to add it.
