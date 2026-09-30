import { TAU, makeSeed, rng, sHash } from '../../core/math';

export const mapGenerator = {
  /* ---------------- generation ---------------- */
  generate(seedStr){
    this.seed = (seedStr || makeSeed()).toUpperCase().slice(0, 16);
    this.reset();
    const R = rng(sHash(this.seed));
    const W = this.W, H = this.H, C = this.CELL;
    this.half = W * C / 2;
    this.bounds = { min: -this.half, max: this.half };
    const cellX = i => (i - (W - 1) / 2) * C, cellZ = j => (j - (H - 1) / 2) * C;

    /* perimeter — thick, tall, inward of the playable half so the player
       actually collides with a wall instead of sliding into the void.
       Tops are flagged as unwalkable (height > 8m) in groundAt. */
    const hw = this.half, T = 2.6, PH = 14;
    const inner = hw - 0.15;
    this.B('perimeter', 0, -inner - T / 2, hw * 2 + T * 2, PH, T, -.6);
    this.B('perimeter', 0, inner + T / 2, hw * 2 + T * 2, PH, T, -.6);
    this.B('perimeter', -inner - T / 2, 0, T, PH, hw * 2, -.6);
    this.B('perimeter', inner + T / 2, 0, T, PH, hw * 2, -.6);
    /* inward lip so you cannot stand on the wall crown */
    this.B('concDark', 0, -inner + .35, hw * 2, .45, .8, PH - 1.1);
    this.B('concDark', 0, inner - .35, hw * 2, .45, .8, PH - 1.1);
    this.B('concDark', -inner + .35, 0, .8, .45, hw * 2, PH - 1.1);
    this.B('concDark', inner - .35, 0, .8, .45, hw * 2, PH - 1.1);
    /* corner towers */
    const cT = inner + T / 2;
    this.B('cinder', -cT, -cT, 3.2, PH + 2.4, 3.2, -.6);
    this.B('cinder', cT, -cT, 3.2, PH + 2.4, 3.2, -.6);
    this.B('cinder', -cT, cT, 3.2, PH + 2.4, 3.2, -.6);
    this.B('cinder', cT, cT, 3.2, PH + 2.4, 3.2, -.6);
    for (let i = -hw + 3; i < hw; i += 6) {
      this.B('hazard', i, -inner + .18, 3.4, .42, .18, 1.15);
      this.B('hazard', i, inner - .18, 3.4, .42, .18, 1.15);
      this.B('hazard', -inner + .18, i, .18, .42, 3.4, 1.15);
      this.B('hazard', inner - .18, i, .18, .42, 3.4, 1.15);
    }

    /* modules on odd/odd cells; corridors (even index) stay clear */
    const mods = ['yard', 'container', 'container', 'bunker', 'tower', 'ruin', 'barricade', 'alley', 'ramp', 'yard'];
    const centre = { i: (W - 1) / 2, j: (H - 1) / 2 };
    for (let i = 1; i < W; i += 2) for (let j = 1; j < H; j += 2){
      const cx = cellX(i), cz = cellZ(j);
      const d = Math.hypot(i - centre.i, j - centre.j);
      let m = mods[(R() * mods.length) | 0];
      if (d < 1.2) m = R() < .5 ? 'yard' : 'barricade';           /* keep mid open-ish */
      if (d > 3.4 && R() < .45) m = R() < .5 ? 'tower' : 'bunker'; /* verticality on rim */
      const inset = .5 + R() * .5;
      const s = C - inset * 2;
      this['mod' + m[0].toUpperCase() + m.slice(1)](R, cx, cz, s);
    }

    /* scatter corridor clutter that never blocks more than 45% of a lane */
    for (let k = 0; k < 16; k++){
      const i = Math.floor(R() * W), j = Math.floor(R() * H);
      if (i % 2 === 1 && j % 2 === 1) continue;
      const cx = cellX(i), cz = cellZ(j);
      const t = R();
      if (t < .45){ const w = .9 + R() * .6; this.B('crate', cx + (R() - .5) * 2.6, cz + (R() - .5) * 2.6, w, R() < .5 ? 1.05 : 1.85, w, 0);
        this.cover.push({ x: cx, z: cz + 1.3, y: 0, h: 1.5 }); }
      else if (t < .7){ this.CYL('rusty', cx + (R() - .5) * 3, cz + (R() - .5) * 3, .42, 1.15, 0, 8); }
      else if (t < .86){ this.PROP('jersey', 'concDark', cx, cz + (R() < .5 ? -1.9 : 1.9), 2.5, 1.14, .7, 0); this.cover.push({ x: cx, z: cz, y: 0, h: 1.15 }); }
      else { const tx = cx + (R() - .5) * 3.4, tz = cz + (R() - .5) * 3.4; this.PROP('trashcan', 'metal', tx, tz, .74, .81, .74, 0); }
    }

    /* floor dressing decals + lamp posts */
    for (let k = 0; k < 26; k++) this.decals.push({ x: (R() - .5) * hw * 1.8, z: (R() - .5) * hw * 1.8, s: 1.4 + R() * 3.4, r: R() * TAU, m: R() < .5 ? 'fxDecal' : 'fxBDecal' });
    for (let i = 2; i < W - 1; i += 3) for (let j = 2; j < H - 1; j += 3){
      if (R() < .35) continue;
      const x = cellX(i) + 2.4, z = cellZ(j) + 2.4;
      if (this.solidAt(x, z, 0, 2.2)) continue;
      this.lamps.push({ x: x, z: z, y: 4.2, post: true });
    }

    /* spawns: corridor cells, spaced out */
    const cand = [];
    for (let i = 0; i < W; i += 2) for (let j = 0; j < H; j += 2) cand.push([cellX(i), cellZ(j)]);
    for (let i = 0; i < W; i += 2) for (let j = 1; j < H; j += 2) if (R() < .5) cand.push([cellX(i), cellZ(j)]);
    for (let i = 1; i < W; i += 2) for (let j = 0; j < H; j += 2) if (R() < .5) cand.push([cellX(i), cellZ(j)]);
    cand.sort(() => R() - .5);
    for (const c of cand){
      if (this.solidAt(c[0], c[1], 0, 2.0)) continue;
      let ok = true;
      for (const s of this.spawns) if (Math.hypot(s.x - c[0], s.z - c[1]) < 8){ ok = false; break; }
      if (ok) this.spawns.push({ x: c[0], z: c[1], y: this.standable(c[0], c[1]) });
      if (this.spawns.length >= 14) break;
    }
    if (this.spawns.length < 6) for (let i = 0; i < W; i++) for (let j = 0; j < H; j++){
      const x = cellX(i), z = cellZ(j);
      if (!this.solidAt(x, z, 0, 2.0)) this.spawns.push({ x: x, z: z, y: this.standable(x, z) });
    }
    /* spawn shelter: every spawn gets full-height cover; uncoverable spawns are dropped */
    for (let i = this.spawns.length - 1; i >= 0; i--){
      if (!this.shelterSpawn(this.spawns[i]) && this.spawns.length > 8) this.spawns.splice(i, 1);
    }
    this._topSorted = this.boxes.slice().sort((a, b) => a.y1 - b.y1);
    this.buildNav();
    return this.seed;
  },

  /* Put up to two 1.9m concrete slabs next to a spawn, preferring the sides that face
     the arena centre (where most sightlines come from). Returns whether the spawn ends
     up with full-height cover within 2m. */
  shelterSpawn(s){
    const off = 1.35, len = 2.6, th = .45, h = 1.9;
    const cx = s.x < 0 ? 1 : -1, cz = s.z < 0 ? 1 : -1;
    const sides = [[cx, 0], [0, cz], [-cx, 0], [0, -cz]];
    let placed = 0;
    if (s.y <= .05) for (const [dx, dz] of sides){
      if (placed >= 2) break;
      const wx = s.x + dx * off, wz = s.z + dz * off;
      const w = dx ? th : len, d = dx ? len : th;
      if (!this.boxFree(wx - w / 2, wx + w / 2, wz - d / 2, wz + d / 2, 0, h)) continue;
      this.B('concDark', wx, wz, w, h, d, 0);
      this.cover.push({ x: s.x + dx * (off - .8), z: s.z + dz * (off - .8), y: 0, h: h });
      placed++;
    }
    return this.boxes.some(b => b.y1 - b.y0 >= 1.4 && b.y0 <= s.y + .1 &&
      Math.max(b.x0 - s.x, 0, s.x - b.x1) < 2 && Math.max(b.z0 - s.z, 0, s.z - b.z1) < 2);
  }
};
