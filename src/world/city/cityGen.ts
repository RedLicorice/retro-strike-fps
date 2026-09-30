import { PI, TAU, clamp, lerp, rng, sHash } from '../../core/math';
import { Heightmaps } from './heightmaps';
import { tpl, footprint } from '../map/props';

/* =====================================================================
   CITY MAP: heightfield terrain + street grid + lots filled with the
   urban / panel-block / shipyard models. Buildings are solid (their
   colliders come from the model's own roof footprint); a few procedural
   walk-in buildings carry the interiors. Everything is seeded.
   ===================================================================== */
const HALF = 200;                 /* playable half-size (m) */
const SKIRT = 120;                /* terrain beyond the fence, rising into hills */
const TRES = 4;                   /* terrain sample spacing (m) */
const ROAD = 12;                  /* road width incl. sidewalks */
const WALK = 2.2;                 /* sidewalk width */
const ROADS = [-168, -112, -56, 0, 56, 112, 168];

/* real target heights for the panel blocks (the pack models are ~5x undersized) */
const TARGET_H: Record<string, number> = { house01: 9, house02: 15, house03: 15, house04: 15, house05: 42, house06: 40, house07: 27, house08: 60 };
const FLATS = ['bld_flat_a', 'bld_flat_b', 'bld_flat_e', 'bld_flat_h'];
const LFLATS = ['bld_flat_c', 'bld_flat_d', 'bld_flat_f', 'bld_flat_g'];
const PANEL = ['house01', 'house02', 'house03', 'house04'];
const TOWER = ['house05', 'house06', 'house08'];

interface Lot { x0: number; x1: number; z0: number; z1: number; edge: boolean; kind?: string }

const smooth = (t: number) => t * t * (3 - 2 * t);

