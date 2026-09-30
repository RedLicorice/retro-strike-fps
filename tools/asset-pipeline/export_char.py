"""Mixamo character FBX -> game-ready skinned GLB (bones renamed to mixamorig:, <=20k tris, base-colour only)."""
import bpy, sys, re, json, os
args = sys.argv[sys.argv.index('--') + 1:]
src, dst, target = args[0], args[1], int(args[2])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=src)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
meshes = [o for o in bpy.data.objects if o.type == 'MESH']

# 1. one bone naming scheme for every character, so one animation set drives all of them
for b in arm.data.bones:
    b.name = re.sub(r'^mixamorig\d*:', 'mixamorig:', b.name)
for m in meshes:
    for vg in m.vertex_groups:
        vg.name = re.sub(r'^mixamorig\d*:', 'mixamorig:', vg.name)

# 2. no baked animation on the character itself
for a in list(bpy.data.actions): bpy.data.actions.remove(a)
if arm.animation_data: arm.animation_data_clear()

# 3. decimate to budget (collapse keeps UVs + interpolates skin weights)
tris = lambda: sum(sum(len(p.vertices) - 2 for p in m.data.polygons) for m in meshes)
before = tris()
if before > target * 1.25:
    ratio = target / before
    for m in meshes:
        bpy.context.view_layer.objects.active = m
        mod = m.modifiers.new('dec', 'DECIMATE'); mod.decimate_type = 'COLLAPSE'; mod.ratio = ratio; mod.use_collapse_triangulate = True
        # decimate must run before the armature deform in the stack
        while m.modifiers.find('dec') > 0: bpy.ops.object.modifier_move_up(modifier='dec')
        bpy.ops.object.modifier_apply(modifier='dec')
after = tris()

# 4. materials: base colour (+ its alpha) only, matte, textures capped at 1024
kept = set()
for m in meshes:
    for slot in m.material_slots:
        mat = slot.material
        if not mat or not mat.use_nodes: continue
        nt = mat.node_tree
        p = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if not p: continue
        for name in ('Normal', 'Roughness', 'Metallic', 'Specular IOR Level', 'Specular Tint', 'Emission Color', 'Coat Normal'):
            if name in p.inputs:
                for l in list(p.inputs[name].links): nt.links.remove(l)
        p.inputs['Roughness'].default_value = .85; p.inputs['Metallic'].default_value = 0
        bc = p.inputs['Base Color']
        if bc.links and getattr(bc.links[0].from_node, 'image', None):
            kept.add(bc.links[0].from_node.image.name)
        for n in list(nt.nodes):
            if n.type in ('NORMAL_MAP', 'BUMP'): nt.nodes.remove(n)
for im in list(bpy.data.images):
    if im.name not in kept:
        bpy.data.images.remove(im); continue
    if im.size[0] > 1024:
        im.scale(1024, 1024 * im.size[1] // im.size[0])   # exporter reads the scaled pixel buffer

# 5. export skinned mesh only
bpy.ops.object.select_all(action='DESELECT')
for o in [arm] + meshes: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', use_selection=True, export_skins=True, export_animations=False,
    export_image_format='WEBP', export_image_quality=82, export_yup=True, export_apply=False, export_morph=False, export_tangents=False)
print('JSON' + json.dumps({'src': os.path.basename(src), 'before': before, 'after': after, 'bones': len(arm.data.bones),
  'images': [(i.name, list(i.size)) for i in bpy.data.images], 'mb': round(os.path.getsize(dst) / 1e6, 2)}))
