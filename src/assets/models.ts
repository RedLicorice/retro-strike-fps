import * as BABYLON from 'babylonjs';
import 'babylonjs-loaders';
import { ctx } from '../core/context';
import { CHARACTERS } from '../data/characters';
import { WEAPONS } from '../data/weapons';

/* Loads every GLB once into an AssetContainer, then hands out cheap instances.
   - characters: skinned Mixamo rigs, normalised to CHAR_HEIGHT, sharing one retargeted animation set
   - weapons: grip at origin, muzzle toward +Z, with `muzzle` / `sight` / `fore` marker nodes */

const BASE = import.meta.env.BASE_URL + 'models/';
export const CHAR_HEIGHT = 1.8;
const HIPS = 'mixamorig:Hips';

export interface ClipInfo { loop: boolean; dur: number; speed: number }
export interface WeaponMarkers { muzzle: BABYLON.Vector3; sight: BABYLON.Vector3; fore: BABYLON.Vector3 | null }
export interface CharInstance {
  root: BABYLON.TransformNode;
  meshes: BABYLON.AbstractMesh[];
  node(name: string): BABYLON.TransformNode | undefined;
  groups: Record<string, BABYLON.AnimationGroup>;
  dispose(): void;
}

let seq = 0;

export const Models = {
  ready: false,
  chars: {} as Record<string, BABYLON.AssetContainer>,
  weapons: {} as Record<string, BABYLON.AssetContainer>,
  markers: {} as Record<string, WeaponMarkers>,
  anim: null as BABYLON.AssetContainer | null,
  hands: null as BABYLON.AssetContainer | null,
  /* world props (public/models/world, see tools/asset-pipeline/world_spec.json): origin at bottom centre */
  world: {} as Record<string, BABYLON.AssetContainer>,
  clips: {} as Record<string, ClipInfo>,
  charScale: {} as Record<string, number>,
  hipsAnims: {} as Record<string, Record<string, BABYLON.Animation>>,

  async load(onProgress?: (done: number, total: number) => void){
    const scene = ctx.scene;
    /* containers must not auto-play their animations */
    const obs = BABYLON.SceneLoader.OnPluginActivatedObservable.add((p: any) => {
      if (p.name === 'gltf') p.animationStartMode = 0; /* GLTFLoaderAnimationStartMode.NONE */
    });
    const jobs: Array<() => Promise<void>> = [];
    jobs.push(async () => {
      this.anim = await BABYLON.SceneLoader.LoadAssetContainerAsync(BASE + 'anims/', 'rifle.glb', scene);
      const man = await (await fetch(BASE + 'anims/rifle.json')).json();
      this.clips = man.clips;
    });
    const gains: Record<string, Record<string, number>> = await fetch(BASE + 'characters/materials.json').then(r => r.json()).catch(() => ({}));
    for (const c of CHARACTERS) jobs.push(async () => {
      const cont = await BABYLON.SceneLoader.LoadAssetContainerAsync(BASE + 'characters/', c.id + '.glb', scene);
      toRetroMaterials(cont, gains[c.id], true);
      this.chars[c.id] = cont;
    });
    jobs.push(async () => {
      this.hands = await BABYLON.SceneLoader.LoadAssetContainerAsync(BASE + 'hands/', 'fp_hands.glb', scene);
      toRetroMaterials(this.hands);
    });
    const worldIds = Object.keys(await fetch(BASE + 'world/world.json').then(r => r.json()).catch(() => ({})));
    for (const id of worldIds) jobs.push(async () => {
      const cont = await BABYLON.SceneLoader.LoadAssetContainerAsync(BASE + 'world/', id + '.glb', scene);
      toRetroMaterials(cont);
      this.world[id] = cont;
    });
    for (const w of WEAPONS) jobs.push(async () => {
      const cont = await BABYLON.SceneLoader.LoadAssetContainerAsync(BASE + 'weapons/', w.id + '.glb', scene);
      toRetroMaterials(cont);
      this.weapons[w.id] = cont;
    });
    let done = 0;
    await Promise.all(jobs.map(j => j().then(() => { done++; onProgress && onProgress(done, jobs.length); })));
    BABYLON.SceneLoader.OnPluginActivatedObservable.remove(obs);
    for (const w of WEAPONS) this.markers[w.id] = measureMarkers(this.weapons[w.id]);
    this.ready = true;
  },

  /* ---------------- weapons ---------------- */
  weapon(id: string, view: boolean): BABYLON.TransformNode | null {
    const cont = this.weapons[id]; if (!cont) return null;
    const inst = cont.instantiateModelsToScene(n => n, false, { doNotInstantiate: true });
    const root = new BABYLON.TransformNode('wpn_' + id + '_' + (seq++), ctx.scene);
    for (const r of inst.rootNodes) r.parent = root;
    root.getChildMeshes().forEach(m => {
      m.isPickable = false; m.receiveShadows = !view;
      if (view) m.renderingGroupId = 1;
    });
    return root;
  },

  /* ---------------- characters ---------------- */
  character(id: string): CharInstance | null {
    const cont = this.chars[id]; if (!cont || !this.anim) return null;
    const inst = cont.instantiateModelsToScene(n => n, false, { doNotInstantiate: true });
    const root = new BABYLON.TransformNode('char_' + id + '_' + (seq++), ctx.scene);
    for (const r of inst.rootNodes) r.parent = root;
    const nodes = new Map<string, BABYLON.TransformNode>();
    for (const n of root.getDescendants(false)) if (n instanceof BABYLON.TransformNode && !(n instanceof BABYLON.AbstractMesh)) nodes.set(n.name, n);
    if (this.charScale[id] === undefined) this.charScale[id] = measureScale(root, nodes);
    root.scaling.setAll(this.charScale[id]);
    const meshes = root.getChildMeshes();
    meshes.forEach(m => { m.isPickable = false; m.receiveShadows = true; });

    /* retarget: share keyframes; only rotations transfer, plus hips translation rescaled to this body */
    const hips = this.hipsFor(id, nodes.get(HIPS));
    const groups: Record<string, BABYLON.AnimationGroup> = {};
    for (const src of this.anim.animationGroups){
      const g = new BABYLON.AnimationGroup(src.name + '#' + seq, ctx.scene);
      for (const ta of src.targetedAnimations){
        const t = nodes.get(ta.target.name); if (!t) continue;
        const prop = ta.animation.targetProperty;
        if (prop === 'rotationQuaternion') g.addTargetedAnimation(ta.animation, t);
        else if (prop === 'position' && ta.target.name === HIPS && hips[src.name]) g.addTargetedAnimation(hips[src.name], t);
      }
      g.loopAnimation = !!(this.clips[src.name] && this.clips[src.name].loop);
      groups[src.name] = g;
    }
    return {
      root, meshes, groups,
      node: (n: string) => nodes.get(n),
      dispose(){
        for (const k in groups) groups[k].dispose();
        inst.skeletons.forEach(s => s.dispose());
        root.dispose(false, false);
      }
    };
  },

  /* hips keys scaled by (this body's hip offset / the animation rig's hip offset), cached per character */
  hipsFor(id: string, charHips?: BABYLON.TransformNode){
    if (this.hipsAnims[id]) return this.hipsAnims[id];
    const out: Record<string, BABYLON.Animation> = {};
    const animHips = this.anim.transformNodes.find(n => n.name === HIPS);
    const k = charHips && animHips ? charHips.position.length() / Math.max(1e-6, animHips.position.length()) : 1;
    for (const g of this.anim.animationGroups){
      const ta = g.targetedAnimations.find(t => t.target.name === HIPS && t.animation.targetProperty === 'position');
      if (!ta) continue;
      const a = ta.animation.clone();
      a.setKeys(ta.animation.getKeys().map(key => ({ frame: key.frame, value: (key.value as BABYLON.Vector3).scale(k) })));
      out[g.name] = a;
    }
    return (this.hipsAnims[id] = out);
  }
};

