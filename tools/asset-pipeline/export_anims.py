"""Mixamo 'without skin' FBX clips -> one armature GLB with one glTF animation per clip + a manifest."""
import bpy, sys, re, json, os, math
args = sys.argv[sys.argv.index('--') + 1:]
root, dst, manifest = args[0], args[1], args[2]
DIR = {'forward': 'f', 'backward': 'b', 'left': 'l', 'right': 'r', 'forward left': 'fl', 'forward right': 'fr', 'backward left': 'bl', 'backward right': 'br'}
CLIPS = {}
for gait, pre in (('walk', 'walk'), ('run', 'run'), ('sprint', 'sprint'), ('walk crouching', 'crouch')):
    for d, s in DIR.items(): CLIPS['rifle_pro/%s %s.fbx' % (gait, d)] = ('%s_%s' % (pre, s), True)
CLIPS.update({
  'rifle_pro/idle.fbx': ('idle', True), 'rifle_pro/idle aiming.fbx': ('idle_aim', True),
  'rifle_pro/idle crouching.fbx': ('crouch_idle', True), 'rifle_pro/idle crouching aiming.fbx': ('crouch_idle_aim', True),
  'rifle_pro/jump up.fbx': ('jump_up', False), 'rifle_pro/jump loop.fbx': ('jump_loop', True), 'rifle_pro/jump down.fbx': ('jump_down', False),
  'rifle_pro/death from the front.fbx': ('death_front', False), 'rifle_pro/death from the back.fbx': ('death_back', False),
  'rifle_pro/death from right.fbx': ('death_right', False), 'rifle_pro/death from front headshot.fbx': ('death_front_head', False),
  'rifle_pro/death from back headshot.fbx': ('death_back_head', False), 'rifle_pro/death crouching headshot front.fbx': ('death_crouch_head', False),
  # prone (rifle) + unarmed low crawl + slide
  'rifle_prone/Prone Idle.fbx': ('prone_idle', True),
  'rifle_prone/Prone Forward.fbx': ('prone_f', True),
  'rifle_prone/Moving Backward In Prone Position.fbx': ('prone_b', True),
  'rifle_prone/Prone Death.fbx': ('death_prone', False),
  'Low Crawl.fbx': ('lowcrawl_f', True),
  'Running Slide.fbx': ('slide', False),
  # pistol locomotion (x+ = left in these Mixamo clips)
  'pistol_handgun_locomotion/pistol idle.fbx': ('pistol_idle', True),
  'pistol_handgun_locomotion/pistol walk.fbx': ('pistol_walk_f', True),
  'pistol_handgun_locomotion/pistol walk backward.fbx': ('pistol_walk_b', True),
  'pistol_handgun_locomotion/pistol strafe.fbx': ('pistol_walk_l', True),
  'pistol_handgun_locomotion/pistol strafe (2).fbx': ('pistol_walk_r', True),
  'pistol_handgun_locomotion/pistol run.fbx': ('pistol_run_f', True),
  'pistol_handgun_locomotion/pistol run backward.fbx': ('pistol_run_b', True),
  'pistol_handgun_locomotion/pistol kneeling idle.fbx': ('pistol_crouch_idle', True),
  'pistol_handgun_locomotion/pistol jump.fbx': ('pistol_jump', False),
  'pistol_handgun_locomotion/pistol jump (2).fbx': ('pistol_jump_run', False),
  # unarmed (grenade in hand)
  'basic_locomotion/idle.fbx': ('unarmed_idle', True),
  'basic_locomotion/walking.fbx': ('unarmed_walk_f', True),
  'basic_locomotion/left strafe walking.fbx': ('unarmed_walk_l', True),
  'basic_locomotion/right strafe walking.fbx': ('unarmed_walk_r', True),
  'basic_locomotion/jump.fbx': ('unarmed_jump', False),
  'basic_locomotion/left turn 90.fbx': ('unarmed_turn_l', False),
  'basic_locomotion/right turn 90.fbx': ('unarmed_turn_r', False),
  # unarmed backward low crawl + its start / stop
  'rifle_prone/Crawl Backwards In Prone.fbx': ('lowcrawl_b', True),
  'rifle_prone/Prone Backwards Start.fbx': ('lowcrawl_b_start', False),
  'rifle_prone/Prone Backwards Stop.fbx': ('lowcrawl_b_stop', False),
  # turning in place (body catches up with the view)
  'rifle_pro/turn 90 left.fbx': ('turn_l', False),
  'rifle_pro/turn 90 right.fbx': ('turn_r', False),
  'rifle_pro/crouching turn 90 left.fbx': ('crouch_turn_l', False),
  'rifle_pro/crouching turn 90 right.fbx': ('crouch_turn_r', False),
  'rifle_prone/Prone Left Turn (1).fbx': ('prone_turn_l', False),     # the (1) variants turn ~45°; the plain ones swing and return
  'rifle_prone/Prone Right Turn (1).fbx': ('prone_turn_r', False),
  # stance transitions
  'rifle_prone/Crouch To Prone.fbx': ('t_crouch_prone', False),
  'rifle_prone/Prone To Crouch Transition.fbx': ('t_prone_crouch', False),
  'rifle_prone/Prone to Standing Getting Up.fbx': ('t_prone_stand', False),
  'pistol_handgun_locomotion/pistol stand to kneel.fbx': ('pistol_t_stand_crouch', False),
  'pistol_handgun_locomotion/pistol kneel to stand.fbx': ('pistol_t_crouch_stand', False),
  # upper-body one-shots
  'basic_shooter/firing rifle.fbx': ('fire', False),
  'rifle_prone/Prone Firing Rifle.fbx': ('prone_fire', False),
  'basic_shooter/hit reaction.fbx': ('hit', False),
  'rifle_prone/Rifle Prone Hit Reaction.fbx': ('prone_hit', False),
  'basic_shooter/toss grenade.fbx': ('throw', False),
  'rifle_prone/Prone Throw Grenade.fbx': ('prone_throw', False),
  # reloads (played on the upper body only)
  'basic_shooter/reloading.fbx': ('reload', False),
  'rifle_prone/Prone Reloading.fbx': ('prone_reload', False),
})
fix = lambda s: re.sub(r'mixamorig\d*:', 'mixamorig:', s)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=os.path.join(root, 'rifle_pro/idle.fbx'))
base = next(o for o in bpy.data.objects if o.type == 'ARMATURE'); base.name = 'Armature'
for b in base.data.bones: b.name = fix(b.name)
for a in list(bpy.data.actions): bpy.data.actions.remove(a)
base.animation_data_create()
fps = bpy.context.scene.render.fps
man = {'fps': fps, 'clips': {}}
for rel, (name, loop) in CLIPS.items():
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=os.path.join(root, rel))
    new = [o for o in bpy.data.objects if o not in before]
    arm = next(o for o in new if o.type == 'ARMATURE')
    act = arm.animation_data.action; act.name = name
    for fc in act.fcurves: fc.data_path = fix(fc.data_path)
    f0, f1 = act.frame_range
    hips = {fc.array_index: fc for fc in act.fcurves if fc.data_path == 'pose.bones["mixamorig:Hips"].location'}
    dx = hips[0].evaluate(f1) - hips[0].evaluate(f0); dz = hips[2].evaluate(f1) - hips[2].evaluate(f0)
    dur = (f1 - f0) / fps
    if not name.startswith('death'):
        # bake in place: remove the linear horizontal drift, keep the bob/sway
        for i, d in ((0, dx), (2, dz)):
            for k in hips[i].keyframe_points:
                t = (k.co[0] - f0) / max(1e-6, f1 - f0)
                k.co[1] -= d * t; k.handle_left[1] -= d * t; k.handle_right[1] -= d * t
    air = None
    if 'jump' in name and 1 in hips:
        ys = [(f, hips[1].evaluate(f)) for f in range(int(f0), int(f1) + 1)]
        y0 = ys[0][1]
        up = [f for f, y in ys if y > y0 + 4]          # hips 4cm above the starting stance = off the ground
        if up: air = [round((up[0] - f0) / fps, 3), round((up[-1] - f0) / fps, 3)]
    span = None
    if name.startswith('t_') or '_t_' in name:
        ys = [(f, hips[1].evaluate(f)) for f in range(int(f0), int(f1) + 1)]
        ya, yb = ys[0][1], ys[-1][1]
        mv = [f for f, y in ys if abs(y - ya) > 3]                       # hips leave the starting height
        if mv:
            t0 = mv[0]; done = [f for f, y in ys if f > t0 and abs(y - yb) < 3]
            span = [round((t0 - f0) / fps, 3), round(((done[0] if done else f1) - f0) / fps, 3)]
    turn = None
    if '_turn_' in name or name.startswith('turn_'):
        from mathutils import Quaternion
        rq = {fc.array_index: fc for fc in act.fcurves if fc.data_path == 'pose.bones["mixamorig:Hips"].rotation_quaternion'}
        if len(rq) == 4:
            q0 = Quaternion([rq[i].evaluate(f0) for i in range(4)]); q1 = Quaternion([rq[i].evaluate(f1) for i in range(4)])
            hb = next(bn for bn in arm.data.bones if bn.name.endswith('Hips'))
            W = (arm.matrix_world @ hb.matrix_local).to_quaternion()
            dw = W @ (q1 @ q0.inverted()) @ W.inverted()            # world-space change of the hips over the clip
            # twist about world up (Blender Z): yaw the body ends up turned by
            tw = Quaternion((dw.w, 0, 0, dw.z)).normalized()
            turn = round(math.degrees(2 * math.atan2(tw.z, tw.w)), 1)   # + = counter-clockwise from above
    man['clips'][name] = {'loop': loop, 'dur': round(dur, 4), 'speed': round((dx * dx + dz * dz) ** .5 * .01 / dur, 3) if loop else 0, 'src': rel, **({'air': air} if air else {}), **({'turn': turn} if turn is not None else {}), **({'span': span} if span else {})}
    act.use_fake_user = True
    tr = base.animation_data.nla_tracks.new(); tr.name = name
    st = tr.strips.new(name, int(f0), act); st.action_frame_start, st.action_frame_end = f0, f1
    for o in new: bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.object.select_all(action='DESELECT'); base.select_set(True)
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', use_selection=True, export_animations=True, export_animation_mode='NLA_TRACKS',
    export_force_sampling=True, export_optimize_animation_size=True, export_anim_single_armature=True, export_def_bones=False, export_yup=True)
json.dump(man, open(manifest, 'w'), indent=1)
print('JSON' + json.dumps({'clips': len(man['clips']), 'mb': round(os.path.getsize(dst) / 1e6, 2), 'speeds': {k: v['speed'] for k, v in man['clips'].items() if v['speed']}}))
