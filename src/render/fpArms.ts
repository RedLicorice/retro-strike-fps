import { WBY } from '../data/weapons';
import * as BABYLON from 'babylonjs';
import { ctx } from '../core/context';
import { Models } from '../assets/models';
import { Animator } from '../actors/animator';

/* First-person arms from the player's own operator model.
   The character plays the rifle aiming idle. Everything but the arms is collapsed through bone scales:
   hips ×0.01 shrinks pelvis + spine + chest (they inherit it), the shoulders ×100 restore full-size arms,
   and neck/legs go to 0. Arm shape relative to the hands is untouched. Every frame, after animation, the whole body is fitted so that the right palm sits
   on the viewmodel pose node and the right→left hand line points where that node points; the weapon is then
   held between the real hands by the Animator. */
const BONE_SCALE: Record<string, number> = {
  'mixamorig:Hips': .01, 'mixamorig:LeftShoulder': 100, 'mixamorig:RightShoulder': 100,
  'mixamorig:Neck': 0, 'mixamorig:LeftUpLeg': 0, 'mixamorig:RightUpLeg': 0
};

export class FPArms {
  charId: string;
  anim: Animator;
  private root: BABYLON.TransformNode;
  private nodes: BABYLON.TransformNode[];
  private rh: BABYLON.TransformNode; private lh: BABYLON.TransformNode;
  pose: BABYLON.TransformNode | null = null;       /* viewmodel pose node (parented to the camera) */
  private clip: BABYLON.Plane;
  private mats: BABYLON.Material[] = [];
  static CLIP_NEAR = .16;
  static ROLL = .45;                                   /* 1 = shoulders straight down */
  private ls: BABYLON.TransformNode; private rs: BABYLON.TransformNode;                           /* metres in front of the eye where the body starts to show */

  static create(charId: string): FPArms | null {
    const inst = Models.character(charId);
    if (!inst) return null;
    return new FPArms(charId, inst);
  }

  private constructor(charId: string, inst: ReturnType<typeof Models.character>){
    this.charId = charId;
    this.root = inst.root;
    this.root.rotationQuaternion = BABYLON.Quaternion.Identity();
    for (const n in BONE_SCALE){ const b = inst.node(n); if (b) b.scaling.setAll(BONE_SCALE[n]); }
    /* own material copies: a clip plane removes shoulder/torso geometry right in front of the camera,
       without affecting bots wearing the same operator */
    this.clip = new BABYLON.Plane(0, 0, 1, 0);
    const copies = new Map<BABYLON.Material, BABYLON.Material>();
    for (const m of inst.meshes){
      m.renderingGroupId = 1; m.receiveShadows = false; m.alwaysSelectAsActiveMesh = true;
      m.renderOverlay = false;
      if (m.material){
        let c = copies.get(m.material);
        if (!c){ c = m.material.clone(m.material.name + '_fp'); c.unfreeze(); c.clipPlane = this.clip; copies.set(m.material, c); }
        m.material = c;
      }
    }
    this.mats = [...copies.values()];
    this.nodes = this.root.getChildTransformNodes(false);
    this.rh = inst.node('mixamorig:RightHand'); this.lh = inst.node('mixamorig:LeftHand');
    this.ls = inst.node('mixamorig:LeftArm'); this.rs = inst.node('mixamorig:RightArm');
    this.anim = new Animator(inst);
    this.anim.prePlace = () => this.fit();
    this.setEnabled(false);
  }

  setWeapon(id: string | null){
    this.anim.setWeapon(id ? Models.weapon(id, true) : null, id ? Models.markers[id] : null, !id ? 'none' : (WBY[id] && WBY[id].slot === 1) ? 'pistol' : 'rifle');
  }
  setEnabled(on: boolean){ if (this.root.isEnabled() !== on) this.root.setEnabled(on); }
  get enabled(){ return this.root.isEnabled(); }

