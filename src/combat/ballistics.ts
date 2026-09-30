import { clamp, rnd, TAU, v3len } from '../core/math';
import type { TraceHit } from '../core/types';

/* Shared shot maths for the local player, bots and host-side validation of client shots. */

/* damage of one projectile at the hit distance: falloff toward `range`, then the headshot multiplier */
export function shotDamage(w: any, hit: TraceHit): number {
  const fo = w.fo === undefined ? .38 : w.fo, fmin = w.fmin === undefined ? .55 : w.fmin;
  let dmg = w.dmg * clamp(1 - (hit.t / w.range) * fo, fmin, 1);
  if (hit.head) dmg *= w.hs;
  return dmg;
}

/* One direction per projectile inside a cone of `spread` radians around (dx,dy,dz).
   `right`/`up` span the cone; for rifles pass pellets = 1. Pellets use a uniform disc so the pattern is even. */
export function spreadDirs(dx: number, dy: number, dz: number, spread: number, pellets: number,
                           right: { x: number; y: number; z: number }, up: { x: number; y: number; z: number }): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < pellets; i++){
    const a = rnd(TAU), r = Math.sqrt(Math.random()) * spread;
    let x = dx + (right.x * Math.cos(a) + up.x * Math.sin(a)) * r;
    let y = dy + (right.y * Math.cos(a) + up.y * Math.sin(a)) * r;
    let z = dz + (right.z * Math.cos(a) + up.z * Math.sin(a)) * r;
    const l = v3len(x, y, z); out.push([x / l, y / l, z / l]);
  }
  return out;
}

/* Sum pellet hits per victim so a shotgun blast is one damage event (one hitmarker, one kill credit). */
export function groupHits(hits: Array<TraceHit | null>, w: any){
  const per = new Map<any, { dmg: number; head: boolean; hit: TraceHit; n: number }>();
  for (const h of hits){
    if (!h || !h.actor) continue;
    const e = per.get(h.actor) || { dmg: 0, head: false, hit: h, n: 0 };
    e.dmg += shotDamage(w, h); e.head = e.head || !!h.head; e.n++;
    per.set(h.actor, e);
  }
  return per;
}

/* a camera-independent basis around a direction (for bots / host re-simulation) */
export function basis(dx: number, dy: number, dz: number){
  /* right = dir × up, up' = right × dir (LH, Y-up) */
  let rx = dz, ry = 0, rz = -dx;
  const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
  const ux = ry * dz - rz * dy, uy = rz * dx - rx * dz, uz = rx * dy - ry * dx;
  return { right: { x: rx, y: ry, z: rz }, up: { x: ux, y: uy, z: uz } };
}
