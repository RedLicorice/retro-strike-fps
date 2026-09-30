import * as BABYLON from 'babylonjs';
import { SFX } from '../audio/sfx';
import { ctx } from '../core/context';
import { V3, clamp, quatFromNormal, rnd, v3len } from '../core/math';
import { Save } from '../core/save';
import { Player } from '../player/player';
import { MAT } from '../render/materials';
import { TX } from '../render/textures';
import { MAP } from '../world/map/index';

/* =====================================================================
   C) FX / INPUT / PLAYER CONTROLLER / WEAPON RUNTIME
   ===================================================================== */

/* ------------------------------ C1. FX ------------------------------ */
export const FX = {
  sys: {} as Record<string, any>, lights: [], tracers: [], decals: [], shells: [], rings: [], shakeA: 0, shakeT: 0,
  q(){ return ctx.QUALITY === 'high' ? 1 : ctx.QUALITY === 'med' ? .62 : .34; },
  init(){
    const mk = (name, cap, tex, blend, cfg) => {
      const arr = [];
      for (let i = 0; i < 3; i++){
        const ps = new BABYLON.ParticleSystem(name + i, Math.ceil(cap * this.q()), ctx.scene);
        ps.particleTexture = tex; ps.blendMode = blend;
        ps.emitRate = 0; ps.manualEmitCount = 0; ps.targetStopDuration = 0;
        ps.disposeOnStop = false; ps.updateSpeed = .012;
        cfg(ps); ps.start(); arr.push(ps);
      }
      this.sys[name] = { arr: arr, i: 0 };
    };
    const SP = BABYLON.ParticleSystem;
    mk('spark', 260, TX.mk('t_part', 64, TX.particle(false), true), SP.BLENDMODE_ADD, ps => {
      ps.minSize = .045; ps.maxSize = .16; ps.minLifeTime = .12; ps.maxLifeTime = .38;
      ps.minEmitPower = 5; ps.maxEmitPower = 15; ps.gravity = V3(0, -16, 0); ps.direction1 = V3(-1, .4, -1); ps.direction2 = V3(1, 2, 1);
      ps.color1 = new BABYLON.Color4(1, .86, .5, 1); ps.color2 = new BABYLON.Color4(1, .48, .12, 1);
      ps.colorDead = new BABYLON.Color4(.2, .05, 0, 0); ps.minAngularSpeed = 0; ps.maxAngularSpeed = 6;
    });
    mk('dust', 150, TX.mk('t_smoke', 64, TX.smoke(), true), SP.BLENDMODE_STANDARD, ps => {
      ps.minSize = .18; ps.maxSize = .7; ps.minLifeTime = .35; ps.maxLifeTime = .95;
      ps.minEmitPower = .6; ps.maxEmitPower = 3; ps.gravity = V3(0, .8, 0); ps.direction1 = V3(-1, .2, -1); ps.direction2 = V3(1, 1.4, 1);
      ps.color1 = new BABYLON.Color4(.62, .58, .5, .55); ps.color2 = new BABYLON.Color4(.44, .41, .35, .4);
      ps.colorDead = new BABYLON.Color4(.3, .28, .24, 0);
    });
    mk('blood', 170, TX.mk('t_blood', 64, TX.blood(), true), SP.BLENDMODE_STANDARD, ps => {
      ps.minSize = .08; ps.maxSize = .3; ps.minLifeTime = .2; ps.maxLifeTime = .55;
      ps.minEmitPower = 2; ps.maxEmitPower = 8; ps.gravity = V3(0, -18, 0); ps.direction1 = V3(-1, .2, -1); ps.direction2 = V3(1, 1.6, 1);
      ps.color1 = new BABYLON.Color4(.62, .04, .06, 1); ps.color2 = new BABYLON.Color4(.36, .02, .03, 1);
      ps.colorDead = new BABYLON.Color4(.15, 0, 0, 0);
    });
    mk('fire', 220, TX.mk('t_part2', 64, TX.particle(true), true), SP.BLENDMODE_ADD, ps => {
      ps.minSize = .3; ps.maxSize = 1.1; ps.minLifeTime = .3; ps.maxLifeTime = .8;
      ps.minEmitPower = 1; ps.maxEmitPower = 3.4; ps.gravity = V3(0, 3.5, 0); ps.direction1 = V3(-.4, 1, -.4); ps.direction2 = V3(.4, 2, .4);
      ps.color1 = new BABYLON.Color4(1, .72, .22, .95); ps.color2 = new BABYLON.Color4(1, .28, .06, .85);
      ps.colorDead = new BABYLON.Color4(.16, .04, .02, 0);
    });
    mk('flash', 40, TX.mk('t_flash', 96, TX.flash(), true), SP.BLENDMODE_ADD, ps => {
      ps.minSize = .16; ps.maxSize = .34; ps.minLifeTime = .035; ps.maxLifeTime = .075;
      ps.minEmitPower = 0; ps.maxEmitPower = .4; ps.gravity = V3(0, 0, 0);
      ps.color1 = new BABYLON.Color4(1, .92, .68, 1); ps.color2 = new BABYLON.Color4(1, .7, .3, 1);
      ps.colorDead = new BABYLON.Color4(1, .5, .1, 0);
    });
    /* pooled dynamic lights (hemi + sun + 2 = engine default of 4 max) */
    for (let i = 0; i < 2; i++){
      const l = new BABYLON.PointLight('fxl' + i, V3(0, -50, 0), ctx.scene);
      l.intensity = 0; l.range = 16; l.diffuse = new BABYLON.Color3(1, .78, .42);
      this.lights.push({ l: l, t: 0, peak: 0 });
    }
    /* tracers */
    const tmat = MAT.m.tracer;
    for (let i = 0; i < (ctx.QUALITY === 'low' ? 10 : 22); i++){
      const m = BABYLON.MeshBuilder.CreateBox('tr', { width: .028, height: .028, depth: 1 }, ctx.scene);
      m.material = tmat; m.isPickable = false; m.setEnabled(false); m.renderingGroupId = 0;
      this.tracers.push({ m: m, life: 0 });
    }
    /* decals */
    for (let i = 0; i < (ctx.QUALITY === 'low' ? 14 : 34); i++){
      const m = BABYLON.MeshBuilder.CreatePlane('dc', { size: 1, sideOrientation: BABYLON.Mesh.DOUBLESIDE }, ctx.scene);
      m.material = MAT.m.fxDecal; m.isPickable = false; m.setEnabled(false);
      this.decals.push({ m: m, life: 0 });
    }
    /* shells */
    for (let i = 0; i < 16; i++){
      const m = BABYLON.MeshBuilder.CreateBox('sh', { width: .018, height: .05, depth: .018 }, ctx.scene);
      m.material = MAT.m.shell; m.isPickable = false; m.setEnabled(false);
      this.shells.push({ m: m, life: 0, v: V3(0, 0, 0), w: V3(0, 0, 0) });
    }
    /* shock rings */
    for (let i = 0; i < 4; i++){
      const m = BABYLON.MeshBuilder.CreateTorus('rg', { diameter: 1, thickness: .09, tessellation: 22 }, ctx.scene);
      m.material = MAT.m.fxFlash; m.isPickable = false; m.setEnabled(false);
      this.rings.push({ m: m, life: 0 });
    }
  },
  burst(kind, x, y, z, nx, ny, nz, count, power, spread){
    const s = this.sys[kind]; if (!s) return;
    const ps = s.arr[s.i = (s.i + 1) % s.arr.length];
    ps.emitter = V3(x, y, z);
    const sp = spread === undefined ? 1 : spread;
    ps.direction1 = V3(nx * 3 * sp - sp, ny * 3 * sp + .2, nz * 3 * sp - sp);
    ps.direction2 = V3(nx * 3 * sp + sp, ny * 3 * sp + 1.2 * sp, nz * 3 * sp + sp);
    if (power !== undefined){ ps.minEmitPower = power * .5; ps.maxEmitPower = power * 1.5; }
    ps.manualEmitCount = Math.max(1, Math.round(count * this.q()));
  },
  flash(x, y, z, range, col){
    for (const L of this.lights){ if (L.t <= 0){ L.l.position.set(x, y, z); L.l.range = range; L.peak = 1; L.t = .09;
      if (col) L.l.diffuse.set(col[0], col[1], col[2]); else L.l.diffuse.set(1, .78, .42); return; } }
  },
  tracer(x0, y0, z0, x1, y1, z1, heavy){
    for (const t of this.tracers){
      if (t.life > 0) continue;
      const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, len = v3len(dx, dy, dz);
      if (len < .4) return;
      t.m.setEnabled(true); t.m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      /* orient +Z along the shot without relying on lookAt quaternion side effects */
      t.m.rotationQuaternion = null;
      t.m.rotation.set(Math.atan2(-(y1 - y0), Math.hypot(x1 - x0, z1 - z0)), Math.atan2(x1 - x0, z1 - z0), 0);
      t.m.scaling.set(heavy ? 1.5 : 1, heavy ? 1.5 : 1, len);
      t.life = heavy ? .09 : .055; return;
    }
  },
  decal(x, y, z, nx, ny, nz, blood, size?){
    let d = null, best = -1;
    for (const c of this.decals){ if (c.life <= 0){ d = c; break; } if (c.life < best || best < 0){ best = c.life; d = c; } }
    if (!d) d = this.decals[0];
    const s = size || (blood ? .5 + Math.random() * .5 : .16 + Math.random() * .1);
    d.m.setEnabled(true); d.m.material = blood ? MAT.m.fxBDecal : MAT.m.fxDecal;
    d.m.position.set(x + nx * .012, y + ny * .012, z + nz * .012);
    d.m.scaling.set(s, s, s);
    d.m.rotationQuaternion = quatFromNormal(V3(nx, ny, nz));
    d.life = blood ? 22 : 16;
  },
  shell(pos, right, up){
    for (const s of this.shells){
      if (s.life > 0) continue;
      s.m.setEnabled(true); s.m.position.copyFrom(pos);
      s.v.set(right.x * 2.6 + rnd(1, -.2), 2.2 + rnd(.8), right.z * 2.6 + rnd(1, -.2));
      s.w.set(rnd(24, -24), rnd(24, -24), rnd(24, -24)); s.life = 1.7; return;
    }
  },
  ring(x, y, z, size, col?){
    for (const r of this.rings){ if (r.life > 0) continue;
      r.m.setEnabled(true); r.m.position.set(x, y, z); r.m.scaling.set(.4, .4, .4); r.life = .45; r.size = size; return; }
  },
  shake(a){ if (!Save.data.settings.shake) return; this.shakeA = Math.min(2.4, this.shakeA + a); },
  impact(h, blood){
    const m = h.mat;
    if (blood){
      this.burst('blood', h.x, h.y, h.z, h.nx, h.ny, h.nz, 14, 7, .8);
      this.decal(h.x, h.y, h.z, h.nx, h.ny, h.nz, true);
    } else if (m === 'metal' || m === 'rusty'){
      this.burst('spark', h.x, h.y, h.z, h.nx, h.ny, h.nz, 16, 12, .8);
      this.burst('dust', h.x, h.y, h.z, h.nx, h.ny, h.nz, 3, 2, .5);
      this.decal(h.x, h.y, h.z, h.nx, h.ny, h.nz, false, .13);
      SFX.noise(.06, .12, 5200, 1800, 3, 'bandpass');
    } else if (m === 'crate'){
      this.burst('dust', h.x, h.y, h.z, h.nx, h.ny, h.nz, 7, 4, .8);
      this.burst('spark', h.x, h.y, h.z, h.nx, h.ny, h.nz, 4, 6, .6);
      this.decal(h.x, h.y, h.z, h.nx, h.ny, h.nz, false, .2);
    } else if (m === 'sand'){
      this.burst('dust', h.x, h.y, h.z, h.nx, h.ny, h.nz, 10, 3.4, 1);
    } else {
      this.burst('dust', h.x, h.y, h.z, h.nx, h.ny, h.nz, 8, 4, .9);
      this.burst('spark', h.x, h.y, h.z, h.nx, h.ny, h.nz, 7, 8, .5);
      this.decal(h.x, h.y, h.z, h.nx, h.ny, h.nz, false, .17);
    }
  },
  explosion(x, y, z, r){
    this.burst('fire', x, y, z, 0, 1, 0, 60, 9, 1.6);
    this.burst('dust', x, y, z, 0, 1, 0, 40, 7, 2.2);
    this.burst('spark', x, y, z, 0, 1, 0, 40, 22, 2);
    this.flash(x, y + .4, z, r * 3.2, [1, .62, .24]);
    this.ring(x, y + .2, z, r * .9);
    this.shake(clamp(2.6 - v3len(x - Player.pos.x, 0, z - Player.pos.z) / r * .8, .3, 2.6));
  },
  muzzle(x, y, z){
    this.burst('flash', x, y, z, 0, 0, 0, 3, .5, .3);
    this.burst('dust', x, y, z, 0, .3, 0, 2, 1.2, .3);
    this.flash(x, y, z, 9, [1, .8, .45]);
  },
  update(dt){
    for (const t of this.tracers){ if (t.life > 0){ t.life -= dt; if (t.life <= 0) t.m.setEnabled(false); } }
    for (const d of this.decals){ if (d.life > 0){ d.life -= dt; if (d.life <= 0) d.m.setEnabled(false); else if (d.life < 2) d.m.visibility = d.life / 2; } }
    for (const s of this.shells){
      if (s.life <= 0) continue;
      s.life -= dt; s.v.y -= 22 * dt;
      s.m.position.addInPlaceFromFloats(s.v.x * dt, s.v.y * dt, s.v.z * dt);
      s.m.rotation.x += s.w.x * dt; s.m.rotation.y += s.w.y * dt; s.m.rotation.z += s.w.z * dt;
      const g = MAP.groundAt ? MAP.groundAt(s.m.position.x, s.m.position.z, s.m.position.y + .2, .05) : 0;
      if (s.m.position.y < g + .02){ s.m.position.y = g + .02; s.v.y *= -.32; s.v.x *= .6; s.v.z *= .6; s.w.scaleInPlace(.5); }
      if (s.life <= 0) s.m.setEnabled(false); else if (s.life < .4) s.m.visibility = s.life / .4;
    }
    for (const r of this.rings){ if (r.life > 0){ r.life -= dt; const k = 1 - r.life / .45;
      r.m.scaling.set(.4 + k * r.size, .4 + k * r.size * .5, .4 + k * r.size); r.m.visibility = 1 - k;
      if (r.life <= 0) r.m.setEnabled(false); } }
    for (const L of this.lights){ if (L.t > 0){ L.t -= dt; L.l.intensity = Math.max(0, L.t / .09) * 5.5; if (L.t <= 0) L.l.intensity = 0; } }
    this.shakeA = Math.max(0, this.shakeA - dt * 4.2);
    this.shakeT += dt;
  },
  clear(){
    this.tracers.concat(this.decals, this.shells, this.rings).forEach(o => { o.life = 0; o.m.setEnabled(true); o.m.setEnabled(false); });
    for (const k in this.sys) this.sys[k].arr.forEach(p => { p.manualEmitCount = 0; p.reset(); });
    this.shakeA = 0;
  }
};
