import { clamp, damp } from '../core/math';
import { GRAV } from '../player/constants';
import { MAP } from './map/index';

/* Substepped AABB mover used by the player AND bots/monsters.
   Hard world box, step-up, floor plane, kill-plane recovery. */
export function worldMove(p, v, r, h, dt){
  const maxStep = .55;
  const lim = MAP.half - r - .45;
  v.y -= GRAV * dt;
  v.y = clamp(v.y, -36, 22);
  const dist = Math.hypot(v.x, v.z) * dt + Math.abs(v.y) * dt;
  const n = Math.max(1, Math.min(8, Math.ceil(dist / .22)));
  const sdt = dt / n;
  let grounded = false, landV = 0;
  /* candidate boxes for the whole step, fetched once from the spatial grid */
  const sp = Math.hypot(v.x, v.z) * dt + r + .6;
  const B = MAP.near(p.x - sp, p.z - sp, p.x + sp, p.z + sp).slice();
  const blocked = (x, y, z) => {
    const y1 = y + h;
    for (let i = 0; i < B.length; i++){
      const b = B[i];
      if (b.x1 < x - r || b.x0 > x + r || b.z1 < z - r || b.z0 > z + r) continue;
      if (b.y1 < y + .03 || b.y0 > y1) continue;
      return b;
    }
    return null;
  };
  /* depenetrate: something spawned/teleported/rebuilt into a box would otherwise block every axis forever.
     Step up if it's low enough, else push out horizontally along the shallowest side. */
  for (let it = 0; it < 4; it++){
    const b = blocked(p.x, p.y, p.z);
    if (!b) break;
    const dy = b.y1 - p.y;
    if (dy > 0 && dy <= maxStep && !blocked(p.x, b.y1 + .03, p.z)){ p.y = b.y1 + .02; continue; }
    const px0 = p.x + r - b.x0, px1 = b.x1 - (p.x - r), pz0 = p.z + r - b.z0, pz1 = b.z1 - (p.z - r);
    const m = Math.min(px0, px1, pz0, pz1) + .01;
    if (m === px0 + .01) p.x -= m; else if (m === px1 + .01) p.x += m; else if (m === pz0 + .01) p.z -= m; else p.z += m;
  }
  for (let s = 0; s < n; s++){
    let nx = p.x + v.x * sdt;
    if (nx < -lim || nx > lim){ v.x = 0; nx = clamp(nx, -lim, lim); }
    else {
      const b = blocked(nx, p.y, p.z);
      if (b){
        const dy = b.y1 - p.y;
        if (dy > .02 && dy <= maxStep && !blocked(nx, b.y1 + .03, p.z)){ p.y = b.y1 + .02; v.y = 0; grounded = true; }
        else { v.x = 0; nx = p.x; }
      }
    }
    p.x = nx;
    let nz = p.z + v.z * sdt;
    if (nz < -lim || nz > lim){ v.z = 0; nz = clamp(nz, -lim, lim); }
    else {
      const b = blocked(p.x, p.y, nz);
      if (b){
        const dy = b.y1 - p.y;
        if (dy > .02 && dy <= maxStep && !blocked(p.x, b.y1 + .03, nz)){ p.y = b.y1 + .02; v.y = 0; grounded = true; }
        else { v.z = 0; nz = p.z; }
      }
    }
    p.z = nz;
    p.y += v.y * sdt;
    if (v.y > 0){
      const ceil = blocked(p.x, p.y, p.z);
      if (ceil && ceil.y0 < p.y + h && ceil.y1 > p.y + h){ p.y = ceil.y0 - h - .02; v.y = 0; }
    }
    const catchStep = Math.max(maxStep, -v.y * sdt + .16);
    const g = MAP.groundAt(p.x, p.z, p.y, catchStep);
    if (v.y <= .55 && p.y <= g + catchStep){
      if (!grounded) landV = v.y;
      p.y = g; v.y = 0; grounded = true;
    }
    const floor = MAP.terrainY(p.x, p.z);
    if (p.y < floor - .2){ p.y = Math.max(floor, MAP.groundAt(p.x, p.z, floor + 4, 8)); v.y = 0; grounded = true; }
  }
  p.x = clamp(p.x, -lim, lim);
  p.z = clamp(p.z, -lim, lim);
  const fl = MAP.terrainY(p.x, p.z);
  if (p.y < fl){ p.y = fl; v.y = 0; grounded = true; }
  return { grounded: grounded, landV: landV };
}

/* ------------------------------ D4. MOVEMENT FOR NON-LOCAL ACTORS ------------------------------ */
export function moveEntity(e, dt, wishX, wishZ, speed, jump){
  const p = e.pos, v = e.vel, r = e.radius, h = e.height;
  v.x = damp(v.x, wishX * speed, e.onGround ? 13 : 3, dt);
  v.z = damp(v.z, wishZ * speed, e.onGround ? 13 : 3, dt);
  if (jump && e.onGround){ v.y = 6.6; e.onGround = false; }
  const mv = worldMove(p, v, r, h, dt);
  e.onGround = mv.grounded;
  e.speed = Math.hypot(v.x, v.z);
}
