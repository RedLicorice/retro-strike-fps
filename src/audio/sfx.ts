import { clamp, rnd } from '../core/math';

/* ------------------------------ A2. AUDIO (procedural) ------------------------------ */
export const SFX = {
  ctx: null, master: null, nb: null, vol: .7,
  init(){
    if (this.ctx) return;
    const AC = window.AudioContext || (window as any).webkitAudioContext; if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = this.vol; this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 1.2, b = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.nb = b;
  },
  resume(){ if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  setVol(v){ this.vol = v; if (this.master) this.master.gain.value = v; },
  _g(v){ const g = this.ctx.createGain(); g.gain.value = v; g.connect(this.master); return g; },
  noise(dur, vol, f0, f1, q, type?, pan?, delay?){
    if (!this.ctx) return; const t = this.ctx.currentTime + (delay || 0);
    const s = this.ctx.createBufferSource(); s.buffer = this.nb; s.loop = true;
    const bp = this.ctx.createBiquadFilter(); bp.type = type || 'bandpass'; bp.frequency.setValueAtTime(f0, t);
    bp.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur); bp.Q.value = q || 1;
    const g = this._g(0); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0008, t + dur);
    let node = bp; if (pan && this.ctx.createStereoPanner){ const p = this.ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); bp.connect(p); p.connect(g); }
    else bp.connect(g);
    s.connect(node); s.start(t); s.stop(t + dur + .05);
  },
  tone(f0, f1, dur, vol, type, pan, delay){
    if (!this.ctx) return; const t = this.ctx.currentTime + (delay || 0);
    const o = this.ctx.createOscillator(); o.type = type || 'sine';
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = this._g(0); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0008, t + dur);
    if (pan && this.ctx.createStereoPanner){ const p = this.ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); o.connect(p); p.connect(g); }
    else o.connect(g);
    o.start(t); o.stop(t + dur + .05);
  },
  /* weapon voice profiles: [body, crack, tail, thump] */
  shot(p, dist, pan){
    const at = clamp(1 - dist / 70, .12, 1);
    const vol = .55 * at;
    this.noise(.045, vol, p.crack, p.crack * .35, 1.1, 'bandpass', pan);
    this.noise(p.tail, vol * .5, p.body, 90, .8, 'lowpass', pan, .012);
    this.tone(p.thump, p.thump * .35, .12, vol * .8, 'triangle', pan);
    if (dist > 12) this.noise(.16, vol * .3, 900, 200, .6, 'lowpass', pan, dist / 340);
  },
  dry(){ this.noise(.05, .22, 2400, 700, 3); },
  reloadA(){ this.noise(.05, .2, 1400, 500, 4); },
  reloadB(){ this.noise(.06, .26, 900, 300, 3, 'bandpass', 0, .02); this.tone(320, 180, .05, .12, 'square'); },
  swap(){ this.noise(.09, .18, 700, 1800, 2); },
  hit(pan?){ this.tone(1500, 900, .06, .22, 'square', pan); this.noise(.05, .16, 3000, 800, 2, 'bandpass', pan); },
  headshot(pan?){ this.tone(2200, 1200, .09, .26, 'square', pan); this.tone(880, 440, .1, .14, 'sawtooth', pan); },
  kill(){ this.tone(660, 990, .1, .2, 'square'); this.tone(990, 1320, .12, .16, 'square', 0, .07); },
  hurt(pan){ this.noise(.2, .34, 700, 120, 1, 'lowpass', pan); this.tone(180, 70, .18, .18, 'sawtooth', pan); },
  step(sprint){ this.noise(.07, sprint ? .13 : .08, 400 + rnd(200), 120, 1.4, 'bandpass', rnd(.3, -.3)); },
  land(){ this.noise(.14, .22, 300, 70, 1, 'lowpass'); this.tone(120, 50, .12, .12, 'sine'); },
  jump(){ this.noise(.06, .1, 900, 400, 2); },
  explode(d, pan){ const at = clamp(1 - d / 45, .15, 1);
    this.noise(.85, .8 * at, 900, 40, .7, 'lowpass', pan); this.tone(90, 28, .7, .6 * at, 'sine', pan);
    this.noise(.3, .4 * at, 4200, 500, .9, 'bandpass', pan); },
  grenade(){ this.noise(.08, .2, 1800, 500, 3); },
  pin(){ this.tone(1400, 2200, .07, .14, 'square'); },
  blind(){ this.tone(2600, 300, .9, .3, 'sine'); this.noise(.9, .2, 3000, 300, .6, 'bandpass'); },
  fire(){ this.noise(.5, .18, 900, 250, .8, 'bandpass'); },
  ui(){ this.tone(880, 1200, .045, .1, 'square'); },
  uiBig(){ this.tone(220, 440, .12, .18, 'square'); this.tone(440, 660, .14, .1, 'square', 0, .05); },
  deny(){ this.tone(220, 110, .16, .16, 'sawtooth'); },
  wave(){ this.tone(160, 320, .5, .22, 'sawtooth'); this.tone(120, 240, .7, .18, 'square', 0, .18); },
  levelup(){ [523, 659, 784, 1046].forEach((f, i) => this.tone(f, f, .16, .16, 'square', 0, i * .07)); },
  zip(pan){ this.noise(.1, .1, 3200, 900, 1.5, 'bandpass', pan); },
  monster(d, pan){ const at = clamp(1 - d / 40, .1, 1); this.tone(120 + rnd(40), 60, .4, .3 * at, 'sawtooth', pan); this.noise(.35, .2 * at, 700, 120, .8, 'lowpass', pan); },
  countdown(hi){ this.tone(hi ? 1200 : 700, hi ? 1200 : 700, .12, .18, 'square'); }
};
