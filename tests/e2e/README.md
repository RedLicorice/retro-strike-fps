# Browser end-to-end checks

Playwright (Firefox, headless) drives the running dev server and asserts on game state through the dev-only `window.__rs` handle.

```sh
pip install playwright && playwright install firefox
npm run dev            # in another terminal (or the podman command from the root README)
tests/e2e/run_all.sh   # OUT=/some/dir to keep the screenshots
```

| Suite | Covers |
|---|---|
| `smoke` | boot, deploy, WASD vs camera, spawn cover + protection, 20 s of bot play |
| `feat` | operator select, shotgun pellets, tube reloads, third person + over-the-shoulder aim |
| `stance` | C / Space / Shift stance rules, slide, headroom, prone + low crawl clips, prone turning |
| `shield` | armour plates, idle regen, HUD, team outlines |
| `reload` | upper-body reload layer, reload while moving / prone |
| `pistol` | pistol clip mapping, missing-clip reporting |
| `moves` | turn in place, fire / hit / throw one-shots, stance transitions, unarmed set |

`viewer_shots.py` renders `/viewer.html` states to PNGs (character / clip / weapon inspection).
