import { TAU } from '../../core/math';

export const mapMinimap = {
  /* ---------------- minimap bake ---------------- */
  bakeMinimap(){
    const S = this.terrain ? 1400 : 460, cv = document.createElement('canvas'); cv.width = cv.height = S;
    const x = cv.getContext('2d'), half = this.half, k = S / (half * 2);
    const px = v => (v + half) * k;
    x.fillStyle = '#141811'; x.fillRect(0, 0, S, S);
    if (this.terrain){
      /* height shading, then roads */
      const step = 4;
      for (let z = -half; z < half; z += step) for (let xx = -half; xx < half; xx += step){
        const h = this.terrainY(xx + step / 2, z + step / 2), l = Math.min(1, h / 14);
        x.fillStyle = 'rgb(' + Math.round(20 + l * 22) + ',' + Math.round(24 + l * 26) + ',' + Math.round(17 + l * 14) + ')';
        x.fillRect(px(xx), px(z), step * k + 1, step * k + 1);
      }
      x.fillStyle = 'rgba(160,170,140,.22)';
      for (const r of this.roads){
        if (r.x0 === r.x1) x.fillRect(px(r.x0 - r.w / 2), px(r.z0), r.w * k, (r.z1 - r.z0) * k);
        else x.fillRect(px(r.x0), px(r.z0 - r.w / 2), (r.x1 - r.x0) * k, r.w * k);
      }
      x.fillStyle = 'rgba(150,160,120,.14)';
      for (const p of this.pavers) x.fillRect(px(p.x0), px(p.z0), (p.x1 - p.x0) * k, (p.z1 - p.z0) * k);
    } else {
      /* floor grid */
      x.strokeStyle = 'rgba(120,140,90,.10)'; x.lineWidth = 1;
      for (let i = -half; i <= half; i += 3){ x.beginPath(); x.moveTo(px(i), 0); x.lineTo(px(i), S); x.stroke(); x.beginPath(); x.moveTo(0, px(i)); x.lineTo(S, px(i)); x.stroke(); }
    }
    for (const b of this.boxes){
      if (b.y1 - (this.terrain ? this.terrainY((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2) : 0) < .45) continue;
      const w = (b.x1 - b.x0) * k, h = (b.z1 - b.z0) * k;
      if (w < .4 || h < .4) continue;
      const top = b.y1 - (this.terrain ? this.terrainY((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2) : 0);
      const hi = top > 3.2, mid = top > 1.6;
      x.fillStyle = hi ? '#7d8c60' : mid ? '#5c6847' : '#414b34';
      x.fillRect(px(b.x0), px(b.z0), Math.max(1, w), Math.max(1, h));
      if (hi){ x.strokeStyle = 'rgba(20,24,16,.8)'; x.lineWidth = 1; x.strokeRect(px(b.x0), px(b.z0), w, h); }
    }
    x.strokeStyle = 'rgba(155,227,107,.35)'; x.lineWidth = 2;
    for (const s of this.slopes){ x.beginPath(); x.moveTo(px(s.x0), px(s.z0)); x.lineTo(px(s.x1), px(s.z1)); x.stroke(); }
    x.fillStyle = 'rgba(255,182,72,.5)';
    for (const s of this.spawns){ x.beginPath(); x.arc(px(s.x), px(s.z), 2.4, 0, TAU); x.fill(); }
    this.mmCanvas = cv;
  }
};
