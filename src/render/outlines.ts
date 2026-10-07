import * as BABYLON from 'babylonjs';
import { ctx } from '../core/context';

/* Team outlines: a plain silhouette border, thin, outer edge only.
   1. A mask target renders outlined bodies in flat team colour, depth-tested against everything else
      (world, other bodies, viewmodel) drawn flat black, so hidden parts leave no mask: no wallhack, and
      the viewmodel (drawn after a depth clear) paints over bodies behind it.
   2. A post-process colours only pixels *outside* the mask that touch it within OUTLINE_PX. The mask is
      rendered at MASK_RATIO of screen size with bilinear sampling, so fine silhouette noise (finger gaps,
      straps, the gun's thin profile) blurs away into the broad body shape before the edge pass ever sees
      it — the contour traces the outer body, not every small concavity a full-res mask would catch.
      Inner detail (gear, limbs, overlapping meshes) never produces a line either way, since the whole
      body is one flat colour. */
export const OUTLINE_PX = 1;
const MASK_RATIO = .4;
const COLORS = { enemy: new BABYLON.Color3(.95, .12, .1), ally: new BABYLON.Color3(.2, .55, 1) };

BABYLON.Effect.ShadersStore['rsOutlineFragmentShader'] = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform sampler2D maskSampler;
uniform vec2 texel;
uniform float radius;
void main(void){
  vec4 c = texture2D(textureSampler, vUV);
  vec4 me = texture2D(maskSampler, vUV);
  if (me.a > .5 && (max(me.r, me.b) > .2 || me.g > .5)){ gl_FragColor = c; return; }   /* on a body, or on the viewmodel */
  vec4 o = vec4(0.);
  for (int i = 0; i < 8; i++){
    float a = float(i) * .7853982;
    vec4 m = texture2D(maskSampler, vUV + vec2(cos(a), sin(a)) * texel * radius);
    if (m.a > .5 && max(m.r, m.b) > .2) o = m;
  }
  gl_FragColor = o.a > .5 ? vec4(o.rgb, c.a) : c;
}`;

type Kind = 'enemy' | 'ally';

export const Outlines = {
  rtt: null as BABYLON.RenderTargetTexture | null,
  pp: null as BABYLON.PostProcess | null,
  mats: null as null | { enemy: BABYLON.StandardMaterial; ally: BABYLON.StandardMaterial; hide: BABYLON.StandardMaterial; front: BABYLON.StandardMaterial },
  cam: null as BABYLON.Camera | null,
  entries: [] as Array<[string, Kind, BABYLON.AbstractMesh[]]>,

  init(){
    if (!ctx.scene || !ctx.cam) return false;
    if (this.rtt && this.cam === ctx.cam) return true;
    this.dispose();
    const sc = ctx.scene;
    const flat = (name: string, col: BABYLON.Color3 | null) => {
      const m = new BABYLON.StandardMaterial(name, sc);
      m.disableLighting = true; m.fogEnabled = false;
      m.diffuseColor = BABYLON.Color3.Black(); m.specularColor = BABYLON.Color3.Black();
      m.emissiveColor = col || BABYLON.Color3.Black();
      return m;
    };
    this.mats = { enemy: flat('ol_enemy', COLORS.enemy), ally: flat('ol_ally', COLORS.ally), hide: flat('ol_hide', null), front: flat('ol_front', new BABYLON.Color3(0, 1, 0)) };
    const rtt = new BABYLON.RenderTargetTexture('outlineMask', { ratio: MASK_RATIO }, sc, false, true, BABYLON.Constants.TEXTURETYPE_UNSIGNED_BYTE, false, BABYLON.Texture.BILINEAR_SAMPLINGMODE);
    rtt.clearColor = new BABYLON.Color4(0, 0, 0, 0);
    rtt.activeCamera = ctx.cam;
    rtt.renderList = [];
    rtt.renderParticles = false; rtt.renderSprites = false;
    rtt.skipInitialClear = false;
    sc.customRenderTargets.push(rtt);
    this.rtt = rtt;
    const pp = new BABYLON.PostProcess('outline', 'rsOutline', ['texel', 'radius'], ['maskSampler'], 1, ctx.cam, BABYLON.Texture.NEAREST_SAMPLINGMODE, ctx.engine);
    pp.onApply = e => {
      e.setTexture('maskSampler', rtt);
      e.setFloat2('texel', 1 / Math.max(1, rtt.getSize().width), 1 / Math.max(1, rtt.getSize().height));
      e.setFloat('radius', OUTLINE_PX);
    };
    this.pp = pp; this.cam = ctx.cam;
    return true;
  },

  /* entries: [id, kind, meshes] for every body to outline this frame */
  sync(entries: Array<[string, Kind, BABYLON.AbstractMesh[]]>){
    if (!this.init()) return;
    this.entries = entries;
    const rtt = this.rtt, list: BABYLON.AbstractMesh[] = [];
    const masked = new Set<BABYLON.AbstractMesh>();
    for (const [, kind, meshes] of entries) for (const m of meshes){
      rtt.setMaterialForRendering(m, this.mats[kind]); list.push(m); masked.add(m);
    }
    /* everything else opaque occludes (flat black); with nothing to outline the pass is just a clear */
    if (list.length) for (const m of ctx.scene.meshes){
      if (masked.has(m) || !m.isEnabled() || !m.isVisible || m.infiniteDistance) continue;
      const mat = m.material;
      if (!mat || mat.needAlphaBlending() || !m.getTotalVertices()) continue;
      /* viewmodel (group 1) is tagged green so no outline is drawn across the gun */
      rtt.setMaterialForRendering(m, m.renderingGroupId > 0 ? this.mats.front : this.mats.hide);
      /* instances draw through their (hidden) source mesh, which is where the pass looks up the override */
      if (m instanceof BABYLON.InstancedMesh) rtt.setMaterialForRendering(m.sourceMesh, this.mats.hide);
      list.push(m);
    }
    rtt.renderList = list;
  },

  clear(){ this.entries = []; if (this.rtt) this.rtt.renderList = []; },

  dispose(){
    if (this.pp){ this.pp.dispose(this.cam || undefined); this.pp = null; }
    if (this.rtt){
      const i = ctx.scene ? ctx.scene.customRenderTargets.indexOf(this.rtt) : -1;
      if (i >= 0) ctx.scene.customRenderTargets.splice(i, 1);
      this.rtt.dispose(); this.rtt = null;
    }
    if (this.mats){ for (const k in this.mats) this.mats[k].dispose(); this.mats = null; }
    this.cam = null;
  }
};
