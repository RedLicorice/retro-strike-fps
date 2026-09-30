import * as BABYLON from 'babylonjs';
import { ctx } from '../core/context';
import { TX } from './textures';

/* ------------------------------ A4. MATERIALS ------------------------------ */
export const MAT = {
  m: {} as Record<string, any>,
  std(name: string, tex?: BABYLON.Texture, spec?: number, emis?: BABYLON.Color3, tile?: number, bump?: BABYLON.Texture){
    const mt = new BABYLON.StandardMaterial(name, ctx.scene);
    if (tex){ mt.diffuseTexture = tex; tex.uScale = tex.vScale = tile || 1; }
    const sp = spec || .06;
    mt.specularColor = new BABYLON.Color3(sp, sp * .95, sp * .85);
    mt.specularPower = sp > .18 ? 64 : 28;
    mt.ambientColor = new BABYLON.Color3(.48, .46, .40);
    mt.emissiveColor = emis || new BABYLON.Color3(.03, .028, .02);
    if (bump){ mt.bumpTexture = bump; bump.level = .7; bump.uScale = bump.vScale = tile || 1; mt.invertNormalMapY = false; }
    mt.freeze(); this.m[name] = mt; return mt;
  },
  flat(name, col, emis, spec){
    const mt = new BABYLON.StandardMaterial(name, ctx.scene);
    mt.diffuseColor = col instanceof BABYLON.Color3 ? col : new BABYLON.Color3(col[0], col[1], col[2]);
    mt.specularColor = new BABYLON.Color3(spec === undefined ? .08 : spec, spec === undefined ? .08 : spec, spec === undefined ? .07 : spec);
    mt.ambientColor = new BABYLON.Color3(.4, .38, .34);
    if (emis) mt.emissiveColor = emis instanceof BABYLON.Color3 ? emis : new BABYLON.Color3(emis[0], emis[1], emis[2]);
    mt.freeze(); this.m[name] = mt; return mt;
  },
  init(){
    ctx.scene.blockMaterialDirtyMechanism = true;
    ctx.scene.ambientColor = new BABYLON.Color3(.42, .38, .32);
    const concD = TX.concrete('#9a9686', 'rgba(40,38,30,.5)');
    const concN = TX.concrete('#6a6c62', 'rgba(20,22,18,.6)');
    const metD  = TX.metal('#6a7268', '#7c8478', '#b0b8ae');
    const corD  = TX.corrug();
    const flrD  = TX.floor();
    this.std('concrete', TX.mk('t_conc', 512, concD, false), .08, null, 1, TX.mkNorm('n_conc', 256, concD));
    this.std('concDark', TX.mk('t_concd', 512, concN, false), .06, null, 1, TX.mkNorm('n_concd', 256, concN));
    this.std('metal',    TX.mk('t_metal', 512, metD, false), .42, null, 1, TX.mkNorm('n_metal', 256, metD));
    this.std('rusty',    TX.mk('t_corr', 512, corD, false), .18, null, 1, TX.mkNorm('n_corr', 256, corD));
    this.std('crate',    TX.mk('t_crate', 512, TX.crate(), false), .07, null, 1);
    this.std('floor',    TX.mk('t_floor', 512, flrD, false), .10, null, 1, TX.mkNorm('n_floor', 256, flrD));
    this.std('sand',     TX.mk('t_sand', 512, TX.sand(), false), .04, null, 1);
    this.std('hazard',   TX.mk('t_haz', 256, TX.hazard(), false), .16, null, 1);
    this.flat('trim', [.18, .19, .16]);
    this.flat('glass', [.28, .38, .42], [.08, .14, .16], .65);
    this.flat('lamp', [.12, .1, .06], [1.6, 1.2, .55]);
    this.flat('glowRed', [.2, 0, 0], [1.4, .22, .08]);
    this.flat('glowBlue', [0, .1, .2], [.35, .75, 1.3]);
    this.flat('hill', [.18, .16, .12], [.04, .035, .025], .02);
    this.flat('sunDisc', [.2, .12, .04], [2.2, 1.4, .45], 0);
    /* guns */
    this.std('gunSteel', TX.mk('t_gmetal', 64, TX.metal('#3a3d40', '#454a4d', '#6d757a'), false), .35, null, 1);
    this.std('gunPoly',  TX.mk('t_gpoly', 64, TX.concrete('#26282a', 'rgba(0,0,0,.5)'), false), .12, null, 1);
    this.std('gunWood',  TX.mk('t_gwood', 64, TX.crate(), false), .1, null, 1);
    this.std('gunTan',   TX.mk('t_gtan', 64, TX.concrete('#8a7c5c', 'rgba(50,42,26,.5)'), false), .12, null, 1);
    this.flat('gunGrip', [.13, .12, .11], null, .04);
    this.flat('dotRed', [.2, 0, 0], [1, .12, .06]);
    this.flat('lens', [.1, .16, .2], [.14, .3, .38], .8);
    this.flat('hand', [.28, .24, .19], null, .02);
    /* actors */
    this.flat('skin', [.62, .48, .38], null, .03);
    this.flat('teamA', [.42, .16, .14], null, .05);
    this.flat('teamB', [.14, .26, .44], null, .05);
    this.flat('gear', [.17, .18, .15], null, .04);
    this.flat('monster', [.36, .42, .28], null, .03);
    this.flat('monDark', [.2, .22, .16], null, .02);
    this.flat('eyeGlow', [.2, 0, 0], [1, .35, .1]);
    this.flat('shell', [.6, .5, .2], [.12, .09, .02], .6);
    /* fx */
    const add = (nm, tex, col) => {
      const mt = new BABYLON.StandardMaterial(nm, ctx.scene);
      mt.diffuseTexture = tex; mt.emissiveColor = col || new BABYLON.Color3(1, 1, 1);
      mt.diffuseColor = new BABYLON.Color3(0, 0, 0); mt.specularColor = new BABYLON.Color3(0, 0, 0);
      mt.disableDepthWrite = true; mt.backFaceCulling = false;
      mt.alphaMode = BABYLON.Engine.ALPHA_ADD; mt.freeze(); this.m[nm] = mt; return mt;
    };
    add('fxSpark', TX.mk('t_part', 64, TX.particle(false), true), new BABYLON.Color3(1, .82, .45));
    add('fxSmoke', TX.mk('t_smoke', 64, TX.smoke(), true), new BABYLON.Color3(.42, .4, .36));
    add('fxFlash', TX.mk('t_flash', 96, TX.flash(), true), new BABYLON.Color3(1, .85, .5));
    add('fxBlood', TX.mk('t_blood', 64, TX.blood(), true), new BABYLON.Color3(.62, .05, .06));
    add('fxFire',  TX.mk('t_part2', 64, TX.particle(true), true), new BABYLON.Color3(1, .5, .14));
    const dm = new BABYLON.StandardMaterial('fxDecal', ctx.scene);
    dm.diffuseTexture = TX.mk('t_decal', 64, TX.decal(), true); dm.diffuseTexture.hasAlpha = true;
    dm.emissiveColor = new BABYLON.Color3(.55, .55, .5); dm.opacityTexture = dm.diffuseTexture;
    dm.specularColor = new BABYLON.Color3(0, 0, 0); dm.backFaceCulling = false; dm.freeze(); this.m.fxDecal = dm;
    const bm = new BABYLON.StandardMaterial('fxBDecal', ctx.scene);
    bm.diffuseTexture = TX.mk('t_bdecal', 64, TX.bdecal(), true); bm.diffuseTexture.hasAlpha = true;
    bm.emissiveColor = new BABYLON.Color3(.4, .03, .05); bm.opacityTexture = bm.diffuseTexture;
    bm.specularColor = new BABYLON.Color3(0, 0, 0); bm.backFaceCulling = false; bm.freeze(); this.m.fxBDecal = bm;
    this.flat('tracer', [.4, .3, .1], [1, .78, .35], .1);
    ctx.scene.blockMaterialDirtyMechanism = false;
  }
};
