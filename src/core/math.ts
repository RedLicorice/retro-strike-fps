import * as BABYLON from 'babylonjs';

/* =====================================================================
   RETROSTRIKE — A PS2-era procedural CQB FPS template
   Babylon.js + WebRTC P2P + vanilla JS.  Modules:
   A) UTIL / SAVE / AUDIO / TEXTURES / WEAPON DATA / GUN BUILDER
   B) PROCEDURAL ARENA GENERATOR + COLLISION + MINIMAP
   C) FX / INPUT / PLAYER CONTROLLER / WEAPON RUNTIME
   D) ACTORS / BOT AI / HORDE / MATCH FLOW / HUD
   E) WEBRTC P2P / MENUS / TOUCH / BOOT + MAIN LOOP
   ===================================================================== */

/* ------------------------------ A0. UTIL ------------------------------ */
export const PI = Math.PI, TAU = PI * 2, DEG = PI / 180;

export const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);

export const lerp  = (a, b, t) => a + (b - a) * t;

export const damp  = (a, b, l, dt) => lerp(a, b, 1 - Math.exp(-l * dt));

export const rnd   = (a = 1, b = 0) => b + Math.random() * (a - b);

export const rndi  = (n) => (Math.random() * n) | 0;

export const pick  = (a) => a[(Math.random() * a.length) | 0];

export function sHash(str){ let h = 2166136261 >>> 0; for (let i = 0; i < str.length; i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }

export function rng(seed){ let a = (seed >>> 0) || 1; return function(){ a += 0x6D2B79F5; a = Math.imul(a ^ (a >>> 15), 1 | a); a ^= a + Math.imul(a ^ (a >>> 7), 61 | a); return ((a ^ (a >>> 14)) >>> 0) / 4294967296; }; }

export function makeSeed(){ const C = 'ACDEFGHJKLMNPQRTUVWXY3479'; let s = ''; for (let i = 0; i < 8; i++) s += C[(Math.random() * C.length) | 0]; return s; }

export const V3 = (x, y, z) => new BABYLON.Vector3(x, y, z);

export function v3len(x, y, z){ return Math.sqrt(x * x + y * y + z * z); }

/* AABB slab raycast -> t or -1 */
export function rayAABB(ox, oy, oz, dx, dy, dz, b, maxD){
  let t0 = 0, t1 = maxD;
  const mnx = b.x0, mxx = b.x1, mny = b.y0, mxy = b.y1, mnz = b.z0, mzz = b.z1;
  for (let ax = 0; ax < 3; ax++){
    const o = ax === 0 ? ox : ax === 1 ? oy : oz, d = ax === 0 ? dx : ax === 1 ? dy : dz;
    const mn = ax === 0 ? mnx : ax === 1 ? mny : mnz, mx = ax === 0 ? mxx : ax === 1 ? mxy : mzz;
    if (Math.abs(d) < 1e-8){ if (o < mn || o > mx) return -1; continue; }
    let ta = (mn - o) / d, tb = (mx - o) / d; if (ta > tb){ const t = ta; ta = tb; tb = t; }
    if (ta > t0) t0 = ta; if (tb < t1) t1 = tb;
    if (t0 > t1) return -1;
  }
  return t0 >= 0 ? t0 : (t1 >= 0 && t0 < 0 ? 0 : -1);
}

export function quatFromNormal(n){
  const up = Math.abs(n.y) > 0.94 ? V3(0, 0, 1) : V3(0, 1, 0);
  const r = BABYLON.Vector3.Cross(up, n); r.normalize();
  const u = BABYLON.Vector3.Cross(n, r); u.normalize();
  return BABYLON.Quaternion.FromRotationMatrix(BABYLON.Matrix.FromValues(
    r.x, r.y, r.z, 0, u.x, u.y, u.z, 0, n.x, n.y, n.z, 0, 0, 0, 0, 1));
}
