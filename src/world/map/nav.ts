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
      open[k] = (!this.headBlocked(x, z, y, 1.9) && this.inside(x, z)) ? 1 : 0;
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

  /* A* on nav grid */
  findPath(sx, sz, tx, tz, maxNodes){
    const nv = this.nav; if (!nv) return null;
    let a = this.navIdx(sx, sz), b = this.navIdx(tx, tz);
    if (a < 0 || b < 0) return null;
    if (!nv.open[a]) a = this.nearestOpen(a); if (!nv.open[b]) b = this.nearestOpen(b);
    if (a < 0 || b < 0 || a === b) return null;
    const n = nv.n, N = n * n;
    if (!this._pf || this._pf.length !== N){
      this._pf = { g: new Float32Array(N), f: new Float32Array(N), from: new Int32Array(N), cl: new Uint8Array(N), op: new Uint8Array(N) };
    }
    const P = this._pf; P.g.fill(1e9); P.from.fill(-1); P.cl.fill(0); P.op.fill(0);
    const hp = k => { const i = k % n, j = (k / n) | 0, bi = b % n, bj = (b / n) | 0; return Math.hypot(i - bi, j - bj) * nv.res * .9; };
    const openList = [a]; P.g[a] = 0; P.f[a] = hp(a); P.op[a] = 1;
    let guard = maxNodes || 900;
    while (openList.length && guard-- > 0){
      let bi = 0; for (let i = 1; i < openList.length; i++) if (openList[i] < openList[bi]) bi = i;
      /* pick lowest f */
      let bestI = 0, bestF = 1e9;
      for (let i = 0; i < openList.length; i++){ const f = P.f[openList[i]]; if (f < bestF){ bestF = f; bestI = i; } }
      const cur = openList.splice(bestI, 1)[0]; P.op[cur] = 0;
      if (cur === b) break;
      P.cl[cur] = 1;
      const nb = this.navNeighbors(cur);
      for (let i = 0; i < nb.length; i++){
        const nk = nb[i]; if (P.cl[nk]) continue;
        const i0 = cur % n, j0 = (cur / n) | 0, i1 = nk % n, j1 = (nk / n) | 0;
        const cost = (i0 === i1 || j0 === j1 ? 1 : 1.414) * nv.res;
        const ng = P.g[cur] + cost;
        if (ng < P.g[nk]){
          P.g[nk] = ng; P.f[nk] = ng + hp(nk); P.from[nk] = cur;
          if (!P.op[nk]){ P.op[nk] = 1; openList.push(nk); }
        }
      }
    }
    if (P.from[b] < 0 && b !== a) return null;
    const path = []; let c = b;
    while (c >= 0 && c !== a){ path.push(this.navPos(c)); c = P.from[c]; if (path.length > 90) break; }
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

  randomOpen(){
    for (let t = 0; t < 40; t++){
      const x = (Math.random() - .5) * this.half * 1.7, z = (Math.random() - .5) * this.half * 1.7;
      const k = this.navIdx(x, z);
      if (k >= 0 && this.nav.open[k]) return this.navPos(k);
    }
    return this.spawns[rndi(this.spawns.length)] || { x: 0, z: 0, y: 0 };
  }
};
