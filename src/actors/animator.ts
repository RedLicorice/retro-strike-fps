import * as BABYLON from 'babylonjs';
import { ctx } from '../core/context';
import { clamp } from '../core/math';
import { Models, CharInstance, WeaponMarkers } from '../assets/models';

/* Drives a character's retargeted Mixamo clips from gameplay state.
   Locomotion: 8-way direction blend × speed tiers (walk / run / sprint, or crouch-walk),
   playback rate matched to real ground speed so feet don't skate.
   Also: idle / aiming idle, 3-phase jump, direction-aware deaths, and the held weapon
   placed between the hands every frame. */

const DIRS = ['f', 'fr', 'r', 'br', 'b', 'bl', 'l', 'fl'];   /* clockwise from forward, 45° apart */
const FADE = 7;
/* upper-body one-shots (reload / fire / hit / throw, incl. prone_ and pistol_ variants) play on spine-and-up only */
const isUpper = (n: string) => /(^|_)(reload|fire|hit|throw)$/.test(n);
const UPPER_PRI: Record<string, number> = { fire: 1, hit: 2, throw: 3, reload: 4 };
const TRANS_TIME = .9;          /* stance transitions are compressed to at most this long (gameplay stance changes are instant) */
const TURN_AT = { 0: 65, 1: 65, 2: 32 } as Record<number, number>;   /* degrees of view/body mismatch before an idle turn plays */
const AIRTIME = .66;   /* seconds of a standing jump (7.6 m/s up, 23 m/s² gravity) */
/* clips played as a section: seconds [t0, t1] at `rate` (glTF timeline is 60 frames/s).
   Running Slide = run-in 0–0.15s, slide 0.15–0.9s, get-up to 1.2s: play the slide + get-up over the 0.82s slide */
const CUT: Record<string, { t0: number; t1: number; rate: number }> = { slide: { t0: .1, t1: 1.0, rate: 1.1 } };                                              /* weight units per second (≈0.14s cross-fade) */

export interface AnimInput {
  alive: boolean;
  vx: number; vz: number;          /* world velocity (m/s) */
  yaw: number;
  stance: 0 | 1 | 2;               /* stand / crouch / prone */
  sliding: boolean;
  aiming: boolean;
  airborne: boolean;
  vy: number;
}
export interface DeathInfo { head: boolean; fromX?: number; fromZ?: number }

export class Animator {
  inst: CharInstance;
  w: Record<string, number> = {};
  active = new Set<string>();
  death: string | null = null;
  jump: 'none' | 'up' | 'loop' | 'down' | 'air' = 'none';
  jumpT = 0;
  weapon: BABYLON.TransformNode | null = null;
  markers: WeaponMarkers | null = null;
  private obs: BABYLON.Observer<BABYLON.Scene>;
  private upperOnly: BABYLON.AnimationGroupMask;
  private lowerOnly: BABYLON.AnimationGroupMask;
  reloadClip: string | null = null;
  /* runs after animation, before the weapon is placed (first-person rig fitting) */
  prePlace: (() => void) | null = null;
  private rh: BABYLON.TransformNode; private lh: BABYLON.TransformNode;

  constructor(inst: CharInstance){
    this.inst = inst;
    this.rh = inst.node('mixamorig:RightHand'); this.lh = inst.node('mixamorig:LeftHand');
    this.obs = ctx.scene.onAfterAnimationsObservable.add(() => { if (this.prePlace) this.prePlace(); this.placeWeapon(); });
    /* upper-body layer: reload clips play on spine-and-up; while one runs, every other clip is masked off those bones */
    const spine = inst.node('mixamorig:Spine1');
    const upper = spine ? [spine.name, ...spine.getDescendants(false).map(n => n.name)] : [];
    this.upperOnly = new BABYLON.AnimationGroupMask(upper, BABYLON.AnimationGroupMaskMode.Include);
    this.lowerOnly = new BABYLON.AnimationGroupMask(upper, BABYLON.AnimationGroupMaskMode.Exclude);
    this.lowerOnly.disabled = true;
    for (const n in inst.groups) inst.groups[n].mask = isUpper(n) ? this.upperOnly : this.lowerOnly;
  }

