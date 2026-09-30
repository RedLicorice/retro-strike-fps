import { basis, groupHits, spreadDirs } from '../combat/ballistics';
import { reloadTime } from '../data/weapons';
import * as BABYLON from 'babylonjs';
import { SFX } from '../audio/sfx';
import { Combat } from '../combat/index';
import { ctx } from '../core/context';
import { now } from '../core/dom';
import { DEG, TAU, V3, clamp, damp, rnd, v3len } from '../core/math';
import { WBY, WEAPONS } from '../data/weapons';
import { FX } from '../fx/fx';
import { Game } from '../game/index';
import { Player } from '../player/player';
import { MAP } from '../world/map/index';
import { moveEntity } from '../world/physics';

/* ------------------------------ D5. BOT AI (host authoritative) ------------------------------ */
export const BotAI = {
  update(a, dt){
    if (!a.alive || !Game.isAuthority) return;
    const ai = a.ai;
    ai.repath -= dt; ai.strafeT -= dt; ai.blind = Math.max(0, (ai.blind || 0) - dt);
    const skill = [0, 1, 2][clamp(ai.skill, 0, 2)];
    const SK = [.55, 1, 1.5][skill];              /* reaction / accuracy scaler */
    const enemies = Game.mode === 'horde'
      ? Game.monsters.filter(m => m.alive)
      : Game.actors.filter(o => o.alive && o.id !== a.id && (Game.ff || o.team !== a.team));

    /* ---- perception ---- */
    let tgt = ai.target && ai.target.alive ? ai.target : null;
    if (ai.blind <= 0){
      let bestD = 1e9, best = null;
      for (const e of enemies){
        const d = v3len(e.pos.x - a.pos.x, 0, e.pos.z - a.pos.z);
        if (d > 62 || e.spawnProt > 0) continue;
        const vis = MAP.los(a.pos.x, a.pos.y + a.eyeY(), a.pos.z, e.pos.x, e.pos.y + e.height * .7, e.pos.z);
        const score = d - (vis ? 26 : 0) + (e.isLocal ? -6 : 0);
        if (score < bestD){ bestD = score; best = e; if (vis) break; }
      }
      if (best){
        const vis = MAP.los(a.pos.x, a.pos.y + a.eyeY(), a.pos.z, best.pos.x, best.pos.y + best.height * .7, best.pos.z);
        if (vis){ if (tgt !== best){ ai.react = .34 / SK + rnd(.2); ai.err = 1; } tgt = best; ai.seen = 2.2; ai.lastPos = best.pos.clone(); }
        else if (ai.seen > 0 && ai.lastPos) tgt = ai.target;
      }
    }
    ai.target = tgt; ai.seen = Math.max(0, ai.seen - dt);
    ai.react = Math.max(0, ai.react - dt);

    const d = WBY[a.wpn] || WEAPONS[0];
    let wishX = 0, wishZ = 0, speed = 0, shoot = false;

    if (tgt && ai.seen > 0){
      /* ---- engage ---- */
      const dx = tgt.pos.x - a.pos.x, dz = tgt.pos.z - a.pos.z;
      const dist = Math.hypot(dx, dz) || 1;
      a.yaw = damp(a.yaw, Math.atan2(dx, dz), 11 * SK, dt);
      const eyeA = a.pos.y + a.eyeY(), eyeT = tgt.pos.y + tgt.height * (tgt.kind === 'mon' ? .62 : .68);
      a.pitch = damp(a.pitch, Math.atan2(eyeA - eyeT, dist), 10 * SK, dt);
      const vis = MAP.los(a.pos.x, eyeA, a.pos.z, tgt.pos.x, tgt.pos.y + tgt.height * .6, tgt.pos.z);
      const lowHp = a.hp < a.maxHp * .38;
      /* strafe / range control */
      if (ai.strafeT <= 0){ ai.strafeT = .6 + rnd(1.1); ai.strafe *= rnd(1) < .72 ? -1 : 1; }
      const perpX = -dz / dist, perpZ = dx / dist;
      const ideal = d.melee ? .9 : d.cls === 'SNIPER RIFLE' ? 26 : d.cls === 'RIFLE' ? 20 : d.cls === 'SHOTGUN' ? 6 : 12;
      const push = vis ? clamp((dist - ideal) / 8, -1, 1) : 1;
      wishX = perpX * ai.strafe * .72 + (dx / dist) * push;
      wishZ = perpZ * ai.strafe * .72 + (dz / dist) * push;
      const wl = Math.hypot(wishX, wishZ) || 1; wishX /= wl; wishZ /= wl;
      speed = (lowHp && vis ? 6.4 : 4.6) * (d.spd || 1) * (vis ? .82 : 1.14);
      if (lowHp && vis && a.hp < a.maxHp * .3 && ai.coverT === undefined) ai.coverT = 0;

      /* seek cover when hurt */
      if (lowHp && vis && ai.state !== 'cover' && rnd(dt) < .9){
        const c = this.findCover(a, tgt);
        if (c){ ai.state = 'cover'; ai.dest = c; ai.path = null; ai.repath = 0; }
      }
      /* fire */
      if (vis && ai.react <= 0 && a.reloadT <= 0 && a.mag > 0 && !d.melee){
        a.fireT -= dt;
        if (a.fireT <= 0){
          a.fireT = 60 / d.rpm * (1 + .35 / SK) * (d.auto ? 1 : 1.2);
          ai.burst++;
          if (ai.burst > (d.auto ? 3 + skill * 3 : 1)){ ai.burst = 0; a.fireT = .34 + rnd(.3); }
          this.shoot(a, d, tgt, SK, dist);
          shoot = true;
        }
      } else if (vis && d.melee && dist < d.range && ai.react <= 0){
        a.fireT -= dt;
        if (a.fireT <= 0){ a.fireT = 60 / d.rpm; this.meleeSwing(a, d, tgt); }
      }
      if (a.mag <= 0 && a.reloadT <= 0 && !d.melee){
        if (a.res > 0){ a.reloadT = reloadTime(d, d.mag - a.mag); SFX.noise(.06, .05 * clamp(1 - dist / 40, 0, 1), 900, 300, 3); }
        else { const alt = a.team === 0 ? 'm1911' : 'usp'; if (WBY[alt]){ a.setWeapon(alt); } }
      }
      /* reposition if too close to a monster / blocked */
      if (!vis){
        if (ai.repath <= 0){ ai.path = MAP.findPath(a.pos.x, a.pos.z, ai.lastPos ? ai.lastPos.x : tgt.pos.x, ai.lastPos ? ai.lastPos.z : tgt.pos.z, 700); ai.pi = 1; ai.repath = 1.0; }
      }
    } else {
      /* ---- patrol / hunt ---- */
      a.pitch = damp(a.pitch, 0, 6, dt);
      if (ai.state === 'cover'){
        ai.coverT = (ai.coverT || 0) + dt;
        if (a.hp > a.maxHp * .82 || ai.coverT > 5.5){ ai.state = 'patrol'; ai.coverT = 0; ai.dest = null; }
      }
      if (!ai.dest || v3len(ai.dest.x - a.pos.x, 0, ai.dest.z - a.pos.z) < 1.6 || ai.repath <= 0 && !ai.path){
        ai.dest = Game.mode === 'horde' ? this.hordePost(a) : MAP.half > 60 ? MAP.randomOpen(a.pos.x, a.pos.z, 70) : MAP.randomOpen();
        ai.path = MAP.findPath(a.pos.x, a.pos.z, ai.dest.x, ai.dest.z, 800); ai.pi = 1; ai.repath = 2.4 + rnd(1.6);
      }
      if (ai.path && ai.pi < ai.path.length){
        const n = ai.path[ai.pi];
        const dx = n.x - a.pos.x, dz = n.z - a.pos.z, dd = Math.hypot(dx, dz);
        if (dd < .8) ai.pi++;
        else {
          wishX = dx / dd; wishZ = dz / dd; speed = ai.state === 'cover' ? 6.2 : 3.9;
          a.yaw = damp(a.yaw, Math.atan2(dx, dz), 7, dt);
          if (n.y - a.pos.y > 1.0 && dd < 1.6) ai.jumpWant = true;
        }
        if (ai.pi >= ai.path.length) ai.path = null;
      } else {
        ai.path = null;
        wishX = Math.sin(now() * .0004 + a.pos.x) * .3; wishZ = Math.cos(now() * .0003 + a.pos.z) * .3; speed = 1.4;
      }
      /* passive reload */
      if (a.mag < d.mag * .5 && a.reloadT <= 0 && a.res > 0 && !d.melee) a.reloadT = reloadTime(d, d.mag - a.mag);
    }

    moveEntity(a, dt, wishX, wishZ, speed, ai.jumpWant);
    ai.jumpWant = false;
    /* bot regeneration */
    a.combatT = (a.combatT || 0) + dt;
    if (a.combatT > 3.2 && a.hp < a.maxHp) a.hp = Math.min(a.maxHp, a.hp + 26 * dt);
  },

  shoot(a, d, tgt, SK, dist){
    const eye = V3(a.pos.x, a.pos.y + a.eyeY(), a.pos.z);
    const aimY = tgt.pos.y + tgt.height * (tgt.kind === 'mon' ? .6 : (SK > 1.2 && dist < 22 ? .88 : .66));
    let dx = tgt.pos.x - eye.x, dy = aimY - eye.y, dz = tgt.pos.z - eye.z;
    const l = v3len(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
    /* lead + error */
    const tv = tgt.vel || { x: 0, z: 0 };
    const tof = l / 220;
    dx += (tv.x * tof) / l; dz += (tv.z * tof) / l;
    const err = (Math.min(d.hip, 2.4) * .5 + .55) * DEG * (1.9 / SK) * clamp(dist / 22, .5, 2.6) * (a.speed > 2 ? 1.6 : 1);
    const ra = rnd(TAU), rr = Math.random() * err;
    dx += Math.cos(ra) * rr; dy += Math.sin(ra) * rr * .7; dz += Math.cos(ra + 1) * rr;
    const dl = v3len(dx, dy, dz); dx /= dl; dy /= dl; dz /= dl;
    a.mag--; a.lastFire = now();
    const pan = clamp((a.pos.x - Player.pos.x) / 30, -1, 1);
    const distP = v3len(a.pos.x - Player.pos.x, a.pos.y - Player.pos.y, a.pos.z - Player.pos.z);
    SFX.shot(d.snd, distP, pan);
    /* buckshot: pellet cone around the (already error-perturbed) aim direction */
    const n = d.pellets || 1;
    const bs = basis(dx, dy, dz);
    const dirs = n > 1 ? spreadDirs(dx, dy, dz, d.hip * .8 * DEG, n, bs.right, bs.up) : [[dx, dy, dz]];
    const mz = a.muzzleWorld() || V3(eye.x + dx * .5, eye.y + dy * .5, eye.z + dz * .5);
    const hits = dirs.map(v => Combat.trace(eye.x, eye.y, eye.z, v[0], v[1], v[2], d.range, a.id, a.team));
    for (let i = 0; i < Math.min(dirs.length, 3); i++){
      const h = hits[i], v = dirs[i], far = h ? h.t : Math.min(l + 30, d.range);
      FX.tracer(mz.x, mz.y, mz.z, eye.x + v[0] * far, eye.y + v[1] * far, eye.z + v[2] * far, false);
    }
    FX.muzzle(mz.x, mz.y, mz.z);
    if (distP < 30) FX.shake(clamp(.16 - distP / 300, 0, .16));
    for (const [victim, e] of groupHits(hits, d)) Combat.applyDamage(victim, Math.round(e.dmg), a, e.head, d.id, dx, dy, dz, e.hit);
    let imp = 0;
    for (const h of hits) if (h && !h.actor && imp++ < 3){
      FX.impact(h, false);
      if (Math.random() < .5) FX.decal(h.x, h.y, h.z, h.nx, h.ny, h.nz, false);
    }
    a.combatT = 0;
  },
  meleeSwing(a, d, tgt){
    const dist = v3len(tgt.pos.x - a.pos.x, 0, tgt.pos.z - a.pos.z);
    SFX.noise(.12, .12, 1800, 500, 1.2, 'bandpass');
    if (dist < d.range + .4){
      Combat.applyDamage(tgt, Math.round(d.dmg * .8), a, false, d.id, (tgt.pos.x - a.pos.x) / dist, .3, (tgt.pos.z - a.pos.z) / dist, { x: tgt.pos.x, y: tgt.pos.y + 1, z: tgt.pos.z });
      FX.burst('blood', tgt.pos.x, tgt.pos.y + 1, tgt.pos.z, 0, .4, 0, 12, 6, .8);
    }
  },
  findCover(a, threat){
    const C = MAP.cover; let best = null, bs = -1e9;
    for (let i = 0; i < C.length; i++){
      const c = C[(Math.random() * C.length) | 0];
      const d = v3len(c.x - a.pos.x, 0, c.z - a.pos.z);
      if (d > 22 || d < 2) continue;
      const blocked = !MAP.los(c.x, a.pos.y + 1.2, c.z, threat.pos.x, threat.pos.y + 1.2, threat.pos.z);
      if (!blocked) continue;
      if (MAP.headBlocked(c.x, c.z, MAP.groundAt(c.x, c.z, 2, .1), 1.8)) continue;
      const s = -d + (c.h > 1.4 ? 8 : 4);
      if (s > bs){ bs = s; best = { x: c.x, z: c.z, y: MAP.groundAt(c.x, c.z, 2, .1) }; }
      if (best && Math.random() < .3) break;
    }
    return best;
  },
  hordePost(a){
    const s = MAP.spawns[(Math.random() * MAP.spawns.length) | 0];
    return s ? { x: s.x, z: s.z } : MAP.randomOpen();
  }
};
