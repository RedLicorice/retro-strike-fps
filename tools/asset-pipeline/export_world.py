"""World props -> public/models/world/<id>.glb + world.json (real sizes).
Each model: parts joined, long horizontal axis on X (if longX), origin at bottom-centre, textures <= 256 px."""
import bpy, sys, os, json, math
from mathutils import Vector, Matrix
args = sys.argv[sys.argv.index('--') + 1:]
root, out_dir, spec_path = args[:3]
spec = json.load(open(spec_path))
os.makedirs(out_dir, exist_ok=True)
manifest = {}
for e in spec:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    src = os.path.join(root, e['src'])
    if src.endswith('.fbx'): bpy.ops.import_scene.fbx(filepath=src)
    else: bpy.ops.import_scene.gltf(filepath=src)
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    if e.get('only'): meshes = [o for o in meshes if o.name.split('.')[0] == e['only']]
    for o in list(bpy.context.scene.objects):
        if o not in meshes: bpy.data.objects.remove(o, do_unlink=True)
    if not meshes: print('SKIP', e['id'], 'no mesh'); continue
    for o in meshes:
        o.parent = None if o.parent is None else o.parent
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes: o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    # bake parent transforms, then join
    for o in meshes:
        mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if len(meshes) > 1: bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active; obj.name = e['id']
    vs = [v.co for v in obj.data.vertices]
    mn = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
    mx = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    M = Matrix.Translation(-Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z)))
    if e.get('longX') and (mx.y - mn.y) > (mx.x - mn.x):          # long axis onto X (Blender X -> glTF/Babylon X)
        M = Matrix.Rotation(math.pi / 2, 4, 'Z') @ M
    obj.data.transform(M); obj.data.update()
    vs = [v.co for v in obj.data.vertices]
    size = [max(v.x for v in vs) - min(v.x for v in vs), max(v.z for v in vs) - min(v.z for v in vs), max(v.y for v in vs) - min(v.y for v in vs)]  # x, height, depth
    for im in bpy.data.images:
        try: im.pixels[0]
        except Exception: pass
        if im.has_data and im.size[0] > 256: im.scale(256, max(1, int(256 * im.size[1] / im.size[0])))
    tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    dst = os.path.join(out_dir, e['id'] + '.glb')
    bpy.ops.object.select_all(action='DESELECT'); obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', use_selection=True, export_image_format='AUTO', export_yup=True, export_animations=False)
    manifest[e['id']] = {'size': [round(s, 3) for s in size], 'tris': tris}
    print('OK', e['id'], manifest[e['id']], os.path.getsize(dst) // 1024, 'KB')
json.dump(manifest, open(os.path.join(out_dir, 'world.json'), 'w'), indent=1)
