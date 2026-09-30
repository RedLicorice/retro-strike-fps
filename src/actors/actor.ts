import { ctx } from '../core/context';
import type { RigRoot } from '../core/types';
import * as BABYLON from 'babylonjs';
import { buildRig } from './rig';
import { Animator, DeathInfo } from './animator';
import { Models } from '../assets/models';
import { now } from '../core/dom';
import { PI, V3, clamp, pick, rnd } from '../core/math';
import { WBY, reloadTime } from '../data/weapons';
import { CHARACTERS, CHAR_BY } from '../data/characters';
import { MAP } from '../world/map/index';
import { SHIELD_IDLE, SHIELD_MAX, SHIELD_PER, SHIELD_REFILL } from '../player/constants';

/* ------------------------------ D2. ACTOR ------------------------------ */

export type ActorKind = 'sol' | 'mon' | 'none';

/* Any body in the arena: local player mirror, remote human, bot or horde monster.
   The host owns authoritative state; clients render interpolated copies. */
export class Actor {
  id: string;
  name: string;
  team: number;
  isBot: boolean;
  kind: ActorKind;
  isLocal: boolean;
  pos: BABYLON.Vector3;
  vel: BABYLON.Vector3;
  yaw: number;
  pitch: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  onGround: boolean;
  radius: number;
  height: number;
  wpn: string;
  mag: number;
  res: number;
  fireT: number;
  reloadT: number;
  kills: number;
  deaths: number;
  score: number;
  hs: number;
  streak: number;
  hitT: number;
  deathT: number;
  deathDir = 1;
  walk: number;
  speed: number;
  respawnT: number;
  /* armour plates (host-authoritative) and how long the operator has been idle */
  shield = SHIELD_MAX;
  idleT = 0;
  /* seconds of post-spawn invulnerability left (host-authoritative) */
  spawnProt = 0;
  stanceProne = false;
  stanceD = 0;
  slidingD = false;
  aimingD = false;
  /* reload presentation: local player / remote players set these; bots derive them from reloadT */
  reloadingD = false;
  lastThrow = 0;
  private seenFire = 0; private seenThrow = 0; private seenHit = false;
  reloadDurD = 0;
  private reloadSeen = 0;
  combatT = 99;
  inCover = false;
  lastAttacker: Actor | null = null;
  /* monster-only tuning */
  dmg = 0;
  spd = 0;
  /* menu-demo wander target */
  dest: { x: number; z: number } | null = null;
  gunNode: BABYLON.TransformNode | null;
  /* character model (soldiers) */
  charId = '';
  anim: Animator | null = null;
  deathInfo: DeathInfo | null = null;
  lastFire = 0;
  private lastPos = V3(0, 0, 0);
  private animV = V3(0, 0, 0);
  ai: any;
  net: any;
  rig: RigRoot;
  parts: Record<string, any>;

  constructor(id: string, name: string, team: number, isBot: boolean, kind?: ActorKind, charId?: string){
    this.id = id; this.name = name; this.team = team; this.isBot = isBot; this.kind = kind || 'sol';
    this.isLocal = false; this.pos = V3(0, 0, 0); this.vel = V3(0, 0, 0);
    this.yaw = 0; this.pitch = 0; this.hp = 100; this.maxHp = 100; this.alive = true;
    this.onGround = false; this.radius = kind === 'mon' ? .42 : .38; this.height = kind === 'mon' ? 1.72 : 1.78;
    this.wpn = 'ak47'; this.mag = 30; this.res = 120; this.fireT = 0; this.reloadT = 0;
    this.kills = 0; this.deaths = 0; this.score = 0; this.hs = 0; this.streak = 0;
    this.hitT = 0; this.deathT = 0; this.walk = 0; this.speed = 0; this.respawnT = 0; this.gunNode = null;
    this.ai = { t: rnd(.6), path: null, pi: 0, target: null, seen: 0, state: 'patrol', strafe: rnd(1, -1) > 0 ? 1 : -1, strafeT: 0, react: 0, err: 0, burst: 0, repath: 0, dest: null, aimY: 0, aimP: 0, jumpT: 0, skill: 1 };
    this.net = { p: V3(0, 0, 0), yaw: 0, pitch: 0, hp: 100, t: 0 };
    this.parts = {};
    if (this.kind === 'sol') this.setCharacter(charId || pick(CHARACTERS).id);
    else if (this.kind !== 'none'){
      const r = buildRig(this.kind, team); this.rig = r.root; this.parts = r.p;
      this.rig.rotation.y = 0;
    }
  }
  eyeY(){ return this.kind === 'mon' ? 1.45 : this.stanceProne ? .5 : 1.62; }