  kind: 'rifle' | 'pistol' | 'none' = 'rifle';
  private jumpClip = '';
  /* body yaw can lag the view yaw: turn-in-place clips catch it up, prone crawls face their movement */
  bodyYaw: number | null = null;
  private turn: { clip: string; dir: number; rad: number } | null = null;
  private trans: string | null = null;
  private lastStance: number | null = null;
  private snap = false;
  private upper: { clip: string; pri: number } | null = null;
  private lowcrawl: 'idle' | 'b' | 'start' | 'stop' = 'idle';
  setWeapon(node: BABYLON.TransformNode | null, markers: WeaponMarkers | null, kind?: 'rifle' | 'pistol' | 'none'){
    this.kind = kind || (node ? 'rifle' : 'none');
    if (this.weapon) this.weapon.dispose(false, false);
    this.weapon = node; this.markers = markers;
    if (node){ node.rotationQuaternion = BABYLON.Quaternion.Identity(); node.parent = null; node.setEnabled(this.inst.root.isEnabled()); }
  }

  reset(){
    this.death = null; this.jump = 'none';
    for (const k of [...this.active]) this.stop(k);
    this.w = {};
  }

  update(dt: number, s: AnimInput, deathInfo?: DeathInfo | null){
    const target: Record<string, number> = {};
    const rates: Record<string, number> = {};
    if (this.bodyYaw === null) this.bodyYaw = s.yaw;
    if (!s.alive){
      this.unfreeze();
      if (this.upper) this.stopUpper();
      this.turn = null; this.trans = null; this.lastStance = null;
      if (!this.death) this.death = this.pickDeath(s, deathInfo);
      if (!this.inst.groups[this.death]){ this.freeze(this.death); return; }
      target[this.death] = 1;
    } else {
      this.death = null;
      const speed = Math.hypot(s.vx, s.vz);
      this.stanceChange(s);
      this.steerBody(s, speed, dt);
      /* directional clips are relative to where the body faces */
      const sb = { ...s, yaw: this.bodyYaw };
      const miss = this.choose(sb, speed, dt, target, rates);
      if (miss){
        /* no clip for this movement: hold the current pose and report it (no stand-in animation) */
        this.freeze(miss);
        return;
      }
      this.unfreeze();
    }
    /* ---- cross-fade toward the target mix ---- */
    const names = new Set([...Object.keys(target), ...this.active]);
    for (const n of names){
      const cur = this.w[n] || 0, tg = target[n] || 0;
      const nw = this.snap ? tg : cur < tg ? Math.min(tg, cur + FADE * dt) : Math.max(tg, cur - FADE * dt);
      this.w[n] = nw;
      if (nw > .001){
        if (!this.active.has(n)) this.start(n);
        const g = this.inst.groups[n];
        g.setWeightForAllAnimatables(nw);
        if (rates[n]) g.speedRatio = rates[n];
      } else if (this.active.has(n)) this.stop(n);
    }
    this.snap = false;
  }

  dispose(){
    ctx.scene.onAfterAnimationsObservable.remove(this.obs);
    if (this.weapon) this.weapon.dispose(false, false);
    this.inst.dispose();
  }

