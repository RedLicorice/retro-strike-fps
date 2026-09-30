#!/usr/bin/env bash
# Rebuild public/models from assets/ (Mixamo FBX + weapon .blend). Needs Blender 4.5: BLENDER=/path/to/blender ./build.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
B=${BLENDER:-blender}; T=tools/asset-pipeline; OUT=public/models
mkdir -p $OUT/characters $OUT/anims $OUT/weapons
for f in assets/character/*.fbx; do
  id=$(basename "$f" .fbx | tr 'A-Z' 'a-z' | sed 's/_guyfbx$/_guy/')
  "$B" -b --factory-startup -P $T/export_char.py -- "$PWD/$f" "$OUT/characters/$id.glb" 16000
done
"$B" -b --factory-startup -P $T/export_anims.py -- "$PWD/assets/animations" "$OUT/anims/rifle.glb" "$OUT/anims/rifle.json"
python3 -c "import json; [print(json.dumps(s)) for s in json.load(open('$T/weapons_spec.json'))]" | while read -r spec; do
  src=$(echo "$spec" | python3 -c "import json,sys; print(json.load(sys.stdin)['src'])")
  id=$(echo "$spec" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
  "$B" -b --factory-startup -P $T/export_wpn.py -- "$PWD/assets/weapons/$src" "$OUT/weapons/$id.glb" "$spec"
done
echo "done. character brightness gains (materials.json) and portraits (thumbs/) are generated separately — see README."