  /* swap the operator model (keeps position, weapon and state) */
  setCharacter(id: string){
    if (!CHAR_BY[id]) id = CHARACTERS[0].id;
    if (id === this.charId && this.rig) return;
    const enabled = this.rig ? this.rig.isEnabled() : true;
    this.disposeBody();
    this.charId = id;
    const inst = Models.ready ? Models.character(id) : null;
    this.rig = new BABYLON.TransformNode('actor_' + this.id, inst ? inst.root.getScene() : undefined) as any;
    if (inst){
      inst.root.parent = this.rig;
      this.anim = new Animator(inst);
    } else {
      /* assets unavailable: fall back to the procedural low-poly soldier */
      const r = buildRig('sol', this.team); r.root.parent = this.rig; this.parts = r.p;
    }
    this.rig.position.copyFrom(this.pos); this.rig.rotation.y = this.yaw;
    this.rig.setEnabled(enabled);
    if (this.wpn) this.setWeapon(this.wpn, true);
  }

  setWeapon(id: string, keepAmmo?: boolean){
    this.wpn = id; const d = WBY[id];
    const firearm = d && !d.melee && d.slot !== 2;
    if (this.anim){
      this.anim.setWeapon(firearm ? Models.weapon(id, false) : null, firearm ? Models.markers[id] : null, !firearm ? 'none' : d.slot === 1 ? 'pistol' : 'rifle');
    }
    if (firearm && !keepAmmo){ this.mag = d.mag; this.res = d.res; }
  }

  aabb(out){
    const hh = this.height * (this.kind === 'mon' ? 1 : .82);
    out.x0 = this.pos.x - this.radius; out.x1 = this.pos.x + this.radius;
    out.z0 = this.pos.z - this.radius; out.z1 = this.pos.z + this.radius;
    out.y0 = this.pos.y; out.y1 = this.pos.y + hh;
    return out;
  }

  update(dt){
    if (!this.rig) return;
    if (this.anim) this.updateModel(dt); else this.updateProcedural(dt);
    /* hit flash */
    if (this.hitT > 0){
      this.hitT -= dt;
      const on = this.hitT > 0;
      this.rig.getChildMeshes().forEach(m => { m.renderOverlay = on; if (on) m.overlayColor = this.kind === 'mon' ? new BABYLON.Color3(.9, .2, .1) : new BABYLON.Color3(1, .35, .25); });
      if (!on) this.hitT = 0;
    }
    if (this.reloadT > 0){
      this.reloadT -= dt;
      if (this.parts.armL) this.parts.armL.rotation.x = -.9 - Math.sin(now() * .012) * .1;
      if (this.reloadT <= 0){ const d = WBY[this.wpn]; if (d && !d.melee){ const need = d.mag - this.mag; const take = Math.min(need, this.res); this.mag += take; this.res -= take; } }
    }
  }

  dispose(){ this.disposeBody(); }

  /* host: plates refill one after another once idle (no damage taken/dealt, not moving) */
  tickShield(dt: number, moving: boolean){
    if (this.kind === 'mon' || !this.alive){ this.idleT = 0; return; }
    if (moving) this.idleT = 0; else this.idleT += dt;
    if (this.idleT > SHIELD_IDLE && this.shield < SHIELD_MAX) this.shield = Math.min(SHIELD_MAX, this.shield + SHIELD_PER / SHIELD_REFILL * dt);
  }

  /* team relation for the outline pass (render/outlines.ts): red enemies, blue allies, null = none */
  outlineKind: 'ally' | 'enemy' | null = null;
  setOutline(kind: 'ally' | 'enemy' | null){ this.outlineKind = kind; }
  /* meshes that make up the visible body (for the outline pass) */
  outlineMeshes(): BABYLON.AbstractMesh[] {
    if (!this.rig || !this.rig.isEnabled()) return [];
    /* the held weapon is part of the silhouette, otherwise it cuts an inner line across the body */
    const w = this.anim && this.anim.weapon ? this.anim.weapon.getChildMeshes() : [];
    return [...this.rig.getChildMeshes(), ...w].filter(m => m.isEnabled() && m.isVisible);
  }

  /* world-space muzzle of the held weapon model (null if none) */
  muzzleWorld(): BABYLON.Vector3 | null {
    const an = this.anim;
    if (!an || !an.weapon || !an.markers || !this.rig || !this.rig.isEnabled()) return null;
    return BABYLON.Vector3.TransformCoordinates(an.markers.muzzle, an.weapon.getWorldMatrix());
  }

  /* ---------------- presentation ---------------- */
  private disposeBody(){
    if (this.anim){ this.anim.dispose(); this.anim = null; }
    if (this.rig){ this.rig.dispose(false, false); this.rig = null; }
    this.parts = {};
  }

