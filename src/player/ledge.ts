import { clamp } from '../core/math';
import { Models } from '../assets/models';
import { MAP } from '../world/map/index';

/* Ledge grabs, hangs and climbs (Mixamo "Braced Hang" set).
   Every hang clip is exported holding the ledge at the same point relative to its root (the idle's grip,
   tools/asset-pipeline/export_anims.py), so one anchor per ledge places them all. The clips also carry sampled
   head / hips / feet / grip paths ([forward, left, up] metres), used for the hitbox, the first-person eye and to
   land the body where the animation ends. */

export interface Ledge {
  ex: number; ey: number; ez: number;      /* edge point: on the wall face, at the top surface */
  yaw: number;                             /* facing into the wall */
  nx: number; nz: number;                  /* wall normal, pointing out toward the climber */
  box: any; lo: number; hi: number;        /* the ledge's box and its extent along the face */
}

const IN = .03, DOWN = .04;                /* fingers just over the edge, knuckles just under the top */

export type Flu = [number, number, number];

/* sampled body path of a clip at time t (clamped; loops wrap) */
export function trackAt(clip: string, key: 'head' | 'hips' | 'feet' | 'grip', t: number): Flu {
  const c = Models.clips[clip] as any, tr = c && c.track;
  if (!tr) return [0, 0, key === 'head' ? 1.6 : key === 'hips' ? .95 : key === 'grip' ? 2.05 : 0];
  const T: number[] = tr.t, P: Flu[] = tr[key];
  if (c.loop) t = ((t % c.dur) + c.dur) % c.dur;
  if (t <= T[0]) return P[0];
  if (t >= T[T.length - 1]) return P[P.length - 1];
  let i = 1; while (T[i] < t) i++;
  const a = (t - T[i - 1]) / Math.max(1e-6, T[i] - T[i - 1]), p = P[i - 1], q = P[i];
  return [p[0] + (q[0] - p[0]) * a, p[1] + (q[1] - p[1]) * a, p[2] + (q[2] - p[2]) * a];
}
export const clipDur = (clip: string) => (Models.clips[clip] && Models.clips[clip].dur) || 1;

/* character frame -> world, for a body facing `yaw` (Babylon LH: forward (sin, cos), left (-cos, sin)) */
export function toWorld(ox: number, oy: number, oz: number, yaw: number, v: Flu){
  const s = Math.sin(yaw), c = Math.cos(yaw);
  return { x: ox + s * v[0] - c * v[1], y: oy + v[2], z: oz + c * v[0] + s * v[1] };
}

/* rig root that puts the (shared) hang grip on the ledge edge */
export function hangRoot(L: Ledge){
  const g = trackAt('hang_idle', 'grip', 0);
  const s = Math.sin(L.yaw), c = Math.cos(L.yaw);
  const gx = L.ex + s * IN, gy = L.ey - DOWN, gz = L.ez + c * IN;
  return { x: gx - (s * g[0] - c * g[1]), y: gy - g[2], z: gz - (c * g[0] + s * g[1]) };
}

/* time a grab clip first has its hands on the ledge for good (the catch skips the leap before it) */
export function catchTime(clip: string){
  const c = Models.clips[clip] as any, tr = c && c.track; if (!tr) return 0;
  const G: Flu[] = tr.grip, end = G[G.length - 1];
  let k = G.length - 1;
  while (k > 0 && Math.hypot(G[k - 1][0] - end[0], G[k - 1][2] - end[2]) < .09) k--;
  return tr.t[k];
}

/* Best ledge in front of a body: a box top `hMin..hMax` above the feet, a face within `reach` of the body,
   facing it within ~50°, with a walkable top and room to crouch on it. */
export function findLedge(px: number, pz: number, feetY: number, yaw: number, r: number, hMin: number, hMax: number, reach: number): Ledge | null {
  const fx = Math.sin(yaw), fz = Math.cos(yaw), R = r + reach;
  let best: Ledge | null = null, bd = 1e9;
  for (const b of MAP.near(px - R, pz - R, px + R, pz + R).slice()){
    const h = b.y1 - feetY;
    if (h < hMin || h > hMax || b.y1 - b.y0 < .9) continue;              /* thin slabs have no wall to brace on */
    const cx = clamp(px, b.x0, b.x1), cz = clamp(pz, b.z0, b.z1);
    const dx = px - cx, dz = pz - cz, d = Math.hypot(dx, dz);
    if (d < 1e-3 || d > R) continue;
    let nx = 0, nz = 0;
    if (Math.abs(dx) >= Math.abs(dz)) nx = Math.sign(dx); else nz = Math.sign(dz);
    if (-(fx * nx + fz * nz) < .64) continue;
    const lo = nx ? b.z0 : b.x0, hi = nx ? b.z1 : b.x1;
    if (hi - lo < .9) continue;
    const u = clamp(nx ? pz : px, lo + .4, hi - .4);
    const ex = nx ? (nx > 0 ? b.x1 : b.x0) : u, ez = nz ? (nz > 0 ? b.z1 : b.z0) : u;
    if (!ledgeClear(ex, b.y1, ez, nx, nz)) continue;
    if (d < bd){ bd = d; best = { ex, ey: b.y1, ez, yaw: Math.atan2(-nx, -nz), nx, nz, box: b, lo, hi }; }
  }
  return best;
}

/* the top behind this edge point is the surface itself (nothing stacked on it) and a crouching body fits there */
export function ledgeClear(ex: number, ey: number, ez: number, nx: number, nz: number){
  const qx = ex - nx * .55, qz = ez - nz * .55;
  if (Math.abs(MAP.groundAt(qx, qz, ey + .1, .2) - ey) > .05) return false;
  if (MAP.headBlocked(qx, qz, ey, 1.25)) return false;
  if (MAP.headBlocked(ex - nx * .15, ez - nz * .15, ey, 1.0)) return false;
  return true;
}