  /* ---------------- clip selection ---------------- */
  /* fills target/rates; returns the name of a required clip that doesn't exist (caller holds the pose) */
  private choose(s: AnimInput, speed: number, dt: number, T: Record<string, number>, R: Record<string, number>): string | null {
    const has = (n: string) => !!this.inst.groups[n];
    const k = this.kind;
    /* ---- jumps ---- */
    this.jumpT += dt;
    if (k === 'rifle'){
      if (s.airborne && (this.jump === 'none' || this.jump === 'down')){ this.jump = 'up'; this.jumpT = 0; this.restart('jump_up'); }
      else if (!s.airborne && (this.jump === 'up' || this.jump === 'loop')){ this.jump = 'down'; this.jumpT = 0; this.restart('jump_down'); }
      else if (this.jump === 'up' && this.jumpT > this.clipDur('jump_up') * .9) this.jump = 'loop';
      else if (this.jump === 'down' && this.jumpT > this.clipDur('jump_down') * .55) this.jump = 'none';
      if (this.jump !== 'none'){ T['jump_' + this.jump] = 1; return null; }
    } else if (s.airborne || this.jump === 'air'){
      /* pistol jumps are single clips: play their airborne section over the airtime */
      if (s.airborne && this.jump === 'none'){ this.jump = 'air'; this.jumpClip = (k === 'pistol' ? 'pistol_' : 'unarmed_') + (speed > 1.5 ? 'jump_run' : 'jump'); this.restart(this.jumpClip); }
      if (!s.airborne){ this.jump = 'none'; }
      else { if (!has(this.jumpClip)) return this.jumpClip; T[this.jumpClip] = 1; return null; }
    }
    if (s.sliding) return has('slide') ? (T['slide'] = 1, null) : 'slide';
    const pre = k === 'rifle' ? '' : k === 'pistol' ? 'pistol_' : 'unarmed_';
    /* stance transition in progress */
    if (this.trans){
      const g = this.inst.groups[this.trans];
      if (g && g.isPlaying){ T[this.trans] = 1; return null; }
      this.trans = null;
    }
    /* turn in place in progress: when it ends, the body yaw jumps by the clip's turn and the next pose snaps in */
    if (this.turn){
      const g = this.inst.groups[this.turn.clip];
      if (g && g.isPlaying){ T[this.turn.clip] = 1; return null; }
      this.bodyYaw = wrap(this.bodyYaw + this.turn.dir * this.turn.rad);
      this.stop(this.turn.clip); this.turn = null; this.snap = true;
      s = { ...s, yaw: this.bodyYaw };
      /* chain the next turn straight away if the body still isn't facing the target (e.g. two 45° prone turns) */
      this.steerBody(s, speed, 0);
      if (this.turn){ T[this.turn.clip] = 1; return null; }
    }
    /* ---- prone: rifle crawl, low crawl when unarmed ---- */
    if (s.stance === 2 && k === 'none'){
      const back = speed > .12 && this.proneClip(s, speed) === 'lowcrawl_b';
      if (back && (this.lowcrawl === 'idle' || this.lowcrawl === 'stop')){ this.lowcrawl = 'start'; this.restart('lowcrawl_b_start'); }
      if (!back && (this.lowcrawl === 'b' || this.lowcrawl === 'start')){ this.lowcrawl = 'stop'; this.restart('lowcrawl_b_stop'); }
      const oneShot = this.lowcrawl === 'start' ? 'lowcrawl_b_start' : this.lowcrawl === 'stop' ? 'lowcrawl_b_stop' : null;
      if (oneShot){
        const g = this.inst.groups[oneShot];
        if (!this.active.has(oneShot) || (g && g.isPlaying)){ if (!has(oneShot)) return oneShot; T[oneShot] = 1; return null; }
        this.lowcrawl = this.lowcrawl === 'start' ? 'b' : 'idle';
      }
    } else this.lowcrawl = 'idle';
    if (s.stance === 2){
      const n = k === 'pistol' ? 'pistol_prone_' + (speed > .12 ? dir4(s) : 'idle') : this.proneClip(s, speed);
      if (!has(n)) return n;
      T[n] = 1; const c = Models.clips[n]; if (c && c.speed) R[n] = clamp(speed / c.speed, .5, 3.2);
      return null;
    }
    const m = clamp((speed - .25) / .9, 0, 1);
    /* ---- rifle: 8-way × walk/run/sprint, or crouch-walk ---- */
    if (k === 'rifle'){
      const crouch = s.stance === 1;
      T[crouch ? (s.aiming ? 'crouch_idle_aim' : 'crouch_idle') : (s.aiming ? 'idle_aim' : 'idle')] = 1 - m;
      if (m > 0){
        const sin = Math.sin(s.yaw), cos = Math.cos(s.yaw);
        const fwd = s.vx * sin + s.vz * cos, right = s.vx * cos - s.vz * sin;
        let a = Math.atan2(right, fwd); if (a < 0) a += Math.PI * 2;
        const sec = a / (Math.PI / 4), i0 = Math.floor(sec) % 8, i1 = (i0 + 1) % 8, f = sec - Math.floor(sec);
        const tiers: Array<[string, number]> = crouch ? [['crouch', 1]] : tierWeights(speed);
        for (const [tier, tw] of tiers) for (const [dir, dw] of [[DIRS[i0], 1 - f], [DIRS[i1], f]] as Array<[string, number]>){
          const clip = tier + '_' + dir, wt = m * tw * dw;
          if (wt <= .001) continue;
          T[clip] = (T[clip] || 0) + wt;
          const c = Models.clips[clip]; R[clip] = c && c.speed ? clamp(speed / c.speed, .55, 1.7) : 1;
        }
      }
      return null;
    }
    /* ---- pistol / unarmed: 4-way (forward, right, back, left) blended; walk or run tier ---- */
    const idle = pre + (s.stance === 1 ? 'crouch_idle' : 'idle');
    if (!has(idle)) return idle;
    T[idle] = 1 - m;
    if (m > 0){
      if (s.stance === 1){ const n = pre + 'crouch_' + dir4(s); if (!has(n)) return n; }
      const [d0, d1, f] = dir4blend(s);
      const run = clamp((speed - 2.9) / 1, 0, 1);
      for (const [dir, dw] of [[d0, 1 - f], [d1, f]] as Array<[string, number]>){
        if (dw <= .001) continue;
        /* sideways only exists as the (walk-speed) strafe */
        const tiers: Array<[string, number]> = dir === 'l' || dir === 'r' ? [['walk', 1]] : [['walk', 1 - run], ['run', run]];
        for (const [tier, tw] of tiers){
          if (tw <= .001) continue;
          const clip = pre + tier + '_' + dir;
          if (!has(clip)) return clip;
          T[clip] = (T[clip] || 0) + m * dw * tw;
          const c = Models.clips[clip]; R[clip] = c && c.speed ? clamp(speed / c.speed, .55, 1.7) : 1;
        }
      }
    }
    return null;
  }

