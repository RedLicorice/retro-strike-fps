import { FPArms } from '../render/fpArms';
import { track } from '../dev/telemetry';
import * as BABYLON from 'babylonjs';
import { SFX } from '../audio/sfx';
import { Combat } from '../combat/index';
import { ctx } from '../core/context';
import { $, now } from '../core/dom';
import { DEG, PI, TAU, V3, clamp, damp, lerp, rnd, v3len } from '../core/math';
import { Save } from '../core/save';
import { WBY } from '../data/weapons';
import { FX } from '../fx/fx';
import { Game } from '../game/index';
import { Input } from '../input/input';
import { Net } from '../net/index';
import { Player } from '../player/player';
import { buildThrowable } from '../render/gunModels';
import { buildViewWeapon, viewPlacement } from '../render/viewmodel';
import { groupHits, spreadDirs } from '../combat/ballistics';
import { reloadTime } from '../data/weapons';
import { UI } from '../ui/index';

/* ------------------------------ C4. WEAPON RUNTIME ------------------------------ */
/* aim-in/out takes 70% of each weapon's adsT (30% faster than the base data) */
const ADS_TIME_SCALE = .7;

export const Wep = {
  ids: ['ak47', 'm1911', 'frag'], slot: 0, def: null, vm: null, vmPos: V3(.24, -.22, .62), vmRot: V3(0, 0, 0),
  ammo: {} as Record<string, { mag: number; res: number }>, aimT: 0, aiming: false, recP: 0, recY: 0, kick: 0, kickR: 0, fireT: 0, trigger: false,
  reloadT: 0, reloadDur: 0, reloadStage: 0, swapT: 0, spray: 0, sprayT: 0, lastShot: 0, meleeT: 0, meleeDir: 1,
  throwCd: 0, fp: null as FPArms | null, thCount: {} as Record<string, number>, vmMuz: null, adsPos: V3(0, 0, 0), adsRot: V3(0, 0, 0), scoped: false, dryT: 0,

  init(loadout){
    /* experimental: first-person arms from the operator model (the rifle clips are third-person poses) */
    const wantArms = !!Save.data.settings.fpArms;
    if (this.fp && (!wantArms || this.fp.charId !== Save.data.character)){ this.fp.dispose(); this.fp = null; }
    if (wantArms && !this.fp) this.fp = FPArms.create(Save.data.character);
    this.ids = [loadout[0] || 'ak47', loadout[1] || 'm1911', loadout[2] || 'frag'];
    this.ammo = {}; this.thCount = {};
    for (const id of this.ids){
      const d = WBY[id]; if (!d) continue;
      if (d.slot === 2) this.thCount[id] = d.count;
      else this.ammo[id] = { mag: d.mag, res: d.res };
    }
    this.slot = 0; this.build();
  },
  defOf(i){ return WBY[this.ids[i]]; },
  build(){
    if (this.vm){ this.vm.dispose(false, false); this.vm = null; }
    const d = this.defOf(this.slot); this.def = d; if (!d) return;
    const firearm = d.slot !== 2;
    if (this.fp) this.fp.setWeapon(firearm ? d.id : null);
    const view = firearm && !this.fp ? buildViewWeapon(d) : null;
    if (firearm && this.fp){
      /* operator's own arms hold the gun; `vm` is just the pose they are fitted to */
      this.vm = new BABYLON.TransformNode('vmPose', ctx.scene);
      this.fp.pose = this.vm; this.vmMuz = V3(0, 0, .5);
      const pl = viewPlacement(d);
      this.vmPos.copyFrom(pl.hip); this.adsPos.copyFrom(pl.ads);
    } else if (view){
      /* fallback (no character model): weapon GLB with box gloves */
      this.vm = view.root; this.vmMuz = view.muzzle;
      const pl = viewPlacement(d);
      this.vmPos.copyFrom(pl.hip); this.adsPos.copyFrom(pl.ads);
    } else {
      this.vm = buildThrowable(d.id, true);
      this.vmMuz = V3(0, 0, .5);
      this.vmPos.set(.235, -.215, .60); this.adsPos.set(0, -.08, -.10);
    }
    this.vm.parent = ctx.cam;
    this.adsRot.set(0, 0, 0);
    this.scoped = d.sight === 'scope4' || d.sight === 'scope10';
    this.reloadT = 0; this.reloadStage = 0; UI.reloadBar(-1);
    this.swapT = .32; this.fireT = Math.max(this.fireT, .25);
    UI.gunChanged();
  },
  switchTo(i, silent){
    i = ((i % 3) + 3) % 3;
    if (i === this.slot && !silent) return;
    const d = this.defOf(i); if (!d) return;
    if (d.slot === 2 && (this.thCount[d.id] || 0) <= 0 && !silent){ SFX.deny(); UI.toast('NO THROWABLES LEFT', 'r'); return; }
    track('weapon-switch', { to: d.id, slot: i, via: silent ? 'auto' : 'input' });
    this.slot = i; this.build(); this.aimT = 0; this.spray = 0;
    SFX.swap(); Save.data.loadout[i] = d.id;
  },
  cycle(dir){
    let i = this.slot;
    for (let k = 0; k < 3; k++){
      i = (i + dir + 3) % 3;
      const d = this.defOf(i);
      if (d && (d.slot !== 2 || (this.thCount[d.id] || 0) > 0)){ this.switchTo(i); return; }
    }
  },
  mag(){ const a = this.ammo[this.def && this.def.id]; return a ? a.mag : 0; },
  res(){ const a = this.ammo[this.def && this.def.id]; return a ? a.res : 0; },
  fovTarget(){
    const S = Save.data.settings;
    /* UI slider is horizontal FOV (authentic to the era); Babylon wants vertical */
    const asp = ctx.engine ? Math.max(.6, ctx.engine.getRenderWidth() / Math.max(1, ctx.engine.getRenderHeight())) : 1.7;
    const base = 2 * Math.atan(Math.tan(S.fov * DEG * .5) / asp);
    if (!this.def) return base;
    const a = this.aimT;
    /* third person aims over the shoulder: a mild zoom, never the sights / scope zoom */
    const t = ctx.view3p > .5 ? base * .82 : this.scoped ? (this.def.sight === 'scope10' ? 8 * DEG : 17 * DEG) : base * .78;
    return lerp(base, t, a) + (Player.sliding > 0 ? .07 : 0) + (Player.sprint && a < .1 ? .05 : 0);
  },
  reload(force){
    const d = this.def; if (!d || d.melee || d.slot === 2) return;
    const a = this.ammo[d.id]; if (!a || this.reloadT > 0) return;
    if (!force && a.mag >= d.mag) return;
    if (a.res <= 0 && !Game.infiniteAmmo){ SFX.deny(); UI.toast('NO RESERVE AMMO', 'r'); return; }
    this.reloadDur = reloadTime(d, d.mag - a.mag) * (Save.w(d.id).lvl > 4 ? .88 : 1);
    this.reloadT = this.reloadDur; this.reloadStage = 0; this.aiming = false;
    SFX.reloadA();
  },
  finishReload(){
    const d = this.def, a = this.ammo[d.id]; if (!a) return;
    const need = d.mag - a.mag;
    if (Game.infiniteAmmo){ a.mag = d.mag; }
    else { const take = Math.min(need, a.res); a.mag += take; a.res -= take; }
    SFX.reloadB();
  },
  spreadNow(){
    const d = this.def; if (!d || d.melee) return 0;
    const base = lerp(d.hip, Math.max(.02, d.ads), this.aimT) * DEG;
    const mv = clamp(Player.speed / 6, 0, 1.4) * (this.aimT > .6 ? .5 : 1);
    const air = Player.onGround ? 0 : 1.7;
    const st = Player.stance === 2 ? .55 : Player.stance === 1 ? .8 : 1;
    const spr = Player.sliding > 0 ? 2.4 : 0;
    return base * (1 + mv * .9 + air + spr) * st * Save.spreadMul(d.id) * (1 + this.spray * .16);
  },
  canFire(){
    const d = this.def; if (!d || Player.spawnT > 0) return false;
    if (this.reloadT > 0 || this.swapT > 0) return false;
    if (d.slot === 2) return this.throwCd <= 0 && (this.thCount[d.id] || 0) > 0;
    if (d.melee) return this.fireT <= 0 && this.meleeT <= 0;
    return this.fireT <= 0;
  },
  fire(){
    const d = this.def; if (!d) return;
    if (d.slot === 2){ this.throwIt(); return; }
    if (d.melee){ this.melee(); return; }
    const a = this.ammo[d.id];
    if (a.mag <= 0){ if (this.dryT <= 0){ SFX.dry(); this.dryT = .35; if (a.res > 0 || Game.infiniteAmmo) this.reload(); } return; }
    a.mag--; this.fireT = 60 / d.rpm; this.dryT = .35;
    this.lastShot = now();
    const lvl = Save.w(d.id).lvl;
    const sp = this.spreadNow();
    /* camera basis */
    const fwd = ctx.cam.getDirection(BABYLON.Axis.Z);
    const right = ctx.cam.getDirection(BABYLON.Axis.X);
    const up = ctx.cam.getDirection(BABYLON.Axis.Y);
    const adv = Player.tpAdvance || 0;
    const ox = ctx.cam.position.x + fwd.x * adv, oy = ctx.cam.position.y + fwd.y * adv, oz = ctx.cam.position.z + fwd.z * adv;
    if (Game.local) Game.local.lastFire = now();
    /* spray pattern */
    this.spray = Math.min(9, this.spray + 1);
    const pat = Math.min(this.spray - 1, 11);
    const pv = (1 - Math.cos(pat * .52)) * .55 + pat * .045;
    const ph = Math.sin(pat * 1.31) * (.14 + pat * .022);
    /* one direction per projectile: rifles get the spray pattern, shotguns a pellet cone around the crosshair */
    const pellets = d.pellets || 1;
    const dirs = spreadDirs(fwd.x, fwd.y, fwd.z, sp, pellets, right, up);
    const dx = dirs[0][0], dy = dirs[0][1], dz = dirs[0][2];

    /* world muzzle position */
    const mz = this.muzzleWorld();
    const hits = dirs.map(v => Combat.trace(ox, oy, oz, v[0], v[1], v[2], d.range, Player.id, Player.team));
    for (let i = 0; i < dirs.length; i++){
      if (i > 3) break;                                          /* a few tracers read better than nine */
      const h = hits[i], v = dirs[i];
      FX.tracer(mz.x, mz.y, mz.z, h ? h.x : ox + v[0] * d.range, h ? h.y : oy + v[1] * d.range, h ? h.z : oz + v[2] * d.range, d.dmg > 60);
    }
    FX.muzzle(mz.x, mz.y, mz.z);
    if (Math.random() < .85 && d.act !== 'pump' && d.act !== 'lever' && d.act !== 'bolt') FX.shell(V3(mz.x - right.x * .06, mz.y - .06, mz.z - right.z * .06), right, up);

    /* recoil + shake */
    const rm = Save.recMul(d.id);
    const recV = d.rec[0] * rm * (1 - this.aimT * .28), recH = d.rec[1] * rm;
    this.recP += recV * DEG * .82 * (1 + pv * .3);
    this.recY += (ph + rnd(recH, -recH) * .5) * DEG;
    Player.pitch -= recV * DEG * .42;
    Player.yaw += ph * DEG * .22;
    this.kick = 1; this.kickR = 1;
    FX.shake(d.dmg * pellets > 60 ? .55 : .16 + d.rpm / 3400);
    SFX.shot(d.snd, 0, 0);
    /* manual actions: work the bolt / pump / lever between shots */
    if (d.act === 'bolt' || d.act === 'pump' || d.act === 'lever') setTimeout(() => SFX.reloadB(), 60000 / d.rpm * .4);
    Net.sendShot && Net.sendShot(ox, oy, oz, dirs, d.id);

    /* mastery: every weapon tracks its own usage (shots / hits / damage / kills) */
    const w = Save.w(d.id);
    w.shots++; Save.data.stats.shots++; Save.addXP(d.id, 1);
    if (hits.some(h => h)){ w.hits++; Save.data.stats.hits++; }
    /* damage resolution is host-authoritative */
    let impacts = 0;
    for (const h of hits) if (h && !h.actor && impacts++ < 4){
      FX.impact(h, false);
      if (Game.isAuthority) Net.fxEvent && Net.fxEvent('imp', [h.x, h.y, h.z, h.nx, h.ny, h.nz, h.mat]);
    }
    if (Game.isAuthority){
      let anyHead = false, any = false;
      for (const [victim, e] of groupHits(hits, d)){
        const dmg = Math.round(e.dmg * Save.dmgMul(d.id));
        Combat.applyDamage(victim, dmg, Player, e.head, d.id, dx, dy, dz, e.hit);
        w.dmg += dmg; any = true; anyHead = anyHead || e.head;
        Save.addXP(d.id, e.head ? 9 : 5);
      }
      if (any){ UI.hitmarker(anyHead, false); SFX[anyHead ? 'headshot' : 'hit'](); }
    }
    Player.combatT = 0;
    if (a.mag === 0 && (a.res > 0 || Game.infiniteAmmo)) setTimeout(() => { if (this.reloadT <= 0 && this.slot === this.slot) this.reload(); }, 160);
  },
  melee(){
    const d = this.def;
    this.meleeT = 60 / d.rpm * .9; this.fireT = 60 / d.rpm; this.meleeDir *= -1;
    this.kick = 1.2;
    SFX.noise(.14, .22, 1800, 500, 1.2, 'bandpass');
    const fwd = ctx.cam.getDirection(BABYLON.Axis.Z);
    const hit = Combat.trace(ctx.cam.position.x, ctx.cam.position.y, ctx.cam.position.z, fwd.x, fwd.y, fwd.z, d.range, Player.id, Player.team);
    if (Game.isAuthority && hit && hit.actor){
      const dmg = Math.round(d.dmg * Save.dmgMul(d.id) * (hit.head ? d.hs : 1));
      Combat.applyDamage(hit.actor, dmg, Player, hit.head, d.id, fwd.x, fwd.y, fwd.z, hit);
      UI.hitmarker(hit.head, false); SFX.hit();
      FX.burst('blood', hit.x, hit.y, hit.z, -fwd.x, .4, -fwd.z, 12, 6, .8);
      Save.addXP(d.id, 12);
    } else if (hit){ FX.impact(hit, false); SFX.noise(.1, .2, 3000, 900, 2); }
    Player.combatT = 0;
  },
  throwIt(){
    const d = this.def; if (!d || d.slot !== 2) return;
    if (this.throwCd > 0 || (this.thCount[d.id] || 0) <= 0){ SFX.deny(); return; }
    this.thCount[d.id]--; this.throwCd = 1.05; this.kick = 1.4;
    const fwd = ctx.cam.getDirection(BABYLON.Axis.Z);
    const mz = this.muzzleWorld();
    Game.spawnThrowable(d, mz, V3(fwd.x * 17 + Player.vel.x * .4, fwd.y * 14 + 2.6, fwd.z * 17 + Player.vel.z * .4), Player);
    SFX.pin(); Player.combatT = 0;
    if (Game.local) Game.local.lastThrow = now();
    if (this.thCount[d.id] <= 0) setTimeout(() => { if (this.slot === 2) this.switchTo(0); }, 420);
    UI.gunChanged();
  },
  muzzleWorld(){
    if (ctx.view3p > .5 && Game.local){ const m = Game.local.muzzleWorld(); if (m) return m; }
    if (this.fp && this.fp.enabled){ const m = this.fp.muzzleWorld(); if (m) return m; }
    if (!this.vm) return ctx.cam.position.clone();
    const local = this.vmMuz;
    const m = this.vm.getWorldMatrix();
    const p = BABYLON.Vector3.TransformCoordinates(local.scale(this.vm.scaling.x), m);
    return p;
  },
  update(dt){
    const d = this.def; if (!d) return;
    if (!Player.alive || Game.state !== 'play'){
      if (this.vm) this.vm.setEnabled(false);
      if (this.fp) this.fp.setEnabled(false);
      /* dying cancels a reload in progress (and its HUD bar) */
      if (this.reloadT > 0 || this.reloadStage){ this.reloadT = 0; this.reloadStage = 0; UI.reloadBar(-1); }
      $('scopeOv').classList.remove('on');
      this.trigger = false; this.aimT = damp(this.aimT, 0, 9, dt);
      this.recP = damp(this.recP, 0, 9, dt); this.recY = 0;
      return;
    }
    /* timers */
    if (this.fireT > 0) this.fireT -= dt;
    if (this.throwCd > 0) this.throwCd -= dt;
    if (this.dryT > 0) this.dryT -= dt;
    if (this.meleeT > 0) this.meleeT -= dt;
    if (this.swapT > 0){ this.swapT -= dt; if (this.swapT <= 0) UI.gunChanged(); }
    if (this.sprayT > 0) this.sprayT -= dt; else { this.spray = Math.max(0, this.spray - dt * 7); }
    if (!this.trigger) this.spray = Math.max(0, this.spray - dt * 9);
    this.recP = damp(this.recP, 0, 11, dt);
    this.recY = damp(this.recY, 0, 11, dt);
    this.kick = damp(this.kick, 0, 13, dt);
    this.kickR = damp(this.kickR, 0, 9, dt);

    /* reload timeline */
    if (this.reloadT > 0){
      this.reloadT -= dt;
      const k = 1 - this.reloadT / this.reloadDur;
      if (this.reloadStage === 0 && k > .38){ this.reloadStage = 1; SFX.reloadB(); }
      if (this.reloadStage === 1 && k > .78){ this.reloadStage = 2; this.finishReload(); }
      UI.reloadBar(k);
      if (this.reloadT <= 0){ this.reloadStage = 0; UI.reloadBar(-1); }
    }
    /* trigger */
    const wantAim = (Input.mouse.b[2] || Input.touch.aim) && !d.melee && d.slot !== 2 && Player.stance !== 2 && Player.sliding <= 0;
    this.aiming = wantAim && this.reloadT <= 0 && this.swapT <= 0;
    this.aimT = damp(this.aimT, this.aiming ? 1 : 0, 1 / Math.max(.035, (d.adsT || .2) * ADS_TIME_SCALE), dt);
    const hold = Input.mouse.b[0] || Input.touch.fire;
    this.trigger = hold;
    if (hold && this.canFire() && (d.auto || Input.jp.__fire || Input.touch.fireEdge)){
      Input.touch.fireEdge = false;
      this.fire();
      if (!d.auto) this.trigger = false;
    }
    /* weapon wheel / keys */
    if (Input.pressed('Digit1')) this.switchTo(0);
    if (Input.pressed('Digit2')) this.switchTo(1);
    if (Input.pressed('Digit3')) this.switchTo(2);
    if (Input.pressed('KeyR')) this.reload();
    if (Input.pressed('KeyG')){ if (this.slot === 2) this.throwIt(); else this.switchTo(2); }
    if (Input.pressed('KeyQ')) this.cycle(-1);
    if (Input.mouse.wheel) this.cycle(Input.mouse.wheel > 0 ? 1 : -1);
    if (Input.touch.swap){ Input.touch.swap = false; this.cycle(1); }
    if (Input.touch.reload){ Input.touch.reload = false; this.reload(); }
    if (Input.touch.thr){ Input.touch.thr = false; if (this.slot === 2) this.throwIt(); else this.switchTo(2); }

    /* ---- viewmodel pose ---- */
    const vm = this.vm; if (!vm) return;
    const A = this.aimT, sprintK = (Player.sprint && A < .1 && Player.speed > 3) ? 1 : 0;
    const slideK = Player.sliding > 0 ? 1 : 0;
    const bobX = Math.sin(Player.bob) * .012 * Player.bobA * (1 - A);
    const bobY = Math.abs(Math.cos(Player.bob)) * .014 * Player.bobA * (1 - A);
    const swayX = clamp(-Input.mouse.dx * .00035, -.05, .05) * (1 - A * .8);
    const swayY = clamp(-Input.mouse.dy * .00035, -.05, .05) * (1 - A * .8);
    const rl = this.reloadT > 0 ? Math.sin(clamp(1 - this.reloadT / this.reloadDur, 0, 1) * PI) : 0;
    const dip = Player.dip * 1.2;
    const swapK = this.swapT > 0 ? clamp(this.swapT / .32, 0, 1) : 0;          /* new weapon rises into view */
    const mel = d.melee && this.meleeT > 0 ? Math.sin((1 - this.meleeT / (60 / d.rpm * .9)) * PI) : 0;

    const hp = this.vmPos, ap = this.adsPos;
    let tx = lerp(hp.x, ap.x, A) + bobX + swayX + sprintK * -.10 + (mel ? this.meleeDir * .18 * mel : 0);
    let ty = lerp(hp.y, ap.y, A) + bobY + swayY - sprintK * .10 - rl * .13 - dip + (mel ? -.1 * mel : 0) - swapK * swapK * .28;
    let tz = lerp(hp.z, ap.z, A) + this.kick * .085 * (d.melee ? -.5 : 1) - sprintK * .05 - rl * .04 - (mel ? mel * .42 : 0);
    vm.position.set(tx, ty, tz);
    const kx = -this.kick * (d.melee ? .5 : .16) + rl * .5 - sprintK * .28 + (mel ? this.meleeDir * .7 * mel : 0);
    vm.rotation.set(kx, this.recY * .5 + sprintK * .5 + rl * .18, sprintK * .34 + this.kickR * .03 * this.meleeDir + (mel ? -.4 * mel : 0));
    vm.rotation.y += swayX * 2;
    vm.rotation.x += swayY * 2;
    /* hide viewmodel while scoped-in */
    const hideVM = this.scoped && A > .93 && ctx.view3p < .5;
    const showFP = !hideVM && ctx.view3p < .5;
    if (this.fp){ this.fp.setEnabled(showFP && d.slot !== 2); this.fp.update(dt); }
    vm.setEnabled(showFP);
    $('scopeOv').classList.toggle('on', this.scoped && A > .93 && ctx.view3p < .5);
  }
};
