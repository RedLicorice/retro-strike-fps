/* Uniform XZ grid over MAP.boxes so collision / ray / ground queries only touch nearby boxes.
   Rebuilt lazily whenever the box list changes length (generation, tests pushing a box, etc.). */
const CELL = 8;

export const mapSpatial = {
  _grid: null as null | { n: number; o: number; cells: number[][]; count: number; ref: any[] },
  _stamp: null as Uint32Array | null,
  _tick: 1,
  _near: [] as any[],

  gridBuild(){
    const B = this.boxes, o = this.half + 64, n = Math.ceil(o * 2 / CELL);
    const cells: number[][] = new Array(n * n);
    for (let i = 0; i < B.length; i++){
      const b = B[i];
      const i0 = Math.max(0, Math.floor((b.x0 + o) / CELL)), i1 = Math.min(n - 1, Math.floor((b.x1 + o) / CELL));
      const j0 = Math.max(0, Math.floor((b.z0 + o) / CELL)), j1 = Math.min(n - 1, Math.floor((b.z1 + o) / CELL));
      for (let j = j0; j <= j1; j++) for (let k = i0; k <= i1; k++){ const c = j * n + k; (cells[c] || (cells[c] = [])).push(i); }
    }
    this._grid = { n, o, cells, count: B.length, ref: B };
    this._stamp = new Uint32Array(B.length);
    this._tick = 1;
  },

  _g(){
    const g = this._grid;
    if (!g || g.count !== this.boxes.length || g.ref !== this.boxes) this.gridBuild();
    return this._grid;
  },

  /* boxes whose XZ cell range touches [x0,x1]x[z0,z1]; returns a shared array (copy it if you keep it) */
  near(x0: number, z0: number, x1: number, z1: number){
    const g = this._g(), out = this._near, B = this.boxes, st = this._stamp;
    out.length = 0;
    if (++this._tick === 0xffffffff){ st.fill(0); this._tick = 1; }
    const t = this._tick;
    const i0 = Math.max(0, Math.floor((x0 + g.o) / CELL)), i1 = Math.min(g.n - 1, Math.floor((x1 + g.o) / CELL));
    const j0 = Math.max(0, Math.floor((z0 + g.o) / CELL)), j1 = Math.min(g.n - 1, Math.floor((z1 + g.o) / CELL));
    for (let j = j0; j <= j1; j++) for (let k = i0; k <= i1; k++){
      const c = g.cells[j * g.n + k]; if (!c) continue;
      for (let q = 0; q < c.length; q++){ const i = c[q]; if (st[i] !== t){ st[i] = t; out.push(B[i]); } }
    }
    return out;
  },

  /* boxes along a ray segment, in cell order (2D DDA). visit(b) returns the current best hit distance so the
     walk stops once no further cell can beat it. dx/dz are the XZ part of a unit 3D direction. */
  alongRay(ox: number, oz: number, dx: number, dz: number, maxD: number, visit: (b: any) => number){
    const g = this._g(), B = this.boxes, st = this._stamp;
    if (++this._tick === 0xffffffff){ st.fill(0); this._tick = 1; }
    const t = this._tick;
    let i = Math.floor((ox + g.o) / CELL), j = Math.floor((oz + g.o) / CELL);
    const si = dx > 0 ? 1 : -1, sj = dz > 0 ? 1 : -1;
    const tdx = Math.abs(dx) > 1e-9 ? CELL / Math.abs(dx) : 1e30, tdz = Math.abs(dz) > 1e-9 ? CELL / Math.abs(dz) : 1e30;
    const fx = (ox + g.o) / CELL - i, fz = (oz + g.o) / CELL - j;
    let tx = Math.abs(dx) > 1e-9 ? (dx > 0 ? 1 - fx : fx) * tdx : 1e30, tz = Math.abs(dz) > 1e-9 ? (dz > 0 ? 1 - fz : fz) * tdz : 1e30;
    for (let guard = 0; guard < 4096; guard++){
      if (i >= 0 && j >= 0 && i < g.n && j < g.n){
        const c = g.cells[j * g.n + i];
        if (c) for (let q = 0; q < c.length; q++){ const k = c[q]; if (st[k] !== t){ st[k] = t; const bt = visit(B[k]); if (bt < maxD) maxD = bt; } }
      }
      const tn = Math.min(tx, tz);
      if (tn > maxD) break;
      if (tx < tz){ i += si; tx += tdx; } else { j += sj; tz += tdz; }
    }
  }
};
