# RetroStrike

PS2-era procedural CQB arena FPS. Babylon.js + TypeScript, serverless WebRTC P2P (host-authoritative), bots fill empty slots.

## Run

Everything runs in a Node container; nothing needs installing on the host.

```sh
# install deps
podman run --rm -v "$PWD":/app:Z -w /app docker.io/library/node:22-slim npm install

# dev server → http://localhost:5173
podman run -d --name retrostrike-dev -p 127.0.0.1:5173:5173 -v "$PWD":/app:Z -w /app \
  docker.io/library/node:22-slim npm run dev

# typecheck + production build → dist/
podman run --rm -v "$PWD":/app:Z -w /app docker.io/library/node:22-slim npm run build
```

`dist/` is plain static files. Host it on any static host or CDN. There is no game server: peers connect directly over WebRTC DataChannels, and signalling is copy-paste SDP tokens.

In dev builds, `window.__rs` exposes `{ ctx, Game, Player, MAP, Wep, Combat, Input, Net }` for console poking and tests.

## Content

- **Operators (9):** Mixamo characters, decimated to 16k triangles each (Swat is left at 19.4k), with base-colour textures only (≤1024², WebP). They are selected in the menu's **OPERATOR** tab and synced to peers.
- **Animations:** one shared set (`public/models/anims/rifle.glb`, 63 clips), retargeted onto every operator by bone name. Clips are chosen by what the operator holds:
  - **Rifle:** 8-way walk / run / sprint / crouch-walk, idle and aim idle, 3-phase jump, prone idle / forward / backward crawl, slide, reload (upper-body layer; *Prone Reloading* when prone), and 7 deaths (6 directional plus prone).
  - **Pistol:** idle, walk and run forward / back, strafe left / right, kneeling idle. Jumps play the airborne section of the pistol jump clips.
  - **Nothing in hand (grenade):** low crawl when prone.
  - **Unarmed (grenade in hand):** idle, walk forward, strafe left/right, jump, turn in place; backward low crawl with its start/stop clips.
  - **Also in use:** turn-in-place (standing, crouched, prone), prone sideways movement (the body turns with the prone turns, then crawls), stance transitions (crouch↔prone, prone→stand, pistol stand↔kneel), and upper-body one-shots (fire, hit reaction, grenade toss, plus the prone variants).
  - **Missing, never substituted:** when a state has no clip the pose is held and `[anim] missing clip "…"` is logged once. Known gaps:
    - pistol crouch-walk, prone, reload, fire, hit and deaths
    - unarmed run, walk backward, crouch and death
    - rifle stand↔crouch transitions
  - Drop clips into `assets/animations/` under those names and rebuild; they're picked up automatically.
- **Weapons (15):** GLBs with grip at the origin, muzzle toward +Z, and `muzzle` / `sight` / `fore` marker nodes that drive ADS alignment, tracers and two-handed third-person holds. Stats come from the real guns (calibre, rate of fire, capacity, weight → mobility); see `src/data/weapons.ts`.
- **Views:** first person, or third person over the shoulder (**V**, settings or touch **CAM**). Aiming down sights always uses first-person sights.

### First-person arms

`assets/hands` (820-tri arms rig with its own IK) is exported by `tools/asset-pipeline/export_hands.py` with three baked holds (`src/render/fpHands.ts`). It is **off** (`FP_HANDS_RIG` in `weaponController.ts`): the rig has no weapon-hold poses, and curling its fingers around a grip folds the low-poly hand mesh (`docs/screenshots/fp-hands-rig-attempt.png`). The viewmodel uses simple gloves until an arms rig with rifle/pistol holds is available.

### Rebuilding models

`assets/` holds the sources and is not shipped. `tools/asset-pipeline/build.sh` regenerates `public/models` with Blender 4.5 (`BLENDER=/path/to/blender`). Weapon grip, sight and fore points, plus real lengths, live in `weapons_spec.json`.

To inspect models, run `npm run dev` and open `/viewer.html?char=swat&clip=run_f&wpn=m4a1&view=side` (views: `side`, `front`, `back`, `portrait`, `fp`, `fpads`). The viewer is dev-only.