  /* ---------------- stance transitions ---------------- */
  private stanceChange(s: AnimInput){
    if (s.sliding){ this.lastStance = null; return; }
    const from = this.lastStance; this.lastStance = s.stance;
    if (from === null || from === s.stance) return;
    const pre = this.kind === 'pistol' ? 'pistol_' : this.kind === 'none' ? 'unarmed_' : '';
    const name = pre + 't_' + ['stand', 'crouch', 'prone'][from] + '_' + ['stand', 'crouch', 'prone'][s.stance];
    if (!this.inst.groups[name]){
      /* rifle stand<->crouch has no clip: the poses simply cross-fade (nothing substituted) */
      if (!(this.kind === 'rifle' && from + s.stance === 1)) this.report(name);
      return;
    }
    this.turn = null;
    this.trans = name; this.restart(name); this.start(name);
  }

  /* ---------------- body yaw ---------------- */
  private steerBody(s: AnimInput, speed: number, dt: number){
    if (this.turn || this.trans) return;
    const prone = s.stance === 2;
    let want = s.yaw;
    if (prone && speed > .12){
      /* crawl the way you move: sideways/diagonal movement turns the body; straight back crawls backward */
      const moveYaw = Math.atan2(s.vx, s.vz);
      if (Math.abs(wrap(moveYaw - s.yaw)) < Math.PI * .75) want = moveYaw;
    }
    const diff = wrap(want - this.bodyYaw);
    const idle = speed <= .25 && !s.airborne && !s.aiming;
    if (!prone && !idle){ this.bodyYaw = want; return; }               /* moving / aiming upright: body follows the view */
    if (Math.abs(diff) * 180 / Math.PI > TURN_AT[s.stance]){
      const base = this.kind === 'rifle' ? ['turn', 'crouch_turn', 'prone_turn'][s.stance] : this.kind === 'none' && s.stance === 0 ? 'unarmed_turn' : null;
      const clip = base ? base + (diff > 0 ? '_r' : '_l') : null;
      const c = clip && Models.clips[clip];
      if (clip && this.inst.groups[clip] && c && (c as any).turn){
        this.turn = { clip, dir: Math.sign(diff), rad: Math.abs((c as any).turn) * Math.PI / 180 };
        this.restart(clip); this.start(clip);
        return;
      }
    }
    /* small corrections (or no turn clip for this state): rotate the body smoothly */
    if (prone && speed > .12) this.bodyYaw = wrap(this.bodyYaw + diff * Math.min(1, dt * 2.5));
    else if (!idle || !(this.kind === 'rifle' || (this.kind === 'none' && s.stance === 0))) this.bodyYaw = wrap(this.bodyYaw + diff * Math.min(1, dt * 10));
  }

