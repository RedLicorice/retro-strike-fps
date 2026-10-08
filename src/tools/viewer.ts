/* Dev-only model viewer (served at /viewer.html by `npm run dev`, not part of the production build).
   URL params: char, clip, wpn, view=side|front|back|fp|fpads|portrait, t (seconds into the clip), yaw */
import * as BABYLON from 'babylonjs';
import { ctx } from '../core/context';
import { MAT } from '../render/materials';
import { Models } from '../assets/models';
import { Animator } from '../actors/animator';
import { buildViewWeapon, viewPlacement } from '../render/viewmodel';
import { WBY } from '../data/weapons';

const q = new URLSearchParams(location.search);
const P = (k: string, d: string) => q.get(k) || d;

async function main(){
  const canvas = document.getElementById('c') as HTMLCanvasElement;
  ctx.canvas = canvas;
  /* Deliberately WebGL, not the WebGPU-first createEngine(): tests/e2e/viewer_shots.py grabs
     frames with canvas.toDataURL() after stopRenderLoop(), which needs preserveDrawingBuffer —
     a WebGL-only context attribute. This tool wants byte-stable reference shots, not the
     fastest backend. */
  ctx.engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, antialias: true });
  (window as any).__rs_engine = ctx.engine;
  const scene = ctx.scene = new BABYLON.Scene(ctx.engine);
  const portrait = P('view', 'side') === 'portrait';
  scene.clearColor = portrait ? new BABYLON.Color4(0, 0, 0, 0) : new BABYLON.Color4(.11, .12, .09, 1);
  scene.ambientColor = new BABYLON.Color3(.5, .5, .5);
  const cam = ctx.cam = new BABYLON.FreeCamera('cam', new BABYLON.Vector3(0, 1.2, -3), scene);
  cam.minZ = .02; cam.fov = .8;
  new BABYLON.HemisphericLight('h', new BABYLON.Vector3(0, 1, 0), scene).intensity = .9;
  const sun = new BABYLON.DirectionalLight('d', new BABYLON.Vector3(-.4, -1, .6), scene); sun.intensity = .8;
  const ground = BABYLON.MeshBuilder.CreateGround('g', { width: 6, height: 6 }, scene);
  const gm = new BABYLON.StandardMaterial('gm', scene); gm.diffuseColor = new BABYLON.Color3(.25, .24, .2); ground.material = gm;
  ground.isVisible = !portrait;
  if (portrait){ const key = new BABYLON.DirectionalLight('key', new BABYLON.Vector3(.35, -.35, -1), scene); key.intensity = 1.1; }
  /* 1m grid posts for scale */
  if (!portrait) for (let i = -2; i <= 2; i++){ const b = BABYLON.MeshBuilder.CreateBox('p', { width: .02, height: 1.8, depth: .02 }, scene); b.position.set(i, .9, 1.5); }
  MAT.init();
  await Models.load();
  (window as any).__rs_models = Models;
  const view = P('view', 'side');
  const w = WBY[P('wpn', 'ak47')];
  const hud = document.getElementById('hud');
  if (view === 'fp' || view === 'fpads'){
    cam.position.set(0, 1.6, 0); cam.rotation.set(0, 0, 0); cam.fov = 1.05; cam.minZ = .055;
    const wall = BABYLON.MeshBuilder.CreatePlane('w', { size: 30 }, scene); wall.position.set(0, 1.6, 14); (wall as any).material = gm;
    const v = buildViewWeapon(w); v.root.parent = cam;
    const pl = viewPlacement(w);
    v.root.position.copyFrom(view === 'fpads' ? pl.ads : pl.hip);
    const target = BABYLON.MeshBuilder.CreateBox('t', { size: .3 }, scene); target.position.set(0, 1.6, 12);
    scene.render(); (window as any).__ready = true; ctx.engine.runRenderLoop(() => scene.render());
    hud.textContent = w.name + ' ' + view;
    return;
  }
  const inst = Models.character(P('char', 'swat'));
  const an = new Animator(inst);
  an.setWeapon(Models.weapon(w.id, false), Models.markers[w.id]);
  const rig = new BABYLON.TransformNode('rig', scene); inst.root.parent = rig;
  rig.rotation.y = +P('yaw', '0');
  const clip = P('clip', 'idle');
  const g = inst.groups[clip];
  if (g){ g.start(true, 1); g.setWeightForAllAnimatables(1); g.goToFrame(g.from + (+P('t', '0')) * 60); }
  const views: Record<string, [number, number, number]> = { side: [2.6, 1.1, 0], front: [0, 1.1, 2.8], back: [0, 1.1, -2.8], portrait: [0, 1.05, 2.9], hands: [.9, 1.35, .9] };
  const cp = views[view] || views.side;
  cam.position.set(cp[0], cp[1], cp[2]);
  cam.setTarget(new BABYLON.Vector3(0, view === 'hands' ? 1.25 : .95, 0));
  if (portrait) cam.fov = .62;
  if (q.get('pause')) scene.animationsEnabled = true;
  let frames = 0;
  ctx.engine.runRenderLoop(() => {
    scene.render(); frames++;
    if (frames === 3 && q.get('freeze')) g && g.pause();
    if (frames === 5) (window as any).__ready = true;
  });
  const hips = inst.node('mixamorig:Hips');
  (window as any).__probe = () => {
    const H = inst.node('mixamorig:HeadTop_End') || inst.node('mixamorig:Head');
    return { hips: hips.getAbsolutePosition().asArray().map(v => +v.toFixed(3)), head: H.getAbsolutePosition().asArray().map(v => +v.toFixed(3)),
      scale: inst.root.scaling.x, rh: inst.node('mixamorig:RightHand').getAbsolutePosition().asArray().map(v => +v.toFixed(3)),
      lh: inst.node('mixamorig:LeftHand').getAbsolutePosition().asArray().map(v => +v.toFixed(3)),
      muzzle: an.weapon ? BABYLON.Vector3.TransformCoordinates(an.markers.muzzle, an.weapon.getWorldMatrix()).asArray().map(v => +v.toFixed(3)) : null,
      groups: Object.keys(inst.groups).length, tas: g ? g.targetedAnimations.length : 0 };
  };
  hud.textContent = inst.root.name + ' ' + clip + ' ' + w.name;
}
main().catch(e => { console.error(e); document.getElementById('hud').textContent = 'ERROR ' + e; });
