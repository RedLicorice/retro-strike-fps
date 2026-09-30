import { SHIELD_PER, SHIELD_PLATES } from '../player/constants';
import type { TraceHit } from '../core/types';
import { SFX } from '../audio/sfx';
import { $ } from '../core/dom';
import { rayAABB } from '../core/math';
import { Save } from '../core/save';
import { WBY } from '../data/weapons';
import { FX } from '../fx/fx';
import { Game } from '../game/index';
import { Net } from '../net/index';
import { Player } from '../player/player';
import { UI } from '../ui/index';
import { Wep } from '../weapons/weaponController';
import { MAP } from '../world/map/index';

/* ------------------------------ D3. COMBAT ------------------------------ */
export const _ab = { x0: 0, y0: 0, z0: 0, x1: 0, y1: 0, z1: 0 };

export const combatDamage = {
  trace(ox, oy, oz, dx, dy, dz, maxD, ignoreId, team, hitMonsters?): TraceHit | null {
    const w = MAP.ray(ox, oy, oz, dx, dy, dz, maxD);
    let wt = w ? w.t : maxD, best = null, bestT = wt, head = false;
    const list = Game.actors;
    for (let i = 0; i < list.length; i++){
      const a = list[i];
      if (!a.alive || a.id === ignoreId || a.isLocal && ignoreId === Player.id) continue;
      if (!Game.ff && team !== undefined && a.team === team && a.kind !== 'mon') continue;
      if (a.kind === 'mon' && !hitMonsters && Game.mode !== 'horde') continue;
      const r = a.radius + .04, hh = a.height;
      /* head */
      _ab.x0 = a.pos.x - r * .55; _ab.x1 = a.pos.x + r * .55;
      _ab.z0 = a.pos.z - r * .55; _ab.z1 = a.pos.z + r * .55;
      _ab.y0 = a.pos.y + hh * .80; _ab.y1 = a.pos.y + hh + .06;
      let t = rayAABB(ox, oy, oz, dx, dy, dz, _ab, bestT);
      if (t >= 0 && t < bestT){ bestT = t; best = a; head = true; continue; }
      /* body */
      _ab.x0 = a.pos.x - r; _ab.x1 = a.pos.x + r;
      _ab.z0 = a.pos.z - r; _ab.z1 = a.pos.z + r;
      _ab.y0 = a.pos.y; _ab.y1 = a.pos.y + hh * .82;
      t = rayAABB(ox, oy, oz, dx, dy, dz, _ab, bestT);
      if (t >= 0 && t < bestT){ bestT = t; best = a; head = false; }
    }
    /* monsters list (horde) */
    if (Game.mode === 'horde'){
      for (let i = 0; i < Game.monsters.length; i++){
        const a = Game.monsters[i];
        if (!a.alive) continue;
        const r = a.radius + .04, hh = a.height;
        _ab.x0 = a.pos.x - r * .6; _ab.x1 = a.pos.x + r * .6;
        _ab.z0 = a.pos.z - r * .6; _ab.z1 = a.pos.z + r * .6;
        _ab.y0 = a.pos.y + hh * .78; _ab.y1 = a.pos.y + hh + .05;
        let t = rayAABB(ox, oy, oz, dx, dy, dz, _ab, bestT);
        if (t >= 0 && t < bestT){ bestT = t; best = a; head = true; continue; }
        _ab.x0 = a.pos.x - r; _ab.x1 = a.pos.x + r;
        _ab.z0 = a.pos.z - r; _ab.z1 = a.pos.z + r;
        _ab.y0 = a.pos.y; _ab.y1 = a.pos.y + hh * .80;
        t = rayAABB(ox, oy, oz, dx, dy, dz, _ab, bestT);
        if (t >= 0 && t < bestT){ bestT = t; best = a; head = false; }
      }
    }
    if (best && bestT <= wt)
      return { t: bestT, x: ox + dx * bestT, y: oy + dy * bestT, z: oz + dz * bestT, nx: -dx, ny: -dy, nz: -dz, mat: 'flesh', actor: best, head: head };
    if (w) return w;
    return null;
  },

  applyDamage(target, dmg, attacker, head, wpnId, dx, dy, dz, hit){
    if (!target || !target.alive || Game.state !== 'play') return;
    if (!Game.isAuthority) return;   /* only the host mutates health */
    if (attacker && attacker.spawnProt > 0 && attacker !== target) attacker.spawnProt = 0;   /* dealing damage ends protection */
    if (target.spawnProt > 0) return;
    /* armour plates soak weapon / explosive damage before health */
    let rest = dmg;
    const platesBefore = Math.ceil((target.shield || 0) / SHIELD_PER - 1e-6);
    if (target.kind !== 'mon' && target.shield > 0){ const a = Math.min(target.shield, rest); target.shield -= a; rest -= a; }
    const platesAfter = Math.ceil((target.shield || 0) / SHIELD_PER - 1e-6);
    target.hp -= rest; target.hitT = .13; target.combatT = 0; target.idleT = 0;
    if (attacker) attacker.idleT = 0;
    if (platesAfter < platesBefore){
      if (target.isLocal) UI.toast(platesAfter ? 'PLATE BROKEN  ' + platesAfter + '/' + SHIELD_PLATES : 'ARMOUR DOWN', 'r');
      if (attacker && attacker.isLocal) SFX.noise(.12, .22, 3200, 1400, 2.5, 'bandpass');
    }
    target.lastAttacker = attacker;
    if (hit) FX.burst('blood', hit.x, hit.y, hit.z, dx, .35, dz, head ? 18 : 10, 6, .7);
    /* local player feedback */
    if (target.isLocal){
      Player.combatT = 0; Player.hp = target.hp;
      FX.shake(.34 + dmg / 130);
      SFX.hurt(0); UI.hurtFlash(dmg, attacker);
      Player.damageDir(attacker ? attacker.pos : null);
      target.inCover = false;
    }
    if (attacker && attacker.isLocal){
      Save.data.stats.dmg += dmg;
      if (target.hp <= 0) UI.hitmarker(head, true);
    }
    Net.hitEvent && Net.hitEvent(target.id, dmg, head, attacker ? attacker.id : null, wpnId);
    if (target.hp <= 0) this.kill(target, attacker, head, wpnId, dx, dy, dz);
    else if (target.isBot && target.ai && Game.isAuthority){ target.ai.seen = 1.4; if (!target.ai.target && attacker) target.ai.target = attacker; }
  },

  kill(target, attacker, head, wpnId, dx, dy, dz){
    target.alive = false; target.deathT = 0; target.hp = 0; target.deaths++;
    target.deathDir = (dx || 0) > 0 ? 1 : -1;
    /* where the killing shot came from (for the death animation) */
    target.deathInfo = attacker && attacker.pos
      ? { head: !!head, fromX: attacker.pos.x - target.pos.x, fromZ: attacker.pos.z - target.pos.z }
      : { head: !!head, fromX: -(dx || 0), fromZ: -(dz || 1) };
    target.streak = 0;
    FX.burst('blood', target.pos.x, target.pos.y + 1.2, target.pos.z, dx || 0, .6, dz || 0, target.kind === 'mon' ? 40 : 26, 9, 1.2);
    if (target.kind === 'mon'){
      FX.ring(target.pos.x, target.pos.y + .4, target.pos.z, 2.2);
      SFX.monster(6, 0);
    } else {
      SFX.noise(.4, .3, 600, 90, 1, 'lowpass');
    }
    if (attacker){
      attacker.kills++; attacker.streak++;
      const base = target.kind === 'mon' ? 12 : 100;
      attacker.score += base + (head ? 25 : 0) + (wpnId && WBY[wpnId] && WBY[wpnId].melee ? 60 : 0);
      if (Game.mode === 'tdm' && attacker.team !== undefined) Game.score[attacker.team] += target.kind === 'mon' ? 0 : 1;
      if (Game.mode === 'ffa') Game.score[attacker.team] = 0;
      if (attacker.isLocal){
        const s = Save.data.stats; s.kills++; if (head) s.hs++;
        s.score = attacker.score; if (attacker.score > s.best) s.best = attacker.score;
        if (wpnId){ const w = Save.w(wpnId); w.kills++; if (head) w.hs++; Save.addXP(wpnId, (head ? 95 : 62) + (target.kind === 'mon' ? -34 : 0)); }
        SFX.kill(); UI.toast(head ? 'HEADSHOT  +' + (base + 25) : 'KILL  +' + base, head ? 'r' : 'g');
        if (attacker.streak >= 3) UI.toast(attacker.streak + 'X STREAK', 'g');
      }
      UI.feedKill(attacker, target, head, wpnId);
    } else UI.feedKill(null, target, head, wpnId);
    Net.killEvent && Net.killEvent(attacker ? attacker.id : null, target.id, head, wpnId);
    if (target.isLocal){
      Player.alive = false; Player.hp = 0;
      UI.deathScreen(attacker);
      SFX.hurt(0); FX.shake(1.2);
      Wep.vm && Wep.vm.setEnabled(false);
      $('scopeOv').classList.remove('on');
    }
    if (target.isBot || target.kind === 'mon'){
      target.respawnT = target.kind === 'mon' ? 0 : 3.2;
    }
    Game.checkEnd();
  },

  hurt(actor, dmg, attacker, type){
    if (!actor.alive || actor.spawnProt > 0) return;
    if (actor.isLocal){                                   /* local feedback always plays */
      UI.hurtFlash(dmg, attacker); FX.shake(.25); SFX.hurt(0); Player.combatT = 0;
      if (type === 'fire') FX.burst('fire', Player.pos.x, Player.pos.y + .4, Player.pos.z, 0, 1, 0, 4, 1.4, .5);
    }
    if (!Game.isAuthority) return;                        /* only the host mutates health */
    actor.hp -= dmg;
    if (actor.isLocal) Player.hp = actor.hp;
    if (actor.hp <= 0) this.kill(actor, attacker, false, type, 0, 0, 0);
  }
};