  /* ---------------- upper-body layer: reload / throw / hit / fire ---------------- */
  private upperName(action: string, prone: boolean){
    if (this.kind === 'pistol') return 'pistol_' + action;
    if (this.kind === 'none') return action === 'throw' ? (prone ? 'prone_throw' : 'throw') : action === 'reload' ? null : 'unarmed_' + action;
    return prone ? 'prone_' + action : action;
  }
  private playUpper(action: string, prone: boolean, dur?: number){
    const name = this.upperName(action, prone); if (!name) return;
    if (!this.inst.groups[name]){ this.report(name); return; }       /* no clip: no motion (never a stand-in) */
    const pri = UPPER_PRI[action] || 1;
    if (this.upper && this.upper.pri > pri && this.inst.groups[this.upper.clip].isPlaying) return;
    if (this.upper && this.upper.clip === name && action === 'fire' && this.inst.groups[name].isPlaying) return;
    if (this.upper) this.inst.groups[this.upper.clip].stop();
    const g = this.inst.groups[name], c = Models.clips[name];
    const rate = dur ? clamp((c ? c.dur : 1) / Math.max(.25, dur), .4, 3.5) : 1;
    g.start(false, rate, g.from, g.to); g.setWeightForAllAnimatables(1);
    this.upper = { clip: name, pri };
    this.lowerOnly.disabled = false;
    g.onAnimationGroupEndObservable.addOnce(() => { if (this.upper && this.upper.clip === name) this.stopUpper(); });
  }
  private stopUpper(){
    if (this.upper){ const g = this.inst.groups[this.upper.clip]; if (g) g.stop(); }
    this.upper = null; this.reloadClip = null; this.lowerOnly.disabled = true;
  }
  /* gameplay events from the Actor */
  fire(prone: boolean){ if (!this.reloadClip) this.playUpper('fire', prone); }
  hit(prone: boolean){ if (!this.reloadClip) this.playUpper('hit', prone); }
  throwGrenade(prone: boolean){ this.playUpper('throw', prone, 1.45); }

  /* ---------------- reload (upper-body layer) ---------------- */
  /* start/stop the reload clip; `dur` = the gameplay reload time the clip is stretched to */
  private reloadLatched = false;   /* one clip per reload, even if it ends a frame before the gameplay reload */
  setReload(on: boolean, dur = 2.5, prone = false){
    if (!on){ if (this.reloadClip) this.stopUpper(); this.reloadLatched = false; return; }
    if (this.reloadLatched) return;
    this.reloadLatched = true;
    const name = this.upperName('reload', prone);
    if (!name) return;
    this.playUpper('reload', prone, dur);
    if (this.upper && this.upper.clip === name) this.reloadClip = name;
  }

  /* ---------------- missing clips ---------------- */
  frozen: string | null = null;
  private static reported = new Set<string>();

