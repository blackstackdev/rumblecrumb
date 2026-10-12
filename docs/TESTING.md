# Testing and limits

Candidate **0.3.1**, 12 October 2026. The campaign logic is inherited from the completed 0.3.0 local edition; this patch prepares distribution, formatting, metadata and documentation. It does not add a district or change stomp balance.

## Local checks

`npm run check` runs formatting, 18 mission/campaign/save tests, type checking and a production build. `python tests/smoke-launcher.py` launches the real loopback server without opening a browser, checks version and build assets, then stops its helper. `python scripts/package-release.py` creates playable/source archives and verifies extraction hashes.

The campaign has real app-browser victories in 2/2/3 stomps. Unlocks and best counts persist across reload; reset/Undo, pause/Guide, pending-hit cancellation and bounded warmed resource reuse are checked. Candidate browser/package evidence is retained by the maintainer outside the public repository. A fresh extracted playable ZIP is checked separately from the source build.

## Platform scope

Windows on the development computer, current Chrome and the Codex app browser are the observed surfaces. Desktop 1280×800 and compact 349×674 layouts are inspected. This does not qualify a real phone, second computer, gamepad, full screen-reader gameplay or a sustained long session.

The GitHub workflow is configured to check Windows and Ubuntu, but its remote results must be read after publication; local Windows checks are not a claim that GitHub CI has passed.

## Known limits

- Three authored districts and one monster. No editor, multiplayer or online leaderboard.
- Click-to-walk stops at buildings; no route-finding.
- Direct radial stomp damage; rubble does not damage standing structures.
- WebGL 2/graphics acceleration required. Context loss needs reload.
- About 4.9 MB of JavaScript before compression, including physics. Slow-device performance is unqualified.
- Camera shake respects reduced-motion; character animations remain.
- Audio execution is checked; speaker/listening quality needs player feedback.

For a report, include the visible version, browser/device, district, expected and actual behavior, and a short reproduction. Share a screenshot if useful; leave out personal data and browser credentials.

The launcher also checks occupied-port behavior: a matching version is reused; another version is declined. On Windows its server socket uses exclusive address ownership. The check caught default Python address-reuse allowing a duplicate listener; this was fixed before release. Reference: [Microsoft socket-option guidance](https://learn.microsoft.com/en-us/windows/win32/winsock/using-so-reuseaddr-and-so-exclusiveaddruse).
