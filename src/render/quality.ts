import * as BABYLON from 'babylonjs';
import { ctx } from '../core/context';
import { $ } from '../core/dom';
import { Game } from '../game/index';
import { rendererName } from './engine';
import { GFX } from './postfx';
import { applyFog } from './fog';
import { MAP } from '../world/map/index';

/* ------------------------------ E5. QUALITY / BOOT / LOOP ------------------------------ */
export function applyQuality(q){
  ctx.QUALITY = q;
  if (!ctx.engine) return;
  const dpr = window.devicePixelRatio || 1;
  ctx.engine.setHardwareScalingLevel(q === 'low' ? Math.max(1.35, dpr * .8) : q === 'med' ? Math.max(.95, dpr * .55) : Math.max(.7, 1 / Math.max(1, dpr)));
  if (q === 'low' && Game.shadow){ Game.shadow.dispose(); Game.shadow = null; recompileFrozen(); }
  else if (q !== 'low' && !Game.shadow && Game.sun){
    const sg = new BABYLON.ShadowGenerator(q === 'high' ? 1536 : 768, Game.sun);
    sg.usePercentageCloserFiltering = true; sg.filteringQuality = BABYLON.ShadowGenerator.QUALITY_LOW;
    sg.darkness = .35; Game.shadow = sg;
    for (const m of MAP.meshes) try { sg.addShadowCaster(m); } catch (e){ break; }
    recompileFrozen();
  }
  applyFog();
  if (typeof GFX !== 'undefined' && GFX.pipe) GFX.rebuild();
  else if (typeof GFX !== 'undefined') GFX.init();
  /* was inferred from getCaps().maxTextureSize, which reported WEBGL2 on a WebGPU device */
  $('renName').textContent = rendererName(ctx.engine) + ' • ' + Math.round(100 / ctx.engine.getHardwareScalingLevel()) + '%';
}

/* Frozen materials never re-check their defines, so after a shadow generator comes or goes they keep a shader
   that samples a shadow map that no longer exists and silently stop drawing. Unfreeze everything that was
   frozen, let it recompile for a few frames, then freeze it again. */
function recompileFrozen(){
  const sc = ctx.scene; if (!sc) return;
  const frozen = sc.materials.filter(m => m.isFrozen);
  for (const m of frozen){ m.unfreeze(); m.markAsDirty(BABYLON.Material.AllDirtyFlag); }
  let n = 0;
  const obs = sc.onAfterRenderObservable.add(() => {
    if (++n < 4) return;
    sc.onAfterRenderObservable.remove(obs);
    for (const m of frozen) if (sc.materials.includes(m)) m.freeze();
  });
}
