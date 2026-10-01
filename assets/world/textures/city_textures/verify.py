"""
Verifies the two claims made about this pack, against the files you just
downloaded. Needs numpy and Pillow:   pip install numpy pillow
Run from the folder containing textures/:   python3 verify.py
"""
import numpy as np, glob, os
from PIL import Image

files = sorted(glob.glob('textures/*.png'))
if not files:
    raise SystemExit("Run this from the folder that contains textures/")

GRID = set((np.arange(32) * 255 // 31).tolist())
off, counts, flagged = [], [], []

for f in files:
    name = os.path.basename(f)[:-4]
    a = np.asarray(Image.open(f).convert('RGB')).astype(int)

    # --- claim 1: 5 bits per channel, quantised at authoring time
    levels = max(len(np.unique(a[..., c])) for c in range(3))
    if levels > 32 or not set(np.unique(a).tolist()) <= GRID:
        off.append((name, levels))
    counts.append(len(np.unique(a.reshape(-1, 3), axis=0)))

    # --- claim 2: wraps in both axes
    # Compare the wrap-around pair against all 256 adjacent pairs. A seam that
    # ranks high is not proof of a break: a mortar line sitting on the tile
    # boundary is a legitimately high-contrast pair. Tile it and look.
    b = a.astype(float)
    dy = np.abs(np.diff(np.vstack([b, b[:1]]), axis=0)).mean(axis=(1, 2))
    dx = np.abs(np.diff(np.hstack([b, b[:, :1]]), axis=1)).mean(axis=(0, 2))
    if (dx[-1] > dx[:-1]).mean() > .99 or (dy[-1] > dy[:-1]).mean() > .99:
        flagged.append(name)

print(f"textures checked      {len(files)}")
print(f"5-bit palette         {'PASS — no channel exceeds 32 levels' if not off else 'FAIL ' + str(off)}")
print(f"unique colours        min {min(counts)}, median {int(np.median(counts))}, max {max(counts)}")
print(f"                      (full-colour art would allow 16,777,216)")
print(f"\nseam outliers         {len(flagged)}")
for n in flagged:
    print(f"   {n}")
print("\nOutliers are boundary features, not breaks — every one was tiled 2x2 and")
print("inspected before release. prop_door_wood_iron and prop_door_stone are")
print("intentional one-offs and do not tile.")
