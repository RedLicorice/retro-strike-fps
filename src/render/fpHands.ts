import * as BABYLON from 'babylonjs';
import { ctx } from '../core/context';
import { Models } from '../assets/models';

/* First-person arms (public/models/hands/fp_hands.glb).
   The rig ships with its own IK; tools/asset-pipeline/export_hands.py uses it to bake three holds
   (hold_rifle / hold_pistol / hold_grenade) posed around the game's viewmodel grip point, plus
   'eye' / 'eye_fwd' / 'eye_up' marker nodes. At runtime we only seat the rig: orient it so its eye axes
   match the camera, then shift it so the right palm sits exactly on the weapon grip. The weapon keeps its
   own viewmodel placement (bob / kick / ADS), the arms follow it. */
export type HoldKind = 'rifle' | 'pistol' | 'grenade';

export class FPHands {
  root: BABYLON.TransformNode;
  meshes: BABYLON.AbstractMesh[];
  private groups: Record<string, BABYLON.AnimationGroup> = {};
  private kind: HoldKind | null = null;
  private eye: BABYLON.TransformNode; private eyeF: BABYLON.TransformNode; private eyeU: BABYLON.TransformNode;
  private handR: BABYLON.TransformNode;
  private nodes: BABYLON.TransformNode[];
  private grip: BABYLON.Vector3 | null = null;
  private obs: BABYLON.Observer<BABYLON.Scene>;
  private disposeInst: () => void;

  static create(): FPHands | null { return Models.hands ? new FPHands(Models.hands) : null; }

  private constructor(cont: BABYLON.AssetContainer){
    const inst = cont.instantiateModelsToScene(n => n, false, { doNotInstantiate: true });
    this.root = new BABYLON.TransformNode('fpHands', ctx.scene);
    this.root.rotationQuaternion = BABYLON.Quaternion.Identity();
    for (const r of inst.rootNodes) r.parent = this.root;
    this.meshes = this.root.getChildMeshes();
    for (const m of this.meshes){ m.renderingGroupId = 1; m.isPickable = false; m.alwaysSelectAsActiveMesh = true; m.receiveShadows = false; }
    for (const g of inst.animationGroups){ g.stop(); this.groups[g.name.replace(/^hold_/, '')] = g; }
    this.nodes = this.root.getChildTransformNodes(false);
    const byName = (n: string) => this.nodes.find(t => t.name === n);
    this.eye = byName('eye'); this.eyeF = byName('eye_fwd'); this.eyeU = byName('eye_up');
    this.handR = byName('Bone.022.R');                 /* the rig's right hand (its .L/.R suffixes are crossed elsewhere) */
    this.obs = ctx.scene.onAfterAnimationsObservable.add(() => this.fit());
    this.disposeInst = () => { inst.dispose(); this.root.dispose(); };
    this.setEnabled(false);
  }

  setEnabled(on: boolean){ if (this.root.isEnabled() !== on) this.root.setEnabled(on); }
  dispose(){ ctx.scene.onAfterAnimationsObservable.remove(this.obs); this.disposeInst(); }

  /* which baked hold to show, and where the weapon grip is (world); called every frame by the weapon controller */
  hold(kind: HoldKind, gripWorld: BABYLON.Vector3){
    if (kind !== this.kind){
      for (const k in this.groups) this.groups[k].stop();
      const g = this.groups[kind]; if (g){ g.start(true, 1, g.from, g.to); g.setWeightForAllAnimatables(1); }
      this.kind = kind;
    }
    this.grip = gripWorld;
  }

  /* palm centre of the right hand: halfway from the wrist to the finger bases */
  private palmR(){
    const W = this.handR.getAbsolutePosition(), kids = this.handR.getChildTransformNodes(true);
    if (!kids.length) return W.clone();
    const k = kids.reduce((s, n) => s.addInPlace(n.getAbsolutePosition()), BABYLON.Vector3.Zero()).scaleInPlace(1 / kids.length);
    return W.add(k.subtract(W).scaleInPlace(.5));
  }
  private refresh(){ this.root.computeWorldMatrix(true); for (const n of this.nodes) n.computeWorldMatrix(true); }

  private fit(){
    if (!this.root.isEnabled() || !this.grip || !this.eye || !this.handR) return;
    /* rig axes at identity */
    this.root.position.setAll(0); this.root.rotationQuaternion.copyFromFloats(0, 0, 0, 1); this.refresh();
    const E0 = this.eye.getAbsolutePosition().clone();
    const F0 = this.eyeF.getAbsolutePosition().subtract(E0).normalize(), U0 = this.eyeU.getAbsolutePosition().subtract(E0).normalize();
    const P0 = this.palmR();
    /* camera axes */
    const cm = ctx.cam.getWorldMatrix();
    const Fc = BABYLON.Vector3.TransformNormal(BABYLON.Axis.Z, cm).normalize(), Uc = BABYLON.Vector3.TransformNormal(BABYLON.Axis.Y, cm).normalize();
    const q = BABYLON.Quaternion.FromLookDirectionLH(Fc, Uc).multiply(BABYLON.Quaternion.Inverse(BABYLON.Quaternion.FromLookDirectionLH(F0, U0)));
    this.root.rotationQuaternion.copyFrom(q);
    const p = P0.applyRotationQuaternion(q);
    this.root.position.set(this.grip.x - p.x, this.grip.y - p.y, this.grip.z - p.z);
    this.refresh();
  }
}