export const mapCity = {
  generateCity(R: () => number, hm: string | null){
    this.half = HALF;
    this.bounds = { min: -HALF, max: HALF };
    this.roads = []; this.pavers = [];
    this.buildTerrain(R, hm);

    /* ---- lots between roads; the outer ring of lots is the city edge ---- */
    const cuts: number[][] = [];
    const edges = [-HALF + 1, ...ROADS.flatMap(r => [r - ROAD / 2, r + ROAD / 2]), HALF - 1];
    for (let i = 0; i < edges.length; i += 2) cuts.push([edges[i], edges[i + 1]]);
    const lots: Lot[] = [];
    for (let i = 0; i < cuts.length; i++) for (let j = 0; j < cuts.length; j++)
      lots.push({ x0: cuts[i][0], x1: cuts[i][1], z0: cuts[j][0], z1: cuts[j][1], edge: i === 0 || j === 0 || i === cuts.length - 1 || j === cuts.length - 1 });
    const inner = lots.filter(l => !l.edge);
    /* shuffle inner lots, then hand out the special kinds */
    for (let i = inner.length - 1; i > 0; i--){ const k = Math.floor(R() * (i + 1)); [inner[i], inner[k]] = [inner[k], inner[i]]; }
    const nWalk = 2 + Math.floor(R() * 3), nPlaza = 4 + Math.floor(R() * 2), nYard = 4 + Math.floor(R() * 2);
    inner.forEach((l, i) => {
      l.kind = i < nWalk ? 'walkin' : i < nWalk + nPlaza ? 'plaza' : i < nWalk + nPlaza + nYard ? 'yard'
        : (r => r < .4 ? 'quad' : r < .7 ? 'half' : r < .85 ? 'tower' : 'slab')(R());
    });
    /* flat ground where people fight inside / on open squares */
    for (const l of inner) if (l.kind === 'walkin' || l.kind === 'plaza') this.flatten(l.x0, l.z0, l.x1, l.z1, 10);

    for (const l of lots){
      if (l.edge) this.lotEdge(R, l);
      else (this as any)['lot_' + l.kind](R, l);
    }

    /* ---- streets ---- */
    for (const r of ROADS){
      this.roads.push({ x0: -HALF, z0: r, x1: HALF, z1: r, w: ROAD });
      this.roads.push({ x0: r, z0: -HALF, x1: r, z1: HALF, w: ROAD });
    }
    const stops = [-HALF + 1, ...ROADS, HALF - 1];
    for (const r of ROADS) for (let k = 0; k < stops.length - 1; k++){
      const a = stops[k] + (k === 0 ? 0 : ROAD / 2), b = stops[k + 1] - (k === stops.length - 2 ? 0 : ROAD / 2);
      this.street(R, r, a, b, true);
      this.street(R, r, a, b, false);
    }
    for (const x of ROADS) for (const z of ROADS) this.junction(R, x, z);

    /* ---- perimeter fence + skyline beyond it ---- */
    for (const side of [0, 1, 2, 3]) for (let u = -HALF; u < HALF; u += 8){
      const a = u + 4, e = HALF - .4;
      const [cx, cz, w, d] = side === 0 ? [a, -e, 8, .35] : side === 1 ? [a, e, 8, .35] : side === 2 ? [-e, a, .35, 8] : [e, a, .35, 8];
      const lo = Math.min(this.terrainY(cx - (w > 1 ? 4 : 0), cz - (d > 1 ? 4 : 0)), this.terrainY(cx + (w > 1 ? 4 : 0), cz + (d > 1 ? 4 : 0))) - .3;
      this.PROP('fenceBrick', 'perimeter', cx, cz, w, 2.4, d, lo);
    }
    this.skyline(R);

    /* ---- spawns: sidewalk spots, spread out ---- */
    const cand: number[][] = [];
    for (const r of ROADS) for (let u = -HALF + 12; u < HALF - 12; u += 14){
      if (ROADS.some(q => Math.abs(q - u) < ROAD)) continue;
      for (const s of [-1, 1]){ cand.push([u, r + s * (ROAD / 2 - 1.1)]); cand.push([r + s * (ROAD / 2 - 1.1), u]); }
    }
    for (let i = cand.length - 1; i > 0; i--){ const k = Math.floor(R() * (i + 1)); [cand[i], cand[k]] = [cand[k], cand[i]]; }
    for (const [x, z] of cand){
      const y = this.standable(x, z);
      if (!this.clear(x, z, y)) continue;
      if (this.spawns.some(s => Math.hypot(s.x - x, s.z - z) < 26)) continue;
      this.spawns.push({ x, z, y });
      if (this.spawns.length >= 32) break;
    }
    for (let k = 0; k < 40; k++) this.decals.push({ x: (R() - .5) * HALF * 1.8, z: (R() - .5) * HALF * 1.8, s: 1.6 + R() * 3.6, r: R() * TAU, m: R() < .6 ? 'fxDecal' : 'fxBDecal' });
  },

  /* a body fits standing here */
  clear(x: number, z: number, y: number){
    if (this.headBlocked(x, z, y, 1.9)) return false;
    for (let q = 0; q < 8; q++){ const a = q * PI / 4; if (this.headBlocked(x + Math.cos(a) * .6, z + Math.sin(a) * .6, y, 1.9)) return false; }
    return true;
  },

  /* ---------------- terrain ---------------- */
  buildTerrain(R: () => number, hm: string | null){
    const o = HALF + SKIRT, n = Math.round(o * 2 / TRES) + 1, h = new Float32Array(n * n);
    const seed = Math.floor(R() * 1e9);
    const hash = (i: number, j: number) => { let a = (i * 374761393 + j * 668265263 + seed * 2654435761) | 0; a = Math.imul(a ^ (a >>> 13), 1274126177); return ((a ^ (a >>> 16)) >>> 0) / 4294967296; };
    const vnoise = (x: number, y: number) => { const i = Math.floor(x), j = Math.floor(y), u = smooth(x - i), v = smooth(y - j);
      return lerp(lerp(hash(i, j), hash(i + 1, j), u), lerp(hash(i, j + 1), hash(i + 1, j + 1), u), v); };
    const useImg = hm && Heightmaps.data[hm];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++){
      const x = -o + i * TRES, z = -o + j * TRES;
      let y = useImg ? Heightmaps.sample(hm, (x + HALF) / (2 * HALF), (z + HALF) / (2 * HALF)) * 14
        : (vnoise(x / 260, z / 260) * .62 + vnoise(x / 110 + 17, z / 110 + 5) * .28 + vnoise(x / 45 + 3, z / 45 + 29) * .1) * 10;
      /* beyond the fence the ground climbs into hills so the city sits in a bowl */
      const e = clamp((Math.max(Math.abs(x), Math.abs(z)) - (HALF - 4)) / (SKIRT * .85), 0, 1);
      y += smooth(e) * (12 + vnoise(x / 60, z / 60) * 12);
      h[j * n + i] = Math.max(0, y);
    }
    this.terrain = { res: TRES, n, o, h };
  },

  /* level a rectangle to its mean height, blending back to the terrain over `fall` metres */
  flatten(x0: number, z0: number, x1: number, z1: number, fall: number){
    const T = this.terrain, n = T.n;
    let sum = 0, cnt = 0;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++){
      const x = -T.o + i * T.res, z = -T.o + j * T.res;
      if (x >= x0 && x <= x1 && z >= z0 && z <= z1){ sum += T.h[j * n + i]; cnt++; }
    }
    const target = cnt ? sum / cnt : this.terrainY((x0 + x1) / 2, (z0 + z1) / 2);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++){
      const x = -T.o + i * T.res, z = -T.o + j * T.res;
      const d = Math.max(x0 - x, x - x1, z0 - z, z - z1, 0);
      if (d >= fall) continue;
      const w = 1 - smooth(d / fall);
      T.h[j * n + i] = lerp(T.h[j * n + i], target, w);
    }
    return target;
  },

  /* ---------------- buildings ---------------- */
  /* one solid model building fitted into a maxW x maxD slot centred on cx/cz; returns its world rect or null */
  building(R: () => number, id: string, cx: number, cz: number, maxW: number, maxD: number, noCollide?: boolean){
    const t = tpl(id); if (!t) return null;
    const nat = TARGET_H[id] ? TARGET_H[id] / t.size.y : 1;
    const longX = t.size.x >= t.size.z, slotLongX = maxW >= maxD;
    const q = (longX === slotLongX ? 0 : 1) + (R() < .5 ? 2 : 0);          /* quarter turns */
    const odd = q % 2 === 1;
    const wx = odd ? t.size.z : t.size.x, wz = odd ? t.size.x : t.size.z;
    const sxz = Math.min(maxW / wx, maxD / wz, nat);
    if (sxz < nat * .35) return null;                                       /* would be a dollhouse */
    const sy = Math.min(nat, sxz * 1.6);
    const W = wx * sxz, D = wz * sxz, H = t.size.y * sy, lw = t.size.x * sxz, ld = t.size.z * sxz;
    /* foundation: sit on the high side, fill the low side with a plinth */
    let lo = 1e9, hi = -1e9;
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]]){ const y = this.terrainY(cx + dx * W / 2, cz + dz * D / 2); lo = Math.min(lo, y); hi = Math.max(hi, y); }
    let y = lo - .1;
    if (hi - lo > .45){ y = hi + .05; this.B('concDark', cx, cz, W + .8, y - lo + .4, D + .8, lo - .4); }
    const yaw = q * PI / 2, c = Math.cos(yaw), s = Math.sin(yaw);
    if (!noCollide) for (const f of footprint(id)){
      const xs = [(f.u0 - .5) * lw, (f.u1 - .5) * lw], zs = [(f.v0 - .5) * ld, (f.v1 - .5) * ld];
      let ax0 = 1e9, ax1 = -1e9, az0 = 1e9, az1 = -1e9;
      for (const lx of xs) for (const lz of zs){ const X = lx * c + lz * s, Z = -lx * s + lz * c; ax0 = Math.min(ax0, X); ax1 = Math.max(ax1, X); az0 = Math.min(az0, Z); az1 = Math.max(az1, Z); }
      this.PROP('none', 'concrete', cx + (ax0 + ax1) / 2, cz + (az0 + az1) / 2, ax1 - ax0, f.hf * H + .1, az1 - az0, y);
    }
    this.props.push({ kind: 'bld', id, x: cx, z: cz, y, lw, h: H, ld, rot: yaw });
    if (!noCollide) for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
      this.cover.push({ x: cx + dx * (W / 2 + 1.1), z: cz + dz * (D / 2 + 1.1), y: this.terrainY(cx + dx * (W / 2 + 1.1), cz + dz * (D / 2 + 1.1)), h: 3 });
    return { x0: cx - W / 2, x1: cx + W / 2, z0: cz - D / 2, z1: cz + D / 2 };
  },

  /* small prop on the ground (collider + model) */
  put(kind: string, mat: string, cx: number, cz: number, w: number, h: number, d: number, rot?: number){
    const y = Math.min(this.terrainY(cx - w / 2, cz - d / 2), this.terrainY(cx + w / 2, cz + d / 2), this.terrainY(cx, cz)) - .04;
    this.PROP(kind, mat, cx, cz, w, h, d, y, rot);
  },

  yardClutter(R: () => number, x0: number, z0: number, x1: number, z1: number, n: number){
    for (let k = 0; k < n; k++){
      const x = lerp(x0 + 2, x1 - 2, R()), z = lerp(z0 + 2, z1 - 2, R()), r = R(), hx = R() < .5;
      if (r < .3){ const w = 1.1 + R() * .5; this.put('crate', 'crate', x, z, w, R() < .5 ? 1.1 : 2.1, w); }
      else if (r < .5) this.put('dumpster', 'metal', x, z, hx ? 3.6 : 2, 1.95, hx ? 2 : 3.6);
      else if (r < .65) this.put('barrel', 'rusty', x, z, .7, 1.15, .7);
      else if (r < .8) this.put('trashcan', 'metal', x, z, .74, .81, .74);
      else if (x1 - x0 > 16 && z1 - z0 > 16) this.put('container', 'rusty', x, z, hx ? 12.2 : 2.44, 2.6, hx ? 2.44 : 12.2);
      else continue;
      this.cover.push({ x: x + 1.2, z, y: this.terrainY(x + 1.2, z), h: 1.2 });
    }
  },

  lot_quad(R: () => number, l: Lot){
    const mx = (l.x0 + l.x1) / 2, mz = (l.z0 + l.z1) / 2;
    for (const [a0, a1] of [[l.x0, mx], [mx, l.x1]]) for (const [b0, b1] of [[l.z0, mz], [mz, l.z1]]){
      const r = R(), cx = (a0 + a1) / 2, cz = (b0 + b1) / 2, w = a1 - a0 - 5, d = b1 - b0 - 5;
      if (r < .62){ const pool = R() < .55 ? FLATS : PANEL; if (this.building(R, pool[Math.floor(R() * pool.length)], cx, cz, w, d)) continue; }
      this.yardClutter(R, a0, b0, a1, b1, 2 + Math.floor(R() * 3));
    }
  },

  lot_half(R: () => number, l: Lot){
    const alongX = R() < .5, m = alongX ? (l.z0 + l.z1) / 2 : (l.x0 + l.x1) / 2;
    const A = alongX ? { x0: l.x0, x1: l.x1, z0: l.z0, z1: m } : { x0: l.x0, x1: m, z0: l.z0, z1: l.z1 };
    const B = alongX ? { x0: l.x0, x1: l.x1, z0: m, z1: l.z1 } : { x0: m, x1: l.x1, z0: l.z0, z1: l.z1 };
    const [big, rest] = R() < .5 ? [A, B] : [B, A];
    const id = R() < .6 ? LFLATS[Math.floor(R() * LFLATS.length)] : 'house07';
    this.building(R, id, (big.x0 + big.x1) / 2, (big.z0 + big.z1) / 2, big.x1 - big.x0 - 4, big.z1 - big.z0 - 3);
    this.courtyard(R, rest);
  },

  lot_slab(R: () => number, l: Lot){
    const alongX = R() < .5, far = R() < .5;
    const S = alongX ? { x0: l.x0, x1: l.x1, z0: far ? l.z1 - 18 : l.z0, z1: far ? l.z1 : l.z0 + 18 }
      : { x0: far ? l.x1 - 18 : l.x0, x1: far ? l.x1 : l.x0 + 18, z0: l.z0, z1: l.z1 };
    this.building(R, 'house07', (S.x0 + S.x1) / 2, (S.z0 + S.z1) / 2, S.x1 - S.x0 - 3, S.z1 - S.z0 - 3);
    const rest = alongX ? { x0: l.x0, x1: l.x1, z0: far ? l.z0 : l.z0 + 18, z1: far ? l.z1 - 18 : l.z1 }
      : { x0: far ? l.x0 : l.x0 + 18, x1: far ? l.x1 - 18 : l.x1, z0: l.z0, z1: l.z1 };
    this.courtyard(R, rest);
  },

  lot_tower(R: () => number, l: Lot){
    const cx = (l.x0 + l.x1) / 2, cz = (l.z0 + l.z1) / 2;
    this.building(R, TOWER[Math.floor(R() * TOWER.length)], cx, cz, 24, 24);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) if (R() < .6)
      this.yardClutter(R, cx + dx * 16 - 4, cz + dz * 16 - 4, cx + dx * 16 + 4, cz + dz * 16 + 4, 1);
  },

  /* open courtyard: low walls, benches, parked dumpsters, a container or two */
  courtyard(R: () => number, r: { x0: number; x1: number; z0: number; z1: number }){
    this.yardClutter(R, r.x0, r.z0, r.x1, r.z1, 3 + Math.floor(R() * 3));
    if (R() < .6){
      const horiz = (r.x1 - r.x0) > (r.z1 - r.z0), cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, len = 8 + R() * 8;
      this.put('fenceBrick', 'perimeter', cx + (horiz ? 0 : (R() - .5) * 6), cz + (horiz ? (R() - .5) * 6 : 0), horiz ? len : .3, 2.1, horiz ? .3 : len);
    }
  },

  lot_yard(R: () => number, l: Lot){
    const cx = (l.x0 + l.x1) / 2, cz = (l.z0 + l.z1) / 2, w = l.x1 - l.x0, d = l.z1 - l.z0;
    if (R() < .55) this.building(R, 'warehouse', cx, cz, w - 4, d * .62);
    else { this.building(R, 'bld_hangar', cx - w / 4, cz - d / 4, 18, 13); this.building(R, 'bld_hangar', cx + w / 4, cz + d / 4, 18, 13); }
    /* a row of containers along one lot edge */
    const rows = 2 + Math.floor(R() * 3), alongX = R() < .5, far = R() < .5;
    for (let k = 0; k < rows; k++){
      const off = (k - (rows - 1) / 2) * 13;
      const x = alongX ? cx + off : (far ? l.x1 - 3 : l.x0 + 3), z = alongX ? (far ? l.z1 - 3 : l.z0 + 3) : cz + off;
      this.put('container', 'rusty', x, z, alongX ? 12.2 : 2.44, 2.6, alongX ? 2.44 : 12.2);
      this.cover.push({ x: x + (alongX ? 0 : far ? -1.9 : 1.9), z: z + (alongX ? far ? -1.9 : 1.9 : 0), y: this.terrainY(x, z), h: 2.6 });
    }
    this.yardClutter(R, l.x0, l.z0, l.x1, l.z1, 4);
    this.lotFence(R, l);
  },

  lotFence(R: () => number, l: Lot){
    for (const side of [0, 1, 2, 3]){
      if (R() < .3) continue;
      const horiz = side < 2, len = horiz ? l.x1 - l.x0 : l.z1 - l.z0, gap = 5, g0 = (R() - .5) * (len - 14);
      for (const [a, b] of [[-len / 2 + .5, g0 - gap / 2], [g0 + gap / 2, len / 2 - .5]]){
        if (b - a < 2) continue;
        const m = (a + b) / 2;
        const x = horiz ? (l.x0 + l.x1) / 2 + m : side === 2 ? l.x0 + .4 : l.x1 - .4;
        const z = horiz ? (side === 0 ? l.z0 + .4 : l.z1 - .4) : (l.z0 + l.z1) / 2 + m;
        this.put('fenceMetal', 'metal', x, z, horiz ? b - a : .12, 1.7, horiz ? .12 : b - a);
      }
    }
  },

  lot_plaza(R: () => number, l: Lot){
    const cx = (l.x0 + l.x1) / 2, cz = (l.z0 + l.z1) / 2;
    this.pavers.push({ x0: l.x0, z0: l.z0, x1: l.x1, z1: l.z1, y: this.terrainY(cx, cz) });
    /* jersey barrier lines + sandbag nests: open ground with real cover */
    for (let k = 0; k < 5 + Math.floor(R() * 4); k++){
      const horiz = R() < .5, len = 2.5 * (1 + Math.floor(R() * 3));
      const x = lerp(l.x0 + 5, l.x1 - 5, R()), z = lerp(l.z0 + 5, l.z1 - 5, R());
      this.put('jersey', 'concDark', x, z, horiz ? len : .7, 1.14, horiz ? .7 : len);
      this.cover.push({ x: x + (horiz ? 0 : 1.1), z: z + (horiz ? 1.1 : 0), y: this.terrainY(x, z), h: 1.14 });
    }
    for (let k = 0; k < 2; k++){
      const sx = lerp(l.x0 + 8, l.x1 - 8, R()), sz = lerp(l.z0 + 8, l.z1 - 8, R()), y = this.terrainY(sx, sz);
      for (let i = 0; i < 6; i++){ const a = i / 6 * TAU; this.PROP('sandbag', 'sand', sx + Math.cos(a) * 1.05, sz + Math.sin(a) * 1.05, .8, .55, .55, y, a); }
      for (let i = 0; i < 5; i++){ const a = (i + .5) / 5 * TAU; this.PROP('sandbag', 'sand', sx + Math.cos(a) * 1.0, sz + Math.sin(a) * 1.0, .75, .5, .5, y + .55, a); }
      this.cover.push({ x: sx, z: sz, y, h: 1.05 });
    }
    for (let k = 0; k < 6; k++){ const e = R(); const x = e < .5 ? lerp(l.x0 + 1, l.x1 - 1, R()) : (R() < .5 ? l.x0 + 1 : l.x1 - 1), z = e < .5 ? (R() < .5 ? l.z0 + 1 : l.z1 - 1) : lerp(l.z0 + 1, l.z1 - 1, R());
      this.put('bollard', 'concrete', x, z, .45, 1.3, .45); }
    if (R() < .7) this.put('busstop', 'metal', l.x0 + 4 + R() * 30, l.z0 + 2, 4.2, 3.8, 2.2);
    for (let k = 0; k < 3; k++) this.put('bench', 'metal', lerp(l.x0 + 4, l.x1 - 4, R()), lerp(l.z0 + 4, l.z1 - 4, R()), 3.6, .76, .5);
  },

  /* ---------------- walk-in building (procedural, two storeys, stairs) ---------------- */
  lot_walkin(R: () => number, l: Lot){
    const cx = (l.x0 + l.x1) / 2, cz = (l.z0 + l.z1) / 2, G = this.terrainY(cx, cz);
    const W = 22, D = 14, T = .3, FH = 3.4, mat = R() < .5 ? 'perimeter' : 'concrete';
    const x0 = cx - W / 2, x1 = cx + W / 2, z0 = cz - D / 2, z1 = cz + D / 2;
    const door = (at: number) => ({ a: at - .85, b: at + .85, sill: 0, top: 2.4 });
    const win = (at: number) => ({ a: at - .8, b: at + .8, sill: 1.0, top: 2.3 });
    this.B('concrete', cx, cz, W, .12, D, G - .04);                               /* floor */
    /* ground storey: doors front/back/side, windows between */
    this.wallX(mat, x0, x1, z0 + T / 2, G, FH, T, [door(cx - 5 + R() * 3), win(x0 + 3.5), win(x1 - 3.5)]);
    this.wallX(mat, x0, x1, z1 - T / 2, G, FH, T, [door(cx + 2 + R() * 3), win(x0 + 5), win(cx - 1)]);
    this.wallZ(mat, z0 + T, z1 - T, x0 + T / 2, G, FH, T, [win(cz)]);
    this.wallZ(mat, z0 + T, z1 - T, x1 - T / 2, G, FH, T, [door(cz)]);
    /* interior partition with a doorway */
    this.wallZ(mat, z0 + T, z1 - T, cx + 3, G, FH, .2, [door(cz - 2.5)]);
    /* stairs along the back-left wall up to the slab */
    const sx0 = x0 + T + .2, sx1 = sx0 + 6.4, sz1 = z1 - T - .05, sz0 = sz1 - 1.5;
    this.SLOPE('metal', sx0, sz0, sx1, sz1, G, G + FH, .25);
    /* upper slab with the stair opening */
    const sl = .25, sy = G + FH - sl;
    this.B('concrete', cx, (z0 + sz0) / 2, W, sl, sz0 - z0, sy);
    this.B('concrete', (sx1 + x1) / 2, (sz0 + z1) / 2, x1 - sx1, sl, z1 - sz0, sy);
    this.B('trim', sx0 - .1, (sz0 + z1) / 2, .2, sl, z1 - sz0, sy);
    /* railing around the opening */
    this.B('metal', (sx0 + sx1) / 2 + .8, sz0 - .05, sx1 - sx0 - 1.6, 1.0, .08, G + FH);
    /* upper storey: windows all round, no doors */
    const U = G + FH;
    this.wallX(mat, x0, x1, z0 + T / 2, U, FH, T, [win(x0 + 3.5), win(cx - 2), win(cx + 3), win(x1 - 3.5)]);
    this.wallX(mat, x0, x1, z1 - T / 2, U, FH, T, [win(x0 + 9), win(cx + 3), win(x1 - 3.5)]);
    this.wallZ(mat, z0 + T, z1 - T, x0 + T / 2, U, FH, T, [win(cz - 2)]);
    this.wallZ(mat, z0 + T, z1 - T, x1 - T / 2, U, FH, T, [win(cz), win(cz + 3.5)]);
    /* roof + parapet */
    this.B('concDark', cx, cz, W + .3, .3, D + .3, U + FH);
    this.B(mat, cx, z0 + .1, W + .3, .8, .2, U + FH + .3); this.B(mat, cx, z1 - .1, W + .3, .8, .2, U + FH + .3);
    this.B(mat, x0 + .1, cz, .2, .8, D + .3, U + FH + .3); this.B(mat, x1 - .1, cz, .2, .8, D + .3, U + FH + .3);
    this.lamps.push({ x: cx - 4, z: cz, y: U - .5 });
    this.lamps.push({ x: cx + 4, z: cz, y: U + FH - .5 });
    for (const [x, z] of [[cx, z0 - 1.4], [cx, z1 + 1.4], [x0 - 1.4, cz], [x1 + 1.4, cz], [cx - 6, cz], [cx + 6, cz - 3]]) this.cover.push({ x, z, y: G, h: 3 });
    this.yardClutter(R, l.x0, l.z0, l.x0 + 10, l.z1, 2);
    this.yardClutter(R, l.x1 - 10, l.z0, l.x1, l.z1, 2);
    this.lotFence(R, l);
  },

  /* wall along X at z, from x0..x1, bottom y0, with gaps [{a,b,sill,top}] (a/b absolute x) */
  wallX(mat: string, x0: number, x1: number, z: number, y0: number, h: number, t: number, gaps: any[]){
    this.wallRun(mat, x0, x1, y0, h, gaps, (a, b, y, hh) => this.B(mat, (a + b) / 2, z, b - a, hh, t, y));
  },
  wallZ(mat: string, z0: number, z1: number, x: number, y0: number, h: number, t: number, gaps: any[]){
    this.wallRun(mat, z0, z1, y0, h, gaps, (a, b, y, hh) => this.B(mat, x, (a + b) / 2, t, hh, b - a, y));
  },
  wallRun(mat: string, s0: number, s1: number, y0: number, h: number, gaps: any[], box: (a: number, b: number, y: number, hh: number) => void){
    const gs = gaps.map(g => ({ ...g, a: clamp(g.a, s0 + .3, s1 - .3), b: clamp(g.b, s0 + .3, s1 - .3) })).filter(g => g.b - g.a > .4).sort((p, q) => p.a - q.a);
    let cur = s0;
    for (const g of gs){
      if (g.a < cur) continue;
      if (g.a - cur > .02) box(cur, g.a, y0, h);
      if (g.sill > 0) box(g.a, g.b, y0, g.sill);
      if (g.top < h) box(g.a, g.b, y0 + g.top, h - g.top);
      cur = g.b;
    }
    if (s1 - cur > .02) box(cur, s1, y0, h);
  },

  /* ---------------- edge of the city ---------------- */
  lotEdge(R: () => number, l: Lot){
    const w = l.x1 - l.x0, d = l.z1 - l.z0;
    if (w < 30 && d < 30){ this.building(R, TOWER[Math.floor(R() * TOWER.length)], (l.x0 + l.x1) / 2, (l.z0 + l.z1) / 2, w - 3, d - 3); return; }
    const alongX = w > d, len = alongX ? w : d, n = Math.max(1, Math.round(len / 22));
    for (let k = 0; k < n; k++){
      const a = (alongX ? l.x0 : l.z0) + (k + .5) * len / n;
      const cx = alongX ? a : (l.x0 + l.x1) / 2, cz = alongX ? (l.z0 + l.z1) / 2 : a;
      const pool = R() < .4 ? TOWER : R() < .5 ? FLATS : PANEL;
      if (!this.building(R, pool[Math.floor(R() * pool.length)], cx, cz, alongX ? len / n - 3 : w - 3, alongX ? d - 3 : len / n - 3))
        this.yardClutter(R, cx - 8, cz - 8, cx + 8, cz + 8, 2);
    }
  },

  skyline(R: () => number){
    const pool = [...TOWER, ...FLATS, ...LFLATS];
    for (let side = 0; side < 4; side++) for (let u = -HALF - 40; u < HALF + 40; u += 26 + R() * 14){
      const back = HALF + 20 + R() * 40;
      const [cx, cz] = side === 0 ? [u, -back] : side === 1 ? [u, back] : side === 2 ? [-back, u] : [back, u];
      this.building(R, pool[Math.floor(R() * pool.length)], cx, cz, 24, 24, true);
    }
  },

  /* ---------------- streets ---------------- */
  /* one road segment: r = road centre line, a..b along it; alongX = road runs along X */
  street(R: () => number, r: number, a: number, b: number, alongX: boolean){
    const P = (u: number, off: number) => alongX ? [u, r + off] : [r + off, u];
    const len = b - a, side = ROAD / 2 - 1.1;
    /* street lights, alternating sides */
    for (let k = 1; k <= 2; k++){ const [x, z] = P(a + len * k / 3, (k % 2 ? 1 : -1) * (ROAD / 2 - .4)); this.lamps.push({ x, z, y: 6.6, post: true }); }
    /* sidewalk furniture */
    for (let u = a + 3; u < b - 3; u += 7 + R() * 9){
      const [x, z] = P(u, (R() < .5 ? -1 : 1) * side), r2 = R();
      if (r2 < .35) this.put('trashcan', 'metal', x, z, .74, .81, .74);
      else if (r2 < .55) this.put('bollard', 'concrete', x, z, .45, 1.3, .45);
      else if (r2 < .62){ const [bx, bz] = P(u, (R() < .5 ? -1 : 1) * (side + .3)); this.put('bench', 'metal', bx, bz, alongX ? 3.6 : .5, .76, alongX ? .5 : 3.6); }
    }
    if (R() < .18){ const s = R() < .5 ? -1 : 1, [x, z] = P(a + len * (.3 + R() * .4), s * (ROAD / 2 - 1.2)); this.put('busstop', 'metal', x, z, alongX ? 4.2 : 2.2, 3.8, alongX ? 2.2 : 4.2); }
    /* cover in the carriageway: barrier chicanes, a dumped container, sandbags, plank barriers */
    const nC = R() < .55 ? 1 + Math.floor(R() * 2) : 0;
    for (let c = 0; c < nC; c++){
      const u = a + len * (.2 + R() * .6), lane = (R() < .5 ? -1 : 1) * (1.2 + R() * 1.4), [x, z] = P(u, lane), t = R();
      if (t < .45){ const n = 1 + Math.floor(R() * 3), L = n * 2.48; this.put('jersey', 'concDark', x, z, alongX ? L : .7, 1.14, alongX ? .7 : L); }
      else if (t < .65){ const across = R() < .4; const L = 12.2, [cx2, cz2] = across ? P(u, (lane > 0 ? 1 : -1) * 1.5) : [x, z];
        this.put('container', 'rusty', cx2, cz2, (alongX !== across) ? L : 2.44, 2.6, (alongX !== across) ? 2.44 : L); }
      else if (t < .85){ const L = 2.2 * (1 + Math.floor(R() * 2)); this.put('sandbag', 'sand', x, z, alongX ? L : .6, .75, alongX ? .6 : L); }
      else { this.put('plank', 'crate', x, z, alongX ? 2.2 : 1, 1.5, alongX ? 1 : 2.2); for (let k = 0; k < 3; k++){ const [cx3, cz3] = P(u + (R() - .5) * 6, lane + (R() - .5) * 2); this.put('cone', 'crate', cx3, cz3, .4, .57, .4); } }
      const [ox, oz] = P(u, lane + (lane > 0 ? -1.3 : 1.3));
      this.cover.push({ x: ox, z: oz, y: this.terrainY(ox, oz), h: 1.2 });
    }
  },

  junction(R: () => number, x: number, z: number){
    const t = R();
    if (t < .18){ const y = this.terrainY(x, z); for (let i = 0; i < 7; i++){ const a = i / 7 * TAU; this.PROP('sandbag', 'sand', x + Math.cos(a) * 1.6, z + Math.sin(a) * 1.6, .8, .55, .55, y, a); }
      this.cover.push({ x, z, y, h: 1 }); }
    else if (t < .32){ const h = R() < .5; this.put('jersey', 'concDark', x, z, h ? 4.96 : .7, 1.14, h ? .7 : 4.96); this.put('jersey', 'concDark', x + (h ? 0 : 2.4), z + (h ? 2.4 : 0), h ? .7 : 2.48, 1.14, h ? 2.48 : .7); }
  }
};
