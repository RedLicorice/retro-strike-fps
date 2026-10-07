import { Wep } from '../weapons/weaponController';
import { groupHits } from '../combat/ballistics';
import { Actor } from '../actors/actor';
import { SFX } from '../audio/sfx';
import { Combat } from '../combat/index';
import { $, now } from '../core/dom';
import { V3, clamp, damp, lerp, v3len } from '../core/math';
import { Save } from '../core/save';
import { WBY, WEAPONS } from '../data/weapons';
import { FX } from '../fx/fx';
import { Game } from '../game/index';
import { Lobby } from '../game/lobby';
import { Player } from '../player/player';
import { UI } from '../ui/index';
import { MAP } from '../world/map/index';

export const netProtocol = {
  /* ---- host authoritative hooks (no-ops offline) ---- */
  get authority(){ return Game.isAuthority; },

  /* client -> host: every projectile direction of one trigger pull (1 for rifles, 9 for buckshot) */
  sendShot(ox, oy, oz, dirs: number[][], wpn){
    if (!this.online || this.isHost) return;
    this.send(this.peers[0], { k: 'shot', o: [ox, oy, oz], ds: dirs.map(v => [+v[0].toFixed(4), +v[1].toFixed(4), +v[2].toFixed(4)]), w: wpn });
  },

  hitEvent(tid, dmg, head, aid, wpn){ if (this.online && this.isHost) this.broadcast({ k: 'hit', t: tid, d: dmg, h: head ? 1 : 0, a: aid, w: wpn }); },

  killEvent(aid, tid, head, wpn){ if (this.online && this.isHost) this.broadcast({ k: 'kf', a: aid, t: tid, h: head ? 1 : 0, w: wpn }); },

  fxEvent(kind, arr){ if (this.online && this.isHost) this.broadcast({ k: 'fx', t: kind, v: arr }); },

  act(kind, data){ if (this.online && !this.isHost) this.send(this.peers[0], { k: 'act', t: kind, v: data }); },

  lobbySync(){ if (this.online && this.isHost) this.broadcast({ k: 'lobby', slots: Lobby.slots.map(s => ({ n: s.name, t: s.type, tm: s.team, lv: s.lv })), seed: Lobby.seed, mode: Lobby.mode, map: Lobby.map, limit: Lobby.limit }); },

  /* ---- receive ---- */
  onMsg(peer, raw){
    let m; try { m = JSON.parse(raw); } catch (e){ return; }
    if (!m || !m.k) return;
    switch (m.k){
      case 'hello':
        peer.name = m.name; peer.loadout = m.loadout;
        if (this.isHost){
          const slot = Lobby.slots.findIndex(s => s.type === 'empty');
          if (slot >= 0){ Lobby.slots[slot] = { type: 'player', name: m.name || 'GUEST', team: Lobby.mode === 'tdm' ? 1 : slot % 2, id: peer.actorId, lv: 1 }; }
          UI.buildSlots(); this.lobbySync();
        }
        break;
      case 'welcome':
        this.myId = m.id; Lobby.seed = m.seed; Lobby.mode = m.mode; Lobby.limit = m.limit; Lobby.map = m.map || 'arena';
        Game.setup({ mode: m.mode, map: Lobby.map, seed: m.seed, bots: 0, limit: m.limit, loadout: Save.data.loadout, name: Save.data.name, team: m.team });
        Game.isAuthority = false;
        Game.local.id = m.id; Player.id = m.id;
        UI.toast('JOINING ' + (m.hostName || 'HOST') + "'S ARENA", 'g');
        break;
      case 'in': {
        if (!this.isHost) return;
        const a = Game.actors.find(x => x.id === peer.actorId);
        if (!a) return;
        const d = v3len(m.p[0] - a.pos.x, 0, m.p[2] - a.pos.z);
        const k = d > 1.6 ? 1.6 / d : 1;                       /* sanity clamp vs teleport hacks */
        a.pos.set(lerp(a.pos.x, m.p[0], k), m.p[1], lerp(a.pos.z, m.p[2], k));
        a.yaw = m.y; a.pitch = m.pt; a.stanceD = m.s; a.slidingD = !!m.sl; a.reloadingD = !!m.rl; if (m.rl) a.reloadDurD = m.rl; a.vel.set(m.v ? m.v[0] : 0, 0, m.v ? m.v[2] : 0);
        a.hangD = decodeHang(m.hg);
        a.name = m.n || a.name;
        if (m.ch && m.ch !== a.charId) a.setCharacter(m.ch);
        break;
      }
      case 'shot': {
        if (!this.isHost) return;
        const a = Game.actors.find(x => x.id === peer.actorId);
        if (!a || !a.alive) return;
        const w = WBY[m.w]; if (!w) return;
        const t = now();
        if (a._lastShot && t - a._lastShot < (60 / w.rpm) * 1000 * .72) return;   /* RPM gate */
        a._lastShot = t;
        const eyeD = v3len(m.o[0] - a.pos.x, m.o[1] - (a.pos.y + a.eyeY()), m.o[2] - a.pos.z);
        if (eyeD > 2.2) return;                                                   /* origin gate */
        /* projectile gate: never more pellets than the weapon fires, all near the first direction */
        const ds: number[][] = Array.isArray(m.ds) ? m.ds.slice(0, w.pellets || 1) : (m.d ? [m.d] : []);
        if (!ds.length) return;
        const c = ds[0], cone = Math.cos(Math.max(w.hip, 6) * 2.5 * Math.PI / 180);
        if (ds.some(v => v[0] * c[0] + v[1] * c[1] + v[2] * c[2] < cone)) return;
        a.lastFire = t;
        const hits = ds.map(v => Combat.trace(m.o[0], m.o[1], m.o[2], v[0], v[1], v[2], w.range, a.id, a.team));
        const mz = V3(m.o[0] + c[0] * .5, m.o[1] + c[1] * .5, m.o[2] + c[2] * .5);
        for (let i = 0; i < Math.min(ds.length, 4); i++){
          const h = hits[i], v = ds[i];
          FX.tracer(mz.x, mz.y, mz.z, h ? h.x : m.o[0] + v[0] * w.range, h ? h.y : m.o[1] + v[1] * w.range, h ? h.z : m.o[2] + v[2] * w.range, w.dmg > 60);
        }
        FX.muzzle(m.o[0] + c[0] * .6, m.o[1] + c[1] * .6, m.o[2] + c[2] * .6);
        for (const [victim, e] of groupHits(hits, w)) Combat.applyDamage(victim, Math.round(e.dmg), a, e.head, w.id, c[0], c[1], c[2], e.hit);
        let imp = 0;
        for (const h of hits) if (h && !h.actor && imp++ < 4){ FX.impact(h, false); this.broadcast({ k: 'fx', t: 'imp', v: [h.x, h.y, h.z, h.nx, h.ny, h.nz, h.mat] }, peer); }
        break;
      }
      case 'act':
        if (!this.isHost) return;
        if (m.t === 'throw'){ const a = Game.actors.find(x => x.id === peer.actorId); if (a){ a.lastThrow = now(); const d = WBY[m.v[0]]; if (d) Game.spawnThrowable(d, V3(m.v[1], m.v[2], m.v[3]), V3(m.v[4], m.v[5], m.v[6]), a); } }
        break;
      case 'ping': this.send(peer, { k: 'pong', t: m.t }); break;
      case 'pong': this.rtt = Math.round(now() - m.t); $('ndRtt').textContent = this.rtt + 'ms'; break;
      case 'lobby':
        if (m.id) this.myId = m.id;
        Lobby.slots = m.slots.map(s => ({ type: s.t, name: s.n, team: s.tm, lv: s.lv }));
        Lobby.seed = m.seed; Lobby.mode = m.mode; Lobby.limit = m.limit || Lobby.limit; Lobby.map = m.map || 'arena';
        if (Game.state !== 'play'){
          const im = $('inMap') as HTMLSelectElement; if (im) im.value = Lobby.map;
          if (MAP.seed !== Lobby.seed || MAP.mapId !== Lobby.map) UI.newArena(Lobby.seed);
          UI.buildSlots(); UI.previewDraw(); UI.showSection('play');
        }
        break;
      case 'start': Lobby.seed = m.seed; Lobby.mode = m.mode; Lobby.limit = m.limit; Lobby.map = m.map || 'arena';
        Game.setup({ mode: m.mode, map: Lobby.map, seed: m.seed, bots: 0, limit: m.limit, loadout: Save.data.loadout, name: Save.data.name, team: m.team });
        Game.isAuthority = false; break;
      /* ---- client-side presentation ---- */
      case 'snap': this.applySnap(m); break;
      case 'hit': {
        if (m.a === this.myId){ UI.hitmarker(!!m.h, false); SFX[m.h ? 'headshot' : 'hit'](); }
        if (m.t === this.myId){ FX.shake(.3 + m.d / 140); SFX.hurt(0); UI.hurtFlash(m.d); }
        break;
      }
      case 'kf': {
        const k = m.a ? Game.actors.find(x => x.id === m.a) : null;
        const v = Game.actors.find(x => x.id === m.t) || Game.monsters.find(x => x.id === m.t);
        if (v){
          UI.feedKill(k || { name: m.a || '???' }, v, !!m.h, m.w);
          v.deathInfo = k ? { head: !!m.h, fromX: k.pos.x - v.pos.x, fromZ: k.pos.z - v.pos.z } : { head: !!m.h };
        }
        break;
      }
      case 'fx': this.applyFx(m); break;
      case 'end': Game.state = 'end'; UI.endMatch(!!m.win); break;
    }
  },

  applySnap(m){
    for (const s of m.a){
      let a = Game.actors.find(x => x.id === s[0]);
      if (!a){
        if (s[0] === this.myId) continue;
        a = new Actor(s[0], s[9] || 'GUEST', s[13] | 0, false, 'sol', s[14]); a.isBot = false;
        Game.actors.push(a);
        const wi = clamp(s[10] | 0, 0, WEAPONS.length - 1);
        a.setWeapon(WEAPONS[wi] ? WEAPONS[wi].id : 'ak47');
      }
      if (a.isLocal){
        /* host authoritative vitals for the local player */
        if (s[4] > 0 && !Player.alive) Game.spawnLocal();
        Player.hp = lerp(Player.hp, s[4], .5); Game.local.hp = s[4];
        if (s[16] !== undefined) Game.local.shield = s[16];
        Game.local.kills = s[6]; Game.local.deaths = s[7]; Game.local.score = s[8];
        Player.kills = s[6]; Player.deaths = s[7]; Player.score = s[8];
        continue;
      }
      a.net.tx = s[1]; a.net.ty = s[2]; a.net.tz = s[3]; a.net.yaw = s[11] || 0; a.net.pitch = s[12] || 0;
      a.hp = s[4]; a.alive = s[5] > 0;
      if (s[13] !== undefined) a.team = s[13];
      if (s[14] && s[14] !== a.charId) a.setCharacter(s[14]);
      if (s[16] !== undefined) a.shield = s[16];
      if (s[15] !== undefined){ a.stanceD = s[15] & 3; a.slidingD = !!(s[15] & 8); a.reloadingD = !!(s[15] & 16); }
      if (!a.isLocal) a.hangD = decodeHang(s[17]);
      const wid = WEAPONS[clamp(s[10] | 0, 0, WEAPONS.length - 1)];
      if (wid && wid.id !== a.wpn) a.setWeapon(wid.id);
      a.kills = s[6]; a.deaths = s[7]; a.score = s[8];
      if (a.name !== s[9] && s[9]) a.name = s[9];
      if (!a.alive && a.deathT === 0) a.deathT = .001;
    }
    if (m.s){ Game.score[0] = m.s[0]; Game.score[1] = m.s[1]; }
    if (m.tl !== undefined) Game.timeLeft = m.tl;
    if (m.w !== undefined){ Game.wave = m.w; Game.waveQueue = m.wq || 0; }
  },

  applyFx(m){
    const v = m.v;
    if (m.t === 'imp') FX.impact({ x: v[0], y: v[1], z: v[2], nx: v[3], ny: v[4], nz: v[5], mat: v[6] }, false);
    else if (m.t === 'exp'){ Combat.explode(v[0], v[1], v[2], v[3], 0, null, 'frag'); }
    else if (m.t === 'flash'){ Combat.flashbang(v[0], v[1], v[2], v[3]); }
    else if (m.t === 'fire'){ Combat.fireArea(v[0], v[1], v[2], v[3], v[4], null); }
    else if (m.t === 'throw'){ const d = WBY[v[0]]; if (d) Game.spawnThrowable(d, V3(v[1], v[2], v[3]), V3(v[4], v[5], v[6]), null); }
    else if (m.t === 'shot'){ FX.tracer(v[0], v[1], v[2], v[3], v[4], v[5], false); FX.muzzle(v[0], v[1], v[2]); }
  },

  /* ---- per-frame networking ---- */
  tick(dt){
    this.st.t += dt;
    if (this.st.t > .5){ this.st.rate = Math.round(this.st.in / this.st.t); this.st.t = 0; this.st.in = 0;
      $('ndRate').textContent = this.st.rate; $('ndOut').textContent = this.st.out; }
    if (!this.online) return;
    if (this.isHost){
      this.snapAcc += dt;
      if (this.snapAcc >= 1 / 20 && Game.state === 'play'){
        this.snapAcc = 0;
        const arr = Game.actors.map(a => [a.id, +a.pos.x.toFixed(2), +a.pos.y.toFixed(2), +a.pos.z.toFixed(2), Math.round(a.hp), a.alive ? 1 : 0, a.kills, a.deaths, a.score, a.name, WEAPONS.findIndex(w => w.id === a.wpn), +a.yaw.toFixed(2), +a.pitch.toFixed(2), a.team | 0, a.charId, (a.stanceD | 0) | (a.slidingD ? 8 : 0) | (a.reloadingD ? 16 : 0), Math.round(a.shield || 0), (h => h ? [h.clip, +h.t.toFixed(2), +h.x.toFixed(2), +h.y.toFixed(2), +h.z.toFixed(2), +h.yaw.toFixed(3)] : 0)(a.hangD)]);
        this.broadcast({ k: 'snap', a: arr, s: [Game.score[0], Game.score[1]], tl: Math.round(Game.timeLeft), w: Game.wave, wq: Game.waveQueue || 0 });
      }
      if (Math.random() < dt * .5) for (const p of this.peers) this.send(p, { k: 'ping', t: now() });
    } else {
      this.inAcc += dt;
      if (this.inAcc >= 1 / 30 && Game.state === 'play'){
        this.inAcc = 0;
        const p = this.peers[0];
        if (p) this.send(p, { k: 'in', p: [+Player.pos.x.toFixed(2), +Player.pos.y.toFixed(2), +Player.pos.z.toFixed(2)], y: +Player.yaw.toFixed(3), pt: +Player.pitch.toFixed(3), s: Player.stance, sl: Player.sliding > 0 ? 1 : 0, rl: Wep.reloadT > 0 ? +Wep.reloadDur.toFixed(2) : 0, v: [+Player.vel.x.toFixed(1), 0, +Player.vel.z.toFixed(1)], n: Save.data.name, ch: Save.data.character, hg: (h => h ? [h.clip, +h.t.toFixed(2), +h.x.toFixed(2), +h.y.toFixed(2), +h.z.toFixed(2), +h.yaw.toFixed(3)] : 0)(Game.local && Game.local.hangD) });
      }
      if (Math.random() < dt * .5) this.send(this.peers[0], { k: 'ping', t: now() });
      /* interpolate remote actors */
      for (const a of Game.actors){
        if (a.isLocal) continue;
        if (a.net.tx !== undefined){
          a.pos.x = damp(a.pos.x, a.net.tx, 14, dt); a.pos.y = damp(a.pos.y, a.net.ty, 14, dt); a.pos.z = damp(a.pos.z, a.net.tz, 14, dt);
          a.yaw = damp(a.yaw, a.net.yaw, 12, dt); a.pitch = damp(a.pitch, a.net.pitch, 12, dt);
          a.speed = v3len(a.net.tx - a.pos.x, 0, a.net.tz - a.pos.z) * 14;
        }
        a.update(dt);
      }
      for (const m of Game.monsters) m.update(dt);
    }
  }
};

/* [clip, t, x, y, z, yaw] | 0  ->  Actor.hangD */
function decodeHang(h: any){
  return Array.isArray(h) && typeof h[0] === 'string' ? { clip: h[0], t: +h[1] || 0, x: +h[2], y: +h[3], z: +h[4], yaw: +h[5] || 0 } : null;
}
