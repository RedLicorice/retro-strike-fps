import * as BABYLON from 'babylonjs';
import { ctx } from '../core/context';
import { MAP } from '../world/map/index';

/* Fog + far clip by quality and map: the city is ~400 m across, so it sees further, and the camera's far plane
   sits just past the fog wall (anything beyond is fully fogged anyway, so it is never drawn). */
export function applyFog(){
  if (!ctx.scene) return;
  const q = ctx.QUALITY, city = !!MAP.terrain;
  const s = ctx.scene;
  s.fogMode = BABYLON.Scene.FOGMODE_LINEAR;
  s.fogStart = city ? (q === 'low' ? 60 : 90) : (q === 'low' ? 22 : 32);
  s.fogEnd = city ? (q === 'low' ? 230 : 320) : (q === 'low' ? 95 : 140);
  s.fogColor = new BABYLON.Color3(.64, .50, .34);
  /* never below the sky dome's radius (240 m), or the dome gets clipped into a hole */
  if (ctx.cam) ctx.cam.maxZ = city ? Math.max(s.fogEnd + 25, 260) : 460;
}
