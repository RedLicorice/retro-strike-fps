import { track } from '../dev/telemetry';
import { SFX } from '../audio/sfx';
import { Combat } from '../combat/index';
import { ctx } from '../core/context';
import { PI, TAU, V3, clamp, damp } from '../core/math';
import { Save } from '../core/save';
import { FX } from '../fx/fx';
import { Input } from '../input/input';
import { CROUCH_H, PRONE_H, STAND_H } from './constants';
import { UI } from '../ui/index';
import { Wep } from '../weapons/weaponController';
import { MAP } from '../world/map/index';
import { worldMove } from '../world/physics';
import { Models } from '../assets/models';
import { Ledge, catchTime, clipDur, findLedge, hangRoot, ledgeClear, toWorld, trackAt } from './ledge';

/* seconds of invulnerability after (re)spawn; ends early when you deal damage */
export const Player = {
  pos: V3(0, 2, 0), vel: V3(0, 0, 0), yaw: 0, pitch: 0, roll: 0,
  hp: 100, maxHp: 100, alive: true, radius: .38, stance: 0, /* 0 stand 1 crouch 2 prone */
  onGround: false, sprint: false, sliding: 0, slideV: V3(0, 0, 0), slideCd: 0, stanceWant: 0, crouchSprint: false,
  bob: 0, bobA: 0, sway: V3(0, 0, 0), dip: 0, stepT: 0, combatT: 99, inCover: false, coverT: 0,
  eyeCur: 1.66, hCur: STAND_H, speed: 0, landV: 0, blindT: 0, flashT: 0, burnT: 0, burnTick: 0,
  id: 'p0', team: 0, name: 'PLAYER', kills: 0, deaths: 0, score: 0, hs: 0, streak: 0,
  lastDmgFrom: null, spawnT: 0, respawnT: 3, tp: 0, tpAdvance: 0, lastGood: V3(0, 2, 0),
  /* ledge state (player/ledge.ts): phase, clip + time, the ledge, and the rig root the clip plays from */
  hang: null as null | { ph: 'mantle' | 'reach' | 'catch' | 'hang' | 'climb' | 'drop'; clip: string; t: number; t0: number; L: Ledge; ground: number; ox: number; oz: number; rx: number; ry: number; rz: number },
  hangCd: 0, eyeAt: null as null | { x: number; y: number; z: number },

  height(){ return this.stance === 2 ? PRONE_H : this.stance === 1 ? CROUCH_H : STAND_H; },
  eye(){ return this.stance === 2 ? .50 : this.stance === 1 ? 1.08 : 1.66; },
  /* prone 0.7 m/s: the rifle crawl clip covers 0.25 m/s, so it plays at ~2.8x; any faster and the crawl visibly skates */
  baseSpeed(){ return this.stance === 2 ? .7 : this.stance === 1 ? 3.0 : this.sprint ? 8.1 : 5.5; },

  reset(pos, yaw){
    const gx = pos.x || 0, gz = pos.z || 0;
    const gy = MAP.groundAt(gx, gz, (pos.y || 0) + 6, 8);
    this.pos.set(clamp(gx, -MAP.half + 1.2, MAP.half - 1.2), gy + .04, clamp(gz, -MAP.half + 1.2, MAP.half - 1.2));
    this.vel.set(0, 0, 0);
    this.yaw = yaw || 0; this.pitch = 0; this.roll = 0;
    this.hp = this.maxHp; this.alive = true; this.stance = 0; this.stanceWant = 0;
    this.sliding = 0; this.combatT = 99; this.blindT = 0; this.burnT = 0; this.spawnT = 1.2;
    this.hCur = STAND_H; this.eyeCur = 1.66; this.dip = 0; this.onGround = true;
    this.hang = null; this.hangCd = 0; this.eyeAt = null;
  },
  overlap(x, y, z, r, h){
    const x0 = x - r, x1 = x + r, y1 = y + h, z0 = z - r, z1 = z + r, B = MAP.near(x0, z0, x1, z1);
    for (let i = 0; i < B.length; i++){
      const b = B[i];
      if (b.x1 < x0 || b.x0 > x1 || b.z1 < z0 || b.z0 > z1 || b.y1 < y + .02 || b.y0 > y1) continue;
      return b;
    }
    return null;
  },
  blocker(x, y, z, r, h){
    const B = MAP.near(x - r, z - r, x + r, z + r); let best = null;
    for (let i = 0; i < B.length; i++){
      const b = B[i];
      if (b.x1 < x - r || b.x0 > x + r || b.z1 < z - r || b.z0 > z + r || b.y1 < y + .02 || b.y0 > y + h) continue;
      if (b.y1 <= y + .58 && (!best || b.y1 < best.y1)) best = b;
    }
    return best;
  },
  update(dt){
    const S = Save.data.settings, inp = Input, t = inp.touch;
    /* ---- look ---- */
    let mx = inp.mouse.dx, my = inp.mouse.dy;
    if (ctx.IS_TOUCH || S.touch){ mx += t.lx; my += t.ly; t.lx = 0; t.ly = 0; }
    const sens = S.sens * (Wep.aimT > .5 ? .52 : 1) * (this.stance === 2 ? .55 : 1) * .0022;
    this.yaw += mx * sens;
    /* Babylon FreeCamera: +rotation.x looks down. Mouse up (movementY < 0) must decrease pitch. */
    this.pitch += my * sens * (S.invY ? -1 : 1);
    this.pitch = clamp(this.pitch, -1.53, 1.53);
    this.yaw = ((this.yaw + PI) % TAU + TAU) % TAU - PI;

    /* ---- movement, or the hang clip driving the body ---- */
    this.eyeAt = null;
    if (this.hang) this.updateHang(dt);
    else this.move(dt, S, inp, t);
    const p = this.pos;

    /* ---- cover based regeneration ---- */
    this.combatT += dt;
    const delay = this.inCover ? 1.7 : 3.0;
    if (this.alive && this.hp < this.maxHp && this.combatT > delay){
      const rate = this.inCover ? 46 : 30;
      const before = this.hp;
      this.hp = Math.min(this.maxHp, this.hp + rate * dt);
      if ((before < this.maxHp && this.hp >= this.maxHp)) UI.toast('VITALS RESTORED', 'g');
    }
    this.coverT += dt;
    if (this.blindT > 0) this.blindT -= dt;
    if (this.burnT > 0){
      this.burnT -= dt; this.burnTick -= dt;
      if (this.burnTick <= 0){ this.burnTick = .5; Combat.hurt(this, 6, null, 'fire'); }
    }
    if (this.spawnT > 0) this.spawnT -= dt;

    /* ---- write camera ---- */
    const sh = FX.shakeA;
    const shx = sh > 0 ? Math.sin(FX.shakeT * 61) * sh * .012 : 0;
    const shy = sh > 0 ? Math.sin(FX.shakeT * 47 + 1.7) * sh * .014 : 0;
    const ex = this.eyeAt ? this.eyeAt.x : p.x, ey = this.eyeAt ? this.eyeAt.y : p.y + this.eyeCur - this.dip, ez = this.eyeAt ? this.eyeAt.z : p.z;
    /* third person: over-the-shoulder boom (collides with the arena); aiming pulls the camera in over the shoulder */
    const want3p = !!Save.data.settings.view3p;
    this.tp = damp(this.tp, want3p ? 1 : 0, 10, dt);
    ctx.view3p = this.tp;
    this.tpAdvance = 0;
    if (this.tp > .005){
      const pit = this.pitch - Wep.recP, cp = Math.cos(pit);
      const fx = Math.sin(this.yaw) * cp, fy = -Math.sin(pit), fz = Math.cos(this.yaw) * cp;
      const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
      const aim = Wep.aimT, back = 2.3 - aim * 1.05, side = .5 + aim * .12, lift = .22 - aim * .07;
      let bx = -fx * back + rx * side, by = -fy * back + lift, bz = -fz * back + rz * side;
      let bl = Math.hypot(bx, by, bz); bx /= bl; by /= bl; bz /= bl;
      const hit = MAP.ray(ex, ey, ez, bx, by, bz, bl);
      if (hit) bl = Math.max(.2, hit.t - .25);
      bl *= this.tp;
      const cx = ex + bx * bl, cy = ey + by * bl, cz = ez + bz * bl;
      ctx.cam.position.set(cx, cy, cz);
      /* distance from the camera to the player's plane: shots start there so nothing behind the player is hit */
      this.tpAdvance = Math.max(0, (ex - cx) * fx + (ey - cy) * fy + (ez - cz) * fz);
    } else ctx.cam.position.set(ex, ey, ez);
    ctx.cam.rotation.set(this.pitch - Wep.recP + shy, this.yaw + shx, this.roll + (sh > 0 ? Math.sin(FX.shakeT * 39) * sh * .02 : 0));
    if (Input.pressed('KeyV')){
      Save.data.settings.view3p = !Save.data.settings.view3p; Save.flush();
      UI.toast(Save.data.settings.view3p ? 'THIRD PERSON' : 'FIRST PERSON', 'g');
    }
    ctx.cam.fov = damp(ctx.cam.fov, Wep.fovTarget(), 12, dt);
  },
  move(dt, S, inp, t){
    /* ---- stance ----
       C: stand → crouch → prone → crouch …   (C while sprinting = slide)
       Space: jump when standing, otherwise stand up.   Shift: sprint (standing) / crouch-run (crouched). */
    const pressC = inp.pressed('KeyC') || t.crouchTap;
    const pressJump = inp.pressed('Space') || t.jump;
    t.crouchTap = false; t.jump = false;
    if (pressC){
      if (this.sprint && this.onGround && this.speed > 5.4 && this.slideCd <= 0 && this.stance === 0){
        this.sliding = .82; this.slideCd = 1.1;
        this.slideV.set(this.vel.x, 0, this.vel.z);
        const sp = Math.hypot(this.vel.x, this.vel.z) || 1;
        this.slideV.scaleInPlace(Math.min(1.25, sp / 8));
        FX.burst('dust', this.pos.x, this.pos.y + .1, this.pos.z, 0, .4, 0, 12, 3, 1.2);
        SFX.noise(.5, .2, 900, 200, .8, 'bandpass'); FX.shake(.22);
        UI.toast('SLIDE', 'g');
      } else this.stanceWant = this.stanceWant === 1 ? 2 : 1;       /* stand/prone → crouch, crouch → prone */
      SFX.ui();
    }
    let jumpNow = false;
    if (pressJump){
      if (this.stanceWant !== 0 || this.stance !== 0) this.stanceWant = 0;   /* get up first */
      else {
        /* a ledge too high to jump onto but within reach: mantle straight over it, or reach up and hang */
        const L = this.onGround && this.sliding <= 0 ? findLedge(this.pos.x, this.pos.z, this.pos.y, this.yaw, this.radius, 1.2, 2.55, .55) : null;
        if (L){ this.startHang(L, L.ey - this.pos.y <= 1.9 ? 'mantle' : 'reach'); return; }
        jumpNow = true;
      }
    }
    /* Shift while crouched: stand up and run for as long as it's held, then drop back into the crouch */
    const fwdHeld = inp.down('KeyW') || inp.down('ArrowUp') || ((ctx.IS_TOUCH || S.touch) && t.my < -.3);
    const shiftHeld = inp.down('ShiftLeft') || inp.down('ShiftRight') || t.sprint;
    this.crouchSprint = this.stanceWant === 1 && shiftHeld && fwdHeld && !Wep.aiming;
    const want = this.sliding > 0 ? 2 : this.crouchSprint ? 0 : this.stanceWant;
    if (want >= this.stance) this.stance = want;                               /* getting lower always fits */
    else {
      /* getting up needs headroom; from prone, settle for crouch if only that fits */
      const fits = (h: number) => !this.overlap(this.pos.x, this.pos.y + .05, this.pos.z, this.radius, h);
      if (fits(want === 0 ? STAND_H : CROUCH_H)) this.stance = want;
      else if (want === 0 && this.stance === 2 && fits(CROUCH_H)) this.stance = 1;
    }

    /* ---- input vector ---- */
    let ix = 0, iz = 0;
    if (inp.down('KeyW') || inp.down('ArrowUp')) iz += 1;
    if (inp.down('KeyS') || inp.down('ArrowDown')) iz -= 1;
    if (inp.down('KeyD') || inp.down('ArrowRight')) ix += 1;
    if (inp.down('KeyA') || inp.down('ArrowLeft')) ix -= 1;
    if (ctx.IS_TOUCH || S.touch){ ix += t.mx; iz += -t.my; }
    const il = Math.hypot(ix, iz); if (il > 1){ ix /= il; iz /= il; }
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const wx = ix * cos + iz * sin, wz = iz * cos - ix * sin;   /* Babylon LH: forward = (sin, cos), right = (cos, -sin) */
    const moving = il > .12;

    const shift = inp.down('ShiftLeft') || inp.down('ShiftRight') || t.sprint;
    this.sprint = shift && moving && iz > .1 && this.stance === 0 && !Wep.aiming && this.sliding <= 0;

    /* ---- slide physics ---- */
    if (this.sliding > 0){
      this.sliding -= dt; this.slideCd -= dt;
      const f = Math.exp(-2.1 * dt);
      this.vel.x = this.slideV.x * f; this.vel.z = this.slideV.z * f;
      if (Math.random() < dt * 22) FX.burst('dust', this.pos.x, this.pos.y + .1, this.pos.z, 0, .3, 0, 2, 1.6, .8);
      if (this.sliding <= 0) this.vel.scaleInPlace(.45);   /* stance returns to stanceWant (headroom-checked) next frame */
    } else {
      this.slideCd -= dt;
      const spd = this.baseSpeed() * ((Wep.def && Wep.def.spd) || 1) * (Wep.aiming ? .58 : 1) * (this.sliding > 0 ? 1 : 1) * clamp(this.hp / 60, .72, 1);
      const accel = this.onGround ? 15 : 3.4;
      const tvx = wx * spd, tvz = wz * spd;
      this.vel.x = damp(this.vel.x, tvx, accel, dt);
      this.vel.z = damp(this.vel.z, tvz, accel, dt);
      if (!moving && this.onGround){ const f = Math.exp(-13 * dt); this.vel.x *= f; this.vel.z *= f; }
    }
    this.speed = Math.hypot(this.vel.x, this.vel.z);

    /* ---- jump ---- */
    if (jumpNow && this.onGround && this.stance === 0 && this.sliding <= 0){
      this.vel.y = 7.6; this.onGround = false; SFX.jump();
      this.sliding = 0;
    }

    /* ---- integrate + collide (substepped, hard world box, kill plane) ---- */
    const p = this.pos, r = this.radius, h = this.height();
    const wasAir = !this.onGround;
    const mv = worldMove(p, this.vel, r, h, dt);
    if (!isFinite(p.x) || !isFinite(p.y) || !isFinite(p.z) || !isFinite(this.vel.x) || !isFinite(this.vel.y) || !isFinite(this.vel.z)){
      /* a bad stat must never teleport the player into the void: restore the last sane position */
      track('nan-recovery', { wpn: Wep.def && Wep.def.id, last: [this.lastGood.x, this.lastGood.y, this.lastGood.z] });
      p.copyFrom(this.lastGood); this.vel.set(0, 0, 0);
    } else this.lastGood.copyFrom(p);
    this.onGround = mv.grounded;
    if (p.y < MAP.terrainY(p.x, p.z) - 1 || Math.abs(p.x) > MAP.half + 1.5 || Math.abs(p.z) > MAP.half + 1.5){
      track('killplane-recovery', { pos: [p.x, p.y, p.z].map(v => +v.toFixed(2)), vel: [this.vel.x, this.vel.y, this.vel.z].map(v => +v.toFixed(2)), seed: MAP.seed });
      const s = MAP.spawns[0] || { x: 0, z: 0, y: 0 };
      this.reset(s, this.yaw);
    }
    if (wasAir && mv.grounded && mv.landV < -7){
      const imp = clamp(-mv.landV / 22, 0, 1);
      this.dip = Math.min(.34, imp * .34); FX.shake(imp * .5); SFX.land();
      FX.burst('dust', p.x, p.y + .05, p.z, 0, .5, 0, 6 + imp * 10, 2.4, 1);
      if (-mv.landV > 21) Combat.hurt(this, Math.round((-mv.landV - 21) * 3.2), null, 'fall');
    }

    /* ---- airborne next to a reachable ledge, heading into it: catch it ---- */
    if (this.hangCd > 0) this.hangCd -= dt;
    if (!this.onGround && this.vel.y < 2.5 && this.hangCd <= 0 && this.alive){
      const into = fwdHeld || (this.vel.x * Math.sin(this.yaw) + this.vel.z * Math.cos(this.yaw)) > 1.5;
      const L = into ? findLedge(p.x, p.z, p.y, this.yaw, r, .9, 2.35, .4) : null;
      if (L){ this.startHang(L, L.ey - p.y < 1.25 ? 'mantle' : 'catch'); return; }
    }

    /* ---- footstep audio ---- */
    if (this.onGround && this.speed > 1.2){
      this.stepT -= dt * this.speed * (this.stance === 2 ? .5 : 1);
      if (this.stepT <= 0){ this.stepT = 2.35; SFX.step(this.sprint); }
    }

    /* ---- camera / view smoothing ---- */
    this.hCur = damp(this.hCur, h, 13, dt);
    this.eyeCur = damp(this.eyeCur, this.eye(), 13, dt);
    this.dip = damp(this.dip, 0, 9, dt);
    const bs = this.speed * (this.sprint ? 1.3 : 1) * (this.onGround ? 1 : 0);
    this.bob += dt * bs * 1.55;
    this.bobA = damp(this.bobA, Math.min(1, bs / 6), 8, dt);
    this.roll = damp(this.roll, -clamp(this.vel.x * .006, -.05, .05) * (this.sprint ? 2.2 : 1) + (this.sliding > 0 ? .09 : 0), 8, dt);

  },

  /* ---------------- ledge hang / climb ----------------
     mantle: Space at a 1.2-1.9 m ledge -> climb straight over (Braced Hang To Crouch from the ground)
     reach:  Space at a 1.9-2.55 m ledge -> Idle To Braced Hang, then hang
     catch:  airborne into a reachable ledge -> the grab of Jumping To Hanging, then hang
     hang:   W / Space climb over, A / D shimmy along the edge, S / C let go (drop to standing when the ground is a body length below) */
  startHang(L: Ledge, mode: 'mantle' | 'reach' | 'catch'){
    const clip = mode === 'mantle' ? 'hang_climb' : mode === 'reach' ? 'hang_reach' : 'hang_catch';
    const t0 = mode === 'catch' ? catchTime(clip) : 0;
    const root = hangRoot(L);
    const ground = MAP.groundAt(this.pos.x, this.pos.z, this.pos.y + .3, .6);
    /* where the clip puts the body at its first frame vs where the body is: that gap fades out over 0.3 s */
    const b = toWorld(root.x, root.y, root.z, L.yaw, trackAt(clip, 'hips', t0));
    this.hang = { ph: mode, clip, t: t0, t0, L, ground, ox: this.pos.x - b.x, oz: this.pos.z - b.z, rx: root.x, ry: root.y, rz: root.z };
    this.vel.set(0, 0, 0); this.stance = 0; this.stanceWant = 0; this.sliding = 0; this.sprint = false; this.onGround = false;
    SFX.noise(.12, .16, 700, 240, 1.2, 'bandpass');
  },

  /* let go: fall from where the body hangs, pushed a little off the wall */
  releaseHang(){
    const H = this.hang; if (!H) return;
    this.vel.set(H.L.nx * 1.4, -.5, H.L.nz * 1.4);
    this.hang = null; this.hangCd = .45; this.onGround = false;
  },

  updateHang(dt){
    const H = this.hang, L = H.L, inp = Input, tch = inp.touch;
    H.t += dt;
    const dur = clipDur(H.clip);
    if (!this.alive){ this.hang = null; return; }
    if (H.ph === 'hang'){
      const key = (k: string) => inp.down(k) || inp.pressed(k);            /* held, or tapped between frames */
      const climb = key('KeyW') || key('ArrowUp') || inp.pressed('Space') || tch.jump || tch.my < -.5;
      const drop = key('KeyS') || key('ArrowDown') || inp.pressed('KeyC') || tch.crouchTap || tch.my > .5;
      const side = (inp.down('KeyD') || inp.down('ArrowRight') || tch.mx > .5 ? 1 : 0) - (inp.down('KeyA') || inp.down('ArrowLeft') || tch.mx < -.5 ? 1 : 0);
      tch.jump = false; tch.crouchTap = false;
      if (climb){ H.ph = 'climb'; H.clip = 'hang_climb'; H.t = H.t0 = 0; H.ox = H.oz = 0; SFX.noise(.18, .2, 600, 200, 1.2, 'bandpass'); }
      else if (drop){
        const feet = toWorld(H.rx, H.ry, H.rz, L.yaw, trackAt('hang_idle', 'feet', 0));
        const g = MAP.groundAt(feet.x + L.nx * .3, feet.z + L.nz * .3, feet.y, 8), gap = feet.y - g;
        if (gap > .9 && gap < 1.8 && Models.clips['hang_drop_stand']){ H.ph = 'drop'; H.clip = 'hang_drop_stand'; H.t = H.t0 = 0; H.ground = g; H.ox = H.oz = 0; }
        else { this.releaseHang(); return; }
      } else if (side){
        /* shimmy: slide the grip along the face while the edge continues and nothing is in the way */
        const sp = (Models.clips['hang_shimmy_r'] && Models.clips['hang_shimmy_r'].speed) || .5;
        const rx = Math.cos(L.yaw) * side, rz = -Math.sin(L.yaw) * side;                    /* body right in the world */
        const nx = L.ex + rx * sp * dt, nz = L.ez + rz * sp * dt, u = L.nx ? nz : nx;
        const body = toWorld(H.rx + rx * .45, H.ry, H.rz + rz * .45, L.yaw, trackAt('hang_idle', 'hips', 0));
        if (u > L.lo + .4 && u < L.hi - .4 && ledgeClear(nx, L.ey, nz, L.nx, L.nz) && !MAP.headBlocked(body.x, body.z, body.y - .6, 1.4)){
          L.ex = nx; L.ez = nz;
          const want = side > 0 ? 'hang_shimmy_r' : 'hang_shimmy_l';
          if (H.clip !== want){ H.clip = want; H.t = 0; }
        } else if (H.clip !== 'hang_idle'){ H.clip = 'hang_idle'; H.t = 0; }
      } else if (H.clip !== 'hang_idle'){ H.clip = 'hang_idle'; H.t = 0; }
    }
    /* ---- root: hands on the ledge; entering from / leaving to the ground blends the height in or out ---- */
    const root = hangRoot(L), cd = clipDur(H.clip), t = H.t;
    const sm = (x: number) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
    const feetAt = (tt: number) => trackAt(H.clip, 'feet', tt)[2];
    let ry = root.y;
    if (H.ph === 'mantle'){
      const gRoot = H.ground - feetAt(0), top = L.ey + .06 - feetAt(cd);
      ry = t < cd * .35 ? root.y + (gRoot - root.y) * (1 - sm(t / (cd * .35))) : t > cd * .6 ? root.y + (top - root.y) * sm((t - cd * .6) / (cd * .4)) : root.y;
    } else if (H.ph === 'climb'){
      const top = L.ey + .06 - feetAt(cd);
      ry = t > cd * .6 ? root.y + (top - root.y) * sm((t - cd * .6) / (cd * .4)) : root.y;
    } else if (H.ph === 'reach'){
      const gRoot = H.ground - feetAt(0);
      ry = gRoot + (root.y - gRoot) * sm(t / (cd * .85));
    } else if (H.ph === 'drop'){
      const gEnd = H.ground - feetAt(cd);
      ry = root.y + (gEnd - root.y) * sm((t - cd * .3) / (cd * .6));
    }
    const k = Math.max(0, 1 - (t - H.t0) / .3);
    H.rx = root.x + H.ox * k; H.ry = ry; H.rz = root.z + H.oz * k;
    /* ---- body (hitbox) and eye follow the clip ---- */
    const hips = toWorld(H.rx, H.ry, H.rz, L.yaw, trackAt(H.clip, 'hips', t));
    const feet = toWorld(H.rx, H.ry, H.rz, L.yaw, trackAt(H.clip, 'feet', t));
    this.pos.set(hips.x, Math.min(feet.y, hips.y - .9), hips.z);
    this.vel.set(0, 0, 0); this.speed = 0; this.onGround = false;
    const head = toWorld(H.rx, H.ry, H.rz, L.yaw, trackAt(H.clip, 'head', t));
    this.eyeAt = { x: head.x + Math.sin(L.yaw) * .1, y: head.y + .08, z: head.z + Math.cos(L.yaw) * .1 };
    this.eyeCur = this.eyeAt.y - this.pos.y;
    /* ---- phase ends ---- */
    if ((H.ph === 'mantle' || H.ph === 'climb') && t >= cd){
      /* on top, crouched where the clip ends; stand up if there's room */
      const e = toWorld(H.rx, H.ry, H.rz, L.yaw, trackAt(H.clip, 'hips', cd));
      let x = e.x, z = e.z;
      if (Math.abs(MAP.groundAt(x, z, L.ey + .2, .4) - L.ey) > .05){ x = L.ex - L.nx * .45; z = L.ez - L.nz * .45; }
      this.pos.set(x, L.ey + .02, z); this.hang = null; this.onGround = true;
      this.stance = 1; this.stanceWant = 0; this.hCur = CROUCH_H; this.eyeCur = 1.08; this.hangCd = .3;
    } else if ((H.ph === 'reach' || H.ph === 'catch') && t >= cd){
      H.ph = 'hang'; H.clip = 'hang_idle'; H.t = H.t0 = 0; H.ox = H.oz = 0;
    } else if (H.ph === 'drop' && t >= cd * .9){
      this.pos.set(feet.x, H.ground + .02, feet.z); this.hang = null; this.onGround = true; this.hangCd = .45;
    }
  },

  damageDir(from){
    if (!from) return;
    const a = Math.atan2(from.x - this.pos.x, from.z - this.pos.z) - this.yaw;
    UI.damageDir(a);
  },
  hurtMark(){ this.combatT = 0; }
};
