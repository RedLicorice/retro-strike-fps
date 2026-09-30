import { TAU } from '../../core/math';

export const mapMinimap = {
  /* ---------------- minimap bake ---------------- */
  bakeMinimap(){
    const S = 460, cv = document.createElement('canvas'); cv.width = cv.height = S;
    const x = cv.getContext('2d'), half = this.half, k = S / (half * 2);
    const px = v => (v + half) * k;
    x.fillStyle = '#141811'; x.fillRect(0, 0, S, S);
    /* floor grid */
    x.strokeStyle = 'rgba(120,140,90,.10)'; x.lineWidth = 1;
    for (let i = -half; i <= half; i += 3){ x.beginPath(); x.moveTo(px(i), 0); x.lineTo(px(i), S); x.stroke(); x.beginPath(); x.moveTo(0, px(i)); x.lineTo(S, px(i)); x.stroke(); }
    for (const b of this.boxes){
      if (b.y1 < .45) continue;
      const w = (b.x1 - b.x0) * k, h = (b.z1 - b.z0) * k;
      if (w < .4 || h < .4) continue;
      const hi = b.y1 > 3.2, mid = b.y1 > 1.6;
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