  /* prone: rifle crawl when a gun is held, low crawl when not. The body turns to face sideways movement
     (steerBody), so here the movement is forward or backward relative to the body */
  private proneClip(s: AnimInput, speed: number){
    if (speed <= .12) return this.weapon ? 'prone_idle' : 'lowcrawl_idle';
    const sin = Math.sin(s.yaw), cos = Math.cos(s.yaw);
    const fwd = s.vx * sin + s.vz * cos, right = s.vx * cos - s.vz * sin;
    const pre = this.weapon ? 'prone_' : 'lowcrawl_';
    /* the body is always steering to face the movement (or straight back), so only forward/backward crawls apply */
    return pre + (fwd >= -Math.abs(right) * .2 ? 'f' : 'b');
  }
  private freeze(clip: string){
    if (this.frozen === null){
      for (const n of this.active){ const g = this.inst.groups[n]; if (g) g.pause(); }
    }
    this.frozen = clip;
    this.report(clip);
  }
  private report(clip: string){
    if (Animator.reported.has(clip)) return;
    Animator.reported.add(clip);
    console.warn('[anim] missing clip "' + clip + '" - no substitute played. Add it to assets/animations and rebuild.');
  }
  private unfreeze(){
    if (this.frozen === null) return;
    for (const n of this.active){ const g = this.inst.groups[n]; if (g) g.play(Models.clips[n] ? Models.clips[n].loop : true); }
    this.frozen = null;
  }

  /* ---------------- internals ---------------- */
  private clipDur(n: string){ const c = Models.clips[n]; return c ? c.dur : .5; }

  private start(n: string){
    const g = this.inst.groups[n]; if (!g) return;
    const loop = Models.clips[n] ? Models.clips[n].loop : true;
    const air = Models.clips[n] && (Models.clips[n] as any).air;
    const span = Models.clips[n] && (Models.clips[n] as any).span;
    const cut = CUT[n] || (air && !loop ? { t0: air[0], t1: air[1], rate: (air[1] - air[0]) / AIRTIME } : null)
      || (span ? spanCut(span, this.clipDur(n)) : null);
    if (cut){ g.start(false, cut.rate, g.from + cut.t0 * 60, g.from + cut.t1 * 60); this.active.add(n); return; }
    g.start(loop, 1, g.from, g.to);
    /* join locomotion cycles in phase with whatever is already stepping */
    if (loop && /^(walk|run|sprint|crouch)_/.test(n)){
      const lead = [...this.active].find(k => /^(walk|run|sprint|crouch)_/.test(k));
      if (lead){
        const lg = this.inst.groups[lead], la = lg.animatables[0];
        if (la){ const ph = (la.masterFrame - lg.from) / Math.max(1e-3, lg.to - lg.from); g.goToFrame(g.from + ph * (g.to - g.from)); }
      }
    }
    this.active.add(n);
  }
  private restart(n: string){ if (this.active.has(n)) this.stop(n); this.w[n] = this.w[n] || 0; }
  private stop(n: string){ const g = this.inst.groups[n]; if (g) g.stop(); this.active.delete(n); this.w[n] = 0; }

  private pickDeath(s: AnimInput, d?: DeathInfo | null){
    if (this.kind !== 'rifle') return (this.kind === 'pistol' ? 'pistol_' : 'unarmed_') + 'death';
    if (s.stance === 2 && this.inst.groups['death_prone']) return 'death_prone';
    if (s.stance === 1 && d && d.head) return 'death_crouch_head';
    let side = 'front';
    if (d && d.fromX !== undefined){
      const sin = Math.sin(s.yaw), cos = Math.cos(s.yaw);
      const fwd = d.fromX * sin + d.fromZ * cos, right = d.fromX * cos - d.fromZ * sin;
      const a = Math.atan2(right, fwd) * 180 / Math.PI;           /* where the shot came from, 0 = in front */
      if (Math.abs(a) > 125) side = 'back';
      else if (a > 55) side = 'right';
    }
    if (d && d.head && side !== 'right') return 'death_' + side + '_head';
    return 'death_' + side;
  }

  /* hold the weapon: grip at the right palm, fore-grip pointing at the left hand */
  /* palm centre: halfway from the wrist to the middle knuckle (forearm direction if the rig has no fingers) */
  palm(side: 'Right' | 'Left'): BABYLON.Vector3 | null {
    const hand = side === 'Right' ? this.rh : this.lh; if (!hand) return null;
    const W = hand.getAbsolutePosition();
    const k = this.inst.node('mixamorig:' + side + 'HandMiddle1');
    if (k) return W.add(k.getAbsolutePosition().subtract(W).scaleInPlace(.55));
    const fa = this.inst.node('mixamorig:' + side + 'ForeArm');
    if (!fa) return W.clone();
    const d = W.subtract(fa.getAbsolutePosition()).normalize();
    return W.add(d.scaleInPlace(.05));
  }

