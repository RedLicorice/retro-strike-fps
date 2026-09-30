import { PI, TAU, lerp, rndi } from '../../core/math';

/* procedural materials that are drawn with a prop model instead of a textured box (collider unchanged) */
const PROP_MAT: Record<string, string> = { crate: 'crate', rusty: 'container', sand: 'sandbag' };

export const mapBuilders = {
  /* box from centre XZ + bottom Y */
  B(mat, cx, cz, w, h, d, y0, rot?){
    if (h <= 0) return;
    if (PROP_MAT[mat]) return this.PROP(PROP_MAT[mat], mat, cx, cz, w, h, d, y0, rot);
    const o = rot ? { p: [cx, y0 + h / 2, cz], s: [d, h, w], r: rot } : { p: [cx, y0 + h / 2, cz], s: [w, h, d], r: 0 };
    this.P(mat).push(o);
    const hw = w / 2, hd = d / 2;
    this.boxes.push({ x0: cx - hw, x1: cx + hw, y0: y0, y1: y0 + h, z0: cz - hd, z1: cz + hd, mat: mat });
    return o;
  },

  /* collider box + a model placement (kind 'none' = collider only). The model is fitted to the box at build time. */
  PROP(kind, mat, cx, cz, w, h, d, y0, rot?){
    const hw = w / 2, hd = d / 2;
    this.boxes.push({ x0: cx - hw, x1: cx + hw, y0: y0, y1: y0 + h, z0: cz - hd, z1: cz + hd, mat: mat });
    if (kind !== 'none') this.props.push({ kind, x: cx, z: cz, y: y0, w, h, d, rot: rot || 0 });
  },

  CYL(mat, cx, cz, r, h, y0, tess?){
    if (mat === 'rusty') return this.PROP('barrel', mat, cx, cz, r * 1.6, h, r * 1.6, y0);
    this.P(mat).push({ p: [cx, y0 + h / 2, cz], s: [r * 2, h, r * 2], r: 0, cyl: tess || 8 });
    this.boxes.push({ x0: cx - r * .8, x1: cx + r * .8, y0: y0, y1: y0 + h, z0: cz - r * .8, z1: cz + r * .8, mat: mat });
  },

  SLOPE(mat, x0, z0, x1, z1, h0, h1, thick){
    /* the ramp runs along whichever footprint axis is longer */
    const ax = Math.abs(x1 - x0) >= Math.abs(z1 - z0) ? 'x' : 'z';
    const run = ax === 'x' ? (x1 - x0) : (z1 - z0);
    const rise = h1 - h0, len = Math.sqrt(run * run + rise * rise);
    /* Babylon LH: +rot.z lifts +X, +rot.x drops +Z */
    const ang = Math.atan2(rise * (run < 0 ? -1 : 1), Math.abs(run)) * (ax === 'x' ? 1 : -1);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, cy = (h0 + h1) / 2;
    const w = ax === 'x' ? (z1 - z0) : (x1 - x0);
    const o = ax === 'x'
      ? { p: [cx, cy - (thick || .3) / 2, cz], s: [len, thick || .3, Math.abs(w)], r: 0, rx: 0, rz: ang }
      : { p: [cx, cy - (thick || .3) / 2, cz], s: [Math.abs(w), thick || .3, len], r: 0, rx: ang, rz: 0 };
    this.P(mat).push(o);
    this.slopes.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), h0: h0, h1: h1, ax: ax, dir: run >= 0 ? 1 : -1 });
  },

  /* axis-aligned wall with optional door / window gap */
  WALL(mat, x0, z0, x1, z1, h, t, gap){
    const horiz = Math.abs(z1 - z0) < .01;
    const len = horiz ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
    const sx = Math.min(horiz ? x0 : x0, horiz ? x0 : x0), sz = Math.min(z0, z1);
    const bx = horiz ? Math.min(x0, x1) : x0, bz = horiz ? z0 : Math.min(z0, z1);
    const seg = (a, b) => {
      if (b - a < .05) return;
      if (horiz) this.B(mat, bx + (a + b) / 2, bz, b - a, h, t, 0);
      else this.B(mat, bx, bz + (a + b) / 2, t, h, b - a, 0);
    };
    if (!gap){ seg(0, len); return; }
    const gs = gap.at * len - gap.w / 2, ge = gap.at * len + gap.w / 2;
    if (gap.type === 'window'){
      seg(0, gs); seg(ge, len);
      const sill = gap.sill === undefined ? 1.05 : gap.sill;
      if (sill > 0){ const o = this.boxes.length;
        if (horiz){ this.B(mat, bx + (gs + ge) / 2, bz, ge - gs, sill, t, 0); this.B(mat, bx + (gs + ge) / 2, bz, ge - gs, h - sill - 1.35, t, sill + 1.35); }
        else { this.B(mat, bx, bz + (gs + ge) / 2, t, sill, ge - gs, 0); this.B(mat, bx, bz + (gs + ge) / 2, t, h - sill - 1.35, ge - gs, sill + 1.35); } }
    } else {
      seg(0, gs); seg(ge, len);
      if (gap.lintel) this.B(mat, horiz ? bx + (gs + ge) / 2 : bx, horiz ? bz : bz + (gs + ge) / 2, horiz ? ge - gs : t, h - 2.4, horiz ? t : ge - gs, 2.4);
    }
  },

  /* ---------------- module library ---------------- */
  modYard(R, cx, cz, s){
    const n = 2 + rndi(4);
    for (let i = 0; i < n; i++){
      const w = 1.0 + R() * 1.1, d = 1.0 + R() * 1.1, h = R() < .45 ? 1.05 : 1.85;
      const x = cx + (R() - .5) * (s - w - .6), z = cz + (R() - .5) * (s - d - .6);
      this.B(R() < .75 ? 'crate' : 'concDark', x, z, w, h, d, 0);
      if (h > 1.5 && R() < .55) this.B('crate', x + .1, z - .1, w * .6, .8, d * .6, h);
      this.cover.push({ x: x, z: z + d / 2 + .55, y: 0, h: h });
      this.cover.push({ x: x + w / 2 + .55, z: z, y: 0, h: h });
    }
    if (R() < .5){ const bx = cx + (R() - .5) * 3, bz = cz + (R() - .5) * 3; this.CYL('rusty', bx, bz, .42, 1.15, 0, 8); this.cover.push({ x: bx + .8, z: bz, y: 0, h: 1.15 }); }
    if (R() < .3){
      const alongX = R() < .5, off = (s / 2 - 1.1) * (R() < .5 ? -1 : 1);
      this.PROP('dumpster', 'metal', cx + (alongX ? 0 : off), cz + (alongX ? off : 0), alongX ? 3.6 : 2, 1.95, alongX ? 2 : 3.6, 0);
      this.cover.push({ x: cx, z: cz, y: 0, h: 1.95 });
    }
  },

  modContainer(R, cx, cz, s){
    const L = 5.2, Wd = 2.4, Ht = 2.7;
    const rot = R() < .5;
    const stack = R() < .42;
    const put = (ox, oz, ry, y0) => {
      if (ry){ this.B('rusty', cx + ox, cz + oz, Wd, Ht, L, y0); }
      else { this.B('rusty', cx + ox, cz + oz, L, Ht, Wd, y0); }
      this.PROP('none', 'metal', cx + ox, cz + oz, ry ? Wd * 1.02 : L * 1.02, .12, ry ? L * 1.02 : Wd * 1.02, y0 + Ht);
    };
    put(0, 0, rot ? 1 : 0, 0);
    if (stack) put(rot ? 2.6 : 0, rot ? 0 : 2.6, rot ? 0 : 1, 0);
    const topY = Ht;
    /* access: crate steps or ramp */
    const side = rot ? 1.9 : 0, sideZ = rot ? 0 : 1.9;
    if (R() < .6){
      this.B('crate', cx + side * .9, cz + sideZ * .9, 1.1, .9, 1.1, 0);
      this.B('crate', cx + side * .9 + (rot ? .2 : 0), cz + sideZ * .9 + (rot ? 0 : .2), .95, 1.85, .95, 0);
      this.cover.push({ x: cx + side * .9 - (rot ? 1.1 : 0), z: cz + sideZ * .9 - (rot ? 0 : 1.1), y: 0, h: .9 });
    } else {
      const rx = rot ? cx + 1.6 : cx - 2.9, rz = rot ? cz - 2.9 : cz + 1.6;
      if (rot) this.SLOPE('metal', rx, cz - 1.1, rx + 2.6, cz + 1.1, 0, topY, .28);
      else this.SLOPE('metal', cx - 1.1, rz, cx + 1.1, rz + 2.6, 0, topY, .28);
    }
    this.cover.push({ x: cx + (rot ? -1.8 : 0), z: cz + (rot ? 0 : -1.8), y: 0, h: 3 });
    this.cover.push({ x: cx + (rot ? 1.8 : 0), z: cz + (rot ? 0 : 1.8), y: 0, h: 3 });
  },

  modBunker(R, cx, cz, s){
    const w = s - .7, h = this.WALLH - .6, t = .45, hw = w / 2;
    const doors = [R() < .7, R() < .7, R() < .7, R() < .7];
    const wallMat = R() < .5 ? 'concrete' : 'concDark';
    /* ground floor */
    this.WALL(wallMat, cx - hw, cz - hw, cx + hw, cz - hw, h, t, doors[0] ? { at: .3 + R() * .4, w: 1.7, type: 'door', lintel: 1 } : null);
    this.WALL(wallMat, cx - hw, cz + hw, cx + hw, cz + hw, h, t, doors[1] ? { at: .3 + R() * .4, w: 1.7, type: 'door', lintel: 1 } : null);
    this.WALL(wallMat, cx - hw, cz - hw, cx - hw, cz + hw, h, t, doors[2] ? { at: .3 + R() * .4, w: 1.7, type: 'door', lintel: 1 } : null);
    this.WALL(wallMat, cx + hw, cz - hw, cx + hw, cz + hw, h, t, doors[3] ? { at: .3 + R() * .4, w: 1.7, type: 'door', lintel: 1 } : null);
    /* upper slab + parapet (multi-storey vantage) */
    const slabY = 2.9, sw = w * (.55 + R() * .3);
    const sx = cx + (R() < .5 ? -1 : 1) * (w - sw) / 2 * .9;
    this.B('concrete', sx, cz, sw, .32, w - .5, slabY);
    this.B(wallMat, sx - sw / 2 + .1, cz - (w - .5) / 2 + .1, sw, 1.05, .3, slabY + .32);
    this.B(wallMat, sx + sw / 2 - .1, cz - (w - .5) / 2 + .1, .3, 1.05, w - .7, slabY + .32);
    /* stairs of crates to the slab */
    for (let i = 0; i < 4; i++) this.B('crate', sx + sw / 2 - .8 - i * .95, cz + (w - .5) / 2 - .9, .95, .72 * (i + 1), .95, 0);
    this.cover.push({ x: cx, z: cz - hw - .7, y: 0, h: 3 });
    this.cover.push({ x: cx - hw - .7, z: cz, y: 0, h: 3 });
    this.cover.push({ x: cx + hw + .7, z: cz, y: 0, h: 3 });
    this.lamps.push({ x: cx, z: cz, y: h - .5 });
  },

  modTower(R, cx, cz, s){
    const w = s - 1.1, hw = w / 2, py = 3.5, t = .4;
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(p => this.B('concrete', cx + p[0] * (hw - .2), cz + p[1] * (hw - .2), t, py, t, 0));
    this.B('metal', cx, cz, w, .3, w, py);
    /* waist-high railing = cover on the ledge */
    const rail = 1.0;
    this.B('concDark', cx, cz - hw + .1, w, rail, .22, py + .3);
    this.B('concDark', cx, cz + hw - .1, w, rail, .22, py + .3);
    this.B('concDark', cx - hw + .1, cz, .22, rail, w, py + .3);
    this.B('concDark', cx + hw - .1, cz, .22, rail, w * .35, py + .3);
    this.B('concDark', cx + hw - .1, cz + hw * .55, .22, rail, w * .35, py + .3);
    /* ramp up */
    const dir = rndi(4);
    const off = hw + 1.5;
    if (dir === 0) this.SLOPE('metal', cx - 1.1, cz - off - 2.6, cx + 1.1, cz - off, 0, py + .3, .3);
    if (dir === 1) this.SLOPE('metal', cx - 1.1, cz + off, cx + 1.1, cz + off + 2.6, py + .3, 0, .3);
    if (dir === 2) this.SLOPE('metal', cx - off - 2.6, cz - 1.1, cx - off, cz + 1.1, 0, py + .3, .3);
    if (dir === 3) this.SLOPE('metal', cx + off, cz - 1.1, cx + off + 2.6, cz + 1.1, py + .3, 0, .3);
    for (let i = 0; i < 3; i++) this.B('crate', cx - 1.2 + i * 1.2, cz, 1.1, .95, 1.1, 0);
    this.cover.push({ x: cx, z: cz - hw - 1.0, y: 0, h: 4 });
    this.cover.push({ x: cx - hw - 1.0, z: cz, y: 0, h: 4 });
    this.lamps.push({ x: cx, z: cz, y: py + 1.6 });
  },

  modRuin(R, cx, cz, s){
    const hw = (s - 1.0) / 2, m = R() < .5 ? 'concrete' : 'concDark';
    const seg = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0); const n = Math.max(1, Math.round(len / 1.5));
      for (let i = 0; i < n; i++){
        const t0 = i / n, t1 = (i + 1) / n;
        const h = 1.4 + R() * 2.8;
        if (R() < .18) continue;
        const x = lerp(x0, x1, (t0 + t1) / 2), z = lerp(z0, z1, (t0 + t1) / 2);
        if (x1 === x0) this.B(m, x, z, .42, h, len / n - .06, 0);
        else this.B(m, x, z, len / n - .06, h, .42, 0);
        if (h > 2 && R() < .4) this.B('concDark', x, z, .5, .5, .5, h);
      }
      this.cover.push({ x: (x0 + x1) / 2 + (x1 === x0 ? .9 : 0), z: (z0 + z1) / 2 + (x1 === x0 ? 0 : .9), y: 0, h: 2.4 });
    };
    if (R() < .5){ seg(cx - hw, cz - hw, cx - hw, cz + hw * .4); seg(cx - hw, cz + hw, cx + hw * .5, cz + hw); }
    else { seg(cx - hw, cz - hw, cx + hw, cz - hw); seg(cx + hw, cz - hw, cx + hw, cz + hw * .3); }
    for (let i = 0; i < 3 + rndi(3); i++) this.B('concDark', cx + (R() - .5) * 3.4, cz + (R() - .5) * 3.4, .7 + R() * .9, .35 + R() * .5, .7 + R() * .9, 0);
  },

  modBarricade(R, cx, cz, s){
    const n = 3 + rndi(3);
    for (let i = 0; i < n; i++){
      const ang = R() * PI, len = 2.2 + R() * 1.8, h = R() < .5 ? 1.15 : 1.9;
      const dx = Math.cos(ang) * len / 2, dz = Math.sin(ang) * len / 2;
      const px = cx + (R() - .5) * (s - 3), pz = cz + (R() - .5) * (s - 3);
      const horiz = Math.abs(Math.cos(ang)) > .7;
      if (h < 1.3) this.PROP('jersey', 'concDark', px, pz, horiz ? len : .7, h, horiz ? .7 : len, 0);
      else this.B('concDark', px, pz, horiz ? len : .55, h, horiz ? .55 : len, 0);
      if (h > 1.5) this.B('hazard', px, pz, horiz ? len * .9 : .58, .22, horiz ? .58 : len * .9, h * .55);
      this.cover.push({ x: px + (horiz ? 0 : 1.0), z: pz + (horiz ? 1.0 : 0), y: 0, h: h });
      this.cover.push({ x: px - (horiz ? 0 : 1.0), z: pz - (horiz ? 1.0 : 0), y: 0, h: h });
    }
    if (R() < .6){ /* sandbag nest */
      const sx = cx + (R() - .5) * 3, sz = cz + (R() - .5) * 3;
      for (let i = 0; i < 6; i++){ const a = i / 6 * TAU; this.B('sand', sx + Math.cos(a) * 1.05, sz + Math.sin(a) * 1.05, .8, .55, .55, 0, a); }
      for (let i = 0; i < 5; i++){ const a = (i + .5) / 5 * TAU; this.B('sand', sx + Math.cos(a) * 1.0, sz + Math.sin(a) * 1.0, .75, .5, .5, .55, a); }
      this.cover.push({ x: sx, z: sz, y: 0, h: 1.05 });
    }
  },

  modAlley(R, cx, cz, s){
    /* walls that bite into the corridors -> narrow alleyways, always >=2.5m passage */
    const m = R() < .5 ? 'concrete' : 'concDark';
    const h = 3.2 + R() * 1.6, t = .5, ext = 1.6 + R() * .9;
    const horiz = R() < .5;
    if (horiz){
      this.B(m, cx, cz - s / 2 - ext / 2, s * .9, h, t, 0);
      if (R() < .7) this.B(m, cx + (R() < .5 ? -1 : 1) * s * .3, cz + s / 2 + ext / 2, s * .5, h * .8, t, 0);
      this.cover.push({ x: cx, z: cz - s / 2 - ext - .7, y: 0, h: h });
    } else {
      this.B(m, cx - s / 2 - ext / 2, cz, t, h, s * .9, 0);
      if (R() < .7) this.B(m, cx + s / 2 + ext / 2, cz + (R() < .5 ? -1 : 1) * s * .3, t, h * .8, s * .5, 0);
      this.cover.push({ x: cx - s / 2 - ext - .7, z: cz, y: 0, h: h });
    }
    this.modYard(R, cx, cz, s - 1.6);
  },

  modRamp(R, cx, cz, s){
    const hw = (s - 1.4) / 2, h = 2.1 + R() * 1.1;
    const dir = rndi(4);
    if (dir === 0){ this.SLOPE('concrete', cx - 1.4, cz - hw - 3.0, cx + 1.4, cz - hw, 0, h, .35); this.B('metal', cx, cz, 3.0, .32, hw * 2, h); }
    if (dir === 1){ this.SLOPE('concrete', cx - 1.4, cz + hw, cx + 1.4, cz + hw + 3.0, h, 0, .35); this.B('metal', cx, cz, 3.0, .32, hw * 2, h); }
    if (dir === 2){ this.SLOPE('concrete', cx - hw - 3.0, cz - 1.4, cx - hw, cz + 1.4, 0, h, .35); this.B('metal', cx, cz, hw * 2, .32, 3.0, h); }
    if (dir === 3){ this.SLOPE('concrete', cx + hw, cz - 1.4, cx + hw + 3.0, cz + 1.4, h, 0, .35); this.B('metal', cx, cz, hw * 2, .32, 3.0, h); }
    this.B('concDark', cx, cz, 3.0, 1.0, .25, h + .32);
    this.cover.push({ x: cx + (dir === 2 ? -2 : 2), z: cz + (dir === 0 ? -2 : 2), y: 0, h: 3 });
    for (let i = 0; i < 2; i++) this.B('crate', cx + (R() - .5) * 3, cz + (R() - .5) * 3, 1.0, 1.0, 1.0, 0);
  }
};
