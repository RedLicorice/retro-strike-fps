import type { RigRoot } from '../core/types';
import * as BABYLON from 'babylonjs';
import { ctx } from '../core/context';
import { V3 } from '../core/math';
import { boxM } from '../render/gunModels';
import { MAT } from '../render/materials';

/* =====================================================================
   D) ACTORS / COMBAT / BOT AI / HORDE / MATCH / HUD
   ===================================================================== */

/* ------------------------------ D1. ACTOR RIGS ------------------------------ */
export function buildRig(kind, team){
  const root: RigRoot = new BABYLON.TransformNode('rig', ctx.scene);
  const M = MAT.m;
  const uni = kind === 'mon' ? M.monster : (team === 0 ? M.teamA : M.teamB);
  const dark = kind === 'mon' ? M.monDark : M.gear;
  const p: Record<string, any> = {};
  const B = (w, h, d, x, y, z, m, name) => { const b = boxM(w, h, d, root, m, x, y, z); b.name = name || 'b'; p[name] = b; return b; };
  if (kind === 'mon'){
    B(.22, .78, .22, -.15, .39, 0, dark, 'legL'); B(.22, .78, .22, .15, .39, 0, dark, 'legR');
    B(.58, .60, .34, 0, 1.02, .04, uni, 'torso');
    B(.30, .30, .34, 0, 1.42, .10, uni, 'head');
    B(.07, .05, .03, -.08, 1.46, .27, M.eyeGlow, 'eyeL'); B(.07, .05, .03, .08, 1.46, .27, M.eyeGlow, 'eyeR');
    B(.15, .70, .17, -.36, 1.06, .18, uni, 'armL'); B(.15, .70, .17, .36, 1.06, .18, uni, 'armR');
    p.armL.rotation.x = -.9; p.armR.rotation.x = -.9;
    p.armL.setPivotPoint(V3(0, .34, 0)); p.armR.setPivotPoint(V3(0, .34, 0));
    p.legL.setPivotPoint(V3(0, .38, 0)); p.legR.setPivotPoint(V3(0, .38, 0));
    root._h = 1.72; root._headY = 1.28;
  } else {
    B(.19, .84, .21, -.12, .42, 0, dark, 'legL'); B(.19, .84, .21, .12, .42, 0, dark, 'legR');
    B(.20, .16, .22, -.12, .08, 0, M.gunGrip, 'bootL'); B(.20, .16, .22, .12, .08, 0, M.gunGrip, 'bootR');
    B(.50, .58, .28, 0, 1.13, 0, uni, 'torso');
    B(.44, .20, .26, 0, 1.42, 0, dark, 'vest');
    B(.24, .24, .24, 0, 1.62, 0, M.skin, 'head');
    B(.27, .12, .27, 0, 1.72, 0, dark, 'helm');
    B(.20, .07, .06, 0, 1.63, .12, M.gunGrip, 'goggle');
    B(.14, .52, .15, -.32, 1.16, .02, uni, 'armL'); B(.14, .52, .15, .32, 1.16, .02, uni, 'armR');
    B(.13, .18, .13, -.32, .86, .06, M.skin, 'handL'); B(.13, .18, .13, .32, .86, .10, M.skin, 'handR');
    p.armL.setPivotPoint(V3(0, .26, 0)); p.armR.setPivotPoint(V3(0, .26, 0));
    p.legL.setPivotPoint(V3(0, .42, 0)); p.legR.setPivotPoint(V3(0, .42, 0));
    p.handGrip = p.handR;
    root._h = 1.78; root._headY = 1.50;
  }
  root.getChildMeshes().forEach(m => { m.isPickable = false; m.receiveShadows = true; });
  return { root: root, p: p };
}
