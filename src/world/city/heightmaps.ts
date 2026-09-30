/* Heightmap images for City maps: public/heightmaps/index.json lists names, each is public/heightmaps/<name>.png
   (grayscale, any size; black = low, white = high). Loaded once at boot so map generation stays synchronous;
   every peer ships the same files, so a name is enough to reproduce the terrain. */
export interface HeightImage { w: number; h: number; px: Float32Array }

export const Heightmaps = {
  list: [] as string[],
  data: {} as Record<string, HeightImage>,

  async load(){
    const base = import.meta.env.BASE_URL + 'heightmaps/';
    const names: string[] = await fetch(base + 'index.json').then(r => r.ok ? r.json() : []).catch(() => []);
    await Promise.all(names.map(async n => {
      try {
        const img = new Image(); img.src = base + n + '.png';
        await img.decode();
        const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
        const x = cv.getContext('2d'); x.drawImage(img, 0, 0);
        const d = x.getImageData(0, 0, img.width, img.height).data, px = new Float32Array(img.width * img.height);
        for (let i = 0; i < px.length; i++) px[i] = (d[i * 4] * .3 + d[i * 4 + 1] * .59 + d[i * 4 + 2] * .11) / 255;
        this.data[n] = { w: img.width, h: img.height, px };
        this.list.push(n);
      } catch (e){ console.warn('[heightmap] failed to load', n, e); }
    }));
    this.list.sort();
  },

  /* bilinear sample, u/v in 0..1 (clamped) */
  sample(name: string, u: number, v: number){
    const H = this.data[name]; if (!H) return 0;
    const fx = Math.min(H.w - 1.001, Math.max(0, u * (H.w - 1))), fy = Math.min(H.h - 1.001, Math.max(0, v * (H.h - 1)));
    const i = fx | 0, j = fy | 0, a = fx - i, b = fy - j, p = H.px, w = H.w;
    return (p[j * w + i] * (1 - a) + p[j * w + i + 1] * a) * (1 - b) + (p[(j + 1) * w + i] * (1 - a) + p[(j + 1) * w + i + 1] * a) * b;
  }
};
