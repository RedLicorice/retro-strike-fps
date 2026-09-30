import * as BABYLON from 'babylonjs';
import { V3 } from '../core/math';
import { Models } from '../assets/models';
import { MAT } from './materials';
import { boxM } from './gunModels';

/* First-person weapon: the GLB plus low-poly gloves/sleeves, drawn in rendering group 1 (over the world).
   Everything is in the weapon's own frame: grip at origin, muzzle toward +Z, +Y up. */
export interface ViewWeapon {
  root: BABYLON.TransformNode;
  muzzle: BABYLON.Vector3;
  sight: BABYLON.Vector3;
}

export function buildViewWeapon(def: any, gloves = true): ViewWeapon | null {
  const model = Models.weapon(def.id, true);
  const mk = Models.markers[def.id];
  if (!model || !mk) return null;
  const root = new BABYLON.TransformNode('vm_' + def.id, model.getScene());
  model.parent = root;
  const glove = armMat('vmGlove', [.07, .07, .065]), sleeve = armMat('vmSleeve', [.085, .09, .065]);

  if (gloves){
  /* right hand wraps the grip; forearm runs back toward the lower-right of the screen */
    boxM(.052, .085, .075, root, glove, .004, -.03, -.005, -.3);
    boxM(.03, .028, .05, root, glove, -.018, .012, .03, 0, .35);                         /* trigger finger */
    boxM(.06, .06, .24, root, sleeve, .03, -.09, -.16, -.55, -.12);

    if (mk.fore){
      /* support hand under the fore-end, arm angling in from the left */
      const f = mk.fore;
      boxM(.058, .05, .095, root, glove, f.x - .004, f.y - .028, f.z, .08);
      boxM(.058, .058, .24, root, sleeve, f.x - .085, f.y - .1, f.z - .15, -.44, .64);
    } else {
      /* pistols: support hand cups the firing hand */
      boxM(.05, .07, .07, root, glove, -.03, -.05, .01, -.25, .2);
      boxM(.06, .06, .24, root, sleeve, -.1, -.1, -.15, -.5, .5);
    }
  }
  root.getChildMeshes().forEach(m => { m.renderingGroupId = 1; m.isPickable = false; });
  return { root, muzzle: mk.muzzle.clone(), sight: mk.sight.clone() };
}

function armMat(name: string, c: number[]){
  const scene = MAT.m.hand.getScene();
  let m = scene.getMaterialByName(name) as BABYLON.StandardMaterial;
  if (!m){
    m = new BABYLON.StandardMaterial(name, scene);
    m.diffuseColor = new BABYLON.Color3(c[0], c[1], c[2]); m.specularColor = new BABYLON.Color3(.04, .04, .04);
    m.emissiveColor = new BABYLON.Color3(c[0] * .35, c[1] * .35, c[2] * .35);
  }
  return m;
}

/* hip / aim placement of the grip relative to the camera, by weapon class.
   The weapon models carry no sight bones, so aiming raises the gun toward the centre and zooms;
   it does not line up iron sights. */
export function viewPlacement(def: any){
  const pistol = def.slot === 1;
  return {
    hip: pistol ? V3(.14, -.16, .38) : V3(.16, -.19, .34),
    ads: pistol ? V3(.05, -.12, .36) : V3(.07, -.14, .30)
  };
}
