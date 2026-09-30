import * as BABYLON from 'babylonjs';
import { ctx } from '../core/context';
import { $ } from '../core/dom';
import { Game } from '../game/index';
import { GFX } from './postfx';
import { MAP } from '../world/map/index';

/* ------------------------------ E5. QUALITY / BOOT / LOOP ------------------------------ */
export function applyQuality(q){
  ctx.QUALITY = q;
  if (!ctx.engine) return;
  const dpr = window.devicePixelRatio || 1;
  ctx.engine.setHardwareScalingLevel(q === 'low' ? Math.max(1.35, dpr * .8) : q === 'med' ? Math.max(.95, dpr * .55) : Math.max(.7, 1 / Math.max(1, dpr)));
  if (q === 'low' && Game.shadow){ Game.shadow.dispose(); Game.shadow = null; }
  else if (q !== 'low' && !Game.shadow && Game.sun){
    const sg = new BABYLON.ShadowGenerator(q === 'high' ? 1536 : 768, Game.sun);
    sg.usePercentageCloserFiltering = true; sg.filteringQuality = BABYLON.ShadowGenerator.QUALITY_LOW;
    sg.darkness = .35; Game.shadow = sg;
    for (const m of MAP.meshes) try { sg.addShadowCaster(m); } catch (e){ break; }
  }
  if (ctx.scene){
    ctx.scene.fogMode = BABYLON.Scene.FOGMODE_LINEAR;
    ctx.scene.fogStart = q === 'low' ? 22 : 32;
    ctx.scene.fogEnd = q === 'low' ? 95 : 140;
    ctx.scene.fogColor = new BABYLON.Color3(.64, .50, .34);
  }
  if (typeof GFX !== 'undefined' && GFX.pipe) GFX.rebuild();
  else if (typeof GFX !== 'undefined') GFX.init();
  $('renName').textContent = (ctx.engine.getCaps().maxTextureSize > 4096 ? 'WEBGL2' : 'WEBGL') + ' • ' + Math.round(100 / ctx.engine.getHardwareScalingLevel()) + '%';
}
