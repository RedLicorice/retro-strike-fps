import { Actor } from '../actors/actor';
import { ctx } from '../core/context';
import { damp, makeSeed, pick, rnd, rndi, v3len } from '../core/math';
import { Save } from '../core/save';
import { PRIMARY_IDS } from '../data/weapons';
import { FX } from '../fx/fx';
import { Game } from '../game/index';
import { MAP } from '../world/map/index';
import { moveEntity } from '../world/physics';

export const Menu = {
  t: 0, demos: [], active: false,
  start(seed){
    this.active = true; this.t = rnd(40);
    MAP.generate(seed || Save.data.seed || makeSeed());
    MAP.build();
    Game.lightSetup();
    Save.data.seed = MAP.seed;
    if (Game.shadow){ for (const m of MAP.meshes) try { Game.shadow.addShadowCaster(m); } catch (e){ break; } }
    this.demos = [];
    for (let i = 0; i < 3; i++){
      const a = new Actor('d' + i, 'DEMO', i % 2, false, 'sol', i === 0 ? Save.data.character : undefined);
      const s = MAP.spawns[rndi(MAP.spawns.length)] || { x: 0, z: 0, y: 0 };
      a.pos.set(s.x, s.y, s.z); a.setWeapon(pick(PRIMARY_IDS)); a.rig.setEnabled(true);
      a.dest = MAP.randomOpen();
      if (Game.shadow) try { a.rig.getChildMeshes().forEach(m => Game.shadow.addShadowCaster(m)); } catch (e){}
      this.demos.push(a);
    }
  },
  clear(){ for (const d of this.demos) d.dispose(); this.demos = []; this.active = false; },
  /* the lead demo soldier wears the operator picked in the loadout screen */
  showOperator(id){ if (this.demos[0]) this.demos[0].setCharacter(id); },
  update(dt){
    this.t += dt;
    const r = 42, h = 17 + Math.sin(this.t * .17) * 3.5;
    ctx.cam.position.set(Math.sin(this.t * .055) * r, h, Math.cos(this.t * .055) * r);
    const dx = 0 - ctx.cam.position.x, dy = 2.5 - ctx.cam.position.y, dz = 0 - ctx.cam.position.z;
    ctx.cam.rotation.set(Math.atan2(-dy, Math.hypot(dx, dz)), Math.atan2(dx, dz), Math.sin(this.t * .13) * .02);
    ctx.cam.fov = damp(ctx.cam.fov, 1.02, 3, dt);
    for (const d of this.demos){
      if (!d.dest || v3len(d.dest.x - d.pos.x, 0, d.dest.z - d.pos.z) < 1.6) d.dest = MAP.randomOpen();
      const ddx = d.dest.x - d.pos.x, ddz = d.dest.z - d.pos.z, l = Math.hypot(ddx, ddz) || 1;
      d.yaw = damp(d.yaw, Math.atan2(ddx, ddz), 5, dt);
      moveEntity(d, dt, ddx / l, ddz / l, 2.4, false);
      d.update(dt);
    }
    FX.update(dt);
  }
};
