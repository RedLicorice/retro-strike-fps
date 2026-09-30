import * as BABYLON from 'babylonjs';
import { ctx } from '../core/context';
import { PI, TAU, rnd } from '../core/math';

/* ------------------------------ A3. PROCEDURAL TEXTURES ------------------------------ */
export const TX = {
  c: {} as Record<string, BABYLON.Texture>,
  mk(name, size, draw, nearest){
    if (this.c[name]) return this.c[name];
    const t = new BABYLON.DynamicTexture(name, { width: size, height: size }, ctx.scene, false);
    t.hasAlpha = false; const x = t.getContext(); draw(x, size);
    t.update(false);
    if (nearest) t.updateSamplingMode(BABYLON.Texture.NEAREST_SAMPLINGMODE);
    t.wrapU = t.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
    this.c[name] = t; return t;
  },
  grain(x, s, n, a, mono){
    for (let i = 0; i < n; i++){
      const v = (Math.random() * 255) | 0;
      x.fillStyle = mono ? 'rgba(' + v + ',' + v + ',' + v + ',' + a + ')' : 'rgba(' + ((v * .9) | 0) + ',' + ((v * .95) | 0) + ',' + ((v * .8) | 0) + ',' + a + ')';
      x.fillRect((Math.random() * s) | 0, (Math.random() * s) | 0, 1 + (Math.random() * 2 | 0), 1 + (Math.random() * 2 | 0));
    }
  },
  stains(x, s, n, col, rmax){
    for (let i = 0; i < n; i++){
      const r = 6 + Math.random() * rmax, px = Math.random() * s, py = Math.random() * s;
      const g = x.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.beginPath(); x.arc(px, py, r, 0, TAU); x.fill();
    }
  },
  concrete(base, dark){ return (x, s) => {
    x.fillStyle = base; x.fillRect(0, 0, s, s);
    this.stains(x, s, 26, dark, 40); this.grain(x, s, 2600, .16);
    x.strokeStyle = 'rgba(0,0,0,.28)'; x.lineWidth = 2;
    for (let i = 0; i < 4; i++){ const p = (i + 1) * s / 4 + rnd(4, -4); x.beginPath(); x.moveTo(0, p); x.lineTo(s, p); x.stroke(); x.beginPath(); x.moveTo(p, 0); x.lineTo(p, s); x.stroke(); }
    x.strokeStyle = 'rgba(255,255,255,.06)'; x.lineWidth = 1;
    for (let i = 0; i < 4; i++){ const p = (i + 1) * s / 4 + 2; x.beginPath(); x.moveTo(0, p); x.lineTo(s, p); x.stroke(); }
    for (let i = 0; i < 5; i++){ x.fillStyle = 'rgba(0,0,0,.3)'; const cx = Math.random() * s, cy = Math.random() * s; x.beginPath(); x.arc(cx, cy, 2.4, 0, TAU); x.fill(); x.fillStyle = 'rgba(255,255,255,.07)'; x.beginPath(); x.arc(cx, cy - 1.2, 2.4, 0, TAU); x.fill(); }
  }; },
  metal(base, panel, rivet){ return (x, s) => {
    x.fillStyle = base; x.fillRect(0, 0, s, s);
    const n = 4, cs = s / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++){
      x.fillStyle = panel; x.fillRect(i * cs + 3, j * cs + 3, cs - 6, cs - 6);
      x.strokeStyle = 'rgba(0,0,0,.5)'; x.lineWidth = 2; x.strokeRect(i * cs + 3, j * cs + 3, cs - 6, cs - 6);
      x.strokeStyle = 'rgba(255,255,255,.07)'; x.lineWidth = 1; x.beginPath(); x.moveTo(i * cs + 4, j * cs + cs - 4); x.lineTo(i * cs + cs - 4, j * cs + cs - 4); x.lineTo(i * cs + cs - 4, j * cs + 4); x.stroke();
      x.fillStyle = rivet;
      [[7, 7], [cs - 7, 7], [7, cs - 7], [cs - 7, cs - 7]].forEach(p => { x.beginPath(); x.arc(i * cs + p[0], j * cs + p[1], 2.2, 0, TAU); x.fill(); });
    }
    this.stains(x, s, 14, 'rgba(120,60,20,.20)', 26); this.grain(x, s, 900, .1, true);
  }; },
  crate(){ return (x, s) => {
    x.fillStyle = '#6b4f2a'; x.fillRect(0, 0, s, s);
    for (let i = 0; i < 7; i++){ const y = i * s / 7; x.fillStyle = i % 2 ? '#7a5a30' : '#634926'; x.fillRect(0, y + 1, s, s / 7 - 2);
      x.strokeStyle = 'rgba(0,0,0,.35)'; x.lineWidth = 1; x.beginPath(); x.moveTo(0, y); x.lineTo(s, y); x.stroke();
      for (let k = 0; k < 26; k++){ x.fillStyle = 'rgba(0,0,0,' + (Math.random() * .1) + ')'; x.fillRect(Math.random() * s, y + 2, 6 + Math.random() * 14, 1); } }
    x.strokeStyle = '#3d2c15'; x.lineWidth = 8; x.strokeRect(4, 4, s - 8, s - 8);
    x.strokeStyle = '#8b6a3a'; x.lineWidth = 5; x.beginPath(); x.moveTo(6, 6); x.lineTo(s - 6, s - 6); x.moveTo(s - 6, 6); x.lineTo(6, s - 6); x.stroke();
    x.fillStyle = 'rgba(220,190,120,.55)'; x.font = 'bold ' + (s * .17) + 'px monospace'; x.textAlign = 'center';
    x.fillText('AMMO', s / 2, s * .58);
    this.grain(x, s, 700, .12);
  }; },
  floor(){ return (x, s) => {
    x.fillStyle = '#3a3a33'; x.fillRect(0, 0, s, s);
    const n = 4, cs = s / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++){
      const v = 52 + ((Math.random() * 16) | 0);
      x.fillStyle = 'rgb(' + v + ',' + v + ',' + (v - 5) + ')'; x.fillRect(i * cs + 1.5, j * cs + 1.5, cs - 3, cs - 3);
    }
    this.stains(x, s, 30, 'rgba(20,18,12,.45)', 34); this.grain(x, s, 2200, .13, true);
    x.strokeStyle = 'rgba(0,0,0,.4)'; x.lineWidth = 2;
    for (let i = 0; i <= n; i++){ x.beginPath(); x.moveTo(i * cs, 0); x.lineTo(i * cs, s); x.stroke(); x.beginPath(); x.moveTo(0, i * cs); x.lineTo(s, i * cs); x.stroke(); }
  }; },
  sand(){ return (x, s) => {
    x.fillStyle = '#8a7a52'; x.fillRect(0, 0, s, s);
    for (let i = 0; i < 60; i++){ x.fillStyle = 'rgba(' + (120 + rnd(50) | 0) + ',' + (105 + rnd(45) | 0) + ',' + (70 + rnd(35) | 0) + ',.5)';
      x.beginPath(); x.ellipse(Math.random() * s, Math.random() * s, 4 + Math.random() * 22, 3 + Math.random() * 12, Math.random() * PI, 0, TAU); x.fill(); }
    this.grain(x, s, 4200, .18); this.stains(x, s, 12, 'rgba(60,50,30,.4)', 30);
  }; },
  hazard(){ return (x, s) => {
    x.fillStyle = '#1b1b18'; x.fillRect(0, 0, s, s);
    x.save(); x.translate(s / 2, s / 2); x.rotate(-PI / 4); x.translate(-s, -s);
    for (let i = 0; i < 12; i++){ x.fillStyle = i % 2 ? '#e6a417' : '#1b1b18'; x.fillRect(i * s / 5, 0, s / 5, s * 2.4); }
    x.restore(); this.grain(x, s, 800, .12, true);
  }; },
  corrug(){ return (x, s) => {
    x.fillStyle = '#4a5a52'; x.fillRect(0, 0, s, s);
    for (let i = 0; i < 16; i++){ const y = i * s / 16;
      const g = x.createLinearGradient(0, y, 0, y + s / 16); g.addColorStop(0, '#6a7d72'); g.addColorStop(.5, '#3d4c45'); g.addColorStop(1, '#5c6e64');
      x.fillStyle = g; x.fillRect(0, y, s, s / 16); }
    this.stains(x, s, 22, 'rgba(140,70,25,.35)', 22); this.grain(x, s, 1200, .1, true);
    x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(0, s * .48, s, 3);
  }; },
  particle(soft){ return (x, s) => {
    x.clearRect(0, 0, s, s);
    const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    if (soft){ g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(.35, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)'); }
    else { g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.5, 'rgba(255,255,255,.7)'); g.addColorStop(.72, 'rgba(255,255,255,.12)'); g.addColorStop(1, 'rgba(255,255,255,0)'); }
    x.fillStyle = g; x.fillRect(0, 0, s, s);
  }; },
  flash(){ return (x, s) => {
    x.clearRect(0, 0, s, s);
    const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s * .3);
    g.addColorStop(0, '#fff'); g.addColorStop(.4, 'rgba(255,220,140,.9)'); g.addColorStop(1, 'rgba(255,140,20,0)');
    x.fillStyle = g; x.fillRect(0, 0, s, s);
    x.strokeStyle = 'rgba(255,240,190,.95)'; x.lineWidth = s * .045;
    for (let i = 0; i < 6; i++){ const a = i * TAU / 6 + .3; x.beginPath(); x.moveTo(s / 2 + Math.cos(a) * s * .1, s / 2 + Math.sin(a) * s * .1);
      x.lineTo(s / 2 + Math.cos(a) * s * (.28 + Math.random() * .16), s / 2 + Math.sin(a) * s * (.28 + Math.random() * .16)); x.stroke(); }
  }; },
  smoke(){ return (x, s) => {
    x.clearRect(0, 0, s, s);
    for (let i = 0; i < 22; i++){ const px = s / 2 + rnd(s * .22, -s * .22), py = s / 2 + rnd(s * .22, -s * .22), r = s * (.1 + Math.random() * .18);
      const g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, 'rgba(255,255,255,.30)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.beginPath(); x.arc(px, py, r, 0, TAU); x.fill(); }
  }; },
  blood(){ return (x, s) => {
    x.clearRect(0, 0, s, s);
    for (let i = 0; i < 14; i++){ const px = s / 2 + rnd(s * .3, -s * .3), py = s / 2 + rnd(s * .3, -s * .3), r = s * (.04 + Math.random() * .12);
      x.fillStyle = 'rgba(' + (120 + rnd(70) | 0) + ',' + (10 + rnd(20) | 0) + ',' + (14 + rnd(16) | 0) + ',.9)';
      x.beginPath(); x.arc(px, py, r, 0, TAU); x.fill(); }
  }; },
  decal(){ return (x, s) => {
    x.clearRect(0, 0, s, s);
    const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s * .26);
    g.addColorStop(0, 'rgba(8,8,8,.95)'); g.addColorStop(.6, 'rgba(20,20,20,.6)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.beginPath(); x.arc(s / 2, s / 2, s * .3, 0, TAU); x.fill();
    x.strokeStyle = 'rgba(210,205,190,.5)'; x.lineWidth = 2;
    for (let i = 0; i < 5; i++){ const a = Math.random() * TAU; x.beginPath(); x.moveTo(s / 2, s / 2); x.lineTo(s / 2 + Math.cos(a) * s * .22, s / 2 + Math.sin(a) * s * .22); x.stroke(); }
  }; },
  bdecal(){ return (x, s) => {
    x.clearRect(0, 0, s, s);
    for (let i = 0; i < 9; i++){ const px = s / 2 + rnd(s * .26, -s * .26), py = s / 2 + rnd(s * .3, -s * .2);
      const g = x.createRadialGradient(px, py, 0, px, py, s * (.05 + Math.random() * .12));
      g.addColorStop(0, 'rgba(110,8,14,.85)'); g.addColorStop(1, 'rgba(70,4,8,0)'); x.fillStyle = g;
      x.beginPath(); x.arc(px, py, s * .16, 0, TAU); x.fill(); }
  }; },
  sky(){ return (x, s) => {
    const g = x.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, '#0b1220'); g.addColorStop(.28, '#1a2a3c'); g.addColorStop(.48, '#4a5360');
    g.addColorStop(.62, '#c98448'); g.addColorStop(.74, '#e8a35a'); g.addColorStop(.86, '#8a6240'); g.addColorStop(1, '#3a2c1c');
    x.fillStyle = g; x.fillRect(0, 0, s, s);
    for (let i = 0; i < 90; i++){ x.fillStyle = 'rgba(255,255,255,' + (Math.random() * .35) + ')'; x.beginPath(); x.arc(Math.random() * s, Math.random() * s * .38, Math.random() * 1.6, 0, TAU); x.fill(); }
    /* sun glow */
    const sx = s * .78, sy = s * .62, sg = x.createRadialGradient(sx, sy, 0, sx, sy, s * .22);
    sg.addColorStop(0, 'rgba(255,240,200,1)'); sg.addColorStop(.12, 'rgba(255,190,90,.95)'); sg.addColorStop(.45, 'rgba(255,140,50,.28)'); sg.addColorStop(1, 'rgba(255,100,30,0)');
    x.fillStyle = sg; x.beginPath(); x.arc(sx, sy, s * .22, 0, TAU); x.fill();
    for (let i = 0; i < 18; i++){ const px = Math.random() * s, py = s * (.42 + Math.random() * .22), w = 50 + Math.random() * 160, h = 8 + Math.random() * 22;
      x.fillStyle = 'rgba(40,28,22,' + (.16 + Math.random() * .28) + ')'; x.beginPath(); x.ellipse(px, py, w, h, 0, 0, TAU); x.fill(); }
  }; },
  mkNorm(name, size, draw){
    const tmp = document.createElement('canvas'); tmp.width = tmp.height = size;
    const x = tmp.getContext('2d'); draw(x, size);
    const img = x.getImageData(0, 0, size, size), d = img.data;
    const out = x.createImageData(size, size), o = out.data;
    const lum = (xx, yy) => { const i = (((yy + size) % size) * size + ((xx + size) % size)) * 4; return d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11; };
    const str = .018;
    for (let y = 0; y < size; y++) for (let xx = 0; xx < size; xx++){
      const nx = (lum(xx - 1, y) - lum(xx + 1, y)) * str, ny = (lum(xx, y - 1) - lum(xx, y + 1)) * str;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      const i = (y * size + xx) * 4;
      o[i] = (nx * inv * .5 + .5) * 255; o[i + 1] = (ny * inv * .5 + .5) * 255; o[i + 2] = (inv * .5 + .5) * 255; o[i + 3] = 255;
    }
    const t = new BABYLON.DynamicTexture(name, { width: size, height: size }, ctx.scene, false);
    t.getContext().putImageData(out, 0, 0); t.update(false);
    t.wrapU = t.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
    this.c[name] = t; return t;
  }
};
