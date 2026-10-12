# Play in your browser

[Open Rumblecrumb](https://blackstackdev.github.io/rumblecrumb/).

The hosted copy runs the same early-release 0.3.1 game as the downloadable build. No Python, Node, login or game account is required. Use a browser with WebGL enabled; desktop keyboard and pointer play have been checked on one Windows computer. Compact layouts are available, but actual phone play remains unqualified.

Best counts and unlocks stay in your browser's local storage. The hosted address has a separate save from localhost and other browsers. Reset asks first and offers Undo. There is no cloud sync or gameplay analytics. GitHub serves the files and receives normal web requests; see [local game data](PRIVACY.md) and [GitHub's privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).

## Deployment

The Check game workflow runs formatting, 18 mission/campaign/save tests, type checking, build, launcher HTTP smoke and package checks on Windows and Ubuntu. Only the Ubuntu job on main uploads `dist/` as the Pages artifact. Deployment waits for both matrix jobs to succeed, uses the `github-pages` environment, and has only `pages: write` and `id-token: write` permissions. Pull requests and tags do not deploy. The environment permits main only.

Vite's relative asset paths keep scripts and styles working under `/rumblecrumb/`. Only the built game is hosted; no local project notes, release ZIPs, source checkout, dependencies folder or credentials are in the Pages artifact. Actions are pinned to official commit hashes. Future main pushes deploy after these checks; manual workflow dispatch on main is also supported.

This adds static GitHub Pages hosting to the public repository. It creates no Google Cloud resources, paid APIs, custom domain, login service or game backend. The existing v0.3.1 release tag and assets retain their original hashes.
