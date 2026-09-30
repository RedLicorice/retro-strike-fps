import { rndi } from '../../core/math';

export const mapNav = {
  /* ---------------- navigation grid (bots / monsters) ---------------- */
  buildNav(){
    const res = 2, n = Math.floor(this.half * 2 / res);
    const open = new Uint8Array(n * n), gy = new Float32Array(n * n);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++){
      const x = -this.half + res / 2 + i * res, z = -this.half + res / 2 + j * res;
      const y = this.standable(x, z);
      const k = j * n + i; gy[k] = y;
      /* a body (r .38) must fit, not just the cell centre: sample the centre and a ring at .45 m */
      let clear = this.inside(x, z) && !this.headBlocked(x, z, y, 1.9);
      for (let q = 0; clear && q < 8; q++){ const a = q * Math.PI / 4; if (this.headBlocked(x + Math.cos(a) * .45, z + Math.sin(a) * .45, y, 1.9)) clear = false; }
      open[k] = clear ? 1 : 0;
    }
    this.nav = { res: res, n: n, open: open, gy: gy };
  },

  navIdx(x, z){
    const nv = this.nav; if (!nv) return -1;
    const i = Math.floor((x + this.half) / nv.res), j = Math.floor((z + this.half) / nv.res);
    if (i < 0 || j < 0 || i >= nv.n || j >= nv.n) return -1;
    return j * nv.n + i;
  },

  navPos(k){ const nv = this.nav, n = nv.n; const i = k % n, j = (k / n) | 0;
    return { x: -this.half + nv.res / 2 + i * nv.res, z: -this.half + nv.res / 2 + j * nv.res, y: nv.gy[k] }; },

  navNeighbors(k){
    const nv = this.nav, n = nv.n, out = [], i = k % n, j = (k / n) | 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++){
      if (!di && !dj) continue;
      const diag = di && dj;
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
      const kk = jj * n + ii;
      if (!nv.open[kk]) continue;
      const dy = nv.gy[kk] - nv.gy[k];
      if (dy > 1.15 || dy < -4.2) continue;
      if (diag){ if (!nv.open[j * n + ii] || !nv.open[jj * n + i]) continue; }
      out.push(kk);
    }
    return out;
  },

  /* A* on nav grid (binary heap; node budget scales with the map so city paths aren't cut short) */
  findPath(sx, sz, tx, tz, maxNodes){
    const nv = this.nav; if (!nv) return null;
    let a = this.navIdx(sx, sz), b = this.navIdx(tx, tz);
    if (a < 0 || b < 0) return null;
    if (!nv.open[a]) a = this.nearestOpen(a); if (!nv.open[b]) b = this.nearestOpen(b);
    if (a < 0 || b < 0 || a === b) return null;
    const n = nv.n, N = n * n;
    if (!this._pf || this._pf.g.length !== N){
      this._pf = { g: new Float32Array(N), from: new Int32Array(N), cl: new Uint8Array(N), heap: new Int32Array(N * 2), hf: new Float32Array(N * 2) };
    }
    const P = this._pf; P.g.fill(1e9); P.from.fill(-1); P.cl.fill(0);
    const bi = b % n, bj = (b / n) | 0;
    const hp = k => { const di = Math.abs(k % n - bi), dj = Math.abs(((k / n) | 0) - bj); return (Math.max(di, dj) + .414 * Math.min(di, dj)) * nv.res; };
    /* min-heap of (f, node); stale entries are skipped via the closed set */
    const H = P.heap, F = P.hf; let hn = 0;
    const push = (k, f) => { let i = hn++; while (i > 0){ const p = (i - 1) >> 1; if (F[p] <= f) break; H[i] = H[p]; F[i] = F[p]; i = p; } H[i] = k; F[i] = f; };
    const pop = () => { const top = H[0], lk = H[--hn], lf = F[hn]; let i = 0;
      for (;;){ let c = 2 * i + 1; if (c >= hn) break; if (c + 1 < hn && F[c + 1] < F[c]) c++; if (F[c] >= lf) break; H[i] = H[c]; F[i] = F[c]; i = c; }
      H[i] = lk; F[i] = lf; return top; };
    P.g[a] = 0; push(a, hp(a));
    let guard = Math.round((maxNodes || 900) * Math.max(1, (this.half / 33) * (this.half / 33) * .25));
    while (hn && guard-- > 0){
      const cur = pop();
      if (P.cl[cur]) continue;
      if (cur === b) break;
      P.cl[cur] = 1;
      const nb = this.navNeighbors(cur);
      for (let i = 0; i < nb.length; i++){
        const nk = nb[i]; if (P.cl[nk]) continue;
        const i0 = cur % n, j0 = (cur / n) | 0, i1 = nk % n, j1 = (nk / n) | 0;
        const ng = P.g[cur] + (i0 === i1 || j0 === j1 ? 1 : 1.414) * nv.res;
        if (ng < P.g[nk]){ P.g[nk] = ng; P.from[nk] = cur; if (hn < H.length) push(nk, ng + hp(nk)); }
      }
    }
    if (P.from[b] < 0 && b !== a) return null;
    const path = []; let c = b;
    while (c >= 0 && c !== a){ path.push(this.navPos(c)); c = P.from[c]; if (path.length > 400) break; }
    path.push(this.navPos(a)); path.reverse();
    return path;
  },

  nearestOpen(k){
    const nv = this.nav, n = nv.n, i = k % n, j = (k / n) | 0;
    for (let r = 1; r < 6; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++){
      if (Math.abs(di) !== r && Math.abs(dj) !== r) continue;
      const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
      const kk = jj * n + ii; if (nv.open[kk]) return kk;
    }
    return k;
  },

  /* random walkable point; with (x, z, r) it stays within r metres of x/z (large maps: keep bot trips local) */
  randomOpen(x?: number, z?: number, r?: number){
    const local = x !== undefined && r !== undefined;
    for (let t = 0; t < 40; t++){
      const px = local ? x + (Math.random() - .5) * 2 * r : (Math.random() - .5) * this.half * 1.7;
      const pz = local ? z + (Math.random() - .5) * 2 * r : (Math.random() - .5) * this.half * 1.7;
      const k = this.navIdx(px, pz);
      if (k >= 0 && this.nav.open[k]) return this.navPos(k);
    }
    return this.spawns[rndi(this.spawns.length)] || { x: 0, z: 0, y: 0 };
  }
};