  private updateModel(dt){
    if (!this.alive) this.deathT += dt;
    const visible = (!this.isLocal || ctx.view3p > .5) && (this.alive || this.deathT < 4.4);
    this.rig.setEnabled(visible);
    if (!visible) return;
    this.rig.position.set(this.pos.x, this.pos.y, this.pos.z);
    /* velocity from motion, so bots, remote players and demos animate the same way */
    const k = Math.min(1, dt * 12), idt = 1 / Math.max(1e-3, dt);
    const tp = (this.pos.x - this.lastPos.x) * idt, tz = (this.pos.z - this.lastPos.z) * idt, ty = (this.pos.y - this.lastPos.y) * idt;
    const jumped = Math.abs(tp) > 30 || Math.abs(tz) > 30;           /* teleport (respawn) */
    if (!jumped){ this.animV.x += (tp - this.animV.x) * k; this.animV.z += (tz - this.animV.z) * k; this.animV.y += (ty - this.animV.y) * k; }
    else this.animV.set(0, 0, 0);
    this.lastPos.copyFrom(this.pos);
    const ground = MAP.groundAt ? MAP.groundAt(this.pos.x, this.pos.z, this.pos.y + .3, .9) : this.pos.y;
    /* reload layer: bots start reloads by setting reloadT; players report reloadingD */
    if (this.isBot){
      if (this.reloadT > 0 && this.reloadSeen <= 0){ this.reloadingD = true; this.reloadDurD = this.reloadT; }
      if (this.reloadT <= 0) this.reloadingD = false;
      this.reloadSeen = this.reloadT;
    }
    this.anim.setReload(this.alive && this.reloadingD, this.reloadDurD || reloadTime(WBY[this.wpn] || {}, 30), (this.stanceD | 0) === 2);
    this.anim.update(dt, {
      alive: this.alive,
      vx: this.animV.x, vz: this.animV.z, vy: this.animV.y,
      yaw: this.yaw,
      stance: clamp(this.stanceD | 0, 0, 2) as 0 | 1 | 2,
      sliding: !!this.slidingD,
      aiming: this.aimingD || now() - this.lastFire < 1400 || (this.isBot && this.ai.target && this.ai.seen > 0),
      airborne: this.alive && this.pos.y - ground > .35
    }, this.deathInfo);
    if (this.alive) this.deathInfo = null;
    /* the body can lag the view (turn-in-place) or face its crawl direction */
    this.rig.rotation.y = this.anim.bodyYaw !== null ? this.anim.bodyYaw : this.yaw;
    /* gameplay events -> upper-body one-shots */
    const prone = (this.stanceD | 0) === 2;
    if (this.lastFire && this.lastFire !== this.seenFire){ this.seenFire = this.lastFire; if (this.alive) this.anim.fire(prone); }
    if (this.lastThrow && this.lastThrow !== this.seenThrow){ this.seenThrow = this.lastThrow; if (this.alive) this.anim.throwGrenade(prone); }
    const hitNow = this.hitT > 0;
    if (hitNow && !this.seenHit && this.alive) this.anim.hit(prone);
    this.seenHit = hitNow;
  }

  private updateProcedural(dt){
    if (!this.alive){
      this.deathT += dt;
      const k = clamp(this.deathT * 3.4, 0, 1);
      this.rig.rotation.x = -k * PI / 2 * (this.deathDir || 1);
      this.rig.position.y = this.pos.y - clamp(this.deathT - 2.6, 0, 1) * .6;
      this.rig.position.x = this.pos.x; this.rig.position.z = this.pos.z;
      this.rig.rotation.y = this.yaw;
      if (this.deathT > 4.4) this.rig.setEnabled(false);
      return;
    }
    this.rig.setEnabled(!this.isLocal);
    this.rig.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.rig.rotation.y = this.yaw;
    this.rig.rotation.x = 0;
    /* walk cycle */
    const sp = this.speed;
    this.walk += dt * (2.4 + sp * 1.5);
    const sw = clamp(sp / 5, 0, 1.3);
    const P = this.parts;
    if (P.legL){
      P.legL.rotation.x = Math.sin(this.walk) * .78 * sw;
      P.legR.rotation.x = -Math.sin(this.walk) * .78 * sw;
      P.armL.rotation.x = -Math.sin(this.walk) * .42 * sw - (this.kind === 'mon' ? .9 : .55);
      P.armR.rotation.x = Math.sin(this.walk) * .3 * sw - (this.kind === 'mon' ? .9 : .62);
      P.torso.rotation.x = (this.kind === 'mon' ? .22 : .05) + Math.abs(Math.sin(this.walk)) * .03 * sw;
      if (P.head) P.head.rotation.x = this.kind === 'mon' ? -.18 : clamp(-this.pitch * .55, -.4, .4);
      if (P.bootL){ P.bootL.rotation.x = P.legL.rotation.x; P.bootR.rotation.x = P.legR.rotation.x; }
      P.torso.rotation.z = Math.sin(this.walk * .5) * .03 * sw;
    }
  }
}

