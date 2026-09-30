import { Actor } from '../actors/actor';
import { MonsterAI } from '../ai/monsterAI';
import { SFX } from '../audio/sfx';
import { clamp, rnd, rndi, v3len } from '../core/math';
import { Save } from '../core/save';
import { WBY } from '../data/weapons';
import { Game } from './index';
import { Player } from '../player/player';
import { UI } from '../ui/index';
import { Wep } from '../weapons/weaponController';
import { MAP } from '../world/map/index';

let monsterSeq = 0;

export const gameHorde = {
  /* -------- horde waves -------- */
  spawnMonster(wave){
    const m = new Actor('m' + (monsterSeq++), 'ABOMINATION', 1, false, 'mon');
    m.isBot = false; m.team = 9;
    m.maxHp = Math.round(48 + wave * 26 + Math.pow(wave, 1.5) * 4);
    m.hp = m.maxHp; m.shield = 0; m.dmg = 9 + wave * 2.2; m.spd = 2.5 + Math.min(2.6, wave * .16) + rnd(.6);
    m.ai.blind = 0; m.ai.t = 0;
    const s = MAP.spawns[rndi(MAP.spawns.length)] || { x: 0, z: 0, y: 0 };
    let p = s, tries = 0;
    while (tries++ < 8){
      p = MAP.randomOpen();
      if (v3len(p.x - Player.pos.x, 0, p.z - Player.pos.z) > 22) break;
    }
    m.pos.set(p.x, (p.y || 0) + .1, p.z); m.onGround = true;
    if (m.rig) m.rig.setEnabled(true);
    if (Game.shadow) try { Game.shadow.addShadowCaster(m.rig.getChildMeshes()[0]); } catch (e){}
    this.monsters.push(m);
    return m;
  },

  updateHorde(dt){
    if (this.waveActive){
      if (this.waveQueue > 0){
        this.waveT -= dt;
        if (this.waveT <= 0){ this.waveT = clamp(1.5 - this.wave * .07, .28, 1.5); this.spawnMonster(this.wave); this.waveQueue--; }
      } else if (!this.monsters.some(m => m.alive)){
        this.waveActive = false; this.betweenT = 7;
        UI.toast('WAVE ' + this.wave + ' CLEARED  +' + (200 + this.wave * 50), 'g');
        this.local.score += 200 + this.wave * 50;
        Save.data.stats.score = this.local.score;
        Save.data.stats.wave = Math.max(Save.data.stats.wave, this.wave);
        /* resupply */
        for (const a of this.actors){ if (a.isBot){ const d = WBY[a.wpn]; if (d) a.res = d.res; a.hp = a.maxHp; } }
        for (const id in Wep.ammo){ Wep.ammo[id].res = Math.max(Wep.ammo[id].res, WBY[id].res); }
        for (const id in Wep.thCount) Wep.thCount[id] = WBY[id].count;
        SFX.levelup();
        UI.waveBanner('RESUPPLY', 'AMMO RESTORED');
      }
    } else {
      this.betweenT -= dt;
      if (this.betweenT <= 0){
        this.wave++; this.waveActive = true;
        this.waveQueue = Math.round(4 + this.wave * 2.6);
        this.waveT = .4;
        UI.waveBanner('WAVE ' + this.wave, this.waveQueue + ' HOSTILES INBOUND');
        SFX.wave();
      }
    }
    for (let i = this.monsters.length - 1; i >= 0; i--){
      const m = this.monsters[i];
      MonsterAI.update(m, dt); m.update(dt);
      if (!m.alive && m.deathT > 4.6){ m.dispose(); this.monsters.splice(i, 1); }
    }
  }
};
