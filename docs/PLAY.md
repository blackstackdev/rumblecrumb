# Play Rumblecrumb

Download the playable ZIP from the repository's Releases page and extract the whole folder. It includes the built game; no npm or Node installation is needed to play.

On Windows, install Python 3 if it is not already available, then double-click Start-Rumblecrumb.cmd. Keep its console open. Ctrl+C stops the local server. The launcher opens your default browser at a loopback address; it does not install packages or change startup settings.

On another desktop with Python 3: `python3 serve.py`. Those platforms are not yet playtest-qualified. If 4328 is busy, use `python serve.py --port 4329`. Do not open dist/index.html through file://.

WASD/arrows move; Space stomps. Or click a clear tabletop spot and use STOMP. Four towers, three stomps, one shop to save. An orange reach ring means the shop is in danger. Escape pauses; R restarts the district. Guide explains the controls. Districts returns to the map and resets the unfinished level. Sound starts off.

Clear each district to unlock the next. Best stomp counts stay in this browser and address. Finish all three to earn Crumb's cardboard crown. Reset progress asks first and can be undone from the map.

If the tabletop fails to load, try current Chrome/Edge with graphics acceleration enabled. WebGL 2 is required. Graphics context loss needs reload. See TESTING.md for the current device scope and known limits.
