/* Heightfield ground. Arena maps have none (flat y=0); city maps set `terrain`.
   Heights are kept >= 0 so "below 0" stays a valid out-of-world test everywhere. */
export interface Terrain {
  res: number;            /* metres per sample */
  n: number;              /* samples per side */
  o: number;              /* world offset: sample (0,0) sits at (-o, -o) */
  h: Float32Array;        /* n*n heights, row-major by z */
}

export const mapTerrain = {
  terrain: null as Terrain | null,

  /* bilinear height at x/z (0 without terrain; clamped at the field edge) */
  terrainY(x: number, z: number){
    const T = this.terrain; if (!T) return 0;
    let fx = (x + T.o) / T.res, fz = (z + T.o) / T.res;
    fx = fx < 0 ? 0 : fx > T.n - 1.001 ? T.n - 1.001 : fx;
    fz = fz < 0 ? 0 : fz > T.n - 1.001 ? T.n - 1.001 : fz;
    const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, n = T.n, h = T.h;
    const a = h[j * n + i], b = h[j * n + i + 1], c = h[(j + 1) * n + i], d = h[(j + 1) * n + i + 1];
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  },

  /* first terrain hit along a ray within maxD (march + bisection), or -1 */
  terrainRay(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxD: number){
    if (!this.terrain) return -1;
    const step = 1.0;
    let pd = 0, pAbove = oy - this.terrainY(ox, oz);
    if (pAbove < 0) return 0;
    for (let d = step; d <= maxD + step; d += step){
      const dd = Math.min(d, maxD);
      const above = oy + dy * dd - this.terrainY(ox + dx * dd, oz + dz * dd);
      if (above <= 0){
        let a = pd, b = dd;
        for (let k = 0; k < 6; k++){ const m = (a + b) / 2; if (oy + dy * m - this.terrainY(ox + dx * m, oz + dz * m) > 0) a = m; else b = m; }
        return b;
      }
      pd = dd; pAbove = above;
      if (dd >= maxD) break;
    }
    return -1;
  }
};
