import { SFX } from '../audio/sfx';
import { Combat } from '../combat/index';
import { V3, rnd, v3len } from '../core/math';
import { Net } from '../net/index';
import { Player } from '../player/player';
import { buildThrowable } from '../render/gunModels';
import { MAP } from '../world/map/index';

export const GRENADE_GRAVITY = 21, GRENADE_RADIUS = .09;

/* One physics bounce-step, shared by the live simulation below and the trajectory preview
   (weaponController.ts) — so the preview arc always matches where the throw will actually land. */
export function stepGrenade(pos, vel, dt, r = GRENADE_RADIUS){
  vel.y -= GRENADE_GRAVITY * dt;
  const np = pos.clone();
  np.x += vel.x * dt; np.y += vel.y * dt; np.z += vel.z * dt;
  const sp = Math.hypot(vel.x, vel.z) * dt + 1;
  const B = MAP.near(pos.x - sp, pos.z - sp, pos.x + sp, pos.z + sp);
  const hitBox = (x, y, z) => { for (let k = 0; k < B.length; k++){ const b = B[k];
    if (x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r && y > b.y0 - r && y < b.y1 + r) return b; }
    return null; };
  let bounced = false;
  let b = hitBox(np.x, pos.y, pos.z);
  if (b){ vel.x *= -.42; vel.z *= -.42; np.x = pos.x; bounced = true; }
  if (hitBox(np.x, np.y, np.z)){ vel.z *= -.42; np.z = pos.z; bounced = true; }
  b = hitBox(np.x, np.y, np.z);
  if (b){
    if (vel.y < 0 && np.y > b.y1 - .2){ np.y = b.y1 + r; vel.y *= -.34; vel.x *= .72; vel.z *= .72; }
    else { vel.y *= -.34; np.y = pos.y; }
    bounced = true;
  }
  const gr = MAP.groundAt(np.x, np.z, np.y + .3, .3);
  if (np.y < gr + r){ np.y = gr + r; vel.y *= -.34; vel.x *= .7; vel.z *= .7; bounced = true; }
  pos.copyFrom(np);
  return bounced;
}

/* client-only prediction for the trajectory preview: same stepper, no SFX/mesh side effects */
export function predictThrowPath(origin, vel0, maxBounces = 2, maxT = 3){
  const dt = 1 / 30;
  const pos = origin.clone(), vel = vel0.clone();
  const pts = [pos.clone()];
  let bounces = 0, t = 0;
  while (t < maxT && bounces <= maxBounces){
    t += dt;
    if (stepGrenade(pos, vel, dt)) bounces++;
    pts.push(pos.clone());
  }
  return pts;
}

export const gameThrowables = {
  spawnThrowable(def, pos, vel, owner){
    const m = buildThrowable(def.id, false);
    m.position.copyFrom(pos);
    const g = { mesh: m, def: def, pos: pos.clone(), vel: vel.clone(), t: def.fuse, owner: owner, spin: V3(rnd(9, -9), rnd(9, -9), rnd(9, -9)) };
    this.grenades.push(g);
    Net.fxEvent && Net.fxEvent('throw', [def.id, pos.x, pos.y, pos.z, vel.x, vel.y, vel.z, owner ? owner.id : null]);
    return g;
  },

  updateThrowables(dt){
    for (let i = this.grenades.length - 1; i >= 0; i--){
      const g = this.grenades[i];
      g.t -= dt;
      if (stepGrenade(g.pos, g.vel, dt) && Math.abs(g.vel.y) > 1.6) SFX.noise(.06, .085, 1150, 390, 2);
      const gr = MAP.groundAt(g.pos.x, g.pos.z, g.pos.y + .3, .3);
      g.mesh.position.copyFrom(g.pos);
      g.mesh.rotation.x += g.spin.x * dt; g.mesh.rotation.y += g.spin.y * dt; g.mesh.rotation.z += g.spin.z * dt;
      g.spin.scaleInPlace(Math.exp(-1.4 * dt));
      if (g.def.kind === 'fire' && g.t <= 0){ /* molotov ignites on burst */ }
      if (g.t <= 0){
        const k = g.def.kind;
        if (k === 'frag') Combat.explode(g.pos.x, g.pos.y + .2, g.pos.z, g.def.radius, g.def.dmg, g.owner, 'frag');
        else if (k === 'flash') Combat.flashbang(g.pos.x, g.pos.y + .4, g.pos.z, g.def.radius);
        else { Combat.explode(g.pos.x, g.pos.y, g.pos.z, 2.2, 12, g.owner, 'molo'); Combat.fireArea(g.pos.x, gr, g.pos.z, g.def.radius, g.def.dur, g.owner); }
        g.mesh.dispose(false, false); this.grenades.splice(i, 1);
      }
    }
    /* fire areas */
    for (let i = this.fires.length - 1; i >= 0; i--){
      const f = this.fires[i]; f.t -= dt; f.tick -= dt;
      if (f.tick <= 0){
        f.tick = .5;
        const L = [this.actors, this.mode === 'horde' ? this.monsters : []];
        for (const list of L) for (const a of list){
          if (!a.alive) continue;
          if (v3len(a.pos.x - f.x, 0, a.pos.z - f.z) < f.r){
            if (a.isLocal){ Player.burnT = 1.1; Combat.hurt(a, 7, f.owner, 'fire'); }
            else Combat.applyDamage(a, 7, f.owner, false, 'molo', 0, 1, 0, { x: a.pos.x, y: a.pos.y + .8, z: a.pos.z });
          }
        }
      }
      if (f.t <= 0){ f.dispose(); this.fires.splice(i, 1); }
    }
  }
};
