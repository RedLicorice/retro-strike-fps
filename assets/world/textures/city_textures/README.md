# Urban City Texture Pack

64 seamless textures for modern city, alleyway and street environments. Real
15-bit colour (5 bits per channel) with an 8x8 Bayer ordered dither, quantised
at authoring time — not full-colour art with a grain filter over it.

Everything tiles seamlessly in both axes.

## Contents

| Folder | Notes |
|---|---|
| `textures/` | 256x256. Use this one. |
| `textures_128/` | 128x128 for lower-spec or retro targets. |
| `PREVIEW.png` | Labelled contact sheet. |
| `verify.py` | Checks the palette and tiling claims against your download. |

**Walls & facades (30)** — red brick (clean, worn, dark, brown, small, glazed),
painted brick (white, red), graffitied brick, concrete (smooth, poured with form
marks and tie holes, stained, cracked, panelled, dark), stucco (beige, pink,
cracked with exposed brick), cinderblock, corrugated metal (plain, rusted,
green), riveted metal panel, painted metal, subway tile (white, green),
clapboard siding (white, blue, bare)

**Windows & doors (8)** — office grid, office lit, apartment, apartment lit,
boarded, broken, roll shutter (grey, blue), garage door

**Ground & street (14)** — asphalt (plain, cracked, patched, wet with
reflective puddles), centre line, edge line, crosswalk, sidewalk (plain,
cracked with weeds, tactile paving), brick pavers, herringbone pavers, grey
pavers, cobblestone, gravel lot, painted curb

**Roof (4)** — asphalt shingles (grey, brown), tar and gravel, corrugated

**Fence & decals (6)** — chainlink*, graffiti tag*, rust streaks*, cracks*,
grime*, torn posters*

\* RGBA with alpha. The decals are meant to be laid over the tiling textures on
a second quad or as a detail pass, so you can add variation without baking it
into every tile.

All wall, ground, road and roof tiles repeat in both axes.

## Import settings

Point/nearest filter for a retro look, or bilinear if you want them smooth —
these are ordinary PBR-less colour maps and work either way. **Turn compression
off**, or DXT will smear the dither. Wrap mode Repeat. Mipmaps on for ground
and roof, optional for walls.

Decals need an alpha-blended or cutout material, not opaque.

## Verifying the claims

Run `python3 verify.py` from this folder (needs numpy and Pillow). It reads the
PNGs you downloaded and reports the palette depth and any seam outliers. Note
that outliers are usually a mortar line or expansion joint sitting exactly on
the tile boundary, which is correct — repeat the tile and look if you want to
be sure.

## Licence

Personal and commercial projects, unlimited titles. No credit required, though
it's appreciated. Don't resell or redistribute the textures as-is or as part of
another asset pack, and don't include them in an AI training dataset.
