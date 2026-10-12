# Changelog

## Browser hosting — 12 October 2026

- Added a direct browser-play link on GitHub Pages for the existing 0.3.1 game.
- Added Pages artifact upload from the tested Ubuntu build and deployment only after both Windows and Ubuntu CI succeed on main.
- Documented hosted saves and deployment scope. Game code, visible version, and existing release downloads are unchanged.

## 0.3.1 — 12 October 2026 — GitHub early-release candidate

- Adopted MIT for the original source and procedural visuals, with third-party notices and honest human/AI credits.
- Prepared readable formatted source, contribution/bug-report guidance, authentic gameplay media, and a read-only Windows/Ubuntu check workflow.
- Added separate playable/source archives with checksums and extraction verification.
- Made Windows preview port ownership exclusive so competing listeners cannot silently share the game port.
- Corrected the launcher's version text and made it decline an occupied port serving a different game version.
- Made build asset paths relative for portable static hosting. No hosting is enabled by this change.

The game logic and rendered JavaScript/CSS are unchanged from the tested 0.3.0 edition. Known limits: one Windows computer is playtest-qualified; real phones, second computers, long sessions, gamepads and full screen-reader gameplay remain open. Click-to-walk has no pathfinding; WebGL context loss needs reload; the script includes about 4.9 MB of code/physics before compression.

## 0.3.0 — 12 October 2026 — tabletop edition

Added the complete Lunch Break / Parcel Parade / Midnight Snack campaign, earned district unlocks, browser-local best counts, replay/menu flow and the cardboard crown ending. Added reversible progress reset and storage-failure fallback. Improved tower-wall visibility, menu transitions and compact layout.

## 0.2.0 — 12 October 2026 — stomp edition

Added a 0.48-second planted-feet wind-up, squash/recovery, three shockwaves, paper/dust effects, comic KRA-THOOM!, stronger local sound and celebratory/horrified/sulking reactions. Fixed pause/reset cancellation and keyboard focus.

## 0.1.0 — 12 October 2026 — first playable

Added Crumb, the handmade 3D tabletop, four towers, a protected noodle shop, three aimed stomps, physical cardboard rubble, keyboard/pointer/on-screen controls, optional local audio, win/loss/pause/help and restart.
