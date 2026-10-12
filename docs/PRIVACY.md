# Local game data

Rumblecrumb runs in your browser. It does not send gameplay or saved progress to an account or application server. There is no analytics, advertising, login, paid API, camera or microphone request in the game.

District best counts and their reset/Undo record are stored in local storage under `rumblecrumb.progress.v1` and `rumblecrumb.progress.v1.undo`. They belong to that browser and origin: a different browser, port or host has a separate save. Reset asks first; Undo restores the previous record. Clearing browser site data removes both records. No cloud sync is provided.

A browser-hosted copy downloads its build files from its host. That host receives normal web requests and may have its own logging practices. The included Python preview listens on `127.0.0.1` only, and is intended for local play rather than public web hosting.

If storage is blocked or full, the campaign remains playable and reports temporary progress. Sound uses locally synthesized Web Audio; it starts off and needs a player gesture to enable.
