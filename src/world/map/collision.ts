import { clamp, lerp, rayAABB, v3len } from '../../core/math';

export const mapCollision = {
  /* ---------------- queries ---------------- */
  heightAt(x, z){
    let y = 0;
    for (let i = 0; i < this.slopes.length; i++){
      const s = this.slopes[i];
      if (x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1) continue;
      const t = s.ax === 'x' ? (x - s.x0) / Math.max(.001, s.x1 - s.x0) : (z - s.z0) / Math.max(.001, s.z1 - s.z0);
      const h = lerp(s.h0, s.h1, clamp(t, 0, 1));
      if (h > y) y = h;
    }
    return y;
  },

  standable(x, z){
    let y = this.terrainY(x, z);
    const N = this.near(x, z, x, z).slice();
    for (let k = 0; k < 10; k++){
      let raised = false;
      for (let i = 0; i < N.length; i++){
        const b = N[i];
        if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue;
        if (b.y1 - b.y0 > 8) continue;           /* never stand on perimeter walls / tower blocks */
        if (b.y1 > y + .02 && b.y1 <= y + 1.2){ y = b.y1; raised = true; }
      }
      for (let i = 0; i < this.slopes.length; i++){
        const s = this.slopes[i];
        if (x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1) continue;
        const t = s.ax === 'x' ? (x - s.x0) / Math.max(.001, s.x1 - s.x0) : (z - s.z0) / Math.max(.001, s.z1 - s.z0);
        const h = lerp(s.h0, s.h1, clamp(t, 0, 1));
        if (h > y + .02 && h <= y + 1.2){ y = h; raised = true; }
      }
      if (!raised) break;
    }
    return y;
  },

  headBlocked(x, z, y, h){
    const N = this.near(x, z, x, z);
    for (let i = 0; i < N.length; i++){
      const b = N[i];
      if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue;
      if (b.y1 > y + .18 && b.y0 < y + h) return true;
    }
    return false;
  },

  solidAt(x, z, y, h){ return this.headBlocked(x, z, y, h); },

  boxFree(x0, x1, z0, z1, y0, y1){
    for (const b of this.near(x0 - .5, z0 - .5, x1 + .5, z1 + .5)) if (b.x1 > x0 - .5 && b.x0 < x1 + .5 && b.z1 > z0 - .5 && b.z0 < z1 + .5 && b.y1 > y0 && b.y0 < y1) return false;
    return true;
  },

  inside(x, z){ const m = this.half - .3; return x > -m && x < m && z > -m && z < m; },

  /* ray vs world -> {t,nx,ny,nz,mat} */
  ray(ox, oy, oz, dx, dy, dz, maxD){
    let bt = maxD, best = null, axis = 0, sign = 1;
    this.alongRay(ox, oz, dx, dz, maxD, b => {
      const t = rayAABB(ox, oy, oz, dx, dy, dz, b, bt);
      if (t >= 0 && t < bt){
        bt = t; best = b;
        const px = ox + dx * t, py = oy + dy * t, pz = oz + dz * t;
        const ex = Math.min(Math.abs(px - b.x0), Math.abs(px - b.x1));
        const ey = Math.min(Math.abs(py - b.y0), Math.abs(py - b.y1));
        const ez = Math.min(Math.abs(pz - b.z0), Math.abs(pz - b.z1));
        if (ey <= ex && ey <= ez){ axis = 1; sign = py < (b.y0 + b.y1) / 2 ? -1 : 1; }
        else if (ex <= ez){ axis = 0; sign = px < (b.x0 + b.x1) / 2 ? -1 : 1; }
        else { axis = 2; sign = pz < (b.z0 + b.z1) / 2 ? -1 : 1; }
      }
      return bt;
    });
    /* terrain */
    const tt = this.terrainRay(ox, oy, oz, dx, dy, dz, bt);
    if (tt >= 0 && tt < bt){ bt = tt; best = { mat: 'ground', terrain: 1 }; axis = 1; sign = 1; }
    /* ramps: march the ray and compare against surface height */
    const step = .28, lim = this.slopes.length ? Math.min(bt, 70) : 0;
    let ph = oy;
    for (let d = step; d < lim; d += step){
      const px = ox + dx * d, py = oy + dy * d, pz = oz + dz * d;
      if (px < -this.half || px > this.half || pz < -this.half || pz > this.half) break;
      const h = this.heightAt(px, pz);
      if (h > 0 && py <= h && ph >= h){
        if (d < bt){ bt = d; best = { mat: 'metal', slope: 1 }; axis = 1; sign = 1; }
        break;
      }
      ph = py;
    }
    if (!best) return null;
    const n = axis === 0 ? [sign, 0, 0] : axis === 1 ? [0, sign, 0] : [0, 0, sign];
    return { t: bt, x: ox + dx * bt, y: oy + dy * bt, z: oz + dz * bt, nx: n[0], ny: n[1], nz: n[2], mat: best.mat };
  },

  los(ax, ay, az, bx, by, bz){
    const dx = bx - ax, dy = by - ay, dz = bz - az, d = v3len(dx, dy, dz);
    if (d < .001) return true;
    const h = this.ray(ax, ay, az, dx / d, dy / d, dz / d, d - .35);
    return !h;
  },

  /* Ground query: only surfaces the actor is actually near (no teleport-up onto
   overhead ramps, no standing on 14m perimeter walls); the floor is the terrain (y=0 in the arena). */
  groundAt: function (x, z, y, step){
  let g = this.terrainY(x, z);
  const st = step == null ? .55 : step;
  for (let i = 0; i < this.slopes.length; i++){
    const s = this.slopes[i];
    if (x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1) continue;
    const t = s.ax === 'x' ? (x - s.x0) / Math.max(.001, s.x1 - s.x0) : (z - s.z0) / Math.max(.001, s.z1 - s.z0);
    const h = lerp(s.h0, s.h1, clamp(t, 0, 1));
    if (h <= y + st && h > g) g = h;
  }
  const B = this.near(x, z, x, z);
  for (let i = 0; i < B.length; i++){
    const b = B[i];
    if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue;
    if (b.y1 - b.y0 > 8) continue;
    if (b.y1 <= y + st && b.y1 > g) g = b.y1;
  }
  return g;
}
};
