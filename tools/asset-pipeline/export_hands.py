"""First-person arms (assets/hands/Fp hands.blend) -> GLB with baked weapon holds.
The rig has its own IK (hand targets Bone.023.*, fingertip targets Bone.024-028.*): we move those targets to
rifle / pistol / grenade grip points in front of the eye, let Blender solve (with elbow pole targets), and bake
each result into a clip. Empties 'eye', 'eye_fwd', 'eye_up' tell the game how to seat the rig on the camera."""
import bpy, sys, os, json, math
from mathutils import Vector, Matrix
src, dst = sys.argv[sys.argv.index('--') + 1:][:2]
bpy.ops.wm.open_mainfile(filepath=src)
sc = bpy.context.scene; arm = bpy.data.objects['Armature']; A = arm.matrix_world; Ai = A.inverted()
arm.animation_data_create()
for t in list(arm.animation_data.nla_tracks): arm.animation_data.nla_tracks.remove(t)
E = Vector((0.02, -0.03, 0.45)); F = Vector((0, -1, 0)); U = Vector((0, 0, 1)); R = Vector((-1, 0, 0))   # eye, forward, up, right
arm.animation_data.action = None
# which chain is the right arm (right = -X): hand bone 022.L sits at +x -> left arm
RIGHT = {'hand': 'Bone.022.R', 'target': 'Bone.023.R', 'fingers': ['Bone.024.L', 'Bone.025.L', 'Bone.026.L', 'Bone.027.L', 'Bone.028.L'], 'tips': ['Bone.007.R', 'Bone.009.R', 'Bone.011.R', 'Bone.013.R', 'Bone.015.R']}
LEFT = {'hand': 'Bone.022.L', 'target': 'Bone.023.L', 'fingers': ['Bone.024.R', 'Bone.025.R', 'Bone.026.R', 'Bone.027.R', 'Bone.028.R'], 'tips': ['Bone.007.L', 'Bone.009.L', 'Bone.011.L', 'Bone.013.L', 'Bone.015.L']}
# sanity: right hand should be at -x
xR = (A @ arm.pose.bones[RIGHT['hand']].head).x
if xR > 0: RIGHT, LEFT = LEFT, RIGHT
print('RIGHT hand bone', RIGHT['hand'])
# elbow poles: empties below-outside each shoulder
poles = {}
for side, sgn in (('R', 1), ('L', -1)):
    e = bpy.data.objects.new('pole_' + side, None); sc.collection.objects.link(e)
    e.location = E + R * (.45 * sgn) - U * .55 + F * .05; poles[side] = e
for side, info in (('R', RIGHT), ('L', LEFT)):
    c = arm.pose.bones[info['hand']].constraints['IK']; c.pole_target = poles[side]; c.pole_angle = 0
def set_world(bone, p):
    pb = arm.pose.bones[bone]; m = pb.matrix.copy(); m.translation = Ai @ p; pb.matrix = m
def reset():
    for pb in arm.pose.bones: pb.location = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0); pb.scale = (1, 1, 1)
    bpy.context.view_layer.update()
def pose(knR, knL, curl=.55):
    reset()
    set_world(RIGHT['target'], knR); set_world(LEFT['target'], knL); bpy.context.view_layer.update()
    for info in (RIGHT, LEFT):
        wrist = A @ arm.pose.bones[info['hand']].head
        for ft, tip in zip(info['fingers'], info['tips']):
            t = A @ arm.pose.bones[tip].tail
            set_world(ft, t.lerp(wrist, curl))
    bpy.context.view_layer.update()
HOLDS = {
  # knuckle targets matched to the game's viewmodel: grip at (right .16, down .19, forward .34) from the eye
  'rifle':   (E + R * .16 - U * .2 + F * .37, E + R * .14 - U * .15 + F * .63),     # support hand under the fore-end, on the gun's line
  'pistol':  (E + R * .13 - U * .15 + F * .42, E + R * .10 - U * .18 + F * .40),     # support hand cups the grip
  'grenade': (E + R * .17 - U * .2 + F * .4,  E - R * .35 - U * .85 + F * .05),      # left arm down out of view
}

baked = {}
bpy.context.view_layer.objects.active = arm; arm.select_set(True)
bpy.ops.object.mode_set(mode='POSE')
for name, (kr, kl) in HOLDS.items():
    pose(kr, kl, .5 if name != 'grenade' else .45)
    bpy.ops.pose.select_all(action='SELECT')
    bpy.ops.nla.bake(frame_start=1, frame_end=1, only_selected=False, visual_keying=True, clear_constraints=False, use_current_action=False, bake_types={'POSE'})
    act = arm.animation_data.action; act.name = 'hold_' + name; act.use_fake_user = True; baked[name] = act
    arm.animation_data.action = None
bpy.ops.object.mode_set(mode='OBJECT')
reset()
for pb in arm.pose.bones:
    for c in list(pb.constraints): pb.constraints.remove(c)
for n, act in baked.items():
    tr = arm.animation_data.nla_tracks.new(); tr.name = act.name; tr.strips.new(act.name, 1, act)
# eye markers (children of the armature so they export in its space)
for nm, p in (('eye', E), ('eye_fwd', E + F * .1), ('eye_up', E + U * .1)):
    e = bpy.data.objects.new(nm, None); sc.collection.objects.link(e); e.parent = arm; e.matrix_parent_inverse = Ai; e.location = p
for o in list(sc.objects):
    if o.name.startswith('pole_') or o.name == 'bar' or o.type in ('CAMERA', 'LIGHT'): bpy.data.objects.remove(o, do_unlink=True)
keep = [arm] + [o for o in sc.objects if o.parent == arm]
bpy.ops.object.select_all(action='DESELECT')
for o in keep: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', use_selection=True, export_skins=True, export_animations=True,
    export_animation_mode='NLA_TRACKS', export_force_sampling=True, export_image_format='WEBP', export_yup=True)
print('JSON' + json.dumps({'kb': os.path.getsize(dst) // 1024, 'clips': list(baked), 'objects': [o.name for o in keep]}))
