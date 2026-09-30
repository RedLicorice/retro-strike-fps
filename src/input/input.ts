import type { TouchState } from '../core/types';
import { SFX } from '../audio/sfx';
import { ctx } from '../core/context';
import { Game } from '../game/index';
import { UI } from '../ui/index';

/* ------------------------------ C2. INPUT ------------------------------ */
export const Input = {
  keys: {} as Record<string, number>, jp: {} as Record<string, number>, mouse: { dx: 0, dy: 0, b: [false, false, false], wheel: 0 },
  locked: false, touch: { mx: 0, my: 0, lx: 0, ly: 0, fire: false, fireEdge: false, aim: false, jump: false, sprint: false, crouchTap: false, reload: false, thr: false, swap: false } as TouchState,
  enabled: true,
  init(){
    addEventListener('keydown', e => {
      if (e.repeat) return;
      this.keys[e.code] = 1; this.jp[e.code] = 1;
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(e.code) >= 0) e.preventDefault();
      if (e.code === 'Escape') UI.togglePause();
      if (e.code === 'Tab') UI.score(true);
    });
    addEventListener('keyup', e => { this.keys[e.code] = 0; if (e.code === 'Tab') UI.score(false); });
    addEventListener('blur', () => { this.keys = {}; this.mouse.b = [false, false, false]; });
    ctx.canvas.addEventListener('mousedown', e => {
      SFX.init(); SFX.resume();
      if (Game.state !== 'play') return;
      if (!this.locked && !ctx.IS_TOUCH){ ctx.canvas.requestPointerLock && ctx.canvas.requestPointerLock(); return; }
      this.mouse.b[e.button] = true;
      if (e.button === 0) this.jp.__fire = 1;
      if (e.button === 2) this.jp.__aim = 1;
    });
    addEventListener('mouseup', e => { this.mouse.b[e.button] = false; });
    addEventListener('contextmenu', e => e.preventDefault());
    addEventListener('mousemove', e => {
      if (!this.locked || !this.enabled) return;
      this.mouse.dx += e.movementX || 0; this.mouse.dy += e.movementY || 0;
    });
    /* smooth-scroll wheels / trackpads fire dozens of tiny events per notch: accumulate, then step once per notch-ish */
    let acc = 0, lastStep = 0;
    addEventListener('wheel', e => {
      if (Game.state !== 'play') return;
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 800 : 1;
      acc += e.deltaY * unit;
      const t = performance.now();
      if (Math.abs(acc) >= 50 && t - lastStep > 120){ this.mouse.wheel += Math.sign(acc); acc = 0; lastStep = t; }
      else if (t - lastStep > 400 && Math.abs(acc) < 50) acc *= .5;   /* let a stale partial scroll decay */
    }, { passive: false });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === ctx.canvas;
      if (!this.locked && Game.state === 'play' && !ctx.IS_TOUCH) UI.pause(true);
    });
    addEventListener('resize', () => { if (ctx.engine) ctx.engine.resize(); });
  },
  down(c){ return !!this.keys[c]; },
  pressed(c){ return !!this.jp[c]; },
  endFrame(){ this.jp = {}; this.mouse.dx = 0; this.mouse.dy = 0; this.mouse.wheel = 0; }
};
