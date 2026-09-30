import * as BABYLON from 'babylonjs';
import { ctx } from '../core/context';
import { PI, V3 } from '../core/math';
import { MAT } from './materials';

/* ------------------------------ A6. PROCEDURAL GUN BUILDER ------------------------------ */
export function boxM(w, h, d, parent, mat, x, y, z, rx?, ry?, rz?, name?){
  const b = BABYLON.MeshBuilder.CreateBox(name || 'b', { width: w, height: h, depth: d }, ctx.scene);
  b.position.set(x || 0, y || 0, z || 0);
  if (rx || ry || rz) b.rotation.set(rx || 0, ry || 0, rz || 0);
  b.material = mat; b.parent = parent; b.isPickable = false; b.receiveShadows = false;
  return b;
}

export function cylM(r, h, parent, mat, x, y, z, rx, tess?){
  const c = BABYLON.MeshBuilder.CreateCylinder('cy', { diameter: r * 2, height: h, tessellation: tess || 7 }, ctx.scene);
  c.position.set(x || 0, y || 0, z || 0); if (rx) c.rotation.x = rx;
  c.material = mat; c.parent = parent; c.isPickable = false; return c;
}

/* grenade / throwable world + view mesh */
export function buildThrowable(id, view){
  const root = new BABYLON.TransformNode('th_' + id, ctx.scene), M = MAT.m;
  if (id === 'frag'){
    cylM(.035, .11, root, M.gunSteel, 0, 0, 0, 0, 8);
    boxM(.02, .03, .04, root, M.gunSteel, .03, .05, 0);
    cylM(.012, .03, root, M.gunPoly, 0, .07, 0, 0, 6);
    boxM(.075, .012, .02, root, M.gunSteel, .02, .055, 0, 0, 0, .5);
  } else if (id === 'flash'){
    cylM(.03, .12, root, M.gunTan, 0, 0, 0, 0, 8);
    cylM(.032, .02, root, M.gunSteel, 0, .04, 0, 0, 8);
    cylM(.012, .03, root, M.gunPoly, 0, .075, 0, 0, 6);
    boxM(.07, .01, .018, root, M.gunSteel, .02, .06, 0, 0, 0, .5);
  } else {
    cylM(.032, .13, root, M.glass, 0, 0, 0, 0, 7);
    cylM(.034, .05, root, M.gunTan, 0, -.03, 0, 0, 7);
    boxM(.05, .014, .05, root, M.hazard, 0, .072, 0);
    cylM(.006, .03, root, M.gunSteel, 0, .088, 0, 0, 5);
  }
  if (view) boxM(.058, .07, .09, root, M.hand, 0, -.06, -.01, .12);
  root.getChildMeshes().forEach(m => { m.renderingGroupId = view ? 1 : 0; });
  return root;
}
