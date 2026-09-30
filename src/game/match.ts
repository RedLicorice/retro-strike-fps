import { Outlines } from '../render/outlines';
import { applyFog } from '../render/fog';
import { now } from '../core/dom';
import { SHIELD_IDLE } from '../player/constants';
import { CHARACTERS } from '../data/characters';
import * as BABYLON from 'babylonjs';
import { Actor } from '../actors/actor';
import { BotAI } from '../ai/botAI';
import { SFX } from '../audio/sfx';
import { ctx } from '../core/context';
import { vis } from '../core/dom';
import { V3, clamp, damp, makeSeed, pick, rndi, v3len } from '../core/math';
import { Save } from '../core/save';
import { BOT_NAMES } from '../data/bots';
import { PRIMARY_IDS } from '../data/weapons';
import { FX } from '../fx/fx';
import { Net } from '../net/index';
import { Player } from '../player/player';
import { GFX } from '../render/postfx';
import { UI } from '../ui/index';
import { Menu } from '../ui/menuScene';
import { Wep } from '../weapons/weaponController';
import { MAP } from '../world/map/index';

export const gameMatch = {
  clear(){
    for (const a of this.actors) a.dispose();
    for (const m of this.monsters) m.dispose();
    for (const g of this.grenades) if (g.mesh) g.mesh.dispose(false, false);
    for (const f of this.fires) f.dispose();
    this.actors.length = 0; this.monsters.length = 0; this.grenades.length = 0; this.fires.length = 0;
    FX.clear();
  },

  setup(opts){
    /* opts: {mode, map, seed, bots, skill, limit, loadout, name, team} */
    this.mode = opts.mode || 'ffa';
    this.ff = this.mode === 'ffa';
    this.state = 'play';
    Menu.clear();
    UI.enterGame();
    try {
    this.mapId = opts.map || 'arena';
    this.seed = MAP.generate(opts.seed || makeSeed(), this.mapId);
    MAP.build();
    this.clear();
    this.score = [0, 0]; this.limit = opts.limit || 25; this.killLimit = this.limit;
    this.timeLeft = this.mode === 'horde' ? 0 : 300;
    this.wave = 0; this.waveQueue = 0; this.betweenT = 4; this.waveActive = false; this._flush = 5;
    this.elapsed = 0; this.ended = false; this.countT = 3.2; this.started = false;
    this.infiniteAmmo = this.mode === 'horde';

    /* lighting */
    try { this.lightSetup(); } catch (e){ console.warn('lightSetup', e); }

    /* local player actor */
    const team = this.mode === 'tdm' ? (opts.team === undefined ? 0 : opts.team) : 0;
    const me = new Actor('p0', opts.name || Save.data.name, team, false, 'sol', Save.data.character);
    me.isLocal = true; me.ai.skill = 2;
    this.local = me; this.actors.push(me);
    Player.id = me.id; Player.team = team; Player.name = me.name;
    Player.kills = 0; Player.deaths = 0; Player.score = 0; Player.streak = 0;
    me.wpn = (opts.loadout && opts.loadout[0]) || 'ak47';

    Wep.init(opts.loadout || Save.data.loadout);
    this.spawnLocal();

    /* bots */
    const nb = clamp(opts.bots === undefined ? 5 : opts.bots, 0, 7);
    const names = BOT_NAMES.slice();
    /* bots get distinct operators (different from the player's) until the roster runs out */
    const chars = CHARACTERS.map(c => c.id).filter(id => id !== Save.data.character);
    for (let i = 0; i < nb; i++){
      const nm = names.splice(rndi(names.length), 1)[0] || ('BOT' + i);
      const t = this.mode === 'tdm' ? (i % 2 === 0 ? 0 : 1) : this.mode === 'horde' ? 0 : (i % 2);
      const b = new Actor('b' + i, nm, t, true, 'sol', chars.length ? chars.splice(rndi(chars.length), 1)[0] : undefined);
      b.ai.skill = clamp(opts.skill === undefined ? 1 : opts.skill, 0, 2);
      b.team = this.mode === 'ffa' ? (i + 1) : t;
      if (this.mode === 'ffa') this.ff = true;
      const pool = this.mode === 'horde' ? ['mp5', 'm4a1', 'ak47', 'scar', 'm1014'] : PRIMARY_IDS;
      b.setWeapon(pick(pool));
      b.res = 999;
      this.actors.push(b);
      this.spawnActor(b);
    }
    if (this.mode !== 'tdm') this.ff = true; else this.ff = false;
    this.isAuthority = true;
    Net.onMatchStart && Net.onMatchStart(this.seed, this.mode);
    } catch (e){ console.error('setup', e); }
    UI.enterGame();
    UI.waveBanner(this.mode === 'horde' ? 'PREPARE' : this.mode.toUpperCase(), this.mode === 'horde' ? 'HORDE INCOMING' : 'MATCH START');
  },

  lightSetup(){
    if (this.sun){ this.sun.dispose(); this.sun = null; }
    if (this.hemi){ this.hemi.dispose(); }
    const hemi = new BABYLON.HemisphericLight('hemi', V3(.15, 1, .25), ctx.scene);
    hemi.intensity = .85;
    hemi.diffuse = new BABYLON.Color3(1, .88, .72);
    hemi.groundColor = new BABYLON.Color3(.38, .32, .24);
    hemi.specular = new BABYLON.Color3(.18, .16, .12);
    this.hemi = hemi;
    const sun = new BABYLON.DirectionalLight('sun', V3(-.55, -.72, -.38), ctx.scene);
    sun.position = V3(70, 55, 48);
    sun.intensity = 1.55;
    sun.diffuse = new BABYLON.Color3(1, .78, .48);
    sun.specular = new BABYLON.Color3(.85, .7, .45);
    this.sun = sun;
    /* big maps: a fixed-size shadow box that follows the camera instead of stretching over the whole city */
    if (this._sunObs){ ctx.scene.onBeforeRenderObservable.remove(this._sunObs); this._sunObs = null; }
    if (MAP.terrain){
      sun.autoUpdateExtends = false; sun.shadowFrustumSize = 120; sun.shadowMinZ = 1; sun.shadowMaxZ = 320;
      this._sunObs = ctx.scene.onBeforeRenderObservable.add(() => {
        const c = ctx.cam.position, d = sun.direction;
        sun.position.set(c.x - d.x * 150, c.y - d.y * 150, c.z - d.z * 150);
      });
    }
    if (this.shadow){ this.shadow.dispose(); this.shadow = null; }
    if (ctx.QUALITY !== 'low'){
      const sg = new BABYLON.ShadowGenerator(ctx.QUALITY === 'high' ? 1536 : 768, sun);
      sg.usePercentageCloserFiltering = true;
      sg.filteringQuality = BABYLON.ShadowGenerator.QUALITY_LOW;
      sg.bias = .001; sg.normalBias = .02;
      sg.darkness = .35;
      this.shadow = sg;
      for (const m of MAP.meshes) try { sg.addShadowCaster(m); } catch (e){ break; }
    }
    applyFog();
    ctx.scene.clearColor = new BABYLON.Color4(.58, .44, .28, 1);
    ctx.scene.ambientColor = new BABYLON.Color3(.5, .44, .36);
    GFX.init();
    GFX.dust(MAP.root);
  },

  /* -------- main match tick (host) -------- */
  update(dt){
    this.elapsed += dt;
    /* local actor mirror */
    const me = this.local;
    if (me){
      me.pos.copyFrom(Player.pos); me.yaw = Player.yaw; me.pitch = Player.pitch;
      me.hp = Player.hp; me.alive = Player.alive; me.vel.copyFrom(Player.vel); me.speed = Player.speed;
      me.kills = Player.kills; me.deaths = Player.deaths; me.score = Player.score;
      const H = Player.hang;
      me.hangD = H ? { clip: H.clip, t: H.t, x: H.rx, y: H.ry, z: H.rz, yaw: H.L.yaw } : null;
      me.stanceD = Player.sliding > 0 ? 0 : Player.stance; me.slidingD = Player.sliding > 0; me.aimingD = Wep.aiming; me.reloadingD = Wep.reloadT > 0; me.reloadDurD = Wep.reloadDur;
      if (Wep.def && Wep.def.id !== me.wpn) me.setWeapon(Wep.def.id, true);
      me.update(dt);
    }
    /* respawn */
    if (!Player.alive){
      Player.respawnT = (Player.respawnT || 3) - dt;
      ctx.cam.position.y = damp(ctx.cam.position.y, Player.pos.y + .35, 4, dt);
      ctx.cam.rotation.z = damp(ctx.cam.rotation.z, .5, 3, dt);
      if (Player.respawnT <= 0 && this.state === 'play'){
        if (this.mode === 'horde' && this.actors.filter(a => a.isLocal || a.isBot).every(a => !a.alive) && false){}
        this.spawnLocal(); Player.respawnT = 3;
        UI.toast('REDEPLOYED \u2014 SPAWN PROTECTED', 'g');
      }
    } else Player.respawnT = 3;

    for (const a of this.actors) if (a.spawnProt > 0) a.spawnProt -= dt;
    /* armour regen (host) — the local player's idle state comes from the controller */
    if (this.isAuthority) for (const a of this.actors){
      if (a.isLocal){ if (Player.combatT < SHIELD_IDLE) a.idleT = 0; a.tickShield(dt, Player.speed > .5 || Wep.trigger); }
      else a.tickShield(dt, a.speed > .5 || now() - a.lastFire < 400);
    }
    /* team outlines relative to the local player (by team, not by the friendly-fire flag: co-op teammates are allies) */
    for (const a of this.actors){
      if (a === me) continue;
      a.setOutline(!a.alive ? null : (this.mode !== 'ffa' && me && a.team === me.team) ? 'ally' : 'enemy');
    }
    for (const m of this.monsters) m.setOutline(m.alive ? 'enemy' : null);
    Outlines.sync([...this.actors, ...this.monsters].filter(a => a !== me && a.outlineKind)
      .map(a => [a.id + '/' + a.charId, a.outlineKind, a.outlineMeshes()] as [string, 'ally' | 'enemy', BABYLON.AbstractMesh[]]));

    /* cover detection for local player */
    let seen = false;
    for (const a of this.actors){
      if (a === me || !a.alive) continue;
      if (!this.ff && a.team === me.team) continue;
      const d = v3len(a.pos.x - Player.pos.x, 0, a.pos.z - Player.pos.z);
      if (d > 55) continue;
      if (MAP.los(a.pos.x, a.pos.y + a.eyeY(), a.pos.z, Player.pos.x, Player.pos.y + Player.eyeCur * .8, Player.pos.z)){ seen = true; break; }
    }
    if (this.mode === 'horde') for (const m of this.monsters){
      if (!m.alive) continue;
      if (v3len(m.pos.x - Player.pos.x, 0, m.pos.z - Player.pos.z) < 40 && MAP.los(m.pos.x, m.pos.y + 1.4, m.pos.z, Player.pos.x, Player.pos.y + 1, Player.pos.z)){ seen = true; break; }
    }
    Player.inCover = !seen;

    /* actors: bots think, everyone respawns, remote humans are driven by the network */
    if (this.isAuthority){
      for (const a of this.actors){
        if (a.isLocal) continue;
        if (!a.alive){
          a.respawnT -= dt; a.update(dt);
          if (a.respawnT <= 0 && this.state === 'play'){ a.respawnT = this.mode === 'horde' ? 4.5 : 3.2; this.spawnActor(a); }
          continue;
        }
        if (a.isBot) BotAI.update(a, dt);
        else a.speed = Math.hypot(a.vel.x, a.vel.z);
        a.update(dt);
      }
      this._flush = (this._flush === undefined ? 6 : this._flush) - dt;
      if (this._flush <= 0){ this._flush = 6; Save.flush(); }
      if (this.mode === 'horde') this.updateHorde(dt);
      /* timers */
      if (this.countT > 0){
        const c = this.countT; this.countT -= dt;
        if (Math.ceil(c) !== Math.ceil(this.countT) && Math.ceil(this.countT) > 0){ SFX.countdown(Math.ceil(this.countT) <= 1); UI.toast('' + Math.ceil(this.countT)); }
        if (this.countT <= 0){ this.started = true; SFX.countdown(true); UI.toast('ENGAGE', 'g'); }
      } else if (this.mode !== 'horde'){
        this.timeLeft -= dt;
        if (this.timeLeft <= 0) this.end();
      }
    }
    this.updateThrowables(dt);
    FX.update(dt);
  },

  checkEnd(){
    if (this.ended || this.state !== 'play') return;
    if (this.mode === 'ffa'){
      if (this.local && this.local.kills >= this.killLimit) this.end();
      else for (const a of this.actors) if (a.isBot && a.kills >= this.killLimit) { this.end(); break; }
    } else if (this.mode === 'tdm'){
      if (this.score[0] >= this.killLimit || this.score[1] >= this.killLimit) this.end();
    } else if (this.mode === 'horde'){
      const alive = this.actors.some(a => a.alive);
      if (!alive && this.started) this.end();
    }
  },

  end(){
    if (this.ended) return;
    this.ended = true; this.state = 'end';
    const s = Save.data.stats;
    s.matches++; s.time += Math.round(this.elapsed);
    let win = false;
    if (this.mode === 'tdm') win = this.score[Player.team] > this.score[1 - Player.team];
    else if (this.mode === 'horde') win = this.wave >= 3;
    else win = this.local && this.local.kills >= this.killLimit;
    if (win) s.wins++;
    Save.flush();
    UI.endMatch(win);
    document.exitPointerLock && document.exitPointerLock();
    Net.broadcast && Net.broadcast('end', { win: win, mode: this.mode, wave: this.wave });
  },

  toMenu(){
    this.state = 'menu'; this.clear(); MAP.dispose();
    vis('hud', false); vis('end', false); vis('score', false); vis('pause', false); vis('touch', false);
    UI.menuScene();
  }
};