  /* hold the weapon: grip in the right palm, fore-end toward the left palm, rolled with the chest */
  private placeWeapon(){
    const wp = this.weapon, mk = this.markers;
    if (!wp) return;
    /* the gun is parented to the world (placed between the hands), so it must follow the body's visibility */
    const shown = this.inst.root.isEnabled();
    if (wp.isEnabled() !== shown) wp.setEnabled(shown);
    if (!shown || !mk || !this.rh || !this.lh) return;
    const R = this.palm('Right'), L = this.palm('Left');
    const b = L.subtract(R); const bl = b.length(); if (bl < 1e-4) return;
    b.scaleInPlace(1 / bl);
    const fore = mk.fore || new BABYLON.Vector3(0, 0, .18);
    const a = fore.normalizeToNew();
    const ub = orthoUpTo(this.chestUp(), b), ua = orthoUpTo(BABYLON.Vector3.Up(), a);
    const qb = BABYLON.Quaternion.FromLookDirectionLH(b, ub), qa = BABYLON.Quaternion.FromLookDirectionLH(a, ua);
    wp.rotationQuaternion.copyFrom(qb.multiply(BABYLON.Quaternion.Inverse(qa)));
    wp.position.copyFrom(R);
  }

  /* torso up axis (hips → neck), so the gun rolls with a leaning body instead of staying world-upright */
  private chestUp(){
    const h = this.inst.node('mixamorig:Hips'), n = this.inst.node('mixamorig:Neck');
    if (!h || !n) return BABYLON.Vector3.Up();
    const u = n.getAbsolutePosition().subtract(h.getAbsolutePosition());
    return u.lengthSquared() > 1e-6 ? u.normalize() : BABYLON.Vector3.Up();
  }
}

/* a transition's moving part, at least 0.5s of it, compressed to TRANS_TIME */
function spanCut(span: number[], dur: number){
  const t0 = span[0], t1 = Math.min(dur, Math.max(span[1], t0 + .5));
  return { t0, t1, rate: Math.max(1, (t1 - t0) / TRANS_TIME) };
}
function wrap(a: number){ return ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; }

/* nearest of forward / right / back / left in the actor's frame, and the blend between the two nearest */
function localDir(s: AnimInput){
  const sin = Math.sin(s.yaw), cos = Math.cos(s.yaw);
  const fwd = s.vx * sin + s.vz * cos, right = s.vx * cos - s.vz * sin;
  let a = Math.atan2(right, fwd); if (a < 0) a += Math.PI * 2;
  return a;
}
const DIRS4 = ['f', 'r', 'b', 'l'];
function dir4(s: AnimInput){ return DIRS4[Math.round(localDir(s) / (Math.PI / 2)) % 4]; }
function dir4blend(s: AnimInput): [string, string, number] {
  const sec = localDir(s) / (Math.PI / 2), i0 = Math.floor(sec) % 4;
  return [DIRS4[i0], DIRS4[(i0 + 1) % 4], sec - Math.floor(sec)];
}

function tierWeights(sp: number): Array<[string, number]> {
  if (sp <= 2.6) return [['walk', 1]];
  if (sp < 3.6){ const t = (sp - 2.6); return [['walk', 1 - t], ['run', t]]; }
  if (sp <= 6.0) return [['run', 1]];
  if (sp < 7.0){ const t = (sp - 6.0); return [['run', 1 - t], ['sprint', t]]; }
  return [['sprint', 1]];
}

function orthoUpTo(up: BABYLON.Vector3, f: BABYLON.Vector3){
  const u = up.subtract(f.scale(BABYLON.Vector3.Dot(up, f)));
  const l = u.length();
  return l > 1e-4 ? u.scaleInPlace(1 / l) : new BABYLON.Vector3(0, 0, 1);
}