## Layout

| Dir | Concern |
|---|---|
| `core/` | math helpers, DOM helpers, save/persistence (localStorage), shared runtime `ctx` (engine/scene/camera/quality), domain `types`, `compose()` |
| `data/` | static tables: weapons, throwables, bot names |
| `world/map/` | `MAP`: arena generator (`generator`, `builders`), collision queries & LOS (`collision`), bot navigation grid (`nav`), Babylon mesh build (`mesh`), radar bake (`minimap`) |
| `world/physics.ts` | substepped AABB mover shared by player, bots and monsters |
| `player/` | local FPS controller (look, move, stance, slide, regen) + tuning constants |
| `weapons/` | viewmodel, firing, reload, ADS, melee, throwing for the local player |
| `actors/` | `Actor` (every body in the arena), `Animator` (clip blending + weapon hold), procedural monster rig |
| `combat/` | `Combat`: hitscan traces, damage/kill resolution, spawn protection (`damage`), grenades/flash/fire (`explosives`) |
| `ai/` | bot AI (perception, cover-seeking, strafing) and horde monster AI |
| `game/` | `Game`: match lifecycle (`match`), spawn selection (`spawning`), thrown projectiles (`throwables`), horde waves (`horde`), lobby slots |
| `net/` | `Net`: WebRTC peer/DataChannel plumbing (`transport`), message protocol, snapshots and host authority (`protocol`) |
| `assets/` | GLB loading, material conversion, character instancing + animation retargeting |
| `render/` | procedural textures, materials, first-person viewmodel, grenade models, post-FX, quality scaling |
| `fx/` | particles, tracers, decals, screen shake |
| `input/` | keyboard/mouse/pointer-lock and the virtual touch sticks |
| `ui/` | `UI`: in-game HUD & radar (`hud`), scoreboard, death/pause/end screens (`screens`), menus & lobby (`menus`); animated menu backdrop (`menuScene`) |
| `main.ts` | boot sequence and the frame loop |

The big singletons (`MAP`, `Game`, `Combat`, `UI`, `Net`) are each assembled in their folder's `index.ts` from per-concern parts with `compose()`. The parts share state through `this`. Import these singletons from the `index`, not from the individual parts.

## Controls

| Input | Standing | Crouched | Prone |
|---|---|---|---|
| **C** | crouch (slide if sprinting) | prone | crouch |
| **Space** | jump | stand up | stand up |
| **Shift (hold)** | run / sprint | crouch-run | — |

Standing up checks for headroom. From prone under a low ceiling you rise to a crouch if that's all that fits. **V** toggles third person, **F9** (dev builds only) drops a telemetry marker.

## Gameplay rules worth knowing

- **Armour**: 3 plates × 50 soak weapon and explosive damage before health (falls and burning skip them). They refill one after another (1.5 s each) after 4 s idle, meaning no damage taken or dealt and not moving.
- **Outlines**: thin silhouette outlines, red for enemies and blue for allies, hidden behind walls.

- **Spawns**: every spawn has full-height cover (1.9 m slabs placed during generation; spawns that can't be covered are dropped). Spawn selection avoids spawns an enemy can currently see, then prefers distance.
- **Spawn protection**: `SPAWN_PROT` (3 s, `player/constants.ts`) of invulnerability after any (re)spawn. It ends early when you deal damage, and bots won't pick a protected target.
- **Health regen**: kicks in 3 s after your last combat event (1.7 s when no enemy has line of sight to you).

## Status / next steps

- TypeScript runs in non-strict mode. The domain types (`Actor`, `TraceHit`, `TouchState`, `ctx`) are real, but much of the ported code still infers `any`. Turning on `strict` one folder at a time is the natural next step.
- `babylonjs` (the UMD bundle, ~1.6 MB gzipped, in its own cached chunk) could move to tree-shakeable `@babylonjs/core` imports.
- `legacy/retrostrike-single-file.html` is the pre-split single-file version, kept for reference.
