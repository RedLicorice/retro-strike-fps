"""Weapon .blend -> GLB. Grip at origin, muzzle toward Blender -Y (= glTF/Babylon +Z), real-world length.
Adds empties: muzzle, sight (point on the sight line above the grip), fore (support-hand point)."""
import bpy, sys, json, os
from mathutils import Vector, Matrix
args = sys.argv[sys.argv.index('--') + 1:]
src, dst, spec = args[0], args[1], json.loads(args[2])
bpy.ops.wm.open_mainfile(filepath=src)
sc = bpy.context.scene
for o in list(sc.objects):
    if o.type != 'MESH' or o.name == 'Plane' or o.name.startswith('Projetil') or not o.visible_get():
        bpy.data.objects.remove(o, do_unlink=True)
meshes = list(sc.objects)

# materials -> plain Principled (base colour texture or colour), matte gunmetal-ish
for m in {s.material for o in meshes for s in o.material_slots if s.material}:
    m.use_nodes = True; nt = m.node_tree
    img = None
    for n in nt.nodes:
        if n.type == 'TEX_IMAGE' and n.image:
            try: n.image.pixels[0]          # images load lazily; touch the pixels to load from disk
            except Exception: pass
            if n.image.has_data: img = n.image; break
    p = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    col = list(p.inputs['Base Color'].default_value) if p else list(m.diffuse_color)
    for n in list(nt.nodes):
        if n.type != 'TEX_IMAGE' or n.image is not img: nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial'); p = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(p.outputs[0], out.inputs[0])
    p.inputs['Roughness'].default_value = .55; p.inputs['Metallic'].default_value = .25
    if img:
        tex = next(n for n in nt.nodes if n.type == 'TEX_IMAGE'); nt.links.new(tex.outputs['Color'], p.inputs['Base Color'])
        if img.size[0] > 256: img.scale(256, 256)
    else:
        p.inputs['Base Color'].default_value = col
for im in list(bpy.data.images):
    if im.users == 0: bpy.data.images.remove(im)

# join into one object
bpy.ops.object.select_all(action='DESELECT')
for o in meshes: o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.join(); obj = bpy.context.active_object; obj.name = spec['id']
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
vs = [v.co for v in obj.data.vertices]
mn = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
mx = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
cx = (mn.x + mx.x) / 2; Ly = mx.y - mn.y; Lz = mx.z - mn.z
P = lambda u, v: Vector((cx, mn.y + u * Ly, mn.z + v * Lz))
grip = P(spec['grip'][0], spec['grip'][1])
s = spec['len'] / Ly
M = Matrix.Diagonal((s, s, s, 1)) @ Matrix.Rotation(3.14159265, 4, 'Z') @ Matrix.Translation(-grip)
obj.data.transform(M); obj.data.update()
def empty(name, p):
    e = bpy.data.objects.new(name, None); sc.collection.objects.link(e); e.location = M @ p; e.parent = obj; return e
empty('muzzle', P(1.0, spec['bore']))
empty('sight', P(spec['grip'][0], spec['sight']))
if spec.get('fore'): empty('fore', P(spec['fore'][0], spec['fore'][1]))
tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', use_selection=True, export_image_format='JPEG', export_image_quality=85, export_yup=True, export_animations=False)
print('JSON' + json.dumps({'id': spec['id'], 'tris': tris, 'kb': os.path.getsize(dst) // 1024, 'mats': len(obj.material_slots)}))
