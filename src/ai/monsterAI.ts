import { SFX } from '../audio/sfx';
import { Combat } from '../combat/index';
import { clamp, damp, rnd, v3len } from '../core/math';
import { Game } from '../game/index';
import { Player } from '../player/player';
import { MAP } from '../world/map/index';
import { moveEntity } from '../world/physics';

/* ------------------------------ D6. MONSTERS ------------------------------ */
export const MonsterAI = {
  update(m, dt){
    if (!m.alive || !Game.isAuthority) return;
    const ai = m.ai; ai.t -= dt; ai.blind = Math.max(0, (ai.blind || 0) - dt);
    let tgt = null, bd = 1e9;
    for (const a of Game.actors){
      if (!a.alive) continue;
      const d = v3len(a.pos.x - m.pos.x, 0, a.pos.z - m.pos.z);
      if (d < bd){ bd = d; tgt = a; }
    }
    if (!tgt) return;
    ai.tgt = tgt;
    const dx = tgt.pos.x - m.pos.x, dz = tgt.pos.z - m.pos.z, dist = Math.hypot(dx, dz) || 1;
    m.yaw = damp(m.yaw, Math.atan2(dx, dz), 5, dt);
    let wishX = dx / dist, wishZ = dz / dist, speed = m.spd;
    if (ai.blind > 0){ wishX *= .2; wishZ *= .2; speed *= .35; }
    if (dist > 2.2 || ai.blind > 0){
      if (ai.t <= 0 || !ai.path){ ai.path = MAP.findPath(m.pos.x, m.pos.z, tgt.pos.x, tgt.pos.z, 500); ai.pi = 1; ai.t = .7 + rnd(.5); }
      if (ai.path && ai.pi < ai.path.length){
        const n = ai.path[ai.pi];
        const ndx = n.x - m.pos.x, ndz = n.z - m.pos.z, nd = Math.hypot(ndx, ndz);
        if (nd < .9) ai.pi++; else { wishX = ndx / nd; wishZ = ndz / nd; }
        if (ai.pi >= ai.path.length) ai.path = null;
      }
      if (n0(m) && Math.random() < dt * 1.4) ai.jumpWant = true;
    } else {
      speed = 0;
      ai.atk = (ai.atk || 0) - dt;
      if (ai.atk <= 0){
        ai.atk = 1.15;
        m.lunge = .3;
        SFX.monster(dist, clamp((m.pos.x - Player.pos.x) / 25, -1, 1));
        if (dist < 2.6 && MAP.los(m.pos.x, m.pos.y + 1, m.pos.z, tgt.pos.x, tgt.pos.y + 1, tgt.pos.z)){
          Combat.applyDamage(tgt, Math.round(m.dmg * rnd(1.2, .8)), m, false, 'claw', dx / dist, .2, dz / dist, { x: tgt.pos.x, y: tgt.pos.y + 1.1, z: tgt.pos.z });
        }
      }
    }
    if (m.lunge > 0){ m.lunge -= dt; speed += 3.4; }
    moveEntity(m, dt, wishX, wishZ, speed, ai.jumpWant); ai.jumpWant = false;
    if (Math.random() < dt * .5) SFX.monster(v3len(m.pos.x - Player.pos.x, 0, m.pos.z - Player.pos.z), clamp((m.pos.x - Player.pos.x) / 25, -1, 1));
  }
};

export function n0(m){ const b = MAP.boxes; for (let i = 0; i < b.length; i++){ const q = b[i];
  if (q.x1 < m.pos.x - .6 || q.x0 > m.pos.x + .6 || q.z1 < m.pos.z - .6 || q.z0 > m.pos.z + .6) continue;
  if (q.y1 > m.pos.y + .1 && q.y1 < m.pos.y + 1.2) return true; } return false; }
