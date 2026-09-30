import * as BABYLON from 'babylonjs';
import { SFX } from '../audio/sfx';
import { Combat } from './index';
import { ctx } from '../core/context';
import { V3, clamp, v3len } from '../core/math';
import { FX } from '../fx/fx';
import { Game } from '../game/index';
import { Net } from '../net/index';
import { Player } from '../player/player';
import { TX } from '../render/textures';
import { UI } from '../ui/index';
import { MAP } from '../world/map/index';

export const combatExplosives = {
  /* ---- throwables ---- */
  explode(x, y, z, radius, dmg, owner, kind){
    FX.explosion(x, y, z, radius);
    SFX.explode(v3len(x - Player.pos.x, y - Player.pos.y, z - Player.pos.z), 0);
    const lists = [Game.actors, Game.mode === 'horde' ? Game.monsters : []];
    for (const L of lists) for (const a of L){
      if (!a.alive) continue;
      const d = v3len(a.pos.x - x, a.pos.y + .9 - y, a.pos.z - z);
      if (d > radius) continue;
      const los = MAP.los(x, y, z, a.pos.x, a.pos.y + .9, a.pos.z);
      const k = (1 - d / radius) * (los ? 1 : .38);
      if (dmg > 0) Combat.applyDamage(a, Math.round(dmg * k), owner, false, 'frag', (a.pos.x - x) / (d || 1), .3, (a.pos.z - z) / (d || 1), { x: a.pos.x, y: a.pos.y + 1, z: a.pos.z });
      if (a.spawnProt > 0) continue;                 /* spawn protection also blocks blast knockback */
      if (a.isLocal){
        const f = k * 12;
        Player.vel.x += (a.pos.x - x) / (d || 1) * f; Player.vel.z += (a.pos.z - z) / (d || 1) * f;
        Player.vel.y += k * 5.5; Player.onGround = false;
      } else { a.vel.x += (a.pos.x - x) / (d || 1) * k * 6; a.vel.z += (a.pos.z - z) / (d || 1) * k * 6; }
    }
    Net.fxEvent && Net.fxEvent('exp', [x, y, z, radius]);
  },

  flashbang(x, y, z, radius){
    FX.flash(x, y + .5, z, radius * 2, [1, 1, .9]);
    FX.burst('flash', x, y + .5, z, 0, 1, 0, 20, 5, 1.4);
    SFX.blind();
    const L = Game.actors;
    for (const a of L){
      if (!a.alive) continue;
      const d = v3len(a.pos.x - x, a.pos.y + 1.4 - y, a.pos.z - z);
      if (d > radius) continue;
      if (!MAP.los(x, y + .3, z, a.pos.x, a.pos.y + 1.5, a.pos.z)) continue;
      const facing = a.isLocal ? clamp(BABYLON.Vector3.Dot(ctx.cam.getDirection(BABYLON.Axis.Z), V3((x - a.pos.x) / d, 0, (z - a.pos.z) / d)), -1, 1) : 0;
      const k = (1 - d / radius) * (a.isLocal ? (facing * .5 + .5) * .8 + .2 : 1);
      if (a.isLocal){ Player.blindT = Math.max(Player.blindT, 2.6 * k); UI.blind(Player.blindT); }
      else if (a.isBot){ a.ai.blind = 2.2 * k; a.ai.target = null; }
    }
    if (Game.mode === 'horde') for (const m of Game.monsters) if (m.alive){
      const d = v3len(m.pos.x - x, m.pos.y - y, m.pos.z - z);
      if (d < radius && MAP.los(x, y, z, m.pos.x, m.pos.y + 1, m.pos.z)) m.ai.blind = 2.4;
    }
    Net.fxEvent && Net.fxEvent('flash', [x, y, z, radius]);
  },

  fireArea(x, y, z, r, dur, owner){
    if (Game.fires.length > 5) Game.fires.shift().dispose();
    const ps = new BABYLON.ParticleSystem('fire', Math.ceil(180 * FX.q()), ctx.scene);
    ps.particleTexture = TX.mk('t_part2', 64, TX.particle(true), true);
    ps.emitter = V3(x, y + .1, z);
    ps.minEmitBox = V3(-r * .7, 0, -r * .7); ps.maxEmitBox = V3(r * .7, .2, r * .7);
    ps.color1 = new BABYLON.Color4(1, .68, .2, .95); ps.color2 = new BABYLON.Color4(1, .24, .05, .85);
    ps.colorDead = new BABYLON.Color4(.14, .03, .01, 0);
    ps.minSize = .4; ps.maxSize = 1.5; ps.minLifeTime = .3; ps.maxLifeTime = .95;
    ps.emitRate = 150; ps.gravity = V3(0, 4.5, 0); ps.direction1 = V3(-.5, 1, -.5); ps.direction2 = V3(.5, 2.4, .5);
    ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD; ps.start();
    Game.fires.push({ ps: ps, x: x, y: y, z: z, r: r, t: dur, owner: owner, tick: 0, dispose(){ this.ps.dispose(); } });
    SFX.fire();
    Net.fxEvent && Net.fxEvent('fire', [x, y, z, r, dur]);
  }
};
