import * as BABYLON from 'babylonjs';
import { ctx } from '../core/context';

/* Team outlines: a screen-space silhouette (outer border only, no inner detail), fixed pixel width,
   hidden behind walls. One layer per colour. */
export const OUTLINE_PX = 1.5;
const COLORS = { enemy: new BABYLON.Color3(.95, .12, .1), ally: new BABYLON.Color3(.2, .55, 1) };

export const Outlines = {
  layers: null as null | Record<'enemy' | 'ally', BABYLON.SelectionOutlineLayer>,
  key: '',

  init(){
    if (this.layers || !ctx.scene) return;
    const mk = (kind: 'enemy' | 'ally') => {
      const l = new BABYLON.SelectionOutlineLayer('outline_' + kind, ctx.scene);
      l.outlineColor = COLORS[kind]; l.outlineThickness = OUTLINE_PX;
      l.occlusionStrength = 1;             /* fully hidden when something is in front: no wallhack */
      return l;
    };
    this.layers = { enemy: mk('enemy'), ally: mk('ally') };
  },

  /* entries: [id, kind, meshes]; selections are rebuilt only when the set actually changes */
  sync(entries: Array<[string, 'ally' | 'enemy', BABYLON.AbstractMesh[]]>){
    this.init(); if (!this.layers) return;
    const key = entries.map(e => e[0] + ':' + e[1] + ':' + e[2].length).join('|');
    if (key === this.key) return;
    this.key = key;
    this.layers.enemy.clearSelection(); this.layers.ally.clearSelection();
    for (const [, kind, meshes] of entries) if (meshes.length) this.layers[kind].addSelection(meshes);
  },

  clear(){ this.key = ''; if (this.layers){ this.layers.enemy.clearSelection(); this.layers.ally.clearSelection(); } }
};