/* glTF PBR without an environment map renders near-black metals; the game is lit for StandardMaterial.
   `gain` brightens dark albedo textures (Mixamo suits lean on spec/normal maps we strip) so bodies stay readable. */
function toRetroMaterials(cont: BABYLON.AssetContainer, gain?: Record<string, number>, rim?: boolean){
  const swap = new Map<BABYLON.Material, BABYLON.StandardMaterial>();
  for (const mat of cont.materials){
    if (!(mat instanceof BABYLON.PBRMaterial)) continue;
    const s = new BABYLON.StandardMaterial(mat.name + '_std', ctx.scene);
    s.diffuseTexture = mat.albedoTexture;
    const k = (gain && gain[mat.name]) || 1;
    s.diffuseColor = mat.albedoTexture ? new BABYLON.Color3(k, k, k) : mat.albedoColor.clone();
    s.specularColor = new BABYLON.Color3(.08, .08, .07);
    s.specularPower = 24;
    s.ambientColor = new BABYLON.Color3(.48, .46, .40);
    if (mat.albedoTexture && (mat.transparencyMode === 1 || mat.transparencyMode === 3 || mat.useAlphaFromAlbedoTexture)){
      s.diffuseTexture.hasAlpha = true; s.useAlphaFromDiffuseTexture = false; s.transparencyMode = 1; s.alphaCutOff = .5;
    }
    s.backFaceCulling = mat.backFaceCulling;
    if (rim){
      /* soft rim light keeps dark outfits readable against the arena */
      const f = new BABYLON.FresnelParameters();
      f.leftColor = new BABYLON.Color3(.34, .32, .28); f.rightColor = new BABYLON.Color3(0, 0, 0); f.bias = .2; f.power = 2.2;
      s.emissiveFresnelParameters = f;
    }
    s.freeze();   /* static shading: skip per-frame material dirty checks */
    swap.set(mat, s);
  }
  for (const m of cont.meshes) if (m.material && swap.has(m.material)) m.material = swap.get(m.material);
  for (const [pbr, s] of swap){ cont.materials.splice(cont.materials.indexOf(pbr), 1); cont.materials.push(s); pbr.dispose(); }
}

