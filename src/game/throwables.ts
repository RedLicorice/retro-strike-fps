import { SFX } from '../audio/sfx';
import { Combat } from '../combat/index';
import { V3, rnd, v3len } from '../core/math';
import { Net } from '../net/index';
import { Player } from '../player/player';
import { buildThrowable } from '../render/gunModels';
import { MAP } from '../world/map/index';

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
      g.vel.y -= 21 * dt;
      const np = g.pos.clone();
      np.x += g.vel.x * dt; np.y += g.vel.y * dt; np.z += g.vel.z * dt;
      /* world collision (simple) */
      const r = .09;
      const sp = Math.hypot(g.vel.x, g.vel.z) * dt + 1;
      const B = MAP.near(g.pos.x - sp, g.pos.z - sp, g.pos.x + sp, g.pos.z + sp).slice();
      const hitBox = (x, y, z) => {
        for (let k = 0; k < B.length; k++){ const b = B[k];
          if (x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r && y > b.y0 - r && y < b.y1 + r) return b; }
        return null;
      };
      let b = hitBox(np.x, g.pos.y, g.pos.z);
      if (b){ g.vel.x *= -.42; g.vel.z *= -.42; np.x = g.pos.x; }
      b = hitBox(np.x, np.y, np.z + g.vel.z * dt * 0);
      if (hitBox(np.x, np.y, np.z)){ g.vel.z *= -.42; np.z = g.pos.z; }
      b = hitBox(np.x, np.y, np.z);
      if (b){
        if (g.vel.y < 0 && np.y > b.y1 - .2){ np.y = b.y1 + r; g.vel.y *= -.34; g.vel.x *= .72; g.vel.z *= .72; }
        else { g.vel.y *= -.34; np.y = g.pos.y; }
        if (Math.abs(g.vel.y) > 2) SFX.noise(.06, .08, 1200, 400, 2);
      }
      const gr = MAP.groundAt(np.x, np.z, np.y + .3, .3);
      if (np.y < gr + r){ np.y = gr + r; g.vel.y *= -.34; g.vel.x *= .7; g.vel.z *= .7;
        if (Math.abs(g.vel.y) > 1.6) SFX.noise(.06, .09, 1100, 380, 2); }
      g.pos.copyFrom(np);
      g.mesh.position.copyFrom(np);
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