  update(dt: number){
    if (!this.enabled) return;
    this.anim.update(dt, { alive: true, vx: 0, vz: 0, vy: 0, yaw: 0, stance: 0, sliding: false, aiming: true, airborne: false });
  }

  /* world muzzle of the held weapon */
  muzzleWorld(): BABYLON.Vector3 | null {
    const w = this.anim.weapon, mk = this.anim.markers;
    return w && mk ? BABYLON.Vector3.TransformCoordinates(mk.muzzle, w.getWorldMatrix()) : null;
  }

  dispose(){ this.anim.dispose(); for (const m of this.mats) m.dispose(); }

  private computeAll(){
    this.root.computeWorldMatrix(true);
    for (const n of this.nodes) n.computeWorldMatrix(true);
  }

  /* place the body so the hands hold the gun at the pose node, pointing along its forward axis */
  private fit(){
    const pose = this.pose;
    if (!pose || !this.enabled || !this.rh || !this.lh) return;
    ctx.cam.computeWorldMatrix(); pose.computeWorldMatrix(true);
    /* hands in the body's own frame (root at identity) */
    this.root.position.setAll(0); this.root.rotationQuaternion.copyFromFloats(0, 0, 0, 1);
    this.computeAll();
    const R0 = this.anim.palm('Right'), L0 = this.anim.palm('Left');
    const a = L0.subtract(R0).normalize();
    /* target frame from the pose node */
    const m = pose.getWorldMatrix();
    const G = m.getTranslation();
    const F = BABYLON.Vector3.TransformNormal(BABYLON.Axis.Z, m).normalize();
    const U = BABYLON.Vector3.TransformNormal(BABYLON.Axis.Y, m).normalize();
    const qa = BABYLON.Quaternion.FromLookDirectionLH(a, ortho(BABYLON.Axis.Y, a));
    const qf = BABYLON.Quaternion.FromLookDirectionLH(F, ortho(U, F));
    const q = qf.multiply(BABYLON.Quaternion.Inverse(qa));
    /* roll the body about the gun axis so the shoulders hang below the view: arms rise from the bottom of the
       screen instead of crossing it (the gun's aim is unchanged by a roll about its own axis) */
    const mid = this.ls && this.rs ? this.ls.getAbsolutePosition().add(this.rs.getAbsolutePosition()).scaleInPlace(.5).subtractInPlace(R0) : null;
    let qq = q;
    if (mid){
      const v = mid.applyRotationQuaternion(q);
      const p = v.subtract(F.scale(BABYLON.Vector3.Dot(v, F)));
      const t = U.scale(-1);
      const ang = Math.atan2(BABYLON.Vector3.Dot(F, BABYLON.Vector3.Cross(p, t)), BABYLON.Vector3.Dot(p, t));
      qq = BABYLON.Quaternion.RotationAxis(F, ang * FPArms.ROLL).multiply(q);
    }
    this.root.rotationQuaternion.copyFrom(qq);
    /* the Animator puts the weapon grip in the right palm: place the body so that palm lands on G */
    const r = R0.applyRotationQuaternion(qq);
    this.root.position.set(G.x - r.x, G.y - r.y, G.z - r.z);
    this.computeAll();
    /* discard fragments closer than CLIP_NEAR along the view direction (Babylon clips where plane·p > 0) */
    const cm = ctx.cam.getWorldMatrix(), E = cm.getTranslation();
    const V = BABYLON.Vector3.TransformNormal(BABYLON.Axis.Z, cm).normalize();
    this.clip.normal.copyFromFloats(-V.x, -V.y, -V.z);
    this.clip.d = BABYLON.Vector3.Dot(V, E) + FPArms.CLIP_NEAR;
  }
}

function ortho(up: BABYLON.Vector3, f: BABYLON.Vector3){
  const u = up.subtract(f.scale(BABYLON.Vector3.Dot(up, f)));
  const l = u.length();
  return l > 1e-4 ? u.scaleInPlace(1 / l) : new BABYLON.Vector3(0, 1, 0);
}