/* marker empties in the weapon's own frame (grip at origin) */
function measureMarkers(cont: BABYLON.AssetContainer): WeaponMarkers {
  const inst = cont.instantiateModelsToScene(n => n, false, { doNotInstantiate: true });
  const root = inst.rootNodes[0] as BABYLON.TransformNode;
  root.getDescendants(false).forEach(n => (n as BABYLON.TransformNode).computeWorldMatrix && (n as BABYLON.TransformNode).computeWorldMatrix(true));
  const pos = (name: string) => {
    const n = root.getDescendants(false).find(d => d.name === name) as BABYLON.TransformNode;
    return n ? n.getAbsolutePosition().clone() : null;
  };
  const out = { muzzle: pos('muzzle') || new BABYLON.Vector3(0, .05, .5), sight: pos('sight') || new BABYLON.Vector3(0, .08, 0), fore: pos('fore') };
  inst.dispose();
  return out;
}

/* scale so the head-top joint (T-pose) sits at CHAR_HEIGHT */
function measureScale(root: BABYLON.TransformNode, nodes: Map<string, BABYLON.TransformNode>): number {
  root.getDescendants(false).forEach(n => (n as BABYLON.TransformNode).computeWorldMatrix && (n as BABYLON.TransformNode).computeWorldMatrix(true));
  const top = nodes.get('mixamorig:HeadTop_End') || nodes.get('mixamorig:Head');
  const foot = nodes.get('mixamorig:LeftToeBase') || nodes.get('mixamorig:LeftFoot');
  if (!top) return 1;
  const h = top.getAbsolutePosition().y - (foot ? Math.min(0, foot.getAbsolutePosition().y) : 0) + (nodes.get('mixamorig:HeadTop_End') ? 0 : .12);
  return h > .1 ? CHAR_HEIGHT / h : 1;
}
