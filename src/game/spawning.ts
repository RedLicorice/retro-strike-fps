import { TAU, clamp, rnd, v3len } from '../core/math';
import { Save } from '../core/save';
import { WBY } from '../data/weapons';
import { SHIELD_MAX, SPAWN_PROT } from '../player/constants';
import { Player } from '../player/player';
import { UI } from '../ui/index';
import { Wep } from '../weapons/weaponController';
import { MAP } from '../world/map/index';

export const gameSpawning = {
  spawnPoint(actor){
    const S = MAP.spawns; let best = null, bs = -1e9;
    const threats = this.actors.filter(a => a !== actor && a.alive && (this.ff || a.team !== actor.team))
      .map(a => ({ x: a.pos.x, y: a.pos.y + a.eyeY(), z: a.pos.z }));
    if (this.mode === 'horde') for (const m of this.monsters) if (m.alive) threats.push({ x: m.pos.x, y: m.pos.y + 1.4, z: m.pos.z });
    for (const s of S){
      let dmin = 1e9, seen = 0;
      for (const t of threats){
        const d = v3len(t.x - s.x, 0, t.z - s.z);
        if (d < dmin) dmin = d;
        if (d < 60 && MAP.los(t.x, t.y, t.z, s.x, (s.y || 0) + 1.3, s.z)) seen++;
      }
      /* never spawn in an enemy's sight line if avoidable; then prefer distance, with a little jitter */
      const sc = Math.min(dmin, 40) - seen * 100 + Math.random() * 6;
      if (sc > bs){ bs = sc; best = s; }
    }
    return best || { x: 0, z: 0, y: 0 };
  },

  spawnActor(a){
    const s = this.spawnPoint(a);
    const y = MAP.groundAt(s.x, s.z, (s.y || 0) + 6, 8);
    a.pos.set(clamp(s.x, -MAP.half + 1.4, MAP.half - 1.4), y + .06, clamp(s.z, -MAP.half + 1.4, MAP.half - 1.4)); a.vel.set(0, 0, 0);
    a.hp = a.maxHp; a.alive = true; a.deathT = 0; a.yaw = rnd(TAU); a.pitch = 0; a.shield = a.kind === 'mon' ? 0 : SHIELD_MAX; a.idleT = 0;
    a.onGround = true; a.combatT = 99; a.spawnProt = SPAWN_PROT;
    if (a.rig){ a.rig.setEnabled(true); a.rig.rotation.x = 0; a.rig.position.y = 0; }
    const d = WBY[a.wpn]; if (d && !d.melee){ a.mag = d.mag; a.res = this.mode === 'horde' ? 999 : d.res; }
    a.respawnT = 0;
  },

  spawnLocal(){
    const s = this.spawnPoint(this.local);
    Player.reset(s, rnd(TAU));
    const me = this.local;
    me.pos.copyFrom(Player.pos); me.yaw = Player.yaw; me.alive = true; me.hp = me.maxHp; me.shield = SHIELD_MAX; me.idleT = 0;
    me.spawnProt = SPAWN_PROT;
    if (me.rig) me.rig.setEnabled(false);
    const L = Save.data.loadout;
    Wep.ids = [L[0] || 'ak47', L[1] || 'm1911', L[2] || 'frag'];
    for (const id of Wep.ids){ const d = WBY[id];
      if (d && d.slot !== 2) Wep.ammo[id] = { mag: d.mag, res: this.mode === 'horde' ? 999 : d.res };
      if (d && d.slot === 2) Wep.thCount[id] = d.count; }
    Wep.build(); Wep.slot = 0; Wep.build();
    me.setWeapon(Wep.ids[0]);
    UI.deathHide();
  }
};
