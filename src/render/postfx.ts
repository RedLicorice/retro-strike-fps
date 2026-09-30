import * as BABYLON from 'babylonjs';
import { ctx } from '../core/context';
import { V3 } from '../core/math';
import { TX } from './textures';
import { applyFog } from './fog';

/* ------------------------------ D6b. POST / LIGHTING PIPELINE ------------------------------ */
export const GFX = {
  pipe: null, ssao: null, glow: null, dustPs: null as BABYLON.ParticleSystem | null,
  init(){
    ctx.scene.ambientColor = new BABYLON.Color3(.46, .40, .32);
    ctx.scene.clearColor = new BABYLON.Color4(.58, .44, .28, 1);
    applyFog();
    if (!this.pipe) this.rebuild();
  },
  rebuild(){
    const q = ctx.QUALITY;
    try { if (this.pipe){ this.pipe.dispose(); this.pipe = null; } } catch (e){}
    try { if (this.ssao){ this.ssao.dispose(); this.ssao = null; } } catch (e){}
    try { if (this.glow){ this.glow.dispose(); this.glow = null; } } catch (e){}
    try {
      if (typeof BABYLON.DefaultRenderingPipeline === 'function'){
        let p = null;
        try { p = new BABYLON.DefaultRenderingPipeline('pipe', false, ctx.scene, [ctx.cam]); } catch (e){}
        if (p){
          p.fxaaEnabled = q !== 'low';
          p.samples = 1;
          p.bloomEnabled = q !== 'low';
          p.bloomThreshold = .78; p.bloomWeight = .22; p.bloomKernel = q === 'high' ? 32 : 20; p.bloomScale = .6;
          p.imageProcessingEnabled = true;
          p.imageProcessing.contrast = 1.18;
          p.imageProcessing.exposure = 1.22;
          p.imageProcessing.toneMappingEnabled = true;
          p.imageProcessing.vignetteEnabled = true;
          p.imageProcessing.vignetteWeight = 1.8;
          p.imageProcessing.vignetteColor = new BABYLON.Color4(.06, .04, .02, 1);
          p.sharpenEnabled = q === 'high';
          if (p.sharpen) p.sharpen.edgeAmount = .18;
          p.grainEnabled = false;
          this.pipe = p;
        }
      }
    } catch (e){ console.warn('pipeline', e); }
    if (q === 'high' && typeof BABYLON.SSAO2RenderingPipeline === 'function'){
      try {
        const s = new BABYLON.SSAO2RenderingPipeline('ssao', ctx.scene, { ssaoRatio: .5, blurRatio: .5 }, [ctx.cam]);
        s.totalStrength = 1.05; s.base = .35; s.radius = 1.8; s.expensiveBlur = false; s.samples = 12;
        this.ssao = s;
      } catch (e){}
    }
    if (q !== 'low' && typeof BABYLON.GlowLayer === 'function'){
      try { const g = new BABYLON.GlowLayer('glow', ctx.scene, { blurKernelSize: 24 }); g.intensity = .55; this.glow = g; } catch (e){}
    }
  },
  dust(root){
    if (this.dustPs){ try { this.dustPs.dispose(); } catch (e){} this.dustPs = null; }
    if (ctx.QUALITY === 'low') return;
    const ps = new BABYLON.ParticleSystem('atmo', ctx.QUALITY === 'high' ? 80 : 40, ctx.scene);
    ps.particleTexture = TX.mk('t_part2', 64, TX.particle(true), true);
    ps.emitter = V3(0, 6, 0);
    ps.minEmitBox = V3(-28, 0, -28); ps.maxEmitBox = V3(28, 10, 28);
    ps.color1 = new BABYLON.Color4(.9, .72, .45, .18); ps.color2 = new BABYLON.Color4(.7, .55, .35, .08);
    ps.colorDead = new BABYLON.Color4(.5, .4, .25, 0);
    ps.minSize = .15; ps.maxSize = .7; ps.minLifeTime = 4; ps.maxLifeTime = 9;
    ps.emitRate = ctx.QUALITY === 'high' ? 14 : 7; ps.gravity = V3(0, .05, 0);
    ps.direction1 = V3(-.4, -.1, -.2); ps.direction2 = V3(.4, .2, .4);
    ps.minEmitPower = .15; ps.maxEmitPower = .5;
    ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
    ps.start(); this.dustPs = ps;
  }
};
