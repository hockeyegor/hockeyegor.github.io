# hockey.live for Media Station X

This repository publishes the MSX bootstrap and TV web interface for hockey.live.

Use `hockeyegor.github.io` as the Start Parameter host in Media Station X.
The UI and a schedule snapshot load from GitHub Pages. A GitHub Action refreshes
the snapshot every 10 minutes, so the MSX app has no dependency on Fly TLS.
